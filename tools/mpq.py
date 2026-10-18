"""Minimal MPQ (v1) reader for Warcraft III maps. Tolerant of common 'protection' tricks."""
import struct, zlib, bz2, sys, os

def _crypt_table():
    t = [0] * 0x500
    seed = 0x00100001
    for i in range(0x100):
        idx = i
        for _ in range(5):
            seed = (seed * 125 + 3) % 0x2AAAAB
            a = (seed & 0xFFFF) << 16
            seed = (seed * 125 + 3) % 0x2AAAAB
            b = seed & 0xFFFF
            t[idx] = a | b
            idx += 0x100
    return t

CT = _crypt_table()

def hash_str(s, typ):
    s1, s2 = 0x7FED7FED, 0xEEEEEEEE
    for ch in s.upper().replace('/', '\\').encode('latin1', 'replace'):
        s1 = (CT[(typ << 8) + ch] ^ (s1 + s2)) & 0xFFFFFFFF
        s2 = (ch + s1 + s2 + (s2 << 5) + 3) & 0xFFFFFFFF
    return s1

def decrypt(data, key):
    n = len(data) // 4
    vals = list(struct.unpack('<%dI' % n, data[:n * 4]))
    seed = 0xEEEEEEEE
    for i in range(n):
        seed = (seed + CT[0x400 + (key & 0xFF)]) & 0xFFFFFFFF
        v = vals[i] ^ ((key + seed) & 0xFFFFFFFF)
        key = (((~key << 0x15) + 0x11111111) | (key >> 0x0B)) & 0xFFFFFFFF
        seed = (v + seed + (seed << 5) + 3) & 0xFFFFFFFF
        vals[i] = v
    return struct.pack('<%dI' % n, *vals) + data[n * 4:]

# ---- PKWare DCL explode ----
def explode(data):
    from pkexplode import explode as ex
    return ex(data)

def decompress(buf, outsize):
    if len(buf) >= outsize:
        return buf
    mask = buf[0]
    d = buf[1:]
    if mask & 0x10:
        d = bz2.decompress(d)
    if mask & 0x08:
        d = explode(d)
    if mask & 0x02:
        d = zlib.decompress(d)
    if mask & ~(0x10 | 0x08 | 0x02):
        raise ValueError('unsupported compression 0x%x' % mask)
    return d

class MPQ:
    def __init__(self, path):
        self.f = open(path, 'rb').read()
        off = 0
        while self.f[off:off + 4] != b'MPQ\x1a':
            off += 512
        self.base = off
        (_, hsize, asize, ver, ssh, htpos, btpos, htsz, btsz) = struct.unpack('<4sIIHHIIII', self.f[off:off + 32])
        self.sector = 512 << ssh
        # protected maps lie about sizes; clamp to file length
        maxent = (len(self.f) - off) // 16
        htsz_c = min(htsz, (len(self.f) - off - htpos) // 16)
        btsz_c = min(btsz, (len(self.f) - off - btpos) // 16)
        ht = decrypt(self.f[off + htpos: off + htpos + htsz_c * 16], hash_str('(hash table)', 3))
        bt = decrypt(self.f[off + btpos: off + btpos + btsz_c * 16], hash_str('(block table)', 3))
        self.hashes = [struct.unpack('<IIHHI', ht[i:i + 16]) for i in range(0, len(ht) - 15, 16)]
        self.blocks = [struct.unpack('<IIII', bt[i:i + 16]) for i in range(0, len(bt) - 15, 16)]
        self.htsz = htsz_c
        self.info = dict(ver=ver, sector=self.sector, htsz=htsz, btsz=btsz, htpos=htpos, btpos=btpos)

    def find(self, name):
        if not self.htsz:
            return None
        a, b, i0 = hash_str(name, 1), hash_str(name, 2), hash_str(name, 0)
        n = self.htsz
        i = i0 % n
        for _ in range(n):
            na, nb, loc, plat, bi = self.hashes[i]
            if bi == 0xFFFFFFFF:
                return None
            if na == a and nb == b and bi < len(self.blocks):
                return bi
            i = (i + 1) % n
        return None

    def read_block(self, bi, name):
        off, csize, fsize, flags = self.blocks[bi]
        if not flags & 0x80000000:
            return None
        start = self.base + off
        raw = self.f[start:start + csize]
        key = None
        if flags & 0x10000:
            key = hash_str(name.replace('/', '\\').split('\\')[-1], 3)
            if flags & 0x20000:
                key = ((key + off) ^ fsize) & 0xFFFFFFFF
        compressed = flags & 0x0200 or flags & 0x0100
        if flags & 0x1000000:  # single unit
            if key is not None:
                raw = decrypt(raw, key)
            if compressed and csize < fsize:
                if flags & 0x0100:
                    return explode(raw)
                return decompress(raw, fsize)
            return raw[:fsize]
        if not compressed:
            out = b''
            nsec = (fsize + self.sector - 1) // self.sector
            for s in range(nsec):
                chunk = raw[s * self.sector:(s + 1) * self.sector]
                if key is not None:
                    chunk = decrypt(chunk, key + s)
                out += chunk
            return out[:fsize]
        nsec = (fsize + self.sector - 1) // self.sector
        tbl = raw[:(nsec + 1) * 4 + (4 if flags & 0x4000000 else 0)]
        if key is not None:
            tbl = decrypt(tbl, (key - 1) & 0xFFFFFFFF)
        offs = struct.unpack('<%dI' % (nsec + 1), tbl[:(nsec + 1) * 4])
        out = bytearray()
        for s in range(nsec):
            chunk = raw[offs[s]:offs[s + 1]]
            if key is not None:
                chunk = decrypt(chunk, (key + s) & 0xFFFFFFFF)
            want = min(self.sector, fsize - s * self.sector)
            if len(chunk) < want:
                if flags & 0x0100:
                    chunk = explode(chunk)
                else:
                    chunk = decompress(chunk, want)
            out += chunk
        return bytes(out[:fsize])

    def read(self, name):
        bi = self.find(name)
        if bi is None:
            return None
        return self.read_block(bi, name)
