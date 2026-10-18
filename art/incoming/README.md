# 收件目录：AI 生成的试做模型放这里

每个模型一个文件夹（已建好），文件夹名不要改：

| 文件夹 | 模型 | 类别 | 目标高度 |
|---|---|---|---|
| `builder/` | T1 循环圈守卫者 | builder | 1.6 m |
| `hero_剑神/` | T2 剑神 | hero | 2.8 m |
| `tower_冰霜塔/` | T3 冰霜塔（只放角色，塔座自动加） | tower | 角色 2.0 m |
| `unit_nban/` | T4 强盗（变体"强壮的强盗"自动生成） | monster | 1.7 m |
| `unit_nsqt/` | T5 大红牛（变体"小红牛"自动生成） | boss | 4.5 m |

## 每个文件夹里放什么
```
unit_nban/
  model.fbx          ← 模型：.fbx / .glb / .gltf / .obj 都行，文件名随意（取第一个模型文件）
  anims/             ← 动作（可选，但出图需要）：
    walk.fbx            文件名带 walk / attack / death / idle / spell / build 即可，
    death.fbx           Mixamo 原名（Walking.fbx、Dying.fbx …）也能识别
  options.txt        ← 可选：rotate=90（正面没朝 -Y 时）、height=1.8（改目标高度）
```

- **用 Mixamo 时**：模型下载 FBX（With Skin），动作下载 FBX（Without Skin，行走勾 In Place）。模型和动作都用 FBX，骨骼方向才一致。
- **只有 AI 生成的静态模型、还没绑骨**：也可以先放进来，脚本会照样修整、验收并出一张静态图，先看外形和画风。

## 放好之后
运行（或者让 Claude 帮你跑）：
```bash
python3 tools/process_incoming.py
```
结果：
- 修整后的模型 → `art/models/`
- 验收报告 → `art/验收报告.md`
- 精灵表 → `h5/assets/sprites/`（已登记，刷新游戏或 `h5/sprite_viewer.html` 就能看到）
