# 魔兽争霸 3 原版资源（本地用，不入库）

`war3-assets.zip`（项目根目录）是从魔兽争霸 3 里导出的原版资源：`roc/`（混乱之治）和 `tft/`（冰封王座，同路径时覆盖 roc）。
资源版权归暴雪，只在本地用来复刻原图的外观；压缩包、解压后的文件和转换中间文件都不入库（见 `.gitignore`）。

## 重新生成
```bash
# 1. 解压（不要音效和界面背景，约 290 MB）
unzip -q -o war3-assets.zip -d art/war3_raw -x '__MACOSX/*' '*/Sound/*' '*/UI/Glues/*' '*.wav'
# 2. 怪物 / 塔 / 英雄 / 守卫者的精灵表（约 40 分钟，JOBS=6 个 Blender 并行），结果在 batch_report.tsv
python3 tools/war3_batch.py
# 3. 信息面板里会动的头像（*_Portrait.mdx，用模型自带的镜头）→ h5/assets/w3portraits.js、h5/assets/portraits/
python3 tools/war3_batch.py --portraits
# 4. 命令面板图标 + 图标头像 → h5/assets/war3_icons.js、h5/assets/icons/war3/；控制台贴图和信息卡图标 → h5/assets/ui/
python3 tools/war3_icons.py
# 5. 投射物 → h5/assets/w3missiles.js、h5/assets/missiles/
python3 tools/war3_missiles.py
# 6. 地面贴图 + 树墙 → h5/assets/w3terrain.js、h5/assets/terrain/
python3 tools/war3_terrain.py
# 7. 实时 3D 渲染用的模型和贴图（第 2 步登记过的模型 + 引用的贴图 + 队伍颜色，约 36 MB）→ h5/assets/w3/
python3 tools/war3_models.py
```

## 和原图的对应
- **模型**：单位数据（`analysis/raw/units_all.json`）的 `file` 字段。同一个模型只出一张精灵表（`h5/assets/sprites/w3_*`），
  用到它的单位登记成别名（`aliasOf`），和原图一样共用。
- **染色**：单位数据的 `red / green / blue`，游戏里乘到精灵图上（`game.js` 的 `tinted()`）。SLK 里空着的颜色是 0。
- **缩放**：单位数据的 `modelScale`。精灵表按用到它的单位里最大的缩放出图，其余按比例缩小；塔每一级各有自己的颜色和大小。
- **队伍颜色**：怪物属于玩家 12（棕色），塔 / 英雄 / 守卫者属于玩家 1（红色）。
- **图标**：单位 / 技能的 `Art` 字段；通用命令（移动、停止、建造、回收、使用木材……）用原图里同名技能的图标。
- **动作**：先选名字完全一样的序列（`Stand`），再选带编号的变体（`Stand - 2` 往往是东张西望的长动作）；待机按模型里的原始时长播放。
- **头像**：模型同目录的 `*_Portrait.mdx`，用里面的镜头（CAMS）取景，播放 Portrait 动作；建筑类没有头像模型的用图标。
- **控制台**：暗夜精灵的 `NightElfUITile01~04`（拼成 1600×512，上面是顶栏、下面是底栏），桌面浏览器里按原版的位置摆放小地图、头像、血蓝条、信息区和命令卡；
  手机竖屏仍用简化的两行布局。
- **商店**：地图中央的商店 `u00L`，模型是摇滚阿尔萨斯（`Doodads/Cinematic/RockinArthas`），登记成 `shop`。兔子（`nshe`）的复活节兔子模型不在包里，游戏里程序绘制。
- **剑刃风暴**：原图召唤剑魂 `n05F`（1.5 倍的剑圣，带幽灵所以半透明）施放旋风斩；精灵图是剑圣模型的 `Attack Walk Stand Spin` 动作（`fx:bladestorm`）。
- **投射物**：塔 / 英雄 1 级单位的 `Missileart`、`Missilespeed`、`Missilearc`。速度 ≥ 5000 或瞬间命中的（原图里其实是直接命中）、
  或者没有填的，继续用程序绘制的弹道。命中效果沿用程序绘制的（能看出溅射范围）。

- **地面**：原图 `war3map.w3e` 用到的地块——Lgrd 暗草地（底色）、Arck 灰绿岩石（路面）、Zvin 遗迹暗草（路两侧 1、3 格外的细纹）、
  Crck 费伍德岩石（出怪口围栏的边）、cZc1（中央十字，用遗迹泥土）。我们的路线是缩小、对齐网格后的版本，所以地块按原图的规则
  在我们的路线上重新铺（`terrain.js`），过渡用魔兽图集的四角遮罩，叠放顺序同 w3e 的地块表。
- **树墙**：原图 `war3map.doo` 里出怪口围栏的 5 种树墙。乡村树墙（VTlt）和城市树墙（YTct）的贴图不在包里，用洛丹伦夏季树代替。
  原图地图边缘没有树，我们在建造区外围了一圈，挡住空地。

## 原版包里没有、继续用 Hive 版的
地精修补匠（`ndtr`）、修补匠机器人（`n08V`、`ncg3`、地精塔）、4 辆车（`nerw`、`nfod`、`nfor`、`nfot`）、火焰领主（火魂）。
这几个也没有原版图标；地精塔的投射物（TinkerRocket）也不在包里。

光环塔原图用的是光环特效模型，游戏里继续程序绘制。

- **3D 单位**：怪物、塔、英雄、守卫者、尸体、剑刃风暴、建造虚影都用 `h5/units3d.js` 实时渲染原版 MDX（mdx-m3-viewer 5.12.0，`h5/vendor/`），
  画在地面层和界面层之间的 WebGL 画布上；投影和精灵图同一个 50° 俯角，大小、动作时长、染色、缩放都沿用精灵表的登记（`sprites.js`）。
  模型没加载完、没有 `h5/assets/w3/` 或浏览器没有 WebGL 时退回精灵图；头像、快捷按钮缩略图仍用精灵图。
