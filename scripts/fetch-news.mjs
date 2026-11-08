#!/usr/bin/env node
// איסוף החדשות האוטומטי של האתר.
// רץ כל 15 דקות ב-GitHub Actions (‎.github/workflows/update.yml‎) וכותב:
//   data/news.json      – כל הכותרות (חדשות, מבזקים, וידאו)
//   data/previews.json  – טקסט ארוך ותמונות נוספות לתצוגה המקדימה
//   data/kids.json      – סרטונים חדשים מערוצי הילדים
//   data/scores.json    – טבלת השיאים של משחקי הילדים
//   s/<id>.html         – עמודי שיתוף עם תמונה וכותרת (לא נשמרים במאגר, נבנים בכל פרסום)
// הרצה ידנית במחשב: node scripts/fetch-news.mjs

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SOURCES, BORING, SIMCHA_RE, AVEL_RE } from './sources.mjs';

const ROOT = new URL('../', import.meta.url);
const F = (p) => new URL(p, ROOT);
const UA = 'ChabadNewsBot/1.0 (RSS aggregator)';
// כתובת האתר (לעמודי השיתוף): נקבעת לפי המאגר ב-GitHub, גם אם הוא עובר לארגון או לשם אחר
const SITE_URL = (() => {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/?$/, '/');
  const [owner, name] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  if (owner && name) {
    return name.toLowerCase() === (owner + '.github.io').toLowerCase()
      ? `https://${name.toLowerCase()}/`
      : `https://${owner.toLowerCase()}.github.io/${name}/`;
  }
  return 'https://rechn1324-hue.github.io/chabad-news/';
})();
const SCORE_TOPIC = 'cnk-scores-7f3a9c2e';
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const NOW = Date.now();
const HE = /[֐-׿]/;

const KEEP = {
  chabad: { age: 7 * DAY, max: 240 },
  israel: { age: 3 * DAY, max: 220 },
  world: { age: 3 * DAY, max: 100 },
  flash: { age: 2 * DAY, max: 160 },
  video: { age: 120 * DAY, max: 90 },
  community: { age: 30 * DAY, max: 140 },
  kids: { age: 1095 * DAY, max: 48 },
};
const ENRICH_LIMIT = 90;
const CHABAD_RE = /חב["״׳']ד|ליובאוויטש|ליובאוויץ|\bchabad\b|\blubavitch/i;
const NAME_BAD = ['זונה', 'שרמוטה', 'מניאק', 'חרא', 'כוס', 'זין', 'מזדיין', 'fuck', 'shit', 'bitch', 'dick', 'porn', 'sex', 'nazi', 'נאצי'];

// ---------------------------------------------------------------- text helpers

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', bull: '•', middot: '·',
  shy: '', zwnj: '', zwj: '', lrm: '', rlm: '', copy: '©', reg: '®', trade: '™', deg: '°', times: '×', euro: '€',
};
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    const v = NAMED[e.toLowerCase()];
    return v !== undefined ? v : m;
  });
}
const cdata = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

function toText(raw) {
  let s = cdata(raw);
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|figcaption)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  if (/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/i.test(s)) s = decodeEntities(s);
  return s.replace(/[ \t ​‎‏]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
}
const oneLine = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').trim();

function clip(s, n) {
  s = String(s || '').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}
const JUNK_LINE = /The post .{0,300}? appeared first on|הופיע לראשונה ב|Continue reading|Read more|להמשך הכתבה|המשך לקרוא|^\[?(…|\.\.\.)\]?$/i;

function excerpt(desc, title) {
  if (!desc) return '';
  let s = oneLine(desc)
    .replace(/\s*The post .{0,300}? appeared first on .{0,160}$/i, '')
    .replace(/\s*הפוסט .{0,300}? הופיע לראשונה ב.{0,160}$/, '')
    .replace(/\s*(\[(…|\.\.\.)\]|Continue reading.*|Read more.*|להמשך הכתבה.*|המשך לקרוא.*)$/i, '')
    .trim();
  if (title && s.startsWith(title)) s = s.slice(title.length).replace(/^[\s:–—-]+/, '');
  return s.length < 25 ? '' : clip(s, 240);
}

// טקסט ארוך ותמונות מתוך ה-HTML של הכתבה (כשהאתר מפרסם אותו בפיד)
function previewFromHtml(html, mainImg) {
  if (!html) return { b: '', g: [] };
  let h = cdata(html);
  if (/&lt;(p|img|br)\b/i.test(h)) h = decodeEntities(h);
  const imgs = [...h.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => cleanImg(decodeEntities(m[1])))
    .filter((u) => u && u !== mainImg && !/(logo|avatar|icon|emoji|banner|ads?[/_-])/i.test(u));
  let paras = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => oneLine(toText(m[1]))).filter((p) => p.length > 25 && !JUNK_LINE.test(p));
  if (!paras.length) paras = toText(h).split(/\n+/).map(oneLine).filter((p) => p.length > 25 && !JUNK_LINE.test(p));
  const out = [];
  let len = 0;
  for (const p of paras) {
    if (len > 950) break;
    out.push(p.length > 700 ? clip(p, 700) : p);
    len += p.length;
  }
  return { b: clip(out.join('\n\n'), 1100), g: [...new Set(imgs)].slice(0, 6) };
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- XML / HTML helpers

function getTag(block, name) {
  const m = block.match(new RegExp('<' + escRe(name) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + escRe(name) + '>', 'i'));
  return m ? m[1] : '';
}
function tagsWithAttrs(block, name) {
  const out = [];
  for (const m of block.matchAll(new RegExp('<' + escRe(name) + '\\b([^>]*)>', 'gi'))) {
    const a = {};
    for (const am of m[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[am[1].toLowerCase()] = decodeEntities(am[2] ?? am[3] ?? '');
    out.push(a);
  }
  return out;
}
function metaContent(html, names) {
  for (const p of names) {
    const a = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + escRe(p) + '["\'][^>]*?content=(["\'])([\\s\\S]*?)\\1', 'i'));
    if (a && a[2].trim()) return decodeEntities(a[2]).trim();
    const b = html.match(new RegExp('<meta[^>]+content=(["\'])([\\s\\S]*?)\\1[^>]*?(?:property|name)=["\']' + escRe(p) + '["\']', 'i'));
    if (b && b[2].trim()) return decodeEntities(b[2]).trim();
  }
  return '';
}

function cleanImg(u) {
  if (!u) return '';
  u = String(u).trim();
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u)) return '';
  if (/(pixel|spacer|blank\.|1x1|feedburner|gravatar|\/emoji\/|wp-includes|\.svg(\?|$)|data:image)/i.test(u)) return '';
  return u.replace(/^http:\/\//i, 'https://');
}

function findImage(block) {
  const c = [];
  for (const a of tagsWithAttrs(block, 'media:thumbnail')) c.push(a.url);
  for (const a of tagsWithAttrs(block, 'media:content')) {
    if ((!a.medium || a.medium === 'image') && !/^(video|audio)/i.test(a.type || '')) c.push(a.url);
  }
  for (const a of tagsWithAttrs(block, 'enclosure')) {
    if (/^image\//i.test(a.type || '') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(a.url || '')) c.push(a.url);
  }
  const pic = toText(getTag(block, 'picture'));
  if (/^https?:\/\//.test(pic)) c.push(pic);
  const imgTag = getTag(block, 'image');
  const imgUrl = toText(getTag(imgTag, 'url') || imgTag);
  if (/^https?:\/\//.test(imgUrl)) c.push(imgUrl);
  let html = cdata(getTag(block, 'content:encoded') + ' ' + getTag(block, 'description'));
  if (/&lt;img/i.test(html)) html = decodeEntities(html);
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) c.push(decodeEntities(m[1]));
  for (const u of c) {
    const x = cleanImg(u);
    if (x) return x;
  }
  return '';
}

const TZ = { IST: '+0200', IDT: '+0300' };
function parseDate(s) {
  if (!s) return 0;
  s = String(s).trim().replace(/\b(IST|IDT)\b/, (m) => TZ[m]);
  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) t = new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
  }
  return Number.isNaN(t) ? 0 : t;
}

function parseFeed(xml) {
  const isAtom = !/<rss[\s>]|<rdf:RDF/i.test(xml) && /<feed[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    let link = '';
    if (isAtom) {
      const links = tagsWithAttrs(b, 'link');
      link = (links.find((l) => !l.rel || l.rel === 'alternate') || links[0] || {}).href || '';
    } else {
      link = toText(getTag(b, 'link'));
      if (!/^https?:/i.test(link)) {
        const g = toText(getTag(b, 'guid'));
        if (/^https?:/i.test(g)) link = g;
      }
    }
    const src = tagsWithAttrs(b, 'source')[0];
    return {
      title: oneLine(toText(getTag(b, 'title'))),
      link: link.trim(),
      date: parseDate(toText(getTag(b, 'pubDate') || getTag(b, 'published') || getTag(b, 'dc:date') || getTag(b, 'updated'))),
      desc: toText(getTag(b, 'description') || getTag(b, 'summary') || getTag(b, 'media:description')),
      html: getTag(b, 'content:encoded') || getTag(b, 'description'),
      image: findImage(b),
      videoId: toText(getTag(b, 'yt:videoId')),
      publisher: src ? oneLine(toText(getTag(b, 'source'))) : '',
      publisherUrl: src ? src.url || '' : '',
    };
  });
}

// ערוץ טלגרם ציבורי – מתוך עמוד התצוגה המקדימה הרשמי t.me/s/<ערוץ>
function parseTelegram(html) {
  const out = [];
  for (const part of html.split('data-post="').slice(1)) {
    const textM = part.match(/<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/);
    const dateM = part.match(/class="tgme_widget_message_date"[^>]*href="([^"]+)"[^>]*>\s*<time datetime="([^"]+)"/);
    if (!textM || !dateM) continue;
    const text = toText(textM[1].replace(/<i class="emoji"[^>]*><b>([^<]*)<\/b><\/i>/g, '$1'));
    const bg = (cls) => (part.match(new RegExp(cls + '[^>]*?background-image:url\\(\'([^\']+)\'\\)')) || [])[1] || '';
    const image = bg('tgme_widget_message_photo_wrap') || bg('tgme_widget_message_video_thumb') || bg('link_preview_image');
    const video = /tgme_widget_message_video_player|tgme_widget_message_video_wrap/.test(part);
    out.push({ title: text, link: dateM[1], date: parseDate(dateM[2]), desc: '', html: '', image, tgVideo: video });
  }
  return out.reverse();
}

// COL – הכתבות מעמוד הבית שלהם (כותרת + תמונה; הטקסט נאסף מעמוד הכתבה)
function parseCOL(html) {
  const map = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["'](https:\/\/col\.org\.il\/news\/(\d+))["'][^>]*>([\s\S]*?)<\/a>/g)) {
    const e = map.get(m[2]) || { link: m[1], alt: '', text: '', image: '', date: 0 };
    const inner = m[3].replace(/<(div|span)[^>]*class=["'][^"']*(branding|time|date|category|icon)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const img = inner.match(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/i);
    if (img) {
      if (!e.image) e.image = img[1];
      const alt = (img[0].match(/\balt=["']([^"']*)["']/i) || img[0].match(/\btitle=["']([^"']*)["']/i) || [])[1] || '';
      if (alt.length > e.alt.length) e.alt = alt;
      const ts = img[1].match(/_(1\d{9})_/);
      if (ts && !e.date) e.date = +ts[1] * 1000;
    }
    const text = oneLine(toText(inner));
    if (text.length > e.text.length && text.length < 220) e.text = text;
    map.set(m[2], e);
  }
  return [...map.values()]
    .map((e) => ({ title: oneLine(decodeEntities(e.alt || e.text)), link: e.link, date: e.date, desc: '', html: '', image: e.image }))
    .filter((e) => e.title.length > 8);
}

// אתר וורדפרס עם ממשק נתונים פתוח (wp-json)
function parseWP(text, src) {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) return [];
  if (src && src.videos) {
    // מדור הווידאו: כל כתבה עם סרטון (יוטיוב מוטמע או קובץ וידאו) הופכת לסרטון
    return arr.flatMap((p) => {
      const html = (p.content && p.content.rendered) || '';
      const title = oneLine(toText((p.title && p.title.rendered) || ''));
      const date = parseDate((p.date_gmt || '') + 'Z');
      const v = (html.match(/youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)([\w-]{11})/) || [])[1];
      if (v) return [{ title, link: '', videoId: v, short: /youtube\.com\/shorts\//.test(html), date, desc: '', html: '', image: '' }];
      const mp4 = (html.match(/<(?:source|video)[^>]+src=["'](https:\/\/[^"']+\.mp4)["']/i) || [])[1];
      if (!mp4) return [];
      const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
      const poster = (html.match(/<video[^>]+poster=["']([^"']+)["']/i) || [])[1] || (media && media.source_url) || '';
      return [{ title, link: p.link, mp4, date, desc: '', html: '', image: cleanImg(poster) }];
    });
  }
  return arr.map((p) => {
    const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    const sizes = (media && media.media_details && media.media_details.sizes) || {};
    const img = (sizes.large || sizes.medium_large || sizes.full || {}).source_url || (media && media.source_url) || '';
    return {
      title: oneLine(toText((p.title && p.title.rendered) || '')), link: p.link, date: parseDate((p.date_gmt || '') + 'Z'),
      desc: toText((p.excerpt && p.excerpt.rendered) || ''), html: '', image: cleanImg(img), wpId: p.id,
    };
  });
}

// ---------------------------------------------------------------- network

async function fetchText(url, { timeout = 20000, accept, method, body } = {}) {
  const res = await fetch(url, {
    method: method || 'GET',
    body,
    headers: { 'user-agent': UA, accept: accept || 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 500));
  const cs = (ct.match(/charset=["']?([\w-]+)/i) || head.match(/encoding=["']([\w-]+)["']/i) || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  try {
    return new TextDecoder(cs.toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const k = i++;
        try { out[k] = await fn(list[k]); } catch (e) { out[k] = { error: e }; }
      }
    }),
  );
  return out;
}

async function youtubeEntries(src) {
  let channelId = src.channelId || '';
  if (!channelId && src.handle) {
    const page = await fetchText(`https://www.youtube.com/@${encodeURIComponent(src.handle)}`, { accept: 'text/html' });
    channelId = (page.match(/"externalId":"(UC[\w-]{22})"/) || page.match(/"channelId":"(UC[\w-]{22})"/) || [])[1] || '';
    if (!channelId) throw new Error('channel not found');
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const u = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=UU${channelId.slice(2)}&key=${key}`;
    const data = JSON.parse(await fetchText(u, { accept: 'application/json' }));
    return (data.items || [])
      .map((x) => x.snippet)
      .filter((s) => s && s.resourceId && !/^(Private|Deleted) video$/.test(s.title))
      .map((s) => ({
        title: s.title, link: '', videoId: s.resourceId.videoId, date: parseDate(s.publishedAt), desc: s.description || '', html: '',
        image: ((s.thumbnails || {}).high || (s.thumbnails || {}).medium || {}).url || '',
      }));
  }
  return parseFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`));
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

// גיבוי: אתר שחוסם את שרתי GitHub נאסף דרך חדשות גוגל (רק הכתבות של אותו אתר)
function googleFallback(src) {
  const host = hostOf(src.home || src.url);
  if (!host || host === 'news.google.com') return '';
  const q = encodeURIComponent(`site:${host} when:2d`);
  return src.lang === 'en'
    ? `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${q}&hl=he&gl=IL&ceid=IL:he`;
}

async function collect(src) {
  if (src.type === 'telegram') return parseTelegram(await fetchText(`https://t.me/s/${encodeURIComponent(src.handle)}`, { accept: 'text/html' }));
  if (src.type === 'youtube') return youtubeEntries(src);
  try {
    if ((process.env.FORCE_FALLBACK || '').split(',').includes(src.id)) throw new Error('forced fallback');
    if (src.type === 'col') {
      const items = parseCOL(await fetchText(src.url, { accept: 'text/html' }));
      if (!items.length) throw new Error('no items');
      return items;
    }
    if (src.type === 'wpjson') return parseWP(await fetchText(src.url, { accept: 'application/json', timeout: 30000 }), src);
    return parseFeed(await fetchText(src.url));
  } catch (err) {
    const fb = ['rss', 'col', 'wpjson'].includes(src.type) && !src.noFallback ? googleFallback(src) : '';
    if (!fb) throw err;
    const items = parseFeed(await fetchText(fb));
    items.viaGoogle = String(err.message || err).slice(0, 60);
    return items;
  }
}

// ---------------------------------------------------------------- items

function cleanUrl(u) {
  try {
    const x = new URL(u.trim());
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|ref_|mc_|_ga$|igshid$|smid$|cmpid$|oc$)/i.test(k)) x.searchParams.delete(k);
    }
    return x.toString();
  } catch {
    return u.trim();
  }
}
const keyOf = (u) => cleanUrl(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
const idOf = (u) => createHash('sha1').update(keyOf(u)).digest('base64url').slice(0, 11);

function isBlocked(text, words) {
  const low = String(text || '').toLowerCase();
  return words.some((w) => {
    w = String(w || '').trim().toLowerCase();
    if (!w) return false;
    return /^[a-z0-9 ]+$/.test(w) ? new RegExp('\\b' + escRe(w) + '\\b').test(low) : low.includes(w);
  });
}

function telegramJunk(text) {
  const letters = text.replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}]/gu, '');
  if (letters.length < 28) return true;
  if (/^\s*(צילום|צלם|קרדיט|photo|credit)\s*[:：]/i.test(text)) return true;
  if (/^\s*(לצפייה|לכתבה|לקריאה|לשידור)/.test(text) && letters.length < 70) return true;
  return false;
}

function toItem(src, r, ctx) {
  let title = r.title || '';
  let url = r.link || '';
  const isShort = /\/shorts\//.test(url);
  if (r.videoId) url = 'https://www.youtube.com/watch?v=' + r.videoId;
  if (!/^https?:\/\//i.test(url) || !title) return null;
  const google = src.type === 'gnews' || ctx.viaGoogle;
  if (google) {
    if (r.publisher) title = title.replace(new RegExp('\\s+[-–]\\s+' + escRe(r.publisher) + '\\s*$'), '');
    title = title.replace(/^COL\s+מרכז התקשורת החב["״]די\s*[-–|:]\s*/, '').replace(/^חב["״]ד אינפו\s*[-–|:]\s*/, '');
    if (!ctx.viaGoogle && r.publisherUrl && ctx.directHosts.has(hostOf(r.publisherUrl))) return null;
    if (/^(daily|monthly|yearly)?\s*archives?\b|^(category|tag|page \d+)\b|^ארכיון/i.test(title)) return null;
  }
  if (src.type === 'telegram' && telegramJunk(title)) return null;
  if (src.titleOnly === 'simcha' && !SIMCHA_RE.test(title)) return null;
  url = cleanUrl(url);
  let cat = r.cat || src.cat;
  let sub = src.sub || '';
  // כתבות מאתרי חב"ד על שמחות / ברוך דיין האמת עוברות למדור הקהילה
  if (cat === 'chabad' && !google) {
    if (SIMCHA_RE.test(title)) { cat = 'community'; sub = 'simcha'; }
    else if (AVEL_RE.test(title)) { cat = 'community'; sub = 'avel'; }
  }
  const it = { id: idOf(url), t: src.type === 'telegram' ? clip(title, 700) : clip(title, 220), u: url, s: src.id, c: cat, d: r.date || 0 };
  if (sub) it.b = sub;
  if (r.mp4) it.m = cleanImg(r.mp4);
  if (!google && src.type !== 'telegram') {
    const ex = excerpt(r.desc, title);
    if (ex) it.x = ex;
  }
  if (r.image) it.i = cleanImg(r.image);
  if (r.videoId) {
    it.v = r.videoId;
    if (!it.i) it.i = `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`;
    if (isShort || r.short) it.sh = 1;
  }
  if (r.tgVideo) it.tv = 1;
  if (google && r.publisher) it.p = r.publisher;
  if (google && r.publisherUrl) it.pd = hostOf(r.publisherUrl);
  if (cat !== 'chabad' && CHABAD_RE.test(it.t + ' ' + (it.x || ''))) it.ch = 1;
  if (!it.i) delete it.i;
  // נתונים זמניים לתצוגה המקדימה (לא נשמרים ב-news.json)
  if (r.html && !google) it._html = r.html;
  if (r.desc && !google) it._desc = r.desc;
  if (r.wpId) it._wp = r.wpId;
  return it;
}

// ---------------------------------------------------------------- duplicates

const STOP = new Set(('של את על עם זה זו זאת לא כי גם אחרי לפני היום אך או אם הוא היא הם הן יש אין כל עוד בין מה מי איך למה כך כבר רק אבל כמו ' +
  'לאחר נגד תוך אל עד אחד אחת שני שתי בו בה להם לו לה הזה הזאת צפו תיעוד מיוחד בלעדי the a an of to in on for and or is are was were be by with ' +
  'from at as that this it its after over new says said will has have').split(' '));
function tokens(t) {
  return new Set(
    String(t).toLowerCase().replace(/["'״׳`’‘“”]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean)
      .map((w) => (/^[והבלמשכ][א-ת]{3,}$/.test(w) ? w.slice(1) : w))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}
function similar(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  if (!inter) return 0;
  const jac = inter / (a.size + b.size - inter);
  const small = Math.min(a.size, b.size);
  const cont = small >= 4 ? (inter / small) * 0.85 : 0;
  return Math.max(jac, cont);
}
// מאחד כתבות שמספרות את אותו סיפור (גם מאתרים שונים) ומשאיר את הטובה ביותר
function dedupe(items, typeOf) {
  const quality = (it) => (it.i ? 4 : 0) + (it.c === 'chabad' ? 2 : 0) + (HE.test(it.t) ? 1 : 0) + Math.min(2, (it.x || '').length / 120) + (typeOf(it.s) === 'gnews' ? -3 : 0) + (it.own ? 10 : 0);
  const sorted = items.slice().sort((a, b) => quality(b) - quality(a) || b.d - a.d);
  const kept = [];
  for (const it of sorted) {
    if (it.c === 'video' || it.c === 'kids') { kept.push(it); continue; }
    const tk = tokens(it.t.slice(0, 200));
    const group = it.c === 'flash' ? 'f' : it.c === 'community' ? 'c' : 's';
    let dup = null;
    for (const k of kept) {
      if (k._g !== group || Math.abs(k.d - it.d) > 36 * HOUR) continue;
      if (similar(k._tk, tk) >= 0.5) { dup = k; break; }
    }
    if (dup) {
      dup.k = (dup.k || 0) + 1;
      if (it.s !== dup.s) dup.al = [...new Set([...(dup.al || []), it.s])].slice(0, 4);
      continue;
    }
    it._tk = tk;
    it._g = group;
    kept.push(it);
  }
  return kept;
}

// ---------------------------------------------------------------- misc

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, 'utf8')); } catch { return fallback; }
}

function normalizeExtra(e) {
  const out = { ...e, extra: true };
  if (e.type === 'telegram') {
    out.handle = String(e.handle || e.url || '').trim().replace(/^https?:\/\/(www\.)?t\.me\/(s\/)?/i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
    out.home = 'https://t.me/' + out.handle;
    out.cat = e.cat || 'flash';
  } else if (e.type === 'youtube') {
    const v = String(e.channelId || e.url || e.handle || '').trim();
    const id = (v.match(/(UC[\w-]{22})/) || [])[1];
    const handle = (v.match(/@([\w.-]+)/) || [])[1];
    out.channelId = id || '';
    out.handle = id ? '' : handle || v.replace(/^https?:\/\/(www\.)?youtube\.com\//i, '');
    out.cat = e.cat === 'kids' ? 'kids' : 'video';
  } else {
    out.type = 'rss';
    out.home = out.home || (() => { try { return new URL(e.url).origin; } catch { return ''; } })();
  }
  out.general = e.cat !== 'chabad';
  return out;
}

const escHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function writeSharePages(items, posts, siteName) {
  const dir = F('s/');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const abs = (u) => (!u ? '' : /^https?:/i.test(u) ? u : SITE_URL + u.replace(/^\.?\//, ''));
  const page = (title, desc, img, target) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)} · ${escHtml(siteName)}</title>
<meta property="og:title" content="${escHtml(title)}"><meta property="og:description" content="${escHtml(desc)}">
${img ? `<meta property="og:image" content="${escHtml(img)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta property="og:type" content="article"><meta property="og:site_name" content="${escHtml(siteName)}"><meta property="og:locale" content="he_IL">
<meta http-equiv="refresh" content="0;url=${escHtml(target)}"><script>location.replace(${JSON.stringify(target)})</script></head>
<body><p><a href="${escHtml(target)}">${escHtml(title)}</a></p></body></html>\n`;
  const jobs = [];
  for (const it of items) {
    const target = it.c === 'video' && it.v ? `../shorts.html?v=${encodeURIComponent(it.v)}` : `../#a-${it.id}`;
    const desc = clip(it.x || (it.c === 'flash' ? it.t : '') || `${siteName} – חדשות חב״ד, ישראל והעולם`, 200);
    jobs.push(writeFile(new URL(it.id + '.html', dir), page(clip(oneLine(it.t), 140), desc, abs(it.i), target)));
  }
  for (const p of posts || []) {
    if (!p || !p.id || !p.title) continue;
    jobs.push(writeFile(new URL('p-' + encodeURIComponent(p.id) + '.html', dir), page(p.title, clip(p.summary || p.body || '', 200), abs(p.image), `../post.html#${encodeURIComponent(p.id)}`)));
  }
  await Promise.all(jobs);
  return jobs.length;
}

async function updateScores(content) {
  const prev = await readJson(F('data/scores.json'), { games: {} });
  const games = prev.games || {};
  const hidden = new Set(content.hiddenScores || []);
  const bad = [...NAME_BAD, ...((content.settings || {}).blockedWords || [])];
  let text = '';
  try {
    text = await fetchText(`https://ntfy.sh/${SCORE_TOPIC}/json?poll=1&since=24h`, { accept: 'application/x-ndjson', timeout: 15000 });
  } catch {
    text = '';
  }
  let added = 0;
  for (const line of text.split('\n')) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.event !== 'message' || !ev.message) continue;
    let m;
    try { m = JSON.parse(ev.message); } catch { continue; }
    const g = String(m.g || '');
    if (!/^[a-z0-9-]{2,24}$/.test(g)) continue;
    const s = Math.floor(Number(m.s));
    if (!Number.isFinite(s) || s <= 0 || s > 1e7) continue;
    const n = String(m.n || '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
    if (!n || isBlocked(n, bad)) continue;
    const t = Math.min(Number(m.t) || ev.time * 1000, NOW);
    (games[g] ||= []).push({ n, s, t });
    added++;
  }
  const names = Object.keys(games).slice(0, 40);
  const out = {};
  for (const g of names) {
    const seen = new Set();
    out[g] = games[g]
      .filter((x) => {
        const k = x.n + '|' + x.s + '|' + x.t;
        if (seen.has(k) || hidden.has(g + '|' + x.n + '|' + x.s)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.s - a.s || a.t - b.t)
      .slice(0, 20);
  }
  await writeFile(F('data/scores.json'), JSON.stringify({ updated: new Date(NOW).toISOString(), games: out }) + '\n');
  return added;
}

// ---------------------------------------------------------------- main

async function main() {
  const content = await readJson(F('data/content.json'), {});
  const settings = content.settings || {};
  const filters = Object.assign({ women: true, weather: true, sports: true, gossip: true, lifestyle: true, markets: true, promo: true }, settings.filters || {});
  const srcCfg = content.sources || {};
  const disabled = new Set(srcCfg.disabled || []);
  const blocked = settings.blockedWords || [];
  const extras = (srcCfg.extra || []).filter((e) => e && e.id && e.type && e.name).map(normalizeExtra);
  const everything = [...SOURCES, ...extras];
  const active = everything.filter((s) => !disabled.has(s.id));
  const activeIds = new Set(active.map((s) => s.id));
  const srcById = Object.fromEntries(everything.map((s) => [s.id, s]));
  const typeOf = (id) => (srcById[id] || {}).type || '';
  const directHosts = new Set(
    active.filter((s) => ['rss', 'col', 'wpjson'].includes(s.type)).flatMap((s) => [s.url, s.home]).filter(Boolean).map(hostOf).filter(Boolean),
  );

  const prev = await readJson(F('data/news.json'), { items: [] });
  const prevKids = await readJson(F('data/kids.json'), { items: [] });
  const prevPreviews = await readJson(F('data/previews.json'), {});
  const prevById = new Map([...(prev.items || []), ...(prevKids.items || []).map((k) => ({ ...k, c: 'kids', u: k.u || 'https://www.youtube.com/watch?v=' + k.v }))].map((i) => [i.id, i]));

  const ordered = [...active.filter((s) => s.type !== 'gnews'), ...active.filter((s) => s.type === 'gnews')];
  const results = await pool(ordered, 8, collect);

  const status = {};
  const fresh = new Map();
  ordered.forEach((src, k) => {
    const res = results[k];
    if (!res || res.error) {
      status[src.id] = { ok: 0, err: String((res && res.error && res.error.message) || 'error').slice(0, 80) };
      return;
    }
    let n = 0;
    for (const r of res) {
      const it = toItem(src, r, { directHosts, viaGoogle: !!res.viaGoogle });
      if (!it || fresh.has(it.id)) continue;
      fresh.set(it.id, it);
      n++;
    }
    status[src.id] = res.viaGoogle ? { ok: 1, n, via: 'google', why: res.viaGoogle } : { ok: 1, n };
  });

  // מיזוג עם מה שנאסף בריצות הקודמות
  const merged = new Map();
  for (const it of fresh.values()) {
    const old = prevById.get(it.id);
    if (old) {
      if (!it.d) it.d = old.d;
      if (!it.i && old.i) it.i = old.i;
      if (!it.x && old.x) it.x = old.x;
      if (old.nt) it.nt = 1;
    }
    merged.set(it.id, it);
  }
  for (const old of prevById.values()) {
    if (!merged.has(old.id) && activeIds.has(old.s)) {
      const o = { ...old };
      delete o.k; delete o.al;
      merged.set(o.id, o);
    }
  }

  // סינון: מילים חסומות, נושאים משעממים, ישן מדי
  const boring = Object.entries(BORING).filter(([k]) => filters[k]);
  let items = [...merged.values()].filter((it) => {
    const text = it.t + ' ' + (it.x || '');
    if (isBlocked(text, blocked)) return false;
    const trusted = ['chabad', 'community', 'kids'].includes(it.c) && typeOf(it.s) !== 'gnews';
    for (const [k, re] of boring) {
      if (k === 'promo' || !trusted) {
        if (it.c === 'video' || it.c === 'kids') { if (k === 'promo' && re.test(text)) return false; continue; }
        if (re.test(it.t)) return false;
      }
    }
    return true;
  });
  for (const it of items) {
    if (!it.d) it.d = NOW;
    if (it.d > NOW + 10 * MIN) it.d = NOW;
  }
  items = dedupe(items, typeOf);

  const byCat = {};
  for (const it of items.sort((a, b) => b.d - a.d)) {
    const rule = KEEP[it.c] || KEEP.israel;
    if (NOW - it.d > rule.age) continue;
    (byCat[it.c] ||= []).push(it);
  }
  items = Object.entries(byCat).flatMap(([c, list]) => list.slice(0, (KEEP[c] || KEEP.israel).max));

  // תצוגה מקדימה: טקסט ארוך ותמונות נוספות
  const previews = {};
  for (const it of items) {
    const old = prevPreviews[it.id];
    if (old) previews[it.id] = old;
    if (it._html) {
      const p = previewFromHtml(it._html, it.i);
      if (p.b.length > ((old && old.b) || '').length) previews[it.id] = { b: p.b, g: p.g.length ? p.g : (old && old.g) || [] };
    } else if (it._desc && !old) {
      const b = clip(toText(it._desc).replace(/\n{2,}/g, '\n\n'), 1100);
      if (b.length > (it.x || '').length + 20) previews[it.id] = { b, g: [] };
    }
  }

  // חב"ד אינפו: טקסט, תמונות וסרטונים מתוך הכתבות החדשות
  const wpNew = items.filter((it) => it._wp && !previews[it.id]).slice(0, 12);
  const derivedVideos = [];
  if (wpNew.length) {
    const bySrc = {};
    for (const it of wpNew) (bySrc[it.s] ||= []).push(it);
    for (const [sid, list] of Object.entries(bySrc)) {
      const base = (srcById[sid].url || '').split('?')[0];
      try {
        const posts = JSON.parse(await fetchText(`${base}?include=${list.map((x) => x._wp).join(',')}&per_page=${list.length}&_fields=id,content`, { accept: 'application/json', timeout: 30000 }));
        for (const p of posts) {
          const it = list.find((x) => x._wp === p.id);
          const html = (p.content && p.content.rendered) || '';
          if (!it || !html) continue;
          const pv = previewFromHtml(html, it.i);
          if (pv.b) previews[it.id] = pv;
          if (!it.i && pv.g[0]) it.i = pv.g[0];
          const vids = [...new Set([...html.matchAll(/youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)([\w-]{11})/g)].map((m) => m[1]))].slice(0, 2);
          for (const v of vids) {
            const vu = 'https://www.youtube.com/watch?v=' + v;
            derivedVideos.push({ id: idOf(vu), t: it.t, u: vu, s: it.s, c: 'video', d: it.d, v, i: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` });
          }
        }
      } catch (e) {
        console.log('  (תוכן חב"ד אינפו לא זמין: ' + e.message + ')');
      }
    }
  }
  const have = new Set(items.map((i) => i.id));
  for (const dv of derivedVideos) if (!have.has(dv.id)) { items.push(dv); have.add(dv.id); }

  // השלמת תמונה ותקציר מעמוד הכתבה (og:image / og:description)
  const need = items
    .filter((it) => !it.nt && ['rss', 'col', 'wpjson'].includes(typeOf(it.s)) && it.c !== 'video' && (!it.i || (typeOf(it.s) === 'col' && !previews[it.id])))
    .sort((a, b) => (a.c === 'chabad' ? 0 : 1) - (b.c === 'chabad' ? 0 : 1) || b.d - a.d)
    .slice(0, ENRICH_LIMIT);
  await pool(need, 6, async (it) => {
    try {
      const html = (await fetchText(it.u, { timeout: 12000, accept: 'text/html' })).slice(0, 400000);
      const img = cleanImg(metaContent(html, ['og:image', 'twitter:image', 'twitter:image:src']));
      const desc = metaContent(html, ['og:description', 'twitter:description', 'description']);
      if (img && !it.i) it.i = img;
      if (desc && desc.length > 40) {
        if (!it.x) it.x = clip(oneLine(desc), 240);
        const cur = previews[it.id];
        if (!cur || (cur.b || '').length < desc.length) previews[it.id] = { b: clip(desc, 1100), g: (cur && cur.g) || [] };
      }
      it.nt = 1;
    } catch {
      it.nt = 1;
    }
  });

  // כתיבת הקבצים
  const strip = (it) => {
    const o = {};
    for (const [k, v] of Object.entries(it)) if (k[0] !== '_') o[k] = v;
    return o;
  };
  const kidsItems = items.filter((i) => i.c === 'kids').sort((a, b) => b.d - a.d).map((i) => {
    const o = { id: i.id, t: i.t, i: i.i, d: i.d, s: (srcById[i.s] || {}).name || '' };
    if (i.v) o.v = i.v; else o.u = i.u;
    if (i.x) o.x = i.x;
    if (i.sh) o.sh = 1;
    return o;
  });
  items = items.filter((i) => i.c !== 'kids').sort((a, b) => b.d - a.d).map(strip);

  const sources = {};
  for (const s of everything) {
    sources[s.id] = { n: s.name, c: s.cat, t: s.type, h: s.home || (s.handle ? 'https://t.me/' + s.handle : '') || (s.channelId ? 'https://www.youtube.com/channel/' + s.channelId : ''), g: s.general ? 1 : 0, l: s.lang || 'he' };
    if (s.showPublisher) sources[s.id].pp = 1;
    if (disabled.has(s.id)) sources[s.id].off = 1;
    if (s.extra) sources[s.id].x = 1;
  }

  await mkdir(F('data/'), { recursive: true });
  const head = JSON.stringify({ updated: new Date(NOW).toISOString(), sources, status });
  await writeFile(F('data/news.json'), head.slice(0, -1) + ',"items":[\n' + items.map((i) => JSON.stringify(i)).join(',\n') + '\n]}\n');
  const pv = {};
  for (const it of items) if (previews[it.id]) pv[it.id] = previews[it.id];
  await writeFile(F('data/previews.json'), '{\n' + Object.entries(pv).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}\n');
  await writeFile(F('data/kids.json'), JSON.stringify({ updated: new Date(NOW).toISOString(), items: kidsItems.slice(0, 40) }) + '\n');
  const scores = await updateScores(content);
  const shared = await writeSharePages(items, content.posts, settings.siteName || 'חב״ד בזמן אמת');

  const ok = Object.values(status).filter((s) => s.ok).length;
  console.log(`נאספו ${items.length} פריטים מ-${ok}/${ordered.length} מקורות · ${Object.keys(pv).length} תצוגות מקדימות · ${kidsItems.length} סרטוני ילדים · ${scores} שיאים חדשים · ${shared} עמודי שיתוף`);
  for (const [id, s] of Object.entries(status)) console.log(`  ${s.ok ? '✓' : '✗'} ${id.padEnd(16)} ${s.ok ? s.n + (s.via ? ' (דרך גוגל)' : '') : s.err}`);
  const counts = {};
  const imgs = {};
  for (const it of items) { counts[it.c] = (counts[it.c] || 0) + 1; if (it.i) imgs[it.c] = (imgs[it.c] || 0) + 1; }
  console.log('  לפי קטגוריה:', JSON.stringify(counts), '· עם תמונה:', JSON.stringify(imgs));
  const dups = items.reduce((n, i) => n + (i.k || 0), 0);
  console.log(`  כפילויות שאוחדו: ${dups}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
