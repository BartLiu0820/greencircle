"""用魔兽争霸 3 原版模型（art/war3_raw/，从 war3-assets.zip 解压）重做怪物 / 塔 / 英雄 / 守卫者的精灵表。

  python3 tools/war3_batch.py              # 全部（已出过图的模型跳过）
  python3 tools/war3_batch.py --force      # 全部重新出图
  python3 tools/war3_batch.py --register   # 只重新登记（改了染色 / 缩放规则时用）
  python3 tools/war3_batch.py --list       # 只打印计划，不出图
  python3 tools/war3_batch.py --portraits  # 信息面板头像（*_Portrait.mdx）
  python3 tools/war3_batch.py --force --cats=tower,hero,builder,fx   # 只重出这几类
  python3 tools/war3_batch.py --only=风行塔,五行塔                     # 只出这几种塔 / 英雄用的模型

和原图一致：
  - 模型：单位数据里的 file 字段（UnitUI.slk），tft 目录覆盖 roc 目录
  - 共用：同一个模型只出一张精灵表（key = model:<类别>:<模型路径>），用到它的单位都是别名
  - 染色：单位数据的 red / green / blue（游戏里乘到图像上，和 WC3 的顶点颜色一样）
  - 缩放：单位数据的 modelScale（精灵表按用到它的单位里最大的缩放出图，其余按比例缩小）
  - 队伍颜色：怪物属于玩家 12（棕色），塔 / 英雄 / 守卫者属于玩家 1（红色）
原版包里没有的模型（地精修补匠、修补匠机器人、4 辆车、火焰领主）保留 Hive 版的图，不动。
光环塔原图用的是光环特效模型，游戏里继续程序绘制，不出图。
"""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'art', 'war3_raw')
W3ROOTS = [os.path.join(RAW, 'tft'), os.path.join(RAW, 'roc')]
OUT = os.path.join(ROOT, 'art', 'models', 'war3')
SPR = os.path.join(ROOT, 'h5', 'assets', 'sprites')
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender')
TEAM = {'monster': '0.306,0.165,0.016', 'tower': '1,0.012,0.012', 'hero': '1,0.012,0.012', 'builder': '1,0.012,0.012', 'fx': '1,0.012,0.012'}
# 技能召唤的特效单位：登记 key → (单位 ID, 出图动作)。剑魂 n05F = 1.5 倍的剑圣，原图里施放旋风斩（剑刃风暴）
FX_UNITS = {'fx:bladestorm': ('n05F', 'spin:8')}
# 光效表（登记成 'glow:' + key）：模型里叠加发光的 geoset（旋风斩的旋风、法师手里的光球、图腾的电光……），
# 本体图不画它们；另用 import_mdx.py --glow 黑底出一张同样排布的图，游戏里 drawSheet 用 lighter 叠在本体上。没有这种 geoset 的模型不出
BUILDER_ID = 'uaco'
SHOP_ID = 'u00L'

D = (lambda s: json.loads(s[s.index('{'):s.rindex('}') + 1]))(open(os.path.join(ROOT, 'h5', 'data.js'), encoding='utf8').read())
U = json.load(open(os.path.join(ROOT, 'analysis', 'raw', 'units_all.json'), encoding='utf8'))

INDEX = {}
for r in reversed(W3ROOTS):
    for dp, _, fs in os.walk(r):
        for f in fs:
            INDEX[os.path.relpath(os.path.join(dp, f), r).replace(os.sep, '/').lower()] = os.path.join(dp, f)


def resolve(path):
    """单位数据里的模型路径（可能写 .mdl 或不带扩展名）→ 原版 .mdx 文件"""
    k = path.replace('\\', '/').lower()
    k = re.sub(r'\.(mdl|mdx)$', '', k)
    return INDEX.get(k + '.mdx')


def color(u):
    """red/green/blue：SLK 里空着的格子是 0（三个都没有时才是默认的白色）"""
    if not any(c in u for c in ('red', 'green', 'blue')): return (1.0, 1.0, 1.0)
    return tuple(round(float(u.get(c) or 0) / 255, 3) for c in ('red', 'green', 'blue'))


def entities():
    """[(登记 key, 类别, 单位 ID)]"""
    out = [('unit:' + uid, 'monster', uid) for uid in D['units']]
    for fam, t in D['towers'].items():
        if t['cat'] == 'aura': continue
        lv = t['levels']
        out.append(('tower:' + fam, 'tower', lv[0]['id']))
        out += [(f'tower:{fam}:{i + 1}', 'tower', l['id']) for i, l in enumerate(lv) if i]
    out += [('hero:' + n, 'hero', h['id']) for n, h in D['heroes'].items()]
    out.append(('builder', 'builder', BUILDER_ID))
    out.append(('shop', 'tower', SHOP_ID))                            # 地图中央的商店（模型是"摇滚阿尔萨斯"）
    out += [(k, 'fx', uid) for k, (uid, _) in FX_UNITS.items()]
    return out


def plan():
    models, ents, missing = {}, [], []
    for key, cat, uid in entities():
        u = U.get(uid, {})
        mdx = resolve(u.get('file', ''))
        if not mdx:
            missing.append((key, u.get('file'))); continue
        rel = re.sub(r'\.mdx$', '', os.path.relpath(mdx, RAW).split(os.sep, 1)[1].replace(os.sep, '/'), flags=re.I)
        mkey = f'model:{cat}:{rel}'
        sc = float(u.get('modelScale') or 1)
        m = models.setdefault(mkey, dict(key=mkey, cat=cat, mdx=mdx, scale=0, users=[], actions=FX_UNITS[key][1] if key in FX_UNITS else None))
        m['scale'] = max(m['scale'], sc); m['users'].append(key)
        ents.append(dict(key=key, model=mkey, scale=sc, tint=color(u)))
    return models, ents, missing


def fname(key):
    return 'w3_' + re.sub(r'[^0-9A-Za-z_一-鿿]+', '_', key.split(':', 1)[1])


def render(m, force):
    f = fname(m['key'])
    if not force and os.path.exists(os.path.join(SPR, f + '.json')):
        return m['key'], 'skip', ''
    blend = os.path.join(OUT, f + '.blend')
    r = subprocess.run([BLENDER, '-b', '--python-exit-code', '1', '-P', os.path.join(ROOT, 'tools', 'blender', 'import_mdx.py'), '--',
                        '--mdx', m['mdx'], '--out', blend, '--scale', str(m['scale']), '--team', TEAM[m['cat']],
                        *sum((['--w3root', w] for w in W3ROOTS), [])], capture_output=True, text=True)
    log = [l for l in r.stdout.splitlines() if l.startswith('[mdx]')]
    if r.returncode != 0:
        return m['key'], 'import-fail', ' '.join((r.stderr or r.stdout).strip().splitlines()[-1:])
    h = float((re.findall(r'模型高度约 ([\d.]+) m', '\n'.join(log)) or ['2'])[0])
    ppm = 40 if h <= 3.2 else 24 if h <= 6 else 14            # 大模型降低像素密度，图不至于太大
    cat = {'fx': 'tower'}.get(m['cat'], m['cat'])                    # 特效单位：单方向（动作本身在原地转）
    rr = subprocess.run([BLENDER, '-b', '-P', os.path.join(ROOT, 'tools', 'blender', 'render_sprites.py'), '--', '--model', blend,
                         '--key', m['key'], '--category', cat, '--ppm', str(ppm), *(['--actions', m['actions']] if m.get('actions') else [])],
                        capture_output=True, text=True)
    src = os.path.join(SPR, m['key'].replace(':', '_') + '.json')      # render_sprites 按 key 起名，挪成短名字
    if rr.returncode != 0 or not os.path.exists(src):
        return m['key'], 'render-fail', ' '.join((rr.stderr or rr.stdout).strip().splitlines()[-1:])
    meta = json.load(open(src, encoding='utf-8')); os.remove(src)
    png_old = os.path.join(ROOT, 'h5', 'assets', meta['src']); meta['src'] = 'sprites/' + f + '.png'
    os.replace(png_old, os.path.join(SPR, f + '.png'))
    meta['modelScale'] = m['scale']
    json.dump(meta, open(os.path.join(SPR, f + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    glow = render_glow(m, f, cat, ppm)
    if glow.startswith('fail'): return m['key'], 'glow-fail', glow
    notex = sum('找不到贴图' in l for l in log)
    acts = ','.join(re.findall(r'\[mdx\]\s+(\w+) ←', '\n'.join(log)))
    return m['key'], 'ok', f'高 {h:.2f} m | ppm {ppm} | 缺贴图 {notex} | 动作 {acts} | 光效 {glow}'


def render_glow(m, f, cat, ppm):
    """光效表：只导入叠加发光的 geoset（import_mdx.py --glow，没有就退出码 3），黑底出图；像素密度、动作和本体一样"""
    for p in (os.path.join(SPR, f + '_glow.json'), os.path.join(SPR, f + '_glow.png'), os.path.join(SPR, f + '_glow.webp')):
        if os.path.exists(p): os.remove(p)
    gb = os.path.join(OUT, f + '_glow.blend')
    r = subprocess.run([BLENDER, '-b', '--python-exit-code', '1', '-P', os.path.join(ROOT, 'tools', 'blender', 'import_mdx.py'), '--',
                        '--mdx', m['mdx'], '--out', gb, '--scale', str(m['scale']), '--team', TEAM[m['cat']], '--glow',
                        *sum((['--w3root', w] for w in W3ROOTS), [])], capture_output=True, text=True)
    if r.returncode == 3: return '无'
    rr = subprocess.run([BLENDER, '-b', '-P', os.path.join(ROOT, 'tools', 'blender', 'render_sprites.py'), '--', '--model', gb, '--glow',
                         '--key', m['key'] + '_glow', '--category', cat, '--ppm', str(ppm), *(['--actions', m['actions']] if m.get('actions') else [])],
                        capture_output=True, text=True)
    src = os.path.join(SPR, (m['key'] + '_glow').replace(':', '_') + '.json')
    if r.returncode != 0 or rr.returncode != 0 or not os.path.exists(src):
        return 'fail ' + ' '.join((r.stderr or rr.stderr or rr.stdout).strip().splitlines()[-1:])
    meta = json.load(open(src, encoding='utf-8')); os.remove(src)
    png = os.path.join(ROOT, 'h5', 'assets', meta['src'])
    from PIL import Image
    if Image.open(png).getchannel('A').getextrema()[1] <= 20:           # 发光层只在没出图的动作里出现（剑圣塔的旋风斩）：整张是空的
        os.remove(png); return '无（出图的动作里看不见）'
    os.replace(png, os.path.join(SPR, f + '_glow.png'))
    meta.update(src='sprites/' + f + '_glow.png', modelScale=m['scale'], glow=True)
    json.dump(meta, open(os.path.join(SPR, f + '_glow.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return '有'


def legacy_file(key):
    return os.path.join(SPR, key.replace(':', '_') + '.json')


def register(models, ents):
    """每个单位一份别名：指向模型精灵表，带自己的缩放和染色。旧的 Hive 图（同 key）删掉"""
    n = 0
    for e in ents:
        mp = os.path.join(SPR, fname(e['model']) + '.json')
        if not os.path.exists(mp): continue
        meta = json.load(open(mp, encoding='utf-8'))
        old = legacy_file(e['key'])
        if os.path.exists(old):
            om = json.load(open(old, encoding='utf-8'))
            if not om.get('aliasOf'):                                  # 旧的独立精灵表：图片一起删
                for ext in ('.webp', '.png'):
                    p = os.path.join(ROOT, 'h5', 'assets', os.path.splitext(om['src'])[0] + ext)
                    if os.path.exists(p): os.remove(p)
        a = dict(meta, key=e['key'], aliasOf=meta['key'], unitsPerPixel=meta['unitsPerPixel'] * e['scale'] / meta['modelScale'], war3=True)
        if e['tint'] != (1.0, 1.0, 1.0): a['tint'] = list(e['tint'])
        json.dump(a, open(old, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); n += 1
        gp, ga = mp[:-5] + '_glow.json', legacy_file('glow:' + e['key'])
        if os.path.exists(gp):                                          # 光效表：同样登记一份别名（'glow:' + key）
            g = json.load(open(gp, encoding='utf-8'))
            g = dict(g, key='glow:' + e['key'], aliasOf=g['key'], unitsPerPixel=g['unitsPerPixel'] * e['scale'] / g['modelScale'], war3=True)
            json.dump(g, open(ga, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        elif os.path.exists(ga): os.remove(ga)
    print(f'登记了 {n} 个单位别名')
    from PIL import Image                                              # 只转模型图本身（别名共用同一张，不重复转）
    for png in [os.path.join(SPR, fname(m['key']) + s + '.png') for m in models.values() for s in ('', '_glow')]:
        webp = png[:-4] + '.webp'
        if os.path.exists(png) and (not os.path.exists(webp) or os.path.getmtime(webp) < os.path.getmtime(png)):
            Image.open(png).save(webp, 'WEBP', quality=90, method=4)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'register_sprites.py')])


PORT = os.path.join(ROOT, 'h5', 'assets', 'portraits')


def portrait_mdx(mdx):
    """模型同目录下的头像模型（xxx_Portrait.mdx，大小写不定）"""
    rel = os.path.relpath(mdx, RAW).split(os.sep, 1)[1].replace(os.sep, '/').lower()
    return INDEX.get(re.sub(r'\.mdx$', '', rel) + '_portrait.mdx')


def render_portrait(m, force):
    src = portrait_mdx(m['mdx'])
    if not src: return m['key'], 'no-portrait', ''
    f = os.path.join(PORT, fname(m['key']) + '.png')
    if not force and os.path.exists(f[:-4] + '.json'): return m['key'], 'skip', ''
    r = subprocess.run([BLENDER, '-b', '--python-exit-code', '1', '-P', os.path.join(ROOT, 'tools', 'blender', 'render_portrait.py'), '--',
                        '--mdx', src, '--out', f, '--team', TEAM[m['cat']], *sum((['--w3root', w] for w in W3ROOTS), [])], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(f): return m['key'], 'fail', ' '.join((r.stderr or r.stdout).strip().splitlines()[-1:])
    from PIL import Image
    Image.open(f).save(f[:-4] + '.webp', 'WEBP', quality=88, method=4)
    return m['key'], 'ok', os.path.basename(src)


def register_portraits(models, ents):
    """h5/assets/w3portraits.js：单位 key → 头像（和精灵表一样按模型共用，染色跟单位走）"""
    out = {}
    for e in ents:
        j = os.path.join(PORT, fname(e['model']) + '.json')
        if not os.path.exists(j): continue
        meta = json.load(open(j))
        meta['src'] = 'portraits/' + fname(e['model']) + '.webp'
        if e['tint'] != (1.0, 1.0, 1.0): meta['tint'] = list(e['tint'])
        out[e['key']] = meta
    with open(os.path.join(ROOT, 'h5', 'assets', 'w3portraits.js'), 'w', encoding='utf-8') as fp:
        fp.write('// 自动生成：tools/war3_batch.py --portraits —— 信息面板里会动的头像（原版 *_Portrait.mdx，用模型自带的镜头）\n')
        fp.write('window.W3_PORTRAITS = ' + json.dumps(out, ensure_ascii=False) + ';\n')
    print(f'登记了 {len(out)} 个头像')


if __name__ == '__main__':
    models, ents, missing = plan()
    if '--portraits' in sys.argv:                                       # 头像：python3 tools/war3_batch.py --portraits [--force]
        os.makedirs(PORT, exist_ok=True)
        with ThreadPoolExecutor(int(os.environ.get('JOBS', 6))) as ex:
            only = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
            for res in ex.map(lambda m: render_portrait(m, '--force' in sys.argv), [m for m in models.values() if m['cat'] != 'fx' and (not only or any((u.split(':') + [''])[1] in only for u in m['users']))]):
                if res[1] != 'skip': print('\t'.join(res), flush=True)
        register_portraits(models, ents); sys.exit()
    print(f'{len(ents)} 个单位 / 塔等级 / 英雄 → {len(models)} 个原版模型；原版包里没有、保留 Hive 版的 {len(missing)} 个：')
    for k, f in missing: print('   ', k, f)
    if '--list' in sys.argv:
        for m in models.values(): print(m['key'], m['scale'], len(m['users']))
        sys.exit()
    if '--register' not in sys.argv:
        os.makedirs(OUT, exist_ok=True)
        rows = []
        cats = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--cats=')), None)   # 只重出某几类，如 --cats=tower,hero
        only = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)   # 只出这些塔 / 英雄用的模型，如 --only=风行塔,五行塔
        todo = [m for m in models.values() if (not cats or m['cat'] in cats) and (not only or any((u.split(':') + [''])[1] in only for u in m['users']))]
        with ThreadPoolExecutor(int(os.environ.get('JOBS', 6))) as ex:
            for res in ex.map(lambda m: render(m, '--force' in sys.argv), todo):
                rows.append(res); print('\t'.join(res), flush=True)
        rep = os.path.join(RAW, 'batch_report.tsv')
        old = {}
        if os.path.exists(rep):
            for l in open(rep, encoding='utf8'): old[l.split('\t')[0]] = l.rstrip('\n')
        for r in rows:
            if r[1] != 'skip': old[r[0]] = '\t'.join(r)
        open(rep, 'w', encoding='utf8').write('\n'.join(old.values()) + '\n')
    register(models, ents)
