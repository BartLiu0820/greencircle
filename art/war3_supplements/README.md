# 原版资源补充包（历史档案）

`war3-assets.zip`（项目根目录，约 700 MB）是最初拿到的魔兽争霸 3 原版资源，但不完整：缺了一批冰封王座和补丁里的模型、投射物、图标、音效。
后来陆续收到的补充包都登记在这里，统一去重、合并成一个包，再装进 `art/war3_raw/tft/` 供各导出工具使用。资源版权归暴雪，压缩包本身不入库。

| 路径 | 内容 | 入库 |
|---|---|---|
| `history.json` | 每个补充包的登记：文件名、收到日期、下载地址、sha256、状态（`active` 参与合并 / `superseded` 已被新版包含）、内容摘要；地图里要取的文件；仍然缺的东西 | 是 |
| `manifests/<包>.json` | 每个包里每个资源文件的 sha256 | 是 |
| `manifests/merged.json` | 合并包的文件清单（每个文件来自哪个包），以及去重 / 冲突的明细 | 是 |
| `packages/` | 收到的原始压缩包（按 `history.json` 的文件名存放） | 否 |
| `war3-supplement.zip` | 合并结果 | 否 |

## 用法
```bash
python3 tools/war3_supplements.py              # 校验 packages/ 里的包（sha256 要和 history.json 一致）→ 合并 → 写 manifests/
python3 tools/war3_supplements.py --install    # 再装进 art/war3_raw/tft/（只补新文件，不覆盖已有的）
python3 tools/war3_supplements.py --prune      # 删掉已被新版完全包含的旧包（登记和清单保留）
```
收到新的补充包时：放进 `packages/`（文件名带版本号），在 `history.json` 的 `packages` 末尾登记一条，旧版被完全包含的改成 `superseded`，
然后跑 `--install`，再按 `art/war3_raw/README.md` 重跑受影响的导出工具。

## 合并规则
- 只收 MPQ 原路径下的资源（`.mdx` / `.blp` / `.wav`），包里的说明文件不收（摘要记进 `history.json`）。
- 和 `war3-assets.zip` 同路径、内容一样的去掉（重复）；内容不一样的也去掉、保留基础包的（冲突，不动已在用的资源）。
- 几个补充包里都有的同一路径，按登记顺序后面的覆盖前面的（内容不同时记为冲突）。
- 原图地图（`.w3x`）自己导入的文件也放进合并包，来源记为地图。

## 历史
| 日期 | 包 | 状态 | 内容 | 结果 |
|---|---|---|---|---|
| 2026-10-20 | `war3-assets.zip`（基础包） | 基础 | roc + tft，约 3300 个模型 | 缺复活节兔子、浣熊、精灵、炎魔、火焰领主、炼金术士、修补匠及机器人、4 辆车、6 种投射物、8 个图标、5 种粒子模型等 |
| 2026-11-01 | `war3-missing-originals_v1.zip` | active | 35 MDX + 102 BLP + 100 WAV | 上面列的全部补齐；52 个和基础包完全相同（去重），`Textures/HeroLich.blp`、`Textures/clouds_anim1_bw.blp` 与基础包不同（保留基础包的） |
| 2026-11-01 | `war3-missing-skill-icons_v1.zip` | superseded | 18 BLP：焚烧、工程学升级、艾露恩的祝福、点金术（含被动 / 禁用态） | 被 v2 完全包含，原包已删，登记和清单保留 |
| 2026-11-01 | `war3-missing-skill-icons_v2.zip` | active | v1 + 酸性炸弹 `BTNAcidBomb` / `DISBTNAcidBomb`，共 20 BLP | 技能图标全部补齐 |
| 2026-11-01 | 原图地图 `000綠色循環圈外傳8.6.6.w3x` | 地图导入 | `ReplaceableTextures/CommandButtons/btnJSFB.blp`（技能 A01H） | 原图引用的 1301 个资源路径里，只有这一个是地图自己导入、两份资源包都没有的 |

合并包现为 204 个文件（补充资源 183 + 技能图标 20 + 地图导入 1），补充包之间没有冲突。

## 仍然缺的
- `TerrainArt/Weather.slk`（天气参数表）：出怪口的"光芒"天气（`LRaa`）贴图有了，粒子的数量、角度、大小、淡入淡出是按原版画面估的。
