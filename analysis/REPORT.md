# 绿色循环圈外传 V8.6.6: Map Analysis

Source file: `000綠色循環圈外傳8.6.6.w3x` (author 徐六月). Everything below was pulled from the map file itself. The parts that are *inferred* rather than read directly are marked **(inferred)**.

## 0. What could be extracted

| Part | Status |
|---|---|
| Unit / tower / monster / hero stats (SLK tables) | ✅ Fully readable: 1001 units |
| Abilities incl. hero skill descriptions | ✅ 1413 abilities |
| Items and shops | ✅ 146 items |
| Game script `war3map.j` (7 MB, 2706 functions) | ✅ ~99%. One 64 KB block was deliberately corrupted by the map protector: the very first block, i.e. the `globals` variable declarations. All logic functions are intact, but variable and function names are obfuscated (`C9`, `Cn`, `wx`…) |
| Monster path (regions + move orders) | ✅ Rebuilt as a waypoint graph |
| Terrain / models / sounds | Not exported (not needed for an H5 remake) |

## 1. Core loop in one paragraph

Up to 8 players defend together. Monsters spawn at **8 spawn points** (one per player slot) and walk **endlessly** around a double-square "回"-shaped road network. They never "leak" to a base. Instead, the game counts **all living monsters on the map**. If that count goes **above the cap (40 × number of players)**, everyone loses. Each wave starts on a fixed timer whether or not the last one is cleared, so a weak defense slowly piles up monsters until the cap breaks. You build towers next to the road, upgrade them through long level chains, and grow a unique **hero tower** with STR/AGI/INT and 4 learned skills. Bosses come every 10 waves, there's a panda boss at wave 48, then a final dragon + 魔王 fight. After that comes an endless mode, unlocked by a "perfect" score of 10 or more.

## 2. Rules read from the script

### 2.1 Lose condition (the core mechanic)
- Every 1 s: `Cn` = number of living units owned by the monster player (Player 12).
- Cap `M3 = Σ C9[i]`, where each *human* player adds **40** (`set C9[i]=40`).
- `if Cn > M3` → defeat sequence ("大家很厉害！很遗憾，还是失败了！"), with 40 s until the game closes.
- Leaderboard shows `当前怪数: Cn（最大 M3）`.
- Some upgrades or events reduce a player's contribution (`C9[i]=C9[i]-1`), and a leaving player's contribution is zeroed.

### 2.2 Wave timing
- Wave interval `Dm` = **38 s** (mode `JI==1`, easier) or **33 s** (default). Waves start on the timer regardless of whether monsters are still alive.
- Gold paid when a wave starts: `rank_index*12 + wave*4` (easy) or `rank_index*8 + wave*2` (normal). Lower-ranked players get more (catch-up).
- **Perfect score (`Df`)**: +1 every time a wave starts with **0 monsters alive**. A perfect score of 10 or more unlocks endless mode.
- Score `C7` starts at 1000. Each wave subtracts the number of monsters still alive.
- Monster scaling: each wave the monster player researches upgrade `Rhar` to level = wave number. That upgrade gives **+1% HP per level** (`rhpo`, 0.01/level, max 100).

### 2.3 Spawning
Each wave picks one monster type `Ul` (often randomly from 2–5 candidates: weaker common type vs rarer elite type, e.g. `GetRandomInt(1,4)==1` → elite). Then it switches on 1–3 spawners. Each spawner drops 1 monster at each of the 8 spawn points per tick:

| Spawner | Wave hint | Tick | Count per spawn point | Total for 8 points |
|---|---|---|---|---|
| RT | 多 (many) | 0.25 s | 62 | 496 |
| RU | 中 (medium) | 0.6 s | 32 (15 if a certain event flag is on) | 256 |
| RV | 少 (few) | 1.0 s | 15 | 120 |

The hint text (e.g. `中 魔法`, `多 物理`) is shown to players so they know **how many** monsters are coming and **which armor type** they have.

### 2.4 Armor and damage counter system (the second core mechanic)
The map's damage table (`war3mapMisc.txt`) is customized so that each armor type has exactly one "right answer":

| Attack ↓ / Armor → | 物理 (small) | 抗性 (medium) | 魔法 (large) | 神圣 (divine) |
|---|---|---|---|---|
| normal 普通 | 0.20 | **1.00** | 0.65 | 0.30 |
| pierce 穿刺 | 0.60 | 0.35 | **1.15** | 0.10 |
| magic 魔法 | **1.10** | 0.65 | 0.15 | 0.20 |
| chaos 混乱 | 0.35 | 0.30 | 0.40 | **1.10** |

So: **物理 waves → magic towers, 抗性 → normal, 魔法 → pierce, 神圣 → chaos.** Armor value reduces damage by `armor×0.02 / (1+armor×0.02)`. Many hero skills say "无视护甲" (ignore armor), which bypasses that reduction.

Other global constants: STR +5 attack per point, AGI +1% attack speed per point, hero max level 30, selling a tower refunds 100% of its build cost, max unit speed 522.

### 2.5 Monster path
See `path.svg` / `data/path.json`. There are two concentric square loops: the outer one at about ±3900 and the inner one at about ±2800 (map coordinates). They're connected at the mid-points of each side.
- 4 spawn points sit in the far corners and feed the outer loop. The other 4 are near the centre and feed the inner loop.
- At every junction a monster flips a **50/50 coin** for which way to go next, and remembers a direction tag in its user data. So monsters wander around both loops forever, and their density spreads unevenly.
- **H5 simplification:** one or two closed loops plus random switching at junctions gives the same feel.

### 2.6 Bosses and ending
| Wave | Event |
|---|---|
| 10 | BOSS, one of 2 random variants: 大红牛 + 小红牛, "**survive 60 s; unkilled bosses expire; 100 gold per 大红牛 killed**", or 大豪猪 |
| 20 | BOSS, one of 2 variants: 骷髅 (大骷髅 / 骷髅法师 40k HP), "**kill all bosses within 100 s or the game is lost**" |
| 30, 40 | BOSS waves (wave 40: 4 tanks + 嚣张的大游艇 350k HP + 疯狂的直升机 300k HP) |
| 48 | Panda BOSS (random 1 of 4 熊猫, ~35–40k HP each) + 魔王 cameo, 150 s timer |
| Final | "30秒后最终Boss波——龙": dragons + 魔王 (400k HP, 100 all-stats). **Kill all dragons and the 魔王 to win** |
| Endless | Opens 180 s later if the perfect score is 10 or more. Can't be won; the score decides your ranking |

Full per-wave monster table (HP / armor / armor type / speed / bounty): `data/waves.csv`. HP grows from about 5–16 on wave 1, to about 2–20k by wave 25, about 20–100k by wave 35, and up to 500k elites by wave 46–47.

## 3. Player side

### 3.1 Builder and tower categories
Each player gets a builder, 循环圈守卫者 (`uaco`), that builds **11 base towers**. Category placeholders (另类塔类 / 辅助塔类 / 光环塔类 / 原始塔类) upgrade into one of several concrete towers. A random-mode builder (`u001`) can build 102 different towers.

| Category | Towers (levels) | Role |
|---|---|---|
| 扫射塔 | 9 levels, pierce, 0.2 s | rotating strafe (damage from ability) |
| 天神塔 | 4 levels, normal, up to 3000 dmg | mana-based, boosted by 魔法药水 |
| 寒冰塔 | 5 levels | slow / AoE ice |
| 魔幻塔 | 5 levels, pierce, up to 8000 dmg | single target |
| 弹跳塔 | base + 4 branches (pierce / normal / chaos / magic) × 4 levels, bounces 4→14 targets | **pick your damage type**, a great H5 mechanic |
| 神圣塔 | 6 levels, normal | |
| 剑圣塔 | 8 levels, normal | |
| 原始塔类 | 牛头, 通灵, 闪电, 箭, 毒, 群攻, 混乱, 破坏 (4–5 levels each) | basic DPS of every damage type |
| 另类塔类 | 魔石, 炎魔, 灵魂, 燃烧, 深渊, 科技, 死亡, 图腾, 精灵, 巨箭, 地精 | special mechanics |
| 辅助塔类 | 腐蚀 (−armor), 暴击, 重击 (stun), 冰霜 + big ones 萨满/兽人/驱逐/缓速/巫法/巫魔/巫医 | support debuffs |
| 光环塔类 | 加速 / 攻击 / 减防 / 减速 光环 (6 levels each) + unique 火速/恐惧/神力/冰封 | auras. In random mode, max 2 of each aura |

Upgrade costs climb steeply, e.g. 箭塔 800 → 3000 → 5900 → 8300 gold, with damage 160 → 700 → 3400 → 8200. All numbers are in `data/towers.csv`, including DPS.

### 3.2 Hero towers (英雄塔 / 成长塔), the depth system
44 hero towers: 火魂, 枪神, 剑神, 邪冰, 幻影, 渔人, 神牛, 古树, 猛犸, 先知, 坦克, 凤凰… They're immobile and invulnerable, and you can only have one.
- **Attributes:** choose which stat grows (`属性选择`). Each **elite kill gives +1** to the chosen stat. "升级" costs `level×100 gold + 200 mana`. After max level it costs 500 gold + 400 mana for +3. 知识之书 (2200 gold) gives +10 random.
- **STR** = +5 attack per point and gates skills. **AGI** = +2% attack speed per point and lowers skill cooldowns. **INT** scales many spell formulas.
- **Skills:** each hero has a pool of 4–5 skills. You can learn up to 4:
  - 1st: free
  - 2nd: 18 wood + STR ≥ 80
  - 3rd: 36 wood + STR ≥ 160
  - 4th: 54 wood + STR ≥ 240
- Skill damage scales with stat thresholds. For example, 火魂's 爆裂之焰 deals AGI × X, where X = 10/30/60/120/250/420 at AGI < 100/200/300/400/500/≥500. Full text for 36 heroes is in `data/heroes.json`.

### 3.3 Economy
- **Gold:** kill bounty (`bounty` per monster), the per-wave stipend, boss bonuses, and auras such as 银行塔 (bank tower).
- **Wood:** buy it (1 for 500 gold, or 10 for 5000 gold), get it from events and achievements, or from sell/upgrade refunds. Wood gates hero skills and rerolls.
- **Achievements (成就) / 许愿点 (wish points) / 英雄点:** meta-currencies tied to the platform's saved stats (至尊, 段位, 无尽分). These drive extra shops (`data/shops.json`) and **can be dropped for an H5 MVP**.

## 4. What to copy for the H5 version (recommended MVP)

1. **Road:** one "回" double loop with 4 junctions doing 50/50 random routing, and 2–8 spawn points.
2. **Lose rule:** alive monsters > 40 × players. Wave timer 33 s, which keeps running even if the wave isn't cleared.
3. **Armor counter table:** the 4×4 table above, plus a wave hint label such as "多 魔法".
4. **Towers:** ~8 原始 towers covering all 4 damage types, 弹跳塔 with a branch choice, 2 support towers (腐蚀 −armor, 冰霜 slow), and 2 aura towers.
5. **One hero tower** with STR/AGI/INT, +1 stat per elite kill, and 4 skills unlocked at STR 0/80/160/240.
6. **Waves 1–30** from `data/waves.csv`, bosses at 10/20/30 with a "kill within 100 s" rule, monster HP +1% per wave.
7. Later: endless mode unlocked by perfect score ≥ 10, wishing/reroll, pets.

## 5. Files
- `data/waves.json|csv`: every wave's monster pool with stats
- `data/towers_base.json`, `towers.csv`: the 11 base categories and their full upgrade chains
- `data/towers_all_buildable.json`: all 102 towers in random mode
- `data/heroes.json`: hero towers and their skill descriptions
- `data/shops.json`: shops and items
- `data/damage_table.json`: attack vs armor multipliers
- `data/path.json`, `path.svg`: waypoint graph and spawn points
- `raw/`: original SLK tables, string files, the decompiled `war3map.j` script, and full JSON dumps
