# 魔兽争霸 3 原版资源（本地用，不入库）

`war3-assets.zip`（项目根目录）是从魔兽争霸 3 里导出的原版资源：`roc/`（混乱之治）和 `tft/`（冰封王座，同路径时覆盖 roc）。
资源版权归暴雪，只在本地用来复刻原图的外观；压缩包、解压后的文件和转换中间文件都不入库（见 `.gitignore`）。

## 重新生成
```bash
# 1. 解压（不要音效和界面背景，约 290 MB）
unzip -q -o war3-assets.zip -d art/war3_raw -x '__MACOSX/*' '*/Sound/*' '*/UI/Glues/*' '*.wav'
# 2. 怪物 / 塔 / 英雄 / 守卫者的精灵表（约 40 分钟，JOBS=6 个 Blender 并行），结果在 batch_report.tsv
python3 tools/war3_batch.py
# 3. 命令面板图标 + 信息面板头像 → h5/assets/war3_icons.js、h5/assets/icons/war3/
python3 tools/war3_icons.py
# 4. 投射物 → h5/assets/w3missiles.js、h5/assets/missiles/
python3 tools/war3_missiles.py
```

## 和原图的对应
- **模型**：单位数据（`analysis/raw/units_all.json`）的 `file` 字段。同一个模型只出一张精灵表（`h5/assets/sprites/w3_*`），
  用到它的单位登记成别名（`aliasOf`），和原图一样共用。
- **染色**：单位数据的 `red / green / blue`，游戏里乘到精灵图上（`game.js` 的 `tinted()`）。SLK 里空着的颜色是 0。
- **缩放**：单位数据的 `modelScale`。精灵表按用到它的单位里最大的缩放出图，其余按比例缩小；塔每一级各有自己的颜色和大小。
- **队伍颜色**：怪物属于玩家 12（棕色），塔 / 英雄 / 守卫者属于玩家 1（红色）。
- **图标**：单位 / 技能的 `Art` 字段；通用命令（移动、停止、建造、回收、使用木材……）用原图里同名技能的图标。
- **投射物**：塔 / 英雄 1 级单位的 `Missileart`、`Missilespeed`、`Missilearc`。速度 ≥ 5000 或瞬间命中的（原图里其实是直接命中）、
  或者没有填的，继续用程序绘制的弹道。命中效果沿用程序绘制的（能看出溅射范围）。

## 原版包里没有、继续用 Hive 版的
地精修补匠（`ndtr`）、修补匠机器人（`n08V`、`ncg3`、地精塔）、4 辆车（`nerw`、`nfod`、`nfor`、`nfot`）、火焰领主（火魂）。
这几个也没有原版图标；地精塔的投射物（TinkerRocket）也不在包里。

光环塔原图用的是光环特效模型，游戏里继续程序绘制。
