"""从 8.6.6 的标注版脚本（analysis/raw/war3map.annotated.j）还原每一波的出怪：
把每个波次函数的所有执行路径（GetRandomInt 分支）连同概率枚举出来，写成 h5/waves.js。

原图的波次是一条触发器链：第 N 波的函数在第 N-1 波开始时就被执行，先定下第 N 波的提示词（"多 物理"等，
倒计时期间就显示，相当于预告），等 Dm 秒后显示"第 N 波开始"，再设置出怪单位 Ul、打开出怪器。
有的变量（DC / DW / HI）在一个函数里定、在后面的函数里用，所以每条路径记录"进入时要求的变量"和"结束时的变量"。

用法：python3 tools/wave_rolls.py
"""
import re, json, os, sys
from fractions import Fraction

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'analysis/raw/war3map.annotated.j'), encoding='utf-8').read()
FUNCS = {f.split(' ', 1)[0]: f for f in re.split(r'\nfunction ', src)}
TRIG = {}                                         # 触发器变量 → 动作函数
for f in FUNCS.values():
    for t, fn in re.findall(r'TriggerAddAction\((\w+),function (\w+)\)', f): TRIG[t] = fn
SPAWNER = {'RT': '多', 'RU': '中', 'RV': '少'}    # 0.25 秒 ×62 / 0.6 秒 ×32 / 1 秒 ×15（周期见 TriggerRegisterTimerEventPeriodic）
GATES = ['I', 'p', 'm', 'o', 'r', 'q', 'n', 'u']  # 8 个出怪口（出怪器 wv 依次在这些区域刷怪）；单人只用第 1 个
ONE_OF = ['K', 'X', 'i', 'N', 'Q', 'U', 'e', 'a']  # BOSS 波"全图随机一个出怪口刷 1 只"用的区域：单人一律刷在自己的口
VARS = ('DC', 'DW', 'HI', 'IR', 'IQ')
MARK = re.compile(r'"\|c008000FF(第.{1,6}波开始|BOSS波开始|熊猫Boss波开始|30秒后最终Boss波——龙 开启)\|r"')
UNKNOWN = set()


def unit(tok):
    m = re.match(r"'(\w{4})'", tok)
    return m.group(1) if m else None


def parse(body):
    """把函数体解析成语句树：('if', cond, then, else) / ('loop', body) / ('s', line)"""
    lines = [l.strip() for l in body.splitlines()[1:]]
    pos = 0

    def block(stop):
        nonlocal pos
        out = []
        while pos < len(lines):
            l = lines[pos]; pos += 1
            if l in stop: return out, l
            m = re.match(r'if (.*) then$', l)
            if m:
                th, end = block(('else', 'endif'))
                el = []
                if end == 'else': el, _ = block(('endif',))
                out.append(('if', m.group(1), th, el)); continue
            if l == 'loop':
                b, _ = block(('endloop',)); out.append(('loop', b)); continue
            out.append(('s', l))
        return out, None
    return block(('endfunction',))[0]


def cond(c, st):
    """返回 [(概率, 是否成立)]"""
    c = re.sub(r'/\*.*?\*/', '', c).strip()
    m = re.fullmatch(r'GetRandomInt\((\d+),(\d+)\)(==|<=|>=|<|>)(\d+)', c)
    if m:
        a, b, op, v = int(m[1]), int(m[2]), m[3], int(m[4])
        n = sum(1 for x in range(a, b + 1) if eval(f'{x}{op if op != "==" else "=="}{v}'))
        p = Fraction(n, b - a + 1)
        return [(p, True), (1 - p, False)]
    m = re.fullmatch(r'(\w+)(==|<=|>=|<|>)(\d+)', c)
    if m and m[1] in VARS:
        if m[1] not in st['vars']: return 'need', m[1]
        return [(Fraction(1), eval(f'{st["vars"][m[1]]}{m[2]}{m[3]}'))]
    if c in ('Cn==0', 'true'): return [(Fraction(1), c == 'true')]
    if c.startswith('CountUnitsInGroup('): return [(Fraction(1), True)]       # BOSS 波限时击杀的判定：按"杀完了"走，失败由游戏里另外判
    if c.startswith('EG['): return [(Fraction(1), c.startswith('EG[1]>'))]    # 飞艇击杀数比较：单人就是红色玩家最多
    if c.startswith('H9[') or c.startswith('ox('): return [(Fraction(1), False)]   # 平台成就 / 荣誉
    UNKNOWN.add(c[:100])
    return [(Fraction(1), False)]


def run(stmts, paths, ctx):
    for s in stmts:
        nxt = []
        for p, st in paths:
            if s[0] == 'loop':                    # 8 个出怪口的循环：单人只走第 1 个口
                st = dict(st, loopgate=True); r = run(s[1], [(p, st)], ctx)
                nxt += [(q, dict(t, loopgate=False)) for q, t in r]
            elif s[0] == 'if':
                c = cond(s[1], st)
                if c and c[0] == 'need':          # 进入时的变量还不知道：按可能取值分叉，记成"进入要求"
                    var = c[1]
                    for v in ctx['domain'][var]:
                        t = dict(st, vars={**st['vars'], var: v}, req={**st['req'], var: v})
                        nxt += run([s], [(p, t)], ctx)
                    continue
                for q, ok in c:
                    if q: nxt += run(s[2] if ok else s[3], [(p * q, st)], ctx)
            else: nxt.append((p, step(s[1], st, ctx)))
        paths = merge(nxt)
    return paths


def step(l, st, ctx):
    st = dict(st)
    m = re.match(r'call (?:nB|TriggerSleepAction|PolledWait)\((.*)\)$', l)
    if m:
        if 'Dm' in m[1] and st['mark'] is None: st['dm'] = True       # 波次间隔（单人模式里由游戏的模式决定）
        a = m[1].replace('Dm', '0')
        try: st['t'] = st['t'] + float(eval(a))
        except Exception: UNKNOWN.add('wait ' + m[1])
        return st
    if MARK.search(l): return dict(st, mark=st['t'], label=MARK.search(l)[1])
    m = re.match(r'set C4="([^"]*)"', l)
    if m:
        k = 'hint' if st['mark'] is None else 'nextHint'
        return dict(st, **{k: m[1]})
    m = re.match(r'set (DC|DW|HI|IR|IQ)=(.*)$', l)
    if m:
        v = m[2]
        r = re.fullmatch(r'GetRandomInt\((\d+),(\d+)\)', v)
        if r: return dict(st, rnd=(m[1], int(r[1]), int(r[2])))   # 交给 merge 前展开
        return dict(st, vars={**st['vars'], m[1]: int(v)})
    m = re.match(r"set Ul='(\w{4})'", l)
    if m: return ev(st, ['sc', m[1]])
    m = re.match(r'call EnableTrigger\((R[TUV])\)', l)
    if m: return ev(st, ['sp', SPAWNER[m[1]]])
    m = re.match(r'set (\w+(?:\[\w+\])?)=Get(?:RandomLoc|RectCenter)\w*\((\w+)\)', l)
    if m: return dict(st, locs={**st['locs'], m[1]: m[2]})
    m = re.match(r"call CreateNUnitsAtLoc\((\d+),'(\w{4})'[^,]*,Player\(11\),([^,]+),", l)
    if m:
        n, uid, loc = int(m[1]), m[2], m[3]
        if loc == 'Uk[GetForLoopIndexA()]' or loc == 'Sb[GetForLoopIndexA()]': mine = st.get('loopgate', False)
        elif loc.startswith('Uk[GetRandomInt('): mine = loc.startswith('Uk[GetRandomInt(1,')   # 前 4 个口随机一个、后 4 个口随机一个：单人算 1 只
        elif loc in ('Qr', 'Oe') and loc not in st['locs']: mine = True      # 沿用上一个函数里的位置：全图只刷 1 只，单人就刷在自己的口
        else:
            rect = st['locs'].get(loc) or ('I' if loc in ('Uk[1]', 'Sb[1]') else None)
            if rect is None and loc in ('Qr', 'Oe'): rect = st['locs'].get(loc)
            mine = rect in ('I', 'K') or rect in ONE_OF
            if rect is None: UNKNOWN.add('loc ' + loc); mine = False
        return ev(st, ['mk', uid, n]) if mine else st
    m = re.match(r"call UnitApplyTimedLifeBJ\(([\d.]+),", l)
    if m and st['ev'] and st['ev'][-1][1][0] == 'mk':           # 给刚刷出的单位限时（如 48 波的魔王 60 秒）
        t, e = st['ev'][-1]
        return dict(st, ev=st['ev'][:-1] + ((t, e[:3] + [float(m[1])]),))
    m = re.match(r'call (?:Conditional)?TriggerExecute\((\w+)\)', l)
    if m and TRIG.get(m[1]) in ctx['chain']:
        return dict(st, next=TRIG[m[1]], nextAt=round(st['t'] - st['mark'], 2) if st['mark'] is not None else 0)
    return st


def ev(st, e):
    return dict(st, ev=st['ev'] + ((round(st['t'] - st['mark'], 2) if st['mark'] is not None else 0, e),))


def merge(paths):
    out = {}
    for p, st in paths:
        if 'rnd' in st and st['rnd']:            # set X=GetRandomInt(a,b)：展开成 b-a+1 条路径
            var, a, b = st['rnd']
            for v in range(a, b + 1):
                t = dict(st, rnd=None, vars={**st['vars'], var: v})
                k = key(t); out[k] = (out[k][0] + p / (b - a + 1), t) if k in out else (p / (b - a + 1), t)
            continue
        k = key(st); out[k] = (out[k][0] + p, st) if k in out else (p, st)
    return list(out.values())


def key(st):
    return json.dumps(st, sort_keys=True, default=str)


# 波次链：从第 1 波的函数（含"第一波开始"）开始，顺着 TriggerExecute 找
chain = [n for n, f in FUNCS.items() if MARK.search(f)]
ctx = {'chain': set(chain), 'domain': {'DC': [0, 1, 2, 3, 4], 'DW': [0, 1, 2], 'HI': [1, 2, 3, 4], 'IR': [1, 2, 3, 4], 'IQ': [1, 2, 3, 4]}}
out = {}
for name in chain:
    st0 = dict(t=0.0, mark=None, label=None, hint=None, nextHint=None, vars={}, req={}, ev=(), locs={'Uk[1]': 'I'}, next=None, nextAt=0, dm=False, rnd=None)
    res = run(parse(FUNCS[name]), [(Fraction(1), st0)], ctx)
    rows = []
    for p, st in res:
        rows.append(dict(p=float(p), req=st['req'], hint=st['hint'], nextHint=st['nextHint'], set=st['vars'],
                         ev=[[t, *e] for t, e in st['ev']], next=st['next'], nextAt=st['nextAt'], label=st['label'], pre=st['mark'], dm=st['dm']))
    # 进入要求只在用到的变量上不同：同一进入要求下的概率加起来应为 1
    out[name] = rows

# 按链的顺序编号（第几波）
first = next(n for n in chain if '第一波开始' in FUNCS[n])
order, seen, frontier = [], set(), [first]
while frontier:
    n = frontier.pop(0)
    if n in seen: continue
    seen.add(n); order.append(n)
    frontier += sorted({r['next'] for r in out[n] if r['next']})
wave_of = {}
for n in order:
    lab = out[n][0]['label']
    m = re.match(r'第(.+)波开始', lab or '')
    CN = '零一二三四五六七八九'
    def cn2i(s):
        if s.startswith('十'): s = '一' + s
        if '十' in s:
            a, b = s.split('十'); return CN.index(a) * 10 + (CN.index(b) if b else 0)
        return CN.index(s)
    if m: wave_of[n] = cn2i(m[1])
    elif lab == '熊猫Boss波开始': wave_of[n] = 48
for n in order:
    if n in wave_of: continue
    prev = [k for k in order if any(r['next'] == n for r in out[k])]
    wave_of[n] = wave_of[prev[0]] + 1

data = {'start': first, 'fns': {}}
for n in order:
    rows = out[n]
    data['fns'][n] = dict(wave=wave_of[n], pre=rows[0]['pre'], dm=rows[0]['dm'], label=rows[0]['label'],
                          rows=[{k: v for k, v in r.items() if k not in ('pre', 'dm', 'label')} for r in rows])

# 出场单位补进 h5/data.js 的 units（gen_data.py 只收了提示词里的候选怪）：最终波、飞艇波等脚本里直接刷的单位
U = json.load(open(os.path.join(ROOT, 'analysis/raw/units_all.json'), encoding='utf-8'))
def fl(v, k, d=0.0):
    try: return float(v.get(k))
    except (TypeError, ValueError): return d
ids = {e[2] for rows in out.values() for r in rows for e in r['ev'] if e[1] in ('sc', 'mk')}
ids |= {'ncen', 'ncim', 'ncnk', 'ncks', 'n07R', 'n07S', 'n07T', 'n07U',            # 30 波飞艇（每秒随机换一种）
        'Ntin', 'Npbm', 'Nalc', 'Nfir', 'nbzd', 'nrdr', 'nrdk', 'ngrd', 'nkob', 'nkot', 'nkog', 'ngst',
        'Udea', 'nndr', 'njga', 'n07W', 'n07V'}                                     # 最终波
dpath = os.path.join(ROOT, 'h5/data.js')
head, body = open(dpath, encoding='utf-8').read().split('window.GAME_DATA = ', 1)
D = json.loads(body.rstrip().rstrip(';'))
added = []
for i in sorted(ids):
    if i in D['units'] or i not in U: continue
    v = U[i]
    D['units'][i] = dict(id=i, name=v.get('Name'), hp=fl(v, 'HP', 1), armor=fl(v, 'def'), armorType=v.get('defType') or 'none',
                         speed=fl(v, 'spd'), bounty=fl(v, 'bountyplus') + fl(v, 'bountydice') * (fl(v, 'bountysides') + 1) / 2, regen=fl(v, 'regenHP'))
    added.append(i)
open(dpath, 'w', encoding='utf-8').write(head + 'window.GAME_DATA = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('data.js 补进单位：', ' '.join(f"{i}:{D['units'][i]['name']}" for i in added) or '无')
js = '// 自动生成：python3 tools/wave_rolls.py（来源 analysis/raw/war3map.annotated.j）\nwindow.WAVE_ROLLS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(ROOT, 'h5/waves.js'), 'w', encoding='utf-8').write(js)
for n in order:
    print(wave_of[n], n, len(out[n]), 'next', sorted({str(r['next']) for r in out[n]}))
if UNKNOWN: print('未识别：', *sorted(UNKNOWN), sep='\n  ')
