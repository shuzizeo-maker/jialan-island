/* 嘉蘭樂學島 3D 群島 — 主程式（ES module，Three.js） */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ===================== 基本資料 ===================== */
const GRADES = [
  { n: 1, name: "一年級", color: "#E2573B" },
  { n: 2, name: "二年級", color: "#EE8B2F" },
  { n: 3, name: "三年級", color: "#D6AE1E" },
  { n: 4, name: "四年級", color: "#4E9F50" },
  { n: 5, name: "五年級", color: "#2F7FC1" },
  { n: 6, name: "六年級", color: "#8A5CC2" }
];
const SUBJECTS = [
  { key: "chinese", name: "國語", color: "#C8423B", bld: "academy", desc: "閱讀、識字、寫作，聽說讀寫樣樣來" },
  { key: "math", name: "數學", color: "#2B7BD6", bld: "math", desc: "數與量、圖形與空間，動腦解問題" },
  { key: "english", name: "英語", color: "#E07B1F", bld: "clock", desc: "唱歌、會話、字母拼讀，開口說英語" },
  { key: "science", name: "自然", color: "#2E9E5B", bld: "dome", desc: "觀察、實驗，認識山林與海洋的生命" },
  { key: "social", name: "社會", color: "#A35A2C", bld: "hall", desc: "家鄉、臺灣與世界，認識人和土地" },
  { key: "music", name: "音樂", color: "#D04E8C", bld: "music", desc: "歌唱、樂器與欣賞，用聲音表達自己" },
  { key: "integrative", name: "綜合", color: "#C99A0E", bld: "round", desc: "生活技能、團體合作與自我探索" },
  { key: "indigenous", name: "族語", color: "#9C2F2F", bld: "slate", desc: "排灣族語、魯凱族語，說祖先的話" },
  { key: "art", name: "美術", color: "#8B55B8", bld: "atelier", desc: "畫畫、手作與欣賞，發揮創意" },
  { key: "tech", name: "資訊科技", color: "#139A9A", bld: "tower", desc: "電腦、程式與網路素養" }
];
/* ===================== 教材資料：本機檔案＋Google 試算表 ===================== */
const CFG = window.JIALAN_CONFIG || {};
const LOCAL = window.JIALAN_CONTENT || {};
const BOOKS = {};                       // "g6-chinese" -> [{ n, src, live, publisher, volume, data, ... }]
const registry = { status: "none", rows: [], error: "" };
let previewMode = false;
try { previewMode = sessionStorage.getItem("jialan:preview") === "1"; } catch (e) {}
let activeFix = [];
const GRADE_NAMES = ["一年級", "二年級", "三年級", "四年級", "五年級", "六年級"];
const TXT = v => String(v == null ? "" : v).trim();
const lines = v => TXT(v).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const splitList = v => TXT(v).split(/[、,，;；]/).map(s => s.trim()).filter(Boolean);
const splitSlash = v => TXT(v).split(/[／/]/).map(s => s.trim()).filter(Boolean);
function cnum(n) {
  const d = "零一二三四五六七八九";
  if (n < 10) return d[n];
  if (n < 20) return "十" + (n % 10 ? d[n % 10] : "");
  return d[Math.floor(n / 10)] + "十" + (n % 10 ? d[n % 10] : "");
}
function badge(id) {
  let m;
  if ((m = id.match(/^L(\d+)$/i))) return cnum(+m[1]);
  if (/^U/i.test(id)) return "統";
  if (/^R/i.test(id)) return "讀";
  return id.slice(0, 3);
}
function lessonNo(id) { const m = id.match(/^L(\d+)$/i); return m ? "第" + cnum(+m[1]) + "課" : ""; }
function sheetId(url) {
  const s = TXT(url), m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{30,}$/.test(s) ? s : "";
}
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function toObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(h => TXT(h).replace(/\s+/g, ""));
  return rows.slice(1).filter(r => r.some(c => TXT(c))).map(r => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] == null ? "" : r[i]; }); return o; });
}
function fetchTab(id, name) {
  const ck = "jialan:sheet:" + id + ":" + name;
  if (!previewMode) {
    try { const c = JSON.parse(sessionStorage.getItem(ck) || "null"); if (c && Date.now() - c.t < 5 * 60e3) return Promise.resolve(c.rows); } catch (e) {}
  }
  const url = "https://docs.google.com/spreadsheets/d/" + id + "/gviz/tq?tqx=out:csv&headers=1&sheet=" + encodeURIComponent(name);
  return fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error("讀取失敗（" + r.status + "）");
    return r.text();
  }).then(t => {
    if (/^\s*(<!doctype|<html)/i.test(t)) throw new Error("沒有讀取權限：請把共用設定改成「知道連結的任何人：檢視者」");
    const rows = toObjects(parseCSV(t));
    try { sessionStorage.setItem(ck, JSON.stringify({ t: Date.now(), rows })); } catch (e) {}
    return rows;
  }, e => { throw e instanceof TypeError ? new Error("連不到試算表：請確認共用設定為「知道連結的任何人：檢視者」") : e; });
}
const pubName = p => (p = TXT(p)) ? (/(版|自編)$/.test(p) ? p : p + "版") : "";
function addBook(g, key, b) {
  const k = "g" + g + "-" + key; (BOOKS[k] = BOOKS[k] || []).push(b);
  b.n = BOOKS[k].length; b.g = g; b.key = key; return b;
}
function booksOf(g, key) { return (BOOKS["g" + g + "-" + key] || []).filter(b => b.live || previewMode); }
function isOpen(g, key) { return booksOf(g, key).length > 0; }
function lessonHash(b, id) { return "g" + b.g + "-" + b.key + "-" + (b.n > 1 ? b.n + "-" : "") + id; }

function initLocalBooks() {
  Object.keys(LOCAL).forEach(k => {
    const m = k.match(/^g(\d)-(\w+)$/); if (!m || !subjectOf(m[2])) return;
    const d = LOCAL[k];
    addBook(+m[1], m[2], { src: "local", live: true, publisher: d.publisher || "", volume: (d.title || "").replace(/^[^上下]*?([一二三四五六][上下])/, "$1"), data: normalizeLocal(d) });
  });
}
function loadRegistry() {
  const id = sheetId(CFG.masterSheet);
  if (!id) { registry.status = "none"; return Promise.resolve(); }
  registry.status = "loading";
  return fetchTab(id, "建物登記").then(rows => {
    registry.rows = rows; const seen = {};
    rows.forEach(r => {
      const gi = GRADE_NAMES.indexOf(TXT(r["年級"])) + 1, sub = SUBJECTS.find(s => s.name === TXT(r["科目"])), sid = sheetId(r["試算表網址"]);
      r._why = !gi ? "年級沒有填" : !sub ? "科目沒有填" : !sid ? "試算表網址不正確" : "";
      if (r._why) return;
      const k = "g" + gi + "-" + sub.key;
      if (!seen[k]) { seen[k] = 1; BOOKS[k] = []; }   // 總表有登記，就用試算表取代本機檔案
      r._book = addBook(gi, sub.key, { src: "sheet", id: sid, live: TXT(r["上線"]) === "是", publisher: TXT(r["版本"]), volume: TXT(r["冊別"]), teacher: TXT(r["負責老師"]) });
    });
    registry.status = "ok";
  }).catch(e => { registry.status = "error"; registry.error = e.message; });
}
function loadBook(b) {
  if (b.data) return Promise.resolve(b.data);
  if (!b.loading) {
    const tabs = ["課次", "內容", "字詞卡", "想一想", "題目", "讀音修正"];
    b.loading = Promise.all(tabs.map(t => fetchTab(b.id, t).catch(err => { if (t === "課次") throw err; return []; })))
      .then(r => (b.data = normalizeSheet.apply(null, r)))
      .catch(e => { b.loading = null; throw e; });
  }
  return b.loading;
}
function parseQuiz(r) {
  const t = TXT(r["題型"]), q = TXT(r["題目"]), ans = TXT(r["正確答案"]), why = TXT(r["解說"]), say = TXT(r["朗讀提示"]);
  if (!q || !ans) return null;
  if (t === "選擇") { const o = [ans, TXT(r["選項2"]), TXT(r["選項3"]), TXT(r["選項4"])].filter(Boolean); return o.length < 2 ? null : { t: "choice", q, o, a: 0, why, say }; }
  if (t === "是非") return { t: "choice", q, o: ["對", "錯"], a: /^(對|是|○|O|true)$/i.test(ans) ? 0 : 1, why, say, fixed: true };
  if (t === "排序") { const o = splitSlash(ans); return o.length < 2 ? null : { t: "order", q, o, why, say }; }
  if (t === "組句") { const o = splitSlash(ans); return o.length < 2 ? null : { t: "build", q, tiles: o, why, say }; }
  if (t === "配對") {
    const pairs = splitSlash(ans).map(x => x.split(/[=＝]/)).filter(x => x.length >= 2).map(x => ({ a: x[0].trim(), b: x.slice(1).join("=").trim() }));
    return pairs.length < 2 ? null : { t: "match", q, pairs, why, say };
  }
  return null;
}
function normalizeSheet(les, con, cards, think, quiz, fix) {
  const has = (rows, col) => (rows.length && col in rows[0] ? rows : []);
  les = has(les, "課次代號"); con = has(con, "區塊"); cards = has(cards, "字詞"); think = has(think, "題目"); quiz = has(quiz, "題型"); fix = has(fix, "寫法");
  const by = (rows, id) => rows.filter(r => TXT(r["課次代號"]).replace(/\s/g, "") === id);
  const units = [], lessons = {};
  les.forEach(r => {
    const id = TXT(r["課次代號"]).replace(/\s/g, ""); if (!/^[A-Za-z0-9]+$/.test(id)) return;
    const uname = TXT(r["單元"]) || "課程";
    let u = units[units.length - 1]; if (!u || u.name !== uname) { u = { name: uname, items: [] }; units.push(u); }
    const title = TXT(r["課名"]);
    u.items.push({ id, no: badge(id), title, genre: TXT(r["類型"]), author: TXT(r["作者"]), live: TXT(r["上線"]) === "是" });
    const cardRows = by(cards, id);
    lessons[id] = {
      no: lessonNo(id), title, genre: TXT(r["類型"]), author: TXT(r["作者"]), unit: uname,
      goals: lines(r["學習目標"]), theme: TXT(r["主旨"]), summary: TXT(r["大意"]), authorNote: TXT(r["作者介紹"]),
      quote: TXT(r["名言佳句"]) ? { text: TXT(r["名言佳句"]), by: TXT(r["名言出處"]) } : null,
      blocks: by(con, id).map(c => ({ type: TXT(c["區塊"]) || "段落", title: TXT(c["標題"]), text: TXT(c["內容"]), extra: TXT(c["補充"]), say: TXT(c["朗讀"]) !== "否" })),
      chars: cardRows.filter(c => TXT(c["類型"]) === "生字").map(c => ({
        c: TXT(c["字詞"]), zy: TXT(c["讀音"]), m: TXT(c["意思"]), ex: TXT(c["例句"]), rad: TXT(c["部首"]), rs: TXT(c["部首外筆畫"]), total: TXT(c["總筆畫"]),
        words: splitList(c["相關語詞"]), similar: splitList(c["比一比"]).map(x => x.split(/[:：]/)).filter(x => x[0]).map(x => [x[0].trim(), TXT(x[1])]),
        tip: TXT(c["小提醒"]), audio: TXT(c["音檔網址"]) })).filter(c => c.c),
      words: cardRows.filter(c => TXT(c["類型"]) !== "生字").map(c => ({ w: TXT(c["字詞"]), zy: TXT(c["讀音"]), m: TXT(c["意思"]), ex: TXT(c["例句"]), kind: TXT(c["類型"]) || "語詞", audio: TXT(c["音檔網址"]) })).filter(w => w.w),
      think: by(think, id).map(t => ({ q: TXT(t["題目"]), a: TXT(t["參考答案"]) })).filter(t => t.q),
      quiz: by(quiz, id).map(parseQuiz).filter(Boolean)
    };
  });
  return { units, lessons, sayFix: fix.map(f => [TXT(f["寫法"]), TXT(f["唸法"])]).filter(f => f[0] && f[1]) };
}
function normalizeLocal(d) {
  const lessons = {};
  Object.keys(d.lessons || {}).forEach(id => {
    const L = d.lessons[id], T = L.treasure || { pairs: [], patterns: [] };
    const blocks = (L.stanzas || []).map(s => ({ type: "課文", title: s.head, text: s.lines.join("\n"), extra: s.gist, say: true }));
    if (L.appreciation) blocks.push({ type: "段落", title: "賞析", text: L.appreciation, extra: "", say: true });
    if (T.title) blocks.push({ type: "重點", title: T.title, text: T.intro || "", extra: T.pairs.map(p => p.a + " → " + p.b).join("\n"), say: true });
    (T.patterns || []).forEach(p => blocks.push({ type: "重點", title: "句型：" + p.name, text: p.rule, extra: p.ex.join("\n"), say: true }));
    lessons[id] = {
      no: L.no, title: L.title, genre: L.genre, author: L.author, unit: L.unit, goals: L.goals || [], theme: L.theme || "", summary: L.summary || "",
      authorNote: L.authorNote || "", quote: L.quote || null, blocks,
      chars: (L.chars || []).map(c => Object.assign({ m: "", ex: "", audio: "" }, c, { rs: String(c.rs || ""), total: String(c.total || ""), similar: c.similar || [] })),
      words: (L.words || []).map(w => Object.assign({ kind: "語詞", audio: "", zy: "" }, w)),
      think: L.think || [],
      quiz: (L.quiz || []).map(q => q.t === "match" ? Object.assign({}, q, { pairs: q.pairs.map(k => T.pairs[k]), why: q.why || "象徵是用具體的景物，表示看不見的情感或想法。" }) : q)
    };
  });
  return {
    units: (d.units || []).map(u => ({ name: u.name, items: u.items.map(it => ({ id: it.id, no: it.no || badge(it.id), title: it.title, genre: it.genre, author: it.author, live: !!(it.open && d.lessons[it.id]) })) })),
    lessons, sayFix: []
  };
}
const LAT = 22.6, LON = 120.95; // 臺東縣金峰鄉嘉蘭村
const QUOTES = [
  ["學而時習之，不亦說乎？", "《論語》"],
  ["三人行，必有我師焉。", "《論語》"],
  ["溫故而知新，可以為師矣。", "《論語》"],
  ["知之為知之，不知為不知，是知也。", "《論語》"],
  ["己所不欲，勿施於人。", "《論語》"],
  ["千里之行，始於足下。", "《老子》"],
  ["有志者，事竟成。", "《後漢書》"],
  ["一寸光陰一寸金，寸金難買寸光陰。", "俗諺"],
  ["如果你想得到從未擁有的東西，你就得去做從未做過的事。", "湯瑪斯．傑佛遜"],
  ["讀書不覺已春深，一寸光陰一寸金。", "王貞白"]
];
// 朗讀時容易唸錯的詞：左邊是畫面上的字，右邊是唸給機器聽的同音字（只影響聲音）
const SAY_FIX = [["巷弄", "巷隆"], ["還是", "孩是"]];

/* ===================== 小工具 ===================== */
const $ = (s, r) => (r || document).querySelector(s);
const $all = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function store(k, v) {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem("jialan:" + k) || "null");
    localStorage.setItem("jialan:" + k, JSON.stringify(v));
  } catch (e) { return null; }
}
const ICON_SPEAK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="17" width="22" height="17" rx="4" fill="currentColor"/><path d="M14 17v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="3.5"/></svg>';
const subjectOf = k => SUBJECTS.find(s => s.key === k);

/* ===================== 語音朗讀 ===================== */
let voice = null, voiceEn = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null;
  voiceEn = vs.find(v => /en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
let audioEl = null;
function playAudio(url) { stopSpeak(); try { audioEl = audioEl || new Audio(); audioEl.src = url; audioEl.play().catch(() => toast("音檔無法播放，請老師確認音檔網址是公開的")); } catch (e) {} }
function speak(text, opt) {
  opt = opt || {};
  if (ui.mute && !opt.force) return;
  if (audioEl) { try { audioEl.pause(); } catch (e) {} }
  if (!("speechSynthesis" in window)) { if (opt.end) opt.end(); return; }
  try {
    if (!opt.queue) speechSynthesis.cancel();
    let t = String(text).replace(/　/g, "，");
    const en = opt.lang === "en";
    if (!en) SAY_FIX.concat(activeFix).forEach(f => { t = t.split(f[0]).join(f[1]); });
    const u = new SpeechSynthesisUtterance(t);
    u.lang = en ? "en-US" : "zh-TW"; const v = en ? voiceEn : voice; if (v) u.voice = v;
    u.rate = opt.rate || (en ? 0.8 : 0.85);
    const done = () => { musicDuck(false); if (opt.end) opt.end(); };
    u.onstart = () => musicDuck(true); u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
  } catch (e) { if (opt.end) opt.end(); }
}
function stopSpeak() { try { speechSynthesis.cancel(); } catch (e) {} }
document.addEventListener("click", e => {
  const a = e.target.closest("[data-audio]");
  if (a) { e.preventDefault(); playAudio(a.getAttribute("data-audio")); return; }
  const b = e.target.closest("[data-say]");
  if (b) { e.preventDefault(); speak(b.getAttribute("data-say"), { lang: b.getAttribute("data-lang") || "", force: true }); }
});
let toastTimer;
function toast(msg, sayIt) {
  const t = $("#toast"); t.innerHTML = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
  if (sayIt) speak(sayIt === true ? t.textContent : sayIt);
}

/* ===================== 時間、日夜與四季 ===================== */
  var override = null; // 老師預覽用 {y,m,d,h,mi}
  function twNow() {
    if (override) return override;
    var d = new Date(Date.now() + 8 * 3600e3);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
  }
  var TERMS = [ // 二十四節氣（約略日期）
    [1, 6, "小寒"], [1, 20, "大寒"], [2, 4, "立春"], [2, 19, "雨水"], [3, 6, "驚蟄"], [3, 21, "春分"],
    [4, 5, "清明"], [4, 20, "穀雨"], [5, 6, "立夏"], [5, 21, "小滿"], [6, 6, "芒種"], [6, 21, "夏至"],
    [7, 7, "小暑"], [7, 23, "大暑"], [8, 8, "立秋"], [8, 23, "處暑"], [9, 8, "白露"], [9, 23, "秋分"],
    [10, 8, "寒露"], [10, 23, "霜降"], [11, 7, "立冬"], [11, 22, "小雪"], [12, 7, "大雪"], [12, 22, "冬至"]
  ];
  function solarTerm(m, d) {
    var key = m * 100 + d, cur = TERMS[TERMS.length - 1];
    TERMS.forEach(function (t) { if (t[0] * 100 + t[1] <= key) cur = t; });
    return cur[2];
  }
  function seasonOf(m, d) {
    var k = m * 100 + d;
    if (k >= 204 && k < 506) return "spring";
    if (k >= 506 && k < 808) return "summer";
    if (k >= 808 && k < 1107) return "autumn";
    return "winter";
  }
  var SEASON_NAME = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
  function dayOfYear(t) { return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(t.y, 0, 0)) / 864e5); }
  function sunTimes(t) {
    var N = dayOfYear(t), rad = Math.PI / 180;
    var decl = -23.44 * Math.cos(2 * Math.PI / 365 * (N + 10)) * rad;
    var cosW = (Math.sin(-0.833 * rad) - Math.sin(LAT * rad) * Math.sin(decl)) / (Math.cos(LAT * rad) * Math.cos(decl));
    var w = Math.acos(clamp(cosW, -1, 1)) / rad; // degrees
    var B = 2 * Math.PI * (N - 81) / 364;
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var noon = 12 * 60 - (LON - 120) * 4 - eot;
    return { rise: noon - w * 4, set: noon + w * 4 };
  }
  function moonPhase(t) {
    var days = (Date.UTC(t.y, t.m - 1, t.d, t.h - 8, t.mi) - Date.UTC(2000, 0, 6, 18, 14)) / 864e5;
    var p = (days % 29.530588) / 29.530588; return p < 0 ? p + 1 : p;
  }
  function fmt(min) { min = (min + 1440) % 1440; var h = Math.floor(min / 60), m = Math.round(min % 60); if (m === 60) { h++; m = 0; } return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }
  function hex(c) { c = c.replace("#", ""); return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)]; }
  function mix(a, b, k) { a = hex(a); b = hex(b); return "#" + a.map(function (v, i) { var x = Math.round(v + (b[i] - v) * k).toString(16); return x.length < 2 ? "0" + x : x; }).join(""); }
  var SKY = [ // [太陽高度, 上方顏色, 地平線顏色]
    [-1, "#08122B", "#16254A"], [-0.35, "#0C1A3C", "#22325C"], [-0.1, "#2A3E73", "#C77A6E"],
    [0.02, "#4C78B6", "#F6B06A"], [0.2, "#5DA6DF", "#CFE7F1"], [1, "#3D8FD8", "#BEE2F4"]
  ];
  function skyAt(alt) {
    for (var i = 1; i < SKY.length; i++) {
      if (alt <= SKY[i][0]) { var a = SKY[i - 1], b = SKY[i], k = (alt - a[0]) / (b[0] - a[0]); return [mix(a[1], b[1], k), mix(a[2], b[2], k)]; }
    }
    return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
  }
  var SEASON_LAND = {
    spring: { g1: "#7CC56A", g2: "#5DAE57", m1: "#6E9C7A", m2: "#4E7E63", m3: "#3B6450" },
    summer: { g1: "#55AE55", g2: "#3E9549", m1: "#5D9070", m2: "#3F7458", m3: "#2C5B45" },
    autumn: { g1: "#A7B35C", g2: "#8C9B4A", m1: "#8A9A76", m2: "#6B7E5E", m3: "#53654B" },
    winter: { g1: "#8FAE7E", g2: "#76966A", m1: "#8C9EA0", m2: "#6E8487", m3: "#56686E" }
  };
  function computeState() {
    var t = twNow(), now = t.h * 60 + t.mi, st = sunTimes(t);
    var alt, phase, dayP = (now - st.rise) / (st.set - st.rise);
    if (now >= st.rise && now <= st.set) { alt = Math.sin(Math.PI * dayP); }
    else { var gap = now > st.set ? now - st.set : st.rise - now; alt = -clamp(gap / 150, 0, 1); }
    if (alt < -0.25) phase = now < 720 ? "凌晨" : "夜晚";
    else if (alt < 0.15) phase = now < 720 ? "清晨" : "黃昏";
    else if (now < 660) phase = "上午";
    else if (now < 810) phase = "中午";
    else phase = "下午";
    if (alt < -0.25 && (now >= 1320 || now < 60)) phase = "深夜";
    var dark = alt >= 0.12 ? 0 : alt >= 0 ? (0.12 - alt) / 0.12 * 0.2 : 0.2 + clamp(-alt / 0.45, 0, 1) * 0.8;
    var season = seasonOf(t.m, t.d);
    var sky = skyAt(alt);
    if (season === "winter") sky = [mix(sky[0], "#7F95A8", 0.15), mix(sky[1], "#C9D3DA", 0.15)];
    if (season === "summer" && alt > 0.2) sky = [mix(sky[0], "#2E86E0", 0.2), sky[1]];
    var nightP = 0;
    if (now > st.set) nightP = (now - st.set) / (st.rise + 1440 - st.set);
    else if (now < st.rise) nightP = (now + 1440 - st.set) / (st.rise + 1440 - st.set);
    return { t: t, now: now, sun: st, alt: alt, dayP: dayP, nightP: nightP, dark: dark, phase: phase, season: season,
      term: solarTerm(t.m, t.d), sky: sky, moon: moonPhase(t), land: SEASON_LAND[season] };
  }
  var S = computeState();



/* ===================== 3D 世界 ===================== */
const V3 = THREE.Vector3;
let renderer, scene, camera, controls, skyMat, sunLight, hemi, ambient, waterMat, waterTex, stars, sunMesh, moonSprite, moonCanvas, moonTex, snowCap;
let webgl = true;
const pickables = [];
const islands = {};       // n -> {group, pos, bld:{key:{local, out, anchor, cone}}}
const walkers = [], boats = [], foams = [], whales = [], clouds = [];
const birds = [];
let mascot = null;
let particles = null, particleKind = "", lastSeason = "";
const MAT = {};
const tween = { active: false };
const ui = { names: true, paused: false, fx: true, view: "pano", mute: false };
const focus = { g: null, key: null, flyKey: "" };
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) ui.fx = false;
const SEA_Y = -3.2;

/* ---------- 質感：雜訊、紋理 ---------- */
function n3(x, y, z, sd) {
  return Math.sin(x * 1.7 + sd) * Math.sin(y * 2.3 + sd * 1.3) * Math.sin(z * 1.9 + sd * 0.7) + 0.5 * Math.sin(x * 4.1 + sd * 2.1) * Math.sin(y * 3.7 + sd) * Math.sin(z * 4.3 + sd * 1.7);
}
function lumpy(geo, amt, freq, sd) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + n3(x * freq, y * freq, z * freq, sd) * amt; p.setXYZ(i, x * k, y * k, z * k); }
  geo.computeVertexNormals(); return geo;
}
const _texCache = {};
function noiseTex(key, draw, rx = 1, ry = 1) {
  if (_texCache[key]) return _texCache[key];
  const cv = document.createElement("canvas"); cv.width = cv.height = 256; draw(cv.getContext("2d"), 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  return (_texCache[key] = t);
}
const speckle = (x, w, h, base, n, lo, hi, rmax) => {
  x.fillStyle = base; x.fillRect(0, 0, w, h); const r = mulberry(n);
  for (let i = 0; i < n; i++) { const v = Math.floor(lo + r() * (hi - lo)); x.fillStyle = "rgba(" + v + "," + v + "," + v + "," + (0.08 + r() * 0.14) + ")"; x.beginPath(); x.arc(r() * w, r() * h, 1 + r() * rmax, 0, Math.PI * 2); x.fill(); }
};
const plasterTex = () => noiseTex("plaster", (x, w, h) => speckle(x, w, h, "#F2F2F2", 1600, 150, 255, 3));
const grassTex = () => noiseTex("grass", (x, w, h) => {
  speckle(x, w, h, "#E9E9E9", 2600, 120, 255, 5);
  const r = mulberry(5); for (let i = 0; i < 900; i++) { const v = 140 + Math.floor(r() * 90); x.strokeStyle = "rgba(" + v + "," + v + "," + v + ",.35)"; x.lineWidth = 1; const px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 3 - r() * 4); x.stroke(); }
}, 3, 3);
const rockTex = () => noiseTex("rock", (x, w, h) => {
  x.fillStyle = "#EEEEEE"; x.fillRect(0, 0, w, h); const r = mulberry(9);
  for (let y = 0; y < h; y += 6 + r() * 14) { const v = 170 + Math.floor(r() * 70); x.fillStyle = "rgba(" + v + "," + (v - 6) + "," + (v - 16) + ",.55)"; x.beginPath(); x.moveTo(0, y); for (let px = 0; px <= w; px += 16) x.lineTo(px, y + Math.sin(px * 0.05 + y) * 3 + r() * 2); x.lineTo(w, y + 8); x.lineTo(0, y + 8); x.fill(); }
  speckle(x, 0, 0, "#000", 0, 0, 0, 0);
  for (let i = 0; i < 700; i++) { const v = 90 + Math.floor(r() * 80); x.fillStyle = "rgba(" + v + "," + v + "," + v + ",.18)"; x.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2); }
}, 6, 1);
const roofTex = () => noiseTex("roof", (x, w, h) => {
  x.fillStyle = "#F0F0F0"; x.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { x.fillStyle = "rgba(60,60,60,.32)"; x.fillRect(0, y + 13, w, 3); for (let px = (y / 16 % 2) * 12; px < w; px += 24) { x.fillStyle = "rgba(60,60,60,.16)"; x.fillRect(px, y, 2, 13); } }
}, 1, 1);
const roofMat = c => mat("roof" + c, c, { map: roofTex() });
function mat(key, color, o) {
  if (!MAT[key]) MAT[key] = new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: false, roughness: 0.9, metalness: 0 }, o || {}));
  return MAT[key];
}
const M = c => (c === "#F6F1E3" || c === "#F4F1EA") ? mat("w" + c, c, { map: plasterTex() }) : mat("c" + c, c);
function part(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true; return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
function gable(w, h, d) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2); return g;
}
function saw(w, h, d) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(d / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2); return g;
}
let winMat;
function win(x, y, z, w = 0.28, h = 0.28) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const side = w < 0.1;                       // 側面的窗（寬度方向是 z）
  if (side) { g.add(part(box(0.03, h + 0.07, 0.36), M("#FBFAF6"))); g.add(part(box(0.05, h, 0.28), winMat)); return g; }
  g.add(part(box(w + 0.07, h + 0.07, 0.03), M("#FBFAF6")));
  g.add(part(box(w, h, 0.05), winMat));
  if (w > 0.22) g.add(part(box(0.02, h, 0.06), M("#FBFAF6")));
  g.add(part(box(w + 0.12, 0.035, 0.09), M("#E3DED2"), 0, -h / 2 - 0.045, 0.02));
  return g;
}
const soft = c => mix(c, "#EFEBDD", 0.32);     // 淡雅版的科目色
const WALL = "#F6F1E3", WALL2 = "#EDE6D2", INKC = "#4A4A44";

/* ---------- 十種科目建物（牆面米白、屋頂用淡化的科目色） ---------- */
function building(type, c0) {
  const g = new THREE.Group(), add = m => g.add(m), c = soft(c0);
  switch (type) {
    case "academy":
      add(part(box(2, 1, 1.4), M(WALL), 0, 0.5, 0));
      add(part(box(0.42, 0.62, 0.05), M("#8A5A48"), 0, 0.31, 0.71));
      [-0.6, 0.6].forEach(x => { add(win(x, 0.55, 0.71)); add(win(x, 0.55, -0.71)); });
      add(part(box(2.4, 0.12, 0.95), M(c), 0, 1.18, 0.36, 0.5)); add(part(box(2.4, 0.12, 0.95), M(c), 0, 1.18, -0.36, -0.5));
      add(part(box(2.3, 0.16, 0.18), M(c), 0, 1.42, 0));
      add(part(box(0.55, 0.12, 0.14), M(c), 1.3, 1.55, 0, 0, 0, 0.55)); add(part(box(0.55, 0.12, 0.14), M(c), -1.3, 1.55, 0, 0, 0, -0.55));
      break;
    case "math":
      add(part(box(1.6, 1.2, 1.6), M(WALL), 0, 0.6, 0));
      add(part(cone(1.3, 1.0, 4), M(c), 0, 1.7, 0, 0, Math.PI / 4));
      add(part(box(0.4, 0.6, 0.05), M("#5B7387"), 0, 0.3, 0.81));
      [-0.45, 0.45].forEach(x => { add(win(x, 0.85, 0.81)); add(win(x, 0.85, -0.81)); });
      add(part(box(0.6, 0.6, 0.6), M(c), 1.15, 0.3, 0));
      add(part(sph(0.22, 8, 6), M("#EBCB7A"), 0, 2.3, 0));
      break;
    case "clock":
      add(part(box(2, 0.8, 1.2), M(WALL), 0, 0.4, 0));
      add(part(gable(2.1, 0.45, 1.35), M(c), 0, 0.8, 0));
      add(part(box(0.6, 2.3, 0.6), M(WALL), 0, 1.15, 0));
      add(part(cone(0.5, 0.8, 4), M(c), 0, 2.7, 0, 0, Math.PI / 4));
      add(part(cyl(0.2, 0.2, 0.05, 12), M("#FFFFFF"), 0, 1.9, 0.31, Math.PI / 2));
      [-0.65, 0.65].forEach(x => { add(win(x, 0.42, 0.61)); add(win(x, 0.42, -0.61)); });
      break;
    case "dome": {
      add(part(cyl(1.05, 1.1, 0.25, 16), M(WALL2), 0, 0.125, 0));
      const glass = mat("glass", "#D9EFE6", { transparent: true, opacity: 0.6, roughness: 0.3 });
      add(part(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.25, 0));
      add(part(cone(0.3, 0.8, 6), M(c), -0.35, 0.65, 0)); add(part(sph(0.32, 8, 6), M(c), 0.35, 0.55, 0.15));
      add(part(sph(0.1, 6, 5), winMat, 0, 0.95, 0));
      break; }
    case "hall":
      add(part(box(2.2, 0.15, 1.7), M(WALL2), 0, 0.075, 0));
      add(part(box(1.8, 1.0, 1.1), M(WALL), 0, 0.65, -0.15));
      [-0.75, -0.25, 0.25, 0.75].forEach(x => add(part(cyl(0.08, 0.08, 1.0, 6), M("#FFFFFF"), x, 0.65, 0.55)));
      add(part(gable(2.0, 0.45, 1.7), M(c), 0, 1.15, 0));
      add(part(sph(0.32, 10, 8), M("#8CC0DA"), 0, 1.95, 0));
      [-0.55, 0.55].forEach(x => { add(win(x, 0.72, 0.41)); add(win(x, 0.72, -0.71)); });
      break;
    case "music": {
      add(part(box(1.8, 0.9, 1.3), M(c), 0, 0.45, 0));
      const shell = new THREE.CylinderGeometry(0.9, 0.9, 1.3, 14, 1, false, Math.PI / 2, Math.PI); shell.rotateX(Math.PI / 2);
      add(part(shell, M(WALL), 0, 0.9, 0));
      add(part(box(1.6, 0.25, 0.05), M("#FFFFFF"), 0, 0.22, 0.66));
      [-0.6, -0.3, 0, 0.3, 0.6].forEach(x => add(part(box(0.1, 0.14, 0.06), M(INKC), x, 0.28, 0.68)));
      [-0.5, 0.5].forEach(x => { add(win(x, 0.62, 0.66)); add(win(x, 0.62, -0.66)); });
      break; }
    case "round":
      add(part(cyl(1.0, 1.0, 1.0, 14), M(WALL), 0, 0.5, 0));
      add(part(cone(1.25, 0.9, 14), M(c), 0, 1.45, 0));
      [[-0.55, 0.8], [0.55, 0.8], [-0.55, -0.8], [0.55, -0.8]].forEach(p => add(win(p[0], 0.55, p[1])));
      add(part(cyl(0.03, 0.03, 1.1, 4), M("#FFFFFF"), 0, 2.3, 0));
      add(part(box(0.45, 0.28, 0.03), M(soft("#E2573B")), 0.25, 2.68, 0));
      break;
    case "slate":
      add(part(box(2.2, 0.75, 1.5), M("#B9B2A4"), 0, 0.375, 0));
      add(part(box(2.5, 0.12, 1.85), M("#86817A"), 0, 0.82, 0, 0.06));
      add(part(box(2.2, 0.1, 1.6), M("#77736C"), 0, 0.95, 0));
      add(part(box(0.32, 0.75, 0.12), M(c), 0, 0.375, 0.8));
      [0.56, 0.3].forEach(y => add(part(box(0.13, 0.13, 0.04), M("#EBCB7A"), 0, y, 0.87, 0, 0, Math.PI / 4)));
      [-0.65, 0.65].forEach(x => { add(win(x, 0.42, 0.76)); add(win(x, 0.42, -0.76)); });
      break;
    case "atelier":
      add(part(box(1.8, 1.0, 1.4), M(WALL), 0, 0.5, 0));
      add(part(saw(1.9, 0.5, 0.7), M(c), 0, 1.0, 0.35)); add(part(saw(1.9, 0.5, 0.7), M(c), 0, 1.0, -0.35));
      add(part(box(0.9, 0.45, 0.05), winMat, -0.3, 0.55, 0.71)); add(win(0.3, 0.55, -0.71, 0.9, 0.45));
      add(part(cyl(0.36, 0.36, 0.05, 10), M("#FFFFFF"), 0.55, 0.55, 0.74, Math.PI / 2));
      break;
    case "tower":
      add(part(box(1.0, 2.4, 1.0), M(WALL), 0, 1.2, 0));
      [0.8, 1.6, 2.35].forEach(y => add(part(box(1.04, 0.12, 1.04), M(c), 0, y, 0)));
      [1.15, 1.95].forEach(y => [-0.24, 0.24].forEach(x => { add(win(x, y, 0.51, 0.3, 0.32)); add(win(x, y, -0.51, 0.3, 0.32)); }));
      add(part(cyl(0.04, 0.04, 0.8, 4), M(INKC), 0, 2.8, 0));
      add(part(sph(0.12, 8, 6), M(c), 0, 3.25, 0));
      add(part(box(0.5, 0.8, 0.7), M(c), 0.75, 0.4, 0));
      break;
  }
  return g;
}
function trafficCone() { const m = part(cone(0.2, 0.5, 8), M("#EFA05A"), 0, 0.26, 0); m.userData.noMerge = true; return m; }
const TREE_COLORS = {
  spring: { a: "#6DB25A", b: "#F2A9BE", c: "#55A04E", pine: "#3E7F52", grass: "#86BF63" },
  summer: { a: "#4E9E45", b: "#3F8F42", c: "#5BA94C", pine: "#2F6E45", grass: "#6DB052" },
  autumn: { a: "#D9A23E", b: "#CB6F3A", c: "#8FA94D", pine: "#3F7350", grass: "#9DB25A" },
  winter: { a: "#6F9663", b: "#5E8758", c: "#7FA170", pine: "#3D6650", grass: "#86A672" }
};
let _treeSeed = 11;
function tree(kind, s = 1) {
  const g = new THREE.Group(), rnd = mulberry(_treeSeed += 37), bark = mat("bark", "#6E553F");
  const th = (kind === "pine" ? 0.75 : 0.95) * s;
  g.add(part(cyl(0.06 * s, 0.14 * s, th, 8), bark, 0, th / 2, 0, (rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12));
  if (kind === "pine") {
    for (let i = 0; i < 4; i++) {
      const r = (0.62 - i * 0.12) * s, h = (0.8 - i * 0.08) * s, c = lumpy(new THREE.ConeGeometry(r, h, 12, 3), 0.1, 3 / s, i * 3 + rnd() * 9);
      g.add(part(c, mat(i % 2 ? "tree-pine-hi" : "tree-pine", "#3E7F52"), 0, th * 0.6 + i * 0.36 * s + h / 2, 0, 0, rnd() * 3, 0));
    }
    return g;
  }
  [-1, 1].forEach(d => g.add(part(cyl(0.025 * s, 0.05 * s, 0.55 * s, 6), bark, d * 0.13 * s, th * 0.92, (rnd() - 0.5) * 0.1 * s, 0, 0, -d * 0.65)));
  const n = 6 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = (0.15 + rnd() * 0.3) * s, r = (0.3 + rnd() * 0.22) * s;
    const geo = lumpy(new THREE.SphereGeometry(r, 12, 9), 0.17, 2.4 / s, rnd() * 20);
    g.add(part(geo, mat(rnd() < 0.42 ? "tree-" + kind + "-hi" : "tree-" + kind, "#55A04E"), Math.cos(a) * d, th + 0.2 * s + rnd() * 0.42 * s, Math.sin(a) * d));
  }
  return g;
}
function bush(len, s = 1) {
  const g = new THREE.Group(), rnd = mulberry(_treeSeed += 53);
  for (let x = -len / 2; x <= len / 2; x += 0.32 * s) g.add(part(lumpy(new THREE.SphereGeometry((0.22 + rnd() * 0.08) * s, 10, 8), 0.15, 4, rnd() * 9), mat(rnd() < 0.4 ? "tree-c-hi" : "tree-c", "#55A04E"), x, 0.18 * s, (rnd() - 0.5) * 0.08));
  return g;
}
function textTexture(text, bg, fg, w = 512, h = 192, size = 104) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const x = cv.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = "700 " + size + "px 'Noto Serif TC','Noto Sans TC','PingFang TC','Microsoft JhengHei',serif";
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, w / 2, h / 2 + 6);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signBoard(text, color, w = 2.4) {
  const g = new THREE.Group();
  g.add(part(box(0.1, 1.3, 0.1), M("#9A7656"), -w / 2 + 0.15, 0.65, 0)); g.add(part(box(0.1, 1.3, 0.1), M("#9A7656"), w / 2 - 0.15, 0.65, 0));
  g.add(part(box(w, 0.9, 0.12), M("#9A7656"), 0, 1.25, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, 0.78), new THREE.MeshStandardMaterial({ map: textTexture(text, color, "#FFFFFF"), roughness: 0.9 }));
  face.position.set(0, 1.25, 0.065); face.userData.noMerge = true; g.add(face);
  const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.065; g.add(back);
  return g;
}
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), kill = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.noMerge || o.userData.pick) return;
    const gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const k = o.material.uuid;
    if (!buckets.has(k)) buckets.set(k, { m: o.material, list: [] });
    buckets.get(k).list.push(gg); kill.push(o);
  });
  kill.forEach(o => { o.parent.remove(o); o.geometry.dispose(); });
  buckets.forEach(b => {
    const geo = mergeGeometries(b.list, false); if (!geo) return;
    const mesh = new THREE.Mesh(geo, b.m); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  });
}
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- 懸浮小島（奶油色岩塊＋草地） ---------- */
function floatingIsland(r, h, root, cx, cz, userData) {
  const seg = r > 4 ? 30 : 22;
  root.add(part(cyl(r, r * 0.995, 0.36, seg), mat("grass", "#6DB052", { map: grassTex() }), cx, -0.18, cz));
  root.add(part(lumpy(new THREE.CylinderGeometry(r * 1.0, r * 0.95, 0.55, seg, 2), 0.025, 0.9, cx + cz), mat("cliff-lip", "#D9C59A", { map: rockTex() }), cx, -0.62, cz));
  root.add(part(lumpy(new THREE.CylinderGeometry(r * 0.95, r * 0.56, h, seg, 4), 0.06, 0.7, cx * 0.3 + cz), mat("cliff", "#CDB68A", { map: rockTex() }), cx, -0.88 - h / 2, cz));
  const bottom = new THREE.SphereGeometry(r * 0.58, seg, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); bottom.scale(1, 0.62, 1);
  lumpy(bottom, 0.08, 0.9, cz); root.add(part(bottom, mat("cliff-bot", "#B9A27A", { map: rockTex() }), cx, -0.88 - h, cz));
  const hit = new THREE.Mesh(cyl(r, r * 0.7, h + 1.2, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(cx, -0.4 - h / 2, cz); hit.userData = Object.assign({ pick: true }, userData); root.add(hit); pickables.push(hit);
  const shallow = new THREE.Mesh(new THREE.CircleGeometry(r * 1.5, seg), mat("shallow", "#55C7D6", { transparent: true, opacity: 0.55, depthWrite: false, flatShading: false }));
  shallow.rotation.x = -Math.PI / 2; shallow.position.set(cx, SEA_Y + 0.02, cz); shallow.userData.noMerge = true; shallow.receiveShadow = true; root.add(shallow);
  const foam = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r * 0.98, seg), new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.35, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(cx, SEA_Y + 0.03, cz); foam.userData.noMerge = true; root.add(foam); foams.push(foam);
  return hit;
}
/* ---------- 年級主島＋十座科目小島 ---------- */
const D = 33, RI = 10.5, RM = 5.2, RS = 2.4;
const ANG = [150, 210, 270, 330, 30, 90];
function gradeHall(color) {
  const g = new THREE.Group();
  g.add(part(box(3.0, 1.3, 1.6), M(WALL), 0, 0.65, 0));
  g.add(part(gable(3.3, 0.75, 2.0), roofMat(soft(color)), 0, 1.3, 0));
  [-0.95, -0.35, 0.35, 0.95].forEach(x => { g.add(win(x, 0.75, 0.81, 0.32, 0.34)); g.add(win(x, 0.75, -0.81, 0.32, 0.34)); });
  g.add(part(box(0.5, 0.8, 0.05), M("#8A5A48"), 0, 0.4, 0.82));
  ensureTex(); const bt = rep(TEX.band(), 2); [0.815, -0.815].forEach(z => { const b = tplane(3.0, 0.26, bt, 0, 1.12, z, z > 0 ? 0 : Math.PI); b.userData.noMerge = true; g.add(b); });
  return g;
}
function makeGradeIsland(g) {
  const root = new THREE.Group(), a = ANG[g.n - 1] * Math.PI / 180;
  const pos = new V3(Math.cos(a) * D, 0, Math.sin(a) * D);
  const toHub = Math.atan2(-pos.x, -pos.z);            // 主島中心指向嘉蘭國小的方位角
  floatingIsland(RM, 2.2, root, 0, 0, { type: "island", g: g.n });
  const hall = gradeHall(g.color); hall.position.set(0, 0, -0.6); hall.rotation.y = toHub + Math.PI; root.add(hall);
  root.add(part(cyl(0.05, 0.05, 3.2, 5), M("#FFFFFF"), 1.9, 1.6, 1.6));
  root.add(part(box(0.85, 0.5, 0.03), M(soft(g.color)), 2.33, 2.95, 1.6));
  const sb = signBoard(g.name, "#3E6B64", 2.2); sb.position.set(-1.6, 0, 2.6); sb.rotation.y = toHub + Math.PI; root.add(sb);
  const jar = potteryJar(0.9); jar.position.set(2.2, 0.02, 1.2); root.add(jar);
  const lil = lilies(10, 1.8, g.n * 13); lil.position.set(-2.8, 0, -0.4); root.add(lil);
  [[-3.4, -1.5, "c", 1.2], [3.3, -2.2, "a", 1.0], [-3.2, 2.1, "b", 0.9]].forEach(t => { const tr = tree(t[2], t[3]); tr.position.set(t[0], 0, t[1]); root.add(tr); });
  const info = { group: root, pos, bld: {} };
  SUBJECTS.forEach((s, k) => {
    const th = toHub + (36 + k * 32) * Math.PI / 180, dir = new V3(Math.sin(th), 0, Math.cos(th));
    const c = dir.clone().multiplyScalar(RI);
    const hit = floatingIsland(RS, 1.3, root, c.x, c.z, { type: "building", g: g.n, key: s.key });
    const b = building(s.bld, s.color); b.scale.setScalar(0.9); b.position.set(c.x, 0.02, c.z); b.rotation.y = th; root.add(b);
    const tc = trafficCone(); tc.position.copy(c).add(new V3(Math.cos(th), 0, -Math.sin(th)).multiplyScalar(1.5)); tc.position.y = 0.02; tc.visible = !isOpen(g.n, s.key); root.add(tc);
    const tr = tree(["a", "b", "pine", "c"][k % 4], 0.7); tr.position.copy(c).add(new V3(-Math.cos(th), 0, Math.sin(th)).multiplyScalar(1.55)).add(dir.clone().multiplyScalar(-0.6)); root.add(tr);
    // 吊橋：主島邊緣 → 小島邊緣
    ropeBridge(root, dir.clone().multiplyScalar(RM - 0.2), dir.clone().multiplyScalar(RI - RS + 0.2), 0.35, 1.1, g.n);
    info.bld[s.key] = { local: c.clone(), out: dir.clone(), anchor: hit, cone: tc, th };
  });
  mergeStatic(root);
  root.position.copy(pos);
  scene.add(root);
  islands[g.n] = info;
}
/* ---------- 嘉蘭國小島：依照校園實景（2026 年 10 月照片） ---------- */
const R_HUB = 14.5;
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
  return t;
}
const TEX = {};
const rep = (t, rx, ry = 1) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
function ensureTex() { if (!TEX.band) hubTextures(); }
function hubTextures() {
  // 學校二樓欄杆的紋飾帶：青綠與橘色三角紋、黑底白圓、中間一條紅線
  TEX.band = () => canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = "#F6F2EA"; x.fillRect(0, 0, w, h);
    const zig = (y0, up) => { for (let i = 0; i < w; i += 16) { x.fillStyle = (i / 16) % 2 ? "#F0B48A" : "#2FA597"; x.beginPath(); if (up) { x.moveTo(i, y0 + 10); x.lineTo(i + 8, y0); x.lineTo(i + 16, y0 + 10); } else { x.moveTo(i, y0); x.lineTo(i + 8, y0 + 10); x.lineTo(i + 16, y0); } x.fill(); } };
    zig(1, false); zig(h - 11, true);
    x.fillStyle = "#1C1A1A"; x.fillRect(0, 12, w, h - 24);
    x.fillStyle = "#F7F5F0"; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(32 + i * 64, h / 2, 26, 16, 0, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = "#D8322B"; x.fillRect(0, h / 2 - 1, w, 2);
  });
  TEX.tile = () => canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = "#F3F3EF"; x.fillRect(0, 0, w, h); x.strokeStyle = "rgba(120,120,120,.35)"; x.lineWidth = 1.2;
    for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  });
  TEX.pinkTile = () => canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = "#E7BDB8"; x.fillRect(0, 0, w, h); x.strokeStyle = "rgba(255,255,255,.7)"; x.lineWidth = 1.5;
    for (let i = 0; i <= w; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  });
  // 紅色祖靈柱
  TEX.totem = () => canvasTex(64, 256, (x, w, h) => {
    x.fillStyle = "#6B1F22"; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 3; k++) {
      const y = 12 + k * 82;
      x.fillStyle = "#C8342B"; x.beginPath(); x.ellipse(32, y + 8, 18, 8, 0, Math.PI, 0); x.fill();
      x.fillStyle = "#F3E3C6"; x.beginPath(); x.ellipse(32, y + 18, 12, 13, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#1C1A1A"; x.fillRect(26, y + 15, 3, 3); x.fillRect(35, y + 15, 3, 3);
      x.fillStyle = k % 2 ? "#2FA597" : "#F3E3C6"; x.fillRect(20, y + 33, 24, 26);
      x.fillStyle = "#F3E3C6"; x.fillRect(12, y + 34, 6, 18); x.fillRect(46, y + 34, 6, 18); x.fillRect(22, y + 59, 7, 16); x.fillRect(35, y + 59, 7, 16);
      x.fillStyle = "#C8342B"; x.fillRect(20, y + 44, 24, 3);
    }
  });
  // 擋土牆的彩繪：藍天、山、紅色緞帶、手牽手的孩子、頭戴羽冠的勇士
  TEX.mural = () => canvasTex(1024, 128, (x, w, h) => {
    x.fillStyle = "#2E8FB8"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#1F6E96"; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(i * 120 - 20, 86); x.lineTo(i * 120 + 50, 30 + (i % 3) * 10); x.lineTo(i * 120 + 130, 86); x.fill(); }
    x.fillStyle = "#F2C14E"; x.beginPath(); x.arc(300, 30, 14, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#D8322B"; x.beginPath(); x.moveTo(0, 20); x.lineTo(260, 70); x.lineTo(260, 84); x.lineTo(0, 34); x.fill(); x.fillRect(0, 84, w, 10);
    for (let i = 0; i < 26; i++) {
      const cx = 300 + i * 26; x.fillStyle = "#E3B48B"; x.beginPath(); x.arc(cx, 92, 5, 0, Math.PI * 2); x.fill();
      x.fillStyle = i % 3 ? "#F6F2EA" : "#1C1A1A"; x.fillRect(cx - 6, 98, 12, 14); x.fillStyle = "#24364F"; x.fillRect(cx - 6, 112, 12, 12);
      x.strokeStyle = "#E3B48B"; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + 6, 102); x.lineTo(cx + 20, 102); x.stroke();
    }
    x.fillStyle = "#7A3B26"; x.beginPath(); x.ellipse(110, 80, 46, 42, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#F6F2EA"; for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(70 + i * 13, 38, 4, 16, -0.6 + i * 0.2, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = "#D8322B"; x.fillRect(66, 46, 90, 8);
    [[560, "#F6F2EA"], [720, "#E07B1F"], [880, "#8A5CC2"]].forEach(([cx, c]) => { x.fillStyle = c; x.fillRect(cx, 40, 34, 30); x.fillStyle = "#24364F"; x.fillRect(cx + 4, 46, 8, 8); x.fillRect(cx + 20, 46, 8, 8); });
  });
  TEX.slogan = () => canvasTex(1024, 96, (x, w, h) => {
    x.fillStyle = "#6E6C68"; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(0,0,0,.12)"; for (let i = 0; i < 400; i++) x.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    "追求真善美的".split("").forEach((c, i) => {
      const cx = 90 + i * 170; x.fillStyle = "#F7F5F0"; x.beginPath(); x.arc(cx, h / 2, 34, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#C8342B"; x.font = "700 40px 'Noto Serif TC','PMingLiU',serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(c, cx, h / 2 + 2);
    });
  });
  // 入口牆：太陽、牛角、百步蛇紋
  TEX.gate = () => canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = "#F7F5F0"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#1C1A1A"; x.fillRect(96, 18, 160, 40);
    x.fillStyle = "#F7F5F0"; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(110 + i * 24, 38); x.lineTo(122 + i * 24, 26); x.lineTo(134 + i * 24, 38); x.lineTo(122 + i * 24, 50); x.fill(); }
    [["#2E8B4A", 14], ["#F2C14E", 10], ["#D8322B", 6]].forEach(([c, o]) => { x.fillStyle = c; x.fillRect(96, 58 + 14 - o, 160, 4); });
    x.strokeStyle = "#E9E1CF"; x.lineWidth = 9; x.beginPath(); x.arc(56, 50, 34, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; x.strokeStyle = i % 2 ? "#D8322B" : "#F2C14E"; x.lineWidth = 3; x.beginPath(); x.moveTo(56 + Math.cos(a) * 14, 60 + Math.sin(a) * 14); x.lineTo(56 + Math.cos(a) * 24, 60 + Math.sin(a) * 24); x.stroke(); }
    x.fillStyle = "#2E8B4A"; x.beginPath(); x.arc(56, 60, 12, 0, Math.PI * 2); x.fill(); x.fillStyle = "#F2C14E"; x.beginPath(); x.arc(56, 60, 6, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#D8322B"; for (let y = 94; y < h; y += 12) { x.fillRect(0, y, w, 3); }
  });
  TEX.kids = () => canvasTex(256, 192, (x, w, h) => {
    x.fillStyle = "#1E1E1E"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#F2C14E"; x.font = "700 22px 'Noto Sans TC',sans-serif"; x.fillText("嘉蘭開學囉", 70, 30);
    [[70, "#E2573B"], [180, "#F7F5F0"]].forEach(([cx, shirt]) => {
      x.fillStyle = "#2A2523"; x.beginPath(); x.arc(cx, 82, 30, Math.PI, 0); x.fill();
      x.fillStyle = "#E8B98F"; x.beginPath(); x.arc(cx, 92, 26, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#1C1A1A"; x.beginPath(); x.arc(cx - 9, 90, 3, 0, Math.PI * 2); x.arc(cx + 9, 90, 3, 0, Math.PI * 2); x.fill();
      x.strokeStyle = "#B5332B"; x.lineWidth = 3; x.beginPath(); x.arc(cx, 100, 8, 0.2, Math.PI - 0.2); x.stroke();
      x.fillStyle = shirt; x.fillRect(cx - 20, 118, 40, 34); x.fillStyle = "#3E7FA8"; x.fillRect(cx - 18, 152, 36, 16);
    });
  });
  TEX.rockText = () => canvasTex(128, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = "#D8322B"; x.font = "700 34px 'Noto Serif TC','PMingLiU',serif"; x.textAlign = "center";
    "嘉蘭國民小學".split("").forEach((c, i) => x.fillText(c, 76, 38 + i * 36));
    x.font = "700 14px 'Noto Serif TC',serif"; "校長題".split("").forEach((c, i) => x.fillText(c, 28, 120 + i * 16));
  });
  TEX.paving = () => canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = "#9A9890"; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) for (let i = (y / 10 % 2) * 10; i < w; i += 20) { const v = 140 + Math.floor(Math.random() * 30); x.fillStyle = "rgb(" + v + "," + (v - 2) + "," + (v - 8) + ")"; x.fillRect(i + 1, y + 1, 18, 8); }
    x.fillStyle = "rgba(170,90,80,.55)"; x.beginPath(); x.moveTo(128, 70); x.lineTo(200, 128); x.lineTo(128, 186); x.lineTo(56, 128); x.fill();
  });
  TEX.mosaic = () => canvasTex(256, 64, (x, w, h) => {
    const cols = ["#F2F0EA", "#F2F0EA", "#8FBF96", "#F0C9A2", "#A9B4B8"];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 32; i++) {
      const d = Math.abs(((i + j * 2) % 16) - 8) + Math.abs(j - 4);
      x.fillStyle = d < 3 ? "#4F9A6A" : d < 5 ? "#F0B48A" : d === 6 && i % 5 === 0 ? "#C8423B" : cols[(i * 7 + j * 3) % cols.length];
      x.fillRect(i * 8, j * 8, 7, 7);
    }
  });
  TEX.pots = () => canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = "#F2F0EA"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const cx = 32 + i * 64; x.fillStyle = "#A9592F";
      x.beginPath(); x.ellipse(cx, h * 0.6, 20, 20, 0, 0, Math.PI * 2); x.fill(); x.fillRect(cx - 9, 10, 18, 14);
      x.strokeStyle = "#F2F0EA"; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 16, h * 0.58); x.lineTo(cx - 6, h * 0.5); x.lineTo(cx + 4, h * 0.58); x.lineTo(cx + 14, h * 0.5); x.stroke();
    }
    x.fillStyle = "#2E8B4A"; for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 16, h - 8); x.lineTo(i + 32, h); x.fill(); }
  });
  TEX.roc = () => canvasTex(120, 80, (x, w, h) => {
    x.fillStyle = "#E3262E"; x.fillRect(0, 0, w, h); x.fillStyle = "#1B2A8C"; x.fillRect(0, 0, w / 2, h / 2);
    const cx = w / 4, cy = h / 4; x.fillStyle = "#FFFFFF";
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.beginPath(); x.moveTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); x.lineTo(cx + Math.cos(a + 0.26) * 7, cy + Math.sin(a + 0.26) * 7); x.lineTo(cx + Math.cos(a - 0.26) * 7, cy + Math.sin(a - 0.26) * 7); x.fill(); }
    x.beginPath(); x.arc(cx, cy, 7.5, 0, Math.PI * 2); x.fill(); x.fillStyle = "#1B2A8C"; x.beginPath(); x.arc(cx, cy, 6.3, 0, Math.PI * 2); x.fill(); x.fillStyle = "#FFFFFF"; x.beginPath(); x.arc(cx, cy, 5.3, 0, Math.PI * 2); x.fill();
  });
  TEX.court = () => canvasTex(256, 160, (x, w, h) => {
    x.fillStyle = "#7FA79A"; x.fillRect(0, 0, w, h); x.strokeStyle = "#FFFFFF"; x.lineWidth = 4;
    x.strokeRect(8, 8, w - 16, h - 16); x.beginPath(); x.moveTo(w / 2, 8); x.lineTo(w / 2, h - 8); x.stroke();
    x.beginPath(); x.arc(w / 2, h / 2, 22, 0, Math.PI * 2); x.stroke();
  });
  TEX.snake = () => canvasTex(256, 32, (x, w, h) => {   // 百步蛇菱形紋
    x.fillStyle = "#6B3A22"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 32) { x.fillStyle = "#F0D9A8"; x.beginPath(); x.moveTo(i, h / 2); x.lineTo(i + 16, 3); x.lineTo(i + 32, h / 2); x.lineTo(i + 16, h - 3); x.fill(); x.fillStyle = "#1C1A1A"; x.beginPath(); x.moveTo(i + 8, h / 2); x.lineTo(i + 16, 9); x.lineTo(i + 24, h / 2); x.lineTo(i + 16, h - 9); x.fill(); }
  });
}
function tplane(w, h, tex, x, y, z, ry = 0, rx = 0, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.9 }, opts || {})));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, "YXZ"); m.receiveShadow = true; return m;
}
function stadiumShape(L, R, holeR) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -R); s.lineTo(L / 2, -R); s.absarc(L / 2, 0, R, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-L / 2, R); s.absarc(-L / 2, 0, R, Math.PI / 2, Math.PI * 1.5, false);
  if (holeR) {
    const p = new THREE.Path(); p.moveTo(-L / 2, -holeR); p.absarc(-L / 2, 0, holeR, Math.PI * 1.5, Math.PI / 2, true); p.lineTo(L / 2, holeR); p.absarc(L / 2, 0, holeR, Math.PI / 2, -Math.PI / 2, true); p.lineTo(-L / 2, -holeR);
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s, 24); g.rotateX(-Math.PI / 2); return g;
}
const TRACK = { cx: -0.14, cz: 4.2, L: 8.2, R: 2.7 };
function trackPoint(t, lane) {
  const L = TRACK.L, R = lane, per = 2 * L + 2 * Math.PI * R, d = ((t % 1) + 1) % 1 * per;
  let x, z, yaw;
  if (d < L) { x = -L / 2 + d; z = R; yaw = Math.PI / 2; }
  else if (d < L + Math.PI * R) { const a = (d - L) / R; x = L / 2 + Math.sin(a) * R; z = Math.cos(a) * R; yaw = Math.PI / 2 + a; }
  else if (d < 2 * L + Math.PI * R) { x = L / 2 - (d - L - Math.PI * R); z = -R; yaw = -Math.PI / 2; }
  else { const a = (d - 2 * L - Math.PI * R) / R; x = -L / 2 - Math.sin(a) * R; z = -Math.cos(a) * R; yaw = -Math.PI / 2 + a; }
  return { x: x + TRACK.cx, z: z + TRACK.cz, yaw };
}
function palm(h) {
  const g = new THREE.Group(), segs = 6, bend = 0.045; let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const sh = h / segs, a = bend * i, seg = part(cyl(0.08 - i * 0.004, 0.1 - i * 0.004, sh * 1.04, 10), mat("palmtrunk", "#A29A88", { map: rockTex() }), x + Math.sin(a) * sh / 2, y + Math.cos(a) * sh / 2, 0, 0, 0, -a);
    g.add(seg); x += Math.sin(a) * sh; y += Math.cos(a) * sh;
  }
  const frondMat = mat("palm", "#3F8048", { side: THREE.DoubleSide });
  for (let i = 0; i < 10; i++) {
    const geo = new THREE.PlaneGeometry(0.42, 1.7, 2, 10), pp = geo.attributes.position;
    for (let k = 0; k < pp.count; k++) { const v = pp.getY(k) + 0.85; pp.setX(k, pp.getX(k) * Math.sin(Math.PI * Math.min(1, v / 1.7 + 0.08))); pp.setZ(k, -0.42 * v * v + Math.abs(pp.getX(k)) * 0.25); }
    geo.translate(0, 0.85, 0); geo.rotateX(-Math.PI / 2 + 0.55); geo.computeVertexNormals();
    g.add(part(geo, frondMat, x, y, 0, 0, i / 10 * Math.PI * 2 + (i % 2) * 0.2, 0));
  }
  g.add(part(sph(0.13, 10, 8), mat("palmtrunk", "#A29A88"), x, y - 0.05, 0));
  return g;
}
/* ---------- 排灣族、魯凱族的小物件 ---------- */
function potteryJar(s = 1) {    // 排灣族陶壺
  const pts = [[0, 0], [0.18, 0.02], [0.34, 0.14], [0.42, 0.34], [0.38, 0.55], [0.22, 0.7], [0.15, 0.78], [0.18, 0.86], [0.16, 0.88]].map(p => new THREE.Vector2(p[0] * s, p[1] * s));
  const g = new THREE.Group(); ensureTex();
  g.add(part(new THREE.LatheGeometry(pts, 20), mat("jar", "#8A4F2E", { roughness: 0.75 })));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.405 * s, 0.415 * s, 0.1 * s, 24, 1, true), new THREE.MeshStandardMaterial({ map: rep(TEX.snake(), 3), roughness: 0.8 }));
  band.position.y = 0.4 * s; band.userData.noMerge = true; g.add(band);
  return g;
}
function lilies(n, spread, seed) {    // 百合花：排灣族、魯凱族的榮耀象徵
  const g = new THREE.Group(), r = mulberry(seed), petal = mat("lily", "#FBFAF4", { side: THREE.DoubleSide }), stem = mat("lilystem", "#4E8F45");
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * spread, z = (r() - 0.5) * spread * 0.6, h = 0.35 + r() * 0.2;
    g.add(part(cyl(0.012, 0.015, h, 4), stem, x, h / 2, z));
    const f = part(new THREE.CylinderGeometry(0.09, 0.015, 0.16, 6, 1, true), petal, x + 0.04, h + 0.02, z, 0, 0, -1.0); g.add(f);
  }
  return g;
}
function totemPillar(h = 1.6, w = 0.32) {
  ensureTex(); const t = TEX.totem(); t.repeat.set(1, h / 1.6);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const m = new THREE.Mesh(box(w, h, w), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })); m.position.y = h / 2; m.castShadow = true; m.userData.noMerge = true;
  return m;
}
/* ---------- 校舍 ---------- */
const concrete = () => mat("concrete", "#B6B4AF", { map: plasterTex() });
function darkBars(g, x0, x1, y, z, h, step = 0.13) {
  const bar = M("#3A3D40");
  g.add(part(box(x1 - x0, 0.035, 0.035), bar, (x0 + x1) / 2, y + h, z));
  for (let x = x0; x <= x1 + 0.001; x += step) g.add(part(box(0.022, h, 0.022), bar, x, y + h / 2, z));
}
function diamondLamp(g, x, y, z) {
  const l = part(new THREE.OctahedronGeometry(0.11, 0), winMat, x, y, z); l.scale.set(1, 1.15, 0.5); g.add(l);
}
function preschool() {   // 灰色新式幼兒園大樓：露天樑架、太陽能板、外掛樓梯
  const g = new THREE.Group(), L = 5.6, Dp = 2.8, H = 1.25, C = concrete();
  g.add(part(box(L, 0.12, Dp), C, 0, 0.06, 0));
  g.add(part(box(L - 0.4, H * 2, Dp - 1.0), C, 0, H, -0.5));
  [H, H * 2].forEach(y => g.add(part(box(L + 0.1, 0.18, Dp), C, 0, y, 0)));
  [-L / 2 + 0.15, -0.9, 0.95, L / 2 - 0.15].forEach(x => { g.add(part(box(0.32, H * 2, 0.32), C, x, H, Dp / 2 - 0.16)); g.add(part(box(0.32, H * 2, 0.32), C, x, H, -Dp / 2 + 0.16)); });
  [-2.0, -0.4, 1.4].forEach(x => { g.add(win(x, 0.6, -0.5 + (Dp - 1.0) / 2 + 0.02, 0.7, 0.5)); g.add(win(x, H + 0.62, -0.5 + (Dp - 1.0) / 2 + 0.02, 0.7, 0.5)); });
  g.add(part(box(0.5, 0.95, 0.04), M("#2B2D30"), 0.2, 0.55, -0.5 + (Dp - 1.0) / 2 + 0.03));
  darkBars(g, -L / 2 + 0.2, L / 2 - 0.2, H + 0.09, Dp / 2 - 0.05, 0.5);
  // 屋頂：左邊是露天樑架，右邊是太陽能板與欄杆
  [[-L / 2 + 0.15, -0.6], [-0.6, -0.6]].forEach(() => {});
  [-L / 2 + 0.15, -1.2, -0.2].forEach(x => { g.add(part(box(0.26, 1.0, 0.26), C, x, H * 2 + 0.5, Dp / 2 - 0.2)); g.add(part(box(0.26, 1.0, 0.26), C, x, H * 2 + 0.5, -Dp / 2 + 0.2)); });
  g.add(part(box(2.8, 0.2, 0.24), C, -1.35, H * 2 + 1.0, Dp / 2 - 0.2)); g.add(part(box(2.8, 0.2, 0.24), C, -1.35, H * 2 + 1.0, -Dp / 2 + 0.2));
  [-2.4, -1.7, -1.0, -0.3].forEach(x => g.add(part(box(0.16, 0.16, Dp - 0.3), C, x, H * 2 + 1.0, 0)));
  const panel = mat("solar", "#24324A", { roughness: 0.3, metalness: 0.4 });
  [[0.8, -0.35], [2.0, 0.45]].forEach(([x, z]) => { const p = part(box(1.15, 0.05, 1.0), panel, x, H * 2 + 0.75, z, 0.32, 0, 0); g.add(p); g.add(part(cyl(0.025, 0.025, 0.65, 5), M("#C9CCD0"), x, H * 2 + 0.42, z)); });
  const rail = M("#C9CCD0");
  [[0.1, Dp / 2 - 0.1], [L / 2 - 0.1, Dp / 2 - 0.1], [L / 2 - 0.1, -Dp / 2 + 0.1], [0.1, -Dp / 2 + 0.1]].forEach(([x, z]) => g.add(part(cyl(0.025, 0.025, 1.0, 5), rail, x, H * 2 + 0.6, z)));
  [Dp / 2 - 0.1, -Dp / 2 + 0.1].forEach(z => g.add(part(box(L / 2 - 0.2, 0.03, 0.03), rail, L / 4, H * 2 + 1.1, z)));
  g.add(part(box(0.03, 0.03, Dp - 0.2), rail, L / 2 - 0.1, H * 2 + 1.1, 0));
  // 外掛樓梯
  const run = 2.0, ang = Math.atan2(H, run), st = part(box(Math.hypot(run, H), 0.14, 0.75), C, 1.65, H / 2, Dp / 2 + 0.42, 0, 0, ang); g.add(st);
  for (let i = 0; i < 8; i++) g.add(part(box(0.25, 0.08, 0.74), C, 0.65 + i * 0.25, 0.1 + i * H / 8, Dp / 2 + 0.42));
  darkBars(g, 0.7, 2.6, 0.1, Dp / 2 + 0.79, 0.45, 0.2);
  // 卡通黑板與菱形壁燈
  g.add(tplane(1.3, 0.95, TEX.kids(), -1.75, 0.65, -0.5 + (Dp - 1.0) / 2 + 0.03));
  [-2.3, -0.9, 0.95, 2.3].forEach(x => { diamondLamp(g, x, H - 0.25, Dp / 2); diamondLamp(g, x, H * 2 - 0.25, Dp / 2); });
  return g;
}
function classroomWing(len, withTotems) {   // 白磁磚舊教室：粉紅柱、黑底白圓紋飾帶
  const g = new THREE.Group(), H = 1.2, tile = mat("tilewall", "#FFFFFF", { map: rep(TEX.tile(), len / 1.2, 2) });
  g.add(part(box(len, 0.12, 2.2), M("#BDB9B0"), 0, 0.06, 0.2));
  g.add(part(box(len, H * 2, 1.3), tile, 0, H, -0.35));
  g.add(part(box(len + 0.1, 0.14, 2.2), M("#F2F0EA"), 0, H, 0.2));
  for (let x = -len / 2 + 0.2; x <= len / 2 - 0.1; x += 1.2) g.add(part(cyl(0.11, 0.11, H, 10), mat("pinktile", "#FFFFFF", { map: rep(TEX.pinkTile(), 2, 3) }), x, H / 2, 1.18));
  for (let x = -len / 2 + 0.6; x < len / 2 - 0.3; x += 0.8) { g.add(win(x, 0.62, 0.32, 0.55, 0.42)); g.add(win(x, H + 0.6, 0.32, 0.55, 0.42)); }
  const band = rep(TEX.band(), len / 1.8); g.add(tplane(len, 0.42, band, 0, H + 0.33, 1.31));
  g.add(part(box(len, 0.42, 0.04), M("#F2F0EA"), 0, H + 0.33, 1.28));
  g.add(part(box(len, 0.05, 0.06), M("#FFFFFF"), 0, H + 0.62, 1.29));
  for (let x = -len / 2; x <= len / 2; x += 0.18) g.add(part(box(0.03, 0.12, 0.03), M("#FFFFFF"), x, H + 0.57, 1.29));
  g.add(part(box(len + 0.4, 0.12, 2.5), roofMat("#57595C"), 0, H * 2 + 0.06, 0.15, -0.05));
  g.add(part(box(len + 0.42, 0.1, 0.05), M("#3E8E7E"), 0, H * 2 + 0.02, 1.42));
  if (withTotems) withTotems.forEach(x => { const t = totemPillar(H * 2, 0.3); t.position.set(x, 0, 1.2); g.add(t); });
  return g;
}
function gableHall(L = 6.0) {   // 斜屋頂大樓：石板基座、排灣紋飾帶
  const g = new THREE.Group(), Dp = 2.3, H = 1.2, wall = concrete();
  g.add(part(box(L + 0.3, 0.75, Dp + 0.3), mat("slate", "#7D7A73", { map: rockTex() }), 0, 0.375, 0));
  g.add(part(box(0.5, 0.45, 0.04), M("#55575A"), 0.8, 0.3, Dp / 2 + 0.16));
  g.add(part(box(L, H * 2, Dp), wall, 0, 0.75 + H, 0));
  for (let x = -L / 2 + 0.6; x < L / 2 - 0.2; x += 1.15) { g.add(win(x, 0.75 + 0.6, Dp / 2 + 0.02, 0.7, 0.5)); g.add(win(x, 0.75 + H + 0.62, Dp / 2 + 0.02, 0.7, 0.5)); }
  for (let x = -L / 2 + 0.05; x <= L / 2; x += 1.15) g.add(part(box(0.18, H * 2, 0.08), wall, x, 0.75 + H, Dp / 2 + 0.05));
  g.add(tplane(L, 0.3, rep(TEX.band(), L / 1.5), 0, 0.75 + H + 0.08, Dp / 2 + 0.1));
  g.add(part(box(L, 0.06, 0.08), M("#C8342B"), 0, 0.78, Dp / 2 + 0.17));
  const roof = gable(L + 0.9, 1.1, Dp + 1.3); g.add(part(roof, roofMat("#4A4846"), 0, 0.75 + H * 2, 0));
  g.add(part(box(0.9, 0.9, 1.4), wall, -L / 2 - 0.3, 0.75 + H * 1.5, 0.3));
  return g;
}
function playground() {
  const g = new THREE.Group(), teal = M("#2A9D9A"), red = M("#C8423B"), blue = M("#2F6FB0");
  [[0, 0], [1.6, 0], [0, 1.2], [1.6, 1.2]].forEach(([x, z]) => g.add(part(cyl(0.05, 0.05, 1.5, 6), teal, x, 0.75, z)));
  g.add(part(box(1.7, 0.06, 0.06), blue, 0.8, 1.5, 0)); g.add(part(box(1.7, 0.06, 0.06), blue, 0.8, 1.5, 1.2));
  for (let i = 0; i < 6; i++) g.add(part(box(0.02, 1.0, 1.2), red, 0.2 + i * 0.25, 0.9, 0.6));
  [[2.3, 0.2], [2.6, 0.9], [2.9, 0.4]].forEach(([x, z]) => { g.add(part(cyl(0.06, 0.06, 1.1, 6), teal, x, 0.55, z)); g.add(part(new THREE.TorusGeometry(0.16, 0.06, 6, 12), M("#2B2B2B"), x, 0.25, z + 0.12)); });
  g.add(part(box(3.4, 0.03, 1.8), M("#9E9A92"), 1.3, 0.02, 0.6));
  return g;
}
function hoop() {
  const g = new THREE.Group();
  g.add(part(cyl(0.06, 0.06, 1.6, 6), M("#3FB04C"), 0, 0.8, 0));
  g.add(part(box(0.06, 0.06, 0.4), M("#2F6FB0"), 0, 1.55, 0.2));
  g.add(part(box(0.7, 0.45, 0.04), M("#FFFFFF"), 0, 1.75, 0.42));
  g.add(part(new THREE.TorusGeometry(0.13, 0.015, 6, 14), M("#E07B1F"), 0, 1.55, 0.6, Math.PI / 2));
  return g;
}
function car(col) {
  const g = new THREE.Group();
  g.add(part(new THREE.CapsuleGeometry(0.3, 0.8, 4, 10), M(col), 0, 0.32, 0, 0, 0, Math.PI / 2)); g.children[0].scale.set(1, 0.75, 1.05);
  g.add(part(box(0.75, 0.3, 0.56), M(col), -0.08, 0.6, 0)); g.add(part(box(0.68, 0.24, 0.58), mat("cglass", "#2E3A46", { roughness: 0.2, metalness: 0.3 }), -0.08, 0.61, 0));
  [[-0.42, 0.3], [0.42, 0.3], [-0.42, -0.3], [0.42, -0.3]].forEach(([x, z]) => g.add(part(cyl(0.14, 0.14, 0.1, 12), M("#1E1E1E"), x, 0.14, z, Math.PI / 2)));
  return g;
}
function scooter(col) {
  const g = new THREE.Group();
  g.add(part(box(0.55, 0.22, 0.16), M(col), 0, 0.22, 0)); g.add(part(box(0.06, 0.38, 0.06), M("#2B2B2B"), 0.26, 0.4, 0)); g.add(part(box(0.04, 0.04, 0.3), M("#2B2B2B"), 0.26, 0.6, 0));
  [-0.22, 0.24].forEach(x => g.add(part(cyl(0.09, 0.09, 0.05, 10), M("#1E1E1E"), x, 0.09, 0, Math.PI / 2)));
  return g;
}
function redRoofHouse() {
  const g = new THREE.Group();
  g.add(part(box(3.0, 1.0, 1.8), mat("siding", "#E9E2CC", { map: plasterTex() }), 0, 0.5, 0));
  g.add(part(gable(3.4, 0.7, 2.3), roofMat("#C9573E"), 0, 1.0, 0));
  [-0.9, 0.2, 1.0].forEach(x => g.add(win(x, 0.55, 0.92, 0.4, 0.35)));
  return g;
}
function hillMound(root, x, z, r, h) {
  const geo = lumpy(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.12, 0.8, x + z);
  geo.scale(1, h / r, 1); root.add(part(geo, mat("forest", "#3F7A47", { map: grassTex() }), x, -0.05, z));
}
function fanBuilding() {   // 扇型樓：彎曲的馬賽克欄杆、粉紅磁磚柱
  const g = new THREE.Group(), H = 1.2, th0 = 0.05, thL = 1.55, R = 2.7;
  const tile = mat("tilewall", "#FFFFFF", { map: rep(TEX.tile(), 3, 2) });
  g.add(part(new THREE.CylinderGeometry(R - 0.9, R - 0.9, H * 2, 24, 1, false, th0, thL), tile, 0, H, 0));
  g.add(part(new THREE.CylinderGeometry(R + 0.15, R + 0.15, 0.14, 24, 1, false, th0, thL), M("#F2F0EA"), 0, H, 0));
  g.add(part(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.12, 24, 1, false, th0, thL), roofMat("#57595C"), 0, H * 2 + 0.06, 0));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.5, 28, 1, true, th0, thL), new THREE.MeshStandardMaterial({ map: rep(TEX.mosaic(), 3), side: THREE.DoubleSide, roughness: 0.85 }));
  band.position.y = H + 0.32; band.userData.noMerge = true; g.add(band);
  const pots = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.88, R - 0.88, 0.55, 24, 1, true, th0, thL), new THREE.MeshStandardMaterial({ map: rep(TEX.pots(), 3), roughness: 0.85 }));
  pots.position.y = 0.45; pots.userData.noMerge = true; g.add(pots);
  for (let k = 0; k <= 5; k++) { const a = th0 + thL * k / 5; g.add(part(cyl(0.11, 0.11, H, 10), mat("pinktile", "#FFFFFF"), Math.sin(a) * R, H / 2, Math.cos(a) * R)); }
  return g;
}
function simpleBlock(L, Dp, H, wallMat, roofCol) {
  const g = new THREE.Group();
  g.add(part(box(L, H, Dp), wallMat, 0, H / 2, 0));
  g.add(part(box(L + 0.3, 0.12, Dp + 0.3), roofMat(roofCol), 0, H + 0.06, 0));
  for (let x = -L / 2 + 0.5; x < L / 2 - 0.2; x += 0.8) g.add(win(x, H * 0.55, Dp / 2 + 0.02, 0.5, 0.42));
  return g;
}
function makeHub() {
  ensureTex();
  const root = new THREE.Group();
  floatingIsland(R_HUB, 3.6, root, 0, 0, { type: "hub" });
  const pave = new THREE.Mesh(new THREE.CircleGeometry(R_HUB - 0.6, 56), new THREE.MeshStandardMaterial({ map: rep(TEX.paving(), 10, 10), roughness: 0.95 }));
  pave.rotation.x = -Math.PI / 2; pave.position.y = 0.025; pave.receiveShadow = true; root.add(pave);

  // 後山（校園北側到東側），避開三座吊橋
  for (let a = -172; a <= 28; a += 13) {
    if ([-150, -90, -30].some(b => Math.abs(a - b) < 9)) continue;
    const t = a * Math.PI / 180, rr = R_HUB - 1.3, x = Math.cos(t) * rr, z = Math.sin(t) * rr;
    hillMound(root, x, z, 2.2 + (Math.abs(a) % 3) * 0.35, 1.5 + (Math.abs(a) % 2) * 0.6);
    const tr = tree(["c", "a", "b", "c"][Math.abs(Math.round(a / 13)) % 4], 1.3 + (Math.abs(a) % 3) * 0.2); tr.position.set(x * 1.03, 1.0, z * 1.03); root.add(tr);
  }
  [[-4.6, -12.0], [5.6, -11.4], [12.0, -3.2]].forEach(([x, z]) => { const p = palm(3.4); p.position.set(x, 1.0, z); root.add(p); });

  // 教室群：上排（一甲、三甲、五甲、六甲）、左排（圖書室、二甲、辦公室）、斜排（保健室、四甲、電腦教室）
  const Wtop = classroomWing(6.9, [-2.4, 0.8]); Wtop.position.set(-6.0, 0, -8.75); root.add(Wtop);
  const Wleft = classroomWing(3.8, null); Wleft.position.set(-8.3, 0, -5.7); Wleft.rotation.y = Math.PI / 2; root.add(Wleft);
  const Wdiag = classroomWing(4.2, [0.4]); Wdiag.position.set(-1.2, 0, -6.4); Wdiag.rotation.y = -1.23; root.add(Wdiag);
  const F = fanBuilding(); F.position.set(-0.6, 0, -4.6); root.add(F);
  const P1 = simpleBlock(2.2, 1.3, 1.25, concrete(), "#57595C"); P1.position.set(1.5, 0, -3.3); root.add(P1);   // 校長室、藝文教室
  // 中庭：大樹、花圃、百合、國旗、入口太陽牛角牆
  const ct = tree("c", 1.9); ct.position.set(-4.8, 0, -6.2); root.add(ct);
  [[-3.6, -5.0, 0, 2.4], [-5.8, -4.8, 0, 1.6]].forEach(q => { const b = bush(q[3], 1.1); b.position.set(q[0], 0.04, q[1]); root.add(b); for (let i = 0; i < q[3] * 3; i++) root.add(part(sph(0.05, 6, 5), M("#E2412F"), q[0] - q[3] / 2 + i / 3 + 0.1, 0.4 + (i % 2) * 0.08, q[1] + 0.15)); });
  const lil = lilies(14, 2.0, 7); lil.position.set(-3.0, 0.03, -6.4); root.add(lil);
  const flagX = -7.1, flagZ = -4.1;
  root.add(part(cyl(0.05, 0.05, 4.8, 6), M("#E8E8E8"), flagX, 2.4, flagZ));
  const fl = tplane(1.0, 0.66, TEX.roc(), flagX + 0.55, 4.4, flagZ, 0, 0, { side: THREE.DoubleSide }); fl.userData.noMerge = true; root.add(fl);
  const gate = new THREE.Group(); gate.position.set(-6.0, 0, -4.2); root.add(gate);
  gate.add(part(box(1.6, 0.9, 0.2), M("#F7F5F0"), 0, 0.45, 0)); gate.add(tplane(1.6, 0.8, TEX.gate(), 0, 0.5, 0.105));
  [-1, 1].forEach(s => gate.add(part(new THREE.TorusGeometry(0.28, 0.05, 6, 14, Math.PI * 0.8), M("#EFE8D8"), s * 0.25 - 0.45, 1.05, 0.05, 0, 0, s > 0 ? 0.2 : 2.6)));

  // 幼兒園舍（灰色新大樓）
  const P = preschool(); P.position.set(-6.4, 0, -1.6); root.add(P);
  // 多功能學習中心、教師宿舍（石板基座斜屋頂）
  const G = gableHall(4.8); G.position.set(4.9, 0, -0.9); G.rotation.y = -0.12; root.add(G);
  // 五育園：圓形花園，中間是陶壺
  root.add(part(cyl(1.6, 1.6, 0.12, 28), mat("grass", "#6DB052", { map: grassTex() }), 4.4, 0.06, -4.2));
  root.add(part(new THREE.TorusGeometry(1.6, 0.1, 6, 28), M("#BDB9B0"), 4.4, 0.12, -4.2, Math.PI / 2));
  const jar = potteryJar(1.4); jar.position.set(4.4, 0.1, -4.2); root.add(jar);
  const lil2 = lilies(10, 1.8, 21); lil2.position.set(4.4, 0.1, -3.4); root.add(lil2);

  // 東側擋土牆：「追求真善美的」與彩繪
  const wallPts = [[8.0, -4.6], [9.2, -1.6], [9.7, 1.4], [9.6, 3.6]];
  for (let i = 0; i < wallPts.length - 1; i++) {
    const [x0, z0] = wallPts[i], [x1, z1] = wallPts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const seg = new THREE.Group(); seg.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); seg.rotation.y = ang; root.add(seg);
    seg.add(part(box(len + 0.05, 2.2, 0.3), M("#6E6C68"), 0, 1.1, -0.15));
    const mt = TEX.mural(); mt.repeat.set(len / 9.6, 1); mt.offset.x = i * 0.34; mt.wrapS = THREE.RepeatWrapping;
    seg.add(tplane(len, 0.95, mt, 0, 0.5, 0.01));
    const sl = TEX.slogan(); sl.repeat.set(len / 9.6, 1); sl.offset.x = i * 0.34; sl.wrapS = THREE.RepeatWrapping;
    seg.add(tplane(len, 0.6, sl, 0, 1.55, 0.01));
  }
  // 操場：紅土跑道與草地
  const track = new THREE.Mesh(stadiumShape(TRACK.L, TRACK.R, TRACK.R - 0.95), mat("track", "#C9623F", { map: grassTex() })); track.position.set(TRACK.cx, 0.06, TRACK.cz); track.receiveShadow = true; root.add(track);
  [[TRACK.R + 0.05, TRACK.R - 0.02], [TRACK.R - 0.93, TRACK.R - 1.0]].forEach(([a, b]) => { const l = new THREE.Mesh(stadiumShape(TRACK.L, a, b), M("#F4F4F0")); l.position.set(TRACK.cx, 0.075, TRACK.cz); root.add(l); });
  const field = new THREE.Mesh(stadiumShape(TRACK.L, TRACK.R - 0.95, 0), mat("grass", "#6DB052", { map: grassTex() })); field.position.set(TRACK.cx, 0.065, TRACK.cz); field.receiveShadow = true; root.add(field);
  // 跳遠場、籃球場、遊戲器材區
  root.add(part(box(4.4, 0.04, 0.5), mat("track", "#C9623F"), -0.3, 0.05, 7.7));
  root.add(part(box(1.5, 0.08, 1.0), M("#E3CFA0"), 2.7, 0.05, 7.7));
  const court = tplane(4.0, 2.2, TEX.court(), 5.7, 0.05, 8.3, 0, -Math.PI / 2); court.userData.noMerge = true; root.add(court);
  [[3.9, 8.3, Math.PI / 2], [7.5, 8.3, -Math.PI / 2]].forEach(([x, z, r]) => { const h = hoop(); h.position.set(x, 0, z); h.rotation.y = r; root.add(h); });
  const pg = playground(); pg.position.set(7.2, 0, 4.4); pg.rotation.y = -1.35; root.add(pg);
  // 植草磚步道、大門、天堂路與行道樹、農田
  root.add(tplane(12.4, 1.0, rep(canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#6DA552"; x.fillRect(0, 0, w, h); x.fillStyle = "#B7B2A6"; for (let i = 0; i < w; i += 16) for (let j = 0; j < h; j += 16) x.fillRect(i + 2, j + 2, 12, 12); x.fillStyle = "#6DA552"; for (let i = 0; i < w; i += 16) for (let j = 0; j < h; j += 16) x.fillRect(i + 5, j + 5, 6, 6); }), 12, 1), -3.0, 0.045, 9.1, 0, -Math.PI / 2));
  [-6.0, -3.0].forEach(x => { root.add(part(box(0.4, 1.0, 0.4), M("#E9E4D8"), x, 0.5, 9.9)); root.add(part(box(0.5, 0.08, 0.5), M("#C8423B"), x, 1.04, 9.9)); });
  root.add(part(box(2.6, 0.5, 0.05), M("#8A8F96"), -4.5, 0.3, 9.95));
  root.add(part(box(17, 0.04, 1.3), M("#55585C"), 0, 0.04, 11.0));
  root.add(part(box(17, 0.045, 0.06), M("#F2F2EE"), 0, 0.045, 11.0));
  [-7.2, -4.4, 3.6, 6.4].forEach((x, i) => { const t = tree("a", 1.25 + (i % 2) * 0.15); t.position.set(x, 0, 12.2); root.add(t); });
  [[-3.4, 13.0], [3.0, 13.0]].forEach(([x, z]) => { root.add(part(box(3.4, 0.08, 1.2), mat("paddy", "#8DBE5A", { map: grassTex() }), x, 0.04, z)); root.add(part(box(3.5, 0.1, 0.08), M("#9A7A55"), x, 0.07, z)); });
  const rock = part(lumpy(new THREE.DodecahedronGeometry(0.85, 1), 0.12, 1.5, 3), mat("bigrock", "#8D8A84", { map: rockTex() }), 8.6, 0.85, 9.6); rock.scale.set(0.85, 1.35, 0.55); rock.rotation.y = -0.4; root.add(rock);
  const rt = tplane(0.9, 1.8, TEX.rockText(), 8.42, 0.95, 9.92, -0.4, 0, { transparent: true, alphaTest: 0.1 }); rt.userData.noMerge = true; root.add(rt);
  [[7.6, 7.2], [-1.6, 9.9]].forEach(([x, z]) => { root.add(part(cyl(0.05, 0.06, 2.6, 6), M("#C9CCD0"), x, 1.3, z)); root.add(part(box(0.7, 0.04, 0.45), mat("solar", "#24324A"), x, 2.65, z, 0.3)); });
  // 舊大門旁的身心障礙停車位、太陽能車棚、紅瓦屋
  const cp = new THREE.Group(); cp.position.set(-9.2, 0, 6.6); cp.rotation.y = Math.PI / 2; root.add(cp);
  [[-2.4, -0.9], [2.4, -0.9], [-2.4, 0.9], [2.4, 0.9], [0, -0.9], [0, 0.9]].forEach(([x, z]) => cp.add(part(cyl(0.06, 0.06, 1.5, 6), M("#4A4D52"), x, 0.75, z)));
  cp.add(part(box(5.3, 0.08, 2.2), mat("solar", "#24324A", { roughness: 0.3, metalness: 0.4 }), 0, 1.55, 0, 0.08));
  [["#F4F4F2", -1.6], ["#7A7F86", 0.2], ["#2F6FB0", 1.7]].forEach(([c, x]) => { const k = car(c); k.position.set(x, 0, 0.1); k.rotation.y = Math.PI / 2; cp.add(k); });
  ["#F2F2F2", "#2F6FB0", "#1E1E1E", "#4E9F50"].forEach((c, i) => { const s = scooter(c); s.position.set(-7.6, 0, 9.0 + i * 0.35); root.add(s); });
  root.add(part(box(0.9, 1.2, 0.6), M("#E8B53A"), -7.4, 0.6, 3.6));
  const pole = part(cyl(0.08, 0.08, 3.2, 8), mat("pole", "#FFFFFF", { map: canvasTex(32, 64, (x, w, h) => { for (let y = 0; y < h; y += 8) { x.fillStyle = (y / 8) % 2 ? "#1C1A1A" : "#F2C14E"; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y + 8); x.lineTo(w, y + 16); x.lineTo(0, y + 8); x.fill(); } }) }), -7.9, 1.6, 2.9); root.add(pole);
  const H1 = redRoofHouse(); H1.position.set(-12.0, 0, 2.6); H1.rotation.y = Math.PI / 2; root.add(H1);
  // 操場邊的樹
  [[-8.2, 2.0, "c", 1.4], [-6.0, 7.8, "a", 1.2], [-1.6, 1.0, "c", 1.0], [7.4, 1.6, "a", 1.2], [1.2, -0.8, "a", 1.0]].forEach(p => { const t = tree(p[2], p[3]); t.position.set(p[0], 0, p[1]); root.add(t); });
  mergeStatic(root);
  scene.add(root);
  islands.hub = { group: root, pos: new V3() };
}
/* ---------- 南迴線鐵路與火車 ---------- */
const RAIL_Z = -94, RAIL_Y = SEA_Y + 0.8;
function makeRailway() {
  const g = new THREE.Group();
  g.add(part(box(640, 0.35, 3.2), M("#9C9486"), 0, RAIL_Y + 0.17, RAIL_Z));
  const sl = canvasTex(64, 32, (x, w, h) => { x.fillStyle = "#8A8378"; x.fillRect(0, 0, w, h); x.fillStyle = "#5E5348"; for (let i = 0; i < w; i += 8) x.fillRect(i, 4, 4, h - 8); }); sl.wrapS = THREE.RepeatWrapping; sl.repeat.set(160, 1);
  const bed = tplane(640, 1.8, sl, 0, RAIL_Y + 0.36, RAIL_Z, 0, -Math.PI / 2); bed.userData.noMerge = true; g.add(bed);
  [-0.45, 0.45].forEach(dz => g.add(part(box(640, 0.08, 0.08), M("#6A6D70"), 0, RAIL_Y + 0.42, RAIL_Z + dz)));
  for (let x = -300; x <= 300; x += 12) { g.add(part(cyl(0.08, 0.1, 3.4, 6), M("#9AA0A6"), x, RAIL_Y + 1.9, RAIL_Z - 1.4)); g.add(part(box(0.1, 0.1, 1.6), M("#9AA0A6"), x, RAIL_Y + 3.4, RAIL_Z - 0.7)); }
  g.add(part(box(640, 0.03, 0.03), M("#3A3D40"), 0, RAIL_Y + 3.2, RAIL_Z));
  mergeStatic(g); scene.add(g);
}
function mTrain() {
  const g = new THREE.Group(), styles = [["#F4F4F2", "#E07B1F", "#3A3D42"], ["#F4F4F2", "#C8342B", "#2B2D30"], ["#E8ECEF", "#1F6FB2", "#2B2D30"]];
  const [body, stripe, win2] = pickR(styles), n = 6, CL = 7.4;
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group(); c.position.x = -i * (CL + 0.25);
    c.add(part(box(CL, 1.9, 1.5), M(body), 0, 1.25, 0));
    c.add(part(box(CL - 0.3, 0.42, 1.52), M(win2), 0, 1.55, 0));
    c.add(part(box(CL, 0.16, 1.52), M(stripe), 0, 1.05, 0));
    [-CL / 2 + 1.0, CL / 2 - 1.0].forEach(x => c.add(part(box(1.2, 0.35, 1.2), M("#2B2B2B"), x, 0.32, 0)));
    if (i === 0 || i === n - 1) {
      const nose = part(new THREE.CapsuleGeometry(0.72, 0.5, 6, 12), M(body), (i ? -1 : 1) * (CL / 2 + 0.25), 1.15, 0, 0, 0, Math.PI / 2); nose.scale.set(1, 1.25, 1); c.add(nose);
      c.add(part(box(0.5, 0.5, 1.3), M(win2), (i ? -1 : 1) * (CL / 2 + 0.45), 1.6, 0));
      const hl = glow("#FFF3C8", 2.2); hl.position.set((i ? -1 : 1) * (CL / 2 + 0.9), 0.95, 0); hl.userData.nav = true; c.add(hl);
    }
    g.add(c);
  }
  return { g, len: n * (CL + 0.25) };
}
/* ---------- 飛魚 ---------- */
function mFlyingFish() {
  const g = new THREE.Group(), body = mat("ffish", "#4A6E9A", { metalness: 0.4, roughness: 0.35 }), belly = mat("ffish-b", "#DDE6EE", { metalness: 0.3 });
  const b = part(new THREE.CapsuleGeometry(0.09, 0.42, 4, 10), body, 0, 0, 0, 0, 0, Math.PI / 2); g.add(b);
  const bb = part(new THREE.CapsuleGeometry(0.07, 0.34, 4, 8), belly, 0, -0.04, 0, 0, 0, Math.PI / 2); g.add(bb);
  const fin = mat("ffin", "#8FB6E0", { transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  [1, -1].forEach(s => { const f = shapeGeo([[0.12, 0], [-0.05, 0.55 * s], [-0.32, 0.48 * s], [-0.12, 0]]); f.rotateX(-Math.PI / 2); g.add(part(f, fin, 0, 0.02, 0)); });
  const tail = shapeGeo([[-0.28, 0], [-0.48, 0.16], [-0.42, 0], [-0.5, -0.2]]); g.add(part(tail, fin, 0, 0, 0));
  g.scale.setScalar(2.2); return g;
}

/* ---------- 吊橋 ---------- */
const bridges = [];
function ropeBridge(root, A, B, sag, width, g) {
  const L = A.distanceTo(B), N = Math.max(4, Math.round(L / 0.55)), dir = B.clone().sub(A).normalize();
  const yaw = Math.atan2(dir.x, dir.z), side = new V3(dir.z, 0, -dir.x);
  const point = t => A.clone().lerp(B, t).setY(0.04 + Math.sin(Math.PI * t) * sag);
  const wood = M("#C9A577"), rope = M("#8F7553");
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, p0 = point(t0), p1 = point(t1), mid = p0.clone().add(p1).multiplyScalar(0.5);
    const slope = Math.atan2(p1.y - p0.y, L / N);
    const plank = part(box(width, 0.08, L / N * 0.8), wood, mid.x, mid.y, mid.z); plank.rotation.set(-slope, yaw, 0, "YXZ"); root.add(plank);
    [-1, 1].forEach(sg => {
      const off = side.clone().multiplyScalar(sg * width / 2);
      const rl = part(box(0.04, 0.04, L / N * 1.05), rope, mid.x + off.x, mid.y + 0.48, mid.z + off.z); rl.rotation.set(-slope, yaw, 0, "YXZ"); root.add(rl);
      if (i % 3 === 0) root.add(part(box(0.06, 0.5, 0.06), rope, p0.x + off.x, p0.y + 0.25, p0.z + off.z));
    });
  }
  bridges.push({ root, point, yaw, g, L });
}
// 年級島之間的環狀吊橋：相鄰兩島最靠近的兩座科目小島相連，可以從一座樂學島走到下一座
function makeRingBridges() {
  const hb = new THREE.Group(), byAng = GRADES.map(g => g.n).sort((a, b) => ANG[a - 1] - ANG[b - 1]);
  const islet = (n, k) => { const a = ANG[n - 1] * Math.PI / 180, px = Math.cos(a) * D, pz = Math.sin(a) * D, th = Math.atan2(-px, -pz) + (36 + k * 32) * Math.PI / 180; return new V3(px + Math.sin(th) * RI, 0, pz + Math.cos(th) * RI); };
  byAng.forEach((n, i) => {
    const m = byAng[(i + 1) % byAng.length];
    let best = null;
    for (let k = 0; k < SUBJECTS.length; k++) for (let j = 0; j < SUBJECTS.length; j++) { const a = islet(n, k), b = islet(m, j), d = a.distanceTo(b); if (!best || d < best.d) best = { a, b, d }; }
    const dir = best.b.clone().sub(best.a).normalize();
    const A = best.a.clone().addScaledVector(dir, RS - 0.25), B = best.b.clone().addScaledVector(dir, -(RS - 0.25));
    ropeBridge(hb, A, B, 0.9, 1.1, 7);
    const side = new V3(dir.z, 0, -dir.x).multiplyScalar(0.75);
    [[A, dir.clone().multiplyScalar(-0.35)], [B, dir.clone().multiplyScalar(0.35)]].forEach(([P, back]) => [1, -1].forEach(sg => {
      const x = P.x + back.x + side.x * sg, z = P.z + back.z + side.z * sg;
      const tp = totemPillar(1.1, 0.22); tp.position.set(x, 0, z); tp.rotation.y = Math.atan2(dir.x, dir.z); scene.add(tp);
      hb.add(part(sph(0.1, 6, 5), winMat, x, 1.2, z));
    }));
  });
  mergeStatic(hb); scene.add(hb);
}
function makeHubBridges() {
  const hb = new THREE.Group();
  GRADES.forEach(gr => {
    const a = ANG[gr.n - 1] * Math.PI / 180, dir = new V3(Math.cos(a), 0, Math.sin(a));
    ropeBridge(hb, dir.clone().multiplyScalar(R_HUB - 0.2), dir.clone().multiplyScalar(D - RM + 0.2), 1.2, 1.4, 0);
    const lampA = dir.clone().multiplyScalar(R_HUB - 0.4), side = new V3(dir.z, 0, -dir.x).multiplyScalar(0.95);
    [1, -1].forEach(sg => { const tp = totemPillar(1.5, 0.3); tp.position.set(lampA.x + side.x * sg, 0, lampA.z + side.z * sg); tp.rotation.y = Math.atan2(dir.x, dir.z); scene.add(tp); hb.add(part(sph(0.12, 6, 5), winMat, lampA.x + side.x * sg, 1.62, lampA.z + side.z * sg)); });
  });
  mergeStatic(hb); scene.add(hb);
}
/* ---------- 遠方的大武山、嘉蘭村、燈塔 ---------- */
let mountainAnchor, seaAnchor, villageAnchor, lhBeam;
function mountainGeo(r, h, seed) {
  const g = new THREE.ConeGeometry(r, h, 72, 28, true), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const lo = new THREE.Color("#5E9A63"), mid = new THREE.Color("#3D7250"), rock = new THREE.Color("#8A8676"), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = (y + h / 2) / h;
    const n = n3(x * 0.045, y * 0.06, z * 0.045, seed) * 0.55 + n3(x * 0.13, y * 0.17, z * 0.13, seed * 2.3) * 0.28 + n3(x * 0.38, y * 0.4, z * 0.38, seed * 3.1) * 0.12;
    const k = 1 + n * 0.38 * (0.4 + t * 0.6); x *= k * 1.25; z *= k; y += n * h * 0.1 * t;
    p.setXYZ(i, x, y, z);
    tmp.copy(lo).lerp(mid, clamp(t * 1.25 + n * 0.35, 0, 1)); if (t > 0.78) tmp.lerp(rock, clamp((t - 0.78) / 0.22 + n * 0.3, 0, 1) * 0.7);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
function makeLand() {
  const land = new THREE.Group();
  [[-20, -160, 72, 37, "m2", 3], [50, -175, 66, 29, "m1", 5], [-95, -155, 60, 26, "m1", 7], [125, -165, 66, 23, "m2", 9], [-170, -150, 55, 18, "m3", 17], [190, -155, 60, 16, "m3", 19]]
    .forEach(m => { const c = part(mountainGeo(m[2], m[3], m[5]), mat("mtn", "#FFFFFF", { vertexColors: true }), m[0], m[3] / 2 + SEA_Y, m[1]); c.castShadow = false; land.add(c); });
  snowCap = part(cone(11.2, 5.5, 12), mat("snow", "#F7F9F8"), -20, 37 + SEA_Y - 2.7, -160); snowCap.visible = false; snowCap.userData.noMerge = true;
  const hit = new THREE.Mesh(cone(64, 52, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(-10, 18, -162); hit.scale.set(1.8, 1, 1); hit.userData = { pick: true, type: "lock", which: "mountain" }; pickables.push(hit); land.add(hit);
  land.add(part(box(620, 1.0, 120), mat("grass", "#D2E5B6"), 0, SEA_Y + 0.3, -150));
  land.add(part(box(620, 0.5, 8), M("#EFE3C2"), 0, SEA_Y + 0.15, -88));
  [[24, -97], [28, -100], [32, -96], [36, -99], [40, -97]].forEach((p, i) => {
    land.add(part(box(1.8, 1.2, 1.4), M(WALL), p[0], SEA_Y + 1.4, p[1]));
    land.add(part(gable(2.0, 0.7, 1.7), M(["#C9928A", "#A9A49B", "#D9A08F"][i % 3]), p[0], SEA_Y + 2.0, p[1]));
    land.add(win(p[0] - 0.4, SEA_Y + 1.4, p[1] + 0.71));
  });
  for (let i = 0; i < 24; i++) { const t = tree(["a", "pine", "c", "b"][i % 4], 1.7 + (i % 3) * 0.4); t.position.set(-115 + i * 10 + (i % 2) * 3, SEA_Y + 0.8, -104 - (i % 3) * 6); land.add(t); }
  mergeStatic(land); scene.add(land); scene.add(snowCap);
  mountainAnchor = new THREE.Object3D(); mountainAnchor.position.set(-20, 35, -160); scene.add(mountainAnchor);
  villageAnchor = new THREE.Object3D(); villageAnchor.position.set(32, 0.5, -98); scene.add(villageAnchor);
  const lh = new THREE.Group();
  lh.add(part(new THREE.DodecahedronGeometry(2.4, 1), M("#C9C2B2"), 0, SEA_Y + 0.6, 0));
  lh.add(part(cyl(0.55, 0.75, 3.2, 10), M("#FFFFFF"), 0, SEA_Y + 3.6, 0));
  lh.add(part(cyl(0.6, 0.6, 0.5, 10), M(soft("#C8423B")), 0, SEA_Y + 3.8, 0));
  lh.add(part(cyl(0.45, 0.45, 0.6, 10), winMat, 0, SEA_Y + 5.5, 0));
  lh.add(part(cone(0.6, 0.6, 10), M(soft("#C8423B")), 0, SEA_Y + 6.1, 0));
  mergeStatic(lh); lh.position.set(-58, 0, 60); scene.add(lh);
  const lhit = new THREE.Mesh(cyl(3, 3, 9, 8), new THREE.MeshBasicMaterial({ visible: false }));
  lhit.position.set(-58, 0, 60); lhit.userData = { pick: true, type: "lock", which: "sea" }; scene.add(lhit); pickables.push(lhit);
  seaAnchor = new THREE.Object3D(); seaAnchor.position.set(-58, 4, 60); scene.add(seaAnchor);
  // 燈塔夜間旋轉光束：兩道相對的光錐，掃過海面指引船隻
  const beamTex = canvasTex(8, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: "#FFE9A8", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const bg = new THREE.ConeGeometry(4.2, 46, 20, 1, true); bg.translate(0, -23, 0); bg.rotateZ(Math.PI / 2); bg.rotateZ(-0.05);
  lhBeam = new THREE.Group(); lhBeam.position.set(-58, SEA_Y + 5.5, 60);
  const b1 = new THREE.Mesh(bg, beamMat), b2 = new THREE.Mesh(bg, beamMat); b2.rotation.y = Math.PI; lhBeam.add(b1, b2);
  const lamp = glow("#FFE7A0", 3.2); lhBeam.add(lamp); lhBeam.userData = { mat: beamMat, lamp };
  lhBeam.visible = false; scene.add(lhBeam);
}
/* ---------- 居民、鯨魚、船、雲、台灣藍鵲 ---------- */
const SHIRTS = ["#E59A85", "#8CB6D6", "#EBCB7A", "#9CC59A", "#B7A0D6", "#FFFFFF", "#EFB27F", "#7FC2C0"];
function person(i) {
  const g = new THREE.Group(), shirt = M(SHIRTS[i % SHIRTS.length]), pants = M(["#4E5A66", "#3B4A63", "#5F5047"][i % 3]), skin = M(["#E3B48F", "#D7A47C", "#C99470"][i % 3]);
  g.add(part(new THREE.CapsuleGeometry(0.12, 0.2, 4, 10), shirt, 0, 0.57, 0));
  const legs = [-0.06, 0.06].map(x => { const l = new THREE.Group(); l.position.set(x, 0.4, 0); l.add(part(new THREE.CapsuleGeometry(0.048, 0.22, 3, 8), pants, 0, -0.17, 0)); l.add(part(box(0.09, 0.05, 0.14), M("#2E2B2A"), 0, -0.36, 0.02)); g.add(l); return l; });
  const arms = [-0.165, 0.165].map(x => { const a = new THREE.Group(); a.position.set(x, 0.7, 0); a.add(part(new THREE.CapsuleGeometry(0.033, 0.2, 3, 8), shirt, 0, -0.13, 0)); g.add(a); return a; });
  g.add(part(sph(0.115, 14, 12), skin, 0, 0.88, 0));
  g.add(part(new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), M("#2E2622"), 0, 0.9, -0.012));
  g.userData.legs = legs; g.userData.arms = arms; g.userData.ph = i * 1.3;
  g.scale.setScalar(1.12); return g;
}
function swing(o, t, amp) {
  const L = o.userData.legs; if (!L) return; const a = Math.sin(t * 9 + o.userData.ph) * amp;
  L[0].rotation.x = a; L[1].rotation.x = -a; o.userData.arms[0].rotation.x = -a * 0.8; o.userData.arms[1].rotation.x = a * 0.8;
}
function blueMagpie(s = 1) {
  const g = new THREE.Group(), blue = M("#2F67C4");
  const body = part(sph(0.17, 10, 8), blue, 0, 0.17, 0); body.scale.set(1.35, 1, 1); g.add(body);
  g.add(part(sph(0.11, 10, 8), M("#1C2233"), 0.2, 0.32, 0));
  g.add(part(cone(0.045, 0.14, 4), M("#D8322B"), 0.33, 0.32, 0, 0, 0, -Math.PI / 2));
  g.add(part(box(0.55, 0.04, 0.08), blue, -0.42, 0.18, 0, 0, 0, -0.25));
  g.add(part(box(0.1, 0.045, 0.085), M("#FFFFFF"), -0.69, 0.11, 0, 0, 0, -0.25));
  g.add(part(sph(0.03, 6, 4), M("#F7F1D6"), 0.26, 0.35, 0.08));
  g.scale.setScalar(1.25 * s); return g;
}
function whale() {
  const g = new THREE.Group(), c = M("#7E9AAA"), belly = M("#C9D6DB");
  const body = part(sph(1, 14, 10), c, 0, 0, 0); body.scale.set(3.2, 0.95, 1.15); g.add(body);
  const b2 = part(sph(1, 12, 8), belly, 0.3, -0.35, 0); b2.scale.set(2.6, 0.5, 0.9); g.add(b2);
  g.add(part(box(1.4, 0.12, 2.2), c, -3.6, 0.35, 0, 0, 0, 0.25));
  g.add(part(box(0.9, 0.08, 0.5), c, 0.8, -0.4, 1.0, 0.5, 0.3, 0)); g.add(part(box(0.9, 0.08, 0.5), c, 0.8, -0.4, -1.0, -0.5, -0.3, 0));
  const spout = new THREE.Group();
  [[0, 0.6, 0, 0.18], [0.1, 1.2, 0.15, 0.22], [-0.1, 1.25, -0.15, 0.2], [0, 1.6, 0, 0.16]].forEach(p => spout.add(part(sph(p[3], 6, 5), M("#FFFFFF"), p[0], p[1], p[2])));
  spout.position.set(1.4, 0.7, 0); g.add(spout);
  return { g, spout };
}
function boat(hull, withMascot) {
  const g = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(-1.6, 0); shape.lineTo(1.4, 0); shape.lineTo(1.9, 0.6); shape.lineTo(-1.8, 0.6); shape.closePath();
  const hg = new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: false }); hg.translate(0, -0.3, -0.65);
  g.add(part(hg, M(hull)));
  g.add(part(box(3.4, 0.12, 1.2), M("#F6F1E3"), 0, 0.33, 0));
  if (withMascot) {
    g.add(part(box(1.0, 0.7, 0.9), M("#FFFFFF"), -0.8, 0.75, 0));
    g.add(part(box(1.15, 0.12, 1.05), M(soft("#C8423B")), -0.8, 1.15, 0));
    const b = blueMagpie(2.4); b.position.set(0.7, 0.4, 0); g.add(b);
  } else {
    g.add(part(cyl(0.04, 0.04, 1.8, 4), M("#FFFFFF"), 0.3, 1.2, 0));
    const sail = new THREE.Shape(); sail.moveTo(0, 0); sail.lineTo(1.1, 0); sail.lineTo(0, 1.5); sail.closePath();
    g.add(part(new THREE.ShapeGeometry(sail), mat("sail", "#FFFFFF", { side: THREE.DoubleSide }), 0.35, 0.5, 0));
  }
  return g;
}
function cloud(s) {
  const g = new THREE.Group(), m = mat("cloud", "#FFFFFF", { flatShading: false, roughness: 1, transparent: true, opacity: 0.92 });
  [[0, 0, 0, 1.4], [1.3, -0.1, 0.2, 1.0], [-1.3, -0.15, -0.1, 1.05], [0.5, 0.45, -0.2, 0.9]].forEach(p => { const b = part(sph(p[3], 12, 8), m, p[0], p[1], p[2]); b.scale.y = 0.6; b.castShadow = false; g.add(b); });
  g.scale.setScalar(s); return g;
}
function makeLife() {
  let i = 0;
  bridges.forEach((b, k) => {
    const n = b.g === 0 ? 2 : (k % 3 === 0 ? 1 : 0);
    for (let j = 0; j < n; j++) { const p = person(i++); scene.add(p); walkers.push({ obj: p, kind: "bridge", b, t: Math.random(), v: (b.g ? 0.12 : 0.04 + Math.random() * 0.03) * (j ? 1 : -1) }); }
  });
  GRADES.forEach(g => {
    for (let k = 0; k < 2; k++) { const p = person(i++); scene.add(p); walkers.push({ obj: p, kind: "ring", c: islands[g.n].pos, r: 3.4 + k * 0.6, a: Math.random() * 6.28, v: (0.25 + Math.random() * 0.2) * (k % 2 ? 1 : -1) }); }
  });
  for (let k = 0; k < 6; k++) { const p = person(k % 2 ? 1 : 3); scene.add(p); walkers.push({ obj: p, kind: "track", t: k / 6 + (k % 3) * 0.02, lane: TRACK.R - 0.3 - (k % 2) * 0.45, v: 0.035 + (k % 3) * 0.006 }); }
  [[-4.0, -4.0], [-5.2, -5.4], [1.0, 9.6], [-8.0, 4.6], [6.4, 3.0], [3.0, -2.2]].forEach((q, k) => { const p = person(i++); p.position.set(q[0], 0.06, q[1]); p.rotation.y = k * 1.7; scene.add(p); });
  [[60, 0.03, 0], [66, -0.025, 2.2], [62, 0.028, 4.1]].forEach(w => { const o = whale(); scene.add(o.g); whales.push({ obj: o.g, spout: o.spout, r: w[0], v: w[1], a: w[2] }); });
  const m = boat("#E8E1CF", true); scene.add(m);
  mascot = { obj: m, r: 56, a: 1.2, v: 0.03 };
  const hit = new THREE.Mesh(box(5, 4, 3), new THREE.MeshBasicMaterial({ visible: false })); hit.userData = { pick: true, type: "mascot" }; m.add(hit); hit.position.y = 1; pickables.push(hit);
  [["#B8C8D4", 58, -0.02, 3.5], ["#D9C6A5", 64, 0.015, 5.3]].forEach(b => { const o = boat(b[0], false); scene.add(o); boats.push({ obj: o, r: b[1], v: b[2], a: b[3] }); });
  [[-40, 9, 20, 2.4], [44, 8, -14, 2.0], [20, 10, 46, 1.8], [-30, 7, -40, 2.2], [60, 11, 30, 2.6], [-62, 9, -6, 1.9]].forEach((c, k) => { const o = cloud(c[3]); o.position.set(c[0], c[1], c[2]); scene.add(o); clouds.push({ obj: o, base: c[0], k }); });
}
const BIRD_SPOTS = [];
function makeBirds() {
  const found = store("birds") || [];
  GRADES.forEach(g => {
    const I = islands[g.n], s = SUBJECTS[(g.n * 3) % 10], b = I.bld[s.key];
    BIRD_SPOTS.push(I.pos.clone().add(b.local).add(new V3(-Math.cos(b.th), 0, Math.sin(b.th)).multiplyScalar(1.55)).add(b.out.clone().multiplyScalar(-0.6)).setY(1.45));
  });
  BIRD_SPOTS.push(new V3(8.6, 2.05, 9.6), new V3(-58, SEA_Y + 6.5, 60), new V3(32, SEA_Y + 2.5, -98), new V3(0.75, 1.25, 17));
  BIRD_SPOTS.forEach((p, id) => {
    if (found.indexOf(id) >= 0) return;
    const b = blueMagpie(); b.position.copy(p); b.rotation.y = id * 1.3; scene.add(b);
    const hit = new THREE.Mesh(sph(0.75, 6, 5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(p).add(new V3(0, 0.2, 0)); hit.userData = { pick: true, type: "bird", id }; scene.add(hit); pickables.push(hit);
    birds.push({ id, obj: b, hit, base: p.y });
  });
}
/* ---------- 海面紋路、天空、日月 ---------- */
const SEA_COLORS = { spring: "#3FA2D6", summer: "#1E84CF", autumn: "#2276B6", winter: "#4C8BAE" };
const SHALLOW_COLORS = { spring: "#6FD0DA", summer: "#55C7D6", autumn: "#5CB9C9", winter: "#83BFCB" };
const WAVES = [[0.22, 0.8, 0.6, 0.2856, 0.9], [0.14, -0.5, 0.86, 0.571, 1.3], [0.07, 0.95, -0.3, 1.142, 2.0], [0.04, -0.2, -0.98, 2.09, 2.6]];
const WAVE = { u: { value: 0 } };
function waveH(x, z, t) { let h = 0; for (const w of WAVES) h += w[0] * Math.sin((w[1] * x + w[2] * z) * w[3] + t * w[4]); return h; }
function makeWater() {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256; const x = cv.getContext("2d");
  x.fillStyle = "#D2D2D2"; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = "rgba(255,255,255,.75)"; x.lineWidth = 2.4; x.lineCap = "round";
  for (let row = 0; row < 4; row++) {
    x.beginPath();
    for (let px = 0; px <= 256; px += 4) { const py = 32 + row * 64 + Math.sin(px / 256 * Math.PI * 4 + row) * 7; px ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  waterTex = new THREE.CanvasTexture(cv); waterTex.colorSpace = THREE.SRGBColorSpace; waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(16, 16); waterTex.anisotropy = 8;
  waterMat = new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.55, metalness: 0.1 });
  const terms = WAVES.map(w => `{ float ph = (${w[1].toFixed(3)} * wx + ${w[2].toFixed(3)} * wz) * ${w[3].toFixed(4)} + uT * ${w[4].toFixed(2)}; wh += ${w[0].toFixed(3)} * sin(ph); float c = ${w[0].toFixed(3)} * ${w[3].toFixed(4)} * cos(ph); hx += c * ${w[1].toFixed(3)}; hz += c * ${w[2].toFixed(3)}; }`).join("\n");
  waterMat.onBeforeCompile = sh => {
    sh.uniforms.uT = WAVE.u;
    sh.vertexShader = "uniform float uT;\n" + sh.vertexShader
      .replace("#include <beginnormal_vertex>", "float wx = position.x, wz = -position.y, wh = 0.0, hx = 0.0, hz = 0.0;\n" + terms + "\nvec3 objectNormal = normalize(vec3(-hx, hz, 1.0));")
      .replace("#include <begin_vertex>", "vec3 transformed = vec3(position); transformed.z += wh;");
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(360, 360, 220, 220), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = SEA_Y; water.receiveShadow = true; scene.add(water);
  const farTex = waterTex.clone(); farTex.repeat.set(70, 70); farTex.needsUpdate = true; waterFar = new THREE.MeshStandardMaterial({ map: farTex, roughness: 0.6, metalness: 0.1 });
  const far = new THREE.Mesh(new THREE.RingGeometry(170, 900, 64, 1), waterFar); far.rotation.x = -Math.PI / 2; far.position.y = SEA_Y - 0.05; scene.add(far);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), waterFar); under.rotation.x = -Math.PI / 2; under.position.y = SEA_Y - 0.6; scene.add(under);
}
let waterFar = null;
const skyClouds = [];
function cloudTexture(seed) {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128; const x = cv.getContext("2d"), rnd = mulberry(seed);
  for (let i = 0; i < 9; i++) {
    const cx = 50 + rnd() * 156, cy = 70 + (rnd() - 0.5) * 30, r = 22 + rnd() * 30;
    const g = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.7, "rgba(255,255,255,.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeSkyClouds() {
  const g = new THREE.Group(), rnd = mulberry(7), tex = [cloudTexture(1), cloudTexture(2), cloudTexture(3)];
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI * 0.95 + rnd() * Math.PI * 0.9, r = 300 + rnd() * 160, w = 90 + rnd() * 90;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 3], fog: false, transparent: true, depthWrite: false, opacity: 0.95 }));
    sp.position.set(Math.cos(a) * r, 40 + rnd() * 80, Math.sin(a) * r); sp.scale.set(w, w * 0.45, 1); sp.userData.o = 0.75 + rnd() * 0.25; sp.renderOrder = -1;
    g.add(sp); skyClouds.push(sp);
  }
  g.userData.spin = true; scene.add(g); return g;
}
let skyCloudGroup = null;
function makeSky() {
  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color("#BFDDE0") }, bottom: { value: new THREE.Color("#EEF3E8") } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.8 + 0.06, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.75)), 1.0);\n#include <colorspace_fragment>\n}"
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), skyMat); dome.renderOrder = -2; dome.userData.follow = true; scene.add(dome);
  const n = 700, pos = new Float32Array(n * 3), rnd = mulberry(42);
  for (let i = 0; i < n; i++) { const u = rnd() * Math.PI * 2, v = 0.08 + rnd() * 0.9, r = 650; pos[i * 3] = Math.cos(u) * Math.cos(v) * r; pos[i * 3 + 1] = Math.sin(v) * r; pos[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#FFFFFF", size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.userData.follow = true; scene.add(stars);
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), new THREE.MeshBasicMaterial({ color: "#FFE9A0", fog: false })); scene.add(sunMesh);
  moonCanvas = document.createElement("canvas"); moonCanvas.width = moonCanvas.height = 128;
  moonTex = new THREE.CanvasTexture(moonCanvas); moonTex.colorSpace = THREE.SRGBColorSpace;
  moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false }));
  moonSprite.scale.set(38, 38, 1); scene.add(moonSprite);
}
function drawMoon(k) {
  const x = moonCanvas.getContext("2d"), r = 50, c = 64; x.clearRect(0, 0, 128, 128);
  x.fillStyle = "#F6F1D5"; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.fill();
  const off = k <= 0.5 ? 4 * r * k : -4 * r * (1 - k);
  x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(c + off, c, r * 1.03, 0, Math.PI * 2); x.fill();
  x.globalCompositeOperation = "source-over"; moonTex.needsUpdate = true;
}
/* ---------- 季節粒子 ---------- */
function makeParticles(kind) {
  if (particles) { scene.remove(particles); particles.geometry.dispose(); particles = null; }
  particleKind = kind; if (!kind) return;
  const n = kind === "rain" ? 1000 : kind === "firefly" ? 120 : 260, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 130; pos[i * 3 + 1] = kind === "firefly" ? 0.4 + Math.random() * 3.5 : Math.random() * 30; pos[i * 3 + 2] = -50 + Math.random() * 110; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const cv = document.createElement("canvas"); cv.width = cv.height = 32; const cx = cv.getContext("2d");
  const gr = cx.createRadialGradient(16, 16, 2, 16, 16, 15); gr.addColorStop(0, "#fff"); gr.addColorStop(1, "rgba(255,255,255,0)"); cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
  const color = { petal: "#F4BFCD", leaf: "#E3A35C", firefly: "#F9F27A", rain: "#D6E6EE" }[kind];
  const m = new THREE.PointsMaterial({ color, size: kind === "rain" ? 0.18 : kind === "firefly" ? 0.5 : 0.45, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: kind === "firefly" ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0.9 });
  particles = new THREE.Points(geo, m); particles.visible = ui.fx; scene.add(particles);
}
function stepParticles(dt, time) {
  if (!particles || !ui.fx || ui.paused) return;
  const p = particles.geometry.attributes.position, k = particleKind;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (k === "firefly") { x += Math.sin(time * 0.8 + i) * dt * 0.6; y += Math.cos(time * 1.1 + i * 2) * dt * 0.3; }
    else if (k === "rain") { y -= dt * 28; x -= dt * 2; }
    else { y -= dt * (1.2 + (i % 5) * 0.25); x += Math.sin(time + i) * dt * 0.9 - dt * 0.6; z += Math.cos(time * 0.7 + i) * dt * 0.4; }
    if (y < SEA_Y) { y = 28; x = (Math.random() - 0.5) * 130; }
    p.setXYZ(i, x, y, z);
  }
  p.needsUpdate = true;
  if (k === "firefly") particles.material.opacity = 0.6 + Math.sin(time * 3) * 0.3;
}

/* ---------- 日夜四季套用到 3D（淡雅色調） ---------- */
let weather = null;
function applyTime() {
  S = computeState();
  const dark = S.dark, day = clamp(S.alt * 3, 0, 1);
  const wk = wxKind(), overcast = { clear: 0, cloudy: 0.4, rain: 0.55, storm: 0.78 }[wk];
  const skyTop = mix(S.sky[0], "#8E9BA6", overcast * (1 - dark)), skyBot = mix(S.sky[1], "#C9D0D4", overcast * (1 - dark));
  const rs = document.documentElement.style; rs.setProperty("--sky-top", skyTop); rs.setProperty("--sky-bot", skyBot);
  updateClock();
  document.body.classList.toggle("is-night", dark > 0.5);
  if (!webgl) return;
  skyMat.uniforms.top.value.set(skyTop); skyMat.uniforms.bottom.value.set(skyBot);
  const sea = SEA_COLORS[S.season];
  scene.fog.color.set(mix(skyBot, sea, 0.25 * (1 - dark)));
  const p = clamp(S.dayP, -0.1, 1.1);
  const sunDir = new V3(-Math.sin(Math.PI * p) * 0.55, Math.sin(Math.PI * clamp(p, 0, 1)) * 0.95 + (S.alt < 0 ? S.alt * 0.4 : 0), Math.cos(Math.PI * p)).normalize();
  const q = S.nightP, moonDir = new V3(-Math.sin(Math.PI * q) * 0.5, Math.sin(Math.PI * q) * 0.85 + 0.08, Math.cos(Math.PI * q)).normalize();
  sunMesh.userData.dir = sunDir; moonSprite.userData.dir = moonDir;
  sunMesh.visible = S.alt > -0.08; moonSprite.visible = dark > 0.3;
  sunMesh.material.color.set(S.alt < 0.15 ? "#FFC27A" : "#FFF0BC");
  if (dark > 0.3) drawMoon(S.moon);
  const lightDir = dark > 0.5 ? moonDir : sunDir;
  sunLight.position.copy(lightDir.clone().multiplyScalar(140));
  sunLight.color.set(dark > 0.5 ? "#AFC2FF" : mix("#FFC58F", "#FFF8EC", clamp(S.alt * 2.5, 0, 1)));
  sunLight.intensity = dark > 0.5 ? 0.5 : 0.5 + day * 1.5;
  hemi.color.set(dark > 0.5 ? "#5A6E9A" : "#F4F7EE"); hemi.groundColor.set(dark > 0.5 ? "#1A2238" : "#B9CFC4");
  hemi.intensity = dark > 0.5 ? 0.55 : 1.1 + day * 0.35;
  if (overcast) { sunLight.intensity *= 1 - overcast * 0.65; hemi.intensity *= 1 - overcast * 0.3; }
  ambient.intensity = 0.12 + (1 - dark) * 0.18;
  stars.material.opacity = clamp((dark - 0.35) / 0.5, 0, 1);
  waterMat.color.set(mix(mix(sea, "#6E8A9A", overcast), "#183A5C", clamp(dark * 1.05, 0, 1))); if (waterFar) waterFar.color.copy(waterMat.color);
  MAT.shallow && MAT.shallow.color.set(mix(SHALLOW_COLORS[S.season], "#2A5577", clamp(dark * 1.05, 0, 1)));
  document.body.style.background = mix(sea, "#183A5C", dark);
  skyClouds.forEach(c => { c.material.opacity = (dark > 0.5 ? 0.18 : 0.95) * c.userData.o; c.material.color.set(dark > 0.5 ? "#6C7896" : overcast ? "#D6DADD" : "#FFFFFF"); });
  const night = clamp((dark - 0.3) / 0.4, 0, 1);
  winMat.color.set(mix("#7896AA", "#FFE3A0", night)); winMat.emissive.set("#FFC45A"); winMat.emissiveIntensity = night * 1.5;
  if (MAT.cloud) MAT.cloud.color.set(mix("#FFFFFF", "#7C8AA8", night));
  if (S.season !== lastSeason && MAT.mtn) MAT.mtn.color.set({ spring: "#FFFFFF", summer: "#EEF8EA", autumn: "#FFF1D8", winter: "#E8EDEC" }[S.season]);
  if (S.season !== lastSeason) {
    lastSeason = S.season; const T = TREE_COLORS[S.season];
    ["a", "b", "c", "pine"].forEach(k => { MAT["tree-" + k] && MAT["tree-" + k].color.set(T[k]); MAT["tree-" + k + "-hi"] && MAT["tree-" + k + "-hi"].color.set(mix(T[k], "#F6F0B8", 0.22)); });
    MAT.grass && MAT.grass.color.set(T.grass);
    const L = { m1: mix(S.land.m1, "#7FA88F", 0.2), m2: mix(S.land.m2, "#6A9A80", 0.2), m3: mix(S.land.m3, "#8DB49A", 0.2) };
    ["m1", "m2", "m3"].forEach(k => MAT["mtn-" + k] && MAT["mtn-" + k].color.set(L[k]));
    snowCap.visible = S.season === "winter";
  }
  ambWeather(wk, dark);
  const want = wk === "rain" || wk === "storm" ? "rain" : S.season === "spring" ? "petal" : S.season === "autumn" ? "leaf" : S.season === "summer" && dark > 0.5 ? "firefly" : "";
  if (want !== particleKind) makeParticles(want);
}

/* ===================== 天空與海上的隨機事件、天氣現象 ===================== */
let wxOverride = null;           // null=即時, "clear" | "cloudy" | "rain" | "storm"
const WX_NAME = { clear: "晴天", cloudy: "陰天", rain: "下雨", storm: "雷陣雨" };
function wxKind() {
  if (wxOverride) return wxOverride;
  if (weather && weather.code != null) {
    const c = weather.code;
    return c >= 95 ? "storm" : (c >= 51 && !(c >= 71 && c <= 77)) ? "rain" : (c === 3 || (c >= 45 && c <= 48)) ? "cloudy" : "clear";
  }
  const t = twNow(), seed = (t.y * 400 + t.m * 31 + t.d) % 97;      // 沒有即時天氣：夏天午後偶爾雷陣雨
  if (S.season === "summer" && S.now >= 840 && S.now <= 1020 && seed % 4 === 0) return "storm";
  return seed % 5 === 0 ? "cloudy" : "clear";
}
const amb = { list: [], t: 0, nextSky: 6, nextSea: 10, nextBolt: 3, flash: 0, kind: "clear", lastStorm: -999, rainbowUntil: 0 };
const AMB_INFO = {
  eagle: "大冠鷲：臺灣中低海拔山區常見的猛禽，常乘著上升氣流在天空盤旋，翅膀下面有明顯的白色橫帶。",
  egret: "白鷺鷥：全身雪白的鳥，常在田野和水邊出現，喜歡成群飛行。",
  airliner: "民航客機：飛越臺灣東部上空的客機，飛得很高，有時會在後面拉出白色的飛機雲。",
  fighter: "戰鬥機：臺東有空軍志航基地，常常可以看到戰鬥機在天空飛行訓練。",
  tatala: "拼板舟：蘭嶼達悟族的傳統木船，用一塊塊木板拼合而成，船身畫著紅、白、黑三色的圖紋。",
  cargo: "貨櫃商船：載著一個個貨櫃的大船，在臺灣東部外海航行，把貨物運到世界各地。",
  fishing: "漁船：出海捕魚的漁船，東部海域有飛魚、鬼頭刀等漁獲。",
  turboprop: "螺旋槳客機：往返臺北和臺東的國內線小飛機，機翼在機身上方，有兩具螺旋槳。",
  helicopter: "直升機：可以停在空中、垂直起降。臺東的山區和離島，常靠直升機執行救護和搜救任務。",
  flyingfish: "飛魚：蘭嶼達悟族最重要的魚。每年春夏飛魚季，牠們成群躍出海面，張開像翅膀的胸鰭，可以在海面上滑翔很遠。",
  train: "南迴線火車：沿著臺東海岸行駛的火車。在太麻里附近，可以看到火車在山和海之間經過。",
  balloon: "熱氣球：臺東鹿野高台每年夏天都有熱氣球嘉年華，五顏六色的熱氣球飄在縱谷上空。"
};
const AMB_NAME = { eagle: "大冠鷲", egret: "白鷺鷥", airliner: "民航客機", turboprop: "螺旋槳客機", fighter: "戰鬥機", helicopter: "直升機", balloon: "熱氣球", train: "南迴線火車", tatala: "拼板舟", flyingfish: "飛魚", cargo: "貨櫃商船", fishing: "漁船" };
let stormClouds = [], mists = [], rainbow = null, flashEl = null;

function addHit(g, r, kind) {
  const h = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), new THREE.MeshBasicMaterial({ visible: false }));
  h.userData = { pick: true, type: "amb", kind }; g.add(h); pickables.push(h); return h;
}
function shapeGeo(pts, depth) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => s.lineTo(p[0], p[1])); s.closePath();
  return depth ? new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
}
function glow(color, size) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.scale.set(size, size, 1); return sp;
}
const glowTex = () => noiseTex("glow", (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); });

/* ---------- 模型 ---------- */
function mEagle() {
  const g = new THREE.Group(), brown = mat("eagle", "#4A3727"), tan = mat("eagle-t", "#B89A6E");
  const body = part(sph(0.5, 14, 10), brown, 0, 0, 0); body.scale.set(2.1, 0.62, 0.7); g.add(body);
  g.add(part(sph(0.3, 12, 10), mat("eagle-h", "#2E241B"), 1.05, 0.12, 0));
  g.add(part(cone(0.1, 0.32, 8), mat("beak", "#E2B23C"), 1.4, 0.07, 0, 0, 0, -Math.PI / 2));
  const tail = shapeGeo([[0, -0.3], [-1.25, -0.55], [-1.35, 0], [-1.25, 0.55], [0, 0.3]]); tail.rotateX(-Math.PI / 2);
  g.add(part(tail, mat("eagle-dbl", "#4A3727", { side: THREE.DoubleSide }), -0.7, 0.02, 0));
  const wings = [1, -1].map(sd => {
    const w = new THREE.Group(); w.position.set(0.15, 0.05, 0);
    const pts = [[0.55, 0], [0.75, 1.2], [0.6, 2.6], [0.35, 3.4], [0.1, 3.55], [-0.05, 3.3], [-0.2, 3.5], [-0.35, 3.2], [-0.5, 3.35], [-0.6, 2.9], [-0.7, 1.6], [-0.65, 0]];
    const geo = shapeGeo(pts.map(p => [p[0], p[1] * sd])); geo.rotateX(-Math.PI / 2);
    w.add(part(geo, mat("eagle-dbl", "#4A3727", { side: THREE.DoubleSide })));
    const band = shapeGeo([[0.1, 1.0], [0.2, 2.4], [-0.1, 2.5], [-0.25, 1.1]].map(p => [p[0], p[1] * sd])); band.rotateX(-Math.PI / 2); band.translate(0, -0.02, 0);
    w.add(part(band, mat("eagle-band", "#EDE6D6", { side: THREE.DoubleSide })));
    const cov = shapeGeo([[0.5, 0.2], [0.55, 1.4], [0.2, 1.6], [0.1, 0.2]].map(p => [p[0], p[1] * sd])); cov.rotateX(-Math.PI / 2); cov.translate(0, 0.02, 0);
    w.add(part(cov, mat("eagle-t2", "#7A5E42", { side: THREE.DoubleSide })));
    g.add(w); return w;
  });
  g.scale.setScalar(1.1);
  return { g, wings };
}
function mEgret() {
  const g = new THREE.Group(), white = mat("egret", "#F8F8F4", { side: THREE.DoubleSide });
  const b = part(sph(0.3, 12, 8), white, 0, 0, 0); b.scale.set(1.8, 0.6, 0.6); g.add(b);
  g.add(part(sph(0.13, 10, 8), white, 0.55, 0.1, 0)); g.add(part(cone(0.04, 0.32, 6), mat("beak", "#E2B23C"), 0.8, 0.08, 0, 0, 0, -Math.PI / 2));
  g.add(part(cyl(0.02, 0.02, 0.7, 4), mat("legs", "#2B2B2B"), -0.75, -0.02, 0, 0, 0, Math.PI / 2));
  const wings = [1, -1].map(sd => { const w = new THREE.Group(); const geo = shapeGeo([[0.25, 0], [0.15, 1.3 * sd], [-0.15, 1.45 * sd], [-0.3, 0]]); geo.rotateX(-Math.PI / 2); w.add(part(geo, white)); g.add(w); return w; });
  return { g, wings };
}
function mAirliner(livery) {
  const g = new THREE.Group(), white = mat("plane", "#F3F4F6"), dark = mat("plane-d", "#9AA3AD"), liv = M(livery);
  const fus = new THREE.CapsuleGeometry(0.85, 14, 6, 14); fus.rotateZ(Math.PI / 2); g.add(part(fus, white));
  const stripe = new THREE.CylinderGeometry(0.86, 0.86, 11, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9); stripe.rotateZ(Math.PI / 2); g.add(part(stripe, liv, -0.5, 0, 0));
  const wing = shapeGeo([[2.2, 0], [-1.6, 9], [-3.0, 9], [-2.0, 0]], 0.18); wing.rotateX(-Math.PI / 2);
  const wR = part(wing, white, 0, -0.25, 0); g.add(wR); const wL = wR.clone(); wL.scale.z = -1; g.add(wL);
  const st = shapeGeo([[-6.2, 0], [-7.6, 3.4], [-8.6, 3.4], [-8.4, 0]], 0.15); st.rotateX(-Math.PI / 2);
  const sR = part(st, white, 0, 0.2, 0); g.add(sR); const sL = sR.clone(); sL.scale.z = -1; g.add(sL);
  const fin = shapeGeo([[-5.6, 0.6], [-8.0, 4.4], [-8.9, 4.4], [-8.6, 0.6]], 0.16); g.add(part(fin, liv, 0, 0, -0.08));
  [2.9, -2.9].forEach(z => g.add(part(cyl(0.42, 0.42, 1.9, 12), dark, 0.6, -0.75, z, 0, 0, Math.PI / 2)));
  [[-1.9, 0.1, 9.1, "#FF3B30"], [-1.9, 0.1, -9.1, "#34C759"]].forEach(q => { const s = glow(q[3], 2.2); s.position.set(q[0], q[1], q[2]); s.userData.nav = true; g.add(s); });
  const strobe = glow("#FFFFFF", 3); strobe.position.set(-0.5, 1.0, 0); strobe.userData.strobe = true; g.add(strobe);
  const trailMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  const trails = [2.9, -2.9].map(z => { const geo = new THREE.BoxGeometry(1, 0.35, 0.35); geo.translate(-0.5, 0, 0); const t = new THREE.Mesh(geo, trailMat); t.position.set(-0.4, -0.75, z); t.scale.x = 0.01; g.add(t); return t; });
  return { g, trails, trailMat };
}
function mFighter() {
  const g = new THREE.Group(), grey = mat("jet", "#7F8992"), dark = mat("jet-d", "#4C555D");
  const fus = new THREE.CapsuleGeometry(0.42, 5.6, 5, 12); fus.rotateZ(Math.PI / 2); g.add(part(fus, grey));
  g.add(part(cone(0.42, 1.4, 12), grey, 3.6, 0, 0, 0, 0, -Math.PI / 2));
  const can = part(sph(0.36, 12, 8), mat("canopy", "#2E4052", { roughness: 0.2, metalness: 0.4 }), 1.8, 0.32, 0); can.scale.set(2.2, 0.7, 0.8); g.add(can);
  const wing = shapeGeo([[1.2, 0], [-1.6, 3.2], [-2.4, 3.2], [-2.2, 0]], 0.08); wing.rotateX(-Math.PI / 2);
  const wR = part(wing, grey, 0, -0.1, 0); g.add(wR); const wL = wR.clone(); wL.scale.z = -1; g.add(wL);
  const st = shapeGeo([[-2.4, 0], [-3.1, 1.3], [-3.6, 1.3], [-3.5, 0]], 0.06); st.rotateX(-Math.PI / 2);
  const sR = part(st, grey, 0, 0, 0); g.add(sR); const sL = sR.clone(); sL.scale.z = -1; g.add(sL);
  g.add(part(shapeGeo([[-1.8, 0.3], [-3.3, 1.9], [-3.8, 1.9], [-3.6, 0.3]], 0.08), dark, 0, 0, -0.04));
  const ab = glow("#FF9A3C", 2.2); ab.position.set(-3.6, 0, 0); g.add(ab);
  return { g };
}
function tatalaTex() {
  return noiseTex("tatala", (x, w, h) => {
    x.fillStyle = "#F4F0E6"; x.fillRect(0, 0, w, h);
    const band = (y, hh) => { x.fillStyle = "#1E1B1A"; x.fillRect(0, y, w, hh); x.fillStyle = "#C8342B"; for (let i = 0; i < w; i += 14) { x.beginPath(); x.moveTo(i, y + hh); x.lineTo(i + 7, y + 2); x.lineTo(i + 14, y + hh); x.fill(); } };
    band(h * 0.55, 18); band(h * 0.3, 10);
    [[w * 0.18, h * 0.62], [w * 0.82, h * 0.62]].forEach(([cx, cy]) => { [["#1E1B1A", 22], ["#F4F0E6", 17], ["#C8342B", 12], ["#F4F0E6", 7], ["#1E1B1A", 4]].forEach(([c, r]) => { x.fillStyle = c; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }); });
    x.fillStyle = "#C8342B"; x.fillRect(0, h * 0.9, w, h * 0.1);
  });
}
function mTatala() {
  const g = new THREE.Group();
  const prof = [[-3.3, 1.75], [-2.9, 0.9], [-2.3, 0.15], [2.3, 0.15], [2.9, 0.9], [3.3, 1.75], [2.9, 1.0], [2.5, 0.72], [-2.5, 0.72], [-2.9, 1.0]];
  const geo = shapeGeo(prof, 1.1); geo.translate(0, 0, -0.55);
  const tex = tatalaTex(); tex.repeat.set(1 / 6.6, 1 / 1.75); tex.offset.set(0.5, 0);
  g.add(part(geo, mat("tatala", "#FFFFFF", { map: tex })));
  [[-3.25, 1], [3.25, -1]].forEach(([x, sd]) => { g.add(part(cyl(0.03, 0.03, 0.7, 5), M("#1E1B1A"), x, 2.05, 0, 0, 0, sd * 0.25)); g.add(part(sph(0.13, 8, 6), M("#2B2622"), x - sd * 0.08, 2.42, 0)); });
  const rowers = [-1.4, -0.2, 1.0].map((x, i) => {
    const p = person(i + 2); p.scale.setScalar(0.95); p.position.set(x, 0.18, 0); p.rotation.y = Math.PI / 2; g.add(p);
    const oar = new THREE.Group(); oar.position.set(x, 0.8, 0.55); oar.add(part(box(0.05, 1.6, 0.05), M("#8A6A48"), 0, -0.6, 0)); oar.add(part(box(0.06, 0.45, 0.2), M("#8A6A48"), 0, -1.35, 0)); g.add(oar);
    return oar;
  });
  return { g, rowers };
}
function mCargo() {
  const g = new THREE.Group(), L = 30;
  const hull = shapeGeo([[-L / 2, 0], [L / 2 - 3, 0], [L / 2 + 1, 2.6], [L / 2 + 1.5, 3.2], [-L / 2, 3.2]], 6); hull.translate(0, -1.2, -3);
  g.add(part(hull, mat("cargo-hull", "#24364F")));
  g.add(part(box(L - 1, 0.6, 6.05), mat("cargo-red", "#A33A32"), -0.5, -0.9, 0));
  const cols = ["#C8423B", "#2F7FC1", "#E07B1F", "#4E9F50", "#8A8F98", "#D6AE1E"], rnd = mulberry(Math.floor(Math.random() * 1000));
  for (let c = 0; c < 8; c++) for (let r = 0; r < 2; r++) for (let l = 0; l < 2 + Math.floor(rnd() * 3); l++)
    g.add(part(box(2.6, 1.15, 2.3), M(cols[Math.floor(rnd() * cols.length)]), -L / 2 + 8 + c * 2.75, 2.6 + l * 1.18, -1.25 + r * 2.5));
  g.add(part(box(4, 5.5, 5.4), M("#F2F2EE"), -L / 2 + 3, 4.7, 0));
  for (let y = 0; y < 3; y++) g.add(win(-L / 2 + 5.02, 3.4 + y * 1.4, 0, 0.05, 0.5));
  g.add(part(box(4.4, 0.25, 6.2), M("#F2F2EE"), -L / 2 + 3, 7.5, 0));
  g.add(part(cyl(0.6, 0.7, 2, 10), M("#C8423B"), -L / 2 + 2, 8.6, 0));
  const light = glow("#FFF3C8", 3); light.position.set(L / 2, 4, 0); light.userData.nav = true; g.add(light);
  return { g };
}
function mFishing() {
  const g = new THREE.Group();
  const hull = shapeGeo([[-3, 0], [2.4, 0], [3.6, 1.3], [-3, 1.3]], 2.0); hull.translate(0, -0.5, -1);
  g.add(part(hull, mat("fish-hull", "#F4F4F2"))); g.add(part(box(6.3, 0.25, 2.04), M("#2F6FB0"), 0, 0.3, 0));
  g.add(part(box(1.8, 1.2, 1.5), M("#F4F4F2"), -1.0, 1.4, 0)); g.add(part(box(2.0, 0.12, 1.7), M("#2F6FB0"), -1.0, 2.05, 0));
  g.add(win(-0.08, 1.5, 0, 0.05, 0.4));
  g.add(part(cyl(0.05, 0.05, 3.2, 5), M("#DDDDDD"), 0.6, 2.4, 0));
  [-1, 1].forEach(sd => g.add(part(cyl(0.03, 0.03, 4, 5), M("#BBBBBB"), 0.4, 2.2, sd * 1.2, sd * 0.9, 0, 0)));
  ["#C8423B", "#F2C14E", "#2F7FC1", "#4E9F50"].forEach((c, i) => g.add(part(box(0.02, 0.28, 0.4), M(c), 0.6 - i * 0.55, 3.6 - i * 0.35, 0)));
  const light = glow("#FFF3C8", 2.6); light.position.set(0.6, 4, 0); light.userData.nav = true; g.add(light);
  return { g };
}

function mTurboprop() {
  const g = new THREE.Group(), white = mat("plane", "#F3F4F6"), liv = M("#1F6FB2"), dark = mat("plane-d", "#9AA3AD");
  const fus = new THREE.CapsuleGeometry(0.62, 9, 6, 14); fus.rotateZ(Math.PI / 2); g.add(part(fus, white));
  const st = new THREE.CylinderGeometry(0.63, 0.63, 8, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9); st.rotateZ(Math.PI / 2); g.add(part(st, liv, -0.3, 0, 0));
  const wing = shapeGeo([[1.0, 0], [0.4, 8.5], [-0.8, 8.5], [-1.2, 0]], 0.14); wing.rotateX(-Math.PI / 2);
  const wR = part(wing, white, 0, 0.62, 0); g.add(wR); const wL = wR.clone(); wL.scale.z = -1; g.add(wL);
  g.add(part(shapeGeo([[-3.8, 0.4], [-5.5, 3.0], [-6.3, 3.0], [-5.9, 0.4]], 0.12), liv, 0, 0, -0.06));
  const ht = shapeGeo([[-5.6, 0], [-6.0, 2.4], [-6.6, 2.4], [-6.5, 0]], 0.1); ht.rotateX(-Math.PI / 2);
  const hR = part(ht, white, 0, 2.95, 0); g.add(hR); const hL = hR.clone(); hL.scale.z = -1; g.add(hL);
  const props = [];
  [2.6, -2.6].forEach(z => {
    g.add(part(cyl(0.3, 0.32, 1.8, 10), dark, 0.6, 0.45, z, 0, 0, Math.PI / 2));
    const p = new THREE.Group(); p.position.set(1.55, 0.45, z);
    for (let k = 0; k < 6; k++) p.add(part(box(0.04, 1.2, 0.12), M("#2B2B2B"), 0, 0, 0, k / 6 * Math.PI, 0, 0));
    g.add(p); props.push(p);
  });
  return { g, props };
}
function mHeli() {
  const g = new THREE.Group(), body = M("#F4F4F2"), red = M("#C8423B");
  const b = part(sph(1, 16, 12), body, 0, 0, 0); b.scale.set(1.9, 1.0, 0.95); g.add(b);
  const stripe = part(new THREE.SphereGeometry(1.01, 16, 12, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.12), red, 0, 0, 0); stripe.scale.set(1.9, 1.0, 0.95); g.add(stripe);
  const glass = part(sph(0.75, 12, 10), mat("canopy", "#2E4052", { roughness: 0.2, metalness: 0.4 }), 1.2, 0.2, 0); glass.scale.set(1, 0.8, 1.05); g.add(glass);
  g.add(part(cyl(0.18, 0.32, 4, 10), body, -2.8, 0.3, 0, 0, 0, Math.PI / 2 - 0.05));
  g.add(part(box(0.7, 1.1, 0.08), red, -4.7, 0.8, 0));
  const tail = new THREE.Group(); tail.position.set(-4.75, 0.9, 0.12); [0, Math.PI / 2].forEach(r => tail.add(part(box(0.06, 1.1, 0.1), M("#2B2B2B"), 0, 0, 0, 0, 0, r))); g.add(tail);
  [0.75, -0.75].forEach(z => { g.add(part(box(2.6, 0.08, 0.1), M("#5A5D62"), 0, -1.25, z)); g.add(part(box(0.08, 0.5, 0.08), M("#5A5D62"), 0.6, -1.0, z)); g.add(part(box(0.08, 0.5, 0.08), M("#5A5D62"), -0.6, -1.0, z)); });
  g.add(part(cyl(0.12, 0.12, 0.5, 8), M("#5A5D62"), 0, 1.15, 0));
  const rotor = new THREE.Group(); rotor.position.y = 1.42;
  for (let k = 0; k < 4; k++) rotor.add(part(box(5.2, 0.04, 0.3), M("#2B2B2B"), 2.6 * Math.cos(k * Math.PI / 2) * 0, 0, 0, 0, k * Math.PI / 4, 0));
  g.add(rotor);
  const blink = glow("#FF3B30", 1.6); blink.position.set(0, -0.9, 0); g.add(blink);
  return { g, rotor, tail, blink };
}
function balloonTex(cols) {
  return canvasTex(256, 128, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(i * 16, 0, 16, h); } x.fillStyle = "rgba(255,255,255,.85)"; x.fillRect(0, h * 0.45, w, 10); });
}
function mBalloon() {
  const g = new THREE.Group(), palettes = [["#E2573B", "#F2C14E", "#2F7FC1"], ["#8A5CC2", "#F2A9BE", "#FFFFFF"], ["#4E9F50", "#F2C14E", "#E07B1F"], ["#1F6FB2", "#FFFFFF", "#C8423B"]];
  const env = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 18), new THREE.MeshStandardMaterial({ map: balloonTex(pickR(palettes)), roughness: 0.8 }));
  env.scale.set(1, 1.18, 1); env.position.y = 5.2; env.castShadow = true; g.add(env);
  const neck = part(new THREE.CylinderGeometry(1.2, 0.5, 1.6, 16, 1, true), mat("bneck", "#D9C9A8", { side: THREE.DoubleSide }), 0, 1.9, 0); g.add(neck);
  g.add(part(box(0.9, 0.7, 0.9), M("#8A6A48"), 0, 0, 0));
  [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]].forEach(([x, z]) => g.add(part(cyl(0.015, 0.015, 1.2, 4), M("#5A4A3A"), x * 1.1, 0.85, z * 1.1, z * 0.3, 0, -x * 0.3)));
  const fire = glow("#FFB45A", 1.8); fire.position.y = 1.2; g.add(fire);
  return { g, fire };
}

/* ---------- 產生與移動 ---------- */
const rr = (a, b) => a + Math.random() * (b - a);
function spawn(kind, announce) {
  const night = S.dark > 0.5, near = !!announce;
  const o = { kind, age: 0, life: 60 };
  if (kind === "eagle") {
    const m = mEagle(); o.g = m.g; o.wings = m.wings;
    o.c = near ? new V3(rr(-30, 10), rr(18, 24), rr(-30, 0)) : new V3(rr(-60, 40), rr(26, 40), rr(-110, -30)); o.r = rr(14, 24); o.a = rr(0, 6.28); o.w = rr(0.12, 0.2) * (Math.random() < 0.5 ? 1 : -1); o.life = rr(35, 55);
    o.update = (dt, t) => {
      o.a += o.w * dt; const leave = o.age > o.life - 12; if (leave) { o.c.x += 9 * dt; o.c.y += 1.5 * dt; }
      o.g.position.set(o.c.x + Math.cos(o.a) * o.r, o.c.y + Math.sin(t * 0.4) * 1.5, o.c.z + Math.sin(o.a) * o.r);
      o.g.rotation.set(Math.sign(o.w) * 0.32, -o.a - Math.sign(o.w) * Math.PI / 2, 0, "YXZ");
      const flap = (Math.sin(t * 0.7) > 0.85) ? Math.sin(t * 9) * 0.35 : 0.06; o.wings[0].rotation.x = -flap; o.wings[1].rotation.x = flap;
    };
  } else if (kind === "egret") {
    o.g = new THREE.Group(); o.birds = [];
    for (let i = 0; i < 6; i++) { const b = mEgret(); b.g.position.set(-Math.abs(i - 2.5) * 1.6, rr(-0.4, 0.4), (i - 2.5) * 1.5); b.ph = rr(0, 6); o.g.add(b.g); o.birds.push(b); }
    const fromLeft = Math.random() < 0.5; o.p = new V3((fromLeft ? -1 : 1) * (near ? 60 : 150), rr(14, 22), near ? rr(-20, 10) : rr(-80, 30)); o.v = new V3(fromLeft ? 9 : -9, 0, rr(-1.5, 1.5)); o.g.rotation.y = Math.atan2(-o.v.z, o.v.x); o.life = 36;
    o.update = (dt, t) => { o.p.addScaledVector(o.v, dt); o.g.position.copy(o.p); o.birds.forEach(b => { const f = Math.sin(t * 7 + b.ph) * 0.7; b.wings[0].rotation.x = -f; b.wings[1].rotation.x = f; }); };
  } else if (kind === "airliner") {
    const m = mAirliner(["#1F6FB2", "#0E8A7E", "#C8423B", "#5B4BA6"][Math.floor(Math.random() * 4)]); o.g = m.g; o.trails = m.trails; o.trailMat = m.trailMat;
    const dir = Math.random() < 0.5 ? 1 : -1, z = rr(-200, -60); o.p = new V3(-dir * (near ? 130 : 320), rr(85, 110), z); o.v = new V3(dir * 26, 0, rr(-3, 3));
    o.g.rotation.y = Math.atan2(-o.v.z, o.v.x); o.life = 26; o.contrail = !night && wxKind() === "clear";
    o.update = (dt, t) => {
      o.p.addScaledVector(o.v, dt); o.g.position.copy(o.p);
      o.trails.forEach(tr => { tr.visible = o.contrail; tr.scale.x = Math.min(o.age * 26, 160); });
      o.g.children.forEach(c => { if (c.userData.strobe) c.visible = (t % 1.2) < 0.08; if (c.userData.nav) c.visible = true; });
    };
  } else if (kind === "fighter") {
    o.g = new THREE.Group(); [[0, 0, 0], [-6, -0.6, 5]].forEach(q => { const m = mFighter(); m.g.position.set(q[0], q[1], q[2]); o.g.add(m.g); });
    const a = rr(0, Math.PI * 2), sp = 62; o.v = new V3(Math.cos(a) * sp, 0, Math.sin(a) * sp); o.p = new V3(-Math.cos(a) * (near ? 130 : 260), rr(24, 38), -Math.sin(a) * (near ? 130 : 260) - 30);
    o.g.rotation.set(0, Math.atan2(-o.v.z, o.v.x), 0, "YXZ"); o.life = 9;
    o.update = (dt, t) => { o.p.addScaledVector(o.v, dt); o.g.position.copy(o.p); o.g.rotation.x = Math.sin(o.age * 0.6) * 0.25; };
  } else if (kind === "train") {
    const m = mTrain(); o.g = m.g; const dir = Math.random() < 0.5 ? 1 : -1, sp = 22;
    o.p = new V3(-dir * (near ? 110 : 330), RAIL_Y + 0.45, RAIL_Z); o.v = new V3(dir * sp, 0, 0); o.g.rotation.y = dir > 0 ? 0 : Math.PI; o.life = (660 + m.len) / sp;
    o.update = (dt, t) => { o.p.addScaledVector(o.v, dt); o.g.position.copy(o.p); o.g.children.forEach(c => c.children.forEach(k => { if (k.userData.nav) k.visible = S.dark > 0.35; })); };
  } else if (kind === "flyingfish") {
    o.g = new THREE.Group(); o.fish = [];
    const a = near ? Math.PI * 0.45 : rr(0.15, 0.85) * Math.PI, r0 = near ? 58 : rr(58, 72), dir = Math.random() < 0.5 ? 1 : -1;
    o.g.position.set(Math.cos(a) * r0, 0, Math.sin(a) * r0); o.g.rotation.y = Math.atan2(Math.cos(a) * dir, -Math.sin(a) * dir) - Math.PI / 2;
    for (let i = 0; i < 8; i++) { const f = mFlyingFish(); f.userData = { fwd: rr(-4, 4), side: rr(-3, 3), off: Math.random(), sp: rr(0.45, 0.6) }; o.g.add(f); o.fish.push(f); }
    o.life = 13;
    o.update = (dt, t) => o.fish.forEach(f => {
      const u = f.userData, ph = (o.age * u.sp + u.off) % 1, air = ph < 0.5, s = ph / 0.5;
      f.visible = air && o.age < o.life - 0.5;
      f.position.set(u.fwd + o.age * 5, SEA_Y + 0.1 + (air ? Math.sin(Math.PI * s) * 1.7 : -1), u.side);
      f.rotation.z = air ? Math.cos(Math.PI * s) * 0.45 : 0;
    });
  } else if (kind === "turboprop") {
    const m = mTurboprop(); o.g = m.g; o.props = m.props;
    const dir = Math.random() < 0.5 ? 1 : -1; o.p = new V3(-dir * (near ? 110 : 260), rr(48, 66), rr(-120, -30)); o.v = new V3(dir * 16, 0, rr(-2, 2));
    o.g.rotation.y = Math.atan2(-o.v.z, o.v.x); o.life = 32;
    o.update = (dt, t) => { o.p.addScaledVector(o.v, dt); o.g.position.copy(o.p); o.props.forEach(p => { p.rotation.x += dt * 40; }); };
  } else if (kind === "helicopter") {
    const m = mHeli(); o.g = m.g; o.rotor = m.rotor; o.tail = m.tail; o.blink = m.blink;
    const a = rr(0, Math.PI * 2); o.p = new V3(Math.cos(a) * (near ? 70 : 140), rr(18, 28), Math.sin(a) * (near ? 70 : 140) - 20);
    o.target = new V3(-Math.cos(a) * 140 + rr(-30, 30), o.p.y, -Math.sin(a) * 140 - 20); o.v = o.target.clone().sub(o.p).setLength(11); o.life = 26;
    o.g.rotation.set(0, Math.atan2(-o.v.z, o.v.x), 0, "YXZ");
    o.update = (dt, t) => { o.p.addScaledVector(o.v, dt); o.g.position.copy(o.p); o.g.position.y += Math.sin(t * 1.3) * 0.3; o.g.rotation.z = -0.12; o.rotor.rotation.y += dt * 28; o.tail.rotation.z += dt * 40; o.blink.visible = (t % 1) < 0.15; };
  } else if (kind === "balloon") {
    const m = mBalloon(); o.g = m.g; o.fire = m.fire;
    o.p = new V3(rr(-90, -40), rr(24, 34), rr(-130, -70)); if (near) o.p.set(rr(-40, -20), 22, rr(-40, -20)); o.v = new V3(rr(1.2, 2.0), 0, rr(0.2, 0.6)); o.life = 120;
    o.update = (dt, t) => { o.p.addScaledVector(o.v, dt); o.g.position.copy(o.p); o.g.position.y += Math.sin(t * 0.25) * 1.2; o.g.rotation.y += dt * 0.05; o.fire.visible = (t % 6) < 1.2; };
  } else {
    const fromLeft = Math.random() < 0.5, lanes = { tatala: [[72, 84], [-80, -72]], cargo: [[76, 86], [-79, -77]], fishing: [[72, 86], [-80, -72]] };
    const ln = lanes[kind][Math.floor(Math.random() * 2)], z = rr(ln[0], ln[1]);
    const sp = { tatala: 2.6, cargo: 4.2, fishing: 6 }[kind];
    o.p = new V3((fromLeft ? -1 : 1) * (near ? 75 : 190), SEA_Y, z); o.v = new V3(fromLeft ? sp : -sp, 0, 0); o.life = 380 / sp;
    const m = kind === "tatala" ? mTatala() : kind === "cargo" ? mCargo() : mFishing(); o.g = m.g; o.rowers = m.rowers;
    o.g.rotation.y = fromLeft ? 0 : Math.PI;
    o.update = (dt, t) => {
      o.p.addScaledVector(o.v, dt); o.g.position.set(o.p.x, SEA_Y + (kind === "cargo" ? 0.9 : 0.05) + waveH(o.p.x, o.p.z, t) * (kind === "cargo" ? 0.3 : 1), o.p.z);
      o.g.rotation.z = (waveH(o.p.x + 1.5, o.p.z, t) - waveH(o.p.x - 1.5, o.p.z, t)) * (kind === "cargo" ? 0.02 : 0.25) * (fromLeft ? 1 : -1);
      o.g.rotation.x = (waveH(o.p.x, o.p.z + 1, t) - waveH(o.p.x, o.p.z - 1, t)) * (kind === "cargo" ? 0.02 : 0.3);
      if (o.rowers) o.rowers.forEach((r, i) => { r.rotation.z = Math.sin(t * 2.2 + i * 0.3) * 0.55; });
      o.g.children.forEach(c => { if (c.userData.nav) c.visible = S.dark > 0.4; });
    };
  }
  addHit(o.g, { train: 12, flyingfish: 5, airliner: 14, cargo: 16, fighter: 8, egret: 6, turboprop: 11, helicopter: 6, balloon: 7 }[kind] || 4, kind);
  scene.add(o.g); amb.list.push(o); o.update(0, amb.t);
  if (announce) toast(AMB_NAME[kind] + "出現了！點牠／它可以看說明。");
  return o;
}
function despawn(o) {
  scene.remove(o.g);
  o.g.traverse(c => { const i = pickables.indexOf(c); if (i >= 0) pickables.splice(i, 1); });
}
function pickWeighted(list) { const tot = list.reduce((a, x) => a + x[1], 0); let r = Math.random() * tot; for (const x of list) { if ((r -= x[1]) <= 0) return x[0]; } return list[0][0]; }
function stepAmbient(dt, time) {
  amb.t += dt;
  if (lhBeam) {   // 燈塔：天黑或暴風雨時亮起，每 8 秒轉一圈
    const on = clamp(Math.max((S.dark - 0.25) / 0.35, amb.kind === "storm" || amb.kind === "rain" ? 0.7 : 0), 0, 1);
    lhBeam.visible = on > 0.01;
    if (lhBeam.visible) { lhBeam.rotation.y -= dt * Math.PI * 2 / 8; lhBeam.userData.mat.opacity = on * 0.32; lhBeam.userData.lamp.material.opacity = on * (0.75 + 0.25 * Math.sin(time * 3)); }
  }
  const k = amb.kind, night = S.dark > 0.5;
  if (ui.fx) {
    if (amb.t > amb.nextSky) {
      amb.nextSky = amb.t + rr(22, 50);
      const skyCount = amb.list.filter(o => ["eagle", "egret", "airliner", "fighter"].includes(o.kind)).length;
      if (skyCount < 3) {
        const opts = night ? [["airliner", 3], ["turboprop", 1], ["fighter", 1], ["helicopter", 1]] : k === "storm" ? [["airliner", 2], ["helicopter", 1], [null, 2]] : k === "rain" ? [["airliner", 2], ["turboprop", 1.5], ["egret", 1], [null, 1]]
          : [["eagle", 3], ["egret", 2.5], ["airliner", 2], ["turboprop", 1.6], ["fighter", 1.3], ["helicopter", 1.5], ...(k === "clear" ? [["balloon", 1.2]] : [])];
        const pick = pickWeighted(opts); if (pick) spawn(pick);
      }
    }
    if (amb.t > amb.nextSea) {
      amb.nextSea = amb.t + rr(28, 60);
      const seaCount = amb.list.filter(o => ["tatala", "cargo", "fishing", "flyingfish"].includes(o.kind)).length;
      if (seaCount < 4) spawn(pickWeighted(k === "storm" ? [["cargo", 2], ["fishing", 1]] : night ? [["fishing", 3], ["cargo", 2]] : [["tatala", 3], ["fishing", 2.5], ["cargo", 2], ["flyingfish", 3]]));
    }
    if (amb.t > (amb.nextTrain || 15)) {
      amb.nextTrain = amb.t + rr(70, 140);
      if (!amb.list.some(o => o.kind === "train")) spawn("train");
    }
  }
  for (let i = amb.list.length - 1; i >= 0; i--) {
    const o = amb.list[i]; o.age += dt; o.update(dt, time);
    if (o.age > o.life || o.g.position.length() > 420) { despawn(o); amb.list.splice(i, 1); }
  }
  // 雷陣雨：閃電打在大武山一帶
  if (k === "storm" && ui.fx && amb.t > amb.nextBolt) { amb.nextBolt = amb.t + rr(3, 9); bolt(); }
  if (amb.flash > 0) {
    amb.flash = Math.max(0, amb.flash - dt * 5);
    if (flashEl) flashEl.style.opacity = (amb.flash * 0.35).toFixed(3);
  }
  ambient.intensity = amb.baseAmb + amb.flash * 2.2;
  stormClouds.forEach((c, i) => { c.position.x = c.userData.x + Math.sin(time * 0.02 + i) * 8; });
  mists.forEach((c, i) => { c.position.x = c.userData.x + Math.sin(time * 0.03 + i * 2) * 10; });
  if (rainbow) rainbow.visible = (amb.t < amb.rainbowUntil || rainbow.userData.natural) && amb.kind !== "storm" && amb.kind !== "rain" && S.dark < 0.5;
}
function bolt() {
  const x0 = rr(-110, 90), z0 = rr(-175, -130), top = new V3(x0 + rr(-10, 10), 70, z0 + rr(-8, 8)), bottom = new V3(x0, rr(5, 25), z0);
  const pts = [top]; for (let i = 1; i < 9; i++) { const p = top.clone().lerp(bottom, i / 9); p.x += rr(-5, 5); p.z += rr(-3, 3); pts.push(p); } pts.push(bottom);
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: "#EEF4FF", fog: false, transparent: true });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1), 40, 0.45, 5), m));
  const bi = 3 + Math.floor(Math.random() * 3), bp = [pts[bi]]; for (let i = 1; i < 4; i++) bp.push(pts[bi].clone().add(new V3(rr(3, 7) * i * (Math.random() < 0.5 ? 1 : -1) * 0.6, -i * 5, rr(-2, 2))));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 16, 0.25, 4), m));
  const gl = glow("#C9DBFF", 60); gl.position.copy(top).lerp(bottom, 0.5); g.add(gl);
  scene.add(g); amb.flash = 1;
  let n = 0; const flick = () => { n++; g.visible = n % 2 === 0; if (n < 5) setTimeout(flick, 70 + Math.random() * 60); else { scene.remove(g); g.traverse(c => { if (c.geometry) c.geometry.dispose(); }); } };
  setTimeout(flick, 90);
}
function makeAmbient() {
  flashEl = document.createElement("div"); flashEl.className = "flash"; document.getElementById("app").appendChild(flashEl);
  const tex = [cloudTexture(4), cloudTexture(5), cloudTexture(6)];
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 3], color: "#5F6873", transparent: true, depthWrite: false, opacity: 0 }));
    const x = -170 + i * 30 + rr(-8, 8); sp.position.set(x, rr(38, 62), rr(-175, -120)); sp.userData.x = x; const w = rr(90, 140); sp.scale.set(w, w * 0.5, 1);
    scene.add(sp); stormClouds.push(sp);
  }
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 3], color: "#FFFFFF", transparent: true, depthWrite: false, opacity: 0 }));
    const x = -150 + i * 36 + rr(-8, 8); sp.position.set(x, rr(10, 22), rr(-150, -120)); sp.userData.x = x; const w = rr(55, 80); sp.scale.set(w, w * 0.32, 1);
    scene.add(sp); mists.push(sp);
  }
  const rb = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: { op: { value: 0.32 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float op; varying vec2 vUv; vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); } void main(){ float v = vUv.y; float a = smoothstep(0.0,0.25,v)*smoothstep(1.0,0.75,v); gl_FragColor = vec4(hue(0.78 - v*0.78), a*op);\n#include <colorspace_fragment>\n}"
  });
  rainbow = new THREE.Mesh(new THREE.TorusGeometry(62, 3.2, 12, 80, Math.PI), rb); rainbow.visible = false; rainbow.renderOrder = -1; scene.add(rainbow);
  amb.baseAmb = ambient.intensity;
}
function ambWeather(k, dark) {
  if (k === "storm" && amb.kind !== "storm") amb.nextBolt = amb.t + 2;
  if (amb.kind === "storm" && k !== "storm") amb.lastStorm = amb.t;
  amb.kind = k; amb.baseAmb = ambient.intensity;
  const sc = k === "storm" ? 1 : k === "rain" ? 0.85 : k === "cloudy" ? 0.6 : 0;
  stormClouds.forEach(c => { c.material.opacity = sc; c.material.color.set(dark > 0.5 ? "#2E3442" : k === "storm" ? "#4C5561" : "#8E97A2"); });
  const morning = S.now >= S.sun.rise - 30 && S.now <= S.sun.rise + 150;
  const mo = k === "rain" || k === "storm" ? 0.55 : morning ? 0.4 : k === "cloudy" ? 0.25 : 0;
  mists.forEach(c => { c.material.opacity = mo * (dark > 0.5 ? 0.35 : 1); });
  if (rainbow) {
    const t = twNow(), seed = (t.y * 400 + t.m * 31 + t.d * 7) % 13;
    const sunLow = S.alt > 0.05 && S.alt < 0.55;
    rainbow.userData.natural = k === "clear" && sunLow && (amb.t - amb.lastStorm < 600 || (seed % 6 === 0 && S.now > 900));
    const sd = sunMesh.userData.dir || new V3(0, 0, 1), anti = new V3(-sd.x, 0, -sd.z);
    if (anti.z > -0.3) anti.set(anti.x * 0.5, 0, -1); anti.normalize();
    rainbow.position.copy(anti.multiplyScalar(165)).setY(-14); rainbow.lookAt(0, -14, 60);
  }
}

/* ---------- 鏡頭 ---------- */
const isMobile = () => innerWidth < 760;
const hasPanel = () => document.body.classList.contains("has-panel");
function viewPose(kind) {
  const a = innerWidth / innerHeight, portrait = a < 0.8;
  if (kind === "bird") return { target: new V3(isMobile() ? 0 : -6, 0, 2), pos: new V3(isMobile() ? 0 : -6, 140 * Math.max(1, 1.05 / a), 16) };
  const dir = (portrait ? new V3(0, 0.5, 0.87) : new V3(0, 0.355, 0.935)).normalize();
  const dist = portrait ? 96 * Math.max(1, 0.8 / a) : 112 * Math.max(1, 1.45 / a);
  const t = new V3(isMobile() ? 0 : -19, 0, portrait ? 2 : 5);
  return { target: t, pos: t.clone().add(dir.multiplyScalar(dist)) };
}
const panelMin = () => document.body.classList.contains("panel-min");
function shiftForPanel(target, pos) { if (!panelMin()) shiftRaw(target, pos); }
// 收合／展開右側卡片：鏡頭跟著平移，讓畫面主角保持在可見區域中央
function setPanelMin(min, animate = true) {
  const was = panelMin(); document.body.classList.toggle("panel-min", min);
  try { localStorage.setItem("jialan:panelMin", min ? "1" : "0"); } catch (e) {}
  const t = $("#panelTab"); if (t) { t.setAttribute("aria-expanded", String(!min)); t.title = min ? "展開卡片" : "收合卡片"; }
  if (animate && was !== min && webgl && hasPanel() && !tween.active) {
    const t0 = controls.target.clone(), p0 = camera.position.clone(), t1 = t0.clone(), p1 = p0.clone(); shiftRaw(t1, p1);
    const d = t1.sub(t0).multiplyScalar(min ? -1 : 1);
    flyTo({ target: t0.add(d), pos: p0.add(d) }, 0.6);
  }
}
function shiftRaw(target, pos) {
  const fwd = target.clone().sub(pos).normalize(), right = new V3().crossVectors(fwd, new V3(0, 1, 0)).normalize();
  if (!isMobile()) { const s = target.distanceTo(pos) * 0.18; target.add(right.clone().multiplyScalar(s)); pos.add(right.multiplyScalar(s)); }
  else { const s = target.distanceTo(pos) * 0.24; const flat = new V3(fwd.x, 0, fwd.z).normalize().multiplyScalar(-s); target.add(flat); pos.add(flat); }
}
function islandPose(n) {
  const P = islands[n].pos.clone(), out = P.clone().setY(0).normalize();
  const dir = new V3(0, 0, 1).lerp(out, 0.3).normalize();
  const target = P.clone(), pos = target.clone().add(dir.multiplyScalar(isMobile() ? 40 : 34)).add(new V3(0, isMobile() ? 50 : 40, 0));
  shiftForPanel(target, pos); return { target, pos };
}
function buildingPose(n, key) {
  const I = islands[n], b = I.bld[key], wp = I.pos.clone().add(b.local);
  const target = wp.clone().add(new V3(0, 0.8, 0)), pos = target.clone().add(b.out.clone().multiplyScalar(isMobile() ? 20 : 16)).add(new V3(0, isMobile() ? 17 : 13, 0));
  shiftForPanel(target, pos); return { target, pos };
}
function flyTo(pose, dur = 1.3) {
  if (!webgl) return;
  tween.active = true; tween.t = 0; tween.dur = reduceMotion ? 0.01 : dur;
  tween.p0 = camera.position.clone(); tween.t0 = controls.target.clone(); tween.p1 = pose.pos; tween.t1 = pose.target;
  controls.enabled = false;
}
function stepTween(dt) {
  if (!tween.active) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
  camera.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0, tween.t1, k);
  if (tween.t >= 1) { tween.active = false; controls.enabled = true; }
}
function zoomBy(f) {
  if (!webgl) return;
  const off = camera.position.clone().sub(controls.target).multiplyScalar(f), d = clamp(off.length(), controls.minDistance, controls.maxDistance);
  flyTo({ target: controls.target.clone(), pos: controls.target.clone().add(off.setLength(d)) }, 0.5); focus.flyKey = "";
}

/* ---------- 標籤 ---------- */
const labels = [];
function addLabel(obj, offY, kind, data, onClick) {
  const el = document.createElement("button");
  el.className = "lbl " + kind; el.type = "button";
  el.addEventListener("click", e => { e.stopPropagation(); stopTour(); onClick(); });
  $("#labels").appendChild(el);
  const L = { el, obj, offY, kind, data, mode: null }; labels.push(L); return L;
}
function labelMode(L) {
  if (L.kind !== "bld") return "fixed";
  if (focus.g === 0 || (focus.g && focus.g !== L.data.g)) return isOpen(L.data.g, L.data.key) ? "dot" : "hide";
  if (focus.g === L.data.g || camera.position.distanceTo(controls.target) < 70) return "full";
  return isOpen(L.data.g, L.data.key) ? "dot" : "hide";
}
function renderLabel(L, mode) {
  L.mode = mode; const d = L.data;
  if (L.kind === "bld") {
    const s = subjectOf(d.key), open = isOpen(d.g, d.key), ch = s.name[0];
    L.el.className = "lbl bld " + mode + (open ? " open" : "");
    L.el.style.setProperty("--s", s.color);
    L.el.setAttribute("aria-label", GRADES[d.g - 1].name + s.name + (open ? "" : "，建造中"));
    L.el.innerHTML = '<i>' + ch + '</i>' + (mode === "full" ? '<span>' + s.name + '</span>' + (open ? "" : "<small>建造中</small>") : "");
  } else if (L.kind === "grade") {
    if (!d.g) { L.el.innerHTML = '<span>嘉蘭國小</span>'; return; }
    const g = GRADES[d.g - 1], cnt = SUBJECTS.filter(s => isOpen(g.n, s.key)).length;
    L.el.style.setProperty("--g", g.color);
    L.el.innerHTML = '<i></i><span>' + g.name + '</span>' + (cnt ? "<small>" + cnt + "</small>" : "");
  } else if (L.kind === "lock") {
    L.el.innerHTML = '<span class="lk">' + ICON_LOCK + '</span>' + d.name + '<small>尚未開放</small>';
  } else L.el.innerHTML = d.name;
}
const _v = new V3();
function updateLabels() {
  const W = innerWidth, H = innerHeight;
  labels.forEach(L => {
    const m = labelMode(L); if (m !== L.mode) renderLabel(L, m);
    let show = (ui.names || L.kind === "bld") && L.mode !== "hide";
    if (L.kind === "grade" && L.data.g && focus.g === L.data.g && focus.key) show = false;
    if (!show) { L.el.style.visibility = "hidden"; return; }
    L.obj.getWorldPosition(_v); _v.y += L.offY; _v.project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { L.el.style.visibility = "hidden"; return; }
    L.el.style.visibility = "visible";
    L.el.style.transform = "translate(" + ((_v.x * 0.5 + 0.5) * W).toFixed(1) + "px," + ((-_v.y * 0.5 + 0.5) * H).toFixed(1) + "px) translate(-50%,-100%)";
  });
}
function makeLabels() {
  addLabel(islands.hub.group, 7.2, "grade", { g: 0 }, () => go("hub"));
  GRADES.forEach(g => {
    addLabel(islands[g.n].group, 4.6, "grade", { g: g.n }, () => go("g" + g.n));
    SUBJECTS.forEach(s => addLabel(islands[g.n].bld[s.key].anchor, 3.6, "bld", { g: g.n, key: s.key }, () => go("g" + g.n + "-" + s.key)));
  });
  addLabel(mountainAnchor, 3, "lock", { name: "大武山" }, () => lockMsg("mountain"));
  addLabel(seaAnchor, 3.2, "lock", { name: "太平洋" }, () => lockMsg("sea"));
  addLabel(villageAnchor, 3.2, "plain", { name: "嘉蘭村" }, () => toast("嘉蘭村：臺東縣金峰鄉，排灣族與魯凱族的家園。", true));
}
function refreshLabels() { labels.forEach(L => { L.mode = null; }); }
function lockMsg(w) {
  toast(ICON_LOCK.replace("<svg", '<svg width="22" height="22"') + (w === "mountain" ? "大武山尚未開放探險，敬請期待！" : "太平洋尚未開放探險，敬請期待！"), true);
}

/* ---------- 點選 ---------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let downAt = null;
function pickAt(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(pickables, false);
  if (!hits.length) return null;
  const pri = ["bird", "mascot", "building"];
  for (const t of pri) { const h = hits.find(x => x.object.userData.type === t); if (h) return h.object.userData; }
  return hits[0].object.userData;
}
function onPick(u) {
  if (!u) return;
  stopTour();
  if (u.type === "bird") return foundBird(u.id);
  if (u.type === "amb") { toast(AMB_INFO[u.kind], true); return; }
  if (u.type === "mascot") { speak("嗨！我是台灣藍鵲，歡迎來到嘉蘭樂學島！島上還躲著我的十個朋友，你找得到嗎？", { force: true }); toast("嗨！我是台灣藍鵲，島上還躲著我的十個朋友，你找得到嗎？"); return; }
  if (u.type === "lock") return lockMsg(u.which);
  if (u.type === "hub") return go("hub");
  if (u.type === "island") return go("g" + u.g);
  if (u.type === "building") return go("g" + u.g + "-" + u.key);
}
function foundBird(id) {
  const i = birds.findIndex(b => b.id === id); if (i < 0) return;
  const b = birds[i]; scene.remove(b.obj); scene.remove(b.hit); pickables.splice(pickables.indexOf(b.hit), 1); birds.splice(i, 1);
  const f = store("birds") || []; if (f.indexOf(id) < 0) f.push(id); store("birds", f);
  updateHint();
  const left = BIRD_SPOTS.length - f.length;
  toast(left ? "找到一隻台灣藍鵲！還有 " + left + " 隻躲在島上。" : "太厲害了！10 隻台灣藍鵲全部找到了！", true);
}

/* ---------- 初始化 3D ---------- */
function initWorld() {
  const canvas = $("#world");
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); }
  catch (e) { webgl = false; return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene(); scene.fog = new THREE.Fog("#CFE7F1", 160, 420);
  camera = new THREE.PerspectiveCamera(innerWidth / innerHeight < 0.8 ? 62 : 50, innerWidth / innerHeight, 0.5, 2000);
  const v = viewPose("pano"); camera.position.copy(v.pos);
  controls = new OrbitControls(camera, canvas);
  controls.target.copy(v.target); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 8; controls.maxDistance = 300; controls.maxPolarAngle = 1.32; controls.screenSpacePanning = false;
  controls.addEventListener("change", () => { const t = controls.target; if (t.length() > 80) t.setLength(80); if (t.y < -2) t.y = -2; if (t.y > 12) t.y = 12; });
  winMat = new THREE.MeshStandardMaterial({ color: "#7896AA", emissive: "#FFC45A", emissiveIntensity: 0, roughness: 0.25, metalness: 0.2 });
  hemi = new THREE.HemisphereLight("#F4F7EE", "#B9CFC4", 1.2); scene.add(hemi);
  ambient = new THREE.AmbientLight("#FFFFFF", 0.25); scene.add(ambient);
  sunLight = new THREE.DirectionalLight("#FFF8EC", 1.6); sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048); const sc = sunLight.shadow.camera; sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 10; sc.far = 340;
  sunLight.shadow.bias = -0.0006; sunLight.shadow.normalBias = 0.05; sunLight.shadow.radius = 4; scene.add(sunLight); scene.add(sunLight.target);
  makeWater(); makeSky(); skyCloudGroup = makeSkyClouds(); makeHub(); GRADES.forEach(makeGradeIsland);
  makeHubBridges(); makeRingBridges();
  makeLand(); makeRailway(); makeLife(); makeAmbient(); makeBirds(); makeLabels();
  applyTime();
  canvas.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; stopTour(); hideHero(); });
  canvas.addEventListener("pointerup", e => {
    if (!downAt) return; const d = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
    if (d < 7) onPick(pickAt(e.clientX, e.clientY));
  });
  canvas.addEventListener("pointermove", e => { if (e.pointerType !== "mouse" || downAt) return; canvas.style.cursor = pickAt(e.clientX, e.clientY) ? "pointer" : "grab"; });
  canvas.addEventListener("wheel", hideHero, { passive: true });
  addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 62 : 50; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); const pp = $("#panel"); if (pp && !pp.hidden) document.body.style.setProperty("--ph", pp.offsetHeight + "px"); });
  let last = performance.now(), time = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; time += ui.paused ? 0 : dt;
    stepTween(dt); controls.update();
    scene.children.forEach(o => { if (o.userData.follow) o.position.copy(camera.position); });
    if (sunMesh.userData.dir) sunMesh.position.copy(camera.position).addScaledVector(sunMesh.userData.dir, 600);
    if (moonSprite.userData.dir) moonSprite.position.copy(camera.position).addScaledVector(moonSprite.userData.dir, 580);
    sunLight.target.position.set(0, 0, 0);
    if (!ui.paused) {
      waterTex.offset.x = (time * 0.004) % 1; waterTex.offset.y = (time * 0.0025) % 1; WAVE.u.value = time;
      walkers.forEach(w => {
        swing(w.obj, time * (w.kind === "track" ? 1.5 : 1), w.kind === "track" ? 0.75 : 0.45);
        if (w.kind === "track") {
          w.t += w.v * dt; const q = trackPoint(w.t, w.lane);
          w.obj.position.set(q.x, 0.1 + Math.abs(Math.sin(time * 11 + w.lane * 7)) * 0.08, q.z); w.obj.rotation.y = q.yaw;
        } else if (w.kind === "bridge") {
          w.t += w.v * dt * (w.b.g ? 3 / w.b.L : 1); if (w.t > 1 || w.t < 0) { w.v *= -1; w.t = clamp(w.t, 0, 1); }
          const p = w.b.point(w.t), sd = new V3(Math.cos(w.b.yaw), 0, -Math.sin(w.b.yaw)).multiplyScalar(w.v > 0 ? 0.25 : -0.25);
          const base = w.b.root.position;
          w.obj.position.set(base.x + p.x + sd.x, p.y + 0.05 + Math.abs(Math.sin(time * 8 + w.t * 30)) * 0.05, base.z + p.z + sd.z);
          w.obj.rotation.y = w.b.yaw + (w.v > 0 ? 0 : Math.PI);
        } else {
          w.a += w.v * dt / w.r * 2;
          w.obj.position.set(w.c.x + Math.cos(w.a) * w.r, 0.04 + Math.abs(Math.sin(time * 8 + w.a * 5)) * 0.05, w.c.z + Math.sin(w.a) * w.r);
          w.obj.rotation.y = -w.a + (w.v > 0 ? Math.PI : 0);
        }
      });
      whales.forEach(w => {
        w.a += w.v * dt; const x = Math.cos(w.a) * w.r, z = Math.sin(w.a) * w.r;
        w.obj.position.set(x, SEA_Y - 0.35 + waveH(x, z, time) + Math.sin(time * 0.8 + w.r) * 0.25, z);
        w.obj.rotation.y = Math.atan2(-Math.cos(w.a) * Math.sign(w.v), -Math.sin(w.a) * Math.sign(w.v));
        const ph = (time * 0.25 + w.r) % 3; w.spout.visible = ph < 0.9; w.spout.scale.setScalar(ph < 0.9 ? 0.5 + ph * 0.6 : 0.01);
      });
      const moveRing = (b, bob) => {
        b.a += b.v * dt; const x = Math.cos(b.a) * b.r, z = Math.sin(b.a) * b.r;
        b.obj.position.set(x, SEA_Y + 0.2 + waveH(x, z, time), z);
        b.obj.rotation.y = Math.atan2(-Math.cos(b.a) * Math.sign(b.v), -Math.sin(b.a) * Math.sign(b.v));
        b.obj.rotation.z = (waveH(x + 1, z, time) - waveH(x - 1, z, time)) * 0.35; b.obj.rotation.x = (waveH(x, z + 1, time) - waveH(x, z - 1, time)) * 0.3;
      };
      if (mascot) moveRing(mascot, 0.1);
      boats.forEach(b => moveRing(b, 0.08));
      clouds.forEach(c => { c.obj.position.x = c.base + Math.sin(time * 0.03 + c.k) * 14; });
      if (skyCloudGroup) skyCloudGroup.rotation.y = Math.sin(time * 0.01) * 0.12;
      foams.forEach((f, i) => { f.material.opacity = 0.25 + Math.sin(time * 1.4 + i) * 0.12; });
      birds.forEach(b => { b.obj.position.y = b.base + Math.abs(Math.sin(time * 3 + b.id)) * 0.08; });
    }
    clouds.forEach(c => { c.obj.visible = ui.fx; });
    if (!ui.paused) stepAmbient(dt, time);
    stepParticles(dt, time);
    renderer.render(scene, camera);
    updateLabels();
  });
  return true;
}

/* ---------- 資訊面板 ---------- */
function openPanel(html, cls) {
  const p = $("#panel"); p.className = "panel-card " + (cls || ""); p.innerHTML = html; p.hidden = false; p.scrollTop = 0;
  document.body.classList.toggle("has-panel", cls !== "home");
  $all("[data-go]", p).forEach(b => b.addEventListener("click", () => go(b.getAttribute("data-go"))));
  const x = $(".p-close", p); if (x) x.addEventListener("click", () => go("home"));
  const h = $("h2", p), lab = $("#panelTab .pt-label"); if (lab) lab.textContent = h ? h.textContent.replace(/\s+/g, " ").trim().slice(0, 12) : "卡片";
  requestAnimationFrame(() => document.body.style.setProperty("--ph", p.offsetHeight + "px"));
}
function starsOf(k) { const s = (store("progress") || {})[k] || 0; return '<span class="stars" aria-label="' + s + ' 顆星">' + "★★★".slice(0, s) + '<span class="off">' + "★★★".slice(s) + '</span></span>'; }
function panelHome() {
  const items = [];
  Object.keys(BOOKS).forEach(k => BOOKS[k].forEach(b => {
    if (!(b.live || previewMode)) return;
    const sub = subjectOf(b.key), g = GRADES[b.g - 1], label = g.name + sub.name + (b.publisher ? "．" + pubName(b.publisher) : "") + (b.volume ? b.volume : "");
    const ls = b.data ? b.data.units.flatMap(u => u.items.filter(it => (it.live || previewMode) && b.data.lessons[it.id])) : [];
    if (ls.length) ls.forEach(it => items.push({ go: lessonHash(b, it.id), title: (b.data.lessons[it.id].no ? b.data.lessons[it.id].no + "〈" + it.title + "〉" : it.title), sub: label, color: sub.color, k: lessonHash(b, it.id), tag: "新課" }));
    else items.push({ go: "g" + b.g + "-" + b.key, title: label, sub: "點進去看有哪些課", color: sub.color, tag: "開放" });
  }));
  openPanel('<div class="p-head"><span class="trophy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v3a5 5 0 0 1-10 0z" fill="#F2A23A"/><path d="M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3" fill="none" stroke="#F2A23A" stroke-width="1.8"/><path d="M10 12h4v3h-4zM8 18h8v2H8z" fill="#C98320"/></svg></span><div><b>開放中的學習</b><small>點一下就能開始學習</small></div></div>' +
    (items.length ? items.slice(0, 12).map(n => '<button class="news" data-go="' + n.go + '"><span class="tag" style="background:' + n.color + '">' + n.tag + '</span><b>' + esc(n.title) + '</b><small style="color:' + n.color + '">' + esc(n.sub) + '</small>' + (n.k ? starsOf(n.k) : "") + '</button>').join("") : '<p class="p-lede">老師們正在準備學習內容，敬請期待！</p>') +
    (previewMode ? '<p class="draft-note">預覽模式：未上線的內容也會顯示</p>' : "") +
    '<div class="p-sec"><b>怎麼玩</b><ul class="howto"><li>點一座小島，鏡頭會飛過去。</li><li>點島上的建築物，選一課開始學。</li><li>用手指拖動可以轉動地圖，兩指縮放。</li><li>每個喇叭按鈕都會唸給你聽。</li></ul></div>', "home");
}
function panelHub(quiet) {
  openPanel('<div class="p-top"><span class="crumb">嘉蘭樂學島</span><button class="p-close" aria-label="關閉">×</button></div>' +
    '<h2>嘉蘭國小</h2><p class="p-lede">歡迎來到嘉蘭樂學島！這裡是我們的學校：後山下的白磁磚教室和紅色祖靈柱、灰色的幼兒園新大樓、「追求真善美的」彩繪牆，還有紅土跑道和大草地。六座年級島用吊橋和嘉蘭國小相連，相鄰的年級島之間也有吊橋，可以一島接一島走一圈。</p>' +
    '<div class="row"><button class="say" data-say="歡迎來到嘉蘭樂學島！這裡是入口島，六座年級島用吊橋連在一起，相鄰的島也互相連通。點一座小島開始探險。">' + ICON_SPEAK + '聽一聽</button></div>' +
    '<div class="grade-list">' + GRADES.map(g => '<button class="gbtn" data-go="g' + g.n + '" style="--g:' + g.color + '"><span class="num">' + "一二三四五六"[g.n - 1] + '</span>' + g.name + '學習島</button>').join("") + '</div>' +
    '<div class="p-sec"><b>老師</b><p>投影或列印各島的 QR Code，學生掃描就能直接進入。</p><button class="btn" data-go="teacher">老師專區</button></div>');
  if (!quiet) speak("嘉蘭國小，歡迎來到嘉蘭樂學島");
}
function panelIsland(n) {
  const g = GRADES[n - 1];
  openPanel('<div class="p-top"><button class="nav" data-go="g' + (n === 1 ? 6 : n - 1) + '" aria-label="上一座島">‹</button><span class="crumb">嘉蘭樂學島</span><button class="nav" data-go="g' + (n === 6 ? 1 : n + 1) + '" aria-label="下一座島">›</button><button class="p-close" aria-label="關閉">×</button></div>' +
    '<h2 style="--c:' + g.color + '"><i class="dot"></i>' + g.name + '學習島</h2><p class="p-lede">島上有十棟學習建築，點建築物或下面的按鈕進去學習。</p>' +
    '<div class="row"><button class="say" data-say="' + g.name + '學習島。點一棟建築物，進去學習。">' + ICON_SPEAK + '聽一聽</button></div>' +
    '<div class="subj-list">' + SUBJECTS.map(s => {
      const open = isOpen(n, s.key);
      return '<button class="sbtn ' + (open ? "open" : "") + '" data-go="g' + n + '-' + s.key + '" style="--s:' + s.color + '"><i></i><b>' + s.name + '</b><small>' + (open ? "開放中" : "建造中") + '</small></button>';
    }).join("") + '</div>', "island");
}
function bookBody(b) {
  const head = '<p class="p-meta">' + esc([pubName(b.publisher), b.volume].filter(Boolean).join("．") || "學習內容") + (b.live ? "" : '<span class="draft">未上線</span>') + (previewMode && b.teacher ? "．負責：" + esc(b.teacher) : "") + '</p>';
  if (b.error) return head + '<div class="building-msg">' + esc(b.error) + '</div>';
  if (!b.data) return head + '<div class="loading">讀取中…</div>';
  const d = b.data;
  if (!d.units.length) return head + '<div class="building-msg">這份試算表還沒有填課次。</div>';
  return head + d.units.map(u => '<div class="unit"><b>' + esc(u.name) + '</b>' + u.items.map(it => {
    const open = (it.live || previewMode) && d.lessons[it.id], k = lessonHash(b, it.id);
    return open ? '<button class="lesson open" data-go="' + k + '"><span class="no">' + esc(it.no) + '</span><span class="tt"><b>' + esc(it.title) + '</b><small>' + esc([it.genre, it.author].filter(Boolean).join("．")) + (it.live ? "" : "．未上線") + '</small></span>' + starsOf(k) + '</button>'
      : '<div class="lesson"><span class="no">' + esc(it.no) + '</span><span class="tt"><b>' + esc(it.title) + '</b><small>即將開放</small></span></div>';
  }).join("") + '</div>').join("");
}
function panelSubject(n, key, quiet) {
  const g = GRADES[n - 1], s = subjectOf(key), i = SUBJECTS.indexOf(s), books = booksOf(n, key);
  const prev = SUBJECTS[(i + 9) % 10].key, next = SUBJECTS[(i + 1) % 10].key;
  let body;
  if (!books.length) {
    body = '<div class="building-msg">這棟建築物還在建造中，老師們正在準備學習內容，敬請期待！</div>';
    if (!quiet) speak(g.name + s.name + "，建造中，敬請期待");
  } else {
    body = books.map(bookBody).join('<hr class="book-sep">');
    if (!quiet) speak(g.name + s.name);
    books.filter(b => !b.data && !b.error).forEach(b => loadBook(b).catch(e => { b.error = e.message; }).then(() => {
      if (focus.g === n && focus.key === key && $("#panel .p-top")) panelSubject(n, key, true);
    }));
  }
  openPanel('<div class="p-top"><button class="nav" data-go="g' + n + '-' + prev + '" aria-label="上一個科目">‹</button><span class="crumb"><a href="#g' + n + '">' + g.name + '學習島</a></span><button class="nav" data-go="g' + n + '-' + next + '" aria-label="下一個科目">›</button><button class="p-close" aria-label="關閉">×</button></div>' +
    '<h2 style="--c:' + s.color + '"><i class="dot"></i>' + g.name + s.name + '</h2><p class="p-lede">' + esc(s.desc) + '</p>' + body, "subject");
}
/* ---------- 課程視窗 ---------- */
function openModal(html, cls) {
  const m = $("#modal"); m.innerHTML = '<div class="sheet ' + (cls || "") + '" role="dialog" aria-modal="true">' + html + '</div>'; m.hidden = false;
  document.body.classList.add("modal-open");
  $all(".m-close", m).forEach(b => b.addEventListener("click", () => go(modalBack || "home")));
}
let modalBack = "home";
function closeModal() { const m = $("#modal"); if (!m.hidden) { m.hidden = true; m.innerHTML = ""; document.body.classList.remove("modal-open"); stopSpeak(); activeFix = []; } }
function openLesson(n, key, bn, id) {
  const g = GRADES[n - 1], sub = subjectOf(key), b = booksOf(n, key)[bn - 1];
  modalBack = "g" + n + "-" + key;
  if (!b) return;
  if (!b.data) {
    openModal('<div class="m-head"><h1>讀取中…</h1><button class="m-close" aria-label="關閉">×</button></div><p class="p-lede">正在讀取老師準備的學習內容。</p>', "lesson-sheet");
    loadBook(b).then(() => { if (location.hash === "#" + lessonHash(b, id) || (bn === 1 && location.hash === "#g" + n + "-" + key + "-" + id)) openLesson(n, key, bn, id); })
      .catch(e => { b.error = e.message; openModal('<div class="m-head"><h1>讀不到內容</h1><button class="m-close" aria-label="關閉">×</button></div><p class="p-lede">' + esc(e.message) + '</p>', "lesson-sheet"); });
    return;
  }
  const L = b.data.lessons[id], item = b.data.units.flatMap(u => u.items).find(it => it.id === id);
  if (!L || !item || !(item.live || previewMode)) { openModal('<div class="m-head"><h1>這一課還沒開放</h1><button class="m-close" aria-label="關閉">×</button></div><p class="p-lede">老師正在準備中，敬請期待！</p>', "lesson-sheet"); return; }
  activeFix = b.data.sayFix || [];
  const pk = lessonHash(b, id), night = S.dark > 0.5, TABS = lessonTabs(L, key);
  openModal('<div style="--s:' + sub.color + '"><header class="lesson-hero' + (night ? " night" : "") + '"><button class="m-close" aria-label="關閉">×</button><div class="unitname">' + esc(g.name + sub.name + "．" + L.unit) + '</div><h1>' + esc((L.no ? L.no + "　" : "") + L.title) + '</h1>' +
    '<div class="meta">' + [L.genre, L.author ? "作者：" + L.author : "", pubName(b.publisher), item.live ? "" : "未上線預覽"].filter(Boolean).map(x => '<span class="chip">' + esc(x) + '</span>').join("") + '</div></header>' +
    '<div class="tabs" role="tablist">' + TABS.map((t, i) => '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (i ? "false" : "true") + '">' + t[1] + '</button>').join("") + '</div>' +
    '<section class="lpanel" id="lpanel" role="tabpanel"></section></div>', "lesson-sheet");
  const panel = $("#lpanel"), FN = { intro: tabIntro, text: tabText, chars: tabChars, words: tabWords, key: tabKey, think: tabThink, quiz: tabQuiz };
  function show(tab) {
    stopSpeak();
    $all(".tab").forEach(x => x.setAttribute("aria-selected", x.getAttribute("data-tab") === tab ? "true" : "false"));
    FN[tab](panel, L, pk, key);
    try { sessionStorage.setItem("jialan:tab:" + pk, tab); } catch (e) {}
  }
  $all(".tab").forEach(x => x.addEventListener("click", () => { show(x.getAttribute("data-tab")); speak(x.textContent); }));
  let last = null; try { last = sessionStorage.getItem("jialan:tab:" + pk); } catch (e) {}
  show(last && TABS.some(t => t[0] === last) ? last : "intro");
}
function lessonTabs(L, key) {
  const t = [["intro", "認識本課"]];
  const content = L.blocks.filter(b => b.type !== "重點");
  if (content.length) t.push(["text", content.some(b => b.type === "課文") ? "課文朗讀" : "學習內容"]);
  if (L.chars.length) t.push(["chars", "生字"]);
  if (L.words.length) {
    const kinds = new Set(L.words.map(w => w.kind));
    t.push(["words", kinds.size === 1 && kinds.has("單字") ? "單字" : kinds.size === 1 && kinds.has("族語詞") ? "族語詞" : "語詞"]);
  }
  if (L.blocks.some(b => b.type === "重點")) t.push(["key", key === "chinese" ? "語文百寶箱" : "學習重點"]);
  if (L.think.length) t.push(["think", "想一想"]);
  if (L.quiz.length) t.push(["quiz", "挑戰關卡"]);
  return t;
}
const sayAttr = (text, lang) => ' data-say="' + esc(text) + '"' + (lang ? ' data-lang="' + lang + '"' : "");
function safeUrl(u) { u = TXT(u); return /^https?:\/\//i.test(u) ? u : ""; }
function driveFile(u) { const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]{10,})/); return m ? m[1] : ""; }
function imgUrl(u) { const id = driveFile(u); return id ? "https://drive.google.com/thumbnail?id=" + id + "&sz=w1600" : u; }
function audioUrl(u) { const id = driveFile(u); return id ? "https://drive.google.com/uc?export=download&id=" + id : u; }
function ytId(u) { const m = u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : ""; }
const paras = t => lines(t).map(x => "<p>" + esc(x) + "</p>").join("");
function speakBtn(text, label, lang) { return '<button class="say"' + sayAttr(text, lang) + '>' + ICON_SPEAK + esc(label) + '</button>'; }
function audioBtn(url, label) { return '<button class="say" data-audio="' + esc(audioUrl(url)) + '">' + ICON_SPEAK + esc(label) + '</button>'; }

function tabIntro(p, L) {
  let h = "";
  if (L.goals.length) h += '<h2>學習目標</h2><ul class="goal-list">' + L.goals.map(x => "<li>" + esc(x) + "</li>").join("") + '</ul>';
  if (L.quote) h += '<h3>名言佳句</h3><div class="lquote">' + esc(L.quote.text) + (L.quote.by ? '<small>' + esc(L.quote.by) + '</small>' : "") + '</div><div class="row">' + speakBtn(L.quote.text, "唸給我聽") + '</div>';
  const kv = [["類型", L.genre], ["主旨", L.theme], ["大意", L.summary], ["作者", L.authorNote]].filter(x => x[1]);
  if (kv.length) h += '<h3>本課重點</h3><dl class="kv">' + kv.map(x => '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>').join("") + '</dl>';
  if (L.theme || L.summary) h += '<div class="row" style="margin-top:12px">' + speakBtn((L.theme ? "主旨：" + L.theme : "") + (L.summary ? "大意：" + L.summary : ""), "聽重點") + '</div>';
  p.innerHTML = h || '<h2>' + esc(L.title) + '</h2><p>點上面的分頁開始學習。</p>';
}
function tabText(p, L) {
  const all = [], blocks = L.blocks.filter(b => b.type !== "重點"), hasPoem = blocks.some(b => b.type === "課文"), hasGist = blocks.some(b => b.type === "課文" && b.extra);
  const html = blocks.map(b => {
    if (b.type === "課文") {
      const ls = lines(b.text);
      return '<div class="stanza"><div class="shead"><span>' + esc(b.title) + '</span>' + (b.say ? '<button class="say icon"' + sayAttr(ls.join("，")) + ' aria-label="朗讀這一段">' + ICON_SPEAK + '</button>' : "") + '</div>' +
        ls.map(l => { all.push(l); return '<span class="pline" data-i="' + (all.length - 1) + '">' + esc(l) + "</span>"; }).join("") + (b.extra ? '<p class="gist">段落大意：' + esc(b.extra) + '</p>' : "") + '</div>';
    }
    if (b.type === "圖片") { const u = safeUrl(b.text); return u ? '<figure class="blk-img"><img src="' + esc(imgUrl(u)) + '" alt="' + esc(b.title) + '" loading="lazy">' + (b.title ? '<figcaption>' + esc(b.title) + '</figcaption>' : "") + '</figure>' : ""; }
    if (b.type === "影片") {
      const u = safeUrl(b.text), id = ytId(u); if (!u) return "";
      return '<div class="blk-video">' + (b.title ? '<h3>' + esc(b.title) + '</h3>' : "") + (id ? '<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '" title="' + esc(b.title || "影片") + '" loading="lazy" allowfullscreen></iframe></div>' : "") + '<a href="' + esc(u) + '" target="_blank" rel="noopener">在新視窗開啟影片</a></div>';
    }
    if (b.type === "連結") { const u = safeUrl(b.text); return u ? '<p class="blk-link"><a class="btn ghost" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(b.title || "開啟連結") + '</a></p>' : ""; }
    return '<div class="blk-para">' + (b.title ? '<h3>' + esc(b.title) + '</h3>' : "") + paras(b.text) + (b.say && b.text ? speakBtn(b.text, "聽" + (b.title || "這一段")) : "") + '</div>';
  }).join("");
  p.innerHTML = '<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2>' + esc(L.title) + '</h2><div class="row">' +
    (hasPoem ? '<button class="btn" id="readAll">' + ICON_SPEAK.replace("<svg", '<svg width="20" height="20"') + '<span>朗讀全文</span></button>' : "") +
    (hasGist ? '<button class="btn ghost" id="gistBtn">顯示段落大意</button>' : "") + '</div></div>' +
    (hasPoem ? '<p style="margin:0 0 12px;color:var(--ink-soft);font-size:.92rem">點任何一行，就會唸那一行。</p>' : "") +
    '<div class="poem-wrap"><div class="poem" id="poem">' + html + '</div></div>';
  let reading = false;
  const mark = i => $all(".pline", p).forEach(e => e.classList.toggle("reading", +e.getAttribute("data-i") === i));
  function readFrom(i) {
    if (!reading || i >= all.length) { reading = false; mark(-1); if ($("#readAll")) $("#readAll span").textContent = "朗讀全文"; return; }
    mark(i); const el = $('.pline[data-i="' + i + '"]', p); if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    speak(all[i], { force: true, end: () => setTimeout(() => readFrom(i + 1), 250) });
  }
  if ($("#readAll")) $("#readAll").addEventListener("click", function () {
    if (reading) { reading = false; stopSpeak(); mark(-1); this.querySelector("span").textContent = "朗讀全文"; return; }
    reading = true; this.querySelector("span").textContent = "停止"; readFrom(0);
  });
  if ($("#gistBtn")) $("#gistBtn").addEventListener("click", function () { const on = $(".poem-wrap", p).classList.toggle("show-gist"); this.textContent = on ? "隱藏段落大意" : "顯示段落大意"; });
  $all(".pline", p).forEach(e => e.addEventListener("click", () => { reading = false; const i = +e.getAttribute("data-i"); mark(i); speak(all[i], { force: true, end: () => mark(-1) }); }));
}
function tabChars(p, L) {
  p.innerHTML = '<div class="row" style="justify-content:space-between"><h2>本課生字（' + L.chars.length + ' 個）</h2>' +
    '<a class="toplink" href="https://stroke-order.learningweb.moe.edu.tw/" target="_blank" rel="noopener">教育部筆順學習網</a></div>' +
    '<p style="margin:4px 0 12px;color:var(--ink-soft);font-size:.92rem">點一個字，看注音、部首、筆畫和語詞，也會唸給你聽。</p>' +
    '<div class="char-grid">' + L.chars.map((c, i) => '<button class="char-btn" data-i="' + i + '" aria-pressed="false" aria-label="' + esc(c.c) + '"><span class="c">' + esc(c.c) + '</span><span class="zy">' + esc(c.zy) + '</span></button>').join("") + '</div><div id="charDetail"></div>';
  function detail(i) {
    const c = L.chars[i], w0 = c.words[0];
    $all(".char-btn", p).forEach(b => b.setAttribute("aria-pressed", +b.getAttribute("data-i") === i ? "true" : "false"));
    const strokes = [c.rad ? "部首：<b>" + esc(c.rad) + "</b>部" : "", c.rs ? "部首外 " + esc(c.rs) + " 畫" : "", c.total ? "總筆畫 <b>" + esc(c.total) + "</b> 畫" : ""].filter(Boolean).join("　");
    $("#charDetail").innerHTML = '<div class="char-detail"><div class="tian">' + esc(c.c) + '</div><div>' +
      '<div class="row"><span class="char-zy">' + esc(c.zy) + '</span>' + (c.audio ? audioBtn(c.audio, "") : '<button class="say icon"' + sayAttr(c.c + "，" + c.words.map(w => w + "的" + c.c).join("，")) + ' aria-label="唸這個字">' + ICON_SPEAK + '</button>') + '</div>' +
      (strokes ? '<p style="margin:4px 0">' + strokes + '</p>' : "") + (c.m ? '<p style="margin:4px 0">意思：' + esc(c.m) + '</p>' : "") + (c.ex ? '<p style="margin:4px 0;color:var(--ink-soft)">例句：' + esc(c.ex) + '</p>' : "") +
      (c.words.length ? '<div class="pill-list">' + c.words.map(w => '<button class="pill"' + sayAttr(w) + '>' + esc(w) + '</button>').join("") + '</div>' : "") +
      (c.similar.length ? '<p style="margin:12px 0 6px;font-weight:700">比一比</p><div class="pill-list">' + c.similar.map(s => '<button class="pill"' + sayAttr(s[1] ? s[1] + "的" + s[0] : s[0]) + '>' + esc(s[0]) + (s[1] ? "：" + esc(s[1]) : "") + '</button>').join("") + '</div>' : "") +
      (c.tip ? '<div class="warn">小提醒：' + esc(c.tip) + '</div>' : "") + '</div></div>';
    if (c.audio) playAudio(audioUrl(c.audio)); else speak(c.c + (w0 ? "，" + w0 + "的" + c.c : ""), { force: true });
  }
  $all(".char-btn", p).forEach(b => b.addEventListener("click", () => detail(+b.getAttribute("data-i"))));
}
function tabWords(p, L) {
  p.innerHTML = '<h2>' + esc(lessonTabs(L).find(t => t[0] === "words")[1]) + '</h2><p style="margin:0 0 12px;color:var(--ink-soft);font-size:.92rem">點喇叭聽聽看。</p><div class="word-list">' + L.words.map(w => {
    const en = w.kind === "單字" || /^[A-Za-z][A-Za-z '\-.?!]*$/.test(w.w);
    let btn;
    if (w.audio) btn = '<button class="say icon" data-audio="' + esc(audioUrl(w.audio)) + '" aria-label="播放' + esc(w.w) + '">' + ICON_SPEAK + '</button>';
    else if (en) btn = '<button class="say icon"' + sayAttr(w.w + (w.ex && /^[A-Za-z]/.test(w.ex) ? ". " + w.ex : ""), "en") + ' aria-label="唸' + esc(w.w) + '">' + ICON_SPEAK + '</button>';
    else if (w.kind === "族語詞") btn = w.m ? '<button class="say icon"' + sayAttr(w.m) + ' aria-label="唸意思">' + ICON_SPEAK + '</button>' : "<span></span>";
    else btn = '<button class="say icon"' + sayAttr(w.w + "。" + w.m + (w.ex ? "例如：" + w.ex : "")) + ' aria-label="唸' + esc(w.w) + '">' + ICON_SPEAK + '</button>';
    return '<div class="word"><b' + (en ? ' class="en"' : "") + '>' + esc(w.w) + (w.zy ? ' <small class="zy2">' + esc(w.zy) + '</small>' : "") + '</b>' + btn + (w.m ? '<p>' + esc(w.m) + '</p>' : "") + (w.ex ? '<p class="ex">例句：' + esc(w.ex) + '</p>' : "") + '</div>';
  }).join("") + '</div>';
}
function tabKey(p, L, pk, key) {
  p.innerHTML = '<h2>' + (key === "chinese" ? "語文百寶箱" : "學習重點") + '</h2>' + L.blocks.filter(b => b.type === "重點").map(b =>
    '<div class="think key-card"><p class="key-title">' + esc(b.title) + '</p>' + paras(b.text) + (b.say && b.text ? speakBtn(b.text, "聽說明") : "") +
    (b.extra ? '<div class="pill-list" style="margin-top:10px">' + lines(b.extra).map(e => '<button class="pill"' + sayAttr(e.replace(/→/g, "，")) + '>' + esc(e) + '</button>').join("") + '</div>' : "") + '</div>').join("");
}
function tabThink(p, L) {
  p.innerHTML = '<h2>想一想</h2><p style="margin:0 0 12px;color:var(--ink-soft);font-size:.92rem">先和同學說說看，再點「看參考答案」。</p>' + L.think.map((t, i) =>
    '<div class="think"><p>' + (i + 1) + '. ' + esc(t.q) + '</p><div class="row">' + speakBtn(t.q, "聽題目") + (t.a ? '<button class="btn ghost" data-ans="' + i + '">看參考答案</button>' : "") + '</div><div class="ans" id="ans' + i + '" hidden>' + esc(t.a) + '</div></div>').join("");
  $all("[data-ans]", p).forEach(b => b.addEventListener("click", () => { const a = $("#ans" + b.getAttribute("data-ans")); a.hidden = !a.hidden; b.textContent = a.hidden ? "看參考答案" : "收起答案"; if (!a.hidden) speak(a.textContent, { force: true }); }));
}
function tabQuiz(p, L, pk) {
  let qs = L.quiz.slice(), idx = 0, score = 0, cheered = false;
  const header = () => '<div class="quiz-top"><b>第 ' + (idx + 1) + ' / ' + qs.length + ' 題</b><div class="progress"><i style="width:' + (idx / qs.length * 100) + '%"></i></div><span>答對 ' + score + '</span></div>';
  function next(ok, why) {
    if (ok) score++;
    const fb = document.createElement("div"); fb.className = "feedback " + (ok ? "ok" : "no");
    fb.innerHTML = (ok ? "答對了！" : "再想想看，正確答案在上面標出來了。") + "<span>" + esc(why || "") + "</span>";
    const b = document.createElement("button"); b.className = "btn"; b.style.marginTop = "10px"; b.textContent = idx + 1 < qs.length ? "下一題" : "看結果";
    b.addEventListener("click", () => { idx++; idx < qs.length ? render() : finish(); });
    fb.appendChild(document.createElement("br")); fb.appendChild(b); p.appendChild(fb);
    speak((ok ? "答對了！" : "再想想看。") + (why || ""));
  }
  const wrongFx = b => { b.classList.remove("wrong"); void b.offsetWidth; b.classList.add("wrong"); };
  function render() {
    const q = qs[idx];
    p.innerHTML = header() + '<div class="row"><p class="qtext" style="flex:1;min-width:0">' + esc(q.q) + '</p><button class="say icon"' + sayAttr(q.q + (q.say ? "。" + q.say : "")) + ' aria-label="聽題目">' + ICON_SPEAK + '</button></div><div id="qa"></div>';
    const qa = $("#qa", p);
    if (q.t === "choice") {
      const order = q.fixed ? q.o.map((_, i) => i) : shuffle(q.o.map((_, i) => i));
      qa.innerHTML = '<div class="options">' + order.map((i, k) => '<button class="tile" data-o="' + i + '"><span class="tag">' + "ABCDEF"[k] + '</span>' + esc(q.o[i]) + '</button>').join("") + '</div>';
      $all(".tile", qa).forEach(b => b.addEventListener("click", () => {
        const pick = +b.getAttribute("data-o"); $all(".tile", qa).forEach(x => { x.disabled = true; if (+x.getAttribute("data-o") === q.a) x.classList.add("done"); });
        if (pick !== q.a) b.classList.add("wrong"); next(pick === q.a, q.why);
      }));
    } else if (q.t === "order" || q.t === "build") {
      const items = q.t === "order" ? q.o : q.tiles, seq = [], mixd = shuffle(items.map((_, i) => i)); let wrongs = 0;
      qa.innerHTML = '<div class="build-line" id="line" aria-live="polite"></div><div class="' + (q.t === "order" ? "options" : "row") + '">' + mixd.map(i => '<button class="tile' + (q.t === "build" ? " kai" : "") + '" data-o="' + i + '">' + esc(items[i]) + '</button>').join("") + '</div>';
      $all(".tile", qa).forEach(b => b.addEventListener("click", () => {
        const i = +b.getAttribute("data-o");
        if (i !== seq.length) { wrongs++; wrongFx(b); speak(q.t === "order" ? "不是這個喔" : "順序不對喔"); return; }
        seq.push(i); b.disabled = true; b.classList.add("done");
        if (q.t === "order") { b.innerHTML = '<span class="tag">' + seq.length + '</span>' + esc(items[i]); $("#line", qa).innerHTML = seq.map((k, n) => '<span class="chip">' + (n + 1) + "．" + esc(items[k]) + '</span>').join(""); }
        else { speak(items[i]); $("#line", qa).textContent = seq.map(k => items[k]).join(""); }
        if (seq.length === items.length) next(wrongs <= 1, q.why);
      }));
    } else if (q.t === "match") {
      const pairs = q.pairs, left = shuffle(pairs.map((_, i) => i)), right = shuffle(pairs.map((_, i) => i));
      let sel = null, done = 0, miss = 0;
      qa.innerHTML = '<div class="match"><div class="col">' + left.map(i => '<button class="tile kai" data-l="' + i + '">' + esc(pairs[i].a) + '</button>').join("") + '</div>' +
        '<div class="col">' + right.map(i => '<button class="tile" data-r="' + i + '">' + esc(pairs[i].b) + '</button>').join("") + '</div></div>';
      $all("[data-l]", qa).forEach(b => b.addEventListener("click", () => { if (b.classList.contains("done")) return; $all("[data-l]", qa).forEach(x => x.classList.remove("sel")); b.classList.add("sel"); sel = +b.getAttribute("data-l"); speak(pairs[sel].a); }));
      $all("[data-r]", qa).forEach(b => b.addEventListener("click", () => {
        if (b.classList.contains("done")) return;
        if (sel === null) { speak("先點左邊"); return; }
        const r = +b.getAttribute("data-r");
        if (r === sel) {
          b.classList.add("done"); const l = $('[data-l="' + sel + '"]', qa); l.classList.remove("sel"); l.classList.add("done"); sel = null; done++; speak("配對成功");
          if (done === pairs.length) next(miss <= 1, q.why);
        } else { miss++; wrongFx(b); speak("再試試看"); }
      }));
    }
  }
  function finish() {
    const pct = score / qs.length, stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : 1;
    const prog = store("progress") || {}; if ((prog[pk] || 0) < stars) { prog[pk] = stars; store("progress", prog); }
    p.innerHTML = '<div class="result"><div class="big-stars" aria-label="' + stars + ' 顆星">' + "★★★".slice(0, stars) + '<span style="opacity:.25">' + "★★★".slice(stars) + '</span></div>' +
      '<h2>' + (stars === 3 ? "太厲害了！" : stars === 2 ? "做得很好！" : "繼續加油！") + '</h2><p>' + qs.length + ' 題答對 ' + score + ' 題</p>' +
      (stars >= CERT_STARS ? '<p class="cert-earn">🎓 恭喜！你可以領取這一課的學習證書。</p>' : '<p class="cert-earn no">答對 7 成以上（2 顆星）就能領取學習證書，再挑戰一次吧！</p>') +
      '<div class="row" style="justify-content:center">' + (stars >= CERT_STARS ? '<button class="btn" id="getCert">🎓 領取證書</button>' : "") + '<button class="btn' + (stars >= CERT_STARS ? " ghost" : "") + '" id="again">再挑戰一次</button><button class="btn ghost m-back">回課程列表</button></div></div>';
    const sayIt = () => speak(qs.length + "題答對" + score + "題。" + (stars === 3 ? "太厲害了！" : stars === 2 ? "做得很好！" : "繼續加油！") + (stars >= CERT_STARS ? "可以領取證書了！" : ""));
    if (stars >= CERT_STARS && !cheered) { cheered = true; stopSpeak(); const ms = playCheer(); confetti(); setTimeout(sayIt, ms); } else if (!cheered) sayIt();
    $("#again").addEventListener("click", () => { idx = 0; score = 0; cheered = false; qs = L.quiz.slice(); render(); });
    if (stars >= CERT_STARS) { const rec = saveCert(pk, L, score, qs.length, stars); $("#getCert").addEventListener("click", () => certView(p, rec, finish)); }
    $(".m-back", p).addEventListener("click", () => go(modalBack));
  }
  p.innerHTML = '<div class="result"><h2>挑戰關卡</h2><p>共 ' + qs.length + ' 題，全部用點的就可以作答。<br>答對 9 成以上可以得到 3 顆星！</p><button class="btn" id="start">開始挑戰</button></div>';
  $("#start").addEventListener("click", render);
}

/* ---------- 老師專區、清單 ---------- */
function siteBase() { return location.href.split("#")[0]; }
function qrSVG(text) {
  if (typeof window.qrcode !== "function") return '<div class="qr-miss">QR Code 工具載入中</div>';
  const q = window.qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
function openTeacher() {
  modalBack = "home";
  const base = siteBase(), links = [["嘉蘭樂學島首頁", "home"]];
  GRADES.forEach(g => links.push([g.name + "學習島", "g" + g.n]));
  Object.keys(BOOKS).forEach(k => BOOKS[k].forEach(b => {
    if (!b.live) return;
    const name = GRADES[b.g - 1].name + subjectOf(b.key).name;
    if (b.n === 1) links.push([name, k]);
    if (b.data) b.data.units.forEach(u => u.items.forEach(it => { if (it.live && b.data.lessons[it.id]) links.push([name + (b.volume ? "（" + b.volume + "）" : "") + "　" + it.title, lessonHash(b, it.id)]); }));
  }));
  const regMsg = { none: "尚未設定總表（assets/config.js 的 masterSheet 是空的），目前只使用網站資料夾裡的教材檔。", loading: "正在讀取總表…", ok: "總表讀取成功，共 " + registry.rows.length + " 列。", error: "總表讀取失敗：" + registry.error }[registry.status];
  const rows = registry.rows.map((r, i) => {
    const b = r._book, st = r._why ? '<span class="st bad">' + esc(r._why) + '</span>' : b.error ? '<span class="st bad">' + esc(b.error) + '</span>' : b.data ? '<span class="st ok">讀取成功：' + b.data.units.reduce((a, u) => a + u.items.length, 0) + ' 課</span>' : '<span class="st">尚未檢查</span>';
    return '<tr><td>' + esc(TXT(r["年級"]) + TXT(r["科目"])) + '</td><td>' + esc(TXT(r["冊別"])) + '</td><td>' + esc(TXT(r["負責老師"])) + '</td><td>' + (TXT(r["上線"]) === "是" ? "是" : "否") + '</td><td>' + st + '</td><td>' + (b ? '<button class="pill" data-check="' + i + '">檢查</button>' : "") + '</td></tr>';
  }).join("");
  openModal('<div class="m-head"><h1>老師專區</h1><button class="m-close" aria-label="關閉">×</button></div>' +
    '<section class="t-sec"><h2>預覽模式</h2><p class="small">打開後，總表或課次「上線」選「否」的內容也會顯示，方便上線前檢查。只影響這台裝置，關掉分頁就恢復。</p>' +
    '<button class="btn' + (previewMode ? "" : " ghost") + '" id="pvMode">' + (previewMode ? "預覽模式：開啟中（點一下關閉）" : "開啟預覽模式") + '</button></section>' +
    '<section class="t-sec"><h2>教材試算表連線檢查</h2><p class="small">' + esc(regMsg) + '</p>' +
    (rows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>年級科目</th><th>冊別</th><th>負責老師</th><th>上線</th><th>狀態</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : "") + '</section>' +
    '<section class="t-sec"><h2>QR Code</h2><p class="small">把 QR Code 投影或印出來，學生用平板掃描就能直接進入。目前網址：<code>' + esc(base) + '</code>（請在正式網址打開這一頁，QR Code 才會指向正式網站）</p>' +
    '<div class="qr-grid">' + links.map(l => '<div class="qr-card"><div class="qr">' + qrSVG(base + "#" + l[1]) + '</div><b>' + esc(l[0]) + '</b><code>#' + l[1] + '</code></div>').join("") + '</div></section>', "teacher");
  $("#pvMode").addEventListener("click", () => {
    previewMode = !previewMode; try { sessionStorage.setItem("jialan:preview", previewMode ? "1" : "0"); } catch (e) {}
    refreshOpenState(); openTeacher(); toast(previewMode ? "預覽模式已開啟" : "預覽模式已關閉");
  });
  $all("[data-check]").forEach(btn => btn.addEventListener("click", () => {
    const b = registry.rows[+btn.getAttribute("data-check")]._book; b.error = null; b.data = null; b.loading = null;
    btn.textContent = "讀取中…";
    loadBook(b).catch(e => { b.error = e.message; }).then(() => { if (location.hash === "#teacher") openTeacher(); });
  }));
}
/* ===================== 學習證書：每一課測驗 2 顆星（答對 7 成）以上即可領取 ===================== */
const CERT_STARS = 2;
function certCourse(rec) {
  const g = GRADES[rec.g - 1], s = subjectOf(rec.key);
  const no = !rec.no ? "" : /[第課]/.test(rec.no) ? rec.no : "第" + rec.no + "課";
  return { grade: g ? g.name : "", subject: s ? s.name : "", lesson: (no ? no + "　" : "") + rec.title, no };
}
function saveCert(pk, L, score, total, stars) {
  const m = pk.match(/^g([1-6])-([a-z]+)-/); if (!m) return null;
  const all = store("certs") || {}, old = all[pk], d = new Date();
  const rec = { pk, g: +m[1], key: m[2], no: L.no || "", title: L.title || "", score, total, stars, date: [d.getFullYear(), d.getMonth() + 1, d.getDate()] };
  if (!old || score / total > old.score / old.total) { all[pk] = rec; store("certs", all); updateCertCount(); return rec; }
  return old;
}
function updateCertCount() { const n = Object.keys(store("certs") || {}).length, el = $("#certN"); if (el) el.textContent = n; }

// Canvas 證書：A4 橫式，1754×1240（150 dpi）
let certLogo = null;
function loadCertLogo() {
  if (certLogo) return certLogo;
  certLogo = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = "assets/logo.png"; });
  return certLogo;
}
// 燙金質感：多段金屬漸層＋細微高光
function goldGrad(x, x0, y0, x1, y1) {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  [[0, "#8A6420"], [0.18, "#D9B45A"], [0.32, "#F7E7A6"], [0.46, "#B88A2E"], [0.62, "#E8C870"], [0.78, "#FFF1BE"], [0.9, "#C59A3C"], [1, "#7E5A1C"]].forEach(s => g.addColorStop(s[0], s[1]));
  return g;
}
function goldText(x, txt, cx, y, size, font, spacing) {
  x.save(); x.font = font; x.textAlign = "center";
  if (spacing) x.letterSpacing = spacing + "px";
  const w = x.measureText(txt).width;
  x.fillStyle = "rgba(90,60,10,.35)"; x.fillText(txt, cx + size * 0.02, y + size * 0.03);          // 壓印陰影
  x.fillStyle = goldGrad(x, cx - w / 2, y - size, cx + w / 2, y + size * 0.2); x.fillText(txt, cx, y);
  x.lineWidth = size > 60 ? 1.5 : 0.8; x.strokeStyle = "rgba(110,75,15,.55)"; x.strokeText(txt, cx, y);
  if (size > 60) { x.globalCompositeOperation = "lighter"; x.globalAlpha = 0.14; x.fillStyle = "#FFF6D5"; x.fillText(txt, cx - 1, y - 1); }
  x.restore();
}
function diamond(x, cx, cy, rw, rh) { x.beginPath(); x.moveTo(cx, cy - rh); x.lineTo(cx + rw, cy); x.lineTo(cx, cy + rh); x.lineTo(cx - rw, cy); x.closePath(); }
function paiwanBorder(x, w, h, m, t) {
  // 排灣族菱形紋（百步蛇背紋）飾帶：深色底、燙金菱形、紅色眼紋
  const IN = "#FBF6EA", BG = "#1E2622", RED = "#A8322A";
  x.fillStyle = BG; x.fillRect(m, m, w - 2 * m, h - 2 * m);
  x.fillStyle = IN; x.fillRect(m + t, m + t, w - 2 * (m + t), h - 2 * (m + t));
  const run = (ox, oy, len, horiz) => {
    const n = Math.round(len / t), s = len / n;
    for (let i = 0; i < n; i++) {
      const cx = horiz ? ox + i * s + s / 2 : ox + t / 2, cy = horiz ? oy + t / 2 : oy + i * s + s / 2;
      x.fillStyle = goldGrad(x, cx - t, cy - t, cx + t, cy + t); diamond(x, cx, cy, (horiz ? s : t) * 0.42, (horiz ? t : s) * 0.36); x.fill();
      x.fillStyle = BG; diamond(x, cx, cy, (horiz ? s : t) * 0.25, (horiz ? t : s) * 0.2); x.fill();
      x.fillStyle = RED; diamond(x, cx, cy, (horiz ? s : t) * 0.12, (horiz ? t : s) * 0.1); x.fill();
      // 菱形之間的小三角（鋸齒紋）
      x.fillStyle = goldGrad(x, cx - t, cy - t, cx + t, cy + t);
      const ex = horiz ? cx + s / 2 : cx, ey = horiz ? cy : cy + s / 2;
      if (i < n - 1) { x.beginPath(); if (horiz) { x.moveTo(ex - 5, oy + 3); x.lineTo(ex + 5, oy + 3); x.lineTo(ex, oy + 11); x.moveTo(ex - 5, oy + t - 3); x.lineTo(ex + 5, oy + t - 3); x.lineTo(ex, oy + t - 11); } else { x.moveTo(ox + 3, ey - 5); x.lineTo(ox + 3, ey + 5); x.lineTo(ox + 11, ey); x.moveTo(ox + t - 3, ey - 5); x.lineTo(ox + t - 3, ey + 5); x.lineTo(ox + t - 11, ey); } x.fill(); }
    }
  };
  run(m + t, m, w - 2 * (m + t), true); run(m + t, h - m - t, w - 2 * (m + t), true);
  run(m, m + t, h - 2 * (m + t), false); run(w - m - t, m + t, h - 2 * (m + t), false);
  // 四角：太陽紋（排灣族太陽之子的傳說）
  [[m, m], [w - m - t, m], [m, h - m - t], [w - m - t, h - m - t]].forEach(([a, b]) => {
    const cx = a + t / 2, cy = b + t / 2; x.fillStyle = goldGrad(x, cx - t / 2, cy - t / 2, cx + t / 2, cy + t / 2);
    for (let k = 0; k < 12; k++) { const an = k / 12 * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(an - 0.13) * t * 0.22, cy + Math.sin(an - 0.13) * t * 0.22); x.lineTo(cx + Math.cos(an) * t * 0.46, cy + Math.sin(an) * t * 0.46); x.lineTo(cx + Math.cos(an + 0.13) * t * 0.22, cy + Math.sin(an + 0.13) * t * 0.22); x.fill(); }
    x.beginPath(); x.arc(cx, cy, t * 0.2, 0, 7); x.fill(); x.fillStyle = RED; x.beginPath(); x.arc(cx, cy, t * 0.08, 0, 7); x.fill();
  });
  // 燙金雙線框
  const line = (o, lw) => { x.lineWidth = lw; x.strokeStyle = goldGrad(x, 0, 0, w, h); x.strokeRect(o, o, w - 2 * o, h - 2 * o); };
  line(m - 10, 3); line(m + t + 14, 4); line(m + t + 24, 1.5);
}
function arcText(x, txt, r, mid, inward, font, color) {
  // 沿圓弧排字：mid 為中心角，inward=false 時字頭朝外（上弧），true 時字頭朝內（下弧）
  x.save(); x.font = font; x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
  const chars = [...txt], ws = chars.map(c => x.measureText(c).width + 4), tot = ws.reduce((a, b) => a + b, 0);
  let a = mid - (inward ? -1 : 1) * tot / r / 2;
  chars.forEach((c, i) => {
    const step = ws[i] / r, an = a + (inward ? -1 : 1) * step / 2;
    x.save(); x.translate(Math.cos(an) * r, Math.sin(an) * r); x.rotate(an + (inward ? -Math.PI / 2 : Math.PI / 2)); x.fillText(c, 0, 0); x.restore();
    a += (inward ? -1 : 1) * step;
  });
  x.restore();
}
function goldSeal(x, cx, cy, R, dateTxt) {
  x.save(); x.translate(cx, cy); x.rotate(-0.1);
  x.shadowColor = "rgba(80,55,10,.35)"; x.shadowBlur = 18; x.shadowOffsetY = 6;
  // 鋸齒外緣
  x.beginPath(); for (let k = 0; k <= 72; k++) { const an = k / 72 * Math.PI * 2, rr = k % 2 ? R : R * 0.95; x.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
  const rg = x.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
  rg.addColorStop(0, "#FFF4C4"); rg.addColorStop(0.35, "#E7C66C"); rg.addColorStop(0.7, "#B8892C"); rg.addColorStop(1, "#7A561A");
  x.fillStyle = rg; x.fill(); x.shadowColor = "transparent";
  // 內圈：壓紋環
  const ring = (r, lw, c) => { x.lineWidth = lw; x.strokeStyle = c; x.beginPath(); x.arc(0, 0, r, 0, 7); x.stroke(); };
  ring(R * 0.84, 3, "rgba(110,75,15,.75)"); ring(R * 0.86, 1.5, "rgba(255,245,200,.7)");
  ring(R * 0.6, 2, "rgba(110,75,15,.7)"); ring(R * 0.62, 1, "rgba(255,245,200,.6)");
  for (let k = 0; k < 64; k++) { const an = k / 64 * Math.PI * 2; x.fillStyle = "rgba(110,75,15,.6)"; x.beginPath(); x.arc(Math.cos(an) * R * 0.9, Math.sin(an) * R * 0.9, 1.6, 0, 7); x.fill(); }
  const ink = "rgba(92,62,12,.92)", SERIF = '"Noto Serif TC", serif';
  arcText(x, "嘉蘭樂學島", R * 0.72, -Math.PI / 2, false, "700 " + Math.round(R * 0.15) + "px " + SERIF, ink);
  arcText(x, "JIALAN · LEARNING ISLANDS", R * 0.72, Math.PI / 2, true, "600 " + Math.round(R * 0.085) + "px Georgia, serif", ink);
  x.textAlign = "center"; x.fillStyle = ink;
  x.font = "700 " + Math.round(R * 0.2) + "px " + SERIF; x.fillText("學習", 0, -R * 0.06); x.fillText("紀念", 0, R * 0.2);
  x.font = "600 " + Math.round(R * 0.085) + "px Georgia, serif"; x.fillText(dateTxt, 0, R * 0.42);
  x.font = "700 " + Math.round(R * 0.11) + "px serif"; x.fillText("✦", -R * 0.42, R * 0.04); x.fillText("✦", R * 0.42, R * 0.04);
  // 高光
  x.globalCompositeOperation = "lighter"; const hl = x.createLinearGradient(-R, -R, R * 0.2, R * 0.2); hl.addColorStop(0, "rgba(255,255,255,.28)"); hl.addColorStop(0.5, "rgba(255,255,255,0)");
  x.fillStyle = hl; x.beginPath(); x.arc(0, 0, R * 0.95, 0, 7); x.fill();
  x.restore();
}
async function drawCert(rec, who) {
  const W = 1754, H = 1240, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"), C = certCourse(rec);
  const DISP = '"LXGW WenKai TC", "Noto Serif TC", serif', SERIF = '"Noto Serif TC", serif';
  const roc = rec.date[0] - 1911, dateTxt = "中華民國 " + roc + " 年 " + rec.date[1] + " 月 " + rec.date[2] + " 日";
  const isoDate = rec.date[0] + "." + String(rec.date[1]).padStart(2, "0") + "." + String(rec.date[2]).padStart(2, "0");
  const nameTxt = who.name || "", seatTxt = who.seat ? C.grade + "　" + who.seat + " 號" : C.grade;
  const allText = "學習證書嘉蘭樂學島國小同學完成了的並在挑戰關卡中答對題獲得顆星特頒此證以資鼓勵紀念本僅作不代表正式成績．「」，。、" + nameTxt + seatTxt + C.subject + C.lesson + dateTxt + "0123456789";
  try { await Promise.all([document.fonts.load("700 80px \"LXGW WenKai TC\"", allText), document.fonts.load("700 40px \"Noto Serif TC\"", allText)]); } catch (e) {}
  const logo = await loadCertLogo();

  // 紙張：米白底＋淡淡紙紋
  x.fillStyle = "#FBF6EA"; x.fillRect(0, 0, W, H);
  paiwanBorder(x, W, H, 40, 46);
  const L0 = 110, T0 = 110, R0 = W - 110, B0 = H - 110;
  x.save(); x.beginPath(); x.rect(L0, T0, R0 - L0, B0 - T0); x.clip();
  const vg = x.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, W * 0.62); vg.addColorStop(0, "rgba(255,255,255,0)"); vg.addColorStop(1, "rgba(201,162,74,.10)"); x.fillStyle = vg; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.06; x.fillStyle = "#1F6FB2";
  for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(0, H); for (let i = 0; i <= 40; i++) x.lineTo(i / 40 * W, H - 170 - k * 44 + Math.sin(i * 0.9 + k) * 14); x.lineTo(W, H); x.closePath(); x.fill(); }
  x.fillStyle = "#3E7D4F"; x.beginPath(); x.moveTo(W * 0.5, H); x.lineTo(W * 0.7, H * 0.62); x.lineTo(W * 0.78, H * 0.69); x.lineTo(W * 0.88, H * 0.57); x.lineTo(W, H * 0.68); x.lineTo(W, H); x.closePath(); x.fill();
  x.restore();

  x.textAlign = "center"; x.textBaseline = "alphabetic";
  if (logo) x.drawImage(logo, W / 2 - 62, 150, 124, 124);
  x.save(); x.font = "600 22px Georgia, serif"; x.letterSpacing = "8px"; x.fillStyle = "#9A7A34"; x.fillText("JIALAN · LEARNING ISLANDS", W / 2, 312); x.restore();
  goldText(x, "嘉 蘭 樂 學 島", W / 2, 360, 38, "900 38px " + SERIF);
  goldText(x, "學 習 證 書", W / 2, 478, 110, "700 110px " + DISP);
  // 燙金分隔線＋菱形
  const rule = (y, half) => { x.fillStyle = goldGrad(x, W / 2 - half, y, W / 2 + half, y); x.fillRect(W / 2 - half, y - 1.5, half * 2, 3); diamond(x, W / 2, y, 14, 10); x.fill(); x.fillStyle = "#A8322A"; diamond(x, W / 2, y, 5, 4); x.fill(); };
  rule(512, 300);

  x.fillStyle = "#3A3A3A"; x.font = "400 42px " + DISP; x.fillText(seatTxt, W / 2, 598);
  x.font = "700 96px " + DISP; x.fillStyle = "#1F2A28"; x.fillText(nameTxt + "  同學", W / 2, 706);
  const nw = Math.max(320, x.measureText(nameTxt + "  同學").width + 80);
  x.fillStyle = goldGrad(x, W / 2 - nw / 2, 730, W / 2 + nw / 2, 730); x.fillRect(W / 2 - nw / 2, 729, nw, 2);

  x.font = "400 44px " + DISP; x.fillStyle = "#333";
  x.fillText("完成了「" + C.grade + C.subject + "．" + C.lesson + "」的學習，", W / 2, 814);
  const stars = "★".repeat(rec.stars) + "☆".repeat(3 - rec.stars);
  const l2a = "並在挑戰關卡中答對 " + rec.score + " / " + rec.total + " 題，獲得 ", l2c = "。";
  const wa = x.measureText(l2a).width, wc = x.measureText(l2c).width;
  x.font = "400 50px " + SERIF; const wb = x.measureText(stars).width;
  let sx = W / 2 - (wa + wb + wc) / 2; x.textAlign = "left";
  x.font = "400 44px " + DISP; x.fillText(l2a, sx, 884); sx += wa;
  x.font = "400 50px " + SERIF; x.fillStyle = goldGrad(x, sx, 846, sx + wb, 890); x.fillText(stars, sx, 886); sx += wb;
  x.font = "400 44px " + DISP; x.fillStyle = "#333"; x.fillText(l2c, sx, 884);
  x.textAlign = "center"; x.fillText("特頒此證，以資鼓勵。", W / 2, 952);

  x.textAlign = "left"; x.font = "400 36px " + DISP; x.fillStyle = "#4A4A4A"; x.fillText(dateTxt, 220, 1050);
  x.font = "400 22px " + DISP; x.fillStyle = "#8A8A80"; x.textAlign = "center"; x.fillText("本證書僅作學習紀念，不代表正式成績。", W / 2, 1080);
  goldSeal(x, W - 330, 1000, 118, isoDate);
  return c;
}
function certFileName(rec, who) { const C = certCourse(rec); return "嘉蘭樂學島證書_" + C.grade + C.subject + "_" + (C.no || rec.title) + (who.name ? "_" + who.name : "") + ".png"; }
function certView(host, rec, back) {
  const who = store("certWho") || { name: "", seat: "" }, C = certCourse(rec);
  host.innerHTML = '<div class="cert-box">' +
    '<h2>🎓 領取學習證書</h2><p class="cert-sub">' + esc(C.grade + C.subject + "．" + C.lesson) + '</p>' +
    '<div class="cert-form"><label>姓名<input id="certName" maxlength="12" autocomplete="off" placeholder="寫上你的名字" value="' + esc(who.name) + '"></label>' +
    '<label class="seat">座號<input id="certSeat" inputmode="numeric" maxlength="3" placeholder="可不填" value="' + esc(who.seat) + '"></label></div>' +
    '<div class="cert-prev"><img id="certImg" alt="學習證書預覽"><span class="cert-wait">證書製作中…</span></div>' +
    '<div class="row cert-actions"><button class="btn" id="certDl">⬇ 下載圖片</button><button class="btn ghost" id="certPrint">🖨 列印／存成 PDF</button>' + (back ? '<button class="btn ghost" id="certBack">返回</button>' : "") + '</div>' +
    '<p class="cert-note">證書和紀錄只存在這台裝置的瀏覽器裡，清除瀏覽資料就會消失，記得先下載保存。名字不會上傳到網路。</p></div>';
  let canvas = null, timer = null, seq = 0;
  const render = async () => {
    const my = ++seq, w = { name: $("#certName").value.trim(), seat: $("#certSeat").value.replace(/\D/g, "") };
    store("certWho", w);
    const cv = await drawCert(rec, w); if (my !== seq || !$("#certImg")) return;
    canvas = cv; $("#certImg").src = cv.toDataURL("image/png"); host.querySelector(".cert-prev").classList.add("ready");
    const ok = !!w.name; $("#certDl").disabled = !ok; $("#certPrint").disabled = !ok;
  };
  ["certName", "certSeat"].forEach(id => $("#" + id).addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 250); }));
  $("#certDl").addEventListener("click", () => {
    if (!canvas) return;
    canvas.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = certFileName(rec, { name: $("#certName").value.trim() }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }, "image/png");
    playChime(); speak("證書下載好了，恭喜你！");
  });
  $("#certPrint").addEventListener("click", () => {
    if (!canvas) return;
    let pa = $("#printArea"); if (!pa) { pa = document.createElement("div"); pa.id = "printArea"; document.body.appendChild(pa); }
    pa.innerHTML = '<img alt="" src="' + canvas.toDataURL("image/png") + '">';
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); setTimeout(() => window.print(), 120);
  });
  if (back) $("#certBack").addEventListener("click", back);
  render();
  if (!who.name) setTimeout(() => { const i = $("#certName"); if (i) i.focus(); }, 200);
}
function openCerts() {
  modalBack = "home";
  const all = store("certs") || {}, list = Object.values(all).sort((a, b) => a.g - b.g || a.key.localeCompare(b.key) || a.pk.localeCompare(b.pk));
  openModal('<div class="m-head"><h1>🎓 我的證書</h1><button class="m-close" aria-label="關閉">×</button></div>' +
    '<div id="certHost"><p class="p-lede">每一課的「挑戰關卡」答對 7 成以上（2 顆星），就能領取一張學習證書。</p>' +
    (list.length ? '<div class="cert-list">' + list.map(r => { const C = certCourse(r), s = subjectOf(r.key); return '<button class="cert-item" data-pk="' + esc(r.pk) + '" style="--s:' + (s ? s.color : "#1F6FB2") + '"><b>' + esc(C.grade + C.subject) + '</b><span>' + esc(C.lesson) + '</span><em>' + "★".repeat(r.stars) + '<i>' + "★".repeat(3 - r.stars) + '</i>　' + r.date[1] + "/" + r.date[2] + '</em></button>'; }).join("") + '</div>'
      : '<div class="cert-empty">還沒有證書喔！<br>到「六年級 → 國語」完成一課的挑戰關卡，就能拿到第一張。<br><button class="btn" data-go="g6-chinese">去六年級國語館</button></div>') + '</div>', "list");
  $all("#modal [data-go]").forEach(b => b.addEventListener("click", () => go(b.getAttribute("data-go"))));
  $all("#modal .cert-item").forEach(b => b.addEventListener("click", () => certView($("#certHost"), all[b.getAttribute("data-pk")], openCerts)));
}

/* ===================== 慶祝：獲獎號角＋鈴聲＋掌聲、彩帶 ===================== */
let sfxCtx = null;
function sfxAudio() {
  if (music.ctx) return music.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  if (!sfxCtx) sfxCtx = new AC();
  if (sfxCtx.state === "suspended") sfxCtx.resume();
  return sfxCtx;
}
function playCheer(big) {
  const ctx = sfxAudio(); if (!ctx) return 0;
  if (music.started) { musicDuck(true); setTimeout(() => musicDuck(false), 3200); }
  const out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05, f = m => 440 * Math.pow(2, (m - 69) / 12);
  // 號角：鋸齒波＋濾波器開合，模擬銅管
  const brass = (m, t, d, v) => {
    [0, 0.06].forEach((det, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f(m) * (1 + det * 0.01); o.detune.setValueAtTime(-25, t); o.detune.linearRampToValueAtTime(0, t + 0.06);
      lp.type = "lowpass"; lp.Q.value = 2; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3200, t + 0.07); lp.frequency.exponentialRampToValueAtTime(1400, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * (k ? 0.5 : 1), t + 0.03); g.gain.setValueAtTime(v * (k ? 0.5 : 1) * 0.8, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
    });
  };
  // 鈴聲：正弦波＋泛音，長尾音
  const bell = (m, t, v) => {
    [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([r, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f(m) * r;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * a, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4 / r + 0.3);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 2);
    });
  };
  // 號角樂句：Sol-Sol-Sol-Do～（C 大調），再接大三和弦
  const seq = [[67, 0, 0.14], [67, 0.16, 0.14], [67, 0.32, 0.14], [72, 0.48, 0.5], [69, 0.98, 0.16], [72, 1.16, 0.16]];
  seq.forEach(([m, dt, d]) => brass(m, t0 + dt, d, 0.11));
  [60, 64, 67, 72].forEach(m => brass(m, t0 + 1.36, 1.1, 0.07));
  brass(48, t0 + 1.36, 1.1, 0.08);
  // 定音鼓
  [0, 0.48, 1.36].forEach(dt => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + dt; o.type = "sine";
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.35);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.55);
  });
  // 亮晶晶的鈴聲上行
  [84, 88, 91, 96, 100].forEach((m, i) => bell(m, t0 + 1.4 + i * 0.07, 0.05));
  // 掌聲：一串短促的帶通雜訊
  if (big !== false) {
    const len = ctx.sampleRate * 2.4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let n = 0; n < 340; n++) {
      const st = Math.floor((Math.random() * 2.1) * ctx.sampleRate), L = Math.floor(ctx.sampleRate * 0.012), a = 0.3 + Math.random() * 0.7;
      for (let i = 0; i < L && st + i < len; i++) d[st + i] += (Math.random() * 2 - 1) * a * Math.exp(-i / (L * 0.25));
    }
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), t = t0 + 1.3;
    src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.3); g.gain.setValueAtTime(0.22, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    src.connect(bp); bp.connect(g); g.connect(out); src.start(t);
  }
  return 2400;   // 樂句長度（毫秒），讓語音接在後面
}
function playChime() {
  const ctx = sfxAudio(); if (!ctx) return;
  const t = ctx.currentTime + 0.02, out = ctx.createGain(); out.gain.value = 0.4; out.connect(ctx.destination);
  [[79, 0], [84, 0.09], [88, 0.18]].forEach(([m, dt]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    g.gain.setValueAtTime(0.0001, t + dt); g.gain.linearRampToValueAtTime(0.12, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.9);
    o.connect(g); g.connect(out); o.start(t + dt); o.stop(t + dt + 1);
  });
}
function confetti(ms = 3600) {
  if (reduceMotion) return;
  const cv = document.createElement("canvas"); cv.className = "confetti"; document.body.appendChild(cv);
  const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext("2d"); x.scale(dpr, dpr);
  const COLS = ["#E8B33A", "#F7E7A6", "#C8423B", "#2B2B2B", "#3E7D4F", "#1F6FB2", "#FFFFFF", "#D9B45A"];
  const ps = Array.from({ length: Math.min(180, Math.round(W / 6)) }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const hgt = H * (0.4 + Math.random() * 0.45), vy = -Math.sqrt(2 * 0.32 * hgt), fr = -vy / 0.32;
    return { x: side > 0 ? W * 0.04 : W * 0.96, y: H * 0.92, vx: side * W * (0.12 + Math.random() * 0.4) / fr, vy,
      w: 6 + Math.random() * 7, h: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLS[i % COLS.length], diamond: i % 5 === 0 };
  });
  const start = performance.now(); let last = start;
  const step = now => {
    const dt = Math.min(2.5, (now - last) / 16.7); last = now; const age = now - start;
    x.clearRect(0, 0, W, H); x.globalAlpha = age > ms - 700 ? Math.max(0, (ms - age) / 700) : 1;
    ps.forEach(p => {
      p.vy += 0.32 * dt; p.vx *= Math.pow(0.985, dt); p.vy = Math.min(p.vy, 4.5); p.x += (p.vx + Math.sin(age / 300 + p.r) * 0.8) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.scale(1, Math.abs(Math.cos(age / 180 + p.r)) * 0.8 + 0.2); x.fillStyle = p.c;
      if (p.diamond) { x.beginPath(); x.moveTo(0, -p.h / 2); x.lineTo(p.w / 2, 0); x.lineTo(0, p.h / 2); x.lineTo(-p.w / 2, 0); x.fill(); } else x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      x.restore();
    });
    if (age < ms) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}

function openList() {
  modalBack = "home";
  openModal('<div class="m-head"><h1>學習島清單</h1><button class="m-close" aria-label="關閉">×</button></div><p class="p-lede">不想轉動地圖的時候，可以直接從這裡進入。</p><div class="row" style="margin-bottom:12px"><button class="btn ghost" data-go="certs">🎓 我的證書</button></div>' +
    GRADES.map(g => '<section class="list-isl" style="--g:' + g.color + '"><h2><i class="dot" style="background:' + g.color + '"></i>' + g.name + '學習島</h2><div class="chips">' + SUBJECTS.map(s => {
      const open = isOpen(g.n, s.key);
      return '<button class="chipbtn ' + (open ? "open" : "") + '" data-go="g' + g.n + '-' + s.key + '" style="--s:' + s.color + '">' + s.name + (open ? "" : "<small>建造中</small>") + '</button>';
    }).join("") + '</div></section>').join(""), "list");
  $all("#modal [data-go]").forEach(b => b.addEventListener("click", () => go(b.getAttribute("data-go"))));
}

/* ===================== 介面：時間、天氣、名言、足跡 ===================== */
function updateClock() {
  const c = $("#clockChip"); if (!c) return;
  const wd = "日一二三四五六"[new Date(Date.UTC(S.t.y, S.t.m - 1, S.t.d)).getUTCDay()];
  c.innerHTML = '<i class="dot ' + (S.dark > 0.5 ? "moon" : "") + '"></i><b>' + S.t.m + '月' + S.t.d + '日　週' + wd + '　' + fmt(S.now) + '</b><span>' + SEASON_NAME[S.season] + '．' + S.term + '．' + S.phase + '</span>' + (override ? '<em>預覽</em>' : "");
  c.title = "日出 " + fmt(S.sun.rise) + "　日落 " + fmt(S.sun.set) + "（臺東嘉蘭）";
  const w = $("#placeChip");
  if (w) w.innerHTML = '<i class="dot"></i>' + (wxOverride ? WX_NAME[wxOverride] + "（預覽）" : weather ? esc(weather.text + " " + weather.temp + "°C") : "山風徐徐") + '<span class="sep"></span>臺東・金峰嘉蘭';
  $all(".daynight").forEach(b => b.classList.toggle("on", !!override));
}
function loadWeather() {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON + "&current=temperature_2m,weather_code&timezone=Asia%2FTaipei&forecast_days=1";
  fetch(url).then(r => r.json()).then(j => {
    const code = j.current.weather_code, txt = code === 0 ? "晴" : code <= 2 ? "晴時多雲" : code === 3 ? "陰" : code <= 48 ? "有霧" : code <= 67 ? "下雨" : code <= 77 ? "下雪" : code <= 82 ? "陣雨" : "雷雨";
    weather = { text: txt, code, temp: Math.round(j.current.temperature_2m), rain: code >= 51 && code <= 99 && !(code >= 71 && code <= 77) };
    applyTime();
  }).catch(() => {});
}
let quoteIdx = Math.floor(Date.now() / 864e5);
function setQuote(i) {
  const q = QUOTES[(i % QUOTES.length + QUOTES.length) % QUOTES.length], el = $("#heroQuote");
  if (el) { el.innerHTML = '<span>今日名言</span>' + esc(q[0]) + '<small>' + esc(q[1]) + '</small>'; el.setAttribute("data-say", q[0] + "，" + q[1]); }
}
function updateHint() {
  const f = (store("birds") || []).length, el = $("#birdCount");
  if (el) el.textContent = BIRD_SPOTS.length ? f + " / " + BIRD_SPOTS.length : "—";
}
function markVisited(k) {
  const v = store("visited") || []; if (v.indexOf(k) < 0) { v.push(k); store("visited", v); }
  updateFootprints();
}
function updateFootprints() {
  const n = (store("visited") || []).length, total = GRADES.length * SUBJECTS.length;
  if ($("#footN")) { $("#footN").textContent = n; $("#footT").textContent = total; $("#footBar").style.width = Math.min(100, n / total * 100) + "%"; }
  const open = GRADES.reduce((a, g) => a + SUBJECTS.filter(s => isOpen(g.n, s.key)).length, 0);
  if ($("#statOpen")) $("#statOpen").textContent = open;
}
function refreshOpenState() {
  if (webgl) GRADES.forEach(g => SUBJECTS.forEach(s => { const b = islands[g.n].bld[s.key]; if (b.cone) b.cone.visible = !isOpen(g.n, s.key); }));
  refreshLabels(); updateFootprints();
  if ($("#modal").hidden) {
    if (focus.key) panelSubject(focus.g, focus.key, true);
    else if (focus.g) panelIsland(focus.g);
    else if (focus.g === null) panelHome();
  }
}
function hideHero() { document.body.classList.add("hero-off"); }

/* ---------- 上島探索指南、說明 ---------- */
const GUIDE = [
  ["點一座小島", "六座年級島圍著嘉蘭國小。點你的年級，鏡頭會飛過去。", '<path d="M8 30c4-6 10-9 16-9s12 3 16 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><ellipse cx="24" cy="31" rx="17" ry="5" fill="currentColor" opacity=".25"/><path d="M24 8v13M24 8l8 4-8 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'],
  ["選一座科目小島", "每座年級島旁邊有十座小島，一科一座。插著橘色三角錐的還在建造中。", '<rect x="12" y="16" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="3"/><path d="M9 18 24 8l15 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M21 32v-8h6v8" fill="none" stroke="currentColor" stroke-width="3"/>'],
  ["打開一課開始學", "點課名就能讀課文、學生字、做挑戰。看到喇叭就點，它會唸給你聽。", '<path d="M10 20v8h6l8 7V13l-8 7z" fill="currentColor"/><path d="M30 17a8 8 0 0 1 0 14M34 13a13 13 0 0 1 0 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'],
  ["找找台灣藍鵲", "島上躲著十隻台灣藍鵲，找到牠們就點一下！坐船繞島的大藍鵲是你的嚮導。", '<ellipse cx="22" cy="26" rx="10" ry="7" fill="currentColor"/><circle cx="31" cy="20" r="5" fill="currentColor"/><path d="M36 20l6 1.5-6 1.5z" fill="#D8322B"/><path d="M13 27 3 34l3 1 9-5z" fill="currentColor"/>']
];
function openGuide() {
  modalBack = location.hash.replace(/^#/, "") || "home"; if (modalBack === "guide") modalBack = "home";
  openModal('<div class="m-head"><h1 class="serif">上島探索指南</h1><button class="m-close" aria-label="關閉">×</button></div>' +
    '<p class="p-lede">四個步驟，帶你認識嘉蘭樂學島。點喇叭可以聽說明。</p><ol class="guide">' +
    GUIDE.map((g, i) => '<li><svg viewBox="0 0 48 48" aria-hidden="true">' + g[2] + '</svg><div><b><span>' + (i + 1) + '</span>' + g[0] + '</b><p>' + g[1] + '</p></div><button class="say icon"' + sayAttr(g[0] + "。" + g[1]) + ' aria-label="聽第' + (i + 1) + '步">' + ICON_SPEAK + '</button></li>').join("") +
    '</ol><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="guideGo">開始探險</button></div>', "guide-sheet");
  $("#guideGo").addEventListener("click", () => { store("guided", 1); go(modalBack); });
}
function openInfo() {
  modalBack = "home";
  const o = override || twNow();
  openModal('<div class="m-head"><h1 class="serif">關於嘉蘭樂學島</h1><button class="m-close" aria-label="關閉">×</button></div>' +
    '<p class="p-lede">嘉蘭國小一到六年級的學習島。島上的天空跟著臺灣現在的時間變化，白天、夜晚和四季都不一樣。</p>' +
    '<section class="t-sec"><h2>顯示設定</h2><div class="row">' +
      '<button class="pill' + (ui.names ? " on" : "") + '" id="optNames">島名標籤：' + (ui.names ? "顯示" : "隱藏") + '</button>' +
      '<button class="pill' + (ui.fx ? " on" : "") + '" id="optFx">季節特效與雲朵：' + (ui.fx ? "開" : "關") + '</button>' +
      '<button class="pill" data-go2="guide">上島探索指南</button></div>' +
      '<div class="row" style="margin-top:10px"><button class="pill' + (music.on ? " on" : "") + '" id="optMusic">背景音樂：' + (music.on ? "開" : "關") + '</button>' +
      '<button class="pill" id="optTracks">選擇曲目</button><label class="small vol" for="optVol">音量<input id="optVol" type="range" min="0" max="1" step="0.05" value="' + music.vol + '"></label></div></section>' +
    '<section class="t-sec"><h2>天空與海上</h2><p class="small">天上和海上會隨機出現老鷹、白鷺鷥、飛機和各種船，雷陣雨時大武山會打閃電。點牠們可以看說明。上課展示時可以直接切換天氣或召喚出來。</p>' +
      '<div class="row"><b class="small" style="min-width:3em">天氣</b>' + [["", "即時"], ["clear", "晴天"], ["cloudy", "陰天"], ["rain", "下雨"], ["storm", "雷陣雨"]].map(w => '<button class="pill' + ((wxOverride || "") === w[0] ? " on" : "") + '" data-wx="' + w[0] + '">' + w[1] + '</button>').join("") + '</div>' +
      '<div class="row" style="margin-top:8px"><b class="small" style="min-width:3em">召喚</b>' + Object.keys(AMB_NAME).map(k => '<button class="pill" data-spawn="' + k + '">' + AMB_NAME[k] + '</button>').join("") + '<button class="pill" data-spawn="rainbow">彩虹</button></div></section>' +
    '<section class="t-sec"><h2>時光機</h2><p class="small">暫時切換日期與時間，看看白天、夜晚和四季的樣子。</p>' +
      '<div class="form-row"><label for="pvDate">日期<input id="pvDate" type="date" value="' + o.y + "-" + ("0" + o.m).slice(-2) + "-" + ("0" + o.d).slice(-2) + '"></label><label for="pvTime">時間<input id="pvTime" type="time" value="' + ("0" + o.h).slice(-2) + ":" + ("0" + o.mi).slice(-2) + '"></label></div>' +
      '<div class="row" style="margin-top:10px">' + [["春天早晨", "04-02", "07:30"], ["夏天夜晚", "07-15", "20:30"], ["秋天黃昏", "10-25", "17:15"], ["冬天中午", "01-10", "12:20"]].map(x => '<button class="pill" data-pv="' + x[1] + " " + x[2] + '">' + x[0] + '</button>').join("") + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn" id="pvGo">預覽</button><button class="btn ghost" id="pvReset">回到現在</button></div></section>' +
    '<section class="t-sec"><h2>老師</h2><p class="small">QR Code、預覽模式、教材試算表連線檢查都在老師專區。</p><button class="btn" data-go2="teacher">老師專區</button></section>' +
    '<p class="small">嘉蘭樂學島．臺東縣金峰鄉嘉蘭國小｜教材內容整理自出版社教科書，僅供教學使用。</p>', "info-sheet");
  $("#optNames").addEventListener("click", () => { ui.names = !ui.names; openInfo(); });
  $all("[data-wx]").forEach(b => b.addEventListener("click", () => { wxOverride = b.getAttribute("data-wx") || null; applyTime(); openInfo(); toast("天氣：" + (wxOverride ? WX_NAME[wxOverride] : "即時天氣")); }));
  $all("[data-spawn]").forEach(b => b.addEventListener("click", () => {
    const k = b.getAttribute("data-spawn"); if (!webgl) return;
    ui.fx = true; if (particles) particles.visible = true;
    if (k === "rainbow") { amb.rainbowUntil = amb.t + 90; ambWeather(amb.kind, S.dark); toast("彩虹出現了！它會在太陽的對面。"); }
    else spawn(k, true);
    go("home");
  }));
  $("#optMusic").addEventListener("click", () => { setMusic(!music.on); openInfo(); });
  $("#optTracks").addEventListener("click", () => { go("home"); setTimeout(() => toggleMusicPop(true), 50); });
  $("#optVol").addEventListener("input", e => { music.vol = +e.target.value; saveMusic(); if (!music.on && music.vol > 0) setMusic(true); applyMusicVolume(0.2); });
  $("#optFx").addEventListener("click", () => { ui.fx = !ui.fx; if (particles) particles.visible = ui.fx; openInfo(); });
  $all("[data-go2]").forEach(b => b.addEventListener("click", () => go(b.getAttribute("data-go2"))));
  $("#pvGo").addEventListener("click", () => setPreview($("#pvDate").value, $("#pvTime").value));
  $("#pvReset").addEventListener("click", () => { override = null; applyTime(); toast("已回到現在時間"); });
  $all("[data-pv]").forEach(b => b.addEventListener("click", () => { const v = b.getAttribute("data-pv").split(" "); setPreview(twNow().y + "-" + v[0], v[1]); }));
}
function setPreview(dstr, tstr) {
  const d = dstr.split("-"), t = tstr.split(":");
  override = { y: +d[0], m: +d[1], d: +d[2], h: +t[0], mi: +t[1] }; applyTime(); toast("時光機：" + d[1] + "月" + d[2] + "日 " + tstr);
}
let dnStep = 0;
function cycleDayNight() {
  const now = twNow(), y = new Date().getFullYear(), md = (override || now);
  dnStep = (dnStep + 1) % 3;
  if (dnStep === 0) { override = null; applyTime(); toast("回到現在時間"); return; }
  const ds = md.y + "-" + ("0" + md.m).slice(-2) + "-" + ("0" + md.d).slice(-2);
  setPreview(ds || y + "-01-01", dnStep === 1 ? "11:30" : "21:00");
}

/* ---------- 島嶼導覽 ---------- */
let tourTimer = null;
function startTour() {
  if (tourTimer) return stopTour();
  hideHero();
  let i = 0; $("#tourBtn").classList.add("on"); $("#tourBtn").setAttribute("aria-pressed", "true");
  const step = () => { const n = i % 7; go(n === 0 ? "hub" : "g" + n); i++; };
  step(); tourTimer = setInterval(step, 5200);
}
function stopTour() {
  if (!tourTimer) return; clearInterval(tourTimer); tourTimer = null;
  const b = $("#tourBtn"); if (b) { b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); }
}

/* ===================== 路由 ===================== */
function go(h) { if (location.hash === "#" + h) route(); else location.hash = "#" + h; }
function route() {
  const h = (location.hash || "").replace(/^#/, "") || "home";
  let m;
  if (h === "teacher") { openTeacher(); return; }
  if (h === "list") { openList(); return; }
  if (h === "certs") { openCerts(); return; }
  if (h === "guide") { openGuide(); return; }
  if (h === "info") { openInfo(); return; }
  closeModal();
  if (h !== "home") hideHero();
  if (h === "hub") { focus.g = 0; focus.key = null; panelHub(); fly("hub", () => { const t = new V3(0, 0.6, 0), p = new V3(3, isMobile() ? 38 : 25, isMobile() ? 44 : 30); shiftForPanel(t, p); return { target: t, pos: p }; }); }
  else if ((m = h.match(/^g([1-6])$/))) { focus.g = +m[1]; focus.key = null; panelIsland(+m[1]); fly(h, () => islandPose(+m[1])); speak(GRADES[m[1] - 1].name + "學習島"); }
  else if ((m = h.match(/^g([1-6])-([a-z]+)$/)) && subjectOf(m[2])) { focus.g = +m[1]; focus.key = m[2]; panelSubject(+m[1], m[2]); fly(h, () => buildingPose(+m[1], m[2])); markVisited(h); }
  else if ((m = h.match(/^g([1-6])-([a-z]+)-(?:(\d+)-)?([A-Za-z0-9]+)$/)) && subjectOf(m[2])) {
    const same = focus.g === +m[1] && focus.key === m[2] && !$("#panel").hidden;
    focus.g = +m[1]; focus.key = m[2]; if (!same) panelSubject(+m[1], m[2], true); fly("g" + m[1] + "-" + m[2], () => buildingPose(+m[1], m[2])); markVisited("g" + m[1] + "-" + m[2]); openLesson(+m[1], m[2], +(m[3] || 1), m[4]);
  }
  else { focus.g = null; focus.key = null; panelHome(); if (ui.view === "bird") fly("bird", () => viewPose("bird")); else fly("home", () => viewPose("pano")); }
  $all("#gradeSeg button").forEach(b => b.classList.toggle("on", +b.getAttribute("data-g") === (focus.g || 0) && (focus.g !== null || +b.getAttribute("data-g") === 0)));
  $all(".vbtn").forEach(b => b.classList.toggle("on", h === "home" && b.getAttribute("data-view") === ui.view));
}
function fly(key, poseFn) {
  if (!webgl) return;
  if (focus.flyKey === key && !tween.active) return;
  focus.flyKey = key; flyTo(poseFn());
}

/* ===================== 背景音樂：即時合成的六首曲子＋串燒輪播 ===================== */
const music = { ctx: null, on: true, vol: 0.5, mode: "medley", started: false, timer: null, duck: 1, layers: {}, cur: null, nextSwitch: 0 };
try { const p = JSON.parse(localStorage.getItem("jialan:music") || "null"); if (p) { music.on = p.on !== false; music.vol = p.vol == null ? 0.5 : p.vol; music.mode = p.mode || "medley"; } } catch (e) {}
function saveMusic() { try { localStorage.setItem("jialan:music", JSON.stringify({ on: music.on, vol: music.vol, mode: music.mode })); } catch (e) {} }
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const pickR = a => a[Math.floor(Math.random() * a.length)];
const MEDLEY_SEC = 150;
function noiseBuf(ctx, sec, kind) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0); let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === "crackle") d[i] = Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.9 : w * 0.012;
    else d[i] = w;
  }
  return b;
}
/* ---------- 樂器 ---------- */
function env(g, t, a, peak, dec, sus, end) {
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
  if (dec) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + dec);
  g.gain.exponentialRampToValueAtTime(0.0001, t + end);
}
function outTo(g, wetAmt) { const c = music.cur; g.connect(c.dry); if (wetAmt) { const s = music.ctx.createGain(); s.gain.value = wetAmt; g.connect(s); s.connect(c.wet); } }
function epiano(t, m, vel, dur, wet = 1) {
  const ctx = music.ctx, f = hz(m), g = ctx.createGain(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), g3 = ctx.createGain();
  o1.type = "sine"; o1.frequency.value = f; o2.type = "triangle"; o2.frequency.value = f * 1.003; o3.type = "sine"; o3.frequency.value = f * 4;
  env(g, t, 0.012, vel, 0.5, 0.35, dur);
  g3.gain.setValueAtTime(0.18, t); g3.gain.exponentialRampToValueAtTime(0.002, t + 0.25);
  o1.connect(g); o2.connect(g); o3.connect(g3); g3.connect(g); outTo(g, wet);
  [o1, o2, o3].forEach(o => { o.start(t); o.stop(t + dur + 0.05); });
}
function bassNote(t, m, dur, vel = 0.32, type = "triangle") {
  const ctx = music.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = hz(m); f.type = "lowpass"; f.frequency.value = 420;
  env(g, t, 0.02, vel, 0, 0, dur); o.connect(f); f.connect(g); outTo(g, 0); o.start(t); o.stop(t + dur + 0.05);
}
const _ks = {};
function ksBuffer(m, bright) {
  const k = m + (bright ? "b" : "n"); if (_ks[k]) return _ks[k];
  const ctx = music.ctx, sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / hz(m))), len = Math.floor(sr * 2.2), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
  const ring = new Float32Array(N); let lp = 0;
  for (let i = 0; i < N; i++) { lp = lp * (bright ? 0.3 : 0.65) + (Math.random() * 2 - 1) * (bright ? 0.7 : 0.35); ring[i] = lp; }
  const damp = bright ? 0.997 : 0.994;
  for (let i = 0; i < len; i++) { const j = i % N, nx = (i + 1) % N; d[i] = ring[j]; ring[j] = damp * 0.5 * (ring[j] + ring[nx]); }
  return (_ks[k] = b);
}
function pluck(t, m, vel, bright, wet = 0.8) {
  const ctx = music.ctx, s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = ksBuffer(m, bright);
  g.gain.value = vel * 1.6; s.connect(g); outTo(g, wet); s.start(t); s.stop(t + 2.2);
}
function musicBox(t, m, vel) {
  const ctx = music.ctx, f = hz(m), g = ctx.createGain(); env(g, t, 0.004, vel, 0.08, 0.4, 1.8);
  [[1, 1], [3.98, 0.35], [8.1, 0.12]].forEach(([r, a]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f * r; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.9); });
  outTo(g, 1.4);
}
function flute(t, m, dur, vel) {    // 鼻笛風：帶氣音的柔和笛聲
  const ctx = music.ctx, f = hz(m), g = ctx.createGain(), o = ctx.createOscillator(), o2 = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(f * 0.985, t); o.frequency.linearRampToValueAtTime(f, t + 0.12);
  o2.type = "triangle"; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.08;
  vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.6, dur * 0.5)); vib.connect(vg); vg.connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.14); g.gain.setValueAtTime(vel * 0.85, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  const nb = ctx.createBufferSource(); nb.buffer = music.noise; const bf = ctx.createBiquadFilter(); bf.type = "bandpass"; bf.frequency.value = f * 2; bf.Q.value = 2; const ng = ctx.createGain(); ng.gain.value = 0.35;
  nb.connect(bf); bf.connect(ng); ng.connect(g);
  o.connect(g); o2.connect(g2); g2.connect(g); outTo(g, 1.6);
  [o, o2, vib].forEach(x => { x.start(t); x.stop(t + dur + 0.05); }); nb.start(t, Math.random()); nb.stop(t + dur + 0.05);
}
function pad(t, notes, dur, vel) {
  const ctx = music.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  notes.forEach((m, i) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = (i % 2 ? 6 : -6); o.connect(f); o.start(t); o.stop(t + dur + 0.05); });
  f.connect(g); outTo(g, 1.2);
}
function drum(t, kind, vel = 1) {
  const ctx = music.ctx;
  if (kind === "kick") {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    env(g, t, 0.003, 0.5 * vel, 0, 0, 0.35); o.connect(g); outTo(g, 0); o.start(t); o.stop(t + 0.4); return;
  }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = music.noise;
  const P = { brush: ["bandpass", 1800, 0.6, 0.03, 0.16, 0.28], hat: ["highpass", 7000, 0.7, 0.002, 0.07, 0.06], snare: ["bandpass", 1500, 0.8, 0.002, 0.22, 0.18], rim: ["bandpass", 2600, 6, 0.001, 0.25, 0.05], shaker: ["highpass", 5000, 0.7, 0.02, 0.05, 0.09], wood: ["bandpass", 1100, 9, 0.001, 0.4, 0.08] }[kind];
  f.type = P[0]; f.frequency.value = P[1]; f.Q.value = P[2]; env(g, t, P[3], P[4] * vel, 0, 0, P[5]);
  s.connect(f); f.connect(g); outTo(g, kind === "wood" ? 0.8 : 0.15); s.start(t, Math.random() * 0.5); s.stop(t + P[5] + 0.05);
  if (kind === "snare") { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = 190; env(og, t, 0.002, 0.15 * vel, 0, 0, 0.1); o.connect(og); outTo(og, 0); o.start(t); o.stop(t + 0.12); }
}
/* ---------- 曲目 ---------- */
const chordAt = (prog, st, steps) => prog[Math.floor(st / steps) % prog.length];
const TRACKS = [
  { id: "cafe", name: "咖啡館爵士", desc: "電鋼琴、貝斯和刷子鼓", bpm: 70, sub: 2, beats: 4, swing: 0.18, tone: 2600,
    prog: [[50, 62, 65, 69, 72], [43, 59, 64, 65, 69], [48, 60, 64, 67, 71], [45, 60, 64, 67, 69], [41, 57, 60, 64, 67], [40, 55, 59, 62, 64], [50, 60, 62, 65, 69], [43, 59, 62, 65, 67]],
    play(st, t, n) { const i = st % 8, c = chordAt(this.prog, st, 8);
      if (i === 0) c.slice(1, 5).forEach((m, k) => epiano(t + k * 0.025, m, 0.07, 3.3));
      if (i === 3 && Math.random() < 0.5) c.slice(2, 5).forEach((m, k) => epiano(t + k * 0.02, m, 0.05, 1.4));
      if (i === 0) bassNote(t, c[0], 1.5); if (i === 4) bassNote(t, c[0] + (Math.random() < 0.5 ? 7 : 0), 1.3);
      if (i % 2 === 0 && Math.random() < 0.18) epiano(t, pickR([72, 74, 76, 79, 81, 84]), 0.05, 2);
      if (!n) { if (i === 0 || i === 5) drum(t, "kick", i ? 0.6 : 1); if (i === 2 || i === 6) drum(t, "brush"); drum(t, "hat", i % 2 ? 0.6 : 1); } } },
  { id: "bossa", name: "巴薩諾瓦", desc: "尼龍吉他與沙鈴，海邊的午後", bpm: 124, sub: 2, beats: 4, swing: 0, tone: 3200,
    prog: [[48, 64, 67, 71, 74], [45, 64, 67, 69, 73], [50, 65, 69, 72, 76], [43, 65, 67, 71, 74], [52, 62, 67, 71, 74], [45, 61, 64, 67, 72], [50, 60, 65, 69, 72], [43, 59, 65, 67, 71]],
    play(st, t, n) { const i = st % 8, bar = Math.floor(st / 8), c = chordAt(this.prog, st, 8);
      if (i === 0 || i === 4) pluck(t, c[0] - 12 + (i ? 7 : 0) + 12, 0.32, false, 0.3);
      if ([1, 3, 4, 6].includes(i)) c.slice(1, 4).forEach((m, k) => pluck(t + k * 0.012, m, 0.16, false));
      if ((bar % 2 === 0 ? [0, 3, 6] : [2, 4]).includes(i)) drum(t, "rim", n ? 0.5 : 0.9);
      if (!n) drum(t, "shaker", i % 2 ? 0.6 : 1);
      if (i === 2 && Math.random() < 0.35) epiano(t, pickR([76, 79, 81, 83, 84]), 0.045, 1.6); } },
  { id: "lofi", name: "海邊 lo-fi", desc: "慵懶的鍵盤和節拍，適合讀書", bpm: 76, sub: 2, beats: 4, swing: 0.12, tone: 1700,
    prog: [[41, 60, 64, 67, 69], [40, 59, 62, 66, 67], [38, 57, 60, 64, 65], [36, 55, 59, 62, 64]],
    play(st, t, n) { const i = st % 8, c = chordAt(this.prog, st, 8);
      if (i === 0) c.slice(1).forEach((m, k) => epiano(t + k * 0.03, m, 0.065, 3.8, 1.3));
      if (i === 6) c.slice(2, 4).forEach((m, k) => epiano(t + k * 0.03, m + 12, 0.035, 1.2, 1.3));
      if (i === 0 || i === 3) bassNote(t, c[0], 1.2, 0.36, "sine");
      if (!n) { if (i === 0 || i === 5) drum(t, "kick"); if (i === 2 || i === 6) drum(t, "snare", 0.8); drum(t, "hat", i % 2 ? 0.45 : 0.8); } } },
  { id: "flute", name: "山谷鼻笛", desc: "排灣族鼻笛風格的笛聲與山風", bpm: 58, sub: 2, beats: 4, swing: 0, tone: 2400,
    scale: [62, 64, 67, 69, 71, 74, 76], drone: [[38, 45, 50], [36, 43, 48], [38, 45, 50], [40, 47, 52]],
    play(st, t, n) { const i = st % 16, bar2 = Math.floor(st / 16), sp = 60 / this.bpm / this.sub;
      if (i === 0) pad(t, this.drone[bar2 % this.drone.length], sp * 16.5, 0.05);
      if (i === 0) { this.mel = []; let k = 2 + Math.floor(Math.random() * 3); for (let s = 0; s < 4; s++) { k = Math.max(0, Math.min(this.scale.length - 1, k + pickR([-2, -1, -1, 1, 1, 2, 0]))); this.mel.push(this.scale[k]); } }
      const at = { 0: [0, 4], 4: [1, 3], 8: [2, 2], 10: [3, 5] }[i];
      if (at && this.mel && (bar2 % 4 !== 3 || i < 8)) flute(t, this.mel[at[0]], sp * at[1] * 1.05, 0.11);
      if (i === 0 || i === 8) drum(t, "wood", 0.5); } },
  { id: "musicbox", name: "星空音樂盒", desc: "三拍子的音樂盒搖籃曲", bpm: 84, sub: 2, beats: 3, swing: 0, tone: 3600,
    prog: [[48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62]],
    play(st, t, n) { const i = st % 6, c = chordAt(this.prog, st, 12), up = c.slice(1).map(m => m + 24);
      musicBox(t, up[[0, 1, 2, 1, 2, 1][i]] + (i === 3 && Math.random() < 0.3 ? 12 : 0), 0.08);
      if (i === 0) bassNote(t, c[0] + 12, 1.8, 0.16, "sine");
      if (i === 0 && Math.floor(st / 6) % 2 === 1 && Math.random() < 0.6) musicBox(t + 0.01, up[2] + 12, 0.06); } },
  { id: "guitar", name: "原聲吉他", desc: "溫暖的指彈吉他民謠", bpm: 92, sub: 2, beats: 4, swing: 0.08, tone: 3000,
    prog: [[43, 55, 59, 62, 67], [38, 54, 57, 62, 66], [40, 55, 59, 64, 67], [36, 55, 60, 64, 67]],
    play(st, t, n) { const i = st % 8, c = chordAt(this.prog, st, 8);
      if (i % 2 === 0) pluck(t, (i % 4 === 0 ? c[0] : c[0] + 7) + 12, 0.28, false, 0.4);
      else pluck(t, c[[3, 4, 2, 4][(i - 1) / 2]], 0.15, true);
      if (i === 4 && Math.random() < 0.4) pluck(t + 0.01, c[4] + 12, 0.1, true);
      if (!n && i % 2) drum(t, "shaker", 0.7); } }
];
const trackById = id => TRACKS.find(x => x.id === id) || TRACKS[0];
function startMusic() {
  if (music.started) { if (music.ctx.state === "suspended") music.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = music.ctx = new AC(); music.started = true;
  music.noise = noiseBuf(ctx, 2, "white");
  const master = music.master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(master);
  const tone = music.tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 2600; tone.connect(comp);
  const rv = music.rv = ctx.createConvolver(), ir = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6); }
  rv.buffer = ir; const rvGain = ctx.createGain(); rvGain.gain.value = 0.3; rv.connect(rvGain); rvGain.connect(tone);
  const cr = ctx.createBufferSource(); cr.buffer = noiseBuf(ctx, 4, "crackle"); cr.loop = true; const crG = ctx.createGain(); crG.gain.value = 0.3; cr.connect(crG); crG.connect(tone); cr.start();
  const sea = ctx.createBufferSource(); sea.buffer = noiseBuf(ctx, 6, "brown"); sea.loop = true;
  const seaF = ctx.createBiquadFilter(); seaF.type = "lowpass"; seaF.frequency.value = 700; const seaG = ctx.createGain(); seaG.gain.value = 0.05;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.08; lfoG.gain.value = 0.04; lfo.connect(lfoG); lfoG.connect(seaG.gain); lfo.start();
  sea.connect(seaF); seaF.connect(seaG); seaG.connect(comp); sea.start();
  const rain = ctx.createBufferSource(); rain.buffer = noiseBuf(ctx, 3, "white"); rain.loop = true;
  const rainF = ctx.createBiquadFilter(); rainF.type = "bandpass"; rainF.frequency.value = 2400; rainF.Q.value = 0.4;
  const rainG = ctx.createGain(); rainG.gain.value = 0; rain.connect(rainF); rainF.connect(rainG); rainG.connect(comp); rain.start();
  music.layers = { seaG, rainG };
  playTrack(music.mode === "medley" ? TRACKS[Math.floor(Math.random() * TRACKS.length)].id : music.mode, 0.2);
  music.timer = setInterval(scheduleMusic, 60);
  applyMusicVolume(1.5);
}
function playTrack(id, fade = 3) {
  const ctx = music.ctx, tr = trackById(id), t = ctx.currentTime, old = music.cur;
  if (old) { [old.dry, old.wet].forEach(g => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); }); setTimeout(() => { try { old.dry.disconnect(); old.wet.disconnect(); } catch (e) {} }, fade * 1000 + 3000); }
  const dry = ctx.createGain(), wet = ctx.createGain(); dry.connect(music.tone); wet.connect(music.rv);
  dry.gain.setValueAtTime(0, t); dry.gain.linearRampToValueAtTime(1, t + fade); wet.gain.setValueAtTime(0, t); wet.gain.linearRampToValueAtTime(1, t + fade);
  music.cur = { tr, dry, wet, step: 0, next: t + 0.1 };
  music.nextSwitch = t + MEDLEY_SEC;
  music.tone.frequency.setTargetAtTime(tr.tone, t, 1.5);
  renderMusicPop();
}
function applyMusicVolume(ramp) {
  if (!music.started) return;
  const t = music.ctx.currentTime, target = music.on ? 0.55 * music.vol * music.duck : 0;
  music.master.gain.cancelScheduledValues(t); music.master.gain.setValueAtTime(music.master.gain.value, t);
  music.master.gain.linearRampToValueAtTime(target, t + (ramp || 0.4));
  if (!music.on) setTimeout(() => { if (!music.on && music.ctx.state === "running") music.ctx.suspend(); }, (ramp || 0.4) * 1000 + 100);
  else if (music.ctx.state === "suspended") music.ctx.resume();
}
function musicDuck(on) { music.duck = on ? 0.3 : 1; applyMusicVolume(on ? 0.25 : 1.2); }
function scheduleMusic() {
  const ctx = music.ctx; if (!ctx || ctx.state !== "running" || !music.cur) return;
  const night = typeof S !== "undefined" && S.dark > 0.5, wk = typeof wxKind === "function" ? wxKind() : "clear", rainy = wk === "rain" || wk === "storm";
  music.layers.rainG.gain.setTargetAtTime(rainy ? (wk === "storm" ? 0.09 : 0.06) : 0, ctx.currentTime, 2);
  if (music.mode === "medley" && ctx.currentTime > music.nextSwitch) {
    const i = TRACKS.indexOf(music.cur.tr); playTrack(TRACKS[(i + 1) % TRACKS.length].id, 4);
  }
  const c = music.cur, tr = c.tr, step = 60 / tr.bpm / tr.sub;
  while (c.next < ctx.currentTime + 0.25) {
    const swing = c.step % 2 ? step * tr.swing : 0;
    try { tr.play(c.step, c.next + swing, night); } catch (e) {}
    c.step++; c.next += step;
  }
}
function setMusic(on) {
  music.on = on; saveMusic();
  if (on) startMusic();
  applyMusicVolume(on ? 1.2 : 0.5);
  const b = document.getElementById("musicBtn");
  if (b) { b.classList.toggle("on", on); b.setAttribute("aria-label", "背景音樂：" + (on ? "開" : "關")); b.innerHTML = ico(on ? "music" : "musicOff"); }
  renderMusicPop();
}
function chooseTrack(id) {
  music.mode = id; saveMusic();
  if (!music.on) { music.on = true; saveMusic(); }
  if (!music.started) startMusic();
  else { playTrack(id === "medley" ? (music.cur ? music.cur.tr.id : TRACKS[0].id) : id, music.cur && id !== "medley" ? 2.5 : 0.01); if (id !== "medley") music.nextSwitch = Infinity; }
  setMusic(true);
}
function renderMusicPop() {
  const p = document.getElementById("musicPop"); if (!p || p.hidden) return;
  const now = music.cur ? music.cur.tr : null;
  p.innerHTML = '<div class="mp-head"><b>背景音樂</b><button class="switch' + (music.on ? " on" : "") + '" id="mpOn" role="switch" aria-checked="' + music.on + '"><i></i><span>' + (music.on ? "開" : "關") + '</span></button></div>' +
    (music.on && now ? '<p class="mp-now">正在播放：<b>' + esc(now.name) + '</b></p>' : '<p class="mp-now">音樂已關閉</p>') +
    '<div class="mp-list">' + [{ id: "medley", name: "串燒輪播", desc: "六首曲子每兩分半輪流播放" }].concat(TRACKS).map(x =>
      '<button class="mp-item' + (music.mode === x.id ? " sel" : "") + '" data-track="' + x.id + '"><i>' + (music.mode === x.id ? "▶" : "") + '</i><span><b>' + esc(x.name) + '</b><small>' + esc(x.desc) + '</small></span></button>').join("") + '</div>' +
    '<label class="mp-vol" for="mpVol">音量<input id="mpVol" type="range" min="0" max="1" step="0.05" value="' + music.vol + '"></label>';
  p.querySelector("#mpOn").addEventListener("click", () => setMusic(!music.on));
  p.querySelectorAll("[data-track]").forEach(b => b.addEventListener("click", () => chooseTrack(b.getAttribute("data-track"))));
  p.querySelector("#mpVol").addEventListener("input", e => { music.vol = +e.target.value; saveMusic(); applyMusicVolume(0.2); });
}
function toggleMusicPop(force) {
  const p = document.getElementById("musicPop"); const show = force !== undefined ? force : p.hidden;
  p.hidden = !show; if (show) { renderMusicPop(); if (music.on) startMusic(); }
}
document.addEventListener("visibilitychange", () => { if (!music.started) return; if (document.hidden) music.ctx.suspend(); else if (music.on) music.ctx.resume(); });
function armMusicStart() {
  const go = () => { document.removeEventListener("pointerdown", go, true); document.removeEventListener("keydown", go, true); if (music.on) { startMusic(); applyMusicVolume(2); } };
  document.addEventListener("pointerdown", go, true); document.addEventListener("keydown", go, true);
}

/* ===================== 啟動 ===================== */
const IC = {
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  bird: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
  minus: '<path d="M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  plus: '<path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sun: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  reset: '<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17 3v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  pause: '<path d="M9 6v12M15 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  music: '<path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/>',
  musicOff: '<path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" opacity=".45"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor" opacity=".45"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor" opacity=".45"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l4 6M21 9l-4 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  tour: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.2" fill="currentColor"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.8"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6v14" stroke="currentColor" stroke-width="1.8"/>',
  anchor: '<circle cx="12" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v13M5 13a7 7 0 0 0 14 0M8 10h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
};
const ico = k => '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[k] + '</svg>';
const LOGO = '<img src="assets/logo.png" alt="嘉蘭國小校徽" width="46" height="46">';
function start() {
  $("#app").innerHTML =
    '<canvas id="world" aria-label="嘉蘭樂學島 3D 地圖"></canvas><div id="labels" aria-label="地圖標示"></div>' +
    '<header class="bar bar-top">' +
      '<button class="hchip clock" id="clockChip" aria-label="現在時間，點一下開啟說明與時光機"></button>' +
      '<a class="brand" href="#home">' + LOGO + '<span><small>JIALAN · JOYFUL LEARNING ISLAND</small><b>嘉蘭<em>樂學島</em></b></span></a>' +
      '<nav class="seg" id="gradeSeg" aria-label="選擇學習島"><button data-g="0" class="on">全島探索 <small>6</small></button>' + GRADES.map(g => '<button data-g="' + g.n + '" style="--g:' + g.color + '"><i></i>' + g.name + '</button>').join("") + '</nav>' +
      '<button class="icon-btn" id="listBtn" aria-label="學習島清單" title="學習島清單">' + ico("map") + '</button>' +
    '</header>' +
    '<section class="hero" aria-label="歡迎">' +
      '<p class="kicker">一 座 島 嶼 ， 一 扇 學 習 的 窗</p>' +
      '<h1 class="serif">從大武山出發，<br>讓好奇心遊遍六座島。</h1>' +
      '<hr><p class="sub">在山與海之間，一到六年級的孩子都有自己的學習島。</p>' +
      '<p class="hint">拖曳旋轉　·　滾輪縮放　·　點選島嶼探索</p>' +
      '<button class="hero-quote" id="heroQuote"></button>' +
    '</section>' +
    '<div class="hchip place" id="placeChip"></div>' +
    '<button class="hchip guide-btn" id="guideBtn">' + ico("book") + '上島探索指南</button>' +
    '<p class="tagline">✦　每一座島，都在等你發現</p>' +
    '<div class="hchip stat">' + ico("anchor") + '嘉蘭群島<span class="sep"></span>6 學習島・60 學習館・開放 <b id="statOpen">0</b> 館</div>' +
    '<aside id="panel" class="panel-card" hidden></aside>' +
    '<button id="panelTab" class="panel-tab" type="button" aria-controls="panel" aria-expanded="true" title="收合卡片"><span class="pt-arrow" aria-hidden="true">›</span><span class="pt-label"></span></button>' +
    '<footer class="bar bar-bottom">' +
      '<div class="foot-l"><span class="foot-ic">' + ico("book") + '</span><div class="foot-txt"><small>我的探索足跡</small><b><span id="footN">0</span><em> / <span id="footT">60</span></em></b></div><div class="foot-bar"><i id="footBar"></i></div><button class="foot-cert" id="certBtn" type="button" title="我的證書" aria-label="我的證書">🎓<b id="certN">0</b></button>' +
        '<div class="foot-txt magpie"><small>台灣藍鵲</small><b id="birdCount">0 / 10</b></div></div>' +
      '<nav class="tools" aria-label="地圖工具">' +
        '<button class="tool wide vbtn on" data-view="pano">' + ico("home") + '<span>全景</span></button>' +
        '<button class="tool wide vbtn" data-view="bird">' + ico("bird") + '<span>鳥瞰</span></button><i class="div"></i>' +
        '<button class="tool" id="zoomOut" aria-label="縮小">' + ico("minus") + '</button><button class="tool" id="zoomIn" aria-label="放大">' + ico("plus") + '</button><i class="div"></i>' +
        '<button class="tool daynight" id="dnBtn" aria-label="切換白天、夜晚、現在">' + ico("sun") + '</button>' +
        '<button class="tool" id="resetBtn" aria-label="重設視角">' + ico("reset") + '</button>' +
        '<button class="tool wide" id="pauseBtn" aria-pressed="false">' + ico("pause") + '<span>動畫</span></button>' +
        '<button class="tool" id="soundBtn" aria-label="自動朗讀：開">' + ico("sound") + '</button>' +
        '<button class="tool' + (music.on ? " on" : "") + '" id="musicBtn" aria-pressed="' + music.on + '" aria-label="背景音樂：' + (music.on ? "開" : "關") + '" title="背景音樂">' + ico(music.on ? "music" : "musicOff") + '</button><i class="div"></i>' +
        '<button class="tool wide accent" id="tourBtn" aria-pressed="false">' + ico("tour") + '<span>島嶼導覽</span></button>' +
        '<button class="tool" id="fullBtn" aria-label="全螢幕">' + ico("full") + '</button>' +
        '<button class="tool" id="infoBtn" aria-label="說明與設定">' + ico("info") + '</button>' +
      '</nav>' +
    '</footer>' +
    '<div class="card musicpop" id="musicPop" hidden role="dialog" aria-label="背景音樂"></div>' +
    '<div id="modal" hidden></div><div id="toast" class="toast" role="status"></div>';
  setQuote(quoteIdx);
  $("#heroQuote").addEventListener("click", () => setQuote(++quoteIdx));
  $all("#gradeSeg button").forEach(b => b.addEventListener("click", () => { stopTour(); const n = +b.getAttribute("data-g"); if (!n) { ui.view = "pano"; focus.flyKey = ""; } go(n ? "g" + n : "home"); }));
  $("#listBtn").addEventListener("click", () => go("list"));
  $("#certBtn").addEventListener("click", () => go("certs")); updateCertCount();
  $("#guideBtn").addEventListener("click", () => go("guide"));
  $("#panelTab").addEventListener("click", () => setPanelMin(!panelMin()));
  try { if (localStorage.getItem("jialan:panelMin") === "1") setPanelMin(true, false); } catch (e) {}
  $("#clockChip").addEventListener("click", () => go("info"));
  $("#infoBtn").addEventListener("click", () => go("info"));
  $("#tourBtn").addEventListener("click", startTour);
  $all(".vbtn").forEach(b => b.addEventListener("click", () => { stopTour(); ui.view = b.getAttribute("data-view"); focus.flyKey = ""; go("home"); }));
  $("#zoomIn").addEventListener("click", () => zoomBy(0.75));
  $("#zoomOut").addEventListener("click", () => zoomBy(1.33));
  $("#resetBtn").addEventListener("click", () => { stopTour(); focus.flyKey = ""; ui.view = "pano"; go("home"); });
  $("#dnBtn").addEventListener("click", cycleDayNight);
  $("#pauseBtn").addEventListener("click", function () { ui.paused = !ui.paused; this.classList.toggle("on", ui.paused); this.setAttribute("aria-pressed", ui.paused); this.innerHTML = ico(ui.paused ? "play" : "pause") + "<span>動畫</span>"; });
  $("#musicBtn").addEventListener("click", e => { e.stopPropagation(); toggleMusicPop(); });
  document.addEventListener("pointerdown", e => { const p = $("#musicPop"); if (p && !p.hidden && !p.contains(e.target) && !e.target.closest("#musicBtn")) toggleMusicPop(false); });
  armMusicStart();
  $("#soundBtn").addEventListener("click", function () { ui.mute = !ui.mute; this.innerHTML = ico(ui.mute ? "mute" : "sound"); this.setAttribute("aria-label", "自動朗讀：" + (ui.mute ? "關" : "開")); this.classList.toggle("on", ui.mute); toast(ui.mute ? "自動朗讀已關閉（喇叭按鈕仍可使用）" : "自動朗讀已開啟"); if (ui.mute) stopSpeak(); });
  $("#fullBtn").addEventListener("click", () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} });
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") $(".m-close") && $(".m-close").click(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) $(".m-close").click(); });
  initLocalBooks();
  const ok = initWorld();
  if (!ok) document.body.classList.add("no-webgl");
  updateHint(); updateFootprints(); applyTime(); loadWeather();
  addEventListener("hashchange", route); route();
  loadRegistry().then(() => { refreshOpenState(); if (location.hash === "#teacher") openTeacher(); });
  if (!ok && !location.hash) go("list");
  else if (!store("guided") && (!location.hash || location.hash === "#home")) setTimeout(() => { if (!location.hash || location.hash === "#home") go("guide"); }, 1200);
  setInterval(() => { if (!override) applyTime(); }, 30000);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
