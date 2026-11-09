const crypto = require('crypto');

// AES-256-CTR me kisi bhi byte offset se decrypt (video seek/range ke liye)
function ctrAt(key, iv, offset) {
  const ivb = Buffer.from(iv);
  let carry = Math.floor(offset / 16);
  for (let i = 15; i >= 0 && carry > 0; i--) {
    const v = ivb[i] + (carry % 256);
    ivb[i] = v & 255;
    carry = Math.floor(carry / 256) + (v > 255 ? 1 : 0);
  }
  const d = crypto.createDecipheriv('aes-256-ctr', key, ivb);
  const skip = offset % 16;
  if (skip) d.update(Buffer.alloc(skip));
  return d;
}

function parseRange(h, size) {
  const m = /bytes=(\d*)-(\d*)/.exec(h || '');
  if (!m) return null;
  let s = m[1] === '' ? null : +m[1];
  let e = m[2] === '' ? null : +m[2];
  if (s === null) {
    if (e === null) return null;
    s = Math.max(0, size - e);
    e = size - 1;
  } else if (e === null || e >= size) e = size - 1;
  if (s > e || s >= size) return 'bad';
  return { s, e };
}

module.exports = { ctrAt, parseRange };
