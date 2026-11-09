// ====== SIRF YAHAN SE SETTINGS BADLO ======
module.exports = {
  // Jo page extended screen pe chalana hai
  START_URL: 'https://vj2.dkedits.in/',

  // App is time ke baad expire: tab sirf "Expired + Uninstall" screen dikhegi
  // (India time, 15 Nov 2026 subah 12:00 AM se)
  EXPIRY: '2026-11-15T00:00:00+05:30',

  // true = output SIRF extended screen pe. Extended nahi hai to wait screen, lagte hi output turant chalu
  EXTENDED_ONLY: true,
  // true = video/canvas poori screen pe stretch (aspect ratio ignore)
  STRETCH: true,
  ALWAYS_ON_TOP: true,
  HIDE_CURSOR: true,

  // Website pe naya update aaya ya nahi, har itne ms me check (online ho tab)
  UPDATE_CHECK_MS: 60 * 1000,

  // Offline cache (video + page) is secret se encrypt hota hai. Apna kuch bhi rakh lo.
  CACHE_SECRET: 'dk-edits-vj-change-this-secret-2026'
};
