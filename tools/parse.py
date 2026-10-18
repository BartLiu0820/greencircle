"""Parse WC3 SLK + profile txt files into merged per-object dicts (JSON)."""
import json, os, re, sys

EX = sys.argv[1]
OUT = sys.argv[2]

def dec(b):
    for enc in ('utf-8', 'gb18030'):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode('utf-8', 'replace')

def slk(path):
    rows, cur_y = {}, 0
    for line in dec(open(path, 'rb').read()).splitlines():
        if not line.startswith('C;'):
            continue
        x = None
        val = None
        parts = line.split(';')
        for p in parts[1:]:
            if p.startswith('X'): x = int(p[1:])
            elif p.startswith('Y'): cur_y = int(p[1:])
            elif p.startswith('K'):
                val = ';'.join(parts[parts.index(p):])[1:]
                break
        if x is None or val is None:
            continue
        if val.startswith('"') and val.endswith('"'):
            val = val[1:-1]
        rows.setdefault(cur_y, {})[x] = val
    head = rows.pop(1)
    out = {}
    for y, r in rows.items():
        d = {head[x]: v for x, v in r.items() if x in head}
        key = d.get(head[1])
        if key:
            out[key] = d
    return out

def ini(path):
    out, cur = {}, None
    for line in dec(open(path, 'rb').read()).splitlines():
        line = line.strip()
        if line.startswith('[') and line.endswith(']'):
            cur = out.setdefault(line[1:-1], {})
        elif cur is not None and '=' in line and not line.startswith('//'):
            k, v = line.split('=', 1)
            cur[k] = v
    return out

def merge(*dicts):
    res = {}
    for d in dicts:
        for k, v in d.items():
            res.setdefault(k, {}).update(v)
    return res

p = lambda n: os.path.join(EX, n)
units = merge(*(slk(p('Units_%s.slk' % n)) for n in ('UnitData', 'UnitBalance', 'UnitUI', 'UnitAbilities', 'UnitWeapons')),
              ini(p('Units_CampaignUnitStrings.txt')))
items = merge(slk(p('Units_ItemData.slk')), ini(p('Units_ItemStrings.txt')))
abil = merge(slk(p('Units_AbilityData.slk')), ini(p('Units_CampaignAbilityStrings.txt')),
             ini(p('Units_CommonAbilityStrings.txt')), ini(p('Units_ItemAbilityStrings.txt')))
buffs = slk(p('Units_AbilityBuffData.slk'))
upg = merge(slk(p('Units_UpgradeData.slk')), ini(p('Units_CampaignUpgradeStrings.txt')))
os.makedirs(OUT, exist_ok=True)
for name, d in (('units', units), ('items', items), ('abilities', abil), ('upgrades', upg), ('buffs', buffs)):
    json.dump(d, open(os.path.join(OUT, name + '.json'), 'w'), ensure_ascii=False, indent=1)
    print(name, len(d))
