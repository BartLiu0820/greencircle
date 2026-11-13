const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.GAME_URL||'https://greencircle.preview.greatsong.online';
const count=Number(process.env.PLAYERS||4),duration=Number(process.env.SOAK_SECONDS||120),out=process.env.REPORT||'/tmp/greencircle-soak.json';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={origin,players:count,startedAt:new Date().toISOString(),fixture:'Automated defense clears creatures after 1 second with existing debug kill/hurt/build helpers; real wave scheduling, replication, lobby and TLS TURN. Static binary assets cached from local checkout. Network faults close RTC transports and block lobby HTTP.',events:[],errors:[]};
let browser,pages=[],contexts=[],offline=[];
const staleSince=new Map(),killStable=new Map();
async function consistency(label){
 const states=await sample(label),now=Date.now();
 assert(states.every(s=>s.phase==='run'&&s.inGame),'match stopped unexpectedly');
 assert.equal(new Set(states.map(s=>s.host)).size,1,'host election diverged');
 assert(Math.max(...states.map(s=>s.wave))-Math.min(...states.map(s=>s.wave))<=1,'wave drift');
 const current=new Set();
 for(const owner of states){
  const kills=owner.players[owner.me].kills,prior=killStable.get(owner.me);
  if(!prior||prior.kills!==kills)killStable.set(owner.me,{kills,at:now});
  else if(now-prior.at>5000)for(const replica of states)assert.equal(replica.players[owner.me].kills,kills,'settled kill counters diverged');
 }
 for(const s of states){
  assert.equal(new Set(s.monsters.map(m=>m.id)).size,s.monsters.length,'duplicate monster');
  for(const m of s.monsters.filter(m=>m.proxy)){
   const owner=states.find(o=>o.me===m.own);
   if(owner&&!owner.monsters.some(o=>o.id===m.id&&!o.proxy)){
    const key=s.me+':'+m.id;current.add(key);if(!staleSince.has(key))staleSince.set(key,now);
    assert(now-staleSince.get(key)<10000,'orphan monster persists: '+key);
   }
  }
 }
 for(const key of staleSince.keys())if(!current.has(key))staleSince.delete(key);
 return states;
}
async function checkTowers(){
 await delay(2000);const states=await sample('tower-convergence');
 for(const own of states)for(const other of states.filter(s=>s.me!==own.me))
 assert.deepEqual(other.ghosts.filter(t=>t.pid===own.me).map(({id,lv})=>({id,lv})).sort((a,b)=>a.id-b.id),own.towers.sort((a,b)=>a.id-b.id));
}
async function outage(victim,seconds){
 offline[victim]=true;await contexts[victim].setOffline(true);
 await pages[victim].evaluate(()=>{for(const p of GC_NET.debug.peers.values()){p.ctl.close();p.pc.close()}});
 log('outage-start',{player:victim,seconds});await delay(seconds*1000);
 offline[victim]=false;await contexts[victim].setOffline(false);log('outage-end',{player:victim});
 await healthy(pages.filter(Boolean).length);await delay(4000);await consistency('reconnected');
}
function log(event,data={}){const item={at:new Date().toISOString(),event,...data};report.events.push(item);fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(item))}
async function state(p){return p.evaluate(()=>{const g=__G(),n=GC_NET.debug;return {me:g.me,t:g.t,phase:g.phase,overReason:g.phase==='over'?document.querySelector('#modal-box')?.textContent:null,wave:g.wave,timer:g.timer,host:g.roster.find(p=>p&&!p.out)?.slot,players:g.roster.map(p=>p&&({slot:p.slot,out:p.out,kills:p.kills})),cap:__dbg.cap(),inGame:n.inGame,token:!!n.token,peers:[...n.peers.values()].map(p=>({open:p.open,state:p.pc?.connectionState,queue:p.protocol?.pending.size ?? p.queue.length,stage:p.stage,gen:p.gen})),towers:g.towers.filter(t=>!t.hide).map(t=>({id:t.id,lv:t.lv})),ghosts:g.ghosts.map(t=>({id:t.id,pid:t.pid,lv:t.lv})),monsters:g.monsters.filter(m=>!m.dead&&!m.neutral&&!m.spirit).map(m=>({id:m.id,own:m.own,proxy:!!m.proxy,hp:m.hp,x:Math.round(m.x),y:Math.round(m.y)})),mem:performance.memory?.usedJSHeapSize};})}
async function sample(label){const s=await Promise.all(pages.filter(Boolean).map(state));log(label,{states:s});return s}
async function healthy(expected,timeout=45000){const start=Date.now();for(;;){const s=await Promise.all(pages.filter(Boolean).map(state));if(s.every(x=>x.inGame&&x.players.filter(p=>p&&!p.out).length===expected&&x.peers.length===expected-1&&x.peers.every(p=>p.open)))return s;if(Date.now()-start>timeout){log('unhealthy',{states:s});throw new Error('players did not reconnect / converge')}await delay(1000)}}
async function fixture(p){await p.evaluate(()=>{const g=__G();g.gold=100000;g.foodCap=100;const pos=__dbg.NODES[__dbg.GATES[g.me][0]];const t=__dbg.buildTower('神圣塔',pos[0]+200,pos[1]+200);window.__fixtureTower=t.id;
const ages=new Map();window.__defense=setInterval(()=>{const g=__G();if(!g.mp||g.mp.dead)return;for(const m of g.monsters){if(m.dead||m.neutral||m.spirit)continue;if(!ages.has(m.id))ages.set(m.id,performance.now());if(performance.now()-ages.get(m.id)>1000)__dbg.kill(m,g.builder)}for(const id of ages.keys())if(!g.monsters.some(m=>m.id===id&&!m.dead))ages.delete(id)},100);
})}
(async()=>{browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
try{
 for(let i=0;i<count;i++){
 const c=await browser.newContext({viewport:{width:800,height:600}});contexts.push(c);offline[i]=false;
 await c.addInitScript(({origin})=>{window.__rtcErrors=[];const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native {constructor(...args){super(...args);this.addEventListener('icecandidateerror',e=>window.__rtcErrors.push({code:e.errorCode,text:e.errorText,url:e.url}));}};localStorage.setItem('gc.net.url',origin+'/lobby');localStorage.setItem('gc.net.relay',String(Date.now()+3600000))},{origin});
 await c.route('**/lobby/**',r=>offline[i]?r.abort('internetdisconnected'):r.continue());
 const assetRoot=path.resolve(__dirname,'../h5');
 await c.route('**/assets/**',async r=>{const u=new URL(r.request().url());if(/\.(js|json)$/.test(u.pathname))return r.continue();const f=path.resolve(assetRoot,'.'+decodeURIComponent(u.pathname));if(!f.startsWith(assetRoot+path.sep))return r.abort();try{await r.fulfill({path:f})}catch{await r.continue()}});
 const p=await c.newPage();pages.push(p);p.on('pageerror',e=>{report.errors.push({player:i,message:e.message,stack:e.stack});log('pageerror',{player:i,message:e.message,stack:e.stack})});p.on('console',m=>{if(['warning','error'].includes(m.type())&&/\[(net|mp)\]/.test(m.text())){report.errors.push({player:i,message:m.text()});log('console-error',{player:i,message:m.text()})}});
 await p.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>!!window.GC_NET,null,{timeout:60000});
 await p.waitForFunction(()=>document.querySelector('#boot').classList.contains('gone')||!document.querySelector('#boot-skip').hidden,null,{timeout:60000});if(await p.locator('#boot-skip').isVisible())await p.locator('#boot-skip').click();
 await p.locator('#p-name').fill('联机测试'+(i+1));await p.locator('#p-ok').click();await p.getByRole('button',{name:'联机（房间码）',exact:true}).click();
 if(i===0){await p.locator('#lb-create').click();await p.locator('#lb-rc').waitFor();report.room=await p.locator('#lb-rc').textContent()}else{await p.locator('#lb-code').fill(report.room);await p.locator('#lb-join').click();await p.locator('#lb-rc').waitFor();await p.getByRole('button',{name:'准备',exact:true}).click()}
 log('player-joined',{player:i});
 }
 await pages[0].locator('#lb-ready:not([disabled])').click({timeout:90000});
 for(const p of pages){await p.waitForFunction(()=>GC_NET.inGame);await fixture(p)}
 await healthy(count);await pages[0].locator('#btn-start').click();await delay(12000);await sample('warmup');
 const victim=count-1;
 await outage(victim,8);await checkTowers();
 // Closing only the snapshot channel must also replace the transport.
 const generations=await pages[victim].evaluate(()=>[...GC_NET.debug.peers.values()].map(p=>p.gen));
 await pages[victim].evaluate(()=>[...GC_NET.debug.peers.values()][0].snap.close());
 log('snapshot-channel-fault');await delay(3000);await healthy(count);await consistency('snapshot-recovered');
 assert((await pages[victim].evaluate(()=>[...GC_NET.debug.peers.values()].map(p=>p.gen))).some((g,i)=>g>generations[i]));
 const start=Date.now();let hostLeft=false,hostCrashed=false,secondOutage=false,hostOutage=false;
 while(Date.now()-start<duration*1000){
  await delay(5000);const elapsed=Date.now()-start;
  if(!secondOutage&&elapsed>Math.min(90000,duration*200)){
   secondOutage=true;await outage(victim,20);
   await pages[victim].evaluate(()=>{const t=__G().towers.find(t=>t.id===window.__fixtureTower);__dbg.upgradeTower(t);});
   await checkTowers();
   await pages[victim].evaluate(()=>{const t=__G().towers.find(t=>t.id===window.__fixtureTower);__dbg.sellTower(t);});
   await checkTowers();
  }
  if(duration>=300&&!hostOutage&&elapsed>Math.min(180000,duration*250)){hostOutage=true;log('host-short-outage');await outage(0,12);}
  if(!hostLeft&&elapsed>Math.min(300000,duration*400)){
   log('host-exit');await pages[0].close();pages[0]=null;hostLeft=true;
   await healthy(count-1,50000);await checkTowers();
  }
  if(count>=4&&!hostCrashed&&elapsed>Math.min(600000,duration*650)){
   const beforeCrash=await state(pages[1]);log('host-crash',{wave:beforeCrash.wave,timer:beforeCrash.timer});offline[1]=true;await contexts[1].setOffline(true);
   // Crash renderer without running pagehide/sendBeacon, then wait for server expiry.
   const cdp=await contexts[1].newCDPSession(pages[1]);
   const crashed=pages[1].waitForEvent('crash',{timeout:10000});
   cdp.send('Page.crash').catch(()=>{});await crashed;await pages[1].close().catch(()=>{});pages[1]=null;log('host-process-stopped');
   hostCrashed=true;await healthy(count-2,80000);await checkTowers();const afterCrash=await consistency('host-crash-recovered');assert(afterCrash.every(s=>s.wave<=beforeCrash.wave+1),'host takeover skipped a wave');
  }
  await consistency('soak');
 }
 await healthy(pages.filter(Boolean).length);await checkTowers();
 // Inspect actual ICE routes, not merely the configured preference.
 log('transport-stats',{players:await Promise.all(pages.filter(Boolean).map(p=>p.evaluate(async()=>{
  const links=[];for(const p of GC_NET.debug.peers.values()){
   const stats=await p.pc.getStats();for(const x of stats.values())if(x.type==='candidate-pair'&&x.state==='succeeded'&&x.nominated){const a=stats.get(x.localCandidateId),b=stats.get(x.remoteCandidateId);links.push({local:a?.candidateType,remote:b?.candidateType,relayProtocol:a?.relayProtocol,rtt:x.currentRoundTripTime,bytesSent:x.bytesSent,bytesReceived:x.bytesReceived});}
  }return links;
 })))});
 report.wallSeconds=(Date.now()-Date.parse(report.startedAt))/1000;assert.deepEqual(report.errors,[]);report.passed=true;log('passed',{wallSeconds:report.wallSeconds});
}catch(e){report.passed=false;report.failure=e.message;await sample('failed').catch(()=>{});
 log('connection-diagnostics',{players:await Promise.all(pages.filter(Boolean).map(p=>p.evaluate(async()=>({errors:window.__rtcErrors,room:GC_NET.debug.room?.players.map(p=>({id:p.id,ready:p.ready,links:p.links})),peers:await Promise.all([...GC_NET.debug.peers.values()].map(async p=>({id:p.id,offerer:p.offerer,gen:p.gen,remoteSet:p.remoteSet,stats:p.pc?[...((await p.pc.getStats()).values())].filter(s=>['candidate-pair','local-candidate','remote-candidate','transport'].includes(s.type)):[]})))})).catch(()=>({unavailable:true}))))});log('failure',{message:e.message});process.exitCode=1}
finally{for(const p of pages.filter(Boolean))await p.evaluate(()=>GC_NET.leave()).catch(()=>{});if(browser)await browser.close();fs.writeFileSync(out,JSON.stringify(report,null,2))}
})().catch(e=>{console.error(e);process.exitCode=1});
