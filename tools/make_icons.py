"""生成命令面板图标：h5/assets/icons/<id>.svg（64×64，WC3 风格的斜面边框 + 渐变底 + 金属质感图形）。
基础图形来自开源图标库 game-icons.net（CC BY 3.0，作者见 h5/assets/icons/CREDITS.md）；
特殊命令（兑换、随机建造、切换伤害类型、升级、回收、分支……）在这里用组合 + 自绘的方式做。

  python3 tools/make_icons.py                              # 用仓库里的子集 tools/icons/game-icons-subset.json
  python3 tools/make_icons.py --pkg <iconify 包目录>         # 从完整包 @iconify-json/game-icons 重新抽取子集（加新图标时用）
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'h5', 'assets', 'icons')
SUBSET = os.path.join(ROOT, 'tools', 'icons', 'game-icons-subset.json')

# 主题：底色（上、下）、图形渐变（亮、暗）
THEME = {
    'cmd':    (('#2b3446', '#0c1018'), ('#fff3c4', '#c8902c')),     # 基础命令：深蓝底金图形
    'econ':   (('#3d2f1a', '#120d06'), ('#fff3c4', '#d9a520')),     # 资源
    'normal': (('#3a3f45', '#101215'), ('#ffffff', '#9aa3ad')),
    'pierce': (('#4a2e14', '#140b04'), ('#ffe6c0', '#ff9a3c')),
    'magic':  (('#1c3150', '#070d18'), ('#e6f3ff', '#5aa8ff')),
    'chaos':  (('#3a1d4a', '#0f0614'), ('#f3e0ff', '#b46bff')),
    'hero':   (('#4a3a10', '#141004'), ('#fff6cc', '#ffcc33')),
    'aura':   (('#1d4020', '#071208'), ('#e4ffd8', '#5fd35f')),
    'str':    (('#4a1a14', '#140605'), ('#ffe0d8', '#ff5a4f')),
    'agi':    (('#1d4020', '#071208'), ('#e4ffd8', '#5fd35f')),
    'int':    (('#1c3150', '#070d18'), ('#e6f3ff', '#5aa8ff')),
    'up':     (('#1d4020', '#071208'), ('#f4ffe0', '#7bdc4a')),
    'sell':   (('#3d2f1a', '#120d06'), ('#fff3c4', '#d9a520')),
}

# id → (主题, 主图形, 组合方式, 参数)
#   组合方式：None = 单个图形；'badge' = 右下角加小圆徽章；'swap' = 左上小图 → 右下大图（兑换）；'split' = 图形左右两种颜色
ICONS = {
    # 守卫者
    'move':    ('cmd', 'walking-boot', None, None),
    'stop':    ('cmd', 'black-hand-shield', None, None),
    'blink':   ('magic', 'teleport', None, None),
    'build':   ('cmd', 'claw-hammer', None, None),
    'reroll':  ('econ', 'dice-six-faces-five', 'badge', ('cycle', '#6fd17a')),
    'woodmenu': ('econ', 'wood-pile', None, None),
    'buyfood': ('econ', 'log', 'swap', ('meeple', '#ffb38a')),
    'wood2gold': ('econ', 'log', 'swap', ('two-coins', '#ffd257')),
    'gold2wood': ('econ', 'two-coins', 'swap', ('log', '#c8935a')),
    'back':    ('cmd', 'return-arrow', None, None),
    # 塔 / 英雄通用
    'upgrade': ('up', 'upgrade', None, None),
    'sell':    ('sell', 'two-coins', 'badge', ('recycle', '#6fd17a')),
    'learn':   ('int', 'spell-book', None, None),
    'str':     ('str', 'biceps', None, None),
    'agi':     ('agi', 'sprint', None, None),
    'int':     ('int', 'brain', None, None),
    'switchdmg': ('hero', 'cycle', 'split', ('#ffffff', '#b46bff')),
    'branch-pierce': ('pierce', 'split-arrows', None, None),
    'branch-normal': ('normal', 'split-arrows', None, None),
    'branch-chaos':  ('chaos', 'split-arrows', None, None),
    'branch-magic':  ('magic', 'split-arrows', None, None),
    # 塔（没有精灵图时用）
    'tower-扫射塔': ('magic', 'sinusoidal-beam', None, None), 'tower-天神塔': ('normal', 'sun-priest', None, None),
    'tower-寒冰塔': ('pierce', 'ice-spear', None, None), 'tower-魔幻塔': ('pierce', 'flying-dagger', None, None),
    'tower-神圣塔': ('normal', 'holy-symbol', None, None), 'tower-剑圣塔': ('normal', 'crossed-swords', None, None),
    'tower-牛头塔': ('chaos', 'minotaur', None, None), 'tower-通灵塔': ('normal', 'burning-skull', None, None),
    'tower-闪电塔': ('magic', 'tesla-coil', None, None), 'tower-箭塔': ('pierce', 'bow-arrow', None, None),
    'tower-毒塔': ('pierce', 'poison-bottle', None, None), 'tower-群攻塔': ('normal', 'cannon', None, None),
    'tower-混乱塔': ('chaos', 'vortex', None, None), 'tower-破坏塔': ('magic', 'unstable-orb', None, None),
    'tower-腐蚀塔': ('pierce', 'acid', None, None), 'tower-暴击塔': ('normal', 'battle-axe', None, None),
    'tower-重击塔': ('chaos', 'thor-hammer', None, None), 'tower-冰霜塔': ('magic', 'frozen-orb', None, None),
    'tower-加速光环': ('aura', 'rear-aura', None, None), 'tower-攻击光环': ('aura', 'crossed-swords', 'badge', ('aura', '#5fd35f')),
    'tower-减防光环': ('aura', 'cracked-shield', None, None), 'tower-减速光环': ('aura', 'icicles-aura', None, None),
    'tower-灵魂塔': ('chaos', 'ghost', None, None), 'tower-图腾塔': ('magic', 'totem', None, None),
    'tower-精灵塔': ('chaos', 'fairy', None, None), 'tower-巨箭塔': ('hero', 'ballista', None, None),
    'tower-地精塔': ('chaos', 'goblin-head', None, None), 'tower-弹跳塔': ('pierce', 'glaive', None, None),
    # 英雄塔和技能
    'hero-剑神': ('hero', 'dervish-swords', None, None), 'hero-枪神': ('hero', 'crossed-pistols', None, None),
    'hero-邪冰': ('hero', 'ice-spell-cast', None, None), 'hero-火魂': ('hero', 'fire-spell-cast', None, None),
    'skill-剑神-0': ('magic', 'whirlwind', None, None), 'skill-剑神-1': ('pierce', 'piercing-sword', None, None),
    'skill-剑神-2': ('magic', 'energy-sword', 'badge', ('whirlwind', '#9fe3ff')), 'skill-剑神-3': ('hero', 'bouncing-sword', None, None),
    'skill-枪神-0': ('pierce', 'supersonic-bullet', None, None), 'skill-枪神-1': ('pierce', 'fire-breath', None, None),
    'skill-枪神-2': ('chaos', 'bullet-impacts', None, None), 'skill-枪神-3': ('hero', 'heavy-bullets', None, None),
    'skill-邪冰-0': ('normal', 'snowflake-2', 'badge', ('falling-rocks', '#cfefff')), 'skill-邪冰-1': ('magic', 'ice-bolt', None, None),
    'skill-邪冰-2': ('chaos', 'icicles-aura', None, None), 'skill-邪冰-3': ('magic', 'frozen-orb', None, None),
    'skill-火魂-0': ('str', 'burning-skull', None, None), 'skill-火魂-1': ('pierce', 'fire-bomb', None, None),
    'skill-火魂-2': ('magic', 'burning-meteor', None, None), 'skill-火魂-3': ('chaos', 'fire-dash', None, None),
}


def load_glyphs():
    if '--pkg' in sys.argv:
        pkg = sys.argv[sys.argv.index('--pkg') + 1]
        full = json.load(open(os.path.join(pkg, 'icons.json'), encoding='utf-8'))['icons']
        need = set()
        for _, (_, g, kind, arg) in ICONS.items():
            need.add(g)
            if kind in ('badge', 'swap'):
                need.add(arg[0])
        missing = sorted(n for n in need if n not in full)
        if missing:
            raise SystemExit('图标库里没有：' + '、'.join(missing))
        sub = {n: full[n]['body'] for n in sorted(need)}
        os.makedirs(os.path.dirname(SUBSET), exist_ok=True)
        json.dump(sub, open(SUBSET, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(f'抽取了 {len(sub)} 个图形 → {os.path.relpath(SUBSET, ROOT)}')
    return json.load(open(SUBSET, encoding='utf-8'))


def glyph(body, fill, x, y, size):
    """把 512×512 的 game-icons 图形放到 (x, y, size)，用 fill 填充。"""
    body = body.replace('currentColor', fill)
    k = size / 512
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({k:.5f})">{body}</g>'


def icon_svg(iid, theme, gname, kind, arg, G):
    (bg1, bg2), (g1, g2) = THEME[theme]
    defs = f'''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient>
<radialGradient id="hl" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{g1}"/><stop offset="1" stop-color="{g2}"/></linearGradient>
<filter id="sh" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="1.2" dy="1.8" stdDeviation="1.1" flood-color="#000" flood-opacity=".85"/></filter>'''
    parts = [f'<rect width="64" height="64" fill="url(#bg)"/>', '<rect width="64" height="64" fill="url(#hl)"/>']
    body = G[gname]
    if kind == 'split':                                    # 左右两种颜色（切换伤害类型）
        c1, c2 = arg
        defs += f'''<linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset=".5" stop-color="{c1}"/><stop offset=".5" stop-color="{c2}"/></linearGradient>'''
        parts.append(f'<g filter="url(#sh)">{glyph(body, "url(#sp)", 7, 7, 50)}</g>')
    elif kind == 'swap':                                   # 兑换：左上小图 → 右下大图，中间画一个弯箭头
        other, col = arg
        parts.append(f'<g filter="url(#sh)" opacity=".9">{glyph(body, "url(#gl)", 3, 3, 28)}</g>')
        parts.append('<path d="M30 14 Q46 14 46 28" fill="none" stroke="#1d1305" stroke-width="5" stroke-linecap="round"/>'
                     '<path d="M30 14 Q46 14 46 28" fill="none" stroke="#7bdc4a" stroke-width="2.6" stroke-linecap="round"/>'
                     '<path d="M40.5 25 L46 32.5 L51.5 25 Z" fill="#7bdc4a" stroke="#1d1305" stroke-width="1.2" stroke-linejoin="round"/>')
        defs += f'''<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="{col}"/></linearGradient>'''
        parts.append(f'<g filter="url(#sh)">{glyph(G[other], "url(#g2)", 26, 26, 36)}</g>')
    else:
        parts.append(f'<g filter="url(#sh)">{glyph(body, "url(#gl)", 6, 6, 52)}</g>')
        if kind == 'badge':                                # 右下角小徽章
            other, col = arg
            parts.append(f'<circle cx="49" cy="49" r="12.5" fill="#0b0f0b" stroke="{col}" stroke-width="1.6"/>')
            parts.append(glyph(G[other], col, 39.5, 39.5, 19))
    # 斜面边框：上左亮、下右暗
    parts.append('<path d="M0 0H64L61 3H3V61L0 64Z" fill="#fff" opacity=".22"/><path d="M64 64H0L3 61H61V3L64 0Z" fill="#000" opacity=".5"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs>{defs}</defs>{"".join(parts)}</svg>'


def main():
    G = load_glyphs()
    os.makedirs(OUT, exist_ok=True)
    for iid, (theme, gname, kind, arg) in ICONS.items():
        with open(os.path.join(OUT, iid + '.svg'), 'w', encoding='utf-8') as fp:
            fp.write(icon_svg(iid, theme, gname, kind, arg, G))
    used = sorted({g for (_, g, k, a) in ICONS.values()} | {a[0] for (_, _, k, a) in ICONS.values() if k in ('badge', 'swap')})
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8') as fp:
        fp.write('# 图标版权\n\n命令面板图标的图形来自 [game-icons.net](https://game-icons.net)（作者 Lorc、Delapouite 等），'
                 '按 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 使用。'
                 '边框、配色和组合（徽章、兑换箭头、双色）是本项目用 `tools/make_icons.py` 加的。\n\n用到的图形：' + '、'.join(used) + '\n')
    print(f'生成了 {len(ICONS)} 个图标 → {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
