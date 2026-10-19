"""魔兽争霸 BLP1 贴图 → PNG（纯 Python + numpy，不依赖 Pillow）。
支持 BLP1 的两种压缩：JPEG（自带一个基线 JPEG 解码器）和 256 色调色板。
BLP 的 JPEG 存的是 4 个原始通道（B G R A），不做 YCbCr 颜色转换，所以普通看图软件会把它当成 CMYK 读错。

  python3 tools/blp.py 输入.blp 输出.png          （需要 numpy；Blender 自带的 Python 有）
  Blender -b --python tools/blp.py -- 输入.blp 输出.png
"""
import struct, sys, zlib

import numpy as np

ZIGZAG = np.array([
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63])
_k = np.arange(8)
_C = np.array([[(np.sqrt(0.5) if u == 0 else 1.0) * np.cos((2 * x + 1) * u * np.pi / 16) for u in range(8)] for x in range(8)]) / 2   # IDCT 基


class _Bits:
    def __init__(self, data, pos):
        self.d, self.p, self.acc, self.n = data, pos, 0, 0

    def bit(self):
        if self.n == 0:
            b = self.d[self.p]; self.p += 1
            if b == 0xFF:
                nxt = self.d[self.p]
                if nxt == 0: self.p += 1            # 填充字节
                else: b = 0                        # 碰到标记：后面补 0
            self.acc, self.n = b, 8
        self.n -= 1
        return (self.acc >> self.n) & 1

    def bits(self, k):
        v = 0
        for _ in range(k): v = (v << 1) | self.bit()
        return v

    def align(self):
        self.n = 0


def _huff(lengths, symbols):
    """返回 {(码长, 码值): 符号}"""
    table, code, i = {}, 0, 0
    for L in range(1, 17):
        for _ in range(lengths[L - 1]):
            table[(L, code)] = symbols[i]; i += 1; code += 1
        code <<= 1
    return table


def _decode_sym(br, table):
    code = 0
    for L in range(1, 17):
        code = (code << 1) | br.bit()
        s = table.get((L, code))
        if s is not None: return s
    raise ValueError('JPEG 哈夫曼解码失败')


def _extend(v, t):
    return v - (1 << t) + 1 if t and v < (1 << (t - 1)) else v


def decode_jpeg(data):
    """基线 JPEG → (H, W, 通道数) uint8，原样返回各通道（不做颜色转换）"""
    q, hts, comps, restart = {}, {}, [], 0
    p = 2
    W = H = 0
    while p < len(data):
        if data[p] != 0xFF: p += 1; continue
        m = data[p + 1]; p += 2
        if m in (0xD8, 0x01) or 0xD0 <= m <= 0xD7: continue
        L = struct.unpack_from('>H', data, p)[0]; seg = data[p + 2:p + L]
        if m == 0xDB:                                   # 量化表
            i = 0
            while i < len(seg):
                pq, tq = seg[i] >> 4, seg[i] & 15; i += 1
                if pq: vals = struct.unpack_from('>64H', seg, i); i += 128
                else: vals = list(seg[i:i + 64]); i += 64
                t = np.zeros(64); t[ZIGZAG] = vals; q[tq] = t.reshape(8, 8)
        elif m == 0xC4:                                 # 哈夫曼表
            i = 0
            while i < len(seg):
                tc, th = seg[i] >> 4, seg[i] & 15; lens = seg[i + 1:i + 17]; n = sum(lens)
                hts[(tc, th)] = _huff(lens, seg[i + 17:i + 17 + n]); i += 17 + n
        elif m in (0xC0, 0xC1):                         # 帧头（基线）
            H, W = struct.unpack_from('>HH', seg, 1); nc = seg[5]
            for c in range(nc):
                cid, hv, tq = seg[6 + c * 3:9 + c * 3]
                comps.append(dict(id=cid, h=hv >> 4, v=hv & 15, tq=tq))
        elif m == 0xC2:
            return _decode_jpeg_sips(data)
        elif m == 0xDD:
            restart = struct.unpack_from('>H', seg)[0]
        elif m == 0xDA:                                 # 扫描开始
            ns = seg[0]; sel = {}
            for c in range(ns):
                sel[seg[1 + c * 2]] = (seg[2 + c * 2] >> 4, seg[2 + c * 2] & 15)
            p += L
            return _scan(data, p, W, H, comps, sel, q, hts, restart)
        p += L
    raise ValueError('JPEG 里没有扫描数据')


def _scan(data, p, W, H, comps, sel, q, hts, restart):
    hmax, vmax = max(c['h'] for c in comps), max(c['v'] for c in comps)
    mcux, mcuy = -(-W // (8 * hmax)), -(-H // (8 * vmax))
    planes = [np.zeros((mcuy * c['v'] * 8, mcux * c['h'] * 8)) for c in comps]
    pred = [0] * len(comps)
    br = _Bits(data, p)
    n = 0
    for my in range(mcuy):
        for mx in range(mcux):
            if restart and n and n % restart == 0:          # 重启标记：对齐字节、跳过 RSTn、清零 DC 预测
                br.align()
                while not (data[br.p] == 0xFF and 0xD0 <= data[br.p + 1] <= 0xD7): br.p += 1
                br.p += 2; pred = [0] * len(comps)
            n += 1
            for ci, c in enumerate(comps):
                td, ta = sel[c['id']]
                for by in range(c['v']):
                    for bx in range(c['h']):
                        blk = np.zeros(64)
                        t = _decode_sym(br, hts[(0, td)])
                        pred[ci] += _extend(br.bits(t), t); blk[0] = pred[ci]
                        k = 1
                        while k < 64:
                            rs = _decode_sym(br, hts[(1, ta)]); r, s = rs >> 4, rs & 15
                            if s == 0:
                                if r == 15: k += 16; continue
                                break
                            k += r
                            blk[k] = _extend(br.bits(s), s); k += 1
                        coef = np.zeros(64); coef[ZIGZAG] = blk
                        b = _C @ (coef.reshape(8, 8) * q[c['tq']]) @ _C.T + 128
                        y0, x0 = (my * c['v'] + by) * 8, (mx * c['h'] + bx) * 8
                        planes[ci][y0:y0 + 8, x0:x0 + 8] = b
    out = []
    for c, pl in zip(comps, planes):                    # 子采样的通道放大回全尺寸
        pl = np.repeat(np.repeat(pl, vmax // c['v'], 0), hmax // c['h'], 1)
        out.append(pl[:H, :W])
    return np.clip(np.round(np.stack(out, -1)), 0, 255).astype(np.uint8)


def _decode_jpeg_sips(data):
    """渐进式 JPEG：借 macOS 自带的 sips 解码。4 通道 JPEG 会被当成 CMYK 存进 TIFF，取出原始通道再反相即可。"""
    import subprocess, tempfile, os
    with tempfile.TemporaryDirectory() as td:
        src, dst = os.path.join(td, 'a.jpg'), os.path.join(td, 'a.tif')
        open(src, 'wb').write(data)
        subprocess.run(['sips', '-s', 'format', 'tiff', src, '--out', dst], capture_output=True, check=True)
        d = open(dst, 'rb').read()
    bo = '<' if d[:2] == b'II' else '>'
    off = struct.unpack_from(bo + 'I', d, 4)[0]; n = struct.unpack_from(bo + 'H', d, off)[0]; T = {}
    for i in range(n):
        t, ty, c = struct.unpack_from(bo + 'HHI', d, off + 2 + i * 12); T[t] = (ty, c, off + 2 + i * 12 + 8)

    def val(t):
        ty, c, vo = T[t]; fmt = {3: 'H', 4: 'I'}[ty]
        p = vo if c * struct.calcsize(fmt) <= 4 else struct.unpack_from(bo + 'I', d, vo)[0]
        return struct.unpack_from(bo + fmt * c, d, p)
    w, h, spp = val(256)[0], val(257)[0], val(277)[0]
    raw = b''.join(d[o:o + c] for o, c in zip(val(273), val(279)))
    px = np.frombuffer(raw, np.uint8)[:w * h * spp].reshape(h, w, spp)
    return (255 - px) if spp == 4 else px


def _dxt_color(c0, c1, four):
    def rgb(c): return np.stack([((c >> 11) & 31) * 255 // 31, ((c >> 5) & 63) * 255 // 63, (c & 31) * 255 // 31], -1).astype(np.int32)
    a, b = rgb(c0), rgb(c1)
    p2 = np.where(four[:, None], (2 * a + b) // 3, (a + b) // 2)
    p3 = np.where(four[:, None], (a + 2 * b) // 3, 0)
    return np.stack([a, b, p2, p3], 1)                                     # (块数, 4, 3)


def _decode_dxt(buf, w, h, kind):
    bw, bh = max(1, (w + 3) // 4), max(1, (h + 3) // 4); nb = bw * bh
    bs = 8 if kind == 1 else 16
    blk = np.frombuffer(buf, np.uint8, nb * bs).reshape(nb, bs)
    cb = blk[:, -8:]
    c0 = cb[:, 0].astype(np.int32) | (cb[:, 1].astype(np.int32) << 8); c1 = cb[:, 2].astype(np.int32) | (cb[:, 3].astype(np.int32) << 8)
    pal = _dxt_color(c0, c1, (c0 > c1) | (kind != 1))
    idx = (cb[:, 4:8].astype(np.uint32) @ np.array([1, 256, 65536, 16777216], np.uint32))
    sel = (idx[:, None] >> (2 * np.arange(16, dtype=np.uint32))) & 3
    rgb = np.take_along_axis(pal, sel[:, :, None].astype(np.int64).repeat(3, 2), 1)
    if kind == 1:
        a = np.where((sel == 3) & ~(c0 > c1)[:, None], 0, 255)
    elif kind == 3:
        ab = blk[:, :8]; a = np.stack([(ab[:, i // 2] >> (4 * (i % 2))) & 15 for i in range(16)], 1).astype(np.int32) * 17
    else:
        a0, a1 = blk[:, 0].astype(np.int32), blk[:, 1].astype(np.int32)
        bits = blk[:, 2:8].astype(np.uint64) @ (np.uint64(1) << (np.arange(6, dtype=np.uint64) * np.uint64(8)))
        ai = ((bits[:, None] >> (np.arange(16, dtype=np.uint64) * np.uint64(3))) & np.uint64(7)).astype(np.int32)
        k = np.arange(8)
        big = np.where(k == 0, a0[:, None], np.where(k == 1, a1[:, None], ((8 - k) * a0[:, None] + (k - 1) * a1[:, None]) // 7))
        sml = np.where(k == 0, a0[:, None], np.where(k == 1, a1[:, None], np.where(k == 6, 0, np.where(k == 7, 255, ((6 - k) * a0[:, None] + (k - 1) * a1[:, None]) // 5))))
        apal = np.where((a0 > a1)[:, None], big, sml)
        a = np.take_along_axis(apal, ai, 1)
    px = np.concatenate([rgb, a[:, :, None]], -1).reshape(bh, bw, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(bh * 4, bw * 4, 4)
    return np.clip(px, 0, 255).astype(np.uint8)[:h, :w]


def decode_blp2(data):
    """魔兽世界的 BLP2：调色板 / DXT1 / DXT3 / DXT5 / 原始 BGRA"""
    comp, adepth, atype, _mips = data[8], data[9], data[10], data[11]
    w, h = struct.unpack_from('<II', data, 12)
    offs = struct.unpack_from('<16I', data, 20); sizes = struct.unpack_from('<16I', data, 84)
    buf = data[offs[0]:offs[0] + sizes[0]]
    if comp == 2:
        return _decode_dxt(buf, w, h, 1 if adepth <= 1 else (3 if atype == 1 else 5))
    if comp == 3:
        return np.frombuffer(buf, np.uint8, w * h * 4).reshape(h, w, 4)[..., [2, 1, 0, 3]].copy()
    pal = np.frombuffer(data, np.uint8, 1024, 148).reshape(256, 4)
    idx = np.frombuffer(buf, np.uint8, w * h)
    rgba = pal[idx][:, [2, 1, 0, 3]].reshape(h, w, 4).copy()
    araw = buf[w * h:]
    if adepth == 8: rgba[..., 3] = np.frombuffer(araw, np.uint8, w * h).reshape(h, w)
    elif adepth in (1, 4):
        bits = np.unpackbits(np.frombuffer(araw, np.uint8), bitorder='little')
        a = bits[:w * h] * 255 if adepth == 1 else (bits[:w * h * 4].reshape(-1, 4) @ np.array([1, 2, 4, 8])) * 17
        rgba[..., 3] = a.reshape(h, w)
    else: rgba[..., 3] = 255
    return rgba


def decode_blp(data):
    """BLP1 / BLP2 → (H, W, 4) uint8 RGBA"""
    if data[:4] == b'BLP2':
        return decode_blp2(data)
    if data[:4] != b'BLP1':
        raise ValueError('不认识的 BLP 格式')
    comp, alpha_bits, w, h, _pt, _mip = struct.unpack_from('<6I', data, 4)
    offs = struct.unpack_from('<16I', data, 28); sizes = struct.unpack_from('<16I', data, 92)
    if comp == 0:
        hsz = struct.unpack_from('<I', data, 156)[0]
        jpg = data[160:160 + hsz] + data[offs[0]:offs[0] + sizes[0]]
        px = decode_jpeg(jpg)                           # 通道顺序 B G R A
        if px.shape[2] == 3: px = np.concatenate([px, np.full(px.shape[:2] + (1,), 255, np.uint8)], -1)
        rgba = px[..., [2, 1, 0, 3]].copy()
        if alpha_bits == 0: rgba[..., 3] = 255
        return rgba[:h, :w]
    pal = np.frombuffer(data, np.uint8, 1024, 156).reshape(256, 4)
    idx = np.frombuffer(data, np.uint8, w * h, offs[0])
    rgba = pal[idx][:, [2, 1, 0, 3]].reshape(h, w, 4).copy()
    araw = data[offs[0] + w * h: offs[0] + sizes[0]]
    if alpha_bits == 8: rgba[..., 3] = np.frombuffer(araw, np.uint8, w * h).reshape(h, w)
    elif alpha_bits in (1, 4):
        bits = np.unpackbits(np.frombuffer(araw, np.uint8), bitorder='little')
        if alpha_bits == 1: a = bits[:w * h] * 255
        else: a = (bits[:w * h * 4].reshape(-1, 4) @ np.array([1, 2, 4, 8])) * 17
        rgba[..., 3] = a.reshape(h, w)
    else: rgba[..., 3] = 255
    return rgba


def write_png(path, rgba):
    h, w = rgba.shape[:2]
    raw = b''.join(b'\x00' + rgba[y].tobytes() for y in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    src, dst = args[0], args[1]
    write_png(dst, decode_blp(open(src, 'rb').read()))
    print('[blp]', src, '→', dst)
