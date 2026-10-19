# Hive Workshop 模型（个人测试用）

从 [Hive Workshop](https://www.hiveworkshop.com) 下载的魔兽争霸 3 经典版模型（.mdx v800 + .blp 贴图），用来跑通"war3 模型 → 精灵表"的流程。仅个人测试使用；作者要求注明出处。

| 游戏里的怪 | 模型 | 作者 | 来源 | 导入缩放 |
|---|---|---|---|---|
| 大蜘蛛 `unit:n090` | Giant Spider（Giant Spider Pack） | HerrDave（合作：Cuore、konvan5） | [链接](https://www.hiveworkshop.com/threads/giant-spider-pack.309237/) | 0.52 |
| 黑蜘蛛 `unit:nspb` | Shelob（Giant Spider Pack） | 同上 | 同上 | 0.4 |
| 敏捷的蜘蛛 `unit:nssp` | Wood Spider（无阴影版 polybetes_noshadow） | mechanix | [链接](https://www.hiveworkshop.com/threads/wood-spider.373802/) | 1.0 |
| 暗黑的女巫 `unit:h07M`（临时替身） | Bandit Assassin (Re-Classic) | Footman16、General Frank | [链接](https://www.hiveworkshop.com/threads/bandit-assassin-re-classic.347657/) | 1.3 |

Giant Spider Pack 原模型比魔兽自带的蜘蛛大很多，缩放是对照游戏里的森林蜘蛛调的（黑蜘蛛 ≈ 森林蜘蛛，大蜘蛛按单位数据再 ×1.3）。

## 转换流程
```bash
# 1. mdx → .blend（网格、蒙皮骨架、贴图、idle/walk/attack/death/spell 动作）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/import_mdx.py -- --mdx <模型.mdx> --out art/models/hive/unit_<id>.blend --scale <缩放>
# 2. 出 8 方向精灵表
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_sprites.py -- --model art/models/hive/unit_<id>.blend --key unit:<id> --category monster
# 3. 登记给游戏
python3 tools/register_sprites.py
```
贴图解码在 `tools/blp.py`（BLP1 的 JPEG / 调色板两种格式，不依赖 Pillow）。

## 第 2 批：补全所有缺图的怪物和英雄（2026-10-18）
按 `下载计划.md` 从 Hive 下载了 110 个模型包（`h<编号>/`，编号就是 `https://www.hiveworkshop.com/threads/<编号>/`，作者和出处见各包里的 readme.html），
用 `tools/hive_batch.py` 一次性转换、出图、登记，结果在 `batch_report.tsv`。

- 覆盖：游戏里 204 个怪物 ID 全部有精灵图（124 种模型 + 同模型的变体共用），外加枪神、邪冰、火魂 3 个英雄。
- 替代说明见 `下载计划.md` 的"类型"列；后来又改了 3 处：邪冰 → Jaina Proudmoore (HotS)（原来那个包只有图标）、
  维修工 → Plugger Spazzring（同上）、强盗领主 → 复用强壮的强盗的图（Hive 模型缺 16 张贴图）。
- 已知问题：掠夺者 / 狼骑士的狼没有贴图（灰色，原贴图是游戏自带文件）；蓝龙（Malygos）模型没有动画，是静止的。
- 精灵表用 WebP（`tools/blender/png2webp.py` 转换），出图时生成的 PNG 可以删掉，游戏不用。

重新跑某一种：`python3 tools/hive_batch.py --force ghoul`，然后 `Blender -b -P tools/blender/png2webp.py`、`python3 tools/register_sprites.py`。

## 第 3 批：补全塔 + 去掉重复模型（2026-10-19）
方案见 `下载计划_第3批.md`，转换命令：`python3 tools/hive_batch.py --towers`（塔）、`python3 tools/hive_batch.py --variants`（变体）。
- 塔：28 种全部有图。新补的 23 种只有一个外观（没有按等级换外观），用单位当塔的放在标准塔座上。
  方案里有 3 个换了：通灵塔 → Icecrown Citadel、减速光环 → Silvermoon City Fountain、巨箭塔 → Tower Redoran
  （原选的 Ancient Ziggurat 其实是光束特效，Altar of Stars 和 WC2 塔依赖游戏自带贴图，页面上的"贴图数"主要是图标）。
- 跨类型共用模型：9 处里能找到不同模型的都换了；火焰 / 风之熊猫、骷髅弓箭手、半人马弓箭手没找到别的模型，用原模型换色。
- 同类型变体：72 个全部有自己的图，10 个用下载包自带的配色，其余在 Blender 里换色相（保留明暗）。
  很暗的模型（陈·风暴烈酒、两辆攻城车）换色后区别不大。
- 现在没有任何两个单位共用同一张精灵图。
