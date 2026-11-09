const crypto = require('crypto');
const { ctrAt, parseRange } = require('../src/cryptoutil');
const key = crypto.randomBytes(32), iv = crypto.randomBytes(16);
iv.fill(255, 8, 16); // counter overflow case bhi test
const plain = crypto.randomBytes(100000);
const c = crypto.createCipheriv('aes-256-ctr', key, iv);
const enc = Buffer.concat([c.update(plain), c.final()]);
for (let n = 0; n < 300; n++) {
  const s = Math.floor(Math.random() * plain.length), e = Math.min(plain.length - 1, s + Math.floor(Math.random() * 5000));
  const d = ctrAt(key, iv, s);
  const out = Buffer.concat([d.update(enc.subarray(s, e + 1)), d.final()]);
  if (!out.equals(plain.subarray(s, e + 1))) { console.log('FAIL', s, e); process.exit(1); }
}
console.log(JSON.stringify([parseRange('bytes=0-', 100), parseRange('bytes=-10', 100), parseRange('bytes=5-20', 100), parseRange('bytes=200-', 100)]));
console.log('crypto range decrypt OK');
