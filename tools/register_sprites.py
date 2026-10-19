"""把 h5/assets/sprites/ 里出好的精灵表登记给游戏（生成 h5/assets/sprites.js）。
  python3 tools/register_sprites.py           # 登记
  python3 tools/register_sprites.py --webp    # 同时把 PNG 转成 WebP（体积小很多，透明度保留）
"""
import glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.path.join(ROOT, 'h5', 'assets', 'sprites')
webp = '--webp' in sys.argv

sheets, total = {}, 0
for meta_path in sorted(glob.glob(os.path.join(SP, '*.json'))):
    meta = json.load(open(meta_path, encoding='utf-8'))
    png = os.path.join(ROOT, 'h5', 'assets', meta['src'])
    if webp and png.endswith('.png') and os.path.exists(png):
        from PIL import Image
        out = png[:-4] + '.webp'
        Image.open(png).save(out, 'WEBP', quality=90, method=6)
        meta['src'] = meta['src'][:-4] + '.webp'
    elif not webp and os.path.exists(png[:-4] + '.webp') and (not os.path.exists(png) or os.path.getmtime(png[:-4] + '.webp') >= os.path.getmtime(png)):   # 已有不旧于 PNG 的 WebP 就继续用
        meta['src'] = meta['src'][:-4] + '.webp'
    f = os.path.join(ROOT, 'h5', 'assets', meta['src'])
    if not os.path.exists(f):
        print('跳过（缺图片）:', meta['key']); continue
    total += os.path.getsize(f)
    sheets[meta['key']] = meta

with open(os.path.join(ROOT, 'h5', 'assets', 'sprites.js'), 'w', encoding='utf-8') as fp:
    fp.write('// 自动生成：tools/register_sprites.py —— 不要手改\n')
    fp.write('window.SPRITE_SHEETS = ' + json.dumps(sheets, ensure_ascii=False, indent=1) + ';\n')
print(f'登记了 {len(sheets)} 张精灵表，共 {total / 1024 / 1024:.1f} MB：', ', '.join(sheets))
