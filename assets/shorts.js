// שורטס: גלילה אנכית בין סרטונים במסך מלא. סרטון מתחיל כשמגיעים אליו ונעצר כשיוצאים ממנו.
(function () {
  'use strict';
  var S = window.Site, esc = S.esc;
  var params = new URLSearchParams(location.search);
  var kids = params.get('c') === 'kids';
  var startId = params.get('id') || '';
  var startV = params.get('v') || '';
  var HE = /[֐-׿]/;
  var BASE = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  var reel = document.getElementById('reel');
  var items = [];
  var sources = {};
  var active = -1;

  document.getElementById(kids ? 'mode-kids' : 'mode-all').setAttribute('aria-current', 'page');
  if (kids) { var b = document.getElementById('back'); b.href = 'kids/'; b.textContent = '→ איזור הילדים'; document.title = 'שורטס לילדים · חב״ד בזמן אמת'; }

  var ICON = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  function kind(i) { if (i.v) return 'yt'; if (i.m) return 'mp4'; if (i.tv) return 'tg'; return ''; }
  function srcName(i) { if (i.sname) return i.sname; var s = sources[i.s]; return s ? (s.pp && i.p ? i.p : s.n) : ''; }
  function shareUrl(i) {
    if (kids) return BASE + 'shorts.html?c=kids&id=' + encodeURIComponent(i.id);
    return BASE + 's/' + i.id + '.html';
  }
  function origin(i) {
    if (i.v) return 'https://www.youtube.com/watch?v=' + i.v;
    return S.safeUrl(i.u) || '';
  }
  function toast(m) { var t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2200); }

  function slideHTML(i, k) {
    var k2 = kind(i);
    var shape = k2 === 'tg' ? 'tg' : (i.sh || k2 === 'mp4') ? 'v' : 'h';
    var title = (i.t || '').split('\n')[0];
    return '<section class="slide" data-k="' + k + '" aria-label="' + esc(title) + '">' +
      '<div class="frame ' + shape + '">' + (i.i ? '<img class="thumb" src="' + esc(S.asset(i.i)) + '" alt="" loading="' + (k < 2 ? 'eager' : 'lazy') + '" referrerpolicy="no-referrer">' : '') +
      '<button class="bigplay" type="button" data-play="' + k + '" aria-label="ניגון"></button></div>' +
      '<div class="info"><div class="src"><b>' + esc(srcName(i)) + '</b> · ' + S.ago(i.d) + '</div><h2 dir="auto">' + esc(title) + '</h2></div>' +
      '<div class="side">' +
        '<button type="button" data-share="' + k + '"><span class="ic">' + ICON.share + '</span>שיתוף</button>' +
        '<a class="wa" href="https://wa.me/?text=' + encodeURIComponent(title + '\n' + shareUrl(i)) + '" target="_blank" rel="noopener"><span class="ic">' + ICON.wa + '</span>וואטסאפ</a>' +
        (origin(i) ? '<a href="' + esc(origin(i)) + '" target="_blank" rel="noopener"><span class="ic">' + ICON.out + '</span>' + (i.v ? 'יוטיוב' : 'למקור') + '</a>' : '') +
      '</div></section>';
  }

  function mount(k) {
    var i = items[k];
    var slide = reel.querySelector('.slide[data-k="' + k + '"]');
    if (!i || !slide || slide.classList.contains('playing')) return;
    var frame = slide.querySelector('.frame');
    var html = '';
    if (i.v) {
      html = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(i.v) + '?autoplay=1&mute=1&playsinline=1&loop=1&playlist=' + encodeURIComponent(i.v) +
        '&rel=0&modestbranding=1" title="' + esc(i.t) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    } else if (i.m) {
      html = '<video src="' + esc(i.m) + '"' + (i.i ? ' poster="' + esc(i.i) + '"' : '') + ' autoplay muted playsinline loop controls preload="metadata"></video>';
    } else if (i.tv) {
      html = '<iframe src="' + esc(S.safeUrl(i.u)) + '?embed=1&amp;mode=tme" title="' + esc(i.t) + '" allow="autoplay; encrypted-media; fullscreen"></iframe>';
    }
    if (!html) return;
    frame.insertAdjacentHTML('beforeend', html);
    var pb = frame.querySelector('.bigplay');
    if (pb) pb.hidden = true;
    slide.classList.add('playing');
  }
  function unmount(k) {
    var slide = reel.querySelector('.slide[data-k="' + k + '"]');
    if (!slide || !slide.classList.contains('playing')) return;
    slide.querySelectorAll('iframe, video').forEach(function (el) { el.remove(); });
    var pb = slide.querySelector('.bigplay');
    if (pb) pb.hidden = false;
    slide.classList.remove('playing');
  }

  function render() {
    if (!items.length) {
      reel.innerHTML = '<section class="slide"><div class="endslide"><h2>עוד אין סרטונים</h2><p>הסרטונים נאספים אוטומטית. נסו שוב בעוד כמה דקות.</p><a href="./">לאתר החדשות</a></div></section>';
      return;
    }
    reel.innerHTML = items.map(slideHTML).join('') +
      '<section class="slide"><div class="endslide"><h2>זהו, ראיתם הכל!</h2><p>סרטונים חדשים נכנסים כל 15 דקות.</p><a href="./">לאתר החדשות</a><a href="kids/">לאיזור הילדים</a></div></section>';
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var k = +e.target.dataset.k;
          if (isNaN(k)) return;
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            if (active !== k && active >= 0) unmount(active);
            active = k;
            mount(k);
          } else if (!e.isIntersecting || e.intersectionRatio < 0.2) {
            unmount(k);
          }
        });
      }, { root: reel, threshold: [0, 0.2, 0.6, 0.9] });
      reel.querySelectorAll('.slide[data-k]').forEach(function (s) { io.observe(s); });
    } else {
      mount(0);
    }
    var hint = document.getElementById('hint');
    hint.hidden = false;
    setTimeout(function () { hint.hidden = true; }, 4500);
  }

  function go(dir) {
    var h = reel.clientHeight;
    reel.scrollBy({ top: dir * h, behavior: 'smooth' });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-play],[data-share]');
    if (!t) return;
    if (t.dataset.play) { mount(+t.dataset.play); return; }
    var i = items[+t.dataset.share];
    if (!i) return;
    var title = (i.t || '').split('\n')[0];
    if (navigator.share) navigator.share({ title: title, text: title, url: shareUrl(i) }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(shareUrl(i)).then(function () { toast('הקישור הועתק'); }, function () {});
  });
  document.getElementById('up').addEventListener('click', function () { go(-1); });
  document.getElementById('down').addEventListener('click', function () { go(1); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') { e.preventDefault(); go(-1); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && active >= 0) unmount(active); else if (!document.hidden && active >= 0) mount(active); });

  var CHABAD_SRC = { chabadinfo: 1, 'ci-video': 1, 'yt-jem': 1, 'yt-livingtorah': 1 };
  var CHABAD_RE = /חב["״]ד|הרבי|ליובאוויטש|שלוח|770|Chabad|Rebbe|Lubavitch/i;
  function score(i) { return ((CHABAD_SRC[i.s] || CHABAD_RE.test(i.t)) ? 4 : 0) + (HE.test(i.t) ? 2 : 0) + (i.sh ? 1 : 0); }
  function order(list) {
    list.sort(function (a, b) { return score(b) - score(a) || b.d - a.d; });
    var k = list.findIndex(function (i) { return (startId && i.id === startId) || (startV && i.v === startV); });
    if (k > 0) list.unshift(list.splice(k, 1)[0]);
    return list;
  }

  var dataP = kids
    ? S.getJSON('data/kids.json').then(function (d) {
        return (d.items || []).filter(function (i) { return i.v; }).map(function (i) { return Object.assign({ sname: i.s }, i, { s: '' }); });
      })
    : Promise.all([S.getJSON('data/news.json'), S.getJSON('data/content.json').catch(function () { return {}; })]).then(function (r) {
        sources = r[0].sources || {};
        var c = S.normContent(r[1]);
        var hidden = new Set(c.hidden || []);
        return (r[0].items || []).filter(function (i) {
          return (i.c === 'video' || i.tv) && kind(i) && !hidden.has(i.id) && !S.isBlocked(i.t, c.settings.blockedWords || []);
        });
      });
  dataP.then(function (list) {
    items = order(list);
    if (startV && !items.some(function (i) { return i.v === startV; })) items.unshift({ id: 'yt-' + startV, v: startV, t: '', d: Date.now(), i: 'https://i.ytimg.com/vi/' + startV + '/hqdefault.jpg' });
    render();
  }, function () {
    reel.innerHTML = '<div class="loading">לא הצלחנו לטעון את הסרטונים. נסו לרענן.</div>';
  });
})();
