/* 原版音效播放（登记在 assets/w3sounds.js，文件在 assets/sounds/，由 tools/war3_sounds.py 导出）
 * 用 <audio> 而不是 Web Audio：双击打开 index.html（file://）时 fetch 读不了本地文件，<audio> 可以。
 * 和 WC3 一样：同时发声数有上限，单位语音同一时间只有一条（新的打断旧的），画面外的声音按距离变小直到听不见。
 * 没有导出音效文件（assets/sounds/ 不入库）时静默。
 */
window.SFX = (() => {
'use strict';
const S = window.W3_SOUNDS;
const BASE = 'assets/';
const VOL = { voice: 1, launch: 0.45, hit: 0.5, death: 0.55, spell: 0.7, ui: 0.6, music: 0.4, stinger: 0.7 };
const MAX_ALL = 24, MAX_KIND = { launch: 6, hit: 6, death: 6, spell: 6 }, MIN_GAP = 0.05;   // 同一个文件两次播放的最短间隔（秒）
let pref = { sfx: true, music: true };
try { Object.assign(pref, JSON.parse(localStorage.getItem('gc.sound') || '{}')); } catch (e) { /* 隐私模式等：用默认 */ }
const save = () => { try { localStorage.setItem('gc.sound', JSON.stringify(pref)); } catch (e) { /* 忽略 */ } };

const pool = {}, lastAt = {}, playing = new Set(), kindCount = {};
let listener = null, voiceEl = null, voiceKey = null, voiceClicks = 0, voiceT = 0;
const now = () => performance.now() / 1000;
const pick = a => a[Math.floor(Math.random() * a.length)];
function noPitchLock(a) { a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = false; }

function play(src, kind, opt = {}) {
  if (!src || !pref.sfx) return null;
  const t = now();
  if (t - (lastAt[src] || 0) < MIN_GAP) return null;
  if (playing.size >= MAX_ALL || (MAX_KIND[kind] && (kindCount[kind] || 0) >= MAX_KIND[kind])) return null;
  let v = (VOL[kind] ?? 1) * (opt.vol ?? 1);
  if (opt.x != null && listener) v *= listener(opt.x, opt.y);
  if (v < 0.03) return null;
  const list = pool[src] || (pool[src] = []);
  let a = list.find(x => !playing.has(x));
  if (!a) { if (list.length >= 4) return null; a = new Audio(BASE + src); a.preload = 'auto'; noPitchLock(a); list.push(a); a.onended = a.onerror = () => done(a); }
  a._kind = kind; a.volume = Math.min(1, v); a.playbackRate = opt.rate || 1; a.currentTime = 0;
  playing.add(a); kindCount[kind] = (kindCount[kind] || 0) + 1; lastAt[src] = t;
  const p = a.play(); if (p && p.catch) p.catch(() => done(a));
  return a;
}
function done(a) { if (playing.delete(a)) kindCount[a._kind]--; }

// 单位：攻击出手 / 命中 / 死亡，选中和命令的语音
function ent(key, kind, opt) {
  const e = S && S.ent[key], list = e && e[kind];
  if (list) play(pick(list), kind === 'launch' || kind === 'hit' || kind === 'death' ? kind : 'voice', opt);
}
// 选中单位：What；短时间内连点同一个单位 4 次以上换成 Pissed（和 WC3 一样逐条播放）
function select(key) {
  const e = S && S.ent[key]; if (!e) return;
  const t = now();
  voiceClicks = key === voiceKey && t - voiceT < 1.5 ? voiceClicks + 1 : 0; voiceKey = key; voiceT = t;
  const pissed = e.pissed && voiceClicks >= 3 ? e.pissed[(voiceClicks - 3) % e.pissed.length] : null;
  voice(pissed || (e.what && pick(e.what)));
}
function ack(key, kind = 'yes') { const e = S && S.ent[key]; if (e && e[kind]) voice(pick(e[kind])); }
function voice(src) {
  if (!src || !pref.sfx) return;
  if (voiceEl && !voiceEl.paused) { voiceEl.pause(); done(voiceEl); }
  voiceEl = play(src, 'voice');
}
const ui = (name, opt) => S && S.ui[name] && play(pick(S.ui[name]), 'ui', opt);
const spell = (name, opt) => S && S.spell[name] && play(pick(S.spell[name]), 'spell', opt);

// ---------------------------------------------------------------- 音乐：暗夜精灵的 3 首轮流放；每波开始的音乐片段叠在上面，同时把背景音乐压低
const bgm = new Audio(); bgm.preload = 'none';
const sting = new Audio(); noPitchLock(sting);
let order = [], idx = 0, musicOn = false, duck = 1;
function bgmVolume() { bgm.volume = VOL.music * duck; }
function nextTrack() {
  if (!S || !S.music.length) return;
  if (idx >= order.length) { order = S.music.slice().sort(() => Math.random() - 0.5); idx = 0; }
  bgm.src = BASE + order[idx++]; bgmVolume();
  if (pref.music) bgm.play().catch(() => {});
}
bgm.onended = () => { if (musicOn) nextTrack(); };
function startMusic() { musicOn = true; sting.pause(); duck = 1; nextTrack(); }
function stopMusic() { musicOn = false; bgm.pause(); sting.pause(); }
function stinger(n) {
  const s = S && S.stinger[n]; if (!s || !pref.music) return;
  sting.src = BASE + s.file; sting.volume = Math.min(1, VOL.stinger * s.vol); sting.playbackRate = s.pitch;   // 原图 SetSoundPitch：片段加速播放
  duck = 0.3; bgmVolume();
  sting.play().catch(() => {});
}
sting.onended = sting.onpause = () => { duck = 1; bgmVolume(); };
function end(kind) {
  stopMusic();
  const f = S && S.end[kind]; if (!f || !pref.music) return;
  sting.src = BASE + f; sting.volume = VOL.stinger; sting.playbackRate = 1; sting.play().catch(() => {});
}

function toggle(what) {
  pref[what] = !pref[what]; save();
  if (what === 'music') { if (!pref.music) { bgm.pause(); sting.pause(); } else if (musicOn) bgm.play().catch(() => {}); }
  return pref[what];
}

return {
  ent, select, ack, ui, spell, startMusic, stopMusic, stinger, end, toggle,
  get pref() { return pref; },
  get ready() { return !!S; },
  setListener(fn) { listener = fn; },
};
})();
