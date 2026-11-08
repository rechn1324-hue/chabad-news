// רשימת המקורות הקבועים של האתר.
// אפשר לכבות כל מקור, או להוסיף מקורות חדשים (אתר / טלגרם / יוטיוב), מתוך עמוד הניהול – admin.html.
//
// type:    rss | gnews | telegram | youtube
// cat:     chabad | israel | world | flash | video
// general: true = אתר חדשות כללי. התמונות שלו מוצגות רק אם הופעלה האפשרות בהגדרות האתר.

const gnews = (q, lang = 'he') =>
  lang === 'he'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=he&gl=IL&ceid=IL:he`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

export const SOURCES = [
  // ---------- חב"ד ----------
  { id: 'collive', name: 'COLlive', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://collive.com/feed/', home: 'https://collive.com' },
  { id: 'anash', name: 'Anash.org', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://anash.org/feed/', home: 'https://anash.org' },
  { id: 'crownheights', name: 'CrownHeights.info', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://crownheights.info/feed/', home: 'https://crownheights.info' },
  { id: 'chabadorg', name: 'Chabad.org', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://www.chabad.org/tools/rss/news_rss.xml', home: 'https://www.chabad.org/news' },
  // COL וחב"ד אינפו לא מפרסמים פיד RSS תקין, ולכן הם נאספים דרך חדשות גוגל – רק הכתבות של האתר עצמו
  { id: 'col', name: 'COL', type: 'gnews', cat: 'chabad', lang: 'he', url: gnews('site:col.org.il when:3d'), home: 'https://col.org.il' },
  { id: 'chabadinfo', name: 'חב״ד אינפו', type: 'gnews', cat: 'chabad', lang: 'he', url: gnews('site:chabad.info when:3d'), home: 'https://chabad.info' },
  // חיפוש כללי בגוגל: כל כתבה שעוסקת בחב"ד, מכל אתר (מוצג עם שם האתר המקורי)
  { id: 'gn-chabad', name: 'חדשות חב״ד בגוגל', type: 'gnews', cat: 'chabad', lang: 'he', showPublisher: true, url: gnews('חב"ד OR ליובאוויטש when:3d'), home: 'https://news.google.com' },
  { id: 'gn-chabad-en', name: 'Chabad · Google News', type: 'gnews', cat: 'chabad', lang: 'en', showPublisher: true, url: gnews('Chabad OR Lubavitch when:3d', 'en'), home: 'https://news.google.com' },

  // ---------- ישראל ופוליטיקה ----------
  { id: 'ynet', name: 'ynet', type: 'rss', cat: 'israel', lang: 'he', general: true, url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', home: 'https://www.ynet.co.il' },
  { id: 'n12', name: 'N12', type: 'rss', cat: 'israel', lang: 'he', general: true, url: 'https://rcs.mako.co.il/rss/news-israel.xml', home: 'https://www.mako.co.il' },
  { id: 'walla', name: 'וואלה', type: 'rss', cat: 'israel', lang: 'he', general: true, url: 'https://rss.walla.co.il/feed/1', home: 'https://news.walla.co.il' },
  { id: 'maariv', name: 'מעריב', type: 'rss', cat: 'israel', lang: 'he', general: true, url: 'https://www.maariv.co.il/Rss/RssChadashot', home: 'https://www.maariv.co.il' },
  { id: 'israelhayom', name: 'ישראל היום', type: 'rss', cat: 'israel', lang: 'he', general: true, url: 'https://www.israelhayom.co.il/rss.xml', home: 'https://www.israelhayom.co.il' },
  { id: 'c14', name: 'ערוץ 14', type: 'rss', cat: 'israel', lang: 'he', general: true, url: 'https://www.c14.co.il/feed/', home: 'https://www.c14.co.il' },
  { id: 'inn', name: 'ערוץ 7', type: 'rss', cat: 'israel', lang: 'he', general: true, url: 'https://www.inn.co.il/Rss.aspx', home: 'https://www.inn.co.il' },
  { id: 'bhol', name: 'בחדרי חרדים', type: 'rss', cat: 'israel', lang: 'he', url: 'https://www.bhol.co.il/rss', home: 'https://www.bhol.co.il' },
  { id: 'jdn', name: 'JDN', type: 'rss', cat: 'israel', lang: 'he', url: 'https://www.jdn.co.il/feed/', home: 'https://www.jdn.co.il' },
  { id: 'gn-israel', name: 'גוגל חדשות', type: 'gnews', cat: 'israel', lang: 'he', showPublisher: true, url: 'https://news.google.com/rss?hl=he&gl=IL&ceid=IL:he', home: 'https://news.google.com' },

  // ---------- עולם (באנגלית) ----------
  { id: 'toi', name: 'Times of Israel', type: 'rss', cat: 'world', lang: 'en', general: true, url: 'https://www.timesofisrael.com/feed/', home: 'https://www.timesofisrael.com' },
  { id: 'jpost', name: 'Jerusalem Post', type: 'rss', cat: 'world', lang: 'en', general: true, url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', home: 'https://www.jpost.com' },
  { id: 'ynetnews', name: 'Ynetnews', type: 'rss', cat: 'world', lang: 'en', general: true, url: 'https://www.ynetnews.com/Integration/StoryRss3082.xml', home: 'https://www.ynetnews.com' },
  { id: 'ina', name: 'Israel National News', type: 'rss', cat: 'world', lang: 'en', general: true, url: 'https://www.israelnationalnews.com/Rss.aspx', home: 'https://www.israelnationalnews.com' },
  { id: 'yeshivaworld', name: 'Yeshiva World News', type: 'rss', cat: 'world', lang: 'en', url: 'https://www.theyeshivaworld.com/feed', home: 'https://www.theyeshivaworld.com' },

  // ---------- מבזקים וציוצים ----------
  { id: 'tg-amitsegal', name: 'עמית סגל', type: 'telegram', cat: 'flash', lang: 'he', handle: 'amitsegal', home: 'https://t.me/amitsegal' },
  { id: 'tg-n12chat', name: 'N12 צ׳אט הכתבים', type: 'telegram', cat: 'flash', lang: 'he', handle: 'N12chat', home: 'https://t.me/N12chat' },
  { id: 'tg-ynet', name: 'ynet בטלגרם', type: 'telegram', cat: 'flash', lang: 'he', handle: 'ynetalerts', home: 'https://t.me/ynetalerts' },
  { id: 'ynet-flash', name: 'ynet מבזקים', type: 'rss', cat: 'flash', lang: 'he', url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml', home: 'https://www.ynet.co.il' },

  // ---------- וידאו (יוטיוב) ----------
  { id: 'yt-jem', name: 'JEM', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UClI7Gc6hGrrk5UY-zxCdrIA' },
  { id: 'yt-livingtorah', name: 'Living Torah', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UC8jYVazkLuwMCRJHX285NKg' },
  { id: 'yt-chabadorg', name: 'Chabad.org', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UCc0y_E87EUnOW2m2mGJU9Gg' },
  { id: 'yt-collive', name: 'COLlive', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UCaaxzLbU_VGXw7hplnONBlg' },
  { id: 'yt-chinfo', name: 'CrownHeights.info', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UCt2JcJQsVMcJkb_hpowO6jQ' },
  { id: 'yt-anash', name: 'Anash.org', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UCC4Kod16470SKvMDeO-6RFg' },
];
