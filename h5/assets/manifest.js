// 素材登记表：把图片放进 h5/assets/ 后在这里登记，游戏会自动用图片替换几何占位图形。
// 没登记的单位继续用占位图形，所以可以一个一个地替换。
//
// key 的格式（和 assets/美术素材需求清单.md 里的"素材 key"列一致）：
//   'builder'                    循环圈守卫者
//   'hero:剑神'                  英雄塔（4 个已实装：剑神 / 枪神 / 邪冰 / 火魂）
//   'tower:箭塔'                 塔（所有等级通用）
//   'tower:箭塔:4'               塔的某一级（可选，优先于通用图）
//   'unit:hfoo'                  怪物，用原图的单位 ID（见清单）
//   'icon:箭塔' / 'icon:hero:剑神' / 'icon:skill:剑神:0'   命令面板图标（正方形）
//   'portrait:builder' / 'portrait:hero:剑神' / 'portrait:tower:箭塔:1'   信息面板头像（可选）
//
// 图片要求：PNG 透明底；单位/塔按 45° 俯视角渲染，脚底在图片下方约 1/4 处。
window.ASSET_MANIFEST = {
  sprites: {
    // 'builder': 'sprites/builder.png',
    // 'tower:箭塔': 'sprites/tower_arrow.png',
    // 'unit:hfoo': 'sprites/unit_hfoo.png',
  },
};
