const {test}=require('node:test'),assert=require('node:assert/strict');
const {ReliableEvents}=require('../h5/net-reliable.js');
test('lost event and lost acknowledgement replay once after replacement',()=>{
 const received=[],a=new ReliableEvents(()=>{}),b=new ReliableEvents(e=>received.push(e));
 a.attach(s=>b.receive(JSON.parse(s))); b.attach(()=>{}); // lose all acknowledgements
 a.send({t:'kill',id:1});assert.equal(a.pending.size,1);
 a.detach(); a.send({t:'build',id:2});
 b.attach(s=>a.receive(JSON.parse(s)));a.attach(s=>b.receive(JSON.parse(s)));
 assert.deepEqual(received,[{t:'kill',id:1},{t:'build',id:2}]);assert.equal(a.pending.size,0);assert.equal(a.bytes,0);
});
test('gap requests missing history, duplicate delivery never doubles rewards',()=>{
 const received=[],a=new ReliableEvents(()=>{}),b=new ReliableEvents(e=>received.push(e));
 a.send({reward:10});a.send({reward:20});
 const second=JSON.parse(a.pending.get(2));
 b.attach(s=>a.receive(JSON.parse(s)));a.transport=s=>b.receive(JSON.parse(s));b.receive(second);b.receive(second);
 assert.deepEqual(received,[{reward:10},{reward:20}]);assert.equal(a.pending.size,0);
});
test('future forged acknowledgements cannot erase history; queues are bounded',()=>{
 const a=new ReliableEvents(()=>{},{maxEvents:2,maxBytes:1000});a.send({t:1});a.receive({_ack:999});assert.equal(a.pending.size,1);a.send({t:2});assert.throws(()=>a.send({t:3}),/队列已满/);
});
