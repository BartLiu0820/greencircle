import re, json
src = open('extract/war3map.j', encoding='utf-8', errors='replace').read()
rects = {m[0]: tuple(map(int, m[1:])) for m in re.findall(r'set (\w+)=Rect\((-?\d+),(-?\d+),(-?\d+),(-?\d+)\)', src)}
funcs = {m.group(1): m.group(2) for m in re.finditer(r'\nfunction (\w+) takes nothing returns \w+\n(.*?)\nendfunction', src, re.S)}
edges = {}
for name, body in funcs.items():
    for trig, reg in re.findall(r'call nO\((\w+),(\w+)\)', body):
        acts = re.findall(r'TriggerAddAction\(' + trig + r',function (\w+)\)', body)
        for a in acts:
            ab = funcs.get(a, '')
            if 'GetEnteringUnit' not in ab: continue
            tg = re.findall(r'GetRectCenter\((\w+)\)', ab)
            if tg: edges.setdefault(reg, set()).update(t for t in tg if t in rects)
spawns = ['I','p','m','o','r','q','n','u']
out = {'rects': {k: rects[k] for k in rects}, 'edges': {k: sorted(v) for k, v in edges.items()}, 'spawns': spawns}
json.dump(out, open('json/path.json', 'w'), indent=1)
for k, v in sorted(edges.items()): print(k, rects.get(k), '->', sorted(v))
