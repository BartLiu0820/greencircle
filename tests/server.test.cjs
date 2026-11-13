const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
let child; const base = 'http://127.0.0.1:18787';
const request = async (url, data) => { const r = await fetch(base + '/lobby' + url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}); return { status: r.status, data: await r.json() }; };
before(async () => {
 child = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '18787', STATIC_DIR: path.resolve('h5') }, stdio: 'pipe' });
 await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error('exit ' + code))); });
});
after(() => child.kill());
test('HTTPS proxy path serves frontend, lobby and assets with correct MIME and cache validation', async () => {
 const root = await fetch(base); assert.equal(root.status, 200); assert.match(await root.text(), /net.js\?v=20261112b/); assert.equal(root.headers.get('cache-control'), 'no-store');
 const js = await fetch(base + '/net.js'); assert.match(js.headers.get('content-type'), /javascript/); assert.match(await js.text(), /location.origin/);
 const unchanged = await fetch(base + '/net.js', { headers: { 'If-None-Match': js.headers.get('etag') } }); assert.equal(unchanged.status, 304);
 for (const name of ['/missing.js', '/server/server.js', '/.git/config', '/%2e%2e%2fserver/server.js']) assert.equal((await fetch(base + name)).status, 404, name);
 assert.equal((await request('/')).data.ok, true); assert.ok(Array.isArray((await request('/ice')).data.iceServers));
});
test('two players create/join, exchange signals, ready, start and leave through /lobby', async () => {
 const a = (await request('/rooms', { name: '测试甲', v: 'test' })).data;
 assert.equal((await request(`/rooms/${a.code}/join`, { name: '测试乙', v: 'wrong' })).status, 409);
 const b = (await request(`/rooms/${a.code}/join`, { name: '测试乙', v: 'test' })).data;
 const post = (who, action, data = {}) => request(`/rooms/${a.code}/${action}`, { token: who.token, ...data });
 assert.equal((await post(a, 'start')).status, 409);
 await post(a, 'signal', { to: b.id, kind: 'offer', data: { sdp: 'test-sdp' } });
 const poll = (await request(`/rooms/${a.code}/poll?token=${b.token}`)).data;
 assert.equal(poll.room.players.length, 2); assert.equal(poll.signals[0].data.sdp, 'test-sdp');
 await post(a, 'me', { links: [b.id] }); await post(b, 'me', { links: [a.id], ready: true });
 assert.equal((await post(a, 'start')).status, 200);
 assert.equal((await request(`/rooms/${a.code}/poll?token=${b.token}`)).data.room.state, 'playing');
 await post(b, 'leave'); await post(a, 'leave');
 assert.equal((await request(`/rooms/${a.code}/poll?token=${b.token}`)).status, 404);
});
