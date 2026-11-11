#!/usr/bin/env node
// 绿色循环圈 H5 联机：大厅 + 信令服务（零依赖，Node 18+）。只管把人凑到一起和转发 WebRTC 信令，对局数据不过这里。
//   node server/server.js            默认监听 8787
// 环境变量：PORT；STUN_URLS（逗号分隔，默认 stun:stun.cloudflare.com:3478，设成空串就不下发 STUN）；
//   TURN_URLS + TURN_SECRET（coturn 的 use-auth-secret / static-auth-secret：下发 1 小时有效的临时凭证）
// 结构：room.js 是纯逻辑的 Room（以后放进 Durable Object），这里是路由 + 房间表（以后是 Worker）。
'use strict';
const http = require('http'), crypto = require('crypto');
const { Room } = require('./room.js');

const PORT = +process.env.PORT || 8787;
const STUN = (process.env.STUN_URLS ?? 'stun:stun.cloudflare.com:3478').split(',').map(s => s.trim()).filter(Boolean);
const TURN = (process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean), TURN_SECRET = process.env.TURN_SECRET || '';
const rooms = new Map();
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE[crypto.randomInt(CODE.length)]; if (!rooms.has(c)) return c; } };

function ice() {
  const iceServers = STUN.length ? [{ urls: STUN }] : [];
  if (TURN.length && TURN_SECRET) {
    const username = String(Math.floor(Date.now() / 1000) + 3600);
    iceServers.push({ urls: TURN, username, credential: crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64') });
  }
  return { iceServers, turn: TURN.length > 0 && !!TURN_SECRET };
}

async function route(method, path, query, body) {
  if (method === 'GET' && path === '/') return { status: 200, json: { ok: true, rooms: rooms.size } };
  if (method === 'GET' && path === '/ice') return { status: 200, json: ice() };
  if (method === 'POST' && path === '/rooms') {
    if (rooms.size > 2000) return { status: 503, json: { error: '房间太多了，稍后再试' } };
    const room = new Room(newCode(), String(body.v || ''));
    const r = room.join(body.name, room.v);
    if (r.status === 200) rooms.set(room.code, room);
    return r;
  }
  const m = /^\/rooms\/([A-Za-z0-9]{4})\/([a-z]+)$/.exec(path);
  if (!m) return { status: 404, json: { error: '没有这个接口' } };
  const room = rooms.get(m[1].toUpperCase());
  if (!room) return { status: 404, json: { error: '没有这个房间（房间码不对，或者房间已经关闭）' } };
  if ((m[2] === 'poll') !== (method === 'GET')) return { status: 405, json: { error: '方法不对' } };
  const r = await room.handle(m[2], query.token || body.token, body, query);
  if (room.empty) rooms.delete(room.code);
  return r;
}

setInterval(() => {
  for (const room of rooms.values()) { room.sweep(); if (room.empty || Date.now() - room.touched > 6 * 3600e3) rooms.delete(room.code); }
}, 5000).unref();

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x'), chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 256e3) req.destroy(); else chunks.push(c); });
  req.on('end', async () => {
    let body = {}, out;
    try { if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString('utf8')) || {}; } catch (e) { body = null; }
    try { out = body ? await route(req.method, url.pathname, Object.fromEntries(url.searchParams), body) : { status: 400, json: { error: '请求格式不对' } }; }
    catch (e) { console.error(e); out = { status: 500, json: { error: '服务器出错' } }; }
    res.writeHead(out.status, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(out.json));
  });
}).listen(PORT, () => console.log(`绿色循环圈 联机大厅 / 信令服务：http://localhost:${PORT}（STUN ${STUN.length ? STUN.join(' ') : '无'}，TURN ${TURN.length && TURN_SECRET ? TURN.join(' ') : '未配置'}）`));
