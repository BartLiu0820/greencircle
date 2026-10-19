"""批量把 art/hive_raw/ 里下载好的 Hive 模型转成游戏精灵表。

  python3 tools/hive_batch.py                 # 处理全部（已出过图的跳过）
  python3 tools/hive_batch.py ghoul shade     # 只处理指定的模型类型
  python3 tools/hive_batch.py --force ...     # 重新出图
  python3 tools/hive_batch.py --register      # 只做登记（生成共用同一模型的单位的别名）

每种"模型类型"= 原图里同一个 war3 模型文件（比如 ghoul），对应游戏里一个或多个单位 ID。
流程：在下载包里挑 .mdx → import_mdx.py 转成 .blend（按 HEIGHT 统一身高）→ render_sprites.py 出 8 方向精灵表
     → 登记：第一个单位用这张图，其余单位复用（按各自的 modelScale 调大小）。
结果写到 art/hive_raw/batch_report.tsv。
"""
import glob, json, os, re, struct, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'art', 'hive_raw')
OUT = os.path.join(ROOT, 'art', 'models', 'hive')
SPR = os.path.join(ROOT, 'h5', 'assets', 'sprites')
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender')

# 模型类型 → (下载包编号, 优先挑的文件名正则, 身高 m, 出图类别)
H, M, L, X = 1.8, 1.4, 2.5, 3.6          # 人形 / 中型野兽 / 大型 / 巨型
PLAN = {
    'militia': (353514, None, H, 'monster'), 'murlocmutant_v1': (348406, None, 0.9, 'monster'), 'rockgolem': (335452, None, L, 'monster'),
    'bloodelfspellthief': (349243, r'^HESpellBreakerV2', H, 'monster'), 'skink': (355856, r'skink_spear_final', 1.2, 'monster'),
    'unbroken': (372743, None, 2.1, 'monster'), 'priest': (334955, None, H, 'monster'), 'scarab': (375452, None, 0.9, 'monster'),
    'knight': (337432, None, 2.3, 'monster'), 'bloodelfpeasant': (348617, None, 1.6, 'monster'), 'dranaiwhite': (339897, None, 2.1, 'monster'),
    'dranai': (334953, None, 2.1, 'monster'), 'mortarteam': (375331, None, 1.3, 'monster'), 'centaurarcher': (50437, None, 2.3, 'monster', {'tint': '0.2,0.4,0.95'}),
    'centaur': (50437, None, 2.4, 'monster'), 'nerubian': (339192, None, 0.9, 'monster'), 'warwagon': (341081, None, 2.4, 'monster'),
    'chaospeon': (375324, r'^FelOrcPeon\.mdx$', 1.6, 'monster'), 'thecaptain': (351081, None, H, 'monster'), 'grunt': (375272, r'^FelOrcGrunt\.mdx$', 2.0, 'monster'),
    'bristleback': (335243, None, M, 'monster'), 'headhunter': (375413, None, 2.0, 'monster'), 'chaoswolfrider': (375323, r'^FelOrcRaider\.mdx$', 2.2, 'monster'),
    'corruptedent': (335293, r'Corrupted', 3.2, 'monster'), 'witchdoctor': (375392, None, 2.0, 'monster'), 'revenantofthewaves': (370951, None, 2.2, 'monster'),
    'dragonspawnblue': (357826, None, 2.2, 'monster'), 'orcwarlockred': (348462, None, H, 'monster'), 'shaman': (366861, None, 2.0, 'monster'),
    'eredarwarlock': (331885, None, 2.3, 'monster'), 'wolfrider': (374607, None, 2.2, 'monster'), 'nagasummoner': (331882, None, 2.2, 'monster'),
    'tauren': (370922, None, 2.6, 'monster'), 'zombie': (355486, None, H, 'monster'), 'kotobeast': (375167, None, 3.0, 'monster'),
    'shade': (355495, None, H, 'monster'), 'owlscout': (375533, None, 1.0, 'monster'), 'medivh': (334648, r'ARUGAL60', H, 'monster'),
    'whitewolf': (350325, None, M, 'monster'), 'direwolf': (372560, None, M, 'monster'), 'satyrhellcaller': (355491, None, 2.0, 'monster'),
    'spiritwalker': (375459, None, 2.6, 'monster'), 'archnathid': (334771, None, 1.8, 'monster'), 'cryptfiend': (355469, None, 1.9, 'monster'),
    'ghoul': (355487, None, 1.6, 'monster'), 'skeletonmage': (355482, None, H, 'monster'), 'skeletonorc': (334601, None, H, 'monster'),
    'skeletonarcher': (334601, None, H, 'monster', {'tint': '0.3,0.85,0.2'}), 'demoness': (335291, r'Red', 2.0, 'monster'), 'demonessblue': (335291, r'Blue', 2.0, 'monster'),
    'banshee': (334295, None, H, 'monster'), 'necromancer': (355485, None, H, 'monster'), 'murlocflesheater': (348404, None, 1.3, 'monster'),
    'murlocwarrior': (332312, None, 1.3, 'monster'), 'dalaranreject': (335244, None, 2.2, 'monster'), 'mammothblack': (375497, None, 2.8, 'monster'),
    'skeleton': (374674, None, H, 'monster'), 'abomination': (334810, None, 2.6, 'monster'), 'felhound': (355478, None, M, 'monster'),
    'golemstatue': (335202, None, 2.8, 'monster'), 'kobold': (355108, None, 1.2, 'monster'), 'meatwagon': (332539, None, 2.2, 'monster'),
    'lobstrokkgreen': (375432, None, 1.7, 'monster'), 'lobstrokkred': (375433, None, 1.7, 'monster'), 'irongolem': (335341, None, 2.2, 'monster'),
    'shandris': (335662, r'^SC2HeroDarkRanger\.mdx$', H, 'monster'), 'huntress': (366688, r'^huntress\.mdx$', 2.2, 'monster'), 'hydralisk': (334962, None, 2.0, 'monster'),
    'ballista': (366689, None, 2.0, 'monster'), 'hydra': (361598, r'HydraGreen', 2.8, 'monster'), 'ent': (335293, r'^TreantHD', 3.2, 'monster'),
    'infernalcannoncannon': (334710, r'^((?!Flame).)*$', 2.8, 'monster'), 'quillbeast': (348325, None, 1.5, 'monster'), 'mountaingiant': (366696, None, 4.0, 'monster'),
    'dragonseaturtle': (375120, None, 2.6, 'monster'), 'pandarenbrewmaster': (374379, None, 2.1, 'monster'), 'earthpandarenbrewmaster': (365815, None, 1.9, 'monster'),
    'firepandarenbrewmaster': (374379, None, 2.1, 'monster', {'tint': '0.95,0.3,0.1'}), 'stormpandarenbrewmaster': (374379, None, 2.1, 'monster', {'tint': '0.1,0.75,0.95'}), 'druidoftheclaw': (366690, None, 2.2, 'monster'),
    'windserpent': (375054, None, 2.2, 'monster'), 'ancientofwar': (334293, None, 4.5, 'monster'),
    'vengeance': (335302, r'SC2VengeanceHD', 2.2, 'monster'), 'riddenhippogryph': (366693, None, 2.4, 'monster'), 'druidofthetalon': (366691, None, 2.0, 'monster'),
    'polarfurbolg': (375424, None, 2.4, 'monster'), 'polarfurbolgtracker': (375425, None, 2.4, 'monster'), 'icetroll': (374859, None, 2.2, 'monster'),
    'faeriedragon': (375172, None, 1.2, 'monster'), 'darktrolltrapper': (353414, None, 2.0, 'monster'), 'felgaurd': (355477, None, 2.6, 'monster'),
    'felgaurdblue': (355479, None, 2.8, 'monster'), 'humanbattleship': (330156, None, 4.0, 'boss'), 'gyrocopter': (335204, None, 2.4, 'boss'),
    'herotinker': (374740, None, 1.3, 'monster'), 'dwarfcar': (336026, None, 2.4, 'monster'), 'diablocar': (360293, None, 2.6, 'monster'),
    'orccar': (341080, None, 2.4, 'monster'), 'undeadcar': (335245, None, 2.4, 'monster'), 'seagiant': (334291, None, 3.6, 'monster'),
    'infernal': (337462, None, 3.0, 'monster'), 'bronzedragonwelp': (375019, None, 1.6, 'monster'), 'herotinkerrobot': (364503, None, 2.4, 'monster'),
    'owlbear': (375309, None, 2.4, 'monster'), 'waterelemental': (335454, None, 2.4, 'monster'), 'battroll': (355473, None, 2.2, 'monster'),
    'frostwyrm': (355484, None, 4.0, 'monster'), 'snapdragon': (375437, None, 1.8, 'monster'), 'spidercrabcreep': (357824, None, 1.4, 'monster'),
    'chaosorcrange': (375325, r'^FelOrcBlademaster\.mdx$', 2.0, 'monster'), 'revenant': (374327, None, 2.6, 'monster'), 'voidwalker': (375048, None, 2.4, 'monster'),
    'ogrelord': (375371, None, 2.8, 'monster'), 'spiritwyvern': (357827, None, 2.6, 'monster'), 'ogremagi': (375389, None, 2.8, 'monster'),
    'tichondrius': (334822, None, 3.0, 'boss'), 'bronzedragon': (375145, None, 5.0, 'boss'), 'undeadairbarge': (355474, None, 2.6, 'monster'),
    'greendragon': (375535, None, 5.0, 'boss'), 'azuredragon': (348415, None, 5.0, 'boss'), 'reddragon': (363220, None, 5.0, 'boss'),
    'hero:枪神': (352966, None, 2.0, 'hero'), 'hero:邪冰': (363866, r'^JainaSD\+\.mdx$', 1.9, 'hero'), 'hero:火魂': (366585, r'^Ragnaros', 3.0, 'hero'),
}
# 塔：fam → (下载包, 优先文件, 高度 m, 是否放标准塔座)。只出 1 个朝向（待机 + 攻击）
TOWERS = {
    '扫射塔': (350604, None, 1.4, True), '天神塔': (354972, None, 1.6, True), '寒冰塔': (337461, None, 2.0, True),
    '神圣塔': (47704, None, 2.4, False), '剑圣塔': (327741, r'^((?!portrait).)*$', 1.9, True), '牛头塔': (353340, None, 2.4, True),
    '通灵塔': (349094, None, 3.6, False), '箭塔': (373109, None, 3.6, False), '毒塔': (360593, None, 2.6, False),
    '群攻塔': (374461, None, 2.3, True), '混乱塔': (335213, None, 2.2, True), '破坏塔': (354028, None, 3.6, False),
    '腐蚀塔': (350922, None, 1.9, True), '暴击塔': (374800, None, 1.5, True), '重击塔': (348620, None, 3.0, True),
    '加速光环': (366686, None, 1.6, False), '减防光环': (338841, None, 2.6, False), '减速光环': (373387, r'fountain2', 2.0, False),
    '图腾塔': (355465, None, 2.0, True), '精灵塔': (335206, None, 3.6, False), '巨箭塔': (342182, None, 3.6, False),
    '地精塔': (334054, None, 2.2, True), '弹跳塔': (357828, r'White', 1.9, True),
}
SKIP = re.compile(r'portrait|missile|_port|effect|sulfuras|flame\b|attachment|weapon|projectile|birth|corpse', re.I)


def units():
    s = open(os.path.join(ROOT, 'h5', 'data.js'), encoding='utf8').read()
    D = json.loads(s[s.index('{'):s.rindex('}') + 1])
    U = json.load(open(os.path.join(ROOT, 'analysis', 'raw', 'units_all.json')))
    groups = {}
    for uid in D['units']:
        f = U.get(uid, {}).get('file', '?').lower().replace('.mdl', '').split('\\')[-1]
        groups.setdefault(f, []).append((uid, float(U.get(uid, {}).get('modelScale') or 1)))
    return groups


def mdx_textures(path):
    d = open(path, 'rb').read(); p = 4; tex = []
    while p + 8 <= len(d):
        tg = d[p:p + 4]; sz = struct.unpack_from('<I', d, p + 4)[0]
        if tg == b'TEXS':
            for q in range(p + 8, p + 8 + sz, 268):
                if struct.unpack_from('<I', d, q)[0] == 0:
                    t = d[q + 4:q + 264].split(b'\0')[0].decode('latin1')
                    if t: tex.append(t)
        p += 8 + sz
    return tex


FX_TEX = re.compile(r'glow|star|gutz|dust|cloud|shockwave|flare|wake|blur|zap|sparkle|lava|splash|ribbon|environmentmap|black32|normal|orm|teamglow|lensflare|blood|doodads0|crystalball|clouds', re.I)


def pick_mdx(gid, pkg, prefer):
    cands = [f for f in glob.glob(os.path.join(RAW, f'h{pkg}', 'x', '**', '*'), recursive=True) if f.lower().endswith('.mdx') and os.path.isfile(f)]
    good = [f for f in cands if not SKIP.search(os.path.basename(f))] or cands
    if prefer:
        pre = [f for f in good if re.search(prefer, os.path.basename(f), re.I)]
        good = pre or good
    have = {os.path.splitext(os.path.basename(x))[0].lower() for x in glob.glob(os.path.join(RAW, f'h{pkg}', 'x', '**', '*'), recursive=True)}

    def missing(f):   # 缺了几张"不是特效"的贴图
        return sum(1 for t in mdx_textures(f) if os.path.splitext(t.replace('\\', '/').split('/')[-1])[0].lower() not in have and not FX_TEX.search(t))
    good.sort(key=lambda f: (missing(f), len(f)))
    return good[0] if good else None, (missing(good[0]) if good else None)


def job_import(key, mdx, height, cat, extra=(), force=False):
    """mdx → .blend → 精灵表；返回 (状态, 说明)"""
    fname = key.replace(':', '_')
    if not force and os.path.exists(os.path.join(SPR, fname + '.json')):
        return 'skip', ''
    blend = os.path.join(OUT, fname + '.blend')
    r = subprocess.run([BLENDER, '-b', '--python-exit-code', '1', '-P', os.path.join(ROOT, 'tools', 'blender', 'import_mdx.py'), '--',
                        '--mdx', mdx, '--out', blend, '--height', str(height), *extra], capture_output=True, text=True)
    log = [l for l in r.stdout.splitlines() if l.startswith('[mdx]')]
    if r.returncode != 0:
        return 'import-fail', os.path.relpath(mdx, RAW) + ' | ' + ' '.join((r.stderr or r.stdout).strip().splitlines()[-1:])
    notex = sum('找不到贴图' in l for l in log)
    acts = ','.join(re.findall(r'\[mdx\]\s+(\w+) ←', '\n'.join(log)))
    return render(key, blend, cat, f'{os.path.relpath(mdx, RAW)} | 缺贴图 {notex} | 动作 {acts}' + (' | ' + ' '.join(extra) if extra else ''))


def render(key, blend, cat, note):
    fname = key.replace(':', '_')
    r = subprocess.run([BLENDER, '-b', '-P', os.path.join(ROOT, 'tools', 'blender', 'render_sprites.py'), '--', '--model', blend, '--key', key,
                        '--category', cat], capture_output=True, text=True)
    ok = os.path.exists(os.path.join(SPR, fname + '.json')) and r.returncode == 0
    return ('ok' if ok else 'render-fail'), note


def run(gid, force):
    pkg, prefer, height, cat, *opt = PLAN[gid]
    opt = opt[0] if opt else {}
    key = gid if gid.startswith('hero:') else 'unit:' + UNITS[gid][0][0]
    mdx, _ = pick_mdx(gid, pkg, prefer)
    if not mdx: return gid, key, 'no-mdx', ''
    extra = ['--tint', opt['tint']] if opt.get('tint') else []
    return (gid, key, *job_import(key, mdx, height, cat, extra, force))


def run_tower(fam, force):
    pkg, prefer, height, pedestal = TOWERS[fam]
    key = 'tower:' + fam
    mdx, _ = pick_mdx(fam, pkg, prefer)
    if not mdx: return fam, key, 'no-mdx', ''
    return (fam, key, *job_import(key, mdx, height, 'tower', ['--pedestal'] if pedestal else [], force))


# ---------------------------------------------------------------- 同类型里的变体：换配色或染色，各出一张图
TINTS = [  # (名字里的字, 颜色)。用"颜色"混合：换色相和饱和度、保留明暗，所以颜色要饱和
    (r'强壮|坚硬|硬甲|坚固|坚强|耐力', '0.85,0.18,0.12'), (r'敏捷|迅捷|急速|极速|闪避', '0.2,0.85,0.25'),
    (r'邪恶|致命|恐怖|深渊|死亡|变异|暗黑|毒性', '0.55,0.15,0.9'), (r'王|领主|首领|之主|长老|将|头头|金色|嚣张|大牧师|魔法破坏者', '0.95,0.72,0.1'),
    (r'小|人工', '0.15,0.45,0.95'),
]
PALETTE = ['0.15,0.45,0.95', '0.95,0.45,0.1', '0.2,0.85,0.25', '0.55,0.15,0.9', '0.95,0.72,0.1', '0.1,0.8,0.8']


def tint_for(name, used):
    for pat, col in TINTS:
        if re.search(pat, name) and col not in used: return col
    return next((c for c in PALETTE if c not in used), PALETTE[len(used) % len(PALETTE)])


def skins_for(mdx):
    """同一个下载包里和主贴图同一套 UV 的其他配色（Hive 的 COLOR VARIATIONS 系列）"""
    tex = [os.path.splitext(t.replace('\\', '/').split('/')[-1])[0] for t in mdx_textures(mdx)]
    tex = [t for t in tex if not FX_TEX.search(t)]
    if not tex: return []
    main = max(tex, key=len) if len(tex) == 1 else tex[0]
    stem = re.sub(r'\d+$', '', main).lower(); digits = re.search(r'\d*$', main).group(0)
    pkg = os.path.join(RAW, os.path.relpath(mdx, RAW).split(os.sep)[0])
    out, seen = [], set()
    for f in sorted(glob.glob(os.path.join(pkg, 'x', '**', '*.blp'), recursive=True)):
        b = os.path.splitext(os.path.basename(f))[0]; bl = b.lower()
        if bl == main.lower() or bl.endswith('alpha') or re.match(r'(dis)?(btn|pas|atc|att|upg|ssh)', bl): continue
        if 'skin' not in bl or 'wing' in bl or 'part' in bl or 'stuff' in bl or 'helm' in bl: continue   # 只要整张身体贴图
        if (bl.startswith(stem[:6]) or stem[:6] in bl) and b.endswith(digits) and bl not in seen:
            seen.add(bl); out.append(f)
    return out


VARIANT_JOBS = {}


def plan_variants():
    s = open(os.path.join(ROOT, 'h5', 'data.js'), encoding='utf8').read()
    names = {k: v['name'] for k, v in json.loads(s[s.index('{'):s.rindex('}') + 1])['units'].items()}
    for gid, us in UNITS.items():
        if gid in EXTRA_BASE:
            base_uid, base_ms = EXTRA_BASE[gid]; vs = us
        elif gid in PLAN or os.path.exists(os.path.join(OUT, f'unit_{us[0][0]}.blend')):
            (base_uid, base_ms), vs = us[0], us[1:]
        else:
            continue
        mdx = pick_mdx(gid, PLAN[gid][0], PLAN[gid][1])[0] if gid in PLAN else None
        skins = skins_for(mdx) if mdx else []
        used = [PLAN[gid][4]['tint']] if gid in PLAN and len(PLAN[gid]) > 4 else []
        for uid, ms in vs:
            ratio = ms / (base_ms or 1)
            if skins:
                VARIANT_JOBS[uid] = ('skin', gid, mdx, skins.pop(0), PLAN[gid][2] * ratio, PLAN[gid][3])
            else:
                col = tint_for(names.get(uid, ''), used); used.append(col)
                VARIANT_JOBS[uid] = ('tint', gid, base_uid, col, ratio)


def run_variant(uid, force):
    job = VARIANT_JOBS[uid]; key = 'unit:' + uid
    if job[0] == 'skin':
        _, gid, mdx, skin, height, cat = job
        return (uid, key, *job_import(key, mdx, height, cat, ['--skin', skin], force))
    _, gid, base_uid, col, ratio = job
    if not force and os.path.exists(os.path.join(SPR, f'unit_{uid}.json')) and not json.load(open(os.path.join(SPR, f'unit_{uid}.json'), encoding='utf-8')).get('aliasOf'):
        return uid, key, 'skip', ''
    base = next((p for p in (os.path.join(OUT, f'unit_{base_uid}.blend'), os.path.join(ROOT, 'art', 'models', f'unit_{base_uid}.blend')) if os.path.exists(p)), None)
    if not base: return uid, key, 'no-base', base_uid
    out = os.path.join(OUT, f'unit_{uid}.blend')
    r = subprocess.run([BLENDER, '-b', '-P', os.path.join(ROOT, 'tools', 'blender', 'make_variant.py'), '--', '--base', base, '--out', out,
                        '--tint', col, '--mode', 'color', '--strength', '0.6', '--scale', f'{ratio:.3f}'], capture_output=True, text=True)
    if not os.path.exists(out): return uid, key, 'variant-fail', ' '.join((r.stderr or r.stdout).strip().splitlines()[-1:])
    cat = PLAN[gid][3] if gid in PLAN else 'monster'
    return (uid, key, *render(key, out, cat, f'染色 {col} ×{ratio:.2f}（基于 {base_uid}）'))


EXTRA_BASE = {'assassin': ('h07M', 1.3),     # 原图用刺客模型的单位：基于暗黑的女巫那个刺客模型染色
              'banditlord': ('n08Q', 0.8)}   # 强盗领主：Hive 上的模型缺 16 张贴图，基于强壮的强盗染色放大


def register():
    """还没有自己精灵表的单位：复制同模型的登记信息，按 modelScale 调整大小（兜底）"""
    for gid, us in UNITS.items():
        base_uid, base_ms = us[0]
        if gid in EXTRA_BASE: base_uid, base_ms = EXTRA_BASE[gid]; us = [(base_uid, base_ms)] + us
        meta_p = os.path.join(SPR, f'unit_{base_uid}.json')
        if not os.path.exists(meta_p): continue
        meta = json.load(open(meta_p, encoding='utf-8'))
        if meta.get('aliasOf'): continue
        for uid, ms in us[1:]:
            p = os.path.join(SPR, f'unit_{uid}.json')
            if os.path.exists(p) and not json.load(open(p, encoding='utf-8')).get('aliasOf'): continue    # 有自己的图就不动
            m = dict(meta, key='unit:' + uid, aliasOf=meta['key'], unitsPerPixel=meta['unitsPerPixel'] * ms / (base_ms or 1))
            json.dump(m, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'register_sprites.py')])


def save_report(rows):
    rep = os.path.join(RAW, 'batch_report.tsv')
    old = {}
    if os.path.exists(rep):
        for l in open(rep, encoding='utf8'):
            p = l.rstrip('\n').split('\t'); old[p[0]] = p
    for r in rows:
        if r[2] != 'skip': old[r[0]] = list(r)
    open(rep, 'w', encoding='utf8').write(''.join('\t'.join(v) + '\n' for v in old.values()))


UNITS = units()
if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--register' in sys.argv:
        register(); sys.exit()
    force = '--force' in sys.argv
    jobs = []
    if '--towers' in sys.argv:
        jobs = [(run_tower, f) for f in (args or TOWERS)]
    elif '--variants' in sys.argv:
        plan_variants()
        jobs = [(run_variant, u) for u in (args or VARIANT_JOBS)]
    else:
        for g in (args or PLAN):
            if g not in PLAN: raise SystemExit('PLAN 里没有：' + g)
        jobs = [(run, g) for g in (args or PLAN)]
    rows = []
    with ThreadPoolExecutor(int(os.environ.get('JOBS', 5))) as ex:
        for res in ex.map(lambda j: j[0](j[1], force), jobs):
            rows.append(res); print('\t'.join(res), flush=True)
    save_report(rows)
    register()
