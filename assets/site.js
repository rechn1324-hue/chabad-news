// העמוד הראשי: סטוריז, פיד אינסופי של כרטיסים, תצוגה מקדימה עם שיתוף, מבזקים חיים ועדכון אוטומטי
(function () {
  'use strict';
  var S = window.Site;
  var esc = S.esc;
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  var TAB_IDS = ['home', 'flash', 'chabad', 'community', 'israel', 'world', 'video'];
  var STORY_CATS = { chabad: 1, community: 1, israel: 1, world: 1, flash: 1 };
  var SUBS = { simcha: 'שמחות', event: 'אירועים', avel: 'ברוך דיין האמת' };
  var BATCH = 12;
  var POLL_MS = 3 * 60 * 1000;
  var STORY_MS = 6000;
  var HE = /[֐-׿]/;
  var BASE = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  var ICON = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>',
    tg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.8 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.2.2-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L7 13l-4.6-1.4c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  var st = {
    news: null, live: null, content: S.normContent({}), tab: 'home', sub: 'all', q: '',
    list: [], shown: 0, modules: 0, known: null, liveSig: '', liveSeen: null, lastLoad: 0,
    previews: null, previewsP: null, pushed: false, stories: [], story: null,
  };

  // ---------------------------------------------------------- helpers
  function sources() { var n = st.live || st.news; return (n && n.sources) || {}; }
  function srcInfo(i) { return sources()[i.s] || null; }
  function srcName(i) {
    if (i.own) return st.content.settings.siteName || 'מערכת האתר';
    var s = srcInfo(i);
    if (!s) return i.p || '';
    return s.pp && i.p ? i.p : s.n;
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function isGeneral(i) { if (i.own) return false; var s = srcInfo(i); return s ? !!s.g : i.c !== 'chabad'; }
  function showImg(i) { return !!i.i && (!isGeneral(i) || st.content.settings.generalImages !== false); }
  function catOf(i) { return i.own ? 'own' : i.c; }
  function byDate(a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.d - a.d; }
  function inTab(i, tab) { return tab === 'chabad' ? (i.c === 'chabad' || !!i.ch) : i.c === tab; }
  function isStory(i) { return i.c !== 'flash' && i.c !== 'video'; }
  function iso(ms) { try { return new Date(ms).toISOString(); } catch (e) { return ''; } }
  function shortsUrl(i) { return 'shorts.html?id=' + encodeURIComponent(i.id); }
  function shareUrl(i) {
    if (i.own) return BASE + 's/p-' + encodeURIComponent(i.pid) + '.html';
    if (i.client) return BASE + '#a-' + i.id;
    return BASE + 's/' + i.id + '.html';
  }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function ownItems() {
    return (st.content.posts || []).filter(function (p) { return p && p.title; }).map(function (p) {
      var v = S.ytId(p.video);
      return {
        id: 'p-' + p.id, pid: p.id, t: p.title, u: 'post.html#' + encodeURIComponent(p.id), s: '__own',
        c: ['chabad', 'israel', 'world', 'community'].indexOf(p.cat) >= 0 ? p.cat : 'chabad',
        d: +p.date || 0, x: p.summary || '', i: p.image || (v ? 'https://i.ytimg.com/vi/' + v + '/hqdefault.jpg' : ''),
        own: true, pin: !!p.pinned,
      };
    });
  }
  // ---------------------------------------------------------- Chabad Info from the visitor's browser
  // חב"ד אינפו חוסם את שרתי GitHub, אבל עונה לגולשים. כשהשרת קיבל ממנו רק כותרות (דרך גוגל),
  // הדפדפן מביא את הכתבות עם התמונות והתקצירים ישירות מהממשק הפתוח שלהם.
  var CI_SRC = { chabadinfo: 1, 'ci-simcha': 1, 'ci-events': 1, 'ci-avel': 1 };
  var SIMCHA_RE = /^מזל טוב|מזל טוב[:!]|אירוסי |אירוסין|נישואי |חתונת |בר[- ]?מצוו?ה של|הולדת (הבן|הבת|נכד|נכדה|בן|בת)|ברית מילה|שמחת (ה?נישואין|ה?אירוסין)|בשעה טובה/;
  var AVEL_RE = /ע["״]ה(\s|$|[,.])|ז["״]ל\s*$|ברוך דיין האמת|^נפטר|נפטרה |הלוויית |הלווית |נלב["״]ע/;
  function textOf(html) {
    try { return (new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { return ''; }
  }
  function ciItem(p) {
    var media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    var sizes = (media && media.media_details && media.media_details.sizes) || {};
    var img = (sizes.large || sizes.medium_large || sizes.full || {}).source_url || (media && media.source_url) || '';
    var t = textOf(p.title && p.title.rendered);
    var x = textOf(p.excerpt && p.excerpt.rendered).replace(/\s*(\[…\]|…|המשך קריאה.*)$/, '');
    var it = { id: 'ci' + p.id, t: t, u: p.link, s: 'chabadinfo', c: 'chabad', d: Date.parse((p.date_gmt || '') + 'Z') || Date.now(), x: x.length > 240 ? x.slice(0, 237) + '…' : x, client: 1 };
    if (/^https:\/\//.test(img)) it.i = img;
    if (SIMCHA_RE.test(t)) { it.c = 'community'; it.b = 'simcha'; } else if (AVEL_RE.test(t)) { it.c = 'community'; it.b = 'avel'; }
    return it;
  }
  function loadChabadInfo() {
    var stt = st.news && st.news.status && st.news.status.chabadinfo;
    if (!stt || !stt.via || !window.fetch || !window.DOMParser) return Promise.resolve(false);
    try {
      var cached = JSON.parse(localStorage.getItem('cn-ci') || 'null');
      if (cached && Date.now() - cached.t < 10 * 60000 && cached.items.length) { st.extra = cached.items; return Promise.resolve(true); }
    } catch (e) { /* */ }
    var api = 'https://chabad.info/wp-json/wp/v2/posts?';
    var fields = '&_embed=wp:featuredmedia&_fields=id,date_gmt,link,title,excerpt,_links,_embedded';
    var get = function (q) {
      return fetch(api + q + fields, { mode: 'cors' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (a) { return Array.isArray(a) ? a : []; }, function () { return []; });
    };
    return Promise.all([get('per_page=30'), get('categories=401&per_page=10'), get('search=' + encodeURIComponent('מזל טוב') + '&per_page=20')]).then(function (r) {
      var seenIds = {};
      var list = r[0].concat(r[1], r[2].filter(function (p) { return SIMCHA_RE.test(textOf(p.title && p.title.rendered)); }))
        .map(ciItem).filter(function (i) { if (!i.t || seenIds[i.id]) return false; seenIds[i.id] = 1; return true; });
      if (!list.length) return false;
      st.extra = list;
      try { localStorage.setItem('cn-ci', JSON.stringify({ t: Date.now(), items: list })); } catch (e) { /* */ }
      return true;
    });
  }

  var poolCache = null;
  function allItems() {
    if (poolCache) return poolCache;
    var c = st.content;
    var hidden = new Set(c.hidden || []);
    var words = c.settings.blockedWords || [];
    var pinned = (c.pinned || []).filter(Boolean).map(function (i) { return Object.assign({}, i, { pin: true }); });
    var pinIds = new Set(pinned.map(function (i) { return i.id; }));
    var extra = st.extra || [];
    var base = (st.news ? st.news.items : []).filter(function (i) {
      return !pinIds.has(i.id) && !(extra.length && CI_SRC[i.s] && /news\.google\./.test(i.u));
    }).concat(extra);
    poolCache = ownItems().concat(pinned, base).filter(function (i) {
      return !hidden.has(i.id) && !S.isBlocked(i.t + ' ' + (i.x || ''), words);
    });
    return poolCache;
  }
  function findItem(id) {
    var all = allItems();
    for (var k = 0; k < all.length; k++) if (all[k].id === id) return all[k];
    var live = st.live ? st.live.items : [];
    for (var j = 0; j < live.length; j++) if (live[j].id === id) return live[j];
    return null;
  }
  var CHABAD_VID = { chabadinfo: 1, 'ci-video': 1, 'yt-jem': 1, 'yt-livingtorah': 1 };
  var CHABAD_WORDS = /חב["״]ד|הרבי|ליובאוויטש|שלוח|770|Chabad|Rebbe|Lubavitch/i;
  function videoScore(i) { return ((CHABAD_VID[i.s] || CHABAD_WORDS.test(i.t)) ? 4 : 0) + (HE.test(i.t) ? 2 : 0) + (i.sh ? 1 : 0); }
  function videoOrder(list) {
    return list.slice().sort(function (a, b) { return videoScore(b) - videoScore(a) || b.d - a.d; });
  }
  function videos() { return videoOrder(allItems().filter(function (i) { return i.c === 'video' || i.tv; })); }

  // ---------------------------------------------------------- markup
  function badge(i) { return '<span class="src" data-c="' + catOf(i) + '">' + esc(srcName(i)) + '</span>'; }
  function timeTag(i) { return '<time datetime="' + iso(i.d) + '" data-t="' + i.d + '">' + S.ago(i.d) + '</time>'; }
  function alsoTag(i) {
    if (!i.k) return '';
    var names = (i.al || []).map(function (id) { return (sources()[id] || {}).n; }).filter(Boolean);
    return '<span class="also">' + (names.length ? 'דווח גם ב' + esc(names.slice(0, 2).join(', ')) : '+' + i.k + ' מקורות') + '</span>';
  }
  function imgTag(src, cls) { return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + esc(S.asset(src)) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'; }
  function noImgArt(i) {
    var s = srcInfo(i);
    var dom = i.pd || (s && hostOf(s.h)) || hostOf(i.u);
    return '<span class="noimg-art"><span class="noimg-inner">' + (dom ? '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(dom) + '&amp;sz=64" alt="" loading="lazy">' : '') +
      '<b>' + esc(srcName(i)) + '</b></span></span>';
  }
  function openAttrs(i) {
    if (i.own) return 'href="' + esc(S.safeUrl(i.u)) + '"';
    if (i.c === 'video') return 'href="' + esc(shortsUrl(i)) + '"';
    return 'href="' + esc(S.safeUrl(i.u) || '#') + '" data-open="' + esc(i.id) + '"';
  }
  function cardHTML(i, lead) {
    var has = showImg(i);
    var catLabel = i.c === 'community' ? (SUBS[i.b] || 'קהילה') : '';
    var media = '<a class="card-media" ' + openAttrs(i) + ' aria-hidden="true" tabindex="-1">' +
      (has ? imgTag(i.i) : noImgArt(i)) + (catLabel ? '<span class="card-badge" data-c="community">' + esc(catLabel) + '</span>' : '') +
      (i.c === 'video' || i.tv ? '<span class="play"></span>' : '') + '</a>';
    return '<article class="card' + (lead ? ' lead wide' : '') + (has || lead ? '' : ' compact') + '" data-c="' + catOf(i) + '">' + media +
      '<div class="card-body"><div class="meta">' + badge(i) + timeTag(i) + (i.pin ? '<span class="pin">מוצמד</span>' : '') + alsoTag(i) + '</div>' +
      '<h3 dir="auto"><a ' + openAttrs(i) + '>' + esc(i.t) + '</a></h3>' + (i.x ? '<p class="excerpt" dir="auto">' + esc(i.x) + '</p>' : '') +
      '<div class="card-actions"><button class="act" type="button" data-share="' + esc(i.id) + '">' + ICON.share + 'שיתוף</button>' +
      '<a class="act wa" href="' + esc(waLink(i)) + '" target="_blank" rel="noopener">' + ICON.wa + 'וואטסאפ</a>' +
      (i.own ? '' : '<a class="act end" href="' + esc(S.safeUrl(i.u)) + '" target="_blank" rel="noopener">' + ICON.out + 'למקור</a>') +
      '</div></div></article>';
  }
  function reelCard(i) {
    return '<a class="reel-card" href="' + esc(shortsUrl(i)) + '">' + (i.i ? imgTag(i.i) : '') + '<span class="play"></span><span dir="auto">' + esc(i.t) + '</span></a>';
  }
  function miniCard(i) {
    return '<a class="mini-card" ' + openAttrs(i) + '>' + (showImg(i) ? imgTag(i.i) : noImgArt(i)) +
      '<span class="meta">' + badge(i) + timeTag(i) + '</span><strong dir="auto">' + esc(i.t) + '</strong></a>';
  }
  function miniFlashes(list) {
    return '<ul class="mini-flashes">' + list.map(function (i) {
      return '<li><div><div class="flash-meta"><time data-clock="' + i.d + '">' + S.clock(i.d) + '</time><span class="flash-src">' + esc(srcName(i)) + '</span></div>' +
        '<p dir="auto">' + (i.own ? esc(i.t) : '<a href="' + esc(S.safeUrl(i.u) || '#') + '" data-open="' + esc(i.id) + '" style="text-decoration:none">' + esc(i.t) + '</a>') + '</p></div>' +
        (i.i && showImg(i) ? '<a href="' + (i.tv ? esc(shortsUrl(i)) : '#') + '"' + (i.tv ? '' : ' data-open="' + esc(i.id) + '"') + '>' + imgTag(i.i) + '</a>' : '<span></span>') + '</li>';
    }).join('') + '</ul>';
  }
  function feedAd(k) {
    var ads = S.activeAds(st.content, 'feed');
    return ads.length ? '<div class="ad-feed block">' + S.adHTML(ads[k % ads.length]) + '</div>' : '';
  }
  function block(title, more, inner, extra) {
    return '<section class="block"><div class="block-head"><h2>' + (extra || '') + esc(title) + '</h2>' + (more || '') + '</div>' + inner + '</section>';
  }
  function moreBtn(tab, label) { return '<button class="more-link" type="button" data-goto="' + tab + '">' + esc(label || 'לכל העדכונים ←') + '</button>'; }

  // ---------------------------------------------------------- feed (endless)
  function buildList() {
    var items = allItems();
    var q = st.q.trim().toLowerCase();
    var tab = st.tab;
    var list;
    if (q) {
      list = items.filter(function (i) { return (i.t + ' ' + (i.x || '') + ' ' + srcName(i)).toLowerCase().indexOf(q) >= 0; }).sort(byDate);
    } else if (tab === 'home') {
      // ערבוב: כתבה מחב"ד ↔ כתבה מהאקטואליה והפוליטיקה, לסירוגין
      var score = function (i) {
        return (i.pin ? 1e15 : 0) + (i.own ? 6 * 3600e3 : 0) + i.d + (showImg(i) ? 2 * 3600e3 : 0) + (HE.test(i.t) ? 5 * 3600e3 : 0) + Math.min(3, i.k || 0) * 1800e3;
      };
      var desc = function (a, b) { return score(b) - score(a); };
      var isCh = function (i) { return i.c === 'chabad' || i.c === 'community' || i.own || i.ch; };
      // גיוון: לא שתי כתבות ברצף מאותו אתר
      var diversify = function (q) {
        var out = [], last = '';
        while (q.length) {
          var k = 0;
          for (var j = 0; j < Math.min(6, q.length); j++) { if (q[j].s !== last) { k = j; break; } }
          var it = q.splice(k, 1)[0];
          out.push(it);
          last = it.s;
        }
        return out;
      };
      var stories = items.filter(isStory);
      var cq = diversify(stories.filter(isCh).sort(desc));
      var nq = diversify(stories.filter(function (i) { return !isCh(i); }).sort(desc));
      list = [];
      while (cq.length || nq.length) {
        if (cq.length) list.push(cq.shift());
        if (nq.length) list.push(nq.shift());
      }
    } else if (tab === 'video') {
      list = videos();
    } else if (tab === 'flash') {
      list = liveItems(400);
    } else if (tab === 'community') {
      list = items.filter(function (i) { return i.c === 'community' && (st.sub === 'all' || i.b === st.sub); }).sort(byDate);
    } else {
      list = items.filter(function (i) { return inTab(i, tab) && isStory(i); }).sort(byDate);
    }
    return list;
  }

  function renderFeed() {
    poolCache = null;
    var box = $('#content');
    if (!st.news) return;
    st.list = buildList();
    st.shown = 0;
    st.modules = 0;
    var html = '';
    var q = st.q.trim();
    if (!q && st.tab === 'home') html += renderHomeTop();
    if (!q && st.tab === 'community') {
      html += '<div class="subtabs" role="group" aria-label="סוג">' + [['all', 'הכל'], ['simcha', 'שמחות'], ['event', 'אירועים'], ['avel', 'ברוך דיין האמת']].map(function (s) {
        return '<button type="button" data-sub="' + s[0] + '" aria-pressed="' + (st.sub === s[0]) + '">' + s[1] + '</button>';
      }).join('') + '</div>';
    }
    if (!q && st.tab === 'video') html += '<a class="open-shorts" href="shorts.html">▶ צפייה בשורטס – גוללים מסרטון לסרטון</a>';
    if (q) html += '<p class="meta" style="margin:0 0 12px">' + st.list.length + ' תוצאות עבור "' + esc(q) + '"</p>';
    var wrapCls = st.tab === 'video' && !q ? 'videos' : st.tab === 'flash' && !q ? 'live-list' : 'cards two';
    html += (wrapCls === 'live-list' ? '<ol class="live-list" id="list"></ol>' : '<div class="' + wrapCls + '" id="list"></div>');
    html += '<div id="list-end"></div>';
    box.innerHTML = html;
    if (!st.list.length) {
      $('#list-end').innerHTML = '<div class="empty">' + (q ? 'לא נמצאו עדכונים עבור החיפוש.' : 'אין כרגע עדכונים כאן. העדכון הבא יגיע בתוך כמה דקות.') + '</div>';
      return;
    }
    renderMore();
    loadTweets(box);
  }

  function renderHomeTop() {
    var items = allItems();
    var html = '';
    var lead = st.list.filter(showImg)[0] || st.list[0];
    if (lead) {
      st.list = st.list.filter(function (i) { return i !== lead; });
      html += '<div class="cards" style="margin-bottom:22px">' + cardHTML(lead, true) + '</div>';
    }
    var fl = liveItems(5);
    if (fl.length) html += '<div class="only-mobile">' + block('מבזקים', moreBtn('flash', 'לכל המבזקים ←'), miniFlashes(fl), '<span class="dot"></span>') + '</div>';
    var wa = S.safeUrl(st.content.settings.whatsappChannel);
    if (wa) html += '<a class="wa-banner" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ICON.wa + '<span>הצטרפו לערוץ הוואטסאפ שלנו<small>כל העדכונים החשובים ישר לטלפון</small></span></a>';
    var vids = videos().slice(0, 12);
    if (vids.length) html += block('שורטס', '<a class="more-link" href="shorts.html">לצפייה ←</a>', '<div class="carousel">' + vids.map(reelCard).join('') + '</div>');
    var com = items.filter(function (i) { return i.c === 'community' && showImg(i); }).sort(byDate).slice(0, 10);
    if (com.length) html += block('שמחות וקהילה', moreBtn('community'), '<div class="carousel">' + com.map(miniCard).join('') + '</div>');
    return html;
  }

  function renderMore() {
    var listEl = $('#list');
    if (!listEl) return;
    var end = Math.min(st.list.length, st.shown + BATCH);
    var html = '';
    for (var k = st.shown; k < end; k++) {
      var i = st.list[k];
      if (st.tab === 'video' && !st.q) html += reelCard(i);
      else if (st.tab === 'flash' && !st.q) html += flashHTML(i);
      else {
        html += cardHTML(i, false);
        if (st.tab === 'home' && !st.q && (k + 1) % 6 === 0) html += homeModule();
      }
    }
    st.shown = end;
    listEl.insertAdjacentHTML('beforeend', html);
    if (st.tab === 'flash') loadTweets(listEl);
    $('#list-end').innerHTML = st.shown >= st.list.length
      ? '<p class="end-note">ראיתם הכל! עדכונים חדשים נכנסים כל 15 דקות.</p>'
      : '<div class="loading-more"><span class="spinner"></span></div>';
  }

  // רכיב משתנה שמשולב בפיד אחרי כל 6 כרטיסים
  function homeModule() {
    var n = st.modules++;
    var kind = n % 4;
    if (kind === 0) { var ad = feedAd(n); if (ad) return '<div class="wide">' + ad + '</div>'; }
    if (kind === 1 || kind === 0) {
      var fl = liveItems(60).slice(5 + n * 2, 5 + n * 2 + 3);
      if (fl.length) return '<div class="wide">' + block('עוד מבזקים', moreBtn('flash', 'לכל המבזקים ←'), miniFlashes(fl), '<span class="dot"></span>') + '</div>';
    }
    if (kind === 2) {
      var v = videos().slice(12 + n * 3, 12 + n * 3 + 8);
      if (v.length) return '<div class="wide">' + block('עוד סרטונים', '<a class="more-link" href="shorts.html">שורטס ←</a>', '<div class="carousel">' + v.map(reelCard).join('') + '</div>') + '</div>';
    }
    var cats = ['chabad', 'world', 'israel'];
    var cat = cats[n % cats.length];
    var names = { chabad: 'עוד מחב״ד', world: 'מהעולם', israel: 'מהארץ' };
    var shownIds = new Set(st.list.slice(0, st.shown + BATCH).map(function (i) { return i.id; }));
    var picks = allItems().filter(function (i) { return inTab(i, cat) && isStory(i) && !shownIds.has(i.id); }).sort(byDate).slice(n * 4, n * 4 + 8);
    if (picks.length) return '<div class="wide">' + block(names[cat], moreBtn(cat), '<div class="carousel">' + picks.map(miniCard).join('') + '</div>') + '</div>';
    return '';
  }

  // ---------------------------------------------------------- flashes
  function liveItems(max) {
    var c = st.content, news = st.live || st.news;
    var manual = (c.flashes || []).filter(function (f) { return f && (f.text || f.tweet); }).map(function (f) {
      return { id: 'f-' + f.id, t: f.text || '', u: f.link || '', tweet: f.tweet || '', d: +f.date || 0, own: true, c: 'flash' };
    });
    var hidden = new Set(c.hidden || []);
    var words = c.settings.blockedWords || [];
    var auto = (news ? news.items : []).filter(function (i) { return i.c === 'flash' && !hidden.has(i.id) && !S.isBlocked(i.t, words); });
    return manual.concat(auto).sort(function (a, b) { return b.d - a.d; }).slice(0, max || 80);
  }
  function tweetHTML(url) {
    var u = String(url || '').replace(/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com/i, 'https://twitter.com');
    if (!/^https:\/\/twitter\.com\/[\w]+\/status\/\d+/.test(u)) return '';
    return '<div class="tweet"><blockquote class="twitter-tweet" data-dnt="true" data-lang="he" data-conversation="none"><a href="' + esc(u) + '">לצפייה בציוץ</a></blockquote></div>';
  }
  function flashHTML(i) {
    var isNew = st.liveSeen && !st.liveSeen.has(i.id);
    var link = S.safeUrl(i.u);
    var long = i.t.length > 260 || (i.t.match(/\n/g) || []).length > 5;
    var img = i.i && showImg(i) ? '<a class="flash-img" href="' + (i.tv ? esc(shortsUrl(i)) : esc(link || '#')) + '"' + (i.tv ? '' : ' target="_blank" rel="noopener"') + '>' + imgTag(i.i) + (i.tv ? '<span class="play"></span>' : '') + '</a>' : '';
    return '<li class="flash' + (i.own ? ' is-own' : '') + (isNew ? ' is-new' : '') + '">' +
      '<div class="flash-meta"><time data-clock="' + i.d + '" datetime="' + iso(i.d) + '">' + S.clock(i.d) + '</time><span class="flash-src">' + esc(srcName(i)) + '</span></div>' +
      (i.t ? '<p class="flash-text" dir="auto">' + S.linkify(esc(i.t)) + '</p>' : '') + img + (i.tweet ? tweetHTML(i.tweet) : '') +
      '<div class="flash-actions">' + (long ? '<button class="flash-more" type="button">המשך קריאה</button>' : '') +
      (i.own ? '' : '<button type="button" data-share="' + esc(i.id) + '">שיתוף</button>') +
      (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">למקור ←</a>' : '') + '</div></li>';
  }
  var twLoading = false;
  function loadTweets(root) {
    if (!root || !root.querySelector('blockquote.twitter-tweet')) return;
    if (window.twttr && window.twttr.widgets) { window.twttr.widgets.load(root); return; }
    if (twLoading) return;
    twLoading = true;
    var s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    document.head.appendChild(s);
  }
  function renderLive() {
    var list = liveItems(70);
    var sig = list.map(function (i) { return i.id; }).join('|');
    if (sig !== st.liveSig) {
      st.liveSig = sig;
      $('#live-list').innerHTML = list.length ? list.map(flashHTML).join('') : '<li class="flash"><p class="flash-text">המבזקים יופיעו כאן.</p></li>';
      loadTweets($('#live-list'));
      renderTicker(list);
    }
    st.liveSeen = new Set(list.map(function (i) { return i.id; }));
  }
  function renderTicker(list) {
    var items = list.filter(function (i) { return i.t; }).slice(0, 12);
    var tk = $('#ticker');
    if (!items.length) { tk.hidden = true; return; }
    var one = items.map(function (i) {
      var line = i.t.split('\n')[0];
      if (line.length > 120) line = line.slice(0, 117) + '…';
      var link = S.safeUrl(i.u);
      var inner = '<b>' + S.clock(i.d).replace(/^(היום|אתמול) /, '') + '</b><span dir="auto">' + esc(line) + '</span><i>' + esc(srcName(i)) + '</i>';
      return link ? '<a class="ticker-item" href="' + esc(link) + '" target="_blank" rel="noopener">' + inner + '</a>' : '<span class="ticker-item">' + inner + '</span>';
    }).join('');
    var track = $('#ticker-track');
    track.innerHTML = one + one;
    var chars = items.reduce(function (n, i) { return n + Math.min(i.t.length, 130); }, 0);
    track.style.setProperty('--dur', Math.max(45, Math.round(chars * 0.2)) + 's');
    tk.hidden = false;
  }

  // ---------------------------------------------------------- preview sheet
  function ensurePreviews() {
    if (st.previews) return Promise.resolve(st.previews);
    if (!st.previewsP) {
      st.previewsP = S.getJSON('data/previews.json').then(function (p) { st.previews = p || {}; return st.previews; }, function () { st.previews = {}; return st.previews; });
    }
    return st.previewsP;
  }
  function paragraphs(text) {
    return String(text || '').split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(function (p) { return '<p>' + S.linkify(esc(p)) + '</p>'; }).join('');
  }
  function shareRow(i) {
    var u = shareUrl(i), t = i.t.split('\n')[0];
    return '<div class="share-row">' +
      '<a class="s-wa" href="' + esc(waLink(i)) + '" target="_blank" rel="noopener">' + ICON.wa + 'וואטסאפ</a>' +
      '<a class="s-tg" href="https://t.me/share/url?url=' + encodeURIComponent(u) + '&amp;text=' + encodeURIComponent(t) + '" target="_blank" rel="noopener">' + ICON.tg + 'טלגרם</a>' +
      '<a class="s-fb" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u) + '" target="_blank" rel="noopener">' + ICON.fb + 'פייסבוק</a>' +
      '<a class="s-x" href="https://twitter.com/intent/tweet?url=' + encodeURIComponent(u) + '&amp;text=' + encodeURIComponent(t) + '" target="_blank" rel="noopener">' + ICON.x + 'X</a>' +
      '<button type="button" data-copy="' + esc(u) + '">' + ICON.link + 'העתקה</button></div>';
  }
  function waLink(i) { return 'https://wa.me/?text=' + encodeURIComponent(i.t.split('\n')[0] + '\n' + shareUrl(i)); }

  function renderSheet(i) {
    var pv = (st.previews && st.previews[i.id]) || {};
    var imgs = [];
    if (showImg(i)) {
      imgs.push(i.i);
      (pv.g || []).forEach(function (g) { if (imgs.indexOf(g) < 0 && (!isGeneral(i) || st.content.settings.generalImages !== false)) imgs.push(g); });
    }
    var text = pv.b || (i.c === 'flash' ? i.t : i.x) || '';
    var related = allItems().filter(function (x) { return x.id !== i.id && isStory(x) && (x.c === i.c || (i.c === 'flash' && x.c === 'israel')); }).sort(byDate).slice(0, 8);
    var srcLabel = srcName(i);
    $('#sheet-panel').innerHTML =
      '<header class="sheet-top"><span class="grab"></span><button class="icon-btn" type="button" data-close aria-label="סגירה">✕</button>' +
      '<span class="meta">' + badge(i) + timeTag(i) + '</span><button class="icon-btn" type="button" data-share="' + esc(i.id) + '" aria-label="שיתוף">' + ICON.share + '</button></header>' +
      (imgs.length ? '<div class="gallery" id="gallery">' + imgs.slice(0, 7).map(function (g) { return imgTag(g); }).join('') + '</div>' + (imgs.length > 1 ? '<div class="gallery-count">' + imgs.length + ' תמונות – החליקו הצידה</div>' : '') : '') +
      '<div class="sheet-body"><div class="meta">' + alsoTag(i) + '</div>' +
      (i.c === 'flash' ? '' : '<h2 id="sheet-title" dir="auto">' + esc(i.t) + '</h2>') +
      '<div class="sheet-text" dir="auto">' + paragraphs(text) + '</div>' +
      (S.safeUrl(i.u) ? '<a class="go-source" href="' + esc(S.safeUrl(i.u)) + '" target="_blank" rel="noopener">' + (i.c === 'flash' ? 'לפוסט המקורי ב' : 'להמשך הכתבה ב') + esc(srcLabel) + ' ' + ICON.out + '</a>' : '') +
      '<p class="meta" style="margin:-6px 0 10px">שתפו עם חברים:</p>' + shareRow(i) +
      (related.length ? '<section class="related"><h3>עוד כתבות</h3><div class="carousel">' + related.map(miniCard).join('') + '</div></section>' : '') +
      '</div>';
    $('#sheet-panel').scrollTop = 0;
    if (i.c === 'flash') $('#sheet').setAttribute('aria-label', 'מבזק'); else $('#sheet').removeAttribute('aria-label');
  }
  function openSheet(id, fromHash) {
    var i = findItem(id);
    if (!i) return false;
    if (i.own) { location.href = S.safeUrl(i.u); return true; }
    renderSheet(i);
    ensurePreviews().then(function () { if (!$('#sheet').hidden && st.sheetId === id) renderSheet(i); });
    st.sheetId = id;
    $('#sheet').hidden = false;
    document.body.classList.add('locked');
    if (!fromHash) {
      try { history.pushState({ sheet: id }, '', '#a-' + id); st.pushed = true; } catch (e) { st.pushed = false; }
    }
    setTimeout(function () { var b = $('#sheet [data-close].icon-btn'); if (b) b.focus(); }, 30);
    return true;
  }
  function closeSheet(fromPop) {
    if ($('#sheet').hidden) return;
    $('#sheet').hidden = true;
    st.sheetId = null;
    document.body.classList.remove('locked');
    if (!fromPop) {
      if (st.pushed) { st.pushed = false; history.back(); }
      else { try { history.replaceState(null, '', location.pathname + (st.tab === 'home' ? '' : '#' + st.tab)); } catch (e) { /* */ } }
    }
  }

  function share(id) {
    var i = findItem(id);
    if (!i) return;
    var u = shareUrl(i);
    if (navigator.share) {
      navigator.share({ title: i.t.split('\n')[0], text: i.t.split('\n')[0], url: u }).catch(function () {});
    } else {
      window.open(waLink(i), '_blank', 'noopener');
    }
  }
  function copy(text) {
    var done = function () { toast('הקישור הועתק'); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt('העתיקו את הקישור:', text); });
    else window.prompt('העתיקו את הקישור:', text);
  }

  // ---------------------------------------------------------- stories
  var seen = (function () { try { return new Set(JSON.parse(localStorage.getItem('cn-seen') || '[]')); } catch (e) { return new Set(); } })();
  function markSeen(id) {
    seen.add(id);
    try { localStorage.setItem('cn-seen', JSON.stringify(Array.from(seen).slice(-600))); } catch (e) { /* */ }
  }
  function buildStories() {
    var groups = [];
    var name = st.content.settings.siteName || 'המערכת';
    var today = new Date().toISOString().slice(0, 10);
    var own = (st.content.stories || []).filter(function (s) { return s && s.image && (!s.until || s.until >= today); })
      .sort(function (a, b) { return (b.date || 0) - (a.date || 0); })
      .map(function (s) { return { id: 's-' + s.id, img: S.asset(s.image), t: s.text || '', link: S.safeUrl(s.link), d: s.date || Date.now(), own: true }; });
    if (own.length) groups.push({ name: name, slides: own.slice(0, 10) });
    var since = Date.now() - 36 * 3600e3;
    var by = {};
    var order = [];
    allItems().filter(function (i) { return STORY_CATS[i.c] && showImg(i) && i.d > since && !i.own; }).sort(function (a, b) { return b.d - a.d; }).forEach(function (i) {
      var n = srcName(i);
      if (!by[n]) { by[n] = []; order.push(n); }
      if (by[n].length < 8) by[n].push({ id: i.id, img: S.asset(i.i), t: i.t.split('\n')[0], x: i.x || '', d: i.d, item: true });
    });
    // סטוריז מעורבבים: מקור חב"די ↔ מקור חדשות, לסירוגין (לפי העדכון האחרון של כל מקור)
    var CH = /COL|חב״ד|Chabad|Anash|CrownHeights/;
    var chG = order.filter(function (n) { return CH.test(n); });
    var nwG = order.filter(function (n) { return !CH.test(n); });
    var mixed = [];
    while (chG.length || nwG.length) {
      if (chG.length) mixed.push(chG.shift());
      if (nwG.length) mixed.push(nwG.shift());
    }
    mixed.slice(0, 16).forEach(function (n) { groups.push({ name: n, slides: by[n] }); });
    return groups;
  }
  function renderStories() {
    st.stories = buildStories();
    var track = $('#stories-track');
    if (!st.stories.length) { track.closest('.stories').hidden = true; return; }
    track.closest('.stories').hidden = false;
    track.innerHTML = st.stories.map(function (g, k) {
      var all = g.slides.every(function (s) { return seen.has(s.id); });
      return '<button class="story-btn' + (all ? ' seen' : '') + '" type="button" data-story="' + k + '"><span class="story-ring"><img src="' + esc(g.slides[0].img) +
        '" alt="" loading="lazy" referrerpolicy="no-referrer"></span><span class="story-name">' + esc(g.name) + '</span></button>';
    }).join('');
  }
  function openStory(g, s) {
    if (!st.stories[g]) return;
    st.story = { g: g, s: s || 0, paused: false };
    var v = $('#story-view');
    v.hidden = false;
    document.body.classList.add('locked');
    try { history.pushState({ story: 1 }, '', location.pathname + location.search + '#story'); st.storyPushed = true; } catch (e) { st.storyPushed = false; }
    showSlide();
  }
  function closeStory(fromPop) {
    var v = $('#story-view');
    if (v.hidden) return;
    clearTimeout(st.storyTimer);
    v.hidden = true;
    v.innerHTML = '';
    document.body.classList.remove('locked');
    st.story = null;
    renderStories();
    if (!fromPop && st.storyPushed) { st.storyPushed = false; history.back(); }
  }
  function showSlide() {
    var sg = st.story;
    var g = st.stories[sg.g];
    var sl = g.slides[sg.s];
    markSeen(sl.id);
    var v = $('#story-view');
    v.innerHTML = '<div class="story-stage">' +
      '<img class="story-img" src="' + esc(sl.img) + '" alt="" referrerpolicy="no-referrer">' +
      '<div class="story-shade"></div>' +
      '<div class="story-bars">' + g.slides.map(function (x, k) { return '<span><i style="width:' + (k < sg.s ? 100 : 0) + '%"></i></span>'; }).join('') + '</div>' +
      '<div class="story-head"><img src="' + esc(g.slides[0].img) + '" alt="" referrerpolicy="no-referrer"><div><b>' + esc(g.name) + '</b><br><small>' + S.ago(sl.d) + '</small></div>' +
      '<button class="story-close" type="button" data-sclose aria-label="סגירה">✕</button></div>' +
      '<div class="story-tap"><button type="button" data-sprev aria-label="הקודם"></button><button type="button" data-snext aria-label="הבא"></button></div>' +
      '<div class="story-text"><h2 dir="auto">' + esc(sl.t) + '</h2>' + (sl.x ? '<p dir="auto">' + esc(sl.x) + '</p>' : '') +
      '<div class="story-cta">' + (sl.item ? '<button class="read" type="button" data-sread="' + esc(sl.id) + '">קראו עוד</button><button class="share" type="button" data-share="' + esc(sl.id) + '">' + 'שיתוף' + '</button>'
        : (sl.link ? '<a class="read" href="' + esc(sl.link) + '" target="_blank" rel="noopener">לפרטים</a>' : '')) + '</div></div></div>';
    var img = v.querySelector('.story-img');
    img.addEventListener('error', function () { nextSlide(); });
    var bar = v.querySelectorAll('.story-bars i')[sg.s];
    requestAnimationFrame(function () {
      bar.style.transition = 'width ' + STORY_MS + 'ms linear';
      bar.style.width = '100%';
    });
    clearTimeout(st.storyTimer);
    st.storyStart = Date.now();
    st.storyLeft = STORY_MS;
    st.storyTimer = setTimeout(nextSlide, STORY_MS);
  }
  function nextSlide() {
    var sg = st.story;
    if (!sg) return;
    var g = st.stories[sg.g];
    if (sg.s < g.slides.length - 1) sg.s++;
    else if (sg.g < st.stories.length - 1) { sg.g++; sg.s = 0; }
    else return closeStory();
    showSlide();
  }
  function prevSlide() {
    var sg = st.story;
    if (!sg) return;
    if (sg.s > 0) sg.s--;
    else if (sg.g > 0) { sg.g--; sg.s = 0; }
    showSlide();
  }
  function pauseStory(on) {
    var sg = st.story;
    if (!sg || sg.paused === on) return;
    sg.paused = on;
    var bar = $$('#story-view .story-bars i')[sg.s];
    if (!bar) return;
    if (on) {
      clearTimeout(st.storyTimer);
      st.storyLeft = Math.max(0, st.storyLeft - (Date.now() - st.storyStart));
      var w = getComputedStyle(bar).width;
      bar.style.transition = 'none';
      bar.style.width = w;
    } else {
      st.storyStart = Date.now();
      bar.style.transition = 'width ' + st.storyLeft + 'ms linear';
      bar.style.width = '100%';
      st.storyTimer = setTimeout(nextSlide, st.storyLeft);
    }
  }

  // ---------------------------------------------------------- rail, ads, chrome
  function renderRail() {
    var vids = videos().slice(0, 4);
    $('#rail-videos').hidden = !vids.length;
    $('#rail-reels').innerHTML = vids.map(reelCard).join('');
    $('#ad-side').innerHTML = S.activeAds(st.content, 'side').map(function (a) { return S.adHTML(a); }).join('');
    var top = S.activeAds(st.content, 'top');
    var topBox = $('#ad-top');
    topBox.hidden = !top.length;
    topBox.innerHTML = top.length ? S.adHTML(top[Math.floor(Date.now() / 60000) % top.length]) : '';
  }
  function applySettings() {
    var s = st.content.settings;
    var name = s.siteName || 'חב״ד בזמן אמת';
    $('#site-name').textContent = name;
    $('#foot-name').textContent = name;
    if (s.tagline) $('#site-tagline').textContent = s.tagline;
    document.title = name;
    var wa = S.safeUrl(s.whatsappChannel);
    $('#wa-join').hidden = !wa;
    if (wa) $('#wa-join').href = wa;
    var b = s.breaking || {};
    var box = $('#breaking');
    if (b.active && b.text) {
      var link = S.safeUrl(b.link);
      $('#breaking-text').innerHTML = link ? '<a href="' + esc(link) + '"' + (/^https?:/.test(link) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(b.text) + '</a>' : esc(b.text);
      box.hidden = false;
    } else box.hidden = true;
  }
  function renderStatus() {
    var news = st.live || st.news;
    if (!news) return;
    var t = Date.parse(news.updated);
    var ok = Object.keys(news.status || {}).filter(function (k) { return news.status[k].ok; }).length;
    $('#status').classList.toggle('stale', Date.now() - t > 60 * 60 * 1000);
    $('#status-text').textContent = 'עודכן ' + S.ago(t) + (ok ? ' · ' + ok + ' מקורות' : '');
  }
  function renderFooter() {
    var src = sources();
    var seenN = {};
    $('#foot-sources').innerHTML = Object.keys(src).map(function (k) { return src[k]; }).filter(function (s) {
      if (s.off || seenN[s.n] || /גוגל|google/i.test(s.n)) return false;
      seenN[s.n] = 1;
      return true;
    }).map(function (s) {
      var h = S.safeUrl(s.h);
      return h ? '<a href="' + esc(h) + '" target="_blank" rel="noopener">' + esc(s.n) + '</a>' : '<span>' + esc(s.n) + '</span>';
    }).join('');
  }
  function setTab(tab, push) {
    if (TAB_IDS.indexOf(tab) < 0) tab = 'home';
    st.tab = tab;
    if (tab !== 'community') st.sub = 'all';
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    $$('.bottom-nav [data-nav]').forEach(function (b) { b.classList.toggle('on', b.dataset.nav === tab); });
    var activeTab = $('.tab[data-tab="' + tab + '"]');
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (push) { try { history.replaceState(null, '', tab === 'home' ? location.pathname : '#' + tab); } catch (e) { /* */ } }
    renderFeed();
  }
  function renderAll() {
    poolCache = null;
    applySettings();
    renderStatus();
    renderLive();
    renderStories();
    renderFeed();
    renderRail();
    renderFooter();
  }

  // ---------------------------------------------------------- loading
  function load() {
    st.lastLoad = Date.now();
    return Promise.all([
      S.getJSON('data/news.json').then(function (v) { return { ok: true, v: v }; }, function () { return { ok: false }; }),
      S.getJSON('data/content.json').then(function (v) { return { ok: true, v: v }; }, function () { return { ok: false }; }),
    ]).then(function (r) {
      var contentChanged = false;
      if (r[1].ok) {
        var before = JSON.stringify(st.content);
        st.content = S.normContent(r[1].v);
        contentChanged = before !== JSON.stringify(st.content);
      }
      if (!r[0].ok) {
        if (!st.news) {
          $('#content').innerHTML = '<div class="empty">לא הצלחנו לטעון את החדשות כרגע. ננסה שוב בעוד רגע.</div>';
          $('#status-text').textContent = 'אין חיבור לעדכונים';
          setTimeout(load, 30000);
        }
        return;
      }
      var news = r[0].v;
      if (!news || !Array.isArray(news.items)) return;
      st.live = news;
      if (!st.news) {
        st.news = news;
        st.known = new Set(news.items.map(function (i) { return i.id; }));
        renderAll();
        var h = location.hash.slice(1);
        var opened = h.indexOf('a-') === 0 && openSheet(h.slice(2), true);
        loadChabadInfo().then(function (got) {
          if (!got) return;
          poolCache = null;
          renderStories();
          if (window.scrollY < 500 && $('#sheet').hidden) renderFeed();
          if (!opened && h.indexOf('a-') === 0) openSheet(h.slice(2), true);
        });
        return;
      }
      var fresh = news.items.filter(function (i) { return !st.known.has(i.id) && isStory(i); }).length;
      renderStatus();
      renderLive();
      if (contentChanged) { poolCache = null; applySettings(); renderRail(); }
      var pill = $('#new-pill');
      if (fresh > 0) {
        pill.textContent = fresh === 1 ? 'עדכון חדש אחד · הצגה' : fresh + ' עדכונים חדשים · הצגה';
        pill.hidden = false;
      }
    });
  }
  function showFresh() {
    st.news = st.live;
    st.known = new Set(st.news.items.map(function (i) { return i.id; }));
    $('#new-pill').hidden = true;
    poolCache = null;
    renderStories();
    renderFeed();
    renderRail();
    $('#feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------- events
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-share],[data-copy],[data-close],[data-tab],[data-goto],[data-nav],[data-sub],[data-story],[data-sclose],[data-snext],[data-sprev],[data-sread],.flash-more,#new-pill');
    if (!t) return;
    if (t.matches('[data-story]')) { openStory(+t.dataset.story, 0); return; }
    if (t.matches('[data-sclose]')) { closeStory(); return; }
    if (t.matches('[data-snext]')) { nextSlide(); return; }
    if (t.matches('[data-sprev]')) { prevSlide(); return; }
    if (t.matches('[data-sread]')) { var sid = t.dataset.sread; closeStory(); setTimeout(function () { openSheet(sid); }, 60); return; }
    if (t.matches('[data-open]')) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (openSheet(t.dataset.open)) e.preventDefault();
      return;
    }
    if (t.matches('[data-share]')) { e.preventDefault(); if (st.story) pauseStory(true); share(t.dataset.share); return; }
    if (t.matches('[data-copy]')) { copy(t.dataset.copy); return; }
    if (t.matches('[data-close]')) { closeSheet(); return; }
    if (t.matches('[data-tab]')) { setTab(t.dataset.tab, true); return; }
    if (t.matches('[data-nav]')) { closeSheet(); setTab(t.dataset.nav, true); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.matches('[data-goto]')) { closeSheet(); setTab(t.dataset.goto, true); $('.cats').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.matches('[data-sub]')) { st.sub = t.dataset.sub; renderFeed(); return; }
    if (t.matches('.flash-more')) { var li = t.closest('.flash'); li.classList.toggle('is-open'); t.textContent = li.classList.contains('is-open') ? 'הצג פחות' : 'המשך קריאה'; return; }
    if (t.id === 'new-pill') showFresh();
  });
  document.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    var media = el.closest('.card-media');
    if (media && !media.querySelector('.noimg-art')) { el.remove(); media.insertAdjacentHTML('afterbegin', '<span class="noimg-art"><span class="noimg-inner"><b>' + esc(media.closest('.card') ? (media.closest('.card').querySelector('.src') || {}).textContent || '' : '') + '</b></span></span>'); return; }
    if (el.closest('.gallery')) { el.remove(); return; }
    if (el.closest('.flash-img') || el.closest('.mini-flashes')) { (el.closest('.flash-img') || el).remove(); return; }
    if (el.closest('.mini-card')) { el.style.visibility = 'hidden'; }
  }, true);

  $('#story-view').addEventListener('pointerdown', function (e) { if (!e.target.closest('button,a')) pauseStory(true); });
  $('#story-view').addEventListener('pointerup', function () { pauseStory(false); });
  var touchY = null;
  $('#story-view').addEventListener('touchstart', function (e) { touchY = e.touches[0].clientY; }, { passive: true });
  $('#story-view').addEventListener('touchend', function (e) { if (touchY !== null && e.changedTouches[0].clientY - touchY > 90) closeStory(); touchY = null; });
  document.addEventListener('keydown', function (e) {
    if (st.story) {
      if (e.key === 'Escape') closeStory();
      else if (e.key === 'ArrowLeft') nextSlide();
      else if (e.key === 'ArrowRight') prevSlide();
      return;
    }
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  });
  window.addEventListener('popstate', function () {
    if (st.story) { st.storyPushed = false; closeStory(true); return; }
    if (!$('#sheet').hidden) { st.pushed = false; closeSheet(true); return; }
    var h = location.hash.slice(1);
    if (h.indexOf('a-') === 0) openSheet(h.slice(2), true);
    else if (TAB_IDS.indexOf(h) >= 0 && h !== st.tab) setTab(h, false);
  });

  $('#search-toggle').addEventListener('click', function () {
    var bar = $('#searchbar');
    bar.hidden = !bar.hidden;
    this.setAttribute('aria-expanded', String(!bar.hidden));
    if (!bar.hidden) $('#q').focus();
    else if (st.q) { st.q = ''; $('#q').value = ''; renderFeed(); }
  });
  var qTimer;
  $('#q').addEventListener('input', function (e) {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { st.q = e.target.value; renderFeed(); }, 200);
  });
  $('#share-site').addEventListener('click', function () {
    var name = st.content.settings.siteName || 'חב״ד בזמן אמת';
    var u = BASE;
    var text = name + ' – חדשות חב״ד, מבזקים, שמחות, סרטונים ומשחקים לילדים. מתעדכן כל הזמן!';
    if (navigator.share) navigator.share({ title: name, text: text, url: u }).catch(function () {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + u), '_blank', 'noopener');
  });
  $('#player-close').addEventListener('click', function () { $('#player').close(); });
  $('#player').addEventListener('close', function () { $('#player-frame').innerHTML = ''; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && st.list && st.shown < st.list.length) renderMore();
    }, { rootMargin: '1400px 0px' }).observe($('#sentinel'));
  }
  window.addEventListener('scroll', function () {
    if (st.list && st.shown < st.list.length && window.innerHeight + window.scrollY > document.body.offsetHeight - 2200) renderMore();
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - st.lastLoad > 60000) load();
  });
  setInterval(function () {
    $$('time[data-t]').forEach(function (el) { el.textContent = S.ago(+el.dataset.t); });
    $$('time[data-clock]').forEach(function (el) { el.textContent = S.clock(+el.dataset.clock); });
    renderStatus();
  }, 30000);
  setInterval(load, POLL_MS);

  // ---------------------------------------------------------- start
  $('#heb-date').textContent = S.hebDate();
  $('#greg-date').textContent = S.gregDate();
  var startTab = location.hash.slice(1);
  if (TAB_IDS.indexOf(startTab) >= 0) {
    st.tab = startTab;
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === startTab)); });
    $$('.bottom-nav [data-nav]').forEach(function (b) { b.classList.toggle('on', b.dataset.nav === startTab); });
  }
  load();
})();
