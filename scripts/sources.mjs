// רשימת המקורות הקבועים של האתר.
// אפשר לכבות כל מקור, או להוסיף מקורות חדשים (אתר / טלגרם / יוטיוב), מתוך עמוד הניהול – admin.html.
//
// type:    rss | col | wpjson | gnews | telegram | youtube
// cat:     chabad | israel | world | flash | video | kids
// general: true = אתר חדשות כללי (אפשר לכבות את התמונות שלו בהגדרות האתר)
// אתר שחוסם את שרתי GitHub נאסף אוטומטית דרך חדשות גוגל (רק הכתבות של אותו אתר).

const gnews = (q, lang = 'he') =>
  lang === 'he'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=he&gl=IL&ceid=IL:he`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const CI = (q) => `https://chabad.info/wp-json/wp/v2/posts?${q}&_embed=wp:featuredmedia&_fields=id,date_gmt,link,title,excerpt,_links,_embedded`;

export const SOURCES = [
  // ---------- קהילה: שמחות, אירועים, ברוך דיין האמת (נאספים לפני החדשות הכלליות של אותם אתרים) ----------
  // בנוסף, כל כתבה מאתרי חב"ד שהכותרת שלה היא "מזל טוב" / חתונה / אירוסין / ע"ה עוברת אוטומטית למדור הקהילה.
  { id: 'ci-simcha', name: 'חב״ד אינפו', type: 'wpjson', cat: 'community', sub: 'simcha', lang: 'he', noFallback: true, home: 'https://chabad.info', url: CI('search=' + encodeURIComponent('מזל טוב') + '&per_page=30'), titleOnly: 'simcha' },
  { id: 'ci-events', name: 'חב״ד אינפו', type: 'wpjson', cat: 'community', sub: 'event', lang: 'he', noFallback: true, home: 'https://chabad.info', url: CI('categories=399,1102&per_page=10') },
  { id: 'ci-avel', name: 'חב״ד אינפו', type: 'wpjson', cat: 'community', sub: 'avel', lang: 'he', noFallback: true, home: 'https://chabad.info', url: CI('categories=401&per_page=12') },

  // ---------- חב"ד ----------
  { id: 'col', name: 'COL', type: 'col', cat: 'chabad', lang: 'he', url: 'https://col.org.il/main', home: 'https://col.org.il' },
  { id: 'chabadinfo', name: 'חב״ד אינפו', type: 'wpjson', cat: 'chabad', lang: 'he', home: 'https://chabad.info', url: CI('per_page=30') },
  { id: 'collive', name: 'COLlive', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://collive.com/feed/', home: 'https://collive.com' },
  { id: 'anash', name: 'Anash.org', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://anash.org/feed/', home: 'https://anash.org' },
  { id: 'crownheights', name: 'CrownHeights.info', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://crownheights.info/feed/', home: 'https://crownheights.info' },
  { id: 'chabadorg', name: 'Chabad.org', type: 'rss', cat: 'chabad', lang: 'en', url: 'https://www.chabad.org/tools/rss/news_rss.xml', home: 'https://www.chabad.org/news' },
  // חיפוש בגוגל: כתבות על חב"ד מכל אתר אחר (מוצג עם שם האתר המקורי)
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

  // ---------- וידאו – קודם כל בעברית ----------
  { id: 'ci-video', name: 'חב״ד אינפו', type: 'wpjson', cat: 'video', lang: 'he', videos: true, noFallback: true, home: 'https://chabad.info',
    url: 'https://chabad.info/wp-json/wp/v2/posts?categories=6&per_page=12&_embed=wp:featuredmedia&_fields=id,date_gmt,link,title,content,_links,_embedded' },
  { id: 'yt-kikar', name: 'כיכר השבת', type: 'youtube', cat: 'video', lang: 'he', channelId: 'UCKK1JzwJzAVVJToQ4ezjDtg' },
  { id: 'yt-jem', name: 'JEM – הרבי', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UClI7Gc6hGrrk5UY-zxCdrIA' },
  { id: 'yt-livingtorah', name: 'Living Torah', type: 'youtube', cat: 'video', lang: 'en', channelId: 'UC8jYVazkLuwMCRJHX285NKg' },

  // ---------- ילדים (מוצג באיזור הילדים) ----------
  { id: 'yt-chabadkids', name: 'ערוץ חב״ד לילדים', type: 'youtube', cat: 'kids', lang: 'he', channelId: 'UCWSfRZYEzQUxcZCruWXGrrA' },
  { id: 'ci-kids', name: 'חב״ד אינפו – ילדים', type: 'wpjson', cat: 'kids', lang: 'he', noFallback: true, home: 'https://chabad.info', url: CI('categories=852&per_page=12') },
];

// זיהוי שמחות ואבלים לפי הכותרת (בכתבות מאתרי חב"ד)
export const SIMCHA_RE = /^מזל טוב|מזל טוב[:!]|אירוסי |אירוסין|נישואי |חתונת |בר[- ]?מצוו?ה של|הולדת (הבן|הבת|נכד|נכדה|בן|בת)|ברית מילה|שמחת (ה?נישואין|ה?אירוסין)|בשעה טובה|Mazel Tov|Mazal Tov|Engagement:|Wedding:|Bar Mitzvah:/i;
export const AVEL_RE = /ע["״]ה\b|ז["״]ל\s*$|ברוך דיין האמת|^נפטר|נפטרה |הלוויית |הלווית |נלב["״]ע|^BDE\b|Baruch Dayan|passed away|Levaya/i;

// נושאים "משעממים" שאפשר לסנן (מופעל/כבוי בעמוד הניהול). חלים על חדשות כלליות ומבזקים, לא על אתרי חב"ד.
export const BORING = {
  weather: /מזג[\s-]?ה?אוויר|התחזית|תחזית (ה?מזג|גשם|לסוף|ל?שבוע)|גשמים|גשם (מקומי|ראשון|כבד|יורד)|שרב|חמסין|ממטרים|סופת (חול|רעמים|גשמים)|קרה (ו|ב)|\bweather\b|\bforecast\b|heatwave/i,
  sports: /כדורגל|כדורסל|ליגת|הליגה|אליפות (ה?עולם|אירופה)|מונדיאל|יורוליג|גביע ה|כבש(ה)? שער|ספורט|אולימפי|טניס|פורמולה|הפועל (ת"א|תל אביב|ב"ש|באר שבע|חיפה|ירושלים)|מכבי (ת"א|תל אביב|חיפה)|בית"ר ירושלים|NBA|\bsoccer\b|\bfootball\b|basketball|baseball|\bNFL\b|\bMLB\b|\bNHL\b|Premier League|Champions League|World Cup|Olympic/i,
  gossip: /רכילות|סלב|ריאליטי|האח הגדול|מאסטר ?שף|הישרדות|אירוויזיון|כוכב נולד|הזמרת|השחקנית|הדוגמנית|אופנה|נטפליקס|הוליווד|רייטינג|celebrity|Hollywood|Netflix|reality show|fashion week/i,
  lifestyle: /מחקר (חדש|מצא|מגלה|קובע)|דיאטה|ירידה במשקל|מתכון|מתכונים|טיפים|הורוסקופ|מזלות|קוסמטיקה|recipe|\bdiet\b|weight loss|study finds|horoscope/i,
  markets: /בורסה|מניות|מדד ת"א|ת"א[- ]35|וול סטריט|נאסד"ק|דאו ג'ונס|ביטקוין|קריפטו|שער הדולר|הדולר (נחלש|מתחזק)|\bstocks?\b|Nasdaq|Dow Jones|Bitcoin|crypto/i,
  promo: /תוכן שיווקי|תוכן מקודם|כתבה פרסומית|בשיתוף פרסומי|בחסות|קופון|sponsored|promoted|advertorial|partner content/i,
};
