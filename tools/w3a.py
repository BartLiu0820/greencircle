"""解析 war3map.w3a（技能的物编修改）。优化过的地图把 1~4 级放进 SLK，5 级以后的数据留在这里。
用法：python3 tools/w3a.py [技能ID ...]   不带参数时输出 analysis/raw/w3a_levels.json：{技能ID: {字段+等级: 值}}，字段名和 SLK 一致（DataA5、Cool7、Area10 …）
"""
import json, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 4 字节修改 ID → SLK 字段（Data 列由 data pointer 1~9 = A~I 决定）
MOD = {'acdn': 'Cool', 'amcs': 'Cost', 'adur': 'Dur', 'ahdu': 'HeroDur', 'aare': 'Area', 'aran': 'Rng', 'atar': 'targs', 'aub1': 'UnitID', 'abuf': 'BuffID', 'aeff': 'EfctID'}


def parse(path):
    b = open(path, 'rb').read()
    p = 0
    def i32():
        nonlocal p; v = struct.unpack_from('<i', b, p)[0]; p += 4; return v
    def f32():
        nonlocal p; v = struct.unpack_from('<f', b, p)[0]; p += 4; return v
    def raw4():
        nonlocal p; v = b[p:p + 4].decode('latin1'); p += 4; return v
    def cstr():
        nonlocal p; e = b.index(b'\0', p); v = b[p:e].decode('utf-8', 'replace'); p = e + 1; return v
    ver = i32(); out = {}
    for _ in range(2):                                # 原有表 / 自定义表
        for _ in range(i32()):
            orig, new = raw4(), raw4()
            aid = new if new != '\0\0\0\0' else orig
            d = out.setdefault(aid, {})
            for _ in range(i32()):
                mid, vt, lvl, col = raw4(), i32(), i32(), i32()
                v = i32() if vt == 0 else f32() if vt in (1, 2) else cstr()
                raw4()                                # 结束标记
                name = MOD.get(mid) or ('Data' + 'ABCDEFGHI'[col - 1] if col else mid)
                d[f'{name}{lvl}' if lvl else name] = round(v, 4) if isinstance(v, float) else v
    return out


if __name__ == '__main__':
    W = parse(os.path.join(ROOT, 'analysis/raw/war3map.w3a'))
    if len(sys.argv) > 1:
        for a in sys.argv[1:]: print(a, json.dumps(W.get(a), ensure_ascii=False))
    else:
        json.dump(W, open(os.path.join(ROOT, 'analysis/raw/w3a_levels.json'), 'w'), ensure_ascii=False, indent=0)
        print(len(W), 'abilities')
