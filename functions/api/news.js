/* 嘉蘭樂學島：AI 學習新聞（Cloudflare Pages Function）
   網址：/api/news
   每 12 小時才真的去 Google 新聞抓一次，其餘時間都用快取。
   只收「信任來源」而且同時跟 AI 和教育有關的新聞，最多 5 則。 */

const HOURS = 12;
const QUERIES = ["國小 AI 教育", "AI 素養 學生", "生成式AI 中小學", "人工智慧 課程 學童"];
// 信任來源（看新聞來源網站的網域）
const TRUSTED = ["edu.tw", "cna.com.tw", "pts.org.tw", "parenting.com.tw", "udn.com", "gvm.com.tw", "cw.com.tw", "ltn.com.tw", "nownews.com", "chinatimes.com", "taiwanhot.net", "rti.org.tw", "ner.gov.tw"];
const AI_WORDS = /AI|人工智慧|生成式|ChatGPT|機器學習|科技教育|數位學習/i;
const EDU_WORDS = /國小|小學|中小學|學生|學童|教育|老師|教師|課程|學習|校園|學校/;
// 不適合放在給小學生看的島報上的字眼
const BLOCK = /死|殺|屍|性侵|性騷|猥褻|色情|毒品|詐騙|車禍|槍|自殺|霸凌|命案|兇|酒駕|偷拍|起訴|判刑|羈押|股價|股票|漲停|跌停|選舉|罷免|戰爭|飛彈/;

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp("<" + t + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + t + ">")); return m ? decode(m[1]) : ""; };

function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1], src = it.match(/<source\s+url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/);
    const source = src ? decode(src[2]) : "", srcUrl = src ? src[1] : "";
    let title = tag(it, "title");
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    items.push({ title, url: tag(it, "link"), date: tag(it, "pubDate"), source, srcUrl });
  }
  return items;
}
function pickNews(items, now = Date.now()) {
  const host = u => { try { return new URL(u).hostname; } catch (e) { return ""; } };
  const seen = new Set(), out = [];
  items
    .filter(n => n.title && n.url && TRUSTED.some(d => host(n.srcUrl) === d || host(n.srcUrl).endsWith("." + d)))
    .filter(n => AI_WORDS.test(n.title) && EDU_WORDS.test(n.title) && !BLOCK.test(n.title))
    .map(n => ({ ...n, t: Date.parse(n.date) || 0 }))
    .filter(n => n.t > now - 60 * 864e5)
    .sort((a, b) => b.t - a.t)
    .forEach(n => { const k = n.title.replace(/\s/g, "").slice(0, 18); if (!seen.has(k)) { seen.add(k); out.push(n); } });
  return out.slice(0, 5).map(n => {
    const d = new Date(n.t + 8 * 3600e3);
    return { title: n.title, url: n.url, source: n.source.replace(/\s*[A-Za-z].*$/, "") || n.source, date: d.toISOString().slice(0, 10) };
  });
}

export async function onRequestGet(context) {
  const cache = caches.default, key = new Request(new URL("/api/news?cache=v1", context.request.url).toString());
  try { const hit = await cache.match(key); if (hit) return hit; } catch (e) {}
  let items = [];
  try {
    const xmls = await Promise.all(QUERIES.map(q =>
      fetch("https://news.google.com/rss/search?q=" + encodeURIComponent(q + " when:30d") + "&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
        { cf: { cacheTtl: HOURS * 3600, cacheEverything: true }, headers: { "user-agent": "Mozilla/5.0 (JialanLearningIsland news)" } })
        .then(r => r.ok ? r.text() : "").catch(() => "")));
    items = pickNews(xmls.flatMap(parseRss));
  } catch (e) {}
  const res = new Response(JSON.stringify({ updated: new Date().toISOString(), items }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + (items.length ? HOURS * 3600 : 1800), "access-control-allow-origin": "*" }
  });
  try { if (items.length) context.waitUntil(cache.put(key, res.clone())); } catch (e) {}
  return res;
}
