import re, json, sys
src = open('extract/war3map.j', encoding='utf-8', errors='replace').read()
units = json.load(open('json/units.json'))
funcs = re.split(r'\nfunction ', src)
def cc(h): return bytes.fromhex(h).decode('latin1')
rows = []
for f in funcs:
    m = re.search(r'"\|c008000FF(第.{1,6}波开始|BOSS波开始)\|r"', f)
    if not m: continue
    name = f.split(' ',1)[0]
    labels = re.findall(r'set C4="([^"]*)"', f)
    ids = [cc(h) for h in re.findall(r'set Ul=\$([0-9A-F]{8})', f)]
    spawners = sorted(set(re.findall(r'call EnableTrigger\((R[TUV])\)', f)))
    boss = sorted(set(cc(h) for h in re.findall(r'CreateNUnitsAtLoc\(\d+,\$([0-9A-F]{8}),Player\(11\)', f)))
    rows.append(dict(fn=name, wave=m.group(1), labels=labels, monsters=ids, spawners=spawners, direct=boss))
for r in rows:
    def desc(i):
        u = units.get(i, {})
        return f"{i}:{u.get('Name')}(HP{u.get('HP')},armor{u.get('def')},{u.get('defType')},spd{u.get('spd')},bounty{u.get('bountyplus')})"
    print(r['fn'], r['wave'], r['labels'], r['spawners'])
    for i in dict.fromkeys(r['monsters'] + r['direct']): print('    ', desc(i))
json.dump(rows, open('json/waves_raw.json','w'), ensure_ascii=False, indent=1)
