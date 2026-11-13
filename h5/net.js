// 联机：大厅界面 + 连接层（设计见 analysis/联机设计.md）。
// 大厅 / 信令走 HTTP 长轮询（server/），对局数据走 WebRTC DataChannel 全网状直连：
//   ctl  可靠有序，JSON 事件      → GC_NET.send(ev, to?)  / 收到后 GC.receive(ev, fromSlot)
//   snap 不可靠无序，位置快照等   → GC_NET.snap(data, to?) / 收到后 GC.snap(data, fromSlot)
// 连不上时按 direct（只 STUN）→ relay（只 TURN）→ all 换策略；用过中继的设备记 7 天，下次先走中继。
(function () {
'use strict';
const GC = window.GC, UI = GC.ui;
const LS_URL = 'gc.net.url', LS_RELAY = 'gc.net.relay';
const STAGE_MS = 8000, GRACE_MS = 20000, SNAP_BUF = 16384;
const LOCAL_PAGE = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
const defaultUrl = () => LOCAL_PAGE ? 'http://localhost:8787' : `${location.origin}/lobby`;
function savedUrl(value) {
  if (!value) return defaultUrl();
  try {
    const u = new URL(value);
    // Migrate the old automatically saved :8787 address and bare website URL.
    if (!LOCAL_PAGE && u.hostname === location.hostname && (u.port === '8787' || !u.pathname.replace(/\//g, ''))) return defaultUrl();
    return value.replace(/\/+$/, '');
  } catch (e) { return defaultUrl(); }
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } };

const N = { url: savedUrl(lsGet(LS_URL)), name: '', code: null, token: null, id: null, room: null, ver: 0, chatSeq: 0, chat: [],
  peers: new Map(), ice: { iceServers: [], turn: false }, inGame: false, slots: [], lobbyOpen: false, lastLinks: '', pollGen: 0, stats: {} };

async function api(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path.includes('/poll?') ? 35000 : 10000);
  try {
    const r = await fetch(N.url + path, { method, signal: controller.signal, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => { throw new Error('大厅地址未正确配置，请使用默认大厅后重试'); });
    if (!r.ok) { const e = new Error(j.error || `请求失败（${r.status}）`); e.status = r.status; throw e; }
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('连接大厅超时，请检查网络后重试');
    if (e instanceof TypeError) throw new Error('无法连接大厅，请检查网络或使用默认大厅后重试');
    throw e;
  } finally { clearTimeout(timer); }
}
const post = (action, body = {}) => api('POST', `/rooms/${N.code}/${action}`, { ...body, token: N.token });

// ---------------------------------------------------------------- 长轮询
async function pollLoop(gen) {
  let fails = 0;
  while (N.token && gen === N.pollGen) {
    try {
      const r = await api('GET', `/rooms/${N.code}/poll?token=${N.token}&ver=${N.ver}&chat=${N.chatSeq}`);
      if (gen !== N.pollGen) return;
      fails = 0;
      N.ver = r.ver; N.room = r.room;
      for (const c of r.chat) { N.chatSeq = Math.max(N.chatSeq, c.seq); N.chat.push(c); }
      if (N.chat.length > 60) N.chat.splice(0, N.chat.length - 60);
      for (const s of r.signals) onSignal(s);
      syncPeers();
      if (N.room.state === 'playing' && !N.inGame) startGame();
      if (N.lobbyOpen) renderRoom();
    } catch (e) {
      if (gen !== N.pollGen) return;
      if (e.status === 410 || e.status === 404 || e.status === 403 || ++fails >= 6) return lostRoom(e.status ? e.message : '连不上大厅服务');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
// 被服务器移出（被踢 / 掉线 / 服务挂了）：大厅里直接退出；对局中直连还在就继续打（只是没法再重连别人）
function lostRoom(why) {
  if (N.inGame) { N.token = null; UI.msg(`和大厅服务断开了（${why}），已经连上的队友不受影响`, 10); return; }
  reset();
  if (N.lobbyOpen) showConnect(why);
}
function reset() {
  N.pollGen++;
  for (const p of N.peers.values()) closePeer(p);
  N.peers.clear();
  Object.assign(N, { code: null, token: null, id: null, room: null, ver: 0, chatSeq: 0, chat: [], inGame: false, slots: [], lastLinks: '' });
}

// ---------------------------------------------------------------- WebRTC
const hasRelayMark = () => +(lsGet(LS_RELAY) || 0) > Date.now();
function firstStage() {
  const cell = navigator.connection && navigator.connection.type === 'cellular';
  return N.ice.turn && (cell || hasRelayMark()) ? 'relay' : 'direct';
}
function nextStage(s) { return s === 'direct' ? (N.ice.turn ? 'relay' : 'all') : s === 'relay' ? 'all' : 'direct'; }
function rtcConfig(stage) {
  const all = N.ice.iceServers || [], isTurn = s => [].concat(s.urls).some(u => /^turns?:/.test(u));
  if (stage === 'direct') return { iceServers: all.filter(s => !isTurn(s)) };
  if (stage === 'relay') return { iceServers: all.filter(isTurn), iceTransportPolicy: 'relay' };
  return { iceServers: all };
}
function syncPeers() {
  if (!N.room) return;
  const ids = new Set(N.room.players.map(p => p.id));
  for (const pl of N.room.players) {
    if (pl.id === N.id || N.peers.has(pl.id)) continue;
    if (N.inGame && !N.slots.some(s => s.id === pl.id)) continue;
    const p = { id: pl.id, name: pl.name, connectingSince: Date.now(), offerer: N.id > pl.id, pc: null, ctl: null, snap: null, open: false, gen: 0, stage: firstStage(), timer: 0, lostAt: 0, queue: [], rtt: null, pend: [], bye: false };
    N.peers.set(pl.id, p);
    if (p.offerer) connect(p);
  }
  for (const p of N.peers.values()) {
    if (ids.has(p.id)) continue;
    if (!N.inGame) { closePeer(p); N.peers.delete(p.id); }
    else if (!p.open) peerGone(p);                 // 对局中：名单里没了、直连也断了才算走（直连还通就不管名单）
  }
  reportLinks();
}
function closePeer(p) {
  clearTimeout(p.timer); p.open = false;
  for (const c of [p.ctl, p.snap]) if (c) { c.onopen = c.onclose = c.onmessage = null; try { c.close(); } catch (e) { /* 忽略 */ } }
  if (p.pc) { p.pc.onicecandidate = p.pc.onconnectionstatechange = null; try { p.pc.close(); } catch (e) { /* 忽略 */ } }
  p.pc = p.ctl = p.snap = null;
}
function makePc(p, stage, gen) {
  closePeer(p);
  p.stage = stage; p.gen = gen; p.pend = []; p.remoteSet = false;
  const pc = p.pc = new RTCPeerConnection(rtcConfig(stage));
  const ctl = p.ctl = pc.createDataChannel('ctl', { negotiated: true, id: 0 });
  const snap = p.snap = pc.createDataChannel('snap', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
  snap.binaryType = 'arraybuffer';
  pc.onicecandidate = e => {
    if (!e.candidate) return;
    const k = (/ typ (\w+)/.exec(e.candidate.candidate) || [])[1] || '?'; N.stats[k] = (N.stats[k] || 0) + 1;     // host / srflx / relay 各几个（排查用）
    signal(p, 'ice', { c: e.candidate.toJSON(), gen });
  };
  ctl.onopen = () => {
    if (p.pc !== pc) return;
    clearTimeout(p.timer); p.open = true; p.lostAt = 0;
    if (stage === 'relay') lsSet(LS_RELAY, String(Date.now() + 7 * 864e5));
    const q = p.queue; p.queue = []; for (const s of q) ctl.send(s);
    reportLinks(); if (N.lobbyOpen) renderRoom();
  };
  ctl.onclose = () => { if (p.pc === pc) peerLost(p); };
  pc.onconnectionstatechange = () => { if (p.pc === pc && pc.connectionState === 'failed') peerLost(p); };
  ctl.onmessage = e => onCtl(p, e.data);
  snap.onmessage = e => { if (!N.inGame) return; const s = slotOf(p.id); if (s >= 0) GC.snap(typeof e.data === 'string' ? JSON.parse(e.data) : e.data, s); };
  return pc;
}
async function connect(p, stage = p.stage) {
  const gen = p.gen + 1, pc = makePc(p, stage, gen);
  if (N.lobbyOpen) renderRoom();
  try {
    await pc.setLocalDescription(await pc.createOffer());
    if (p.pc !== pc) return;
    signal(p, 'offer', { sdp: pc.localDescription, stage, gen });
  } catch (e) { console.warn('[net] offer', e); }
  p.timer = setTimeout(() => { if (p.pc === pc && !p.open) connect(p, nextStage(stage)); }, STAGE_MS);   // 这一档连不上：换下一档
}
function signal(p, kind, data) { if (N.token) post('signal', { to: p.id, kind, data }).catch(() => {}); }
async function onSignal(s) {
  const p = N.peers.get(s.from) || (syncPeers(), N.peers.get(s.from)); if (!p) return;
  const d = s.data || {};
  try {
    if (s.kind === 'offer') {
      const pc = makePc(p, d.stage || 'all', d.gen);
      await pc.setRemoteDescription(d.sdp); p.remoteSet = true;
      for (const c of p.pend.splice(0)) pc.addIceCandidate(c).catch(() => {});
      await pc.setLocalDescription(await pc.createAnswer());
      if (p.pc === pc) signal(p, 'answer', { sdp: pc.localDescription, gen: d.gen });
    } else if (s.kind === 'answer') {
      if (d.gen !== p.gen || !p.pc) return;
      await p.pc.setRemoteDescription(d.sdp); p.remoteSet = true;
      for (const c of p.pend.splice(0)) p.pc.addIceCandidate(c).catch(() => {});
    } else if (s.kind === 'ice') {
      if (!p.pc || d.gen !== p.gen) { if (d.gen > p.gen) (p.early = p.early || []).push(d); return; }
      for (const c of loopback(d.c)) { if (p.remoteSet) p.pc.addIceCandidate(c).catch(() => {}); else p.pend.push(c); }
    }
    if (p.early && p.early.length && s.kind === 'offer') { for (const e of p.early.splice(0)) if (e.gen === p.gen) p.pc.addIceCandidate(e.c).catch(() => {}); }
  } catch (e) { console.warn('[net] signal', s.kind, e); }
}
// 本机开两个标签页试玩（页面在 localhost 上）：浏览器给的本机候选是 mDNS 名（xxxx.local），有的环境解析不了，
// 这时两个标签页肯定在同一台机器上，另外补一条 127.0.0.1 的候选
function loopback(c) {
  if (!LOCAL_PAGE || !c || !/ [0-9a-f-]+\.local /.test(c.candidate || '')) return [c];
  return [c, { ...c, candidate: c.candidate.replace(/ [0-9a-f-]+\.local /, ' 127.0.0.1 ') }];
}
function peerLost(p) {
  if (!N.peers.has(p.id)) return;
  const was = p.open; p.open = false;
  if (was) { p.connectingSince = Date.now(); p.lostAt = Date.now(); reportLinks(); if (N.lobbyOpen) renderRoom(); }
  if (N.inGame) {
    if (p.bye || (N.room && N.token && !N.room.players.some(x => x.id === p.id))) return peerGone(p);
    if (was) setTimeout(() => { if (N.peers.get(p.id) === p && !p.open && p.lostAt) peerGone(p); }, GRACE_MS);   // 重连窗口
  }
  if (p.offerer && was) connect(p, firstStage());
}
function peerGone(p) {
  if (!N.peers.has(p.id)) return;
  const s = slotOf(p.id);
  closePeer(p); N.peers.delete(p.id);
  if (N.inGame && s >= 0) GC.receive({ t: 'leave', slot: s }, s);
}
function reportLinks() {
  if (!N.token || N.inGame) return;
  const links = [...N.peers.values()].filter(p => p.open).map(p => p.id).sort(), k = links.join();
  if (k === N.lastLinks) return;
  N.lastLinks = k; post('me', { links }).catch(() => {});
}
function onCtl(p, data) {
  let ev; try { ev = JSON.parse(data); } catch (e) { return; }
  if (!ev || typeof ev !== 'object') return;
  if (ev.t === '_ping') return p.ctl && p.ctl.readyState === 'open' && p.ctl.send(JSON.stringify({ t: '_pong', at: ev.at }));
  if (ev.t === '_pong') { p.rtt = Math.round(performance.now() - ev.at); return; }
  if (ev.t === 'bye') { p.bye = true; return N.inGame ? peerGone(p) : peerLost(p); }
  if (!N.inGame) return;
  const s = slotOf(p.id); if (s < 0) return;
  if (ev.slot != null) ev.slot = s;                // 身份按连接定，不信消息里自报的
  try { GC.receive(ev, s); } catch (e) { console.error('[net] receive', ev.t, e); }
}
setInterval(() => { for (const p of N.peers.values()) if (p.open && p.ctl.readyState === 'open') p.ctl.send(JSON.stringify({ t: '_ping', at: performance.now() })); }, 2000);

const slotOf = id => { const s = N.slots.find(x => x.id === id); return s ? s.slot : -1; };
const peerOfSlot = slot => { const s = N.slots.find(x => x.slot === slot); return s && N.peers.get(s.id); };
function send(ev, to) {
  if (!N.inGame) return;
  const str = JSON.stringify(ev);
  for (const p of to == null ? N.peers.values() : [peerOfSlot(to)]) {
    if (!p) continue;
    if (p.open && p.ctl.readyState === 'open') p.ctl.send(str);
    else if (p.queue.length < 3000) p.queue.push(str);      // 重连窗口里先攒着
  }
}
function snap(data, to) {
  if (!N.inGame) return;
  if (typeof data !== 'string' && !(data instanceof ArrayBuffer)) data = JSON.stringify(data);
  for (const p of to == null ? N.peers.values() : [peerOfSlot(to)]) {
    if (p && p.open && p.snap && p.snap.readyState === 'open' && p.snap.bufferedAmount < SNAP_BUF) { try { p.snap.send(data); } catch (e) { /* 丢这一帧 */ } }
  }
}
function leave() {
  if (!N.token && !N.peers.size) return;
  for (const p of N.peers.values()) if (p.open && p.ctl.readyState === 'open') { try { p.ctl.send('{"t":"bye"}'); } catch (e) { /* 忽略 */ } }
  if (N.token) { try { navigator.sendBeacon(`${N.url}/rooms/${N.code}/leave`, JSON.stringify({ token: N.token })); } catch (e) { /* 忽略 */ } }
  const peers = [...N.peers.values()];
  setTimeout(() => peers.forEach(closePeer), 200);           // 让 bye 先发出去
  N.peers.clear(); reset();
}
window.addEventListener('pagehide', leave);

// 标签页在后台时 requestAnimationFrame 会停：用 Worker 定时器接着推进模拟，不然我这个口的怪在别人那里全停住
try {
  const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'], { type: 'text/javascript' })));
  w.onmessage = () => { if (N.inGame) GC.bgTick(); };       // 画面帧还在跑时 bgTick 自己会跳过
} catch (e) { console.warn('[net] 后台定时器不可用', e); }

function startGame() {
  const me = N.room.players.find(p => p.id === N.id); if (!me) return;
  N.slots = N.room.players.map(p => ({ id: p.id, slot: p.seat, name: p.name }));
  N.inGame = true; N.lobbyOpen = false;
  UI.hideModal();
  GC.startNet({ mode: N.room.settings.mode, allGates: N.room.settings.allGates, me: me.seat, name: N.name, code: N.code,
    players: N.slots.map(s => ({ slot: s.slot, name: s.name })).sort((a, b) => a.slot - b.slot) });
}

// ---------------------------------------------------------------- 大厅界面
const esc = UI.escHtml;
function showConnect(note = '') {
  N.lobbyOpen = true;
  UI.showModal(`<div class="w3dlg lobby"><h2>联机（房间码）</h2>
    <details${LOCAL_PAGE ? ' open' : ''}><summary>连接设置</summary><label class="lb-row">大厅服务 <input id="lb-url" class="w3input" value="${esc(N.url)}" autocomplete="off"></label><button id="lb-default">使用默认大厅</button></details>
    <button class="w3btn" id="lb-create">创建房间</button>
    <div class="lb-row"><input id="lb-code" class="w3input" maxlength="4" placeholder="房间码（4 位）" autocomplete="off"><button class="w3btn" id="lb-join">加入房间</button></div>
    <button class="w3btn" id="lb-back">返回</button>
    <div class="w3hint" id="lb-note">${note ? `<b style="color:#ff8f86">${esc(note)}</b><br>` : ''}玩家 <b>${esc(N.name)}</b>：联机时的身份就是这个名称（段位、账号成就、赞助都跟着它），同一个房间里不能重名。<br>创建房间后，把生成的 4 位房间码告诉朋友。朋友打开同一个游戏网址，输入房间码加入。${LOCAL_PAGE ? '<br>本机试玩：先运行 <code>node server/server.js</code>' : ''}</div></div>`, true);
  const note_ = t => { if (!document.getElementById('lb-note')) return; document.getElementById('lb-note').innerHTML = `<b style="color:#ff8f86">${esc(t)}</b>`; };
  let pending = false;
  document.getElementById('lb-default').onclick = () => { document.getElementById('lb-url').value = defaultUrl(); lsSet(LS_URL, defaultUrl()); };
  const enter = async make => {
    if (pending) return;
    N.url = document.getElementById('lb-url').value.trim().replace(/\/+$/, '') || defaultUrl(); lsSet(LS_URL, N.url);
    const code = document.getElementById('lb-code').value.trim().toUpperCase();
    if (!make && !/^[A-Z0-9]{4}$/.test(code)) return note_('请输入 4 位房间码');
    try { const u = new URL(N.url); if (!/^https?:$/.test(u.protocol) || (location.protocol === 'https:' && u.protocol !== 'https:')) throw new Error(); } catch (e) { return note_('请输入有效的 HTTPS 大厅地址，或点击使用默认大厅'); }
    pending = true;
    for (const id of ['lb-create', 'lb-join', 'lb-back', 'lb-url', 'lb-default']) document.getElementById(id).disabled = true;
    note_('正在连接大厅…');
    try {
      N.ice = await api('GET', '/ice');
      if (!Array.isArray(N.ice.iceServers)) throw new Error('大厅地址未正确配置，请使用默认大厅后重试');
      const r = make ? await api('POST', '/rooms', { name: N.name, v: GC.version }) : await api('POST', `/rooms/${code}/join`, { name: N.name, v: GC.version });
      Object.assign(N, { code: r.code, token: r.token, id: r.id, ver: 0, chatSeq: 0, chat: [] });
      showRoom(); pollLoop(++N.pollGen);
    } catch (e) { note_(e.message); }
    finally { pending = false; for (const id of ['lb-create', 'lb-join', 'lb-back', 'lb-url', 'lb-default']) { const el = document.getElementById(id); if (el) el.disabled = false; } }
  };
  document.getElementById('lb-create').onclick = () => enter(true);
  document.getElementById('lb-join').onclick = () => enter(false);
  document.getElementById('lb-code').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') enter(false); };
  document.getElementById('lb-url').onkeydown = e => e.stopPropagation();
  document.getElementById('lb-back').onclick = () => { N.lobbyOpen = false; GC.menu(); };
}
function showRoom() {
  N.lobbyOpen = true;
  UI.showModal(`<div class="w3dlg lobby"><h2>房间 <span id="lb-rc" class="lb-code"></span></h2>
    <div id="lb-players" class="lb-players"></div>
    <div id="lb-set" class="lb-set"></div>
    <div id="lb-chat" class="lb-chat"></div>
    <input id="lb-say" class="w3input" maxlength="80" placeholder="聊天，回车发送" autocomplete="off">
    <div class="lb-row"><button class="w3btn" id="lb-ready"></button><button class="w3btn" id="lb-leave">离开房间</button></div>
    <div class="w3hint" id="lb-hint"></div></div>`, true);
  const say = document.getElementById('lb-say');
  say.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && say.value.trim()) { post('chat', { text: say.value }).catch(() => {}); say.value = ''; } };
  document.getElementById('lb-leave').onclick = () => { leave(); showConnect(); };
  renderRoom();
}
const MODE_CN = { rookie: '新人随机', origin: '原版数值' };
function renderRoom() {
  const R = N.room, $ = id => document.getElementById(id);
  if (!$('lb-players')) return;
  $('lb-rc').textContent = N.code || '';
  if (!R) { $('lb-hint').textContent = '正在进入房间…'; return; }
  const me = R.players.find(p => p.id === N.id), host = !!(me && me.host), n = R.players.length;
  $('lb-players').innerHTML = R.players.map(p => {
    const peer = N.peers.get(p.id), link = p.id === N.id ? '' : peer && peer.open ? `<i class="ok">已连通${peer.rtt != null ? ' ' + peer.rtt + 'ms' : ''}${peer.stage === 'relay' ? '（中继）' : ''}</i>` : '<i class="wait">连接中…</i>';
    return `<div class="lb-p"><b>${p.seat + 1}</b><span class="nm">${esc(p.name)}${p.host ? ' <em>房主</em>' : ''}${p.id === N.id ? ' <em>你</em>' : ''}</span>
      <span class="st ${p.host || p.ready ? 'ok' : 'wait'}">${p.host ? '—' : p.ready ? '已准备' : '未准备'}</span>${link}${host && p.id !== N.id ? `<button data-kick="${p.id}">踢出</button>` : ''}</div>`;
  }).join('');
  $('lb-players').querySelectorAll('[data-kick]').forEach(b => { b.onclick = () => post('kick', { id: b.dataset.kick }).catch(() => {}); });
  const S = R.settings;
  $('lb-set').innerHTML = host
    ? `模式 <select id="lb-mode">${Object.entries(MODE_CN).map(([k, v]) => `<option value="${k}"${k === S.mode ? ' selected' : ''}>${v}</option>`).join('')}</select>
       <label><input type="checkbox" id="lb-all"${S.allGates ? ' checked' : ''}> 8 个出怪口全开（原图：没人的口也出怪）</label>`
    : `模式：<b>${MODE_CN[S.mode]}</b>　出怪口：<b>${S.allGates ? '8 个全开（原图）' : `按人数开 ${n} 个`}</b>`;
  if (host) {
    $('lb-mode').onchange = e => post('settings', { mode: e.target.value }).catch(() => {});
    $('lb-all').onchange = e => post('settings', { allGates: e.target.checked }).catch(() => {});
  }
  const box = $('lb-chat'), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
  box.innerHTML = N.chat.map(c => c.name ? `<div><b>${esc(c.name)}</b>：${esc(c.text)}</div>` : `<div class="sys">${esc(c.text)}</div>`).join('');
  if (atEnd) box.scrollTop = box.scrollHeight;
  const ids = R.players.map(p => p.id), mesh = R.players.every(p => ids.every(id => id === p.id || p.links.includes(id)));
  const notReady = R.players.filter(p => !p.host && !p.ready).map(p => p.name);
  const stuck = [...N.peers.values()].some(p => !p.open && Date.now() - p.connectingSince > 20000);
  const connectionNote = stuck ? (N.ice.turn ? '连接较慢，正在尝试中继；可检查网络后重新加入。' : '暂时无法与队友直连。请尝试切换网络后重新加入；当前大厅尚未启用跨网络中继。') : '';
  const btn = $('lb-ready');
  if (host) {
    const why = notReady.length ? `等待准备：${notReady.join('、')}` : !mesh ? '玩家之间还在连接…' : null;
    btn.textContent = `开始游戏（${n} 人）`; btn.disabled = !!why;
    btn.onclick = () => post('start').catch(e => { $('lb-hint').innerHTML = `<b style="color:#ff8f86">${esc(e.message)}</b>`; });
    $('lb-hint').innerHTML = why || (n === 1 ? '只有你一个人也可以开始（一个人的联机局）。把房间码告诉朋友，让他们加入' : '全员准备好了，可以开始');
  } else {
    btn.textContent = me && me.ready ? '取消准备' : '准备'; btn.disabled = false;
    btn.onclick = () => post('me', { ready: !(me && me.ready) }).catch(() => {});
    $('lb-hint').innerHTML = `把房间码 <b>${N.code}</b> 告诉朋友。全员准备、互相连通后房主开始。版本 ${esc(R.v)}`;
  }
  if (connectionNote) $('lb-hint').textContent = connectionNote;
}

window.GC_NET = { send, snap, leave, open(name) { N.name = name; if (N.token && N.room && !N.inGame) showRoom(); else { if (N.token || N.peers.size) leave(); showConnect(); } },
  get inGame() { return N.inGame; }, debug: N };
})();
