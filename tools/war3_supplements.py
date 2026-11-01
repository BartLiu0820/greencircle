"""war3-assets.zip 之外补进来的原版资源：历史登记、去重、合并、安装。

  python3 tools/war3_supplements.py              # 校验 + 合并成 art/war3_supplements/war3-supplement.zip，写 manifests/
  python3 tools/war3_supplements.py --install    # 再把合并包解压进 art/war3_raw/tft/（只补新文件，不覆盖已有的）
  python3 tools/war3_supplements.py --prune      # 删掉 packages/ 里已被新版完全包含的旧包（历史记录保留在 history.json）

art/war3_supplements/history.json 是每次收到的补充包的登记（名字、版本、日期、来源、sha256、状态）；
packages/ 放原始压缩包，war3-supplement.zip 是合并结果（都不入库，见 .gitignore）；manifests/ 是每个包和合并包的文件清单（入库）。
合并规则：
  - 只收 MPQ 原路径下的资源（.mdx / .blp / .wav），包里的说明文件不收
  - 和 war3-assets.zip 里同路径、内容一样的文件去掉（重复）；内容不一样的也去掉，保留基础包的（记为冲突，不覆盖已在用的资源）
  - 同一路径在几个补充包里都有：按 history.json 的顺序，后面的包覆盖前面的（内容不同时记为冲突）
  - 原图地图（.w3x）自己导入的文件（extract_from_map）一并放进合并包，来源记为地图
"""
import hashlib, io, json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import mpq  # noqa: E402

DIR = os.path.join(ROOT, 'art', 'war3_supplements')
PKG = os.path.join(DIR, 'packages')
MAN = os.path.join(DIR, 'manifests')
BASE = os.path.join(ROOT, 'war3-assets.zip')
OUT = os.path.join(DIR, 'war3-supplement.zip')
ASSET_EXT = ('.mdx', '.blp', '.wav')
sha = lambda b: hashlib.sha256(b).hexdigest()


def norm(p): return p.replace('\\', '/').lstrip('/').lower()


def base_index():
    """war3-assets.zip：去掉 roc/ tft/ 的小写路径 → (zip 成员名)；tft 覆盖 roc"""
    z = zipfile.ZipFile(BASE); idx = {}
    for n in sorted(z.namelist(), key=lambda n: n.startswith('tft/')):
        if n.startswith('__MACOSX') or n.endswith('/') or '/' not in n: continue
        idx[norm(n.split('/', 1)[1])] = n
    return z, idx


def main():
    H = json.load(open(os.path.join(DIR, 'history.json'), encoding='utf-8'))
    bz, bidx = base_index()
    merged, origin, report = {}, {}, {'duplicate_of_base': [], 'conflict_with_base': [], 'conflict_between_packages': []}
    for p in H['packages']:
        f = os.path.join(PKG, p['file'])
        if not os.path.exists(f):
            if p['status'] == 'active': sys.exit(f'缺少补充包 {f}（按 history.json 的 source 重新下载）')
            continue
        data = open(f, 'rb').read()
        if sha(data) != p['sha256']: sys.exit(f'{p["file"]} 的 sha256 和 history.json 登记的不一致')
        z = zipfile.ZipFile(io.BytesIO(data)); files = {}
        for n in z.namelist():
            if n.endswith('/') or not n.lower().endswith(ASSET_EXT): continue
            files[n] = sha(z.read(n))
        json.dump({'package': p['file'], 'sha256': p['sha256'], 'files': files}, open(os.path.join(MAN, p['file'][:-4] + '.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1, sort_keys=True)
        if p['status'] != 'active': continue
        for n in sorted(files):
            k = norm(n); b = z.read(n)
            if k in bidx:
                same = sha(bz.read(bidx[k])) == files[n]
                report['duplicate_of_base' if same else 'conflict_with_base'].append(n); continue
            if k in merged and sha(merged[k][1]) != files[n]: report['conflict_between_packages'].append([n, origin[k], p['file']])
            merged[k] = (n, b); origin[k] = p['file']
    m = mpq.MPQ(os.path.join(ROOT, H['map']))
    for n in H.get('extract_from_map', []):
        b = m.read(n.replace('/', '\\'))
        if not b: sys.exit(f'地图里没有 {n}')
        merged[norm(n)] = (n, b); origin[norm(n)] = H['map']
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for k in sorted(merged): z.writestr(merged[k][0], merged[k][1])
    man = {'zip': os.path.relpath(OUT, ROOT), 'files': {merged[k][0]: {'sha256': sha(merged[k][1]), 'from': origin[k]} for k in sorted(merged)}, **report}
    json.dump(man, open(os.path.join(MAN, 'merged.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'合并包 {len(merged)} 个文件 → {os.path.relpath(OUT, ROOT)}；和基础包重复去掉 {len(report["duplicate_of_base"])} 个，'
          f'和基础包冲突（保留基础包的）{len(report["conflict_with_base"])} 个，补充包之间冲突 {len(report["conflict_between_packages"])} 个')
    if '--install' in sys.argv:
        dst = os.path.join(ROOT, 'art', 'war3_raw', 'tft'); n = 0
        with zipfile.ZipFile(OUT) as z:
            for name in z.namelist():
                p = os.path.join(dst, name)
                if os.path.exists(p): continue
                os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'wb').write(z.read(name)); n += 1
        print(f'装进 art/war3_raw/tft/：新增 {n} 个文件（已有的不覆盖）')
    if '--prune' in sys.argv:
        for p in H['packages']:
            f = os.path.join(PKG, p['file'])
            if p['status'] == 'superseded' and os.path.exists(f): os.remove(f); print('删掉旧包', p['file'])


if __name__ == '__main__':
    main()
