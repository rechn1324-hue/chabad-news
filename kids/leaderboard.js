// טבלת השיאים של כל הילדים – "שבור את השיא של כולם"
// שליחה: POST ל-ntfy. הרובוט של האתר אוסף את התוצאות ומפרסם אותן ב-data/scores.json כל ~15 דקות.
// קריאה: data/scores.json + התוצאות שנשלחו מהמכשיר הזה (כדי שהילד יראה את התוצאה שלו מיד).
window.Board = (function () {
  'use strict';
  var POST_URL = 'https://ntfy.sh/cnk-scores-7f3a9c2e';
  var SCORES_URL = '../data/scores.json';
  var MINE_KEY = 'kids-scores-mine';   // {game: [{n,s,t}]} – מה שנשלח מהמכשיר הזה
  var NICK_KEY = 'kids-nick';
  var BEST_KEY = 'kids-best';          // {game: שיא אישי}
  var LEGACY = { tank: 'tank-best' };  // שיא ישן שנשמר לפני טבלת השיאים
  var MAX_NAME = 14, KEEP = 20;

  // מזהי המשחקים בטבלה (אותיות לטיניות קטנות בלבד)
  var GAMES = [
    { id: 'tank3d', name: 'טנק המבצעים 3D', inName: 'בטנק המבצעים 3D', page: 'tank3d.html', icon: '🚚', unit: 'נקודות' },
    { id: 'light', name: 'האור מנצח', inName: 'במשחק "האור מנצח"', page: 'light.html', icon: '🕯️', unit: 'נקודות' },
    { id: 'tower', name: 'בונים את בית המקדש', inName: 'במשחק "בונים את בית המקדש"', page: 'tower.html', icon: '🧱', unit: 'אבנים' },
    { id: 'tank', name: 'טנק המבצעים', inName: 'בטנק המבצעים', page: 'tank.html', icon: '🚐', unit: 'מצוות' },
    { id: 'letters', name: 'בלוני האותיות', inName: 'בבלוני האותיות', page: 'letters.html', icon: '🎈', unit: 'נקודות' },
    { id: 'quiz-small', name: 'החידון לקטנים', inName: 'בחידון לקטנים', page: 'quiz.html', icon: '❓', unit: 'נקודות' },
    { id: 'quiz-big', name: 'החידון לגדולים', inName: 'בחידון לגדולים', page: 'quiz.html', icon: '🎓', unit: 'נקודות' },
  ];

  function getLS(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function setLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } }
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function fmt(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function info(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return { id: id, name: id, inName: '', page: '', icon: '🏆', unit: 'נקודות' };
  }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

  // ---------------------------------------------------------------- כינוי: אותיות, ספרות ורווח בלבד, עד 14 תווים
  var NOT_ALLOWED;
  try { NOT_ALLOWED = new RegExp('[^\\p{L}0-9 ]', 'gu'); } catch (e) { NOT_ALLOWED = /[^A-Za-z0-9 À-ɏЀ-ӿא-ת]/g; }
  function cleanName(n, keepEdges) {
    n = String(n == null ? '' : n).replace(/\s+/g, ' ').replace(NOT_ALLOWED, '');
    var digits = 0; // לא יותר מ-4 ספרות – שלא יכתבו מספר טלפון
    n = n.replace(/[0-9]/g, function (d) { digits++; return digits > 4 ? '' : d; });
    n = n.replace(/ {2,}/g, ' ').replace(/^ /, '');
    n = (Array.from ? Array.from(n) : n.split('')).slice(0, MAX_NAME).join('');
    return keepEdges ? n : n.trim();
  }
  function getNick() { var n = getLS(NICK_KEY, ''); return typeof n === 'string' ? cleanName(n) : ''; }
  function setNick(n) { setLS(NICK_KEY, cleanName(n)); }

  // ---------------------------------------------------------------- שיא אישי (במכשיר הזה)
  function best(game) {
    var b = Number(obj(getLS(BEST_KEY, {}))[game]) || 0;
    if (LEGACY[game]) b = Math.max(b, Number(getLS(LEGACY[game], 0)) || 0);
    return b;
  }
  function record(game, score) {
    var prev = best(game);
    if (score > prev) {
      var all = obj(getLS(BEST_KEY, {}));
      all[game] = score;
      setLS(BEST_KEY, all);
      if (LEGACY[game]) setLS(LEGACY[game], score);
    }
    return { prev: prev, best: Math.max(prev, score), isNew: score > prev && score > 0 };
  }

  // ---------------------------------------------------------------- רשימות
  function cleanList(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    a.forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var s = Math.floor(Number(e.s));
      if (!isFinite(s) || s < 0) return;
      out.push({ n: cleanName(e.n) || '?', s: s, t: Number(e.t) || 0 });
    });
    return out;
  }
  function byScore(a, b) { return b.s - a.s || a.t - b.t; }
  function key(e) { return e.n + '|' + e.s + '|' + e.t; }
  function mineAll() { return obj(getLS(MINE_KEY, {})); }

  var globalP = null;
  function fetchGlobal(force) {
    if (!globalP || force) {
      var url = SCORES_URL + '?v=' + Date.now().toString(36);
      globalP = (window.fetch ? fetch(url, { cache: 'no-store' }) : Promise.reject(new Error('no fetch')))
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { return obj(j); })
        .catch(function () { return {}; }); // הקובץ עוד לא קיים – טבלה ריקה
    }
    return globalP;
  }

  // הטבלה של משחק: כולם (מהקובץ) + מה שנשלח מהמכשיר הזה, ממוין מהגבוה לנמוך
  function load(game) {
    return fetchGlobal().then(function (j) {
      var list = cleanList(obj(j.games)[game]);
      var mine = cleanList(mineAll()[game]);
      var mk = {}, seen = {};
      mine.forEach(function (e) { mk[key(e)] = true; });
      list.forEach(function (e) { seen[key(e)] = true; if (mk[key(e)]) e.mine = true; });
      mine.forEach(function (e) { if (!seen[key(e)]) { e.mine = true; list.push(e); } });
      list.sort(byScore);
      list = list.slice(0, KEEP);
      list.updated = typeof j.updated === 'string' ? j.updated : '';
      return list;
    });
  }

  function saveMine(game, e) {
    var m = mineAll();
    var l = cleanList(m[game]);
    l.push(e);
    l.sort(byScore);
    m[game] = l.slice(0, KEEP);
    setLS(MINE_KEY, m);
  }
  function post(game, e) {
    try {
      return fetch(POST_URL, { method: 'POST', body: JSON.stringify({ g: game, n: e.n, s: e.s, t: e.t }), keepalive: true })
        .then(function (r) { return !!r.ok; }, function () { return false; });
    } catch (err) { return Promise.resolve(false); }
  }
  function submit(game, name, score) {
    game = String(game || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    name = cleanName(name);
    score = Math.floor(Number(score));
    if (!game || !name || !isFinite(score) || score <= 0) return Promise.resolve(null);
    var e = { n: name, s: score, t: Date.now() };
    saveMine(game, e);
    return post(game, e).then(function (sent) { return { entry: e, sent: sent }; });
  }

  function agoText(iso) {
    var t = Date.parse(iso || '');
    if (!t) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'ממש עכשיו';
    if (m < 60) return 'לפני ' + (m === 1 ? 'דקה' : m + ' דקות');
    var h = Math.round(m / 60);
    if (h < 24) return 'לפני ' + (h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות');
    var d = Math.round(h / 24);
    return 'לפני ' + (d === 1 ? 'יום' : d === 2 ? 'יומיים' : d + ' ימים');
  }

  function pageURL() { return location.href.split('#')[0]; }
  function shareHref(g, score, unit, isNew) {
    var msg = isNew
      ? 'שברתי שיא ' + g.inName + ': ' + fmt(score) + ' ' + unit + '!'
      : 'הגעתי ל-' + fmt(score) + ' ' + unit + ' ' + g.inName + '!';
    return 'https://wa.me/?text=' + encodeURIComponent(msg + ' נסו לשבור אותי 👉 ' + pageURL());
  }

  // שורה מתחת לכפתור "מתחילים": השיא שלכם + השיא של כולם
  function startLine(game, el) {
    if (!el) return;
    var b = best(game);
    var mine = b > 0 ? 'השיא שלכם: ' + fmt(b) : '';
    el.textContent = mine;
    load(game).then(function (list) {
      var top = list[0];
      el.textContent = (mine ? mine + ' · ' : '') + (top ? '🏆 השיא של כולם: ' + fmt(top.s) + ' (' + top.n + ')' : '🏆 עוד אין שיא של כולם – תהיו הראשונים!');
    });
  }

  // ---------------------------------------------------------------- מסך סוף המשחק
  var openEl = null, openOpts = null;
  function isOpen() { return !!openEl; }
  function close() {
    if (!openEl) return;
    var el = openEl;
    openEl = null; openOpts = null;
    el.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (!openEl || e.key !== 'Tab') return;
    var f = openEl.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    else if (!openEl.contains(document.activeElement)) { first.focus(); e.preventDefault(); }
  }

  /* o = { game, score, title, text, stars, unit, againLabel, onAgain, extra: [{label, cls, onClick}] } */
  function showResult(o) {
    close();
    o = o || {};
    var game = o.game, g = info(game);
    var score = Math.max(0, Math.floor(Number(o.score) || 0));
    var rec = o.record === false ? { prev: best(game), best: best(game), isNew: false } : record(game, score);
    var unit = o.unit || g.unit || 'נקודות';
    var title = o.title || (rec.isNew ? 'שיא אישי חדש!' : 'כל הכבוד!');
    var bestLine = rec.isNew
      ? (rec.prev > 0 ? '🎉 שברתם את השיא האישי שלכם (' + fmt(rec.prev) + ')!' : '🎉 זה השיא האישי הראשון שלכם!')
      : 'השיא האישי שלכם: ' + fmt(rec.best);
    var extra = (o.extra || []).map(function (b, i) {
      return '<button class="kbtn ' + esc(b.cls || 'white') + '" type="button" data-extra="' + i + '">' + esc(b.label) + '</button>';
    }).join('');

    var el = document.createElement('div');
    el.className = 'kmodal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'rs-title');
    el.innerHTML = '<div class="kmodal-card rs">' +
      '<h2 id="rs-title">' + esc(title) + '</h2>' +
      (o.stars ? '<div class="stars" role="img" aria-label="' + o.stars + ' כוכבים">' + '⭐'.repeat(o.stars) + '</div>' : '') +
      '<div class="rs-score"><b>' + fmt(score) + '</b>' + esc(unit) + '</div>' +
      (o.text ? '<p class="rs-text">' + esc(o.text) + '</p>' : '') +
      '<p class="rs-best' + (rec.isNew ? ' new' : '') + '">' + esc(bestLine) + '</p>' +
      '<div class="rs-actions"><button class="kbtn blue" type="button" data-act="again">' + esc(o.againLabel || 'עוד סיבוב') + '</button>' +
      (score > 0 ? '<a class="kbtn green" target="_blank" rel="noopener" href="' + esc(shareHref(g, score, unit, rec.isNew)) + '">שתפו את השיא 💬</a>' : '') +
      extra + '</div>' +
      '<section class="lb" aria-labelledby="lb-title"><h3 id="lb-title">🏆 שיא כל הזמנים</h3>' +
      '<ol class="lb-list"><li class="lb-empty">טוענים את הטבלה…</li></ol>' +
      '<p class="lb-place" hidden></p>' +
      (score > 0
        ? '<form class="lb-form" novalidate><label for="rs-nick">הכינוי שלכם בטבלה</label>' +
          '<div class="lb-row"><input id="rs-nick" type="text" maxlength="14" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" placeholder="למשל: מענדי770" value="' + esc(getNick()) + '">' +
          '<button class="kbtn green" type="submit">שליחה לטבלת השיאים</button></div>' +
          '<p class="lb-hint">כתבו כינוי, לא שם מלא. אפשר רק אותיות, מספרים ורווח.</p>' +
          '<p class="lb-msg" role="status" aria-live="polite"></p></form>'
        : '<p class="lb-note">צריך לפחות נקודה אחת כדי להיכנס לטבלה. נסו שוב!</p>') +
      '<p class="lb-note" data-upd>הטבלה של כל הילדים מתעדכנת בערך כל 15 דקות. התוצאה שלכם מופיעה אצלכם מיד.</p></section>' +
      '<div class="rs-foot"><a class="kback" href="./">→ כל המשחקים</a></div>' +
      '</div>';
    document.body.appendChild(el);
    openEl = el; openOpts = o;

    var ol = el.querySelector('.lb-list'), placeEl = el.querySelector('.lb-place'), updEl = el.querySelector('[data-upd]');
    var sentEntry = null, sending = false;

    function row(e, i) {
      var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
      return '<li' + (e.mine ? ' class="me"' : '') + '><span class="lb-rank">' + medal + '</span><span class="lb-name">' + esc(e.n) +
        (e.mine ? ' <small>(אתם)</small>' : '') + '</span><span class="lb-score">' + fmt(e.s) + '</span></li>';
    }
    function renderList() {
      load(game).then(function (list) {
        if (openEl !== el) return;
        var top = list.slice(0, 10);
        ol.innerHTML = top.length ? top.map(row).join('') : '<li class="lb-empty">עוד אין שיאים – תהיו הראשונים!</li>';
        if (list.updated) updEl.textContent = 'הטבלה של כל הילדים עודכנה ' + agoText(list.updated) + ' ומתעדכנת בערך כל 15 דקות. התוצאה שלכם מופיעה אצלכם מיד.';
        if (score <= 0) return;
        placeEl.hidden = false;
        if (sentEntry) {
          var idx = -1;
          list.forEach(function (e, i) { if (idx < 0 && e.mine && e.t === sentEntry.t && e.s === sentEntry.s) idx = i; });
          placeEl.textContent = idx >= 0 && idx < 10 ? 'אתם במקום ' + (idx + 1) + ' בטבלה! 🎉' : 'נשלח! עוד קצת ותיכנסו לעשירייה הראשונה 💪';
        } else {
          var place = 1;
          list.forEach(function (e) { if (e.s >= score) place++; });
          placeEl.textContent = place <= 10
            ? 'עם ' + fmt(score) + ' ' + unit + ' תיכנסו למקום ' + place + ' בטבלה! שלחו עכשיו 👇'
            : 'כדי להיכנס לעשירייה צריך יותר מ-' + fmt(top[9].s) + ' ' + unit + '. אפשר לשלוח בכל זאת 👇';
        }
      });
    }

    el.querySelector('[data-act="again"]').addEventListener('click', function () { close(); if (o.onAgain) o.onAgain(); });
    (o.extra || []).forEach(function (b, i) {
      el.querySelector('[data-extra="' + i + '"]').addEventListener('click', function () { close(); if (b.onClick) b.onClick(); });
    });

    var form = el.querySelector('.lb-form');
    if (form) {
      var input = form.querySelector('input'), btn = form.querySelector('button'), msg = form.querySelector('.lb-msg');
      var say = function (t, cls) { msg.textContent = t; msg.className = 'lb-msg' + (cls ? ' ' + cls : ''); };
      input.addEventListener('input', function () { var c = cleanName(input.value, true); if (c !== input.value) input.value = c; });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (sending) return;
        var name = cleanName(input.value);
        if (name.length < 2) { say('כתבו כינוי של 2 אותיות לפחות 🙂', 'err'); input.focus(); return; }
        setNick(name);
        input.value = name;
        sending = true; btn.disabled = true; input.disabled = true;
        say('שולחים…', '');
        var p = sentEntry
          ? post(game, sentEntry).then(function (ok) { return { entry: sentEntry, sent: ok }; })
          : submit(game, name, score);
        p.then(function (r) {
          sending = false;
          if (!r) { say('משהו השתבש – נסו שוב', 'err'); btn.disabled = false; input.disabled = false; return; }
          sentEntry = r.entry;
          if (r.sent) { say('נשלח! ✓ בעדכון הבא (עד כ-15 דקות) כל הילדים יראו את התוצאה שלכם.', 'ok'); btn.textContent = 'נשלח ✓'; }
          else { say('נשמר אצלכם ✓ אבל לא הצלחנו לשלוח עכשיו. בדקו את החיבור לאינטרנט ונסו שוב.', 'err'); btn.disabled = false; btn.textContent = 'לשלוח שוב'; }
          renderList();
        });
      });
    }

    renderList();
    var againBtn = el.querySelector('[data-act="again"]');
    try { againBtn.focus({ preventScroll: true }); } catch (e) { againBtn.focus(); }
    document.addEventListener('keydown', onKey, true);
    if (rec.isNew && window.Kids) { window.Kids.sfx.win(); window.Kids.confetti(); }
    return { close: close, el: el, record: rec };
  }

  return {
    GAMES: GAMES, info: info, submit: submit, load: load, refresh: function () { return fetchGlobal(true); },
    best: best, record: record, cleanName: cleanName, nick: getNick,
    showResult: showResult, close: close, isOpen: isOpen, startLine: startLine, shareHref: shareHref, ago: agoText,
  };
})();
