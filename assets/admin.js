// עמוד הניהול: כתבות, פרסומות, מבזקים, הסתרה/הצמדה של חדשות, מקורות והגדרות.
// כל שינוי נשמר בקובץ data/content.json במאגר ב-GitHub, והאתר מתעדכן אוטומטית תוך דקה-שתיים.
(function () {
  'use strict';
  var S = window.Site, esc = S.esc;
  var API = 'https://api.github.com';
  var TOKEN_KEY = 'cn-admin-token';
  var CONTENT_PATH = 'data/content.json';
  var CAT_NAMES = { chabad: 'חב״ד', israel: 'ישראל ופוליטיקה', world: 'עולם', flash: 'מבזקים', video: 'וידאו', community: 'שמחות וקהילה', kids: 'ילדים' };
  var FILTER_NAMES = { women: 'כתבות על נשים ובנות', weather: 'מזג אוויר', sports: 'ספורט', gossip: 'רכילות ובידור', lifestyle: 'בריאות, מתכונים ולייפסטייל', markets: 'בורסה וכסף', promo: 'תוכן שיווקי' };
  var GAME_NAMES = { tank: 'טנק המבצעים', tank3d: 'טנק המבצעים 3D', light: 'האור מנצח', tower: 'בונים את בית המקדש', letters: 'בלוני האותיות', 'quiz-small': 'החידון – קטנים', 'quiz-big': 'החידון – גדולים' };
  var PLACEMENTS = {
    top: { name: 'באנר בראש האתר', size: 'מומלץ: 1200×150' },
    feed: { name: 'בין החדשות', size: 'מומלץ: 900×250' },
    side: { name: 'בצד העמוד (מחשב)', size: 'מומלץ: 600×500' },
    kids: { name: 'באיזור הילדים', size: 'מומלץ: 900×200' },
  };

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  // ---------------------------------------------------------------- config
  var C = (function () {
    var c = Object.assign({ owner: '', repo: '', branch: 'main' }, window.SITE_CONFIG || {});
    var h = location.hostname;
    if (/\.github\.io$/i.test(h)) {
      c.owner = h.split('.')[0];
      var seg = location.pathname.split('/').filter(Boolean)[0];
      c.repo = seg && !/\.html?$/i.test(seg) ? seg : h;
    }
    return c;
  })();
  var REPO = '/repos/' + C.owner + '/' + C.repo;

  var st = { token: '', content: null, sha: '', news: null, scores: null, view: 'posts', editPost: null, editAd: null, busy: false, autoCat: 'all', autoQ: '' };

  // ---------------------------------------------------------------- storage
  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function writeToken(t, remember) {
    try {
      localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
      if (t) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    } catch (e) { /* פרטיות מלאה – נשמר רק בזיכרון */ }
  }

  // ---------------------------------------------------------------- GitHub API
  function gh(path, opts) {
    opts = opts || {};
    var headers = { Authorization: 'Bearer ' + st.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: opts.method || 'GET', headers: headers, body: opts.body, cache: 'no-store' }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var e = new Error(data.message || ('HTTP ' + res.status));
          e.status = res.status;
          throw e;
        }
        return data;
      });
    });
  }
  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64encode(str) { return bytesToB64(new TextEncoder().encode(str)); }
  function b64decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function errMsg(e) {
    if (!e) return 'משהו השתבש. נסו שוב.';
    if (e.status === 401) return 'המפתח לא תקין או שפג תוקפו. התנתקו והיכנסו עם מפתח חדש.';
    if (e.status === 403) return 'למפתח אין הרשאת כתיבה. ודאו שבחרתם Contents: Read and write עבור המאגר.';
    if (e.status === 404) return 'המאגר ' + C.owner + '/' + C.repo + ' לא נמצא, או שלמפתח אין גישה אליו.';
    if (e.message === 'Failed to fetch') return 'אין חיבור לאינטרנט, או ש-GitHub לא זמין כרגע.';
    return e.message || 'משהו השתבש. נסו שוב.';
  }

  function loadContent() {
    return gh(REPO + '/contents/' + CONTENT_PATH + '?ref=' + encodeURIComponent(C.branch)).then(function (r) {
      st.sha = r.sha;
      st.content = S.normContent(JSON.parse(b64decode(r.content)));
    });
  }
  function putContent(message) {
    var body = { message: message, content: b64encode(JSON.stringify(st.content, null, 2) + '\n'), sha: st.sha, branch: C.branch };
    return gh(REPO + '/contents/' + CONTENT_PATH, { method: 'PUT', body: JSON.stringify(body) }).then(function (r) { st.sha = r.content.sha; });
  }
  // מחיל שינוי ושומר. אם הקובץ השתנה בינתיים – טוען מחדש, מחיל שוב ושומר.
  function commit(message, mutate) {
    setBusy(true);
    mutate(st.content);
    return putContent(message).catch(function (e) {
      if (e.status === 409 || e.status === 422) {
        return loadContent().then(function () { mutate(st.content); return putContent(message); });
      }
      throw e;
    }).then(function () {
      toast('נשמר. השינוי יופיע באתר בתוך דקה-שתיים.');
      return true;
    }, function (e) {
      toast(errMsg(e), true);
      return loadContent().catch(function () {}).then(function () { return false; });
    }).then(function (ok) {
      setBusy(false);
      render();
      return ok;
    });
  }

  function uploadImage(file) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return Promise.reject(new Error('אפשר להעלות רק תמונות JPG, PNG, WEBP או GIF.'));
    var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type];
    var prep = (file.type !== 'image/gif' && file.size > 450 * 1024) ? shrink(file, 1600).then(function (b) { ext = 'jpg'; return b; }) : Promise.resolve(file);
    return prep.then(function (blob) {
      if (blob.size > 6 * 1024 * 1024) throw new Error('התמונה גדולה מדי (עד 6MB).');
      return blob.arrayBuffer();
    }).then(function (buf) {
      var d = new Date();
      var path = 'uploads/' + d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
      return gh(REPO + '/contents/' + path, { method: 'PUT', body: JSON.stringify({ message: 'העלאת תמונה', content: bytesToB64(new Uint8Array(buf)), branch: C.branch }) })
        .then(function () { return path; });
    });
  }
  function shrink(file, maxW) {
    return createImageBitmap(file).then(function (img) {
      var scale = Math.min(1, maxW / img.width);
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.86); });
    });
  }
  // תמונה שהועלתה עכשיו עוד לא נמצאת באתר (עד הפרסום הבא) – בניהול מציגים אותה ישר מהמאגר
  function previewSrc(path) {
    if (!path) return '';
    if (/^https?:/i.test(path)) return path;
    return 'https://raw.githubusercontent.com/' + C.owner + '/' + C.repo + '/' + C.branch + '/' + path.split('/').map(encodeURIComponent).join('/');
  }

  // ---------------------------------------------------------------- UI helpers
  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 7000 : 3500);
  }
  function setBusy(b) {
    st.busy = b;
    $$('#view button, #view input, #view select, #view textarea').forEach(function (el) { el.disabled = b; });
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function fmt(ms) { return ms ? S.when(ms) : ''; }
  function catOptions(sel, cats) {
    return cats.map(function (c) { return '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + CAT_NAMES[c] + '</option>'; }).join('');
  }
  function confirmBtn(btn, run) {
    if (btn.classList.contains('confirm')) { run(); return; }
    btn.classList.add('confirm');
    var old = btn.textContent;
    btn.textContent = 'בטוח? לחצו שוב';
    setTimeout(function () { if (btn.isConnected) { btn.classList.remove('confirm'); btn.textContent = old; } }, 3500);
  }
  function srcName(i) {
    var s = st.news && st.news.sources[i.s];
    if (!s) return i.p || i.s;
    return s.pp && i.p ? i.p : s.n;
  }

  // ---------------------------------------------------------------- views
  function viewPosts() {
    var c = st.content;
    var p = st.editPost ? c.posts.filter(function (x) { return x.id === st.editPost; })[0] : null;
    var posts = c.posts.slice().sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    return '<div class="panel"><h2>' + (p ? 'עריכת כתבה' : 'כתבה חדשה') + '</h2>' +
      '<p class="hint">כתבה שתכתבו כאן תופיע באתר עם שם האתר כמקור, ותיפתח בעמוד משלה. אפשר להוסיף תמונה או סרטון מיוטיוב.</p>' +
      '<form data-form="post" data-image="' + esc(p ? p.image || '' : '') + '">' +
      '<div class="field"><label for="p-title">כותרת</label><input type="text" id="p-title" name="title" required maxlength="200" value="' + esc(p ? p.title : '') + '"></div>' +
      '<div class="field"><label for="p-summary">תקציר <small>(שורה או שתיים שמופיעות ברשימת החדשות)</small></label><textarea id="p-summary" name="summary" maxlength="400">' + esc(p ? p.summary || '' : '') + '</textarea></div>' +
      '<div class="field"><label for="p-body">תוכן הכתבה</label><textarea class="tall" id="p-body" name="body">' + esc(p ? p.body || '' : '') + '</textarea><small>שורה ריקה מתחילה פסקה חדשה. שורה שמתחילה ב-## תהיה כותרת משנה.</small></div>' +
      '<div class="field"><span class="label">תמונה</span><div class="img-pick">' +
        '<img id="p-preview" alt="" ' + (p && p.image ? 'src="' + esc(previewSrc(p.image)) + '"' : 'hidden') + '>' +
        '<input type="file" id="p-image" name="imagefile" accept="image/jpeg,image/png,image/webp,image/gif">' +
        (p && p.image ? '<button class="btn sm" type="button" data-act="post-noimg">הסרת התמונה</button>' : '') +
      '</div></div>' +
      '<div class="row">' +
        '<div class="field"><label for="p-video">סרטון יוטיוב <small>(לא חובה)</small></label><input type="url" id="p-video" name="video" dir="ltr" placeholder="https://www.youtube.com/watch?v=…" value="' + esc(p ? p.video || '' : '') + '"></div>' +
        '<div class="field"><label for="p-link">קישור למקור <small>(לא חובה)</small></label><input type="url" id="p-link" name="link" dir="ltr" placeholder="https://…" value="' + esc(p ? p.link || '' : '') + '"></div>' +
        '<div class="field"><label for="p-cat">קטגוריה</label><select id="p-cat" name="cat">' + catOptions(p ? p.cat : 'chabad', ['chabad', 'community', 'israel', 'world']) + '</select></div>' +
      '</div>' +
      '<label class="check"><input type="checkbox" name="pinned"' + (p && p.pinned ? ' checked' : '') + '> להציג בראש העמוד הראשי (כתבה ראשית)</label>' +
      '<div class="actions"><button class="btn primary" type="submit">' + (p ? 'שמירת השינויים' : 'פרסום הכתבה') + '</button>' +
      (p ? '<button class="btn" type="button" data-act="post-cancel">ביטול עריכה</button>' : '') + '</div></form></div>' +
      '<div class="panel"><h3>הכתבות שפרסמתם (' + posts.length + ')</h3><div class="list">' +
      (posts.length ? posts.map(function (x) {
        return '<div class="list-item">' + (x.image ? '<img class="thumb-sm" src="' + esc(previewSrc(x.image)) + '" alt="">' : '<span class="noimg"></span>') +
          '<div><div class="t"><a href="post.html#' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a></div>' +
          '<div class="sub"><span>' + fmt(x.date) + '</span><span class="tag">' + (CAT_NAMES[x.cat] || '') + '</span>' + (x.pinned ? '<span class="tag gold">ראשית</span>' : '') + '</div></div>' +
          '<div class="btns"><button class="btn sm" type="button" data-act="post-edit" data-id="' + esc(x.id) + '">עריכה</button>' +
          '<button class="btn sm danger" type="button" data-act="post-del" data-id="' + esc(x.id) + '">מחיקה</button></div></div>';
      }).join('') : '<p class="empty-note">עוד לא פרסמתם כתבות.</p>') + '</div></div>';
  }

  function viewAds() {
    var c = st.content;
    var a = st.editAd ? c.ads.filter(function (x) { return x.id === st.editAd; })[0] : null;
    var opts = Object.keys(PLACEMENTS).map(function (k) {
      return '<option value="' + k + '"' + ((a ? a.placement : 'feed') === k ? ' selected' : '') + '>' + PLACEMENTS[k].name + ' – ' + PLACEMENTS[k].size + '</option>';
    }).join('');
    return '<div class="panel"><h2>' + (a ? 'עריכת פרסומת' : 'פרסומת חדשה') + '</h2>' +
      '<p class="hint">מעלים תמונה של המודעה, בוחרים איפה היא תופיע ולאן היא מובילה. אפשר לקבוע תאריך שבו היא תרד אוטומטית. כמה פרסומות באותו מקום יוצגו בסבב.</p>' +
      '<form data-form="ad" data-image="' + esc(a ? a.image || '' : '') + '">' +
      '<div class="row">' +
        '<div class="field"><label for="a-name">שם המפרסם <small>(לשימושכם)</small></label><input type="text" id="a-name" name="name" required maxlength="100" value="' + esc(a ? a.name : '') + '"></div>' +
        '<div class="field"><label for="a-place">מיקום</label><select id="a-place" name="placement">' + opts + '</select></div>' +
      '</div>' +
      '<div class="field"><span class="label">תמונת המודעה</span><div class="img-pick">' +
        '<img id="a-preview" alt="" ' + (a && a.image ? 'src="' + esc(previewSrc(a.image)) + '"' : 'hidden') + '>' +
        '<input type="file" id="a-image" name="imagefile" accept="image/jpeg,image/png,image/webp,image/gif"' + (a ? '' : ' required') + '>' +
      '</div></div>' +
      '<div class="row">' +
        '<div class="field"><label for="a-link">לאן המודעה מובילה <small>(קישור)</small></label><input type="url" id="a-link" name="link" dir="ltr" placeholder="https://…" value="' + esc(a ? a.link || '' : '') + '"></div>' +
        '<div class="field"><label for="a-until">להוריד אוטומטית בתאריך <small>(לא חובה)</small></label><input type="date" id="a-until" name="until" value="' + esc(a ? a.until || '' : '') + '"></div>' +
      '</div>' +
      '<label class="check"><input type="checkbox" name="active"' + (!a || a.active !== false ? ' checked' : '') + '> המודעה פעילה</label>' +
      '<div class="actions"><button class="btn primary" type="submit">' + (a ? 'שמירת השינויים' : 'פרסום המודעה') + '</button>' +
      (a ? '<button class="btn" type="button" data-act="ad-cancel">ביטול עריכה</button>' : '') + '</div></form></div>' +
      '<div class="panel"><h3>כל הפרסומות (' + c.ads.length + ')</h3><div class="list">' +
      (c.ads.length ? c.ads.map(function (x) {
        var today = new Date().toISOString().slice(0, 10);
        var live = x.active !== false && (!x.until || x.until >= today);
        return '<div class="list-item"><img class="thumb-sm" src="' + esc(previewSrc(x.image)) + '" alt="">' +
          '<div><div class="t">' + esc(x.name || 'פרסומת') + '</div><div class="sub"><span>' + esc((PLACEMENTS[x.placement] || {}).name || x.placement) + '</span>' +
          '<span class="tag ' + (live ? 'ok' : '') + '">' + (live ? 'פעילה' : (x.active === false ? 'מושהית' : 'הסתיימה')) + '</span>' +
          (x.until ? '<span>עד ' + esc(x.until.split('-').reverse().join('.')) + '</span>' : '') + '</div></div>' +
          '<div class="btns"><button class="btn sm" type="button" data-act="ad-edit" data-id="' + esc(x.id) + '">עריכה</button>' +
          '<button class="btn sm" type="button" data-act="ad-toggle" data-id="' + esc(x.id) + '">' + (x.active === false ? 'הפעלה' : 'השהיה') + '</button>' +
          '<button class="btn sm danger" type="button" data-act="ad-del" data-id="' + esc(x.id) + '">מחיקה</button></div></div>';
      }).join('') : '<p class="empty-note">אין פרסומות עדיין.</p>') + '</div></div>';
  }

  function viewFlashes() {
    var list = st.content.flashes.slice().sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    return '<div class="panel"><h2>מבזק חדש</h2>' +
      '<p class="hint">המבזק יופיע מיד בראש עמודת המבזקים, בין העדכונים מטלגרם ומאתרי החדשות. אפשר גם להטמיע ציוץ מ-X (טוויטר): מעתיקים את הקישור לציוץ ומדביקים אותו כאן.</p>' +
      '<form data-form="flash">' +
      '<div class="field"><label for="f-text">טקסט המבזק</label><textarea id="f-text" name="text" maxlength="600" placeholder="למשל: הרב … ינאם הערב בכינוס המרכזי"></textarea></div>' +
      '<div class="row">' +
        '<div class="field"><label for="f-tweet">קישור לציוץ מ-X <small>(לא חובה)</small></label><input type="url" id="f-tweet" name="tweet" dir="ltr" placeholder="https://x.com/…/status/…"></div>' +
        '<div class="field"><label for="f-link">קישור להרחבה <small>(לא חובה)</small></label><input type="url" id="f-link" name="link" dir="ltr" placeholder="https://…"></div>' +
      '</div>' +
      '<div class="actions"><button class="btn primary" type="submit">פרסום המבזק</button></div></form></div>' +
      '<div class="panel"><h3>המבזקים שפרסמתם</h3><div class="list">' +
      (list.length ? list.slice(0, 40).map(function (f) {
        return '<div class="list-item compact"><div><div class="sub"><span>' + fmt(f.date) + '</span>' + (f.tweet ? '<span class="tag">ציוץ</span>' : '') + '</div>' +
          '<div class="t" dir="auto">' + esc(f.text || f.tweet || '') + '</div></div>' +
          '<div class="btns"><button class="btn sm danger" type="button" data-act="flash-del" data-id="' + esc(f.id) + '">מחיקה</button></div></div>';
      }).join('') : '<p class="empty-note">עוד לא פרסמתם מבזקים.</p>') + '</div></div>';
  }

  function viewAuto() {
    var c = st.content;
    if (!st.news) return '<div class="panel"><p class="empty-note">טוען את החדשות שנאספו…</p></div>';
    var hidden = new Set(c.hidden);
    var pinnedIds = new Set(c.pinned.map(function (i) { return i.id; }));
    var q = st.autoQ.trim().toLowerCase();
    var items = st.news.items.filter(function (i) {
      if (hidden.has(i.id)) return false;
      if (st.autoCat !== 'all' && i.c !== st.autoCat) return false;
      return !q || (i.t + ' ' + srcName(i)).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 80);
    var byId = {};
    st.news.items.forEach(function (i) { byId[i.id] = i; });
    var cats = ['all', 'chabad', 'community', 'israel', 'world', 'flash', 'video'];
    return '<div class="panel"><h2>חדשות שנאספו אוטומטית</h2>' +
      '<p class="hint">כאן רואים את מה שהאתר אסף. "הצמדה" מציגה כתבה בראש העמוד הראשי (עד 5). "הסתרה" מורידה כתבה מהאתר.</p>' +
      (c.pinned.length ? '<h3>מוצמדות לראש העמוד</h3><div class="list">' + c.pinned.map(function (i) {
        return '<div class="list-item compact"><div><div class="sub"><span>' + esc(srcName(i)) + '</span><span>' + fmt(i.d) + '</span></div><div class="t" dir="auto">' + esc(i.t) + '</div></div>' +
          '<div class="btns"><button class="btn sm" type="button" data-act="unpin" data-id="' + esc(i.id) + '">ביטול הצמדה</button></div></div>';
      }).join('') + '</div><div style="height:16px"></div>' : '') +
      '<div class="toolbar"><div class="field"><label for="auto-q">חיפוש</label><input type="search" id="auto-q" value="' + esc(st.autoQ) + '" placeholder="מילה מהכותרת או שם האתר"></div>' +
      '<div class="field"><label for="auto-cat">קטגוריה</label><select id="auto-cat">' + cats.map(function (k) {
        return '<option value="' + k + '"' + (k === st.autoCat ? ' selected' : '') + '>' + (k === 'all' ? 'הכל' : CAT_NAMES[k]) + '</option>';
      }).join('') + '</select></div></div>' +
      '<div class="list">' + (items.length ? items.map(function (i) {
        var link = S.safeUrl(i.u);
        return '<div class="list-item compact"><div><div class="sub"><span>' + esc(srcName(i)) + '</span><span>' + fmt(i.d) + '</span><span class="tag">' + (CAT_NAMES[i.c] || '') + '</span></div>' +
          '<div class="t" dir="auto">' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(i.t.slice(0, 220)) + '</a>' : esc(i.t.slice(0, 220))) + '</div></div>' +
          '<div class="btns">' + (i.c !== 'flash' && i.c !== 'video' ? (pinnedIds.has(i.id) ? '<span class="tag gold">מוצמדת</span>' : '<button class="btn sm" type="button" data-act="pin" data-id="' + esc(i.id) + '">הצמדה</button>') : '') +
          '<button class="btn sm danger" type="button" data-act="hide" data-id="' + esc(i.id) + '">הסתרה</button></div></div>';
      }).join('') : '<p class="empty-note">לא נמצאו כתבות.</p>') + '</div></div>' +
      (c.hidden.length ? '<div class="panel"><h3>כתבות מוסתרות (' + c.hidden.length + ')</h3><div class="list">' + c.hidden.slice(-30).reverse().map(function (id) {
        var i = byId[id];
        return '<div class="list-item compact"><div class="t" dir="auto">' + esc(i ? i.t : 'כתבה שכבר לא מופיעה ברשימה') + '</div>' +
          '<div class="btns"><button class="btn sm" type="button" data-act="unhide" data-id="' + esc(id) + '">החזרה לאתר</button></div></div>';
      }).join('') + '</div></div>' : '');
  }

  function viewSources() {
    var c = st.content;
    if (!st.news) return '<div class="panel"><p class="empty-note">טוען את רשימת המקורות…</p></div>';
    var srcs = st.news.sources || {};
    var status = st.news.status || {};
    var disabled = new Set(c.sources.disabled || []);
    var ids = Object.keys(srcs);
    (c.sources.extra || []).forEach(function (e) { if (ids.indexOf(e.id) < 0) ids.push(e.id); });
    var groups = ['community', 'chabad', 'israel', 'world', 'flash', 'video', 'kids'];
    var extraById = {};
    (c.sources.extra || []).forEach(function (e) { extraById[e.id] = e; });
    var rows = groups.map(function (g) {
      var list = ids.filter(function (id) { return ((srcs[id] && srcs[id].c) || (extraById[id] && extraById[id].cat) || '') === g || (g === 'video' && extraById[id] && extraById[id].type === 'youtube' && !srcs[id]); });
      if (!list.length) return '';
      return '<h3>' + CAT_NAMES[g] + '</h3><div class="list">' + list.map(function (id) {
        var s = srcs[id] || { n: extraById[id].name };
        var stt = status[id];
        var off = disabled.has(id);
        var tag = off ? '<span class="tag">כבוי</span>' : !stt ? '<span class="tag">ייאסף בעדכון הבא</span>' :
          stt.ok ? '<span class="tag ok">פעיל · ' + stt.n + ' פריטים</span>' : '<span class="tag err">לא זמין כרגע</span>';
        return '<div class="list-item compact"><div><div class="t">' + esc(s.n) + (extraById[id] ? ' <span class="tag gold">נוסף על ידכם</span>' : '') + '</div><div class="sub">' + tag + '</div></div>' +
          '<div class="btns"><button class="btn sm" type="button" data-act="src-toggle" data-id="' + esc(id) + '">' + (off ? 'הפעלה' : 'כיבוי') + '</button>' +
          (extraById[id] ? '<button class="btn sm danger" type="button" data-act="src-del" data-id="' + esc(id) + '">מחיקה</button>' : '') + '</div></div>';
      }).join('') + '</div>';
    }).join('<div style="height:14px"></div>');
    return '<div class="panel"><h2>הוספת מקור חדש</h2>' +
      '<p class="hint">אפשר להוסיף כל אתר שיש לו פיד RSS, כל ערוץ טלגרם ציבורי, וכל ערוץ יוטיוב. המקור החדש ייאסף בעדכון הבא (עד 15 דקות).</p>' +
      '<form data-form="source"><div class="row">' +
        '<div class="field"><label for="s-type">סוג</label><select id="s-type" name="type"><option value="telegram">ערוץ טלגרם</option><option value="rss">אתר (פיד RSS)</option><option value="youtube">ערוץ יוטיוב</option></select></div>' +
        '<div class="field"><label for="s-name">שם שיוצג באתר</label><input type="text" id="s-name" name="name" required maxlength="60" placeholder="למשל: ינון מגל"></div>' +
        '<div class="field"><label for="s-addr">כתובת</label><input type="text" id="s-addr" name="addr" required dir="ltr" placeholder="https://t.me/…"><small id="s-help">קישור לערוץ, למשל https://t.me/amitsegal</small></div>' +
        '<div class="field"><label for="s-cat">יופיע תחת</label><select id="s-cat" name="cat">' + catOptions('flash', ['flash', 'chabad', 'israel', 'world']) + '</select></div>' +
      '</div><div class="actions"><button class="btn primary" type="submit">הוספת המקור</button></div></form></div>' +
      '<div class="panel"><h2>כל המקורות</h2><p class="hint">מקור כבוי לא נאסף, והכתבות שלו יורדות מהאתר בעדכון הבא.</p>' + rows + '</div>';
  }

  function viewSettings() {
    var s = st.content.settings;
    var b = s.breaking || {};
    return '<div class="panel"><h2>הגדרות האתר</h2><form data-form="settings">' +
      '<div class="row">' +
        '<div class="field"><label for="g-name">שם האתר</label><input type="text" id="g-name" name="siteName" maxlength="60" value="' + esc(s.siteName || '') + '"></div>' +
        '<div class="field"><label for="g-tag">שורת תיאור</label><input type="text" id="g-tag" name="tagline" maxlength="120" value="' + esc(s.tagline || '') + '"></div>' +
      '</div>' +
      '<h3>פס "דחוף" בראש האתר</h3>' +
      '<label class="check"><input type="checkbox" name="bActive"' + (b.active ? ' checked' : '') + '> להציג פס אדום של הודעה דחופה</label>' +
      '<div class="row">' +
        '<div class="field"><label for="g-btext">טקסט ההודעה</label><input type="text" id="g-btext" name="bText" maxlength="200" value="' + esc(b.text || '') + '"></div>' +
        '<div class="field"><label for="g-blink">קישור <small>(לא חובה)</small></label><input type="url" id="g-blink" name="bLink" dir="ltr" value="' + esc(b.link || '') + '"></div>' +
      '</div>' +
      '<h3>ערוץ הוואטסאפ של האתר</h3>' +
      '<div class="field"><label for="g-wa">קישור לערוץ או לקבוצת וואטסאפ <small>(מופיע באתר ככפתור "הצטרפו לערוץ")</small></label><input type="url" id="g-wa" name="whatsappChannel" dir="ltr" placeholder="https://whatsapp.com/channel/…" value="' + esc(s.whatsappChannel || '') + '"></div>' +
      '<h3>תמונות ותוכן</h3>' +
      '<label class="check"><input type="checkbox" name="generalImages"' + (s.generalImages === true ? ' checked' : '') + '> להציג תמונות גם מאתרי החדשות הכלליים (ynet, וואלה, מעריב, טלגרם ועוד)</label>' +
      '<p class="hint">לא מומלץ: באתרים הכלליים עלולות להופיע תמונות של נשים. כשהאפשרות כבויה, מוצגות תמונות רק מאתרי חב״ד ומאתרים חרדיים.</p>' +
      '<h3>סינון עדכונים משעממים</h3><p class="hint">עדכונים בנושאים המסומנים לא ייכנסו לאתר (לא חל על אתרי חב״ד). השינוי נכנס בעדכון הבא.</p>' +
      Object.keys(FILTER_NAMES).map(function (k) {
        return '<label class="check" style="margin-inline-end:18px"><input type="checkbox" name="f-' + k + '"' + ((s.filters || {})[k] !== false ? ' checked' : '') + '> ' + FILTER_NAMES[k] + '</label>';
      }).join('') +
      '<div class="field"><label for="g-words">מילים חסומות</label><textarea id="g-words" name="blockedWords">' + esc((s.blockedWords || []).join(', ')) + '</textarea>' +
      '<small>כתבה או מבזק שמכילים אחת מהמילים האלה לא יוצגו באתר. מפרידים בפסיק.</small></div>' +
      '<div class="actions"><button class="btn primary" type="submit">שמירת ההגדרות</button></div></form></div>';
  }

  function viewStories() {
    var list = (st.content.stories || []).slice().sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    var today = new Date().toISOString().slice(0, 10);
    return '<div class="panel"><h2>סטורי חדש</h2>' +
      '<p class="hint">הסטוריז שלכם מופיעים ראשונים בעיגולים שבראש האתר, לפני הסטוריז האוטומטיים מהאתרים. מתאים לתמונה מאירוע, הודעה או פרסומת. מומלץ תמונה לאורך (כמו בטלפון).</p>' +
      '<form data-form="story">' +
      '<div class="field"><span class="label">תמונה</span><div class="img-pick"><img id="st-preview" alt="" hidden>' +
      '<input type="file" id="st-image" name="imagefile" accept="image/jpeg,image/png,image/webp,image/gif" required></div></div>' +
      '<div class="field"><label for="st-text">טקסט על התמונה</label><textarea id="st-text" name="text" maxlength="200"></textarea></div>' +
      '<div class="row">' +
        '<div class="field"><label for="st-link">קישור לפרטים <small>(לא חובה)</small></label><input type="url" id="st-link" name="link" dir="ltr" placeholder="https://…"></div>' +
        '<div class="field"><label for="st-until">להוריד בתאריך <small>(ברירת מחדל: אחרי יומיים)</small></label><input type="date" id="st-until" name="until"></div>' +
      '</div><div class="actions"><button class="btn primary" type="submit">פרסום הסטורי</button></div></form></div>' +
      '<div class="panel"><h3>הסטוריז שלכם</h3><div class="list">' +
      (list.length ? list.map(function (s) {
        var live = !s.until || s.until >= today;
        return '<div class="list-item"><img class="thumb-sm" src="' + esc(previewSrc(s.image)) + '" alt="">' +
          '<div><div class="t" dir="auto">' + esc(s.text || 'ללא טקסט') + '</div><div class="sub"><span>' + fmt(s.date) + '</span><span class="tag ' + (live ? 'ok' : '') + '">' + (live ? 'מוצג' : 'הסתיים') + '</span>' +
          (s.until ? '<span>עד ' + esc(s.until.split('-').reverse().join('.')) + '</span>' : '') + '</div></div>' +
          '<div class="btns"><button class="btn sm danger" type="button" data-act="story-del" data-id="' + esc(s.id) + '">מחיקה</button></div></div>';
      }).join('') : '<p class="empty-note">עוד אין סטוריז משלכם.</p>') + '</div></div>';
  }

  function viewKids() {
    var k = st.content.kids || { gallery: [] };
    var gal = (k.gallery || []).slice().sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    return '<div class="panel"><h2>איך ילדים שולחים יצירות</h2>' +
      '<p class="hint">ילדים לא מעלים ישירות לאתר (כדי לשמור עליהם). הם שולחים אליכם – בוואטסאפ או בטופס – ואתם מעלים כאן רק את מה שאישרתם. כתבו מספר וואטסאפ (למשל 0501234567) או קישור לטופס.</p>' +
      '<form data-form="kidslink"><div class="row"><div class="field"><label for="k-link">וואטסאפ או קישור לשליחת יצירות</label>' +
      '<input type="text" id="k-link" name="link" dir="ltr" value="' + esc(k.submitLink || '') + '" placeholder="0501234567 או https://…"></div></div>' +
      '<div class="actions"><button class="btn primary" type="submit">שמירה</button></div></form></div>' +
      '<div class="panel"><h2>הוספת יצירה לגלריה</h2>' +
      '<p class="hint">ציור, תמונה, סרטון מיוטיוב או רעיון מעניין שילד שלח. כתבו שם פרטי בלבד.</p>' +
      '<form data-form="gallery">' +
      '<div class="row">' +
        '<div class="field"><label for="g-title">כותרת</label><input type="text" id="g-title" name="title" required maxlength="80" placeholder="למשל: הציור של החנוכייה"></div>' +
        '<div class="field"><label for="g-name">שם פרטי של הילד/ה</label><input type="text" id="g-name" name="name" maxlength="20"></div>' +
        '<div class="field"><label for="g-age">גיל</label><input type="text" id="g-age" name="age" maxlength="3" inputmode="numeric"></div>' +
      '</div>' +
      '<div class="field"><span class="label">תמונה</span><div class="img-pick"><img id="g-preview" alt="" hidden><input type="file" id="g-image" name="imagefile" accept="image/jpeg,image/png,image/webp,image/gif"></div></div>' +
      '<div class="row"><div class="field"><label for="g-video">או קישור לסרטון ביוטיוב</label><input type="url" id="g-video" name="video" dir="ltr" placeholder="https://www.youtube.com/watch?v=…"></div></div>' +
      '<div class="field"><label for="g-text">כמה מילים <small>(לא חובה)</small></label><textarea id="g-text" name="text" maxlength="400"></textarea></div>' +
      '<div class="actions"><button class="btn primary" type="submit">הוספה לגלריה</button></div></form></div>' +
      '<div class="panel"><h3>הגלריה (' + gal.length + ')</h3><div class="list">' +
      (gal.length ? gal.map(function (g) {
        var thumb = g.image ? previewSrc(g.image) : (S.ytId(g.video) ? 'https://i.ytimg.com/vi/' + S.ytId(g.video) + '/mqdefault.jpg' : '');
        return '<div class="list-item">' + (thumb ? '<img class="thumb-sm" src="' + esc(thumb) + '" alt="">' : '<span class="noimg"></span>') +
          '<div><div class="t">' + esc(g.title) + '</div><div class="sub"><span>' + esc(g.name || '') + (g.age ? ', ' + esc(g.age) : '') + '</span><span>' + fmt(g.date) + '</span></div></div>' +
          '<div class="btns"><button class="btn sm danger" type="button" data-act="gal-del" data-id="' + esc(g.id) + '">מחיקה</button></div></div>';
      }).join('') : '<p class="empty-note">הגלריה ריקה.</p>') + '</div></div>';
  }

  function viewScores() {
    if (!st.scores) return '<div class="panel"><p class="empty-note">טוען את טבלת השיאים…</p></div>';
    var games = st.scores.games || {};
    var hidden = new Set(st.content.hiddenScores || []);
    var keys = Object.keys(games);
    return '<div class="panel"><h2>טבלת השיאים של איזור הילדים</h2>' +
      '<p class="hint">הטבלה מתעדכנת כל 15 דקות. שמות עם מילים חסומות לא נכנסים. אם מופיע שם לא מתאים – לחצו "הסתרה" והוא יירד בעדכון הבא.</p>' +
      (keys.length ? keys.map(function (g) {
        return '<h3>' + esc(GAME_NAMES[g] || g) + '</h3><div class="list">' + games[g].slice(0, 10).map(function (r, k) {
          var key = g + '|' + r.n + '|' + r.s;
          return '<div class="list-item compact"><div><div class="t">' + (k + 1) + '. ' + esc(r.n) + ' – ' + r.s + '</div><div class="sub"><span>' + fmt(r.t) + '</span></div></div>' +
            '<div class="btns">' + (hidden.has(key) ? '<span class="tag">יוסתר בעדכון הבא</span>' : '<button class="btn sm danger" type="button" data-act="score-hide" data-id="' + esc(key) + '">הסתרה</button>') + '</div></div>';
        }).join('') + '</div><div style="height:12px"></div>';
      }).join('') : '<p class="empty-note">עוד אין שיאים. ברגע שילדים ישחקו וישלחו שיא, הוא יופיע כאן.</p>') + '</div>';
  }

  var VIEWS = { posts: viewPosts, ads: viewAds, flashes: viewFlashes, stories: viewStories, auto: viewAuto, kids: viewKids, scores: viewScores, sources: viewSources, settings: viewSettings };

  function render() {
    if (!st.content) return;
    $$('#admin-nav button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.view === st.view ? 'page' : 'false'); });
    $('#view').innerHTML = VIEWS[st.view]();
    $('#admin-site').textContent = st.content.settings.siteName || 'חב״ד בזמן אמת';
    renderStrip();
    if (st.view === 'sources') updateSourceHelp();
  }

  function renderStrip() {
    var n = st.news;
    if (!n) { $('#status-strip').textContent = ''; return; }
    var ok = 0, bad = 0;
    Object.keys(n.status || {}).forEach(function (k) { if (n.status[k].ok) ok++; else bad++; });
    $('#status-strip').innerHTML = '<span>איסוף אחרון: <b>' + S.ago(Date.parse(n.updated)) + '</b></span><span><b>' + ok + '</b> מקורות פעילים</span>' +
      (bad ? '<span><b>' + bad + '</b> לא זמינים כרגע</span>' : '') + '<span><b>' + n.items.length + '</b> פריטים באתר</span>';
  }

  function updateSourceHelp() {
    var type = $('#s-type');
    if (!type) return;
    var help = {
      telegram: ['https://t.me/…', 'קישור לערוץ ציבורי, למשל https://t.me/amitsegal'],
      rss: ['https://…/feed', 'כתובת פיד ה-RSS של האתר (בהרבה אתרים: כתובת האתר + /feed)'],
      youtube: ['https://www.youtube.com/@…', 'קישור לערוץ, למשל https://www.youtube.com/@JEMedia'],
    }[type.value];
    $('#s-addr').placeholder = help[0];
    $('#s-help').textContent = help[1];
    $('#s-cat').closest('.field').hidden = type.value === 'youtube';
  }

  // ---------------------------------------------------------------- forms
  function val(form, name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
  function urlOk(u) { return !u || /^https?:\/\/\S+$/i.test(u); }

  function submitPost(form) {
    var title = val(form, 'title');
    if (!title) return toast('צריך לכתוב כותרת.', true);
    var video = val(form, 'video'), link = val(form, 'link');
    if (!urlOk(video) || !urlOk(link)) return toast('הקישורים צריכים להתחיל ב-https://', true);
    var file = form.elements.imagefile.files[0];
    var existing = st.editPost ? st.content.posts.filter(function (x) { return x.id === st.editPost; })[0] : null;
    var image = form.dataset.image || '';
    setBusy(true);
    toast(file ? 'מעלה את התמונה…' : 'שומר…');
    (file ? uploadImage(file) : Promise.resolve(image)).then(function (img) {
      var post = {
        id: existing ? existing.id : newId(), title: title, summary: val(form, 'summary'), body: form.elements.body.value.trim(),
        image: img, video: video, link: link, cat: val(form, 'cat') || 'chabad', pinned: form.elements.pinned.checked,
        date: existing ? existing.date : Date.now(),
      };
      if (existing) post.updated = Date.now();
      return commit((existing ? 'עריכת כתבה: ' : 'כתבה חדשה: ') + title, function (c) {
        var i = c.posts.map(function (x) { return x.id; }).indexOf(post.id);
        if (i >= 0) c.posts[i] = post; else c.posts.unshift(post);
      }).then(function (ok) { if (ok) { st.editPost = null; render(); } });
    }, function (e) { setBusy(false); toast(errMsg(e), true); });
  }

  function submitAd(form) {
    var name = val(form, 'name');
    var link = val(form, 'link');
    if (!urlOk(link)) return toast('הקישור צריך להתחיל ב-https://', true);
    var file = form.elements.imagefile.files[0];
    var existing = st.editAd ? st.content.ads.filter(function (x) { return x.id === st.editAd; })[0] : null;
    if (!file && !(existing && existing.image)) return toast('צריך לבחור תמונה למודעה.', true);
    setBusy(true);
    toast(file ? 'מעלה את המודעה…' : 'שומר…');
    (file ? uploadImage(file) : Promise.resolve(existing.image)).then(function (img) {
      var ad = { id: existing ? existing.id : newId(), name: name, image: img, link: link, placement: val(form, 'placement') || 'feed', active: form.elements.active.checked, until: val(form, 'until') };
      return commit((existing ? 'עריכת פרסומת: ' : 'פרסומת חדשה: ') + name, function (c) {
        var i = c.ads.map(function (x) { return x.id; }).indexOf(ad.id);
        if (i >= 0) c.ads[i] = ad; else c.ads.unshift(ad);
      }).then(function (ok) { if (ok) { st.editAd = null; render(); } });
    }, function (e) { setBusy(false); toast(errMsg(e), true); });
  }

  function submitFlash(form) {
    var text = form.elements.text.value.trim();
    var tweet = val(form, 'tweet'), link = val(form, 'link');
    if (!text && !tweet) return toast('כתבו טקסט למבזק או הדביקו קישור לציוץ.', true);
    if (tweet && !/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/\w+\/status\/\d+/i.test(tweet)) return toast('הקישור לציוץ צריך להיראות כך: https://x.com/שם/status/מספר', true);
    if (!urlOk(link)) return toast('הקישור צריך להתחיל ב-https://', true);
    var f = { id: newId(), text: text, tweet: tweet, link: link, date: Date.now() };
    commit('מבזק חדש', function (c) { c.flashes.unshift(f); c.flashes = c.flashes.slice(0, 100); });
  }

  function submitSource(form) {
    var type = val(form, 'type'), name = val(form, 'name'), addr = val(form, 'addr');
    if (!name || !addr) return toast('צריך שם וכתובת.', true);
    var e = { id: 'x-' + newId(), type: type, name: name, cat: type === 'youtube' ? 'video' : val(form, 'cat') };
    if (type === 'rss') {
      if (!/^https?:\/\//i.test(addr)) return toast('כתובת הפיד צריכה להתחיל ב-https://', true);
      e.url = addr;
    } else if (type === 'telegram') {
      var h = addr.replace(/^https?:\/\/(www\.)?t\.me\/(s\/)?/i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
      if (!/^[\w]{4,}$/.test(h)) return toast('לא הצלחנו לזהות את שם הערוץ. הדביקו קישור כמו https://t.me/amitsegal', true);
      e.handle = h;
    } else {
      if (!/(UC[\w-]{22})|@[\w.-]+/.test(addr)) return toast('הדביקו קישור לערוץ, למשל https://www.youtube.com/@JEMedia', true);
      e.url = addr;
    }
    commit('מקור חדש: ' + name, function (c) { c.sources.extra = (c.sources.extra || []).concat([e]); });
  }

  function submitSettings(form) {
    var words = form.elements.blockedWords.value.split(/[,\n]/).map(function (w) { return w.trim(); }).filter(Boolean);
    var bLink = val(form, 'bLink');
    if (!urlOk(bLink)) return toast('הקישור צריך להתחיל ב-https://', true);
    var wa = val(form, 'whatsappChannel');
    if (!urlOk(wa)) return toast('הקישור לוואטסאפ צריך להתחיל ב-https://', true);
    var filters = {};
    Object.keys(FILTER_NAMES).forEach(function (k) { filters[k] = form.elements['f-' + k].checked; });
    var next = {
      siteName: val(form, 'siteName') || 'חב״ד בזמן אמת', tagline: val(form, 'tagline'),
      breaking: { active: form.elements.bActive.checked, text: val(form, 'bText'), link: bLink },
      generalImages: form.elements.generalImages.checked, blockedWords: words, whatsappChannel: wa, filters: filters,
    };
    commit('עדכון הגדרות', function (c) { c.settings = Object.assign({}, c.settings, next); });
  }

  function submitStory(form) {
    var file = form.elements.imagefile.files[0];
    if (!file) return toast('צריך לבחור תמונה.', true);
    var link = val(form, 'link');
    if (!urlOk(link)) return toast('הקישור צריך להתחיל ב-https://', true);
    var until = val(form, 'until') || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    setBusy(true);
    toast('מעלה את התמונה…');
    uploadImage(file).then(function (img) {
      var s = { id: newId(), image: img, text: form.elements.text.value.trim(), link: link, until: until, date: Date.now() };
      return commit('סטורי חדש', function (c) { c.stories = [s].concat(c.stories || []).slice(0, 40); });
    }, function (e) { setBusy(false); toast(errMsg(e), true); });
  }

  function submitKidsLink(form) {
    var v = val(form, 'link');
    var digits = v.replace(/[\s()-]/g, '');
    var link = '';
    if (/^\+?\d{9,15}$/.test(digits)) link = 'https://wa.me/' + digits.replace(/^\+/, '').replace(/^0/, '972');
    else if (/^https?:\/\//i.test(v)) link = v;
    else if (v) return toast('כתבו מספר טלפון או קישור שמתחיל ב-https://', true);
    commit('קישור לשליחת יצירות', function (c) { c.kids = Object.assign({ gallery: [] }, c.kids || {}, { submitLink: link }); });
  }

  function submitGallery(form) {
    var title = val(form, 'title');
    var video = val(form, 'video');
    var file = form.elements.imagefile.files[0];
    if (!title) return toast('צריך כותרת.', true);
    if (!file && !S.ytId(video)) return toast('צריך תמונה או קישור לסרטון ביוטיוב.', true);
    setBusy(true);
    toast(file ? 'מעלה את התמונה…' : 'שומר…');
    (file ? uploadImage(file) : Promise.resolve('')).then(function (img) {
      var g = { id: newId(), title: title, name: val(form, 'name'), age: val(form, 'age'), image: img, video: video, text: form.elements.text.value.trim(), date: Date.now() };
      return commit('יצירה חדשה בגלריית הילדים', function (c) {
        c.kids = Object.assign({ submitLink: '', gallery: [] }, c.kids || {});
        c.kids.gallery = [g].concat(c.kids.gallery || []).slice(0, 200);
      });
    }, function (e) { setBusy(false); toast(errMsg(e), true); });
  }

  // ---------------------------------------------------------------- actions
  function act(btn) {
    var id = btn.dataset.id;
    var c = st.content;
    switch (btn.dataset.act) {
      case 'post-edit': st.editPost = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'post-cancel': st.editPost = null; render(); break;
      case 'post-noimg': {
        var form = btn.closest('form'); form.dataset.image = ''; $('#p-preview').hidden = true; btn.remove(); break;
      }
      case 'post-del':
        confirmBtn(btn, function () { commit('מחיקת כתבה', function (x) { x.posts = x.posts.filter(function (p) { return p.id !== id; }); }); });
        break;
      case 'ad-edit': st.editAd = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'ad-cancel': st.editAd = null; render(); break;
      case 'ad-toggle':
        commit('שינוי מצב פרסומת', function (x) { x.ads.forEach(function (a) { if (a.id === id) a.active = a.active === false; }); });
        break;
      case 'ad-del':
        confirmBtn(btn, function () { commit('מחיקת פרסומת', function (x) { x.ads = x.ads.filter(function (a) { return a.id !== id; }); }); });
        break;
      case 'story-del':
        confirmBtn(btn, function () { commit('מחיקת סטורי', function (x) { x.stories = (x.stories || []).filter(function (s) { return s.id !== id; }); }); });
        break;
      case 'gal-del':
        confirmBtn(btn, function () { commit('מחיקה מגלריית הילדים', function (x) { x.kids.gallery = ((x.kids || {}).gallery || []).filter(function (g) { return g.id !== id; }); }); });
        break;
      case 'score-hide':
        commit('הסתרת שם מטבלת השיאים', function (x) {
          x.hiddenScores = x.hiddenScores || [];
          if (x.hiddenScores.indexOf(id) < 0) x.hiddenScores.push(id);
          x.hiddenScores = x.hiddenScores.slice(-300);
        });
        break;
      case 'flash-del':
        confirmBtn(btn, function () { commit('מחיקת מבזק', function (x) { x.flashes = x.flashes.filter(function (f) { return f.id !== id; }); }); });
        break;
      case 'hide':
        commit('הסתרת כתבה', function (x) {
          if (x.hidden.indexOf(id) < 0) x.hidden.push(id);
          x.hidden = x.hidden.slice(-500);
          x.pinned = x.pinned.filter(function (p) { return p.id !== id; });
        });
        break;
      case 'unhide':
        commit('החזרת כתבה', function (x) { x.hidden = x.hidden.filter(function (h) { return h !== id; }); });
        break;
      case 'pin': {
        var item = st.news.items.filter(function (i) { return i.id === id; })[0];
        if (!item) return;
        if (c.pinned.length >= 5) return toast('אפשר להצמיד עד 5 כתבות. בטלו הצמדה של אחת קודם.', true);
        var copy = { id: item.id, t: item.t, u: item.u, s: item.s, c: item.c, d: item.d };
        ['x', 'i', 'p', 'ch'].forEach(function (k) { if (item[k]) copy[k] = item[k]; });
        commit('הצמדת כתבה', function (x) { x.pinned = [copy].concat(x.pinned.filter(function (p) { return p.id !== id; })).slice(0, 5); });
        break;
      }
      case 'unpin':
        commit('ביטול הצמדה', function (x) { x.pinned = x.pinned.filter(function (p) { return p.id !== id; }); });
        break;
      case 'src-toggle':
        commit('שינוי מקור', function (x) {
          var d = x.sources.disabled || [];
          x.sources.disabled = d.indexOf(id) >= 0 ? d.filter(function (k) { return k !== id; }) : d.concat([id]);
        });
        break;
      case 'src-del':
        confirmBtn(btn, function () {
          commit('מחיקת מקור', function (x) {
            x.sources.extra = (x.sources.extra || []).filter(function (e) { return e.id !== id; });
            x.sources.disabled = (x.sources.disabled || []).filter(function (k) { return k !== id; });
          });
        });
        break;
    }
  }

  // ---------------------------------------------------------------- boot
  function loadNews() {
    return S.getJSON('data/news.json').catch(function () {
      return fetch(previewSrc('data/news.json') + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); });
    }).then(function (n) { st.news = n; render(); }, function () { /* לא חובה */ });
  }
  function loadScores() {
    return S.getJSON('data/scores.json').then(function (s) { st.scores = s; }, function () { st.scores = { games: {} }; }).then(function () { if (st.view === 'scores') render(); });
  }

  function enter() {
    $('#login').hidden = true;
    $('#shell').hidden = false;
    $('#logout').hidden = false;
    var v = location.hash.slice(1);
    if (VIEWS[v]) st.view = v;
    render();
    loadNews();
    loadScores();
  }

  function showLogin(msg) {
    $('#shell').hidden = true;
    $('#logout').hidden = true;
    $('#login').hidden = false;
    $('#repo-name').textContent = C.repo;
    $('#owner-name').textContent = C.owner;
    var err = $('#login-error');
    err.hidden = !msg;
    err.textContent = msg || '';
  }

  function tryLogin(token, remember) {
    st.token = token;
    var btn = $('#login-btn');
    btn.disabled = true;
    btn.textContent = 'מתחבר…';
    return loadContent().then(function () {
      writeToken(token, remember);
      enter();
    }, function (e) {
      st.token = '';
      writeToken('', false);
      showLogin(errMsg(e));
    }).then(function () { btn.disabled = false; btn.textContent = 'כניסה'; });
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('#token').value.trim();
    if (!t) return;
    tryLogin(t, $('#remember').checked);
  });

  $('#logout').addEventListener('click', function () {
    writeToken('', false);
    st.token = ''; st.content = null;
    $('#token').value = '';
    showLogin('');
  });

  $('#admin-nav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (!b) return;
    st.view = b.dataset.view;
    st.editPost = null; st.editAd = null;
    try { history.replaceState(null, '', '#' + st.view); } catch (err) { /* */ }
    render();
  });

  var view = $('#view');
  view.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (st.busy) return;
    ({ post: submitPost, ad: submitAd, flash: submitFlash, source: submitSource, settings: submitSettings, story: submitStory, kidslink: submitKidsLink, gallery: submitGallery })[form.dataset.form](form);
  });
  view.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (b && !st.busy) act(b);
  });
  view.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'p-image' || t.id === 'a-image' || t.id === 'st-image' || t.id === 'g-image') {
      var prev = $({ 'p-image': '#p-preview', 'a-image': '#a-preview', 'st-image': '#st-preview', 'g-image': '#g-preview' }[t.id]);
      var f = t.files[0];
      if (f) { prev.src = URL.createObjectURL(f); prev.hidden = false; }
    }
    if (t.id === 's-type') updateSourceHelp();
    if (t.id === 'auto-cat') { st.autoCat = t.value; render(); }
  });
  var qt;
  view.addEventListener('input', function (e) {
    if (e.target.id !== 'auto-q') return;
    clearTimeout(qt);
    var v = e.target.value;
    qt = setTimeout(function () {
      st.autoQ = v;
      render();
      var inp = $('#auto-q');
      if (inp) { inp.focus(); inp.setSelectionRange(v.length, v.length); }
    }, 250);
  });

  var saved = readToken();
  if (saved) tryLogin(saved, !!(function () { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return ''; } })());
  else showLogin('');
})();
