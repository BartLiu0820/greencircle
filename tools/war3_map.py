"""原图（8 人）地图布局 → h5/assets/w3map.js

  python3 tools/war3_map.py

从地图包里读：
  - war3map.wpm：寻路图（32 单位一格，384×384）。0x08 = 不能建造、0x02 = 不能行走（地图边界）。
    原样导出成"不能建造"位图（不能行走的边界也算不能建造）。H5 的建造格是 64 单位（中心在 64 的倍数上），正好盖住 2×2 个寻路格。
  - war3map.w3e：地块（128 单位一个格点，97×97）。路面 Arck、出怪口围栏 Crck、中央十字 cZc1、路边暗纹 Zvin、底色 Lgrd。
  - war3map.doo：装饰物里的树（出怪口围栏一圈的树墙）。
  - war3map.w3i：镜头范围。
区域（出怪口、路口）在 analysis/data/path.json（tools/path.py 从 war3map.j 的 Rect 读出）。
"""
import base64, json, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import mpq  # noqa: E402

MAP = os.path.join(ROOT, '000綠色循環圈外傳8.6.6.w3x')
TREE_IDS = {'VTlt', 'YTct', 'ATtr', 'CTtr', 'ZTtw'}   # 树墙；YTct（城市树墙）贴图不在原版包里，画的时候按 VTlt


def wpm(b):
    w, h = struct.unpack_from('<ii', b, 8)
    d = b[16:]
    bits = bytearray((w * h + 7) // 8)
    for k in range(w * h):
        if d[k] & 0x0A: bits[k >> 3] |= 1 << (k & 7)
    return dict(n=w, cell=32, origin=-w * 16, nobuild=base64.b64encode(bytes(bits)).decode())


def w3e(b):
    o = 13
    na, = struct.unpack_from('<i', b, o); o += 4
    tiles = [b[o + 4 * i:o + 4 * i + 4].decode() for i in range(na)]; o += 4 * na
    nb, = struct.unpack_from('<i', b, o); o += 4 + 4 * nb
    w, h = struct.unpack_from('<ii', b, o); o += 8
    ox, oy = struct.unpack_from('<ff', b, o); o += 8
    t = []
    for _ in range(w * h):
        t.append(b[o + 4] & 15); o += 7
    used = sorted(set(t))
    return dict(w=w, h=h, ox=ox, oy=oy, step=128, names=[tiles[k] for k in used], t=''.join(str(used.index(k)) for k in t))


def doo(b):
    ver, sub, n = struct.unpack_from('<iii', b, 4)
    o, out = 16, []
    for _ in range(n):
        tid = b[o:o + 4].decode('latin1')
        x, y, z, ang, sx = struct.unpack_from('<5f', b, o + 8); o += 36 + 2
        ptr, ns = struct.unpack_from('<ii', b, o); o += 8
        for _ in range(ns):
            ni, = struct.unpack_from('<i', b, o); o += 4 + ni * 8
        o += 4
        if tid in TREE_IDS: out.append([tid, round(x), round(y), round(sx, 2)])
    return out


def w3i(b):
    o = 12
    for _ in range(4): o = b.index(b'\0', o) + 1
    cam = struct.unpack_from('<8f', b, o)
    return [cam[0], cam[1], cam[2], cam[3]]      # 镜头范围：左下 x, y，右上 x, y


def main():
    m = mpq.MPQ(MAP)
    path = json.load(open(os.path.join(ROOT, 'analysis', 'data', 'path.json'), encoding='utf-8'))
    data = dict(pathing=wpm(m.read('war3map.wpm')), ground=w3e(m.read('war3map.w3e')), trees=doo(m.read('war3map.doo')),
                camera=w3i(m.read('war3map.w3i')), rects=path['rects'])
    out = os.path.join(ROOT, 'h5', 'assets', 'w3map.js')
    with open(out, 'w', encoding='utf-8') as fp:
        fp.write('// 自动生成：python3 tools/war3_map.py —— 原图 8 人地图的寻路（wpm）、地块（w3e）、树（doo）、镜头范围（w3i）和区域（war3map.j 的 Rect）\n')
        fp.write('window.W3_MAP = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(out, os.path.getsize(out), '字节；地块', data['ground']['names'], '树', len(data['trees']), '镜头', data['camera'])


if __name__ == '__main__':
    main()
