"""游戏里实时 3D 渲染用的魔兽原版模型：把精灵表登记过的模型（h5/assets/sprites.js 里的 aliasOf）连同它们引用的贴图、
粒子发射器生成的子模型、16 种队伍颜色 / 光晕贴图，从 art/war3_raw 拷到 h5/assets/w3/。

路径统一成小写、正斜杠（MDX 里写的是 Windows 路径、大小写不一），浏览器里按同样规则换算（h5/units3d.js 的 solver）。
同路径 tft 覆盖 roc，和 war3_batch.py 一致。资源版权归暴雪，h5/assets/w3/ 不入库（见 .gitignore）；没有这个目录时游戏退回精灵图。

  python3 tools/war3_models.py
"""
import json, os, re, shutil, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'art', 'war3_raw')
OUT = os.path.join(ROOT, 'h5', 'assets', 'w3')
SHEETS_JS = os.path.join(ROOT, 'h5', 'assets', 'sprites.js')


def norm(p):
    return p.replace('\\', '/').strip().lower()


def find(rel):
    for pack in ('tft', 'roc'):
        base = os.path.join(RAW, pack)
        p = os.path.join(base, rel)
        if os.path.exists(p): return p
        # 不分大小写逐级找
        cur = base
        for part in rel.split('/'):
            if not os.path.isdir(cur): cur = None; break
            hit = next((n for n in os.listdir(cur) if n.lower() == part), None)
            if not hit: cur = None; break
            cur = os.path.join(cur, hit)
        if cur and os.path.isfile(cur): return cur
    return None


def refs(data):
    """MDX 引用的外部文件：TEXS 里的贴图、PREM（旧式粒子发射器）生成的模型"""
    out = []
    if data[:4] != b'MDLX': return out
    p = 4
    while p + 8 <= len(data):
        tag, size = data[p:p + 4], struct.unpack_from('<I', data, p + 4)[0]
        body = data[p + 8:p + 8 + size]
        if tag == b'TEXS':
            for i in range(0, len(body) - 267, 268):
                name = body[i + 4:i + 264].split(b'\0')[0].decode('latin1')
                if name: out.append(name)
        elif tag == b'PREM':
            q = 0
            while q + 4 <= len(body):
                isz = struct.unpack_from('<I', body, q)[0]
                nsz = struct.unpack_from('<I', body, q + 4)[0]          # 节点块的大小（含自身 4 字节）
                name = body[q + 4 + nsz + 16:q + 4 + nsz + 16 + 260].split(b'\0')[0].decode('latin1')
                if name: out.append(name)
                q += isz or len(body)
        p += 8 + size
    return out


def main():
    src = open(SHEETS_JS, encoding='utf-8').read()
    sheets = json.loads(src[src.index('{'):src.rindex('}') + 1])
    models = sorted({':'.join(m['aliasOf'].split(':')[2:]) + '.mdx' for m in sheets.values() if m.get('war3') and m.get('aliasOf') and not m.get('glow')})
    todo = [norm(m) for m in models]
    for i in range(16):
        todo += [f'replaceabletextures/teamcolor/teamcolor{i:02d}.blp', f'replaceabletextures/teamglow/teamglow{i:02d}.blp']
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    seen, missing, total = set(), [], 0
    while todo:
        rel = todo.pop()
        if rel in seen: continue
        seen.add(rel)
        f = find(rel)
        if not f:
            # 模型里常把 .tga 写成 .blp 或反过来，换扩展名再找一次
            alt = re.sub(r'\.(blp|tga)$', lambda m: '.tga' if m.group(1) == 'blp' else '.blp', rel)
            f = alt != rel and find(alt)
            if not f: missing.append(rel); continue
        dst = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(f, dst); total += os.path.getsize(f)
        if rel.endswith('.mdx'):
            todo += [norm(r) if not r.lower().endswith('.mdl') else norm(r[:-4] + '.mdx') for r in refs(open(f, 'rb').read())]
    print(f'{len(models)} 个模型，{len(seen) - len(missing)} 个文件，{total / 1e6:.1f} MB → {os.path.relpath(OUT, ROOT)}')
    for m in missing: print('  缺', m)


if __name__ == '__main__':
    main()
