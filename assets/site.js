// העמוד הראשי: טעינת החדשות, הצגה לפי קטגוריות, מבזקים חיים ועדכון אוטומטי
(function () {
  'use strict';
  var S = window.Site;
  var esc = S.esc;
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  var TAB_IDS = ['home', 'chabad', 'israel', 'world', 'flash', 'video'];
  var SECTIONS = [
    ['chabad', 'חדשות חב״ד', 8],
    ['israel', 'ישראל ופוליטיקה', 8],
    ['world', 'העולם', 5],
  ];
  var PAGE = 30;
  var POLL_MS = 3 * 60 * 1000;
  var HE = /[֐-׿]/;

  var st = {
    news: null,      // מה שמוצג כרגע בפיד
    live: null,      // הגרסה האחרונה שנטענה (למבזקים ולשורת הסטטוס)
    content: S.normContent({}),
    tab: 'home',
    q: '',
    shown: PAGE,
    known: null,
    liveSig: '',
    liveSeen: null,
    lastLoad: 0,
  };

  // ---------------------------------------------------------- helpers
  function srcInfo(i) {
    var n = st.live || st.news;
    return (n && n.sources && n.sources[i.s]) || (st.news && st.news.sources && st.news.sources[i.s]) || null;
  }
  function srcName(i) {
    if (i.own) return st.content.settings.siteName || 'מערכת האתר';
    var s = srcInfo(i);
    if (!s) return i.p || '';
    return s.pp && i.p ? i.p : s.n;
  }
  function isGeneral(i) {
    if (i.own) return false;
    var s = srcInfo(i);
    return s ? !!s.g : i.c !== 'chabad';
  }
  function showImg(i) { return !!i.i && (!isGeneral(i) || !!st.content.settings.generalImages); }
  function catOf(i) { return i.own ? 'own' : i.c; }
  function byDate(a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.d - a.d; }
  function inTab(i, tab) { return tab === 'chabad' ? (i.c === 'chabad' || !!i.ch) : i.c === tab; }
  function isStory(i) { return i.c !== 'flash' && i.c !== 'video'; }
  function iso(ms) { try { return new Date(ms).toISOString(); } catch (e) { return ''; } }

  function ownItems() {
    return (st.content.posts || []).filter(function (p) { return p && p.title; }).map(function (p) {
      var v = S.ytId(p.video);
      return {
        id: 'p-' + p.id, t: p.title, u: 'post.html#' + encodeURIComponent(p.id), s: '__own',
        c: ['chabad', 'israel', 'world'].indexOf(p.cat) >= 0 ? p.cat : 'chabad',
        d: +p.date || 0, x: p.summary || '', i: p.image || (v ? 'https://i.ytimg.com/vi/' + v + '/hqdefault.jpg' : ''),
        own: true, pin: !!p.pinned,
      };
    });
  }

  function poolItems() {
    var c = st.content;
    var hidden = new Set(c.hidden || []);
    var words = c.settings.blockedWords || [];
    var pinned = (c.pinned || []).filter(Boolean).map(function (i) { return Object.assign({}, i, { pin: true }); });
    var pinIds = new Set(pinned.map(function (i) { return i.id; }));
    var base = (st.news ? st.news.items : []).filter(function (i) { return !pinIds.has(i.id); });
    return ownItems().concat(pinned, base).filter(function (i) {
      return !hidden.has(i.id) && !S.isBlocked(i.t + ' ' + (i.x || ''), words);
    });
  }

  // ---------------------------------------------------------- markup
  function badge(i) { return '<span class="src" data-c="' + catOf(i) + '">' + esc(srcName(i)) + '</span>'; }
  function timeTag(i) { return '<time datetime="' + iso(i.d) + '" data-t="' + i.d + '">' + S.ago(i.d) + '</time>'; }
  function linkAttrs(i) {
    var href = S.safeUrl(i.u);
    return 'href="' + esc(href || '#') + '"' + (i.own ? '' : ' target="_blank" rel="noopener"');
  }

  function storyHTML(i) {
    if (i.c === 'video' && i.v) {
      return '<article class="story"><a class="story-a" href="https://www.youtube.com/watch?v=' + esc(i.v) + '" data-v="' + esc(i.v) + '" data-title="' + esc(i.t) + '">' +
        '<img class="thumb" src="' + esc(i.i) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' +
        '<div class="story-body"><div class="meta">' + badge(i) + timeTag(i) + '</div><h3 dir="auto">' + esc(i.t) + '</h3></div></a></article>';
    }
    var img = showImg(i) ? '<img class="thumb" src="' + esc(S.asset(i.i)) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '';
    return '<article class="story' + (i.own ? ' is-own' : '') + '"><a class="story-a" ' + linkAttrs(i) + '>' + img +
      '<div class="story-body"><div class="meta">' + badge(i) + timeTag(i) + (i.pin ? '<span class="pin">מוצמד</span>' : '') + '</div>' +
      '<h3 dir="auto">' + esc(i.t) + '</h3>' + (i.x ? '<p dir="auto">' + esc(i.x) + '</p>' : '') + '</div></a></article>';
  }

  function leadHTML(lead, side) {
    if (!lead) return '';
    var hasImg = showImg(lead);
    var html = '<div class="top"><a class="lead' + (hasImg ? '' : ' no-img') + '" ' + linkAttrs(lead) + '>' +
      (hasImg ? '<img class="lead-img" src="' + esc(S.asset(lead.i)) + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<div class="lead-body"><div class="meta">' + badge(lead) + timeTag(lead) + (lead.pin ? '<span class="pin">מוצמד</span>' : '') + '</div>' +
      '<h2 dir="auto">' + esc(lead.t) + '</h2>' + (lead.x ? '<p dir="auto">' + esc(lead.x) + '</p>' : '') + '</div></a>';
    if (side.length) {
      html += '<div class="top-list"><h3>עוד בחב״ד עכשיו</h3>' + side.map(function (i) {
        return '<a class="top-item" ' + linkAttrs(i) + '><span class="meta">' + badge(i) + timeTag(i) + '</span><strong dir="auto">' + esc(i.t) + '</strong></a>';
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function sectionHTML(cat, title, list) {
    return '<section class="sec" data-c="' + cat + '"><div class="sec-head"><h2>' + esc(title) + '</h2>' +
      '<button data-goto="' + cat + '">לכל העדכונים ←</button></div><div class="stories">' + list.map(storyHTML).join('') + '</div></section>';
  }

  function videoCard(i) {
    return '<button class="video" data-v="' + esc(i.v) + '" data-title="' + esc(i.t) + '"><span class="video-thumb">' +
      '<img src="https://i.ytimg.com/vi/' + esc(i.v) + '/mqdefault.jpg" alt="" loading="lazy"><span class="play"></span></span>' +
      '<span class="video-meta">' + esc(srcName(i)) + ' · ' + S.ago(i.d) + '</span><span class="video-title" dir="auto">' + esc(i.t) + '</span></button>';
  }

  function feedAd(k) {
    var ads = S.activeAds(st.content, 'feed');
    if (!ads.length) return '';
    return '<div class="ad-feed">' + S.adHTML(ads[k % ads.length]) + '</div>';
  }

  function emptyHTML(msg) { return '<div class="empty">' + esc(msg) + '</div>'; }

  // ---------------------------------------------------------- views
  function pickLead(items) {
    var stories = items.filter(isStory).sort(byDate);
    var pinned = stories.filter(function (i) { return i.pin; });
    if (pinned.length) return pinned[0];
    var dayAgo = Date.now() - 18 * 3600e3;
    var chabad = stories.filter(function (i) { return (i.c === 'chabad' || i.ch) && i.d > dayAgo; });
    return chabad.filter(function (i) { return showImg(i) && HE.test(i.t); })[0] ||
      chabad.filter(showImg)[0] || chabad[0] || stories[0] || null;
  }

  function renderHome(items) {
    var lead = pickLead(items);
    var used = new Set(lead ? [lead.id] : []);
    var side = items.filter(function (i) { return !used.has(i.id) && i.c === 'chabad' && HE.test(i.t); }).sort(byDate).slice(0, 4);
    side.forEach(function (i) { used.add(i.id); });
    var html = leadHTML(lead, side);
    SECTIONS.forEach(function (sec, k) {
      var list = items.filter(function (i) { return !used.has(i.id) && isStory(i) && inTab(i, sec[0]); }).sort(byDate).slice(0, sec[2]);
      list.forEach(function (i) { used.add(i.id); });
      if (!list.length) return;
      html += sectionHTML(sec[0], sec[1], list);
      if (k < 2) html += feedAd(k);
    });
    var vids = items.filter(function (i) { return i.c === 'video' && i.v; }).sort(byDate).slice(0, 4);
    if (vids.length) {
      html += '<section class="sec" data-c="video"><div class="sec-head"><h2>וידאו</h2><button data-goto="video">לכל הסרטונים ←</button></div><div class="videos">' + vids.map(videoCard).join('') + '</div></section>';
    }
    return html || emptyHTML('עוד אין חדשות להצגה. העדכון הבא יגיע בתוך כמה דקות.');
  }

  function renderList(items, tab) {
    var q = st.q.trim().toLowerCase();
    var list = items.filter(function (i) {
      if (q) return (tab === 'home' ? i.c !== 'flash' : inTab(i, tab)) && (i.t + ' ' + (i.x || '') + ' ' + srcName(i)).toLowerCase().indexOf(q) >= 0;
      return inTab(i, tab);
    }).sort(byDate);
    if (!list.length) return emptyHTML(q ? 'לא נמצאו כתבות עבור "' + st.q.trim() + '".' : 'אין כרגע עדכונים בקטגוריה הזו.');
    var page = list.slice(0, st.shown);
    var html = '';
    if (tab === 'video' && !q) {
      html = '<div class="videos">' + page.map(videoCard).join('') + '</div>';
    } else {
      for (var k = 0; k < page.length; k += 10) {
        html += '<div class="stories">' + page.slice(k, k + 10).map(storyHTML).join('') + '</div>';
        if (k + 10 < page.length) html += '<div style="height:18px"></div>' + (k % 20 === 0 ? feedAd(k / 10) : '');
      }
    }
    if (list.length > page.length) html += '<button class="more" id="more">עוד ' + Math.min(PAGE, list.length - page.length) + ' כתבות</button>';
    return html;
  }

  function renderFeed() {
    var box = $('#content');
    if (!st.news) return;
    if (st.tab === 'flash' && !st.q) {
      box.innerHTML = '<ol class="live-list">' + liveItems().map(flashHTML).join('') + '</ol>';
      loadTweets(box);
      return;
    }
    var items = poolItems();
    box.innerHTML = st.tab === 'home' && !st.q ? renderHome(items) : renderList(items, st.tab);
  }

  // ---------------------------------------------------------- live wire
  function liveItems() {
    var c = st.content, news = st.live || st.news;
    var manual = (c.flashes || []).filter(function (f) { return f && (f.text || f.tweet); }).map(function (f) {
      return { id: 'f-' + f.id, t: f.text || '', u: f.link || '', tweet: f.tweet || '', d: +f.date || 0, own: true, c: 'flash' };
    });
    var hidden = new Set(c.hidden || []);
    var words = c.settings.blockedWords || [];
    var auto = (news ? news.items : []).filter(function (i) { return i.c === 'flash' && !hidden.has(i.id) && !S.isBlocked(i.t, words); });
    return manual.concat(auto).sort(function (a, b) { return b.d - a.d; }).slice(0, 70);
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
    return '<li class="flash' + (i.own ? ' is-own' : '') + (isNew ? ' is-new' : '') + '">' +
      '<div class="flash-meta"><time data-clock="' + i.d + '" datetime="' + iso(i.d) + '">' + S.clock(i.d) + '</time><span class="flash-src">' + esc(srcName(i)) + '</span></div>' +
      (i.t ? '<p class="flash-text" dir="auto">' + S.linkify(esc(i.t)) + '</p>' : '') +
      (i.tweet ? tweetHTML(i.tweet) : '') +
      ((long || link) ? '<div class="flash-actions">' + (long ? '<button class="flash-more" type="button">המשך קריאה</button>' : '') +
        (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">למקור ←</a>' : '') + '</div>' : '') +
      '</li>';
  }

  var twLoading = false;
  function loadTweets(root) {
    if (!root.querySelector('blockquote.twitter-tweet')) return;
    if (window.twttr && window.twttr.widgets) { window.twttr.widgets.load(root); return; }
    if (twLoading) return;
    twLoading = true;
    var s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    document.head.appendChild(s);
  }

  function renderLive() {
    var list = liveItems();
    var sig = list.map(function (i) { return i.id; }).join('|');
    if (sig !== st.liveSig) {
      st.liveSig = sig;
      $('#live-list').innerHTML = list.length ? list.map(flashHTML).join('') : '<li class="flash"><p class="flash-text">המבזקים יופיעו כאן.</p></li>';
      loadTweets($('#live-list'));
      if (st.tab === 'flash' && !st.q) renderFeed();
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

  // ---------------------------------------------------------- rail, ads, chrome
  function renderRail() {
    var vids = (st.news ? st.news.items : []).filter(function (i) { return i.c === 'video' && i.v; }).sort(byDate).slice(0, 4);
    $('#rail-videos').hidden = !vids.length;
    $('#rail-video-list').innerHTML = vids.map(function (i) {
      return '<button class="mini-video" data-v="' + esc(i.v) + '" data-title="' + esc(i.t) + '"><img src="https://i.ytimg.com/vi/' + esc(i.v) + '/mqdefault.jpg" alt="" loading="lazy">' +
        '<span dir="auto">' + esc(i.t) + '<small>' + esc(srcName(i)) + ' · ' + S.ago(i.d) + '</small></span></button>';
    }).join('');
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
    $('#status-text').textContent = 'עודכן ' + S.ago(t) + (ok ? ' · ' + ok + ' מקורות פעילים' : '');
  }

  function renderFooter() {
    var news = st.live || st.news;
    if (!news) return;
    var seen = {};
    var links = Object.keys(news.sources).map(function (k) { return news.sources[k]; }).filter(function (s) {
      if (s.off || seen[s.n] || /גוגל|google/i.test(s.n)) return false;
      seen[s.n] = 1;
      return true;
    }).map(function (s) {
      var h = S.safeUrl(s.h);
      return h ? '<a href="' + esc(h) + '" target="_blank" rel="noopener">' + esc(s.n) + '</a>' : '<span>' + esc(s.n) + '</span>';
    });
    $('#foot-sources').innerHTML = links.join('');
  }

  function setTab(tab, push) {
    if (TAB_IDS.indexOf(tab) < 0) tab = 'home';
    st.tab = tab;
    st.shown = PAGE;
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    if (push) {
      try { history.replaceState(null, '', tab === 'home' ? location.pathname : '#' + tab); } catch (e) { location.hash = tab; }
    }
    renderFeed();
  }

  function renderAll() {
    applySettings();
    renderStatus();
    renderLive();
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
          $('#content').innerHTML = '<div class="empty">לא הצלחנו לטעון את החדשות כרגע. ננסה שוב בעוד רגע.<br><button class="more" data-retry>נסו עכשיו</button></div>';
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
        return;
      }
      var fresh = news.items.filter(function (i) { return !st.known.has(i.id) && isStory(i); }).length;
      renderStatus();
      renderLive();
      if (contentChanged) { applySettings(); renderFeed(); renderRail(); }
      var pill = $('#new-pill');
      if (fresh > 0) {
        pill.textContent = fresh === 1 ? 'כתבה חדשה אחת · הצגה' : fresh + ' כתבות חדשות · הצגה';
        pill.hidden = false;
      }
    });
  }

  function showFresh() {
    st.news = st.live;
    st.known = new Set(st.news.items.map(function (i) { return i.id; }));
    $('#new-pill').hidden = true;
    renderFeed();
    renderRail();
    $('#feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------- player
  function openPlayer(v, title) {
    var d = $('#player');
    var yt = 'https://www.youtube.com/watch?v=' + encodeURIComponent(v);
    if (!d.showModal) { window.open(yt, '_blank', 'noopener'); return; }
    $('#player-frame').innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v) + '?autoplay=1&rel=0" title="' + esc(title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    $('#player-title').textContent = title;
    $('#player-yt').href = yt;
    d.showModal();
  }

  // ---------------------------------------------------------- events
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-goto],[data-v],.flash-more,#more,#new-pill,[data-retry]');
    if (!t) return;
    if (t.matches('[data-tab]')) { setTab(t.dataset.tab, true); return; }
    if (t.matches('[data-goto]')) { setTab(t.dataset.goto, true); $('#feed').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.matches('[data-v]')) { e.preventDefault(); openPlayer(t.dataset.v, t.dataset.title || ''); return; }
    if (t.matches('.flash-more')) { var li = t.closest('.flash'); li.classList.toggle('is-open'); t.textContent = li.classList.contains('is-open') ? 'הצג פחות' : 'המשך קריאה'; return; }
    if (t.id === 'more') { st.shown += PAGE; renderFeed(); return; }
    if (t.id === 'new-pill') { showFresh(); return; }
    if (t.matches('[data-retry]')) { load(); }
  });

  document.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el.tagName === 'IMG') {
      if (el.classList.contains('thumb')) el.remove();
      else if (el.classList.contains('lead-img')) { var lead = el.closest('.lead'); el.remove(); if (lead) lead.classList.add('no-img'); }
    }
  }, true);

  $('#player-close').addEventListener('click', function () { $('#player').close(); });
  $('#player').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#player').addEventListener('close', function () { $('#player-frame').innerHTML = ''; });

  var qTimer;
  $('#q').addEventListener('input', function (e) {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { st.q = e.target.value; st.shown = PAGE; renderFeed(); }, 160);
  });

  window.addEventListener('hashchange', function () { setTab(location.hash.slice(1) || 'home', false); });
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
  }
  load();
})();
