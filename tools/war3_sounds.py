"""原版音效（war3-assets.zip 里的 .wav / .mp3）→ h5/assets/sounds/ + 音效登记 h5/assets/w3sounds.js。

  python3 tools/war3_sounds.py            # 导出
  python3 tools/war3_sounds.py --list     # 只打印每个单位挑到的音效，不导出

和原图的对应：
  - 语音（选中 What / 命令 Yes / 连点 Pissed）：单位数据的 unitSound（WC3 按它找 UnitAckSounds），文件名前缀相同的就是；
    找不到时用模型同目录的语音。
  - 攻击：投射物（Missileart）同目录的 *Launch* 是出手声、*Hit* / *Impact* / *Target* 是命中声；
    没有的用 unitSound 的 *Attack*，再没有的按游戏里的弹道样式（game.js 的 MISSILE）补一个原版音效（STYLE）。
  - 怪物死亡：模型同目录的 *Death*，没有就用 unitSound 的。
  - 波次开始：原图脚本 war3map.j 每波触发器里 PlaySoundBJ 的那首（含音高）。
  - 背景音乐：原图 SetMapMusic("Music") + 玩家 1 固定暗夜精灵 → 暗夜精灵的 3 首。
包里没有原图的 AnimSounds.slk，所以模型动画里的 SND 事件对不上号，上面是按文件名推断的。
"""
import json, os, re, shutil, sys, zipfile
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(ROOT, 'war3-assets.zip')
OUT = os.path.join(ROOT, 'h5', 'assets', 'sounds')
D = (lambda s: json.loads(s[s.index('{'):s.rindex('}') + 1]))(open(os.path.join(ROOT, 'h5', 'data.js'), encoding='utf8').read())
U = json.load(open(os.path.join(ROOT, 'analysis', 'raw', 'units_all.json'), encoding='utf8'))
BUILDER_ID, SHOP_ID, RABBIT_ID = 'uaco', 'u00L', 'nshe'

# ---------------------------------------------------------------- 包内索引：去掉 roc/ tft/ 的相对路径（小写）→ zip 成员；tft 覆盖 roc
Z = zipfile.ZipFile(ZIP)
FILES = {}
for n in sorted(Z.namelist(), key=lambda n: n.startswith('tft/')):
    if n.startswith('__MACOSX') or not re.search(r'\.(wav|mp3)$', n, re.I): continue
    FILES[n.split('/', 1)[1].lower()] = n
BYDIR = defaultdict(list)
for k in FILES: BYDIR[os.path.dirname(k)].append(k)
for v in BYDIR.values(): v.sort()


def stem(k): return os.path.splitext(os.path.basename(k))[0].lower()
def mdir(path): return os.path.dirname(path.replace('\\', '/').lower())


def pick(files, pat, exclude=None):
    r = [k for k in files if re.search(pat, stem(k)) and not (exclude and re.search(exclude, stem(k)))]
    return r


def by_prefix(prefix, kind):
    """全包里文件名是 <prefix><kind><数字> 的（unitSound 语音）"""
    if not prefix: return []
    rx = re.compile('^' + re.escape(prefix.lower()) + kind + r'\d*$')
    return sorted(k for k in FILES if rx.match(stem(k)))


def voice(u):
    snd, d = u.get('unitSound'), mdir(u.get('file', ''))
    kinds = (('what', 'what'), ('yes', 'yes'), ('yesattack', 'yesAttack'), ('pissed', 'pissed'))
    out = {key: by_prefix(snd, kind) for kind, key in kinds}
    if not any(out.values()):                                  # unitSound 在包里没有：用模型同目录的语音
        out = {key: pick(BYDIR.get(d, []), kind + r'\d*$', 'attack' if kind == 'yes' else None) for kind, key in kinds}
    return {k: v for k, v in out.items() if v}


# 弹道样式 → 原版音效（投射物目录里没有声音时用）：[出手, 命中]
STYLE = {
    'arcaneDagger': ['abilities/weapons/bloodelfmissile/bloodmagerangedattack.wav', None],
    'frostBolt': ['abilities/spells/other/frostbolt/frostboltlaunch1.wav', 'abilities/spells/other/frostbolt/frostbolthit1.wav'],
    'lightning': [None, 'abilities/spells/orc/lightningbolt/lightningbolt.wav'],
    'arrow': ['abilities/weapons/guardtowermissile/guardtowermissilelaunch*', 'abilities/weapons/guardtowermissile/guardtowermissilehit*'],
    'cannon': ['abilities/weapons/cannontowermissile/cannontowermissilelaunch*', 'abilities/weapons/mortar/mortarimpact.wav'],
    'boulder': ['units/creeps/rockgolem/rockgolemattack*', 'sound/units/combat/rockheavybashflesh*'],
    'iceSpear': ['abilities/spells/other/frostarrows/frostarrowlaunch1.wav', 'abilities/spells/undead/frostnova/frostnovatarget1.wav'],
    'holyBeam': [None, 'abilities/spells/human/innerfire/innerfirebirth.wav'],
    'arcaneMissile': ['abilities/weapons/zigguratmissile/zigguratmissilelaunch*', 'abilities/weapons/zigguratmissile/zigguratmissilehit*'],
    'thrownAxe': ['units/human/rifleman/riflemanattack*', None],
    'stormHammer': ['abilities/spells/human/stormbolt/stormboltlaunch.wav', 'abilities/spells/human/stormbolt/thunderboltmissiledeath.wav'],
    'moonGlaive': ['abilities/weapons/dragonhawkmissile/windserpentmissile.wav', None],
    'rocket': ['abilities/weapons/cannontowermissile/cannontowermissilelaunch*', 'abilities/weapons/mortar/mortarimpact.wav'],
    'fireball': ['abilities/weapons/fireballmissile/fireballmissilelaunch*', 'abilities/weapons/fireballmissile/fireballmissiledeath.wav'],
    'bullet': ['units/human/rifleman/riflemanattack*', None],
    'windSlash': ['units/orc/heroblademaster/heroblademasterattack*', 'sound/units/combat/metalheavysliceflesh*'],
    'acid': ['abilities/weapons/cryptfiendmissile/cryptfiendmissilelaunch*', 'abilities/weapons/cryptfiendmissile/cryptfiendmissilehit*'],
}
# 原图数据对不上游戏里的表现时，直接按弹道样式（剑神的 Missileart 是"骷髅复活"特效，每次攻击都播不合适）
STYLE_ONLY = {'hero:剑神'}
MISSILE_STYLE = {   # 和 game.js 的 MISSILE 一致
    '魔幻塔': 'arcaneDagger', '冰霜塔': 'frostBolt', '灵魂塔': 'soulWisp', '闪电塔': 'lightning', '箭塔': 'arrow', '巨箭塔': 'ballista',
    '毒塔': 'poison', '腐蚀塔': 'acid', '群攻塔': 'cannon', '牛头塔': 'boulder', '寒冰塔': 'iceSpear', '神圣塔': 'holyBeam', '天神塔': 'holy',
    '剑圣塔': 'windSlash', '通灵塔': 'necro', '混乱塔': 'chaosOrb', '破坏塔': 'arcaneMissile', '暴击塔': 'thrownAxe', '重击塔': 'stormHammer',
    '图腾塔': 'elemOrb', '精灵塔': 'wisp', '地精塔': 'rocket', '弹跳塔': 'moonGlaive', '炎魔': 'fireball',
    'hero:剑神': 'windSlash', 'hero:枪神': 'bullet', 'hero:邪冰': 'frostBolt', 'hero:火魂': 'fireball',
}


def glob(p):
    if not p: return []
    if p.endswith('*'): return sorted(k for k in FILES if k.startswith(p[:-1]))
    return [p] if p in FILES else []


def attack(u, style, style_only=False):
    if style_only: return glob(STYLE[style][0]), glob(STYLE[style][1])
    ms = (u.get('Missileart') or '').split(',')[0].strip()
    md = BYDIR.get(mdir(ms), []) if re.search(r'\w\.mdl$', ms, re.I) else []
    hit = pick(md, r'hit|impact|target|death|done|caster')
    launch = [k for k in md if k not in hit and not re.search(r'what|yes|pissed', stem(k))]
    if u.get('weapTp1') == 'instant' and not hit: hit, launch = launch, []
    if not launch: launch = by_prefix(u.get('unitSound'), 'attack') or pick(BYDIR.get(mdir(u.get('file', '')), []), r'attack\d*$', 'yesattack')
    fb = STYLE.get(style, [None, None])
    return launch or glob(fb[0]), hit or glob(fb[1])


def death(u):
    d = mdir(u.get('file', ''))
    return pick(BYDIR.get(d, []), r'death') or by_prefix(u.get('unitSound'), 'death')


# ---------------------------------------------------------------- 原图脚本：每波开始播的音乐片段（PlaySoundBJ）
def wave_stingers():
    src = open(os.path.join(ROOT, 'analysis', 'raw', 'war3map.j'), encoding='utf8', errors='replace').read()
    snd = {}
    for v, path, vol, pitch in re.findall(r'set (\w+)=CreateSound\("([^"]+)".*?SetSoundVolume\(\1,(\d+)\)\s*call SetSoundPitch\(\1,([\d.]+)\)', src, re.S):
        snd[v] = dict(file=path.replace('\\\\', '/').lower(), vol=round(int(vol) / 127, 2), pitch=float(pitch))
    out, n = {}, 0
    for f in re.split(r'\nfunction ', src):
        s = re.findall(r'PlaySoundBJ\((\w+)\)', f)
        if not s: continue
        m = re.search(r'"\|c008000FF(第.{1,6}波开始|BOSS波开始|熊猫Boss波开始)\|r"', f)
        if m and m.group(1) == 'BOSS波开始' and n % 10 == 0 and n: continue     # 第 10/20/30/40 波有两种 BOSS 变体，同一首
        n += 1; out[n] = s[0]
    return snd, out


UI = {   # 界面：原图玩家 1 是暗夜精灵，提示语音用暗夜精灵的
    'click': 'sound/interface/mouseclick1.wav', 'bigClick': 'sound/interface/bigbuttonclick.wav',
    'error': 'sound/interface/error.wav', 'noGold': 'sound/interface/sentinelnogold1.wav',
    'noLumber': 'sound/interface/sentinelnolumber1.wav', 'noFood': 'sound/interface/huntressnofood1.wav',
    'cantBuild': 'sound/interface/huntresscannotbuildthere1.wav', 'place': 'sound/buildings/shared/buildingplacement.wav',
    'construct': 'sound/buildings/shared/buildingconstruction.wav', 'built': 'sound/buildings/nightelf/huntressbuildingcomplete1.wav',
    'upgrade': 'sound/buildings/nightelf/sentinelupgradecomplete1.wav', 'sell': 'sound/interface/receivegold.wav',
    'item': 'sound/interface/itemreceived.wav', 'pause': 'sound/interface/gamepause.wav', 'hint': 'sound/interface/hint.wav',
    'levelup': 'abilities/spells/other/levelup/levelupcaster.wav', 'learn': 'sound/interface/autocastbuttonclick1.wav',
    'heroDies': 'sound/interface/sentinelherodies1.wav', 'warning': 'sound/interface/warning.wav',
    'quest': 'sound/interface/questnew.wav', 'blink': 'abilities/spells/nightelf/blink/blinkbirth1.wav',
    'rescue': 'sound/interface/rescue.wav', }
SPELL = {   # 英雄技能（游戏里只实现了核心效果）→ 原图同类技能的音效
    'bladestorm': 'units/orc/heroblademaster/blademasterwhirlwind.wav',
    'crit': 'units/orc/heroblademaster/criticalstrike.wav',
    'iceFall': 'abilities/spells/human/blizzard/blizzardtarget*',
    'frostPulse': 'abilities/spells/undead/carrionswarm/carrionswarmdamage*',
    'frostNova': 'abilities/spells/undead/frostnova/frostnovatarget1.wav',
    'fireFall': 'abilities/spells/demon/rainoffire/rainoffiretarget*',
    'meteor': 'abilities/spells/human/flamestrike/flamestrikebirth1.wav',
    'summon': 'units/demon/infernal/infernalbirth1.wav',
    'tauntRabbit': 'sound/interface/goodjob.wav',
}
MUSIC = ['sound/music/mp3music/nightelf1.mp3', 'sound/music/mp3music/nightelf2.mp3', 'sound/music/mp3music/nightelf3.mp3']
END = {'victory': 'sound/music/mp3music/nightelfvictory.mp3', 'defeat': 'sound/music/mp3music/nightelfdefeat.mp3'}


def fix(p):   # 上面手写路径里的笔误按目录模糊匹配
    if not p: return []
    g = glob(p)
    if g: return g
    base = p.rstrip('*').split('/')[-1]
    return sorted(k for k in FILES if os.path.basename(k).startswith(base))


def main():
    only_list = '--list' in sys.argv
    used = set()
    def use(lst):
        lst = [k for k in lst if k in FILES]; used.update(lst); return ['sounds/' + FILES[k].split('/', 1)[1] for k in lst]
    ent = {}
    for fam, t in D['towers'].items():
        u = U[t['levels'][0]['id']]
        e = voice(u)
        if t['cat'] != 'aura':
            l, h = attack(u, MISSILE_STYLE.get(fam)); e['launch'], e['hit'] = l, h
        ent['tower:' + fam] = e
    for n, h in D['heroes'].items():
        u = U[h['id']]; e = voice(u)
        e['launch'], e['hit'] = attack(u, MISSILE_STYLE.get('hero:' + n), 'hero:' + n in STYLE_ONLY); e['death'] = death(u)
        ent['hero:' + n] = e
    ent['tower:炎魔'] = dict(zip(('launch', 'hit'), attack({}, 'fireball')))
    for uid in D['units']:
        dd = death(U.get(uid, {}))
        if dd: ent['unit:' + uid] = {'death': dd}
    ent['builder'] = voice(U[BUILDER_ID])
    ent['shop'] = voice(U[SHOP_ID])
    ent['rabbit'] = voice(U[RABBIT_ID])

    snd, waves = wave_stingers()
    if only_list:
        for k, e in ent.items(): print(k, {a: [os.path.basename(x) for x in v] for a, v in e.items()})
        print({w: snd[v]['file'] for w, v in waves.items()})
        return
    data = dict(
        ent={k: {a: use(v) for a, v in e.items() if use(v)} for k, e in ent.items()},
        ui={k: use(fix(v)) for k, v in UI.items() if fix(v)},
        spell={k: use(fix(v)) for k, v in SPELL.items() if fix(v)},
        music=use(MUSIC), end={k: use([v])[0] for k, v in END.items()},
        stinger={n: dict(file=use([snd[v]['file']])[0], vol=snd[v]['vol'], pitch=snd[v]['pitch']) for n, v in waves.items()},
    )
    data['ent'] = {k: v for k, v in data['ent'].items() if v}
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    size = 0
    for k in sorted(used):
        dst = os.path.join(OUT, FILES[k].split('/', 1)[1])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with Z.open(FILES[k]) as fi, open(dst, 'wb') as fo: shutil.copyfileobj(fi, fo)
        size += os.path.getsize(dst)
    with open(os.path.join(ROOT, 'h5', 'assets', 'w3sounds.js'), 'w', encoding='utf-8') as fp:
        fp.write('// 自动生成：tools/war3_sounds.py —— 原版音效登记（文件在 assets/sounds/，不入库）\n')
        fp.write('window.W3_SOUNDS = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    miss = [k for k in ent if k.startswith(('tower:', 'hero:')) and not data['ent'].get(k, {}).get('hit') and not data['ent'].get(k, {}).get('launch') and 'aura' not in D['towers'].get(k[6:], {}).get('cat', '')]
    print(f'导出了 {len(used)} 个音效（{size / 1e6:.1f} MB），{len(data["ent"])} 个单位登记了音效；没有攻击音效：{miss}')


if __name__ == '__main__':
    main()
