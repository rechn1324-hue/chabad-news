#!/usr/bin/env node
// איסוף החדשות האוטומטי של האתר.
// רץ כל 15 דקות ב-GitHub Actions (‎.github/workflows/update.yml‎), אוסף כותרות מכל המקורות
// ושומר אותן ב-data/news.json. האתר קורא את הקובץ הזה ומציג אותו.
// הרצה ידנית במחשב: node scripts/fetch-news.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SOURCES } from './sources.mjs';

const ROOT = new URL('../', import.meta.url);
const NEWS_FILE = new URL('data/news.json', ROOT);
const CONTENT_FILE = new URL('data/content.json', ROOT);
const UA = 'ChabadNewsBot/1.0 (RSS aggregator)';
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const NOW = Date.now();

// כמה זמן, ובאיזו כמות, שומרים מכל קטגוריה
const KEEP = {
  chabad: { age: 7 * DAY, max: 220 },
  israel: { age: 3 * DAY, max: 240 },
  world: { age: 3 * DAY, max: 120 },
  flash: { age: 2 * DAY, max: 160 },
  video: { age: 45 * DAY, max: 60 },
};
const ENRICH_LIMIT = 30; // כמה כתבות בלי תמונה ננסה להשלים להן תמונה בכל ריצה
const CHABAD_RE = /חב["״׳']ד|ליובאוויטש|ליובאוויץ|\bchabad\b|\blubavitch/i;

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
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s); // HTML ששודר מקודד
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  if (/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/i.test(s)) s = decodeEntities(s);
  return s.replace(/[ \t ​‎‏]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
}
const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ').trim();

function clip(s, n) {
  s = String(s || '').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

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

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- XML helpers

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

function cleanImg(u) {
  if (!u) return '';
  u = u.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u)) return '';
  if (/(pixel|spacer|blank\.|1x1|feedburner|gravatar|\/emoji\/|wp-includes|\.svg(\?|$))/i.test(u)) return '';
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
  s = s.trim().replace(/\b(IST|IDT)\b/, (m) => TZ[m]);
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
    if (text.replace(/\s/g, '').length < 3) continue;
    out.push({ title: text, link: dateM[1], date: parseDate(dateM[2]), desc: '', image: '' });
  }
  return out.reverse(); // החדשים קודם
}

// ---------------------------------------------------------------- network

async function fetchText(url, { timeout = 20000, accept } = {}) {
  const res = await fetch(url, {
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
    const u = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=10&playlistId=UU${channelId.slice(2)}&key=${key}`;
    const data = JSON.parse(await fetchText(u, { accept: 'application/json' }));
    return (data.items || [])
      .map((x) => x.snippet)
      .filter((s) => s && s.resourceId && !/^(Private|Deleted) video$/.test(s.title))
      .map((s) => ({
        title: s.title,
        link: '',
        videoId: s.resourceId.videoId,
        date: parseDate(s.publishedAt),
        desc: s.description || '',
        image: ((s.thumbnails || {}).medium || (s.thumbnails || {}).default || {}).url || '',
      }));
  }
  return parseFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`));
}

async function collect(src) {
  if (src.type === 'telegram') return parseTelegram(await fetchText(`https://t.me/s/${encodeURIComponent(src.handle)}`, { accept: 'text/html' }));
  if (src.type === 'youtube') return youtubeEntries(src);
  return parseFeed(await fetchText(src.url));
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
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const normTitle = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function isBlocked(text, words) {
  const low = text.toLowerCase();
  return words.some((w) => {
    w = String(w || '').trim().toLowerCase();
    if (!w) return false;
    return /^[a-z0-9 ]+$/.test(w) ? new RegExp('\\b' + escRe(w) + '\\b').test(low) : low.includes(w);
  });
}

function toItem(src, r, directHosts) {
  let title = r.title || '';
  let url = r.link || '';
  if (src.type === 'youtube' && r.videoId) url = 'https://www.youtube.com/watch?v=' + r.videoId;
  if (!/^https?:\/\//i.test(url) || !title) return null;
  if (src.type === 'gnews') {
    if (r.publisher) title = title.replace(new RegExp('\\s+[-–]\\s+' + escRe(r.publisher) + '\\s*$'), '');
    // קידומות מיתוג שגוגל מצרף לכותרות של חלק מהאתרים
    title = title.replace(/^COL\s+מרכז התקשורת החב["״]די\s*[-–|:]\s*/, '').replace(/^חב["״]ד אינפו\s*[-–|:]\s*/, '');
    if (r.publisherUrl && directHosts.has(hostOf(r.publisherUrl))) return null; // יש לנו את המקור הזה ישירות
  }
  url = cleanUrl(url);
  const it = { id: idOf(url), t: src.type === 'telegram' ? clip(title, 600) : clip(title, 220), u: url, s: src.id, c: src.cat, d: r.date || 0 };
  if (src.type !== 'gnews' && src.type !== 'telegram') {
    const ex = excerpt(r.desc, title);
    if (ex) it.x = ex;
  }
  if (r.image) it.i = cleanImg(r.image);
  if (src.type === 'youtube') {
    it.v = r.videoId;
    if (!it.i) it.i = `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`;
  }
  if (r.publisher) it.p = r.publisher;
  if (src.cat !== 'chabad' && CHABAD_RE.test(it.t + ' ' + (it.x || ''))) it.ch = 1;
  if (!it.i) delete it.i;
  return it;
}

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
    out.cat = 'video';
  } else {
    out.type = 'rss';
    out.home = out.home || (() => { try { return new URL(e.url).origin; } catch { return ''; } })();
  }
  out.general = e.cat !== 'chabad';
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const content = await readJson(CONTENT_FILE, {});
  const settings = content.settings || {};
  const srcCfg = content.sources || {};
  const disabled = new Set(srcCfg.disabled || []);
  const blocked = settings.blockedWords || [];
  const extras = (srcCfg.extra || []).filter((e) => e && e.id && e.type && e.name).map(normalizeExtra);
  const everything = [...SOURCES, ...extras];
  const active = everything.filter((s) => !disabled.has(s.id));
  const activeIds = new Set(active.map((s) => s.id));
  const directHosts = new Set(
    active.filter((s) => s.type === 'rss').flatMap((s) => [s.url, s.home]).filter(Boolean).map(hostOf).filter(Boolean),
  );

  const prev = await readJson(NEWS_FILE, { items: [] });
  const prevById = new Map((prev.items || []).map((i) => [i.id, i]));

  // ישירים קודם, גוגל בסוף – כדי שכפילויות יילקחו מהמקור עצמו
  const ordered = [...active.filter((s) => s.type !== 'gnews'), ...active.filter((s) => s.type === 'gnews')];
  const results = await pool(ordered, 8, collect);

  const status = {};
  const fresh = new Map();
  const titles = new Set();
  ordered.forEach((src, k) => {
    const res = results[k];
    if (!res || res.error) {
      status[src.id] = { ok: 0, err: String((res && res.error && res.error.message) || 'error').slice(0, 80) };
      return;
    }
    let n = 0;
    for (const r of res) {
      const it = toItem(src, r, directHosts);
      if (!it || fresh.has(it.id)) continue;
      const tk = normTitle(it.t);
      if (tk.length >= 12 && titles.has(tk)) continue;
      if (tk.length >= 12) titles.add(tk);
      fresh.set(it.id, it);
      n++;
    }
    status[src.id] = { ok: 1, n };
  });

  // מיזוג עם מה שכבר נאסף בריצות הקודמות
  const merged = new Map();
  for (const it of fresh.values()) {
    const old = prevById.get(it.id);
    if (old) {
      if (!it.d) it.d = old.d;
      if (!it.i && old.i) it.i = old.i;
      if (old.nt) it.nt = 1;
    }
    merged.set(it.id, it);
  }
  for (const old of prevById.values()) {
    if (!merged.has(old.id) && activeIds.has(old.s)) merged.set(old.id, old);
  }

  let items = [...merged.values()].filter((it) => !isBlocked(it.t + ' ' + (it.x || ''), blocked));
  for (const it of items) {
    if (!it.d) it.d = NOW; // בלי תאריך – הזמן שבו ראינו אותו לראשונה
    if (it.d > NOW + 10 * MIN) it.d = NOW;
  }
  const byCat = {};
  for (const it of items.sort((a, b) => b.d - a.d)) {
    const rule = KEEP[it.c] || KEEP.israel;
    if (NOW - it.d > rule.age) continue;
    (byCat[it.c] ||= []).push(it);
  }
  items = Object.entries(byCat).flatMap(([c, list]) => list.slice(0, (KEEP[c] || KEEP.israel).max));

  // השלמת תמונה (og:image) לכתבות חדשות שהגיעו בלי תמונה
  const srcType = Object.fromEntries(everything.map((s) => [s.id, s.type]));
  const need = items
    .filter((it) => !it.i && !it.nt && srcType[it.s] === 'rss' && it.c !== 'flash')
    .sort((a, b) => (a.c === 'chabad' ? -1 : 0) - (b.c === 'chabad' ? -1 : 0) || b.d - a.d)
    .slice(0, ENRICH_LIMIT);
  await pool(need, 5, async (it) => {
    try {
      const html = (await fetchText(it.u, { timeout: 12000, accept: 'text/html' })).slice(0, 300000);
      const m =
        html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
      const img = m ? cleanImg(decodeEntities(m[1])) : '';
      if (img) it.i = img;
      else it.nt = 1;
    } catch {
      it.nt = 1;
    }
  });

  items.sort((a, b) => b.d - a.d);
  const sources = {};
  for (const s of everything) {
    sources[s.id] = { n: s.name, c: s.cat, t: s.type, h: s.home || (s.handle ? 'https://t.me/' + s.handle : '') || (s.channelId ? 'https://www.youtube.com/channel/' + s.channelId : ''), g: s.general ? 1 : 0 };
    if (s.showPublisher) sources[s.id].pp = 1;
    if (disabled.has(s.id)) sources[s.id].off = 1;
    if (s.extra) sources[s.id].x = 1;
  }

  await mkdir(new URL('data/', ROOT), { recursive: true });
  const head = JSON.stringify({ updated: new Date(NOW).toISOString(), sources, status });
  const body = items.map((i) => JSON.stringify(i)).join(',\n');
  await writeFile(NEWS_FILE, head.slice(0, -1) + ',"items":[\n' + body + '\n]}\n');

  const ok = Object.values(status).filter((s) => s.ok).length;
  console.log(`נאספו ${items.length} פריטים מ-${ok}/${ordered.length} מקורות`);
  for (const [id, s] of Object.entries(status)) console.log(`  ${s.ok ? '✓' : '✗'} ${id.padEnd(16)} ${s.ok ? s.n : s.err}`);
  const counts = {};
  for (const it of items) counts[it.c] = (counts[it.c] || 0) + 1;
  console.log('  לפי קטגוריה:', JSON.stringify(counts));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
