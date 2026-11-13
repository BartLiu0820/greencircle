const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const origin = process.env.GAME_URL || 'http://localhost:18788';
 const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
 const report = { origin, errors: [], consoleWarnings: [] }; let pages = [];
 try {
  for (const [index, name] of ['验收甲', '验收乙'].entries()) {
   const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
   // Reproduce the stale address saved by the previous release.
   await context.addInitScript(({ origin }) => localStorage.setItem('gc.net.url', origin.startsWith('https:') ? origin + ':8787' : origin + '/lobby'), { origin });
   const page = await context.newPage(); pages.push(page);
   page.on('pageerror', e => report.errors.push(e.message));
   page.on('console', m => { if (m.type() === 'warning' && m.text().includes('[net]')) report.consoleWarnings.push(m.text()); });
   await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
   await page.waitForFunction(() => !!window.GC_NET, { timeout: 60000 });
   await page.waitForFunction(() => document.querySelector('#boot').classList.contains('gone') || !document.querySelector('#boot-skip').hidden, null, {timeout:60000});
   if (await page.locator('#boot-skip').isVisible()) await page.locator('#boot-skip').click();
   await page.locator('#p-name').fill(name); await page.locator('#p-ok').click();
   await page.getByRole('button', { name: '联机（房间码）', exact: true }).click();
   assert.equal(await page.locator('#lb-url').inputValue(), origin + '/lobby');
  }
  const [a,b] = pages;
  await a.route('**/lobby/ice', route => route.fulfill({status:200,contentType:'text/html',body:'<html>wrong route</html>'}));
  await a.locator('#lb-create').click(); await a.getByText('大厅地址未正确配置，请使用默认大厅后重试', {exact:true}).waitFor();
  assert.equal(await a.locator('#lb-create').isEnabled(), true);
  await a.unroute('**/lobby/ice');
  report.invalidEndpointRecoverable = true;
  await a.locator('#lb-create').click(); await a.locator('#lb-rc').waitFor();
  const code = await a.locator('#lb-rc').textContent(); assert.match(code, /^[A-Z0-9]{4}$/);
  await b.locator('#lb-code').fill(code); await b.locator('#lb-join').click();
  await b.locator('#lb-rc').waitFor();
  for (const page of pages) await page.waitForFunction(() => {const n=GC_NET.debug;return n.room?.players.length===2 && [...n.peers.values()].every(p=>p.open)}, null, {timeout:45000});
  report.connected = await Promise.all(pages.map(p=>p.evaluate(async()=>({players:GC_NET.debug.room.players.length, peers:await Promise.all([...GC_NET.debug.peers.values()].map(async p=>{ const stats=await p.pc.getStats(),t=[...stats.values()].find(s=>s.type==='transport' && s.selectedCandidatePairId),pair=t&&stats.get(t.selectedCandidatePairId),local=pair&&stats.get(pair.localCandidateId),remote=pair&&stats.get(pair.remoteCandidateId); return {open:p.open,stage:p.stage,state:p.pc.connectionState,localCandidateType:local?.candidateType,remoteCandidateType:remote?.candidateType,relayProtocol:local?.relayProtocol}; })),turn:GC_NET.debug.ice.turn}))));
  await a.screenshot({path:'/tmp/greencircle-lobby-verified.png'});
  await b.locator('#lb-ready').click(); await a.locator('#lb-ready:not([disabled])').click();
  for(const page of pages) await page.waitForFunction(()=>GC_NET.inGame && GC.roster().filter(p=>!p.out).length===2);
  await a.locator('#btn-start').click();
  await a.waitForFunction(()=>document.querySelector('#w-count').textContent!=='0',{timeout:20000});
  await b.waitForFunction(()=>document.querySelector('#w-count').textContent!=='0',{timeout:20000});
  report.games = await Promise.all(pages.map(p=>p.evaluate(()=>({inGame:GC_NET.inGame,roster:GC.roster().map(p=>({name:p.name,slot:p.slot,local:p.local})),wave:document.querySelector('#w-title').textContent,count:document.querySelector('#w-count').textContent,cap:document.querySelector('#w-cap').textContent}))));
  await a.screenshot({path:'/tmp/greencircle-game-verified.png'});
  assert.deepEqual(report.errors,[]); console.log(JSON.stringify(report));
  fs.writeFileSync('/tmp/greencircle-browser-result.json',JSON.stringify(report,null,2));
 } catch(e) { console.error(JSON.stringify(report)); for (let i=0;i<pages.length;i++){ console.error(await pages[i].evaluate(()=>({body:document.body.innerText.slice(-3000),debug:window.GC_NET?{url:GC_NET.debug.url,stats:GC_NET.debug.stats,peers:[...GC_NET.debug.peers.values()].map(p=>({stage:p.stage,state:p.pc?.connectionState}))}:null}))); await pages[i].screenshot({path:`/tmp/greencircle-failed-${i}.png`});} throw e;
 } finally { for(const p of pages) await p.evaluate(()=>window.GC_NET?.leave()).catch(()=>{}); await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
