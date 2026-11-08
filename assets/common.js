// כלים משותפים לכל עמודי האתר
(function () {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  // מאשר רק קישורי http(s) או נתיבים פנימיים של האתר
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (/^(\.\.\/)*(uploads\/|post\.html|kids\/|index\.html|\.\/)/i.test(u)) return u;
    return '';
  }
  function asset(u, base) {
    var s = safeUrl(u);
    if (!s) return '';
    return /^https?:/i.test(s) ? s : (base || '') + s;
  }

  function getJSON(path) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(path + sep + 'v=' + Date.now().toString(36), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function when(ms) {
    var d = new Date(ms), now = new Date();
    if (sameDay(d, now)) return 'היום ' + hm(d);
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(d, y)) return 'אתמול ' + hm(d);
    return d.getDate() + '.' + (d.getMonth() + 1) + ' ' + hm(d);
  }
  function ago(ms) {
    var m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return 'עכשיו';
    if (m < 60) return m === 1 ? 'לפני דקה' : 'לפני ' + m + ' דק׳';
    var h = Math.floor(m / 60);
    if (h < 12) return h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : 'לפני ' + h + ' שעות';
    return when(ms);
  }
  function clock(ms) { var d = new Date(ms); return sameDay(d, new Date()) ? hm(d) : when(ms); }

  // מספר באותיות עבריות: 28 ← כ״ח, 5787 ← תשפ״ז
  function gematria(n) {
    var ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    var tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    var hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
    n = n % 1000;
    var r = n % 100;
    var s = hundreds[Math.floor(n / 100)] + (r === 15 ? 'טו' : r === 16 ? 'טז' : tens[Math.floor(r / 10)] + ones[r % 10]);
    return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
  }
  function hebParts(d) {
    var out = {};
    new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d || new Date())
      .forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  function hebDate(d) {
    try {
      var p = hebParts(d);
      var day = parseInt(p.day, 10), year = parseInt(p.year, 10);
      if (!day || !year) throw new Error('no numbers');
      return gematria(day) + ' ב' + p.month + ' ' + gematria(year);
    } catch (e) {
      try { return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(d || new Date()); } catch (e2) { return ''; }
    }
  }
  function gregDate(d) {
    try { return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d || new Date()); } catch (e) { return ''; }
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function isBlocked(text, words) {
    if (!words || !words.length) return false;
    var low = String(text || '').toLowerCase();
    return words.some(function (w) {
      w = String(w || '').trim().toLowerCase();
      if (!w) return false;
      return /^[a-z0-9 ]+$/.test(w) ? new RegExp('\\b' + escRe(w) + '\\b').test(low) : low.indexOf(w) >= 0;
    });
  }

  function ytId(u) {
    var m = String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    return m ? m[1] : '';
  }

  // הופך כתובות בטקסט (שכבר עבר esc) לקישורים
  function linkify(escaped) {
    return escaped.replace(/https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<])+/g, function (u) {
      var trail = (u.match(/[.,;:!?)\]]+$/) || [''])[0];
      u = u.slice(0, u.length - trail.length);
      var label = u.length > 48 ? u.slice(0, 45) + '…' : u;
      return '<a href="' + u + '" target="_blank" rel="noopener" dir="ltr">' + label + '</a>' + trail;
    });
  }

  function emptyContent() {
    return { settings: {}, posts: [], ads: [], flashes: [], stories: [], pinned: [], hidden: [], hiddenScores: [], kids: { submitLink: '', gallery: [] }, sources: { disabled: [], extra: [] } };
  }
  function normContent(c) {
    var e = emptyContent();
    c = c && typeof c === 'object' ? c : {};
    Object.keys(e).forEach(function (k) { if (c[k] == null) c[k] = e[k]; });
    c.settings = Object.assign({ siteName: 'חב״ד בזמן אמת', tagline: '', breaking: {}, generalImages: false, blockedWords: [], whatsappChannel: '', filters: {} }, c.settings || {});
    c.settings.breaking = c.settings.breaking || {};
    c.settings.filters = Object.assign({ women: true, weather: true, sports: true, gossip: true, lifestyle: true, markets: true, promo: true }, c.settings.filters || {});
    c.kids = Object.assign({ submitLink: '', gallery: [] }, c.kids || {});
    return c;
  }

  function activeAds(content, placement) {
    var today = new Date().toISOString().slice(0, 10);
    return (content.ads || []).filter(function (a) {
      return a && a.active !== false && a.placement === placement && a.image && (!a.until || a.until >= today);
    });
  }
  function adHTML(ad, base) {
    var img = asset(ad.image, base);
    if (!img) return '';
    var link = safeUrl(ad.link);
    var inner = '<img src="' + esc(img) + '" alt="' + esc(ad.name || 'פרסומת') + '" loading="lazy">';
    return '<div class="ad"><span class="ad-label">פרסומת</span>' +
      (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener sponsored">' + inner + '</a>' : inner) + '</div>';
  }

  window.Site = {
    esc: esc, safeUrl: safeUrl, asset: asset, getJSON: getJSON, ago: ago, when: when, clock: clock,
    hebDate: hebDate, gregDate: gregDate, gematria: gematria, isBlocked: isBlocked, ytId: ytId, linkify: linkify,
    emptyContent: emptyContent, normContent: normContent, activeAds: activeAds, adHTML: adHTML,
  };
})();
