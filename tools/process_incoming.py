"""一条命令处理 art/incoming/ 里的新模型：自动修整 → 生成变体 → 验收 → 出图 → 登记。
  python3 tools/process_incoming.py            # 处理所有放了模型文件的文件夹
  python3 tools/process_incoming.py unit_nban  # 只处理指定文件夹
详见 art/incoming/README.md。
"""
import csv, glob, os, subprocess, sys, tempfile

sys.stdout.reconfigure(line_buffering=True)   # 和 Blender 子进程的输出保持顺序

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender')
INCOMING = os.path.join(ROOT, 'art', 'incoming')
MODELS = os.path.join(ROOT, 'art', 'models')
MODEL_EXT = ('.fbx', '.glb', '.gltf', '.obj', '.blend')

# 试做模型的修整参数（其它模型按 batch1.csv 的类别用默认值）
PRESET = {
    'builder':       dict(height=1.6),
    'hero:剑神':     dict(height=2.8),
    'tower:冰霜塔':  dict(height=2.0, pedestal=True),
    'unit:nban':     dict(height=1.7),
    'unit:nsqt':     dict(height=4.5),
}
# 基础模型完成后自动生成的粗变体：(变体 key, 缩放, 染色, 需要人工补的内容)
VARIANTS = {
    'unit:nban': [('unit:n08Q', 1.1, '1,0.85,0.7', '加橙色铁护肩、短刀换成狼牙棒')],
    'unit:nsqt': [('unit:nsqo', 0.49, '0.8,1,0.8', '加绿色皮甲护腕和胸带（抗性护甲）；毛色保持红色')],
}


# 第 1 批生成清单里的设置（身高、塔座、自动变体）合并进来
GEN_LIST = os.path.join(ROOT, 'art', '第1批生成清单.csv')
if os.path.exists(GEN_LIST):
    for r in csv.DictReader(open(GEN_LIST, encoding='utf-8-sig')):
        if r['方式'] == 'variant':
            VARIANTS.setdefault(r['基础模型'], []).append((r['key'], float(r['缩放']), r['染色'], r['设定']))
        elif r['key'] not in PRESET and r['身高']:
            PRESET[r['key']] = dict(height=float(r['身高']), pedestal=r['类别'] == 'tower')

# 演示批次（塔的档位外观，文件夹如 tower_魔幻塔@L3 → key tower:魔幻塔:3）
DEMO_LIST = os.path.join(ROOT, 'art', '演示批次生成清单.csv')
FOLDER_KEY, EXTRA = {}, {}
if os.path.exists(DEMO_LIST):
    for r in csv.DictReader(open(DEMO_LIST, encoding='utf-8-sig')):
        FOLDER_KEY[r['folder']] = r['key']
        PRESET.setdefault(r['key'], dict(height=float(r['身高']), pedestal=r['类别'] == 'tower'))
        EXTRA[r['key']] = dict(key=r['key'], category=r['类别'], model=f"art/models/{r['folder']}.blend", 名称=r['名称'])


def blender(script, *args):
    cmd = [BLENDER, '-b', '-P', os.path.join(ROOT, 'tools', 'blender', script), '--', *args]
    r = subprocess.run(cmd, capture_output=True, text=True)
    lines = [l for l in r.stdout.splitlines() if l.startswith(('[prep]', '[check]', '[sprites]', '[variant]', '[anim]'))]
    for l in lines:
        if '下一步' not in l and 'Saved:' not in l:
            print('   ', l)
    if r.returncode != 0 or 'Traceback' in r.stderr + r.stdout:
        tail = (r.stderr or r.stdout).strip().splitlines()[-8:]
        print('    ✗ 出错：\n      ' + '\n      '.join(tail))
        return False
    return True


def main():
    batch = {r['key']: r for r in csv.DictReader(open(os.path.join(ROOT, 'tools/blender/batch1.csv'), encoding='utf-8-sig'))}
    cols = list(next(iter(batch.values())).keys())
    for k, e in EXTRA.items():
        batch.setdefault(k, {c: e.get(c, '') for c in cols})
    only = set(sys.argv[1:])
    done = []
    for folder in sorted(glob.glob(os.path.join(INCOMING, '*/'))):
        name = os.path.basename(folder.rstrip('/'))
        if only and name not in only:
            continue
        key = FOLDER_KEY.get(name) or (name.replace('_', ':', 1) if name != 'builder' else 'builder')
        if key not in batch:
            print(f'⚠ 文件夹 {name} 不在第 1 批清单里，跳过'); continue
        models = [f for f in sorted(os.listdir(folder)) if f.lower().endswith(MODEL_EXT) and not f.startswith('_')]
        if not models:
            continue
        cat = batch[key]['category']
        opts = dict(PRESET.get(key, {}))
        opt_file = os.path.join(folder, 'options.txt')
        if os.path.exists(opt_file):
            for line in open(opt_file, encoding='utf-8'):
                k, _, v = line.strip().partition('=')
                if k in ('rotate', 'height', 'tris', 'rename'):
                    opts[k] = v.strip()
        out = os.path.join(MODELS, name + '.blend')
        print(f'\n■ {key}（{batch[key]["名称"]}）← {name}/{models[0]}')
        args = ['--in', os.path.join(folder, models[0]), '--out', out, '--category', cat]
        for k in ('height', 'rotate', 'tris', 'rename'):
            if k in opts:
                args += ['--' + k, str(opts[k])]
        if opts.get('pedestal'):
            args.append('--pedestal')
        anims = os.path.join(folder, 'anims')
        if os.path.isdir(anims) and any(f.lower().endswith(('.fbx', '.glb')) for f in os.listdir(anims)):
            args += ['--anims', anims]
        if not blender('prep_model.py', *args):
            continue
        # 程序化动作：只补缺的动作（Tripo / Mixamo 已有的同名动作会保留）
        blender('procedural_anim.py', '--model', out, '--category', cat)
        done.append(key)
        for vkey, scale, tint, todo in VARIANTS.get(key, []):
            vout = os.path.join(MODELS, vkey.replace(':', '_') + '.blend')
            print(f'  ↳ 变体 {vkey}（{batch[vkey]["名称"]}）：缩放 ×{scale}，染色 {tint}；待人工：{todo}')
            if blender('make_variant.py', '--base', out, '--out', vout, '--scale', str(scale), '--tint', tint):
                done.append(vkey)
    if not done:
        print('art/incoming/ 里还没有模型文件。放好后再运行（见 art/incoming/README.md）。')
        return

    # 验收（整批报告，包含之前已有的模型）
    print('\n■ 自动验收')
    full = os.path.join(tempfile.mkdtemp(), 'all.csv')
    with open(full, 'w', newline='', encoding='utf-8-sig') as fp:
        w = csv.DictWriter(fp, fieldnames=cols); w.writeheader(); w.writerows(batch.values())
    blender('check_model.py', '--batch', full)
    # 只给这次处理的模型重新出图
    print('\n■ 出图')
    tmp = os.path.join(tempfile.mkdtemp(), 'this_run.csv')
    with open(tmp, 'w', newline='', encoding='utf-8-sig') as fp:
        w = csv.DictWriter(fp, fieldnames=cols); w.writeheader()
        for k in done:
            w.writerow(batch[k])
    blender('render_sprites.py', '--batch', tmp)
    print('\n■ 登记')
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'register_sprites.py'), '--webp'])
    print(f'\n完成：{len(done)} 个模型（{"、".join(done)}）。验收报告：art/验收报告.md；预览：h5/sprite_viewer.html')


main()
