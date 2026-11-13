// 一个房间的全部状态和处理逻辑（不碰 http / 文件 / 全局），方便以后原样放进 Cloudflare Durable Object。
// 外层（server.js）只做路由：handle(action, token, body, query) → { status, json } 或 Promise（长轮询）。
'use strict';

const MAX_PLAYERS = 8, POLL_MS = 25000, GONE_MS = 60000, CHAT_KEEP = 60;
const MODES = ['rookie', 'origin'];
const rid = n => { let s = ''; for (let i = 0; i < n; i++) s += 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]; return s; };
const ok = json => ({ status: 200, json });
const err = (status, error) => ({ status, json: { error } });

class Room {
  constructor(code, v, now = Date.now) {
    this.code = code; this.v = v; this.now = now;
    this.ver = 1; this.state = 'lobby';
    this.settings = { mode: 'rookie', allGates: false };
    this.players = [];          // { id, token, name, seat, ready, links, seen, signals: [], waiter }
    this.chat = []; this.chatSeq = 0;
    this.touched = now();
  }
  get empty() { return !this.players.length; }
  by(token) { return this.players.find(p => p.token === token); }
  host() { return this.players.reduce((a, p) => !a || p.seat < a.seat ? p : a, null); }
  view() {
    const h = this.host();
    return { code: this.code, v: this.v, state: this.state, settings: this.settings,
      players: this.players.slice().sort((a, b) => a.seat - b.seat).map(p => ({ id: p.id, name: p.name, seat: p.seat, ready: p.ready, links: p.links, host: p === h })) };
  }
  bump() { this.ver++; this.wake(); }
  wake(only) { for (const p of this.players) if ((!only || p === only) && p.waiter) { const w = p.waiter; p.waiter = null; w(); } }
  say(name, text) { this.chat.push({ seq: ++this.chatSeq, name, text }); if (this.chat.length > CHAT_KEEP) this.chat.shift(); this.wake(); }

  join(name, v) {
    name = String(name || '').trim().slice(0, 12);
    if (!name) return err(400, '请先输入玩家名称');
    if (v !== this.v) return err(409, `版本不一致：房间是 ${this.v}，你是 ${v}，请刷新页面`);
    if (this.state !== 'lobby') return err(403, '这个房间已经开始了');
    if (this.players.length >= MAX_PLAYERS) return err(403, '房间满了');
    if (this.players.some(p => p.name === name)) return err(409, `房间里已经有叫"${name}"的玩家`);
    let seat = 0; while (this.players.some(p => p.seat === seat)) seat++;
    const p = { id: rid(6), token: rid(24), name, seat, ready: false, links: [], seen: this.now(), signals: [], waiter: null };
    this.players.push(p);
    this.say('', `${name} 进入了房间`);
    this.bump();
    return ok({ code: this.code, token: p.token, id: p.id });
  }
  remove(p, why) {
    const i = this.players.indexOf(p); if (i < 0) return;
    this.players.splice(i, 1);
    if (p.waiter) { const w = p.waiter; p.waiter = null; w(); }
    for (const q of this.players) q.links = q.links.filter(id => id !== p.id);
    this.say('', `${p.name} ${why}`);
    this.bump();
  }
  // 定时清掉不再轮询的人（外层每隔几秒调一次）
  sweep() { const t = this.now(); for (const p of this.players.slice()) if (t - p.seen > GONE_MS) this.remove(p, '掉线了'); }

  handle(action, token, body = {}, query = {}) {
    this.touched = this.now();
    if (action === 'join') return this.join(body.name, body.v);
    const p = this.by(token);
    if (!p) return err(410, '你已经不在这个房间里（被踢出、掉线或房间已关闭）');
    p.seen = this.now();
    const isHost = this.host() === p;
    switch (action) {
      case 'poll': return this.poll(p, +query.ver || 0, +query.chat || 0);
      case 'me':
        if (typeof body.ready === 'boolean' && this.state === 'lobby') p.ready = body.ready;
        if (Array.isArray(body.links)) p.links = body.links.filter(id => typeof id === 'string').slice(0, MAX_PLAYERS);
        this.bump(); return ok({});
      case 'settings':
        if (!isHost || this.state !== 'lobby') return err(403, '只有房主能在开始前改设置');
        if (MODES.includes(body.mode)) this.settings.mode = body.mode;
        if (typeof body.allGates === 'boolean') this.settings.allGates = body.allGates;
        this.bump(); return ok({});
      case 'chat': {
        const text = String(body.text || '').trim().slice(0, 80);
        if (text) this.say(p.name, text);
        return ok({});
      }
      case 'kick': {
        if (!isHost || this.state !== 'lobby') return err(403, '只有房主能在开始前踢人');
        const q = this.players.find(x => x.id === body.id);
        if (q && q !== p) this.remove(q, '被房主请出了房间');
        return ok({});
      }
      case 'signal': {
        const q = this.players.find(x => x.id === body.to);
        if (!q) return err(404, '对方不在房间里');
        q.signals.push({ from: p.id, kind: String(body.kind), data: body.data });
        if (q.signals.length > 200) q.signals.shift();
        this.wake(q); return ok({});
      }
      case 'start': {
        if (!isHost) return err(403, '只有房主能开始');
        if (this.state !== 'lobby') return err(403, '已经开始了');
        if (this.players.some(x => x !== p && !x.ready)) return err(409, '还有人没准备');
        const ids = this.players.map(x => x.id);
        if (this.players.some(x => ids.some(id => id !== x.id && !x.links.includes(id)))) return err(409, '玩家之间还没有全部连通');
        this.players.sort((a, b) => a.seat - b.seat).forEach((x, i) => { x.seat = i; });   // 压成 slot 0..N-1
        this.state = 'playing';
        this.bump(); return ok({});
      }
      case 'leave': this.remove(p, '离开了房间'); return ok({});
    }
    return err(404, '没有这个接口');
  }
  poll(p, ver, chat) {
    const answer = () => {
      const signals = p.signals; p.signals = [];
      return ok({ ver: this.ver, room: this.view(), you: p.id, chat: this.chat.filter(c => c.seq > chat), signals });
    };
    if (ver !== this.ver || p.signals.length || this.chatSeq > chat) return answer();
    if (p.waiter) p.waiter();                       // 同一个人开了第二个轮询：放掉前一个
    return new Promise(resolve => {
      const timer = setTimeout(() => { if (p.waiter === fire) p.waiter = null; resolve(this.players.includes(p) ? answer() : err(410, '你已经不在这个房间里')); }, POLL_MS);
      const fire = () => { clearTimeout(timer); resolve(this.players.includes(p) ? answer() : err(410, '你已经不在这个房间里')); };
      p.waiter = fire;
    });
  }
}

module.exports = { Room, rid };
