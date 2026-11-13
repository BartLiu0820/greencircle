const {test}=require('node:test'),assert=require('node:assert/strict');
const {Room}=require('../server/room');
test('brief outage retains identity; authoritative expiry elects one successor',()=>{
 let now=0;const r=new Room('1234','test',()=>now);
 const a=r.join('甲','test').json,b=r.join('乙','test').json,c=r.join('丙','test').json;
 const act=(p,k,b={})=>r.handle(k,p.token,b);
 act(a,'me',{links:[b.id,c.id]});act(b,'me',{ready:true,links:[a.id,c.id]});act(c,'me',{ready:true,links:[a.id,b.id]});assert.equal(act(a,'start').status,200);
 now=20000;r.sweep();assert.equal(r.players.length,3);assert.equal(r.host().id,a.id);
 act(a,'poll'); // resume with same identity, no join or new seat
 now=60001;act(b,'me');act(c,'me');r.sweep();assert.equal(r.players.length,3);
 now=80001;act(b,'me');act(c,'me');r.sweep();assert.equal(r.players.length,2);assert.equal(r.host().id,b.id);
 assert.equal(act(a,'poll').status,410);assert.equal(r.join('丁','test').status,403);
 assert(r.players.every(p=>!p.links.includes(a.id)));
});
