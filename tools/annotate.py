import re, json, sys
src, out = sys.argv[1], sys.argv[2]
names = {}
for f in ('units', 'abilities', 'items', 'upgrades'):
    for k, v in json.load(open(f'json/{f}.json')).items():
        n = v.get('Name') or v.get('Propernames')
        if n: names[k] = re.sub(r'\|c[0-9a-fA-F]{8}|\|r', '', n)[:24]
s = open(src, encoding='utf-8', errors='replace').read()
def rep(m):
    try: cc = bytes.fromhex(m.group(1)).decode('ascii')
    except: return m.group(0)
    if not re.fullmatch(r'[A-Za-z0-9]{4}', cc): return m.group(0)
    return f"'{cc}'" + (f"/*{names[cc]}*/" if cc in names else '')
s = re.sub(r'\$([0-9A-F]{8})\b', rep, s)
s = re.sub(r'\n[^\n]*(SaveInteger\(Bh,GetHandleId\(GetTriggeringTrigger\(\)\)|LoadInteger\(Bh,GetHandleId\(GetTriggeringTrigger|set Q0=Q0\+3|FlushChildHashtable\(Bh,GetHandleId\(GetTriggeringTrigger)[^\n]*', '', s)
open(out, 'w').write(s)
print(len(s))
