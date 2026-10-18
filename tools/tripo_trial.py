"""用 Tripo CLI 生成 5 个试做模型（生成 → 绑骨 → 预设动作），放进 art/incoming/<文件夹>/model.glb。
  python3 tools/tripo_trial.py --dry-run          # 只校验参数，不花积分
  python3 tools/tripo_trial.py                    # 全部生成
  python3 tools/tripo_trial.py unit_nban          # 只生成指定的
  python3 tools/tripo_trial.py --no-anim          # 只生成静态模型（先看画风，最省积分）
断点续跑：每步的任务 ID 记在 art/incoming/<文件夹>/tripo.json，重跑会跳过已完成的步骤，不会重复扣费。
生成完后运行 python3 tools/process_incoming.py 做修整、验收和出图。
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCOMING = os.path.join(ROOT, 'art', 'incoming')

STYLE = ('Stylized low-poly fantasy RTS game character, hand-painted texture, chunky exaggerated proportions, '
         'big hands and broad shoulders, head-to-body ratio about 1:4, bold readable silhouette, saturated colors, '
         'flat diffuse texture with no baked lighting or shadows, full body, A-pose with arms slightly away from the body, '
         'facing front, single character, no ground, no pedestal, clean geometry.')
NEGATIVE = 'realistic, photorealistic, glossy reflections, baked shadows, multiple characters, text, logo, watermark, extra limbs, merged fingers, base, pedestal, background scenery'

# 文件夹 → (描述, 面数上限, 预设动作, 动作改名规则)
TRIALS = {
    'builder': ('A chubby panda craftsman with orange-red fur and flame-shaped fur patterns, wearing a leather tool apron and a wide straw hat, '
                'holding a big wooden mallet in the right hand, a gourd wine bottle hanging at the hip, friendly face, warm orange and gold color scheme.',
                6000, ['preset:idle', 'preset:walk', 'preset:slash'], 'idle:idle,walk:walk,slash:build'),
    'hero_剑神': ('A muscular orc swordmaster with green skin, wearing a red and black demon mask that covers the face, a topknot hairstyle, '
                 'a sleeveless martial robe with a red sash, holding one long curved katana in the right hand, white wind energy swirling around the blade, heroic stance.',
                 12000, ['preset:idle', 'preset:slash', 'preset:jump'], ''),
    'tower_冰霜塔': ('A young frost sorceress in light blue and white robes with a tall pointed hood, holding a staff topped with a glowing ice crystal, '
                   'snowflake decorations, calm pose.',
                   6000, ['preset:idle', 'preset:shoot'], ''),
    'unit_nban': ('A scrawny human bandit thug with a cloth face mask, ragged leather vest with large bright orange cloth armor patches on the shoulders and chest, '
                  'holding a short rusty dagger, hunched sneaky posture.',
                  3000, ['preset:walk', 'preset:fall'], ''),
    'unit_nsqt': ('A huge furry ape-like beast with shaggy red-orange fur, two short horns on the head, enormous long arms reaching the ground, '
                  'small angry eyes, massive shoulders, standing upright on two legs, intimidating boss monster.',
                  12000, ['preset:walk', 'preset:fall'], ''),
}


def tripo(args, dry=False):
    cmd = ['tripo', *args, '--json', '--yes', '--no-open']
    r = subprocess.run(cmd, capture_output=True, text=True)
    out = r.stdout.strip().splitlines()
    data = {}
    for line in reversed(out):
        try:
            data = json.loads(line); break
        except ValueError:
            continue
    if r.returncode != 0:
        msg = data.get('error') or (r.stderr.strip().splitlines() or ['?'])[-1]
        hint = {3: '授权问题，运行 tripo doctor', 4: '积分不足：运行 tripo topup 充值后重跑（已完成的步骤不会重复扣费）',
                5: '提示词触发了内容审核，改写描述后重跑', 6: '任务失败（积分已自动退回），重跑即可换个种子再试',
                7: '网络问题，先 tripo balance 看看是否已扣费再重跑', 9: '请求太频繁，稍后重跑'}.get(r.returncode, '')
        raise RuntimeError(f'tripo 退出码 {r.returncode}：{msg}' + (f'（{hint}）' if hint else ''))
    return data


def save(state, path):
    with open(path, 'w', encoding='utf-8') as fp:
        json.dump(state, fp, ensure_ascii=False, indent=1)


def run_one(folder, dry, no_anim):
    desc, faces, anims, rename = TRIALS[folder]
    d = os.path.join(INCOMING, folder)
    os.makedirs(d, exist_ok=True)
    sp = os.path.join(d, 'tripo.json')
    state = json.load(open(sp, encoding='utf-8')) if os.path.exists(sp) else {}
    print(f'\n■ {folder}')
    gen_args = ['make', f'{STYLE} {desc}', '--model', 'tripo-p1', '-p', f'face_limit={faces}', '-p', f'negative_prompt={NEGATIVE}',
                '--name', 'trial-' + folder.replace('_', '-')]
    if not no_anim:
        gen_args += ['--then', 'rig-check,rig']
    if dry:
        plan = tripo(gen_args + ['--dry-run'])
        print('  校验：', '通过' if plan.get('valid') else '不通过 ' + '；'.join(plan.get('errors', [])))
        print('  步骤：', ' → '.join(s['name'] for s in plan.get('steps', [])), '｜动作：', ' '.join(anims) if not no_anim else '（不做动作）')
        for w in plan.get('warnings', []):
            print('  提醒：', w)
        return
    # 1) 生成（+ 绑骨）
    if 'gen' not in state:
        res = tripo(gen_args + ['-o', os.path.join(d, '_tripo_gen')])
        state['gen'] = res; save(state, sp)
        print(f'  生成完成：{res.get("credits_consumed")} 积分，预览 {res.get("preview")}')
    else:
        print('  生成：已完成（跳过）')
    src = state['gen']
    # 2) 预设动作（需要绑骨任务）
    # 注意：2026-10 实测，P1 模型绑骨后调用 retarget 一律返回 1004（参数无效），v2.5 / v1.0 两种动作名都一样；
    # 原因待 Tripo 确认。失败会自动退款，这里失败时退回到"只用绑好骨的静态模型"，不中断流程。
    if not no_anim and 'anim' not in state:
        rig_task = src['task_id']                    # 链式任务的最后一步就是 rig
        try:
            res = tripo(['anim', 'retarget', rig_task, '--animation', *anims, '--animate-in-place', '--out-format', 'glb',
                         '-o', os.path.join(d, '_tripo_anim')])
            state['anim'] = res; save(state, sp)
            print(f'  动作完成：{res.get("credits_consumed")} 积分（{" ".join(anims)}）')
        except RuntimeError as ex:
            print(f'  ⚠ 套动作失败（{ex}），先用绑好骨的静态模型')
            no_anim = True
    final = state.get('anim') if not no_anim else src
    model_file = final.get('model_file') or next((os.path.join(final['output_dir'], f) for f in final.get('files', [])
                                                if f.lower().endswith(('.glb', '.fbx'))), None)
    if not model_file or not os.path.exists(model_file):
        raise RuntimeError('没找到下载的模型文件：' + json.dumps(final, ensure_ascii=False)[:300])
    ext = os.path.splitext(model_file)[1]
    shutil.copy(model_file, os.path.join(d, 'model' + ext))
    if final.get('preview') and os.path.exists(final['preview']):
        shutil.copy(final['preview'], os.path.join(d, '_preview.png'))
    with open(os.path.join(d, 'options.txt'), 'w', encoding='utf-8') as fp:
        fp.write('rotate=-90\n')                     # Tripo 绑骨输出面朝 +X，转 -90° 才是规范的 -Y
        if rename:
            fp.write(f'rename={rename}\n')
    print(f'  → {os.path.relpath(os.path.join(d, "model" + ext), ROOT)}')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry, no_anim = '--dry-run' in sys.argv, '--no-anim' in sys.argv
    if not dry:
        bal = tripo(['balance'])
        print(f'Tripo 余额：{bal.get("balance")} 积分（冻结 {bal.get("frozen")}）')
    failed = []
    for folder in (args or TRIALS):
        try:
            run_one(folder, dry, no_anim)
        except RuntimeError as ex:
            print('  ✗', ex); failed.append(folder)
            if '积分不足' in str(ex):
                break
    if not dry:
        print(f'\n完成，失败 {len(failed)} 个：{"、".join(failed) or "无"}。下一步：python3 tools/process_incoming.py')


if __name__ == '__main__':
    main()
