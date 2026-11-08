// דף הבית של איזור הילדים: ספירה לאחור לחג, מצווה יומית, שוברי השיאים, סרטונים מערוצי הילדים, היצירות שלכם ועובדות
(function () {
  'use strict';
  var S = window.Site, Bd = window.Board;
  var $ = function (id) { return document.getElementById(id); };
  var esc = S.esc;

  // ---- חגים ותאריכים מיוחדים (לפי הלוח העברי)
  var DAYS = [
    { m: ['Tishri'], d: 1, n: 'ראש השנה' },
    { m: ['Tishri'], d: 10, n: 'יום כיפור' },
    { m: ['Tishri'], d: 15, n: 'סוכות' },
    { m: ['Tishri'], d: 22, n: 'שמחת תורה' },
    { m: ['Kislev'], d: 19, n: 'י״ט כסלו – ראש השנה לחסידות' },
    { m: ['Kislev'], d: 25, n: 'חנוכה' },
    { m: ['Shevat'], d: 10, n: 'י׳ שבט' },
    { m: ['Shevat'], d: 15, n: 'ט״ו בשבט' },
    { m: ['Adar', 'Adar II'], d: 14, n: 'פורים' },
    { m: ['Nisan'], d: 11, n: 'י״א ניסן – יום ההולדת של הרבי' },
    { m: ['Nisan'], d: 15, n: 'פסח' },
    { m: ['Iyar'], d: 18, n: 'ל״ג בעומר' },
    { m: ['Sivan'], d: 6, n: 'שבועות' },
    { m: ['Tamuz'], d: 12, n: 'י״ב תמוז – חג הגאולה' },
  ];

  function nextDay() {
    var fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long' });
    var base = new Date();
    base.setHours(12, 0, 0, 0);
    for (var k = 0; k < 400; k++) {
      var d = new Date(base.getTime() + k * 86400000);
      var parts = {};
      fmt.formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
      var day = parseInt(parts.day, 10);
      for (var i = 0; i < DAYS.length; i++) {
        if (DAYS[i].d === day && DAYS[i].m.indexOf(parts.month) >= 0) return { k: k, n: DAYS[i].n };
      }
    }
    return null;
  }

  var MITZVOT = [
    'לומר "מודה אני" מיד כשמתעוררים בבוקר.',
    'לשים מטבע בקופת הצדקה לפני התפילה.',
    'לברך לפני שאוכלים ושותים – ולהגיד ברכה בקול.',
    'לעזור לאבא ולאמא בלי שיבקשו.',
    'להגיד מילה טובה לחבר או לאח.',
    'לנשק את המזוזה כשנכנסים הביתה.',
    'לומר "שמע ישראל" לפני השינה.',
    'ללמוד בעל פה פסוק אחד מ-12 הפסוקים.',
    'לסדר את החדר ולשמור על הספרים הקדושים.',
    'לשתף חבר במשחק או בממתק.',
    'לבקש סליחה ממי שנפגע מאיתנו.',
    'להכין משהו יפה לכבוד שבת.',
    'לברך "שהכל" בשמחה לפני שתייה.',
    'לעזור לסבא או לסבתא.',
    'לתת צדקה גם מדמי הכיס שלנו.',
    'לומר תודה – לה׳ ולאנשים שעוזרים לנו.',
    'לקרוא פרק תהילים.',
    'להגיד "בוקר טוב" בחיוך לכל המשפחה.',
    'לשמור על הניקיון בבית הכנסת ובגן.',
    'לקום לכבוד אדם מבוגר.',
  ];

  var FACTS = [
    'חב״ד הן ראשי התיבות של חכמה, בינה ודעת.',
    'הבניין המפורסם של חב״ד בניו יורק נמצא בכתובת 770 איסטרן פארקווי בברוקלין.',
    'טנקי המבצעים הראשונים יצאו לרחובות ניו יורק בשנת תשל״ד (1974).',
    'בספר תורה יש 304,805 אותיות, והסופר כותב כל אחת ביד.',
    'בתורה יש 613 מצוות: 248 מצוות עשה ו-365 מצוות לא תעשה.',
    'ארגון "צבאות ה׳" לילדים נוסד על ידי הרבי בשנת תש״מ (1980).',
    'ספר התניא נדפס לראשונה בשנת תקנ״ז (1796) בעיר סלאוויטא.',
    'בי״ט כסלו יצא אדמו״ר הזקן לחופשי מהכלא בפטרבורג, ולכן הוא נקרא "ראש השנה לחסידות".',
    'שלוחי חב״ד פועלים ביותר מ-100 מדינות בעולם.',
    'כפר חב״ד הוקם בשנת תש״ט (1949).',
    'ה"חת״ת" הוא שיעור יומי: חומש, תהילים ותניא.',
    'בכל שנה מתכנסים אלפי שלוחים בניו יורק ל"כינוס השלוחים", ומצטלמים יחד מול 770.',
    'הרבי נולד בי״א ניסן תרס״ב (1902) בעיר ניקולאייב.',
    'במבצע חנוכה של הרבי מדליקים חנוכיות ענק ברחובות ובכיכרות בכל העולם.',
    'המילה "ליובאוויטש" באה מהמילה הרוסית לאהבה, ולכן קוראים לה "עיר האהבה".',
    'בחנוכייה של הרבי הקנים ישרים ואלכסוניים, לפי ציור של הרמב״ם.',
    'הרבי ביקש שבחדר של כל ילד יהיו קופת צדקה, סידור וחומש – כך החדר הופך ל"מקדש מעט".',
  ];

  // ---- היום
  $('heb-today').textContent = 'היום: ' + S.hebDate() + ' · ' + S.gregDate();
  var nd = nextDay();
  if (nd) {
    var num = $('count-num'), txt = $('count-text');
    if (nd.k === 0) { num.textContent = '🎉'; txt.innerHTML = '<b>' + esc(nd.n) + '</b>היום!'; }
    else if (nd.k === 1) { num.textContent = '1'; txt.innerHTML = 'עוד יום אחד עד<b>' + esc(nd.n) + '</b>מחר!'; }
    else { num.textContent = nd.k; txt.innerHTML = 'ימים נשארו עד<b>' + esc(nd.n) + '</b>'; }
  }
  var dayIndex = Math.floor(Date.now() / 86400000);
  $('mitzvah').textContent = MITZVOT[dayIndex % MITZVOT.length];

  var fi = Math.floor(Math.random() * FACTS.length);
  function showFact() { $('fact').textContent = FACTS[fi % FACTS.length]; fi++; }
  showFact();
  $('next-fact').addEventListener('click', showFact);

  // ---- שיתוף בוואטסאפ
  var pageUrl = location.href.split('#')[0];
  $('share-hub').href = 'https://wa.me/?text=' + encodeURIComponent('איזור הילדים: טנק המבצעים בתלת־ממד, חידונים, סרטונים ותחרות שיאים לכל הילדים! בואו לשחק 👉 ' + pageUrl);

  // ---- השיא האישי על כרטיסי המשחקים
  Array.prototype.forEach.call(document.querySelectorAll('[data-best]'), function (el) {
    var b = Bd.best(el.getAttribute('data-best'));
    if (b > 0) { el.textContent = '🏅 השיא שלכם: ' + b.toLocaleString('en-US'); el.hidden = false; }
  });

  // ---- 🏆 שוברי השיאים – מקום ראשון בכל משחק
  Promise.all(Bd.GAMES.map(function (g) {
    return Bd.load(g.id).then(function (list) { return { g: g, top: list[0], updated: list.updated }; });
  })).then(function (rows) {
    $('rec-grid').innerHTML = rows.map(function (r) {
      var g = r.g;
      var top = r.top
        ? '<span class="rtop">🥇 ' + esc(r.top.n) + ' – <strong>' + r.top.s.toLocaleString('en-US') + '</strong> ' + esc(g.unit) + '</span>'
        : '<span class="rtop">עוד אין שיא – תהיו הראשונים!</span>';
      return '<a class="rec" href="' + esc(g.page) + '"><span class="ri" aria-hidden="true">' + g.icon + '</span><span><b>' + esc(g.name) + '</b>' + top +
        '<span class="rgo">לשבור את השיא ←</span></span></a>';
    }).join('');
    var upd = rows.length && rows[0].updated;
    if (upd) $('rec-note').textContent = 'הטבלה של כל הילדים עודכנה ' + Bd.ago(upd) + ' ומתעדכנת בערך כל 15 דקות.';
  });

  // ---- חלון צפייה (סרטונים ותמונות)
  var lb = $('lightbox'), lbBody = $('lbx-body'), lbCap = $('lbx-cap'), lbBack = null;
  function capHTML(title, sub, text) {
    return (title ? '<b>' + esc(title) + '</b>' : '') + (sub ? '<span>' + esc(sub) + '</span>' : '') + (text ? '<p>' + esc(text) + '</p>' : '');
  }
  function openBox(html, cap) {
    lbBack = document.activeElement;
    lbBody.innerHTML = html;
    lbCap.innerHTML = cap || '';
    lb.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    $('lbx-close').focus();
  }
  function openVideo(id, vertical, title, cap) {
    if (!/^[\w-]{11}$/.test(id)) return;
    openBox('<div class="lbx-video' + (vertical ? ' vertical' : '') + '"><iframe src="https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="' + esc(title || 'סרטון') + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>', cap);
  }
  function closeBox() {
    if (lb.hidden) return;
    lb.hidden = true;
    lbBody.innerHTML = ''; // עוצר את הסרטון
    lbCap.innerHTML = '';
    document.documentElement.style.overflow = '';
    if (lbBack && lbBack.focus) { try { lbBack.focus({ preventScroll: true }); } catch (e) { lbBack.focus(); } }
  }
  $('lbx-close').addEventListener('click', closeBox);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeBox(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBox(); });

  function hideBroken(root) {
    Array.prototype.forEach.call(root.querySelectorAll('img'), function (img) {
      img.addEventListener('error', function () { img.style.visibility = 'hidden'; }, { once: true });
    });
  }
  function timeOf(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    var t = Date.parse(v || '');
    return isFinite(t) ? t : 0;
  }
  // "לפני 3 שעות" ליום האחרון, ואחר כך רק תאריך (בלי שעה)
  function when(v) {
    var t = timeOf(v);
    if (!t) return '';
    if (Date.now() - t < 86400000) return S.ago(t);
    var d = new Date(t), now = new Date();
    return d.getDate() + '.' + (d.getMonth() + 1) + (d.getFullYear() !== now.getFullYear() ? '.' + String(d.getFullYear()).slice(2) : '');
  }
  function more(btn, row, list, grid, render, n) {
    var open = false;
    row.hidden = list.length <= n;
    btn.addEventListener('click', function () {
      open = !open;
      grid.innerHTML = list.slice(0, open ? list.length : n).map(render).join('');
      hideBroken(grid);
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? btn.getAttribute('data-less') : btn.getAttribute('data-more');
      if (!open) grid.scrollIntoView({ block: 'start' });
    });
  }

  // ---- סרטונים חדשים מערוצי הילדים (data/kids.json – הרובוט מעדכן כל ~15 דקות; אם אין קובץ – מסתירים)
  var SHOW = 8, vids = [], arts = [];
  function vidCard(it, i) {
    var sub = [it.s ? String(it.s) : '', when(it.d)].filter(Boolean).join(' · ');
    return '<button class="vcard" type="button" data-vid="' + i + '"><span class="vthumb"><img src="https://i.ytimg.com/vi/' + it.v + '/hqdefault.jpg" alt="" loading="lazy">' +
      '<span class="vplay"></span>' + (it.sh ? '<span class="vbadge">שורט</span>' : '') + '</span>' +
      '<span class="vmeta"><b>' + esc(it.t || 'סרטון') + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span></button>';
  }
  function artCard(it) {
    var sub = [it.s ? String(it.s) : '', when(it.d)].filter(Boolean).join(' · ');
    var img = /^https:\/\//i.test(String(it.i || '')) ? String(it.i) : '';
    return '<a class="vcard" href="' + esc(it.u) + '" target="_blank" rel="noopener"><span class="vthumb">' +
      (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '</span>' +
      '<span class="vmeta"><b>' + esc(it.t || 'כתבה') + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span></a>';
  }
  S.getJSON('../data/kids.json').then(function (j) {
    var items = j && Array.isArray(j.items) ? j.items : [];
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      if (/^[\w-]{11}$/.test(String(it.v || ''))) vids.push(it);
      else if (/^https:\/\//i.test(String(it.u || ''))) arts.push(it);
    });
    var byNew = function (a, b) { return timeOf(b.d) - timeOf(a.d); };
    vids.sort(byNew); arts.sort(byNew);
    if (!vids.length && !arts.length) return;
    $('videos').hidden = false;
    if (vids.length) {
      $('vgrid').innerHTML = vids.slice(0, SHOW).map(vidCard).join('');
      hideBroken($('vgrid'));
      var mv = $('more-videos');
      mv.setAttribute('data-more', 'עוד סרטונים'); mv.setAttribute('data-less', 'פחות סרטונים');
      more(mv, $('more-videos-row'), vids, $('vgrid'), vidCard, SHOW);
    } else {
      $('vids-wrap').hidden = true;
      $('videos-title').textContent = 'חדש מערוצי הילדים 📺';
    }
    if (arts.length) {
      $('arts-wrap').hidden = false;
      if (!vids.length) $('arts-title').hidden = true;
      $('agrid').innerHTML = arts.slice(0, 4).map(artCard).join('');
      hideBroken($('agrid'));
      var ma = $('more-arts');
      ma.setAttribute('data-more', 'עוד כתבות'); ma.setAttribute('data-less', 'פחות כתבות');
      more(ma, $('more-arts-row'), arts, $('agrid'), artCard, 4);
    }
  }, function () { /* אין עדיין קובץ – המדור נשאר מוסתר */ });
  $('vgrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-vid]');
    if (!b) return;
    var it = vids[+b.getAttribute('data-vid')];
    if (it) openVideo(it.v, !!it.sh, it.t, capHTML(it.t, it.s, ''));
  });

  // ---- היצירות שלכם (content.json ← kids.gallery, אחרי אישור בעמוד הניהול). כל הטקסט מגיע מבחוץ – עובר esc.
  var gallery = [];
  function byline(it) {
    var name = it.name ? String(it.name) : '', age = it.age != null && it.age !== '' ? String(it.age) : '';
    return [name, age ? 'גיל ' + age : ''].filter(Boolean).join(' · ');
  }
  function gCard(it, i) {
    var yt = S.ytId(it.video), img = S.asset(it.image, '../'), by = byline(it), title = String(it.title || '');
    var meta = '<span class="vmeta"><b>' + esc(title || 'יצירה') + '</b>' + (by ? '<span>' + esc(by) + '</span>' : '') + '</span>';
    if (yt) return '<button class="gcard" type="button" data-g="' + i + '"><span class="gthumb"><img src="https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg" alt="" loading="lazy"><span class="vplay"></span></span>' + meta + '</button>';
    if (img) return '<button class="gcard" type="button" data-g="' + i + '"><span class="gthumb"><img src="' + esc(img) + '" alt="' + esc(title) + '" loading="lazy"></span>' + meta + '</button>';
    if (it.text) return '<button class="gcard text" type="button" data-g="' + i + '"><span class="gthumb"><p>' + esc(it.text) + '</p></span>' + meta + '</button>';
    return '';
  }
  function renderGallery(c) {
    var k = c && c.kids && typeof c.kids === 'object' ? c.kids : {};
    var link = String(k.submitLink || '').trim();
    if (/^https:\/\/[^\s"'<>]+$/i.test(link)) { $('submit-btn').href = link; $('submit-btn').hidden = false; $('submit-soon').hidden = true; }
    else { $('submit-btn').hidden = true; $('submit-soon').hidden = false; }
    var list = Array.isArray(k.gallery) ? k.gallery.filter(function (it) { return it && typeof it === 'object'; }) : [];
    list = list.map(function (it, i) { return { it: it, i: i, t: timeOf(it.date) }; })
      .sort(function (a, b) { return (b.t - a.t) || (b.i - a.i); })
      .map(function (x) { return x.it; });
    gallery = list;
    var html = list.map(gCard).join('');
    $('ggrid').innerHTML = html || '<div class="gempty">עוד אין יצירות – תהיו הראשונים! 🎨</div>';
    hideBroken($('ggrid'));
  }
  $('ggrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-g]');
    if (!b) return;
    var it = gallery[+b.getAttribute('data-g')];
    if (!it) return;
    var cap = capHTML(it.title, byline(it), it.text);
    var yt = S.ytId(it.video);
    if (yt) { openVideo(yt, /\/shorts\//.test(String(it.video)), it.title, cap); return; }
    var img = S.asset(it.image, '../');
    if (img) openBox('<img class="lbx-img" src="' + esc(img) + '" alt="' + esc(it.title || 'יצירה') + '">', cap);
    else openBox('', cap);
  });

  // ---- content.json: היצירות + פרסומות לאיזור הילדים (אם הוגדרו בניהול)
  S.getJSON('../data/content.json').then(function (c) {
    c = S.normContent(c);
    renderGallery(c);
    var ads = S.activeAds(c, 'kids');
    $('kids-ads').innerHTML = ads.map(function (a) { return S.adHTML(a, '../'); }).join('');
  }, function () { renderGallery({}); });
})();
