// Application acknowledgements survive DataChannel replacement. Game events keep
// their sequence across reconnects; unacknowledged events replay exactly once.
(function (root) {
'use strict';
class ReliableEvents {
  constructor(deliver, { maxEvents = 4096, maxBytes = 8 * 1024 * 1024 } = {}) {
    this.deliver = deliver; this.next = 1; this.received = 0; this.pending = new Map();
    this.bytes = 0; this.maxEvents = maxEvents; this.maxBytes = maxBytes; this.transport = null;
  }
  write(text) { if (!this.transport) return; try { this.transport(text); } catch (e) { this.transport = null; } }
  attach(transport) { this.transport = transport; this.replay(); this.write(JSON.stringify({ _ack: this.received })); }
  detach() { this.transport = null; }
  replay() { for (const text of this.pending.values()) this.write(text); }
  send(event) {
    const text = JSON.stringify({ _seq: this.next, event });
    if (this.pending.size >= this.maxEvents || this.bytes + text.length * 2 > this.maxBytes) throw new Error('重连等待过久，同步队列已满，请重新创建对局');
    this.pending.set(this.next++, text); this.bytes += text.length * 2; this.write(text);
  }
  receive(packet) {
    if (Number.isSafeInteger(packet._ack)) {
      if (packet._ack < 0 || packet._ack >= this.next) return true;
      for (const [seq, text] of this.pending) if (seq <= packet._ack) { this.pending.delete(seq); this.bytes -= text.length * 2; }
      if (packet.gap) this.replay();
      return true;
    }
    if (!Number.isSafeInteger(packet._seq) || packet._seq < 1 || !packet.event) return false;
    if (packet._seq === this.received + 1) { this.deliver(packet.event); this.received = packet._seq; }
    this.write(JSON.stringify({ _ack: this.received, ...(packet._seq > this.received + 1 ? { gap: true } : {}) }));
    return true;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { ReliableEvents };
else root.GC_ReliableEvents = ReliableEvents;
})(globalThis);
