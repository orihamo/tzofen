"use strict";
(function(){
  var P = window.HTMLDialogElement ? HTMLDialogElement.prototype : HTMLElement.prototype;
  if (typeof P.showModal === "function") return;
  P.showModal = function(){ this.setAttribute("open", ""); document.documentElement.classList.add("dlg-poly") };
  P.close = function(){ if (!this.hasAttribute("open")) return; this.removeAttribute("open"); this.dispatchEvent(new Event("close")) };
  if (!window.HTMLDialogElement) Object.defineProperty(P, "open", {configurable: true, get: function(){ return this.hasAttribute("open") }});
  document.addEventListener("keydown", function(e){
    if (e.key !== "Escape") return;
    var l = document.querySelectorAll("dialog[open]"), d = l[l.length - 1]; if (!d) return;
    var c = new Event("cancel", {cancelable: true}); d.dispatchEvent(c); if (!c.defaultPrevented) d.close();
  });
})();

function safeUrl(u, only){
  try{ const x = new URL(String(u || "").trim()); return (only || ["http:","https:","mailto:","tel:"]).includes(x.protocol) ? x.href : "" }catch(e){ return "" }
}
function cleanTitle(t){
  const s = String(t == null ? "" : t).replace(/(?:\s+-\s*)?\s*להגיש כאן(?:\s*-\s*שב)?\s*$/u, "").replace(/\s+-שב\s*$/u, "").trim();
  const out = s.replace(/(:\s*(?:בוחן|מבחן|מטלה \d+))\s*:\s*/u, "$1 - ");
  return out || String(t == null ? "" : t).trim();
}
const DATA = JSON.parse(document.getElementById("data").textContent);
(function normalise(){
  const A = v => Array.isArray(v) ? v : [], O = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const okT = (h, m) => +h < 24 && +m < 60;   // 25:99 is not a time
  const okD = d => { try{ return typeof d === "string" && /^\d{4}-\d\d-\d\d$/.test(d) && new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d }catch(e){ return false } };
  DATA.sessions = A(DATA.sessions).filter(s => s && okD(s.date) && typeof s.time === "string" && typeof s.title === "string" && /^\s*\d{1,2}:\d\d\s*-\s*(\d{1,2}:\d\d)?\s*$/.test(s.time) && okT(...s.time.match(/(\d{1,2}):(\d\d)/).slice(1)));
  const seenS = new Set();
  DATA.sessions = DATA.sessions.filter(s => {
    const m = s.time.match(/(\d{1,2}):(\d\d)\s*-\s*(?:(\d{1,2}):(\d\d))?/), a = m[1].padStart(2,"0")+":"+m[2];
    let b = m[3] && okT(m[3], m[4]) ? m[3].padStart(2,"0")+":"+m[4] : "";
    if (b === a) b = "";
    s.time = a + "-" + b;
    const k = s.date + "|" + s.time + "|" + s.title; if (seenS.has(k)) return false; seenS.add(k); return true;   // a repeated row would repeat ids
  });
  DATA.notes = O(DATA.notes); DATA.courses = O(DATA.courses); DATA.lessons = O(DATA.lessons); DATA.library = O(DATA.library);
  DATA.lecturers = O(DATA.lecturers); DATA.electives = O(DATA.electives); DATA.taskhelp = O(DATA.taskhelp); DATA.checked = O(DATA.checked);
  DATA.semester = O(DATA.semester); DATA.semester.from = DATA.semester.from || "2026-10-01"; DATA.semester.to = DATA.semester.to || "2027-07-31";
  for (const k of Object.keys(DATA.courses)) if (!DATA.courses[k] || typeof DATA.courses[k] !== "object") delete DATA.courses[k];   // a null course would throw in every list
  DATA.deadlines = A(DATA.deadlines).filter(x => x && okD(x.date) && typeof x.text === "string");
  for (const x of DATA.deadlines){ const m = typeof x.time === "string" && x.time.trim().match(/^(\d{1,2}):(\d\d)$/); x.time = m && okT(m[1], m[2]) ? m[1].padStart(2,"0")+":"+m[2] : null }
  { const seenH = {}; for (const x of DATA.deadlines){ const k = x.date + "|" + x.text; seenH[k] = (seenH[k] || 0) + 1; x.hid = seenH[k] === 1 ? k : k + "|" + seenH[k] } }   // the first row keeps the saved tick key; a repeated row gets its own
  DATA.recordings = A(DATA.recordings).filter(r => r && typeof r.start === "string");
  DATA.source = safeUrl(DATA.source);
  for (const x of DATA.deadlines){
    if (x.link) x.link = safeUrl(x.link);
    x.label = cleanTitle(x.text);   // shown text; x.text stays the raw key for ticks, sync and the calendar id
  }
  for (const c of Object.values(DATA.courses)){ if (c.zoom) c.zoom = safeUrl(c.zoom) || null; if (c.lemida) c.lemida = safeUrl(c.lemida) || null }
})();
const END_DATE = DATA.sessions.reduce((m, s) => s.date > m ? s.date : m, "") || DATA.semester.to;
const TZ = "Asia/Jerusalem";
const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const DAY_SHORT = ["א'","ב'","ג'","ד'","ה'","ו'","ש'"];
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const MON_SHORT = ["ינו'","פבר'","מרץ","אפר'","מאי","יוני","יולי","אוג'","ספט'","אוק'","נוב'","דצמ'"];
const KEY = "tzofen-home-v1";
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");
const WA_NUM = "972559970958";

function sanitizeS(o){
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const arr = v => Array.isArray(v) ? v : [], keys = new Set(Object.values(DATA.courses).map(c => c && c.key).filter(Boolean));
  const tm = /^\d\d:\d\d$/, dt = /^\d{4}-\d\d-\d\d$/;
  const extras = arr(o.extras).slice(0, 6).map(x => {
    if (!x || typeof x !== "object") return null;
    const name = typeof x.name === "string" ? x.name.trim().slice(0, 60) : "";
    const real = d => dt.test(d) && new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d, okT = t => tm.test(t) && +t.slice(0,2) < 24 && +t.slice(3) < 60;
    const day = String(x.day ?? ""), start = String(x.start || ""), end = String(x.end || ""), from = String(x.from || DATA.semester.from), to = String(x.to || END_DATE);
    if (!name || !/^[0-5]$/.test(day) || !okT(start) || !okT(end) || end <= start || !real(from) || !real(to) || to < from) return null;
    return {name, day, start, end, from, to, link: safeUrl(x.link, ["https:","http:"])};
  }).filter(Boolean);
  return {
    biblio: ["avichai","lauren","none"].includes(o.biblio) ? o.biblio : "",
    terror: o.terror === "yes" ? "yes" : "no",
    off: arr(o.off).filter(k => typeof k === "string" && keys.has(k)).slice(0, 40),
    electives: arr(o.electives).filter(k => typeof k === "string" && Object.prototype.hasOwnProperty.call(DATA.electives, k)).slice(0, 20),
    extras, remind: [0,10,15,30,60].includes(+o.remind) ? +o.remind : 15
  };
}
let S_DAMAGED = false;   // something was saved but cannot be read: said out loud, not treated like a first visit
function load(){
  let raw = null; try{ raw = localStorage.getItem(KEY) }catch(e){ return null }
  if (raw === null) return null;
  try{ const v = sanitizeS(JSON.parse(raw)); if (!v) S_DAMAGED = true; return v }catch(e){ S_DAMAGED = true; return null }
}
function store(s){ try{ const v=JSON.stringify(s); localStorage.setItem(KEY, v); return localStorage.getItem(KEY)===v }catch(e){ return false } }
let S = load();

function b64u(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"") }
function unb64u(s){ s=s.replace(/-/g,"+").replace(/_/g,"/"); return decodeURIComponent(escape(atob(s + "===".slice((s.length+3)%4)))) }
const ADDR = {}, REST = [];
for (const [src, isHash] of [[location.hash.slice(1), true], [location.search.slice(1), false]]){
  for (const part of src.split("&")){
    const i = part.indexOf("="); if (i < 1 || i === part.length - 1) continue;
    const k = part.slice(0, i), v = part.slice(i + 1);
    if (!(k in ADDR)){ ADDR[k] = v; if (isHash && !["d","s","t"].includes(k)) REST.push([k, v]) }
  }
}
function hashParam(k){ return Object.prototype.hasOwnProperty.call(ADDR, k) ? ADDR[k] : null }
const TAB_ALIAS = {courses:"prep"};   // the tab is called "קורסים"; old links say prep
const tabName = t => TAB_ALIAS[t] || t;
const IN_APP = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
if (!S && IN_APP && hashParam("s")){  // only inside a home-screen app, never from a forwarded link
  try{ S = sanitizeS(JSON.parse(unb64u(hashParam("s")))); if (S) store(S) }catch(e){ S = null }
}

const DKEY = KEY + "-drive";
const validId = x => /^[A-Za-z0-9_-]{20,80}$/.test(x || "");
function driveIdFrom(t){
  t = String(t || "").trim(); if (!t) return null;
  const m = t.match(/[#&?]d=([A-Za-z0-9_-]{20,80})/) || t.match(/\/folders\/([A-Za-z0-9_-]{20,80})/) || t.match(/[?&]id=([A-Za-z0-9_-]{20,80})/) || t.match(/^([A-Za-z0-9_-]{20,80})$/);
  return m ? m[1] : null;
}
function storedDrive(){ try{ const v = localStorage.getItem(DKEY); return validId(v) ? v : null }catch(e){ return null } }
let DRIVE_ID = storedDrive();
let PENDING_D = validId(hashParam("d")) && hashParam("d") !== DRIVE_ID ? hashParam("d") : null;
let VAULT_OK = false;
let FOLDERS = {}, LESSONS = {}, DFILES = {}, DFOLD = {};
async function decryptVault(id){
  if (!validId(id) || !DATA.vault || !(window.crypto && crypto.subtle)) return null;
  try{
    const b = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id)), "AES-GCM", false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv:b(DATA.vault.iv)}, key, b(DATA.vault.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }catch(e){ return null }
}
function applyVault(v){ VAULT_OK = true; FOLDERS = v.c || v; LESSONS = v.l || {}; DFILES = v.f || {}; DFOLD = v.g || {}; render(true) }
function adoptDrive(id, v){ DRIVE_ID = id; try{ localStorage.setItem(DKEY, id) }catch(e){} showDrive(); applyVault(v); writeAddress() }
let SWD_ASK = null;
async function offerDrive(id){
  if (!validId(id) || id === DRIVE_ID) return;
  const v = await decryptVault(id); if (!v) return;          // a link that does not open the class vault is ignored
  if (!DRIVE_ID || !VAULT_OK){ adoptDrive(id, v); return }    // nothing saved, or the saved one no longer opens anything
  SWD_ASK = {id, v}; document.getElementById("swd").showModal();
}
async function openVault(){
  if (DRIVE_ID){ const v = await decryptVault(DRIVE_ID); if (v) applyVault(v); else FOLDERS = {} }
  if (PENDING_D){ const id = PENDING_D; PENDING_D = null; await offerDrive(id) }
}
function showDrive(){
  if (!DRIVE_ID) return;
  document.getElementById("drive-a").href = "https://drive.google.com/drive/folders/" + DRIVE_ID + "?usp=sharing";
  document.getElementById("drive-li").hidden = false;
}
showDrive();
function writeAddress(){
  const h = [];
  if (DRIVE_ID) h.push("d=" + DRIVE_ID);
  if (S) h.push("s=" + b64u(JSON.stringify(S)));
  for (const [k, v] of REST) h.push(k + "=" + v);
  try{ history.replaceState(history.state, "", location.pathname + (h.length ? "#" + h.join("&") : "")) }catch(e){}
}

function nowIL(){
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, min:(+p.hour)*60+(+p.minute), hh:p.hour, mm:p.minute};
}
function addDays(iso,n){ const d=new Date(iso+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10) }
function wday(iso){ return new Date(iso+"T12:00:00Z").getUTCDay() }
function toMin(t){ const [h,m]=String(t||"").split(":").map(Number); return (h||0)*60+(m||0) }
function endMin(s){ const a=toMin(s.start); if (!s.end) return a+60; const b=toMin(s.end); return b<=a ? b+1440 : b }
function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])) }
function base(title){ return title.replace(/\s*-\s*(מפגש \d+|סיום)$/,"").trim() }
function dateH(iso){ return dm(iso) }
function timeH(t){ return t }
function dm(iso){ const d=new Date(iso+"T12:00:00Z"); return `${String(d.getUTCDate()).padStart(2,"0")}.${String(d.getUTCMonth()+1).padStart(2,"0")}` }
function daysFrom(a,b){ return Math.round((Date.parse(b)-Date.parse(a))/864e5) }

const CLASS_DATES = new Set(DATA.sessions.map(s=>s.date));
const HOLIDAYS = Object.fromEntries(Object.entries(DATA.notes).filter(([d])=>!CLASS_DATES.has(d)));
const CHANGES = Object.fromEntries(Object.entries(DATA.notes).filter(([d])=>CLASS_DATES.has(d)));
function courseOf(title){ return DATA.courses[base(title)] || {key:base(title), name:base(title)} }

const LESSON_NO = (()=>{ const n={}, m=new Map(); for (const s of DATA.sessions){ const k=courseOf(s.title).key; n[k]=(n[k]||0)+1; m.set(s, String(n[k]).padStart(2,"0")) } return m })();
function sessionsFor(st){
  const out = [];
  for (const s of DATA.sessions){
    const c = courseOf(s.title);
    if (c.key==="biblio" && (st.biblio==="none" || !st.biblio)) continue;   // an unknown group is asked about again, never guessed
    if (c.key==="terror" && st.terror!=="yes") continue;
    if (c.key!=="biblio" && c.key!=="terror" && (st.off||[]).includes(c.key)) continue;
    const [a,b] = s.time.split("-");
    let zoom=c.zoom, lemida=c.lemida, extra="";
    if (c.key==="biblio"){
      if (st.biblio==="lauren"){ zoom=null; lemida=null; extra="הקבוצה של לורן · הזום בלמדה של הקבוצה" }
      else extra="הקבוצה של אביחי";
    }
    const L = DATA.lessons||{};
    const lesson = (c.key==="biblio" ? ((L.biblio||{})[st.biblio]||{}) : (L[c.key]||{}))[s.date] || {};
    out.push({date:s.date,start:a,end:b,title:s.title,course:c,zoom,lemida,lesson,n:LESSON_NO.get(s),
      place:[c.place,extra].filter(Boolean).join(" · "),note:c.note||"",uid:`${s.date}-${a.replace(":","")}-${c.key}`});
  }
  for (const k of st.electives||[]){
    const e=(DATA.electives||{})[k]; if (!e) continue;
    for (const d of e.dates){
      out.push({date:d,start:e.start,end:e.end,title:e.name,course:{key:"e-"+k,place:e.place||""},zoom:null,lemida:null,place:e.place||"",note:e.note||"",mine:true,
        uid:`${d}-${e.start.replace(":","")}-e-${k}`});
    }
  }
  for (const [i,x] of (st.extras||[]).entries()){
    if (!x.name || !x.start || !x.end || !x.from || !x.to) continue;
    let d = x.from; while (wday(d)!==+x.day) d = addDays(d,1);
    for (; d<=x.to; d=addDays(d,7)){
      if (HOLIDAYS[d]) continue;
      out.push({date:d,start:x.start,end:x.end,title:x.name,course:{key:"x"+i},zoom:x.link||null,lemida:null,place:x.link?"זום":"",mine:true,
        uid:`${d}-${x.start.replace(":","")}-x${i}-${x.name.length}`});
    }
  }
  return out.sort((p,q)=>(p.date+p.start).localeCompare(q.date+q.start));
}

function takes(st,key){
  if (!key) return true;
  if (key==="biblio") return st.biblio!=="none";
  if (key==="terror") return st.terror==="yes";
  return !(st.off||[]).includes(key);
}
function ilOffset(iso){
  const y=+iso.slice(0,4), last=(m)=>{ const d=new Date(Date.UTC(y,m+1,0)); return d.getUTCDate()-d.getUTCDay() };
  const start=`${y}-03-${String(last(2)-2).padStart(2,"0")}`, end=`${y}-10-${String(last(9)).padStart(2,"0")}`;
  return iso>=start && iso<end ? "+03:00" : "+02:00";
}
const _tzf = (()=>{ try{ return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}) }catch(e){ return null } })();
function ilMs(iso, hm){
  const t = hm || "00:00", base = Date.parse(iso + "T" + t + ":00Z");
  if (!_tzf || isNaN(base)) return Date.parse(iso + "T" + t + ":00" + ilOffset(iso));
  try{
    const off = ms => { const p = {}; for (const x of _tzf.formatToParts(ms)) p[x.type] = x.value; return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms };
    return base - off(base - off(base));
  }catch(e){ return Date.parse(iso + "T" + t + ":00" + ilOffset(iso)) }
}
function dueAt(x){ return new Date(ilMs(x.date, x.time||"23:59")) }
function deadlinesFor(st){
  const nowMs = Date.now();
  return (DATA.deadlines||[]).filter(x=>takes(st,x.course) && (!x.group || x.group===st.biblio) && dueAt(x).getTime() > nowMs - 6*3600e3);
}
function startAt(s){ return ilMs(s.date, s.start) }
function endAt(s){ return startAt(s) + (endMin(s)-toMin(s.start))*60e3 }

function nDays(n){ return n===1?"יום":n===2?"יומיים":n+" ימים" }
function nHours(n){ return n===1?"שעה":n===2?"שעתיים":n+" שעות" }
function nMins(n){ return n===1?"דקה":n+" דק'" }
function and(a,b){ return a + " " + (/^\d/.test(b) ? "ו-" + b : "ו" + b) }
function span(ms){
  const sec=Math.max(0,Math.floor(ms/1000));
  if (sec<15*60 && !REDUCED.matches){   // the last minutes tick (not for people who asked for less motion)
    const mm=Math.floor(sec/60), ss=sec%60;
    const sp=ss===1?"שנייה אחת":ss+" שניות", mp=mm===1?"דקה אחת":mm+" דקות";
    const said=!mm ? (ss?sp:"פחות משנייה") : !ss ? mp : mp+" ו"+(/^\d/.test(sp)?"-":"")+sp;
    if (!mm) return `<span aria-hidden="true">${said}</span><span class="sr">${said}</span>`;
    return `<span aria-hidden="true"><span class="num" dir="ltr">${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}</span></span><span class="sr">${said}</span>`;
  }
  const m=Math.ceil(ms/60000), h=Math.floor(m/60), d=Math.floor(h/24);
  if (m<60) return nMins(m);
  if (d>=45){ const mo=Math.round(d/30); return mo===2 ? "כחודשיים" : "כ-" + mo + " חודשים" }
  if (d>=4) return nDays(d);
  if (d>=1) return h%24 ? and(nDays(d), nHours(h%24)) : nDays(d);
  return m%60 ? and(nHours(h), nMins(m%60)) : nHours(h);
}
function lateText(k){
  return k==="exam" ? "עבר. כדאי לבדוק בלמדה אם עוד אפשר."
    : k==="quiz" ? "נסגר. כדאי לבדוק בלמדה אם עוד אפשר."
    : k==="due" ? "הזמן להגשה עבר. אם היא עדיין פתוחה בלמדה, אפשר להגיש שם."
    : "עבר.";
}
function countText(mode, ms, k){
  if (mode==="start") return ms>0 ? "מתחיל בעוד " + span(ms) : "מתחיל עכשיו";
  if (mode==="end") return "נגמר בעוד " + span(ms);
  return ms>0 ? "עוד " + span(ms) : k==="exam" && ms>-90*60e3 ? "מתקיים עכשיו" : lateText(k);
}
function barScale(a,b,t){ return Math.min(1,Math.max(0,(t-a)/(b-a))) }
function tick(){
  if (document.hidden) return;
  const t=Date.now(), mn=Math.floor(t/60000); let flip=false;
  for (const el of document.querySelectorAll("[data-to]")){
    if (el.closest("[hidden]")) continue;
    const to=+el.dataset.to, ms=to - t;
    if (el.dataset.mode==="bar"){ el.style.transform="scaleX("+barScale(+el.dataset.from,to,t).toFixed(4)+")"; continue }
    const fine = ms < 15*60e3+1000 && !REDUCED.matches;
    if (!fine && el._m===mn) continue;
    el._m=mn;
    const html=countText(el.dataset.mode, ms, el.dataset.k);
    if (el.innerHTML!==html) el.innerHTML=html;
    if (ms<=0 && el.dataset.mode!=="dl") flip=true;
  }
  if (flip) render(true);
}

const IC = (n, cls) => `<svg class="i${cls?" "+cls:""}" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`;
const ICON = {
  zoom:IC("video-camera"),
  chev:IC("caret-down","chev"),
  prev:IC("caret-left","flip"),
  next:IC("caret-right","flip")
};

const OPEN = new Set(), CLOSED = new Set();   // what the person opened or closed stays that way across the minute refresh
function actionsHtml(s,hl,state){
  const out=[], over=state==="past";
  if (s.zoom && !over) out.push(`<a class="btn${hl?" primary":""}" href="${esc(s.zoom)}" target="_blank" rel="noopener">${ICON.zoom}<span>כניסה לזום<small class="btn-sub">נפתח דרך למדה</small></span></a>`);
  if (s.lemida) out.push(`<a class="btn" href="${esc(s.lemida)}" target="_blank" rel="noopener">הקורס בלמדה</a>`);
  const where = !s.zoom && (s.course.place||"");
  const b = where && (where.match(/בניין \d+/)||[])[0];
  if (!over && where && /בר-אילן|בניין/.test(where) && (b || s.date!==nowIL().date)){
    const q = "אוניברסיטת בר-אילן" + (b ? " " + b : "");
    out.push(`<a class="btn" href="https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes" target="_blank" rel="noopener">ניווט בוויז</a>`);
  }
  // materials: this lesson's folder when the class has one, otherwise the course folder (not for Lauren's group)
  const lauren = s.course.key==="biblio" && S && S.biblio==="lauren";
  const lessonDir = !lauren && s.n && (LESSONS[s.course.key]||{})[s.n];
  const folder = lessonDir || (!lauren && FOLDERS[s.course.key]);
  if (folder)
    out.push(`<a class="btn" href="https://drive.google.com/drive/folders/${encodeURIComponent(folder)}" target="_blank" rel="noopener" title="${lessonDir?"סיכום, הרחבה ותרגול לשיעור הזה":"קריאות, סיכומים ופודקאסטים בדרייב של המחזור"}">${lessonDir?"חומרי השיעור":"חומרי הקורס"}</a>`);
  return out.length ? `<div class="acts">${out.join("")}</div>` : "";
}
function lecturerOf(key){
  const L=(DATA.lecturers||{})[key]; if (!L) return null;
  return key==="biblio" ? (L[(S&&S.biblio)||""]||null) : L;
}
function ltrTimes(t){ return esc(t).replace(/\d\d:\d\d-\d\d:\d\d/g, m=>`<span class="num nb" dir="ltr">${m}</span>`) }
function lecturerHtml(key){
  const l=lecturerOf(key); if (!l) return "";
  return `<p class="m"><b>מרצה</b><span>${esc(l.name)}${l.hours?`<br>שעת קבלה: ${ltrTimes(l.hours)}`:""}${l.email?`<br><a href="mailto:${esc(l.email)}" dir="ltr">${esc(l.email)}</a>`:""}${l.note?`<br>${bidi(l.note)}`:""}</span></p>`+
    (l.attend?`<p class="m"><b>נוכחות</b><span>${bidi(l.attend)}</span></p>`:"");
}
function bidi(raw){
  const parts=String(raw??"").split(/([A-Za-z][A-Za-z0-9 .,:;'&\/-]*[A-Za-z0-9.]|\d{1,2}:\d\d\s*-\s*\d{1,2}:\d\d|\d+(?:[.,]\d+)?(?:\s*[-\u2013]\s*\d+(?:[.,]\d+)?)+%?|\d+%)/);
  return parts.map((t,i)=>{
    const latinNext = i+1<parts.length && /^[A-Za-z]/.test(parts[i+1]);
    if (i%2===0){ return esc(latinNext ? t.replace(/[א-ת]-$/,"") : t) }
    if (!/^[A-Za-z]/.test(t)) return `<bdi class="ltr-run" dir="ltr">${esc(t)}</bdi>`;
    const pre=(parts[i-1].match(/[א-ת]-$/)||[""])[0];  // "ב-AI" stays on one line
    return `<span class="nb">${esc(pre)}<bdi dir="ltr" lang="en">${esc(t)}</bdi></span>`;
  }).join("");
}
function lessonHtml(x){
  if (!x || !(x.topic||x.reading||x.note)) return "";
  return `<div class="m-list">`+(x.topic?`<p class="m"><b>נושא</b><span>${bidi(x.topic)}</span></p>`:"")+(x.reading?`<p class="m"><b>קריאה</b><span>${bidi(x.reading)}</span></p>`:"")+(x.note?`<p class="m solo">${bidi(x.note)}</p>`:"")+`</div>`;
}
function plan(list){
  const t=Date.now();
  const liveAll=list.filter(s=>startAt(s)<=t && endAt(s)>t);   // overlapping sessions are all live
  const live=liveAll[0]||null;
  const up=list.find(s=>startAt(s)>t)||null;
  const focus=new Set();
  for (const l of liveAll) focus.add(l.uid);
  // while a class is live only that row is open; the next one stays folded and carries its countdown in the folded line
  if (up && !live) focus.add(up.uid);
  // the highlighter goes on one row: the live class, or the next one when it is less than 12 hours away
  const hl = live || (up && startAt(up)-t <= 12*3600e3 ? up : null);
  return {live, liveAll:new Set(liveAll), up, focus, hl, first: live||up};
}
function stateOf(s,now,P){
  if (P.liveAll ? P.liveAll.has(s) : s===P.live) return "live";
  if (s.date<now.date || (s.date===now.date && endMin(s)<=now.min)) return "past";
  if (s===P.up) return P.live ? "soon" : "next";   // while a class is live only that row is loud
  return "";
}
function countHtml(s,state,P){
  if (state==="live") return `<p class="count" data-to="${endAt(s)}" data-mode="end">${countText("end",endAt(s)-Date.now())}</p>`+
    `<div class="barrow"><span class="bt" aria-hidden="true">${s.start}</span><div class="prog" role="presentation"><i data-from="${startAt(s)}" data-to="${endAt(s)}" data-mode="bar" style="transform:scaleX(${barScale(startAt(s),endAt(s),Date.now()).toFixed(4)})"></i></div><span class="bt" aria-hidden="true">${s.end||hhmm(endMin(s))}</span></div>`;
  if (state==="next" || state==="soon") return `<p class="count${state==="soon"?" sub":""}" data-to="${startAt(s)}" data-mode="start">${countText("start",startAt(s)-Date.now())}</p>`;
  return "";
}
function rowHtml(s,state,P,pfx){
  const key=(pfx||"")+s.uid;   // the Week view keeps its own open and closed rows, so a row opened on Today does not open twice
  const hl = s===P.hl || state==="live";
  const lect = lecturerHtml(s.course.key);
  const info = lessonHtml(s.lesson);
  const more = countHtml(s,state,P) + actionsHtml(s,hl,state) + (state==="past" ? "" : zoomNote(s)) + (s.note ? `<p class="m solo">${bidi(s.note)}</p>` : "") + (info||lect ? (info ? info.replace(/<\/div>$/, lect+"</div>") : `<div class="m-list">${lect}</div>`) : "");
  const tag = state==="live" ? `<span class="sr">, עכשיו</span>` : (state==="next"||state==="soon") ? `<span class="sr">, הבא</span>` : "";
  const open0 = OPEN.has(key) || (P.focus.has(s.uid) && !CLOSED.has(key));
  const lec0=lecturerOf(s.course.key), att=(state==="live"||state==="next"||state==="soon") && !open0 && lec0 && lec0.attend ? `<span class="where att">נוכחות: ${bidi(lec0.attend)}</span>` : "";   // an open card already shows it in the lecturer block
  const wt=whereText(s);
  const cd = !open0 && (state==="next"||state==="soon") ? `<span class="where cd${state==="soon"?" sub":""}" data-to="${startAt(s)}" data-mode="start">${countText("start",startAt(s)-Date.now())}</span>` : "";
  const head = `<span class="t"><b>${s.start}</b>${s.end?`<small><span class="until">עד </span>${s.end}</small>`:""}</span>`+
    `<span class="main"><span class="ttl">${esc(s.course.name||s.title)}${tag}</span>${wt?`<span class="where">${esc(wt)}</span>`:""}${att}${cd}</span>`;
  const cls = "row"+(state?" "+state:"")+(hl?" hl":"");
  if (!more) return `<li class="${cls}"><div class="row-h">${head}<span></span></div></li>`;
  const id = "m-"+key.replace(/[^\w-]/g,"");
  const open = OPEN.has(key) || (P.focus.has(s.uid) && !CLOSED.has(key));
  return `<li class="${cls}${open?" open":""}" data-uid="${esc(key)}"><button type="button" class="row-h" aria-expanded="${open}" aria-controls="${id}">${head}${ICON.chev}</button>`+
    `<div class="more" id="${id}"><div class="in"><div class="pad">${more}</div></div></div></li>`;
}

function hhmm(m){ return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0") }
function dayStripHtml(iso,list,now,P){
  const items=list.filter(s=>s.date===iso); if (!items.length) return "";
  const lo=Math.min(...items.map(s=>toMin(s.start))), hi=Math.max(...items.map(s=>endMin(s)));
  if (hi<=lo) return "";
  const pc=m=>Math.min(100,Math.max(0,(m-lo)/(hi-lo)*100));
  const segs=items.map(s=>{
    const st=stateOf(s,now,P), a=pc(toMin(s.start)), b=pc(endMin(s));
    const k=st==="live"?"s-live":st==="past"?"s-past":(st==="next"||st==="soon")?"s-next":"s-later";
    return `<i class="sg ${k}" style="--s:${a.toFixed(2)}%;--w:${Math.max(0,b-a).toFixed(2)}%"></i>`;
  }).join("");
  const here=iso===now.date && now.min>=lo && now.min<=hi ? `<i class="s-now" style="--s:${pc(now.min).toFixed(2)}%"></i>` : "";
  return `<div class="dstrip" aria-hidden="true"><div class="ds-track">${segs}${here}</div><div class="ds-ends"><span>${hhmm(lo)}</span><span class="ds-cap">שיעורי היום</span><span>${hhmm(hi)}</span></div></div>`;
}
function count(n){ return n===1?"שיעור אחד":n+" שיעורים" }
function whereText(s){
  const p=s.place||"";
  if (s.mine) return p;   // (a course note such as "two sessions only" is s.note and is shown inside the open row, never as a place)
  if (!p) return "המקום עוד לא פורסם";
  const first=p.split(" · ")[0];
  if (/^בר-אילן(?:, בכיתה)?$/.test(first)) return ["בר-אילן, הכיתה עוד לא פורסמה"].concat(p.split(" · ").slice(1)).join(" · ");
  return p;
}
function zoomNote(s){ return !s.mine && !s.zoom && /זום/.test(s.place||"") ? `<p class="m solo">הקישור לזום נמצא בלמדה של הקורס.</p>` : "" }
const CHANGE_RX=/במקום|הועבר|מועבר|בוטל|מבוטל|שונה|שינוי|הוחלף|מוזז|נדחה|(?:^|[\s,.(])עבר ל/;   // "עבר ל" only at a word start: "מעבר לשעון קיץ" is not a change
const PAST_OPEN=new Set();
function daySheet(iso,title,list,now,P,hTag,showDate,pfx){
  const items=list.filter(s=>s.date===iso);
  let body="";
  if (HOLIDAYS[iso]) body+=`<p class="quiet free">אין לימודים (${esc(HOLIDAYS[iso])}).</p>`;
  if (CHANGES[iso]) body+=`<p class="quiet box">${CHANGE_RX.test(CHANGES[iso])?"שינוי ביום הזה":"הערה"}: ${esc(CHANGES[iso])}. <a class="ext" href="${esc(DATA.source)}" target="_blank" rel="noopener">לצפייה בלו"ז הרשמי</a></p>`;
  const clash=overlapNote(items);
  if (clash) body+=clash;
  // sessions that already ended today fold into one line; the live and the next class come first
  const gone=iso===now.date ? items.filter(s=>stateOf(s,now,P)==="past") : [];
  if (gone.length){
    const pk=(pfx||"")+iso;
    body+=`<details class="wk-past past-sess" data-pk="${esc(pk)}"${PAST_OPEN.has(pk)?" open":""}><summary><span>${gone.length===1?"שיעור אחד עבר":gone.length+" שיעורים עברו"}</span>${ICON.chev}</summary><ol class="tt">${gone.map(s=>rowHtml(s,"past",P,pfx)).join("")}</ol></details>`;
  }
  const shownItems=gone.length ? items.filter(s=>!gone.includes(s)) : items;
  if (shownItems.length) body+=`<ol class="tt">${shownItems.map(s=>rowHtml(s,stateOf(s,now,P),P,pfx)).join("")}</ol>`;
  else if (!HOLIDAYS[iso]) body+=`<p class="quiet">אין שיעורים.</p>`;
  // showDate: "day" = weekday and date (under היום/מחר), "date" = date only (the title already names the day)
  const sub=[showDate==="day"?`${DAYS[wday(iso)]} <span class="num">${dm(iso)}</span>`:showDate||"", items.length?count(items.length):""].filter(Boolean).join(" · ");
  return `<header class="sec-h"><${hTag}>${title}</${hTag}><p>${sub}</p></header>${body}`;
}

function overlapNote(items){
  const out=[];
  for (const a of items) for (const b of items){
    if (a===b || !a.mine || b.mine) continue;
    const a0=toMin(a.start), a1=endMin(a), b0=toMin(b.start), b1=endMin(b);
    if (a0<b1 && b0<a1) out.push(`${esc(a.course.name||a.title)} ו${esc(b.course.name||b.title)}`);
  }
  return out.length ? `<p class="quiet box">שימו לב, באותה שעה: ${out.join("; ")}.</p>` : "";
}

const PARK_URL="https://webcounter.ipi.co.il:8080/api/Facility/GetFacilityCounters/34FC30E8-2357-4AEA-8B7A-D399713245E4";
const PARK_SITE="https://webcounter.ipi.co.il/counters/barilan";
const PARK={lots:null,at:0,busy:false,err:false};
const NAV=IC("map-pin");
const REFRESH=IC("arrows-clockwise");
function waze(q){ return "https://waze.com/ul?q="+encodeURIComponent(q)+"&navigate=yes" }
function onCampus(s){ return !s.zoom && /בר-אילן|בניין/.test(s.course.place||"") }
function parkWindow(list,now){
  const c=list.filter(s=>s.date===now.date && onCampus(s));
  if (!c.length) return null;
  const from=toMin(c[0].start)-150, to=Math.max(...c.map(endMin));
  return {from,to,live:now.min<to,lead:now.min>=from && now.min<to};
}
async function fetchParking(){
  if (PARK.busy || Date.now()-PARK.at<120e3) { paintParking(); return }
  PARK.busy=true; paintParking();
  try{
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),10000);
    const res=await fetch(PARK_URL,{signal:ctl.signal,cache:"no-store"}); clearTimeout(t);
    if (!res.ok) throw new Error(res.status);
    const raw=await res.json();
    PARK.lots=raw.map(x=>({name:x.carPark.carParkDisplayName, free:+x.counter.counterValue, max:+x.counter.counterMax,
      time:x.counter.counterTime, full:+x.counter.counterFullLevel, few:+x.counter.counterFewLevel}));
    PARK.err=false;
  }catch(e){ PARK.err=true }
  PARK.at=Date.now(); PARK.busy=false; paintParking();
}
function ilStamp(t){  // a moment as "ראשון 25.10 · 12:08", in Israel time whatever the phone's zone
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(t).map(x=>[x.type,x.value]));
  const d=`${p.year}-${p.month}-${p.day}`; return `${DAYS[wday(d)]} <span class="num">${dm(d)} · ${p.hour}:${p.minute}</span>`;
}
function parkMs(t){ return t ? ilMs(t.slice(0,10), t.slice(11,16)) : 0 }
function parkOld(){ const l=PARK.lots&&PARK.lots[0]; return !l || Date.now()-parkMs(l.time)>30*60e3 }
function parkAge(t){
  if (!t) return "";
  if (Date.now()-parkMs(t)>30*60e3){ const d=t.slice(0,10); return `לא התעדכן מאז ${DAYS[wday(d)]} ${dm(d)} · ${t.slice(11,16)}` }
  const ms=Date.now()-parkMs(t), m=Math.max(0,Math.round(ms/60000));
  return m<1?"עודכן עכשיו":m<60?`עודכן לפני ${nMins(m)}`:`עודכן לפני ${nHours(Math.floor(m/60))}`;
}
function paintParking(){
  for (const box of document.querySelectorAll(".park-live")){
    let h;
    if (PARK.lots && parkOld()) h=`<p class="park-off">מצב החניונים לא מתעדכן כרגע. <a class="ext" href="${PARK_SITE}" target="_blank" rel="noopener">לאתר החניונים</a></p>`;   // old counts are never shown as live
    else if (PARK.lots){
      h=`<ul class="park-lots">`+PARK.lots.map(l=>{
        const st=l.free<=l.full?"full":l.free<=l.few?"few":"free";
        return `<li class="lot${st==="full"?" full":""}"><span class="lot-name">${esc(l.name)}</span>`+
          `<span class="lot-free">${st==="full"?`<b>מלא</b>`:st==="few"?`<b>${l.free}</b><span>כמעט מלא</span>`:`<b>${l.free}</b><span>פנויים</span>`}</span>`+
          `<a class="icon-btn" href="${waze("חניון "+l.name+" בר-אילן")}" target="_blank" rel="noopener" aria-label="ניווט בוויז לחניון ${esc(l.name)}" title="ניווט בוויז לחניון ${esc(l.name)}">${NAV}</a></li>`;
      }).join("")+`</ul>`;
    }
    else if (PARK.err) h=`<p class="park-off">אי אפשר לטעון את מצב החניונים. נסו שוב עוד רגע, או <a class="ext" href="${PARK_SITE}" target="_blank" rel="noopener">היכנסו לאתר החניונים</a>.</p>`;
    else h=`<p class="park-off">טוען את מצב החניונים...</p>`;
    box.innerHTML=h;
    box.classList.toggle("stale", !!(PARK.lots && parkOld()));
  }
  for (const el of document.querySelectorAll(".park-age")) el.textContent = PARK.busy?"מרענן...":PARK.lots&&!parkOld()?parkAge(PARK.lots[0].time):"";
}
function parkCard(live,lead,tag,to){
  const head=`<header class="sec-h"><${tag}>חניה בבר-אילן</${tag}>`+(live?`<p><span class="park-age"></span><button type="button" class="icon-btn" data-park-refresh aria-label="רענון מצב החניונים" title="רענון">${REFRESH}</button></p>`:"<p></p>")+`</header>`;
  const body=(live?`<div class="park-live"></div>`:"")+
    `<div class="park-foot"><a class="btn" href="${waze("אוניברסיטת בר-אילן")}" target="_blank" rel="noopener">${NAV}ניווט בוויז לבר-אילן</a>`+
    (to>20*60?`<p class="park-note">השיעור האחרון נגמר ב-<span class="num">${String(Math.floor(to/60)).padStart(2,"0")}:${String(to%60).padStart(2,"0")}</span>, ושער 20 פתוח ליציאת רכבים רק עד 20:00.</p>`:"")+`</div>`;
  return {head, body};
}
function parkSection(live,lead,to){ const c=parkCard(live,lead,"h2",to); return `<section class="park">${c.head}<div class="tt">${c.body}</div></section>` }
function parkMini(live,to){ const c=parkCard(live,false,"h3",to); return `<details class="park-mini" data-k="park"><summary>${live?"חניה, מצב החניונים עכשיו":"חניה"}${ICON.chev}</summary><div class="tt">${c.body.replace('<div class="park-foot">','<div class="park-foot">')}</div></details>` }
function parkOnView(){  // only when a live box is actually on screen: not in a folded card, not in a hidden tab
  if (!document.hidden && [...document.querySelectorAll(".park-live")].some(x=>!x.closest("details:not([open])") && !x.closest("[hidden]"))) fetchParking();
}

function weekStart(iso){ return addDays(iso,-wday(iso)) }
function range(a,b){ return `<span class="num nb" dir="ltr">${dm(a)}-${dm(b)}</span>` }
function stripHtml(ws,list,now,dls,sel){
  let html=`<div class="strip">`;
  for (let i=0;i<7;i++){
    const iso=addDays(ws,i), items=list.filter(s=>s.date===iso);
    const mins=items.reduce((a,s)=>a+endMin(s)-toMin(s.start),0);
    const h=mins?Math.max(14,Math.min(100,mins/360*100)):0;
    const dl=dls.some(x=>x.date===iso), off=!!HOLIDAYS[iso];
    const cls=["day", iso===now.date?"today":"", iso<now.date?"past":"", dl?"has-dl":"", off?"off":"", iso===sel?"sel":""].filter(Boolean).join(" ");
    const label=`יום ${DAYS[i]} ${dm(iso)}${iso===now.date?", היום":""}: ${off?"אין לימודים, "+HOLIDAYS[iso]:items.length?count(items.length):"אין שיעורים"}${dl?", יש דדליין":""}`;
    html+=`<button type="button" class="${cls}" data-day="${iso}" aria-pressed="${iso===sel}"${iso===now.date?' aria-current="date"':""} aria-label="${esc(label)}"><span class="dn" aria-hidden="true">${DAY_SHORT[i]}</span><span class="dd" aria-hidden="true">${new Date(iso+"T12:00:00Z").getUTCDate()}</span><span class="hbar" aria-hidden="true"><i style="--h:${h}%"></i></span><span class="dlm" aria-hidden="true"></span></button>`;
  }
  const anyOff=[0,1,2,3,4,5,6].some(i=>HOLIDAYS[addDays(ws,i)]);
  const anyDl=[0,1,2,3,4,5,6].some(i=>dls.some(x=>x.date===addDays(ws,i)));
  return html+`</div><p class="strip-key" aria-hidden="true"><span><i></i>שעות שיעור</span>${anyDl?`<span><i class="k-dl"></i>דדליין</span>`:""}${anyOff?`<span><i class="k-off"></i>אין לימודים</span>`:""}</p>`;
}
const KIND={due:"הגשה",event:"תאריך",exam:"מבחן"};
function kindOf(x){ return /בוחן/.test(x.text) ? (x.kind==="due"?"בוחן בלמדה":"בוחן") : KIND[x.kind]||"תאריך" }
function isQuiz(x){ return x.kind==="due" && (/בוחן/.test(x.text||"") || /mod\/quiz\//.test(x.link||"")) }
function dlKind(x){ return x.kind==="exam" || (x.kind==="event" && isTest(x)) ? "exam" : isQuiz(x) ? "quiz" : x.kind==="due" ? "due" : "date" }
const DL_IC={exam:"star", quiz:"hourglass", due:"book-open", date:"calendar-blank"};
function isTest(x){ return x.kind==="exam" || (x.kind==="event" && /בוחן|מבחן|בחינה/.test(x.text)) }
const FAR_MS=60*864e5;
function farTest(x){ return isTest(x) && dueAt(x).getTime()-Date.now()>FAR_MS }
function dlStats(dls){
  const t=Date.now(), dn=hwDone(), s={subs:0, quizzes:0, done:0, dates:0, tests:0, hot:0};
  for (const x of dls){
    const left=dueAt(x).getTime()-t; if (left<=0) continue;
    if (isTest(x)) s.tests++;
    else if (x.kind==="due"){ if (dn.has(hwId(x))) s.done++; else if (isQuiz(x)) s.quizzes++; else s.subs++ }
    else s.dates++;
    if (left<=48*3600e3 && !(x.kind==="due" && dn.has(hwId(x)))) s.hot++;
  }
  return s;
}
const nSubs = n => n===1 ? "הגשה אחת פתוחה" : n+" הגשות פתוחות";
const nTests = n => n===1 ? "מבחן אחד" : n+" מבחנים";
const nDates = n => n===1 ? "תאריך אחד" : n+" תאריכים";
const nDone = n => n===1 ? "הוגשה אחת" : "הוגשו "+n;
function openLine(subs, quizzes){
  if (subs && !quizzes) return nSubs(subs);
  if (quizzes && !subs) return quizzes===1 ? "בוחן אחד פתוח" : quizzes+" בחנים פתוחים";
  if (!subs && !quizzes) return "";
  const a = subs===1 ? "הגשה אחת" : subs+" הגשות", b = quizzes===1 ? "בוחן אחד" : quizzes+" בחנים";
  return a + " ו" + (/^\d/.test(b) ? "-" : "") + b + " פתוחים";
}
function countLine(s){
  const p=[];
  if (s.subs || s.quizzes) p.push(openLine(s.subs, s.quizzes));
  if (s.dates) p.push(nDates(s.dates));
  if (s.tests) p.push(nTests(s.tests));
  if (s.done) p.push(nDone(s.done));
  return p.join(" · ");
}
function upcoming(x){ const l=dueAt(x).getTime()-Date.now(); return l>0 && l<=48*3600e3 && !(x.kind==="due" && hwDone().has(hwId(x))) }
function dlRows(xs, fb){ const d=hwDone(); return xs.map(x=>x.kind==="due"?hwItem(x,d,fb):dlItem(x,fb)).join("") }
function taskCard(x){
  const c=((DATA.taskhelp||{}).cards||{})[x.course+"|"+x.date]; if (!c) return "";
  const row=(l,t)=>t?`<p class="m"><b>${l}</b><span>${bidi(t)}</span></p>`:"";
  const checked=c.checked?` · נבדק ${dm(c.checked)}`:"";
  return `<details class="tcard" data-k="tc:${esc(x.course)}|${esc(x.date)}"><summary>מה צריך לעשות</summary><div class="m-list">`+
    row("על מה המטלה",c.what)+row("דוגמאות",c.examples)+
    (c.steps&&c.steps.length?`<div class="m"><b>איך מגישים</b><ol>${c.steps.map(t=>`<li>${bidi(t)}</li>`).join("")}</ol></div>`:"")+
    (c.rule?`<p class="rule">${bidi(c.rule)}</p>`:"")+
    row("מועד",c.due)+row("ציון",c.grade)+row("אם משהו לא עובד",c.help)+
    (c.source?`<p class="src">מקור: ${bidi(c.source)}${checked}</p>`:"")+`</div></details>`;
}
function courseNameOf(key){ const c=Object.values(DATA.courses).find(c=>c&&c.key===key); return c?c.name:"" }
function feedbackUrl(what, tab){
  const t=`היי אורי, לגבי ${what?what+" ":""}ב${tab} (הנתונים מ-${dm(DATA.built||nowIL().date)}): `;
  return "https://wa.me/"+WA_NUM+"?text="+encodeURIComponent(t);
}
const FB_IC=IC("chat-circle");
function fbLink(what, tab, who){ const nm=who||what; return `<a class="fb fb-ic" href="${esc(feedbackUrl(what,tab))}" target="_blank" rel="noopener" aria-label="שלחו לאורי על טעות${nm?": "+esc(nm):""}" title="שלחו לאורי על טעות">${FB_IC}</a>` }
const FB_LINE_TXT="משהו לא נכון כאן? שלחו לאורי בכפתור שבפינת הכרטיס.";
function dlItem(x, fb, done){
  const left=(dueAt(x).getTime()-Date.now());
  const d=new Date(x.date+"T12:00:00Z");
  const k=dlKind(x), who=`${x.label}, ${DAYS[d.getUTCDay()]} ${dm(x.date)}`;
  const hot=left>0 && left<=48*3600e3 && !done, late=left<=0 && !done && !(k==="exam" && left>-90*60e3);   // an exam in its first 90 minutes is on, not late
  const title = `<span class="dl-ic">${IC(DL_IC[k])}</span><span class="dl-tx">${bidi(x.label)}</span>`+(x.link ? `<a class="dl-open" href="${esc(x.link)}" target="_blank" rel="noopener" aria-label="פתיחה בלמדה: ${esc(x.label)}">בלמדה</a>` : "");
  const bB = x.bdate ? `<p class="dl-meta dl-b"><span>מועד ב': ${DAYS[wday(x.bdate)]} ${dateH(x.bdate)}${x.btime?` · ${timeH(x.btime)}`:x.bnote?` · ${esc(x.bnote)}`:""}</span></p>` : "";
  const when = `${kindOf(x)}${x.time?` · ${timeH(x.time)}`:""}<span class="sr">, ${DAYS[d.getUTCDay()]} ${dateH(x.date)}</span>`;
  return `<li class="dl${hot?" hot":late?" late":""}${fb?" has-fb":""}"><div class="dl-date" aria-hidden="true"><b>${d.getUTCDate()}</b><small>${MON_SHORT[d.getUTCMonth()]}</small></div>`+
    `<div><p class="dl-title">${title}</p>`+
    `<p class="dl-meta dl-cd"><span>${when}</span>`+
    (done?`<span class="dl-left dl-done">${k==="due"||k==="quiz"?"הוגשה":"בוצע"}</span>`:`${hot?'<span class="dl-urgent">דחוף</span>':""}<span class="dl-left" data-to="${dueAt(x).getTime()}" data-mode="dl" data-k="${k}">${countText("dl",left,k)}</span>`)+
    `</p>${bB}${taskCard(x)}</div>${fb?`<div class="dl-fb">${fbLink(courseNameOf(x.course)||x.label,"דדליינים",who)}</div>`:""}</li>`;
}
function alertHtml(x){
  const now=nowIL(), day = x.date===now.date?"היום":x.date===addDays(now.date,1)?"מחר":`${DAYS[wday(x.date)]} ${dm(x.date)}`;
  const k=dlKind(x);
  const inner=`<b data-to="${dueAt(x).getTime()}" data-mode="dl" data-k="${k}">${countText("dl",dueAt(x).getTime()-Date.now(),k)}</b><span>${bidi(x.label)}</span>`+
    `<small>דחוף: ${k==="quiz"?"פתוח עד":x.kind==="due"?"להגשה עד":KIND[x.kind]||"תאריך"} ${day} ${timeH(x.time||"23:59")}</small>`;
  return x.link ? `<a class="alert" href="${esc(x.link)}" target="_blank" rel="noopener">${inner}<span class="go" aria-hidden="true">${ICON.next}</span></a>` : `<p class="alert">${inner}</p>`;
}
function emptyState(){
  return `<div class="empty-card"><h2>הגדירו את הלו"ז</h2><p>ענו על כמה שאלות, ואז תראו רק את השיעורים, ההגשות והמבחנים שלכם.</p><button type="button" class="btn primary" data-open-set>הגדרת הלו"ז</button></div>`;
}

let TAB="today", WEEK_OFF=0, SEL_DAY=null;
function renderToday(now,list,dls){
  const ws=weekStart(now.date);
  document.getElementById("t-strip").innerHTML=`<header class="sec-h"><h2>השבוע</h2><p>${range(ws,addDays(ws,6))}</p></header><div class="strip-card">${stripHtml(ws,list,now,dls,null)}</div>`;
  const main=document.getElementById("t-main"), side=document.getElementById("t-dl");
  if (!S){ main.innerHTML=emptyState(); side.innerHTML=""; return }
  const P=plan(list), tmr=addDays(now.date,1);
  const D=P.first ? P.first.date : null;
  const parts=[];
  // due within 48 hours: first thing on the page
  // served by the offline copy (no signal): say when that copy was saved
  const notes=[];
  const fc=document.querySelector('meta[name="from-cache"]');
  if (fc){ const t=new Date(fc.content); notes.push(`<p class="quiet box">אין חיבור. מוצג מה שנשמר בפעם האחרונה${isNaN(t)?"":", "+ilStamp(t)}.</p>`) }
  const age=daysFrom(DATA.built||now.date, now.date);
  if (age>3) notes.push(`<p class="stale-chip">הנתונים בני ${nDays(age)}, כדאי לבדוק גם בלמדה</p>`);
  // on a campus day, from 2.5 hours before the first class until the last ends, parking comes first
  const PW=parkWindow(list,now);
  // (not once a class is live or starts within 45 minutes: then the class leads and parking is the folded card under its day)
  const leadPark = !!(PW && PW.lead && !P.live && !(P.up && startAt(P.up)-Date.now() < 45*60e3));
  if (leadPark) parts.push(parkSection(true,true,PW.to));
  // due within 48 hours: first thing on the page (after parking on the way to campus)
  const hot=dls.filter(upcoming);
  if (hot.length) parts.push(`<div>${hot.map(alertHtml).join("")}</div>`);
  // today and tomorrow, when they have nothing to show, become quiet lines, in day order
  const lines=[], plain=[];
  for (const [iso,label] of [[now.date,"היום"],[tmr,"מחר"]]){
    if (iso===D || (D && iso>D)) continue;
    if (label==="מחר" && wday(iso)===6 && !HOLIDAYS[iso]) continue;  // nobody expects classes on Shabbat
    if (HOLIDAYS[iso]) lines.push(`<p class="quiet free">${label}: אין לימודים (${esc(HOLIDAYS[iso])}).</p>`);
    else if (iso===now.date && list.some(s=>s.date===iso)) lines.push(`<p class="quiet">היום: השיעורים הסתיימו.<button type="button" class="linkbtn" data-day="${iso}">לשיעורים של היום</button></p>`);
    else { plain.push(label); lines.push("PLAIN") }
  }
  const joined=plain.length===2?"היום ומחר":plain[0];
  const quiet=lines.filter((l,i)=>l!=="PLAIN"||lines.indexOf("PLAIN")===i).map(l=>l==="PLAIN"?`<p class="quiet">${joined}: אין שיעורים.</p>`:l);
  if (quiet.length) parts.push(`<div class="stack" style="gap:8px">${quiet.join("")}</div>`);
  // the day of the next class leads; tomorrow follows when the next class is today
  if (D){
    const away=daysFrom(now.date,D);
    const title = D===now.date?"היום":D===tmr?"מחר":away>6?`יום ${DAYS[wday(D)]} <span class="num">${dm(D)}</span>`:`יום ${DAYS[wday(D)]}`;
    const sub = D===now.date ? "" : D===tmr ? "day" : away>6 ? "" : `<span class="num">${dm(D)}</span>`;   // the h1 already says today's date
    if (away>6){
      const why=[...new Set(Object.entries(HOLIDAYS).filter(([d])=>d>now.date && d<D).map(([,t])=>t))];
      parts.push(`<p class="quiet">${why.length?`${esc(why.join(", "))}: `:""}חוזרים ללימודים ביום ${DAYS[wday(D)]} <span class="num">${dm(D)}</span>.</p>`);
    }
    const campus=D===now.date && PW && !leadPark;
    parts.push(`<section>${D===now.date?dayStripHtml(D,list,now,P):""}${daySheet(D,title,list,now,P,"h2",sub)}${campus?`<div class="day-park">${parkMini(D===now.date && PW && PW.live, PW.to)}</div>`:""}</section>`);
    if (D===now.date && !(wday(tmr)===6 && !list.some(s=>s.date===tmr) && !HOLIDAYS[tmr])) parts.push(`<section>${daySheet(tmr,"מחר",list,now,P,"h2","day")}</section>`);
  } else parts.push(`<p class="quiet">אין שיעורים קרובים בלו"ז. הלו"ז נגמר ב-<span class="num">${dm(END_DATE)}.${END_DATE.slice(0,4)}</span>.</p>`);
  if (notes.length) parts.push(`<div class="stack" style="gap:8px">${notes.join("")}</div>`);
  main.innerHTML=parts.join("");
  // what is due and what exams come next; items already in the urgent row are not repeated
  const rest=dls.filter(x=>!hot.includes(x) && !farTest(x)), top=rest.slice(0,4);
  side.innerHTML=`<header class="sec-h"><h2 id="h-dl">דדליינים ומבחנים</h2><p>${countLine(dlStats(dls))}</p></header>`+
    (top.length?`<ul class="dls">${dlRows(top)}</ul>`+(rest.length>4?`<div class="more-link"><button type="button" class="btn" data-tab="dl">לכל ${dls.length} הדדליינים והמבחנים</button></div>`:"")
      :hot.length?`<p class="quiet">מה שקרוב מופיע למעלה.</p>`:`<p class="clear">אין דדליינים פתוחים.</p>`);
}
function weekTitle(off){ return off===0?"השבוע":off===1?"השבוע הבא":off===-1?"שבוע שעבר":off===2?"בעוד שבועיים":off===-2?"לפני שבועיים":off>0?`בעוד ${off} שבועות`:`לפני ${-off} שבועות` }
let WK_PAST_OPEN=false;
function renderWeek(now,list,dls){
  const v=document.getElementById("v-week");
  if (!S){ v.innerHTML=emptyState(); return }
  const ws=addDays(weekStart(now.date),7*WEEK_OFF);
  const P0=plan(list), P=Object.assign({}, P0, {focus:new Set()});   // today's live and next rows are open on Today; here they start closed, so the card is not shown twice
  let ag="", past="", pastIdx=[];
  const ended = ws>END_DATE && !dls.some(x=>x.date>=ws && x.date<=addDays(ws,6));
  for (let i=0;i<7;i++){
    const iso=addDays(ws,i);
    const dd=dls.filter(x=>x.date===iso);
    const isToday=iso===now.date, isPast=iso<now.date;
    const title=`${DAYS[i]} <span class="num">${dm(iso)}</span>${isToday?`<span class="today-tag"><span class="sr"> </span>היום</span>`:""}`;  // same as the Today sub line
    const items=list.filter(s=>s.date===iso);
    if (ended) continue;
    if (!items.length && !dd.length && i===6 && !HOLIDAYS[iso] && iso!==SEL_DAY) continue;  // an empty Shabbat needs no row, unless the person tapped it
    let row;
    if (!items.length && !dd.length){
      // a day that is over is never "free"
      row=`<section class="wday free" id="w-${iso}"><h3>${title}</h3><p>${HOLIDAYS[iso]?`<span class="free-why">אין לימודים (${esc(HOLIDAYS[iso])})</span>`:isPast||isToday||i===6?"אין שיעורים":"פנוי"}</p></section>`;
    } else {
      const campus=items.some(onCampus), pw=isToday?parkWindow(list,now):null;
      row=`<section class="wday" id="w-${iso}">${daySheet(iso,title,list,now,P,"h3",false,"w:")}${campus&&isToday&&pw?parkMini(!!pw.live, pw.to):""}${dd.length?`<ul class="dls">${dlRows(dd)}</ul>`:""}</section>`;
    }
    // this week: days that are over fold into one row, so the week opens on today
    if (WEEK_OFF===0 && isPast && iso!==SEL_DAY){ past+=row; pastIdx.push(i) } else ag+=row;   // a past day the person tapped opens on its own
  }
  if (ended) ag=`<p class="quiet box">הלו"ז נגמר ב-<span class="num">${dm(END_DATE)}.${END_DATE.slice(0,4)}</span>. אין שיעורים אחרי התאריך הזה.</p>`;
  const pastGroup=pastIdx.length?`<details class="wk-past" id="wk-past"${WK_PAST_OPEN?" open":""}><summary><span>ימים שעברו<small>${pastIdx.length===1?DAYS[pastIdx[0]]:DAY_SHORT[pastIdx[0]]+"-"+DAY_SHORT[pastIdx[pastIdx.length-1]]}</small></span>${ICON.chev}</summary><div class="agenda">${past}</div></details>`:"";
  v.innerHTML=`<div class="wk-nav"><button type="button" class="icon-btn" data-week="-1" aria-label="השבוע הקודם">${ICON.prev}</button>`+
    `<div><h2>${weekTitle(WEEK_OFF)}</h2><p>${range(ws,addDays(ws,6))}</p></div>`+
    `<button type="button" class="icon-btn" data-week="1" aria-label="השבוע הבא">${ICON.next}</button></div>`+
    `<div class="wk-back">`+(WEEK_OFF?`<button type="button" class="btn" data-week="0">חזרה לשבוע הנוכחי</button>`
      :(wday(now.date)===6 || (wday(now.date)===5 && now.min>=720))?`<button type="button" class="btn" data-week="1">השבוע הבא</button>`:"")+`</div>`+
    `<div class="strip-card">${stripHtml(ws,list,now,dls,SEL_DAY)}</div><div class="agenda">${pastGroup}${ag}</div>`;
}
function freshChip(label, detail, stale){
  return `<details class="fresh-chip${stale?" stale":""}" data-k="fresh"><summary>${label}${ICON.chev}</summary><p>${detail}</p></details>`;
}
function renderDl(now,dls){
  const v=document.getElementById("v-dl");
  if (!S){ v.innerHTML=emptyState(); return }
  const due=dls.filter(x=>!isTest(x)), ex=dls.filter(isTest);
  const st=dlStats(dls), dueSt=dlStats(due), exNear=ex.filter(x=>!farTest(x)), exFar=ex.filter(farTest);
  const hotDue=due.filter(upcoming).length;
  const dueLine=[openLine(dueSt.subs, dueSt.quizzes), dueSt.dates?nDates(dueSt.dates):"", dueSt.done?nDone(dueSt.done):"", hotDue?`${hotDue} ב-48 השעות הקרובות`:""].filter(Boolean).join(" · ");
  const sl=stampText((DATA.checked||{}).lemida,now);
  v.innerHTML=(dueLine?`<p class="sec-sub">${dueLine}</p>`:"")+
    (due.length?freshChip(sl?`עודכן ${sl}`:"לא ידוע מתי עודכן", `${sl?`ההגשות עודכנו ${sl}. `:""}סמנו בעיגול מה כבר הגשתם. מה שסומן נשאר ברשימה, באפור, וכתוב עליו הוגשה. חסר משהו? בדקו בלמדה. ${FB_LINE_TXT}`, false)+`<ul class="dls">${dlRows(due,true)}</ul>`:`<p class="clear">אין דדליינים פתוחים.</p>`)+
    `<section class="exams"><header class="sec-h"><h2>מבחנים ובחנים</h2><p>${st.tests?nTests(st.tests):""}</p></header>`+
    (exNear.length?`<ul class="dls">${exNear.map(x=>dlItem(x,true)).join("")}</ul>`:ex.length?"":`<p class="clear">אין מבחנים או בחנים עם תאריך בקורסים שלכם.</p>`)+
    (exFar.length?`<details class="exams-later" data-k="exams-later"><summary>מבחנים בהמשך (${exFar.length})${ICON.chev}</summary><ul class="dls">${exFar.map(x=>dlItem(x,true)).join("")}</ul></details>`:"")+`</section>`;
}

const HWKEY="tzofen-home-v1-done";
let HW_MEM=null;   // set only while this phone cannot save: the ticks of this visit stay on screen, honestly marked as not saved
function hwDone(){
  if (HW_MEM) return new Set(HW_MEM);
  try{ return new Set(JSON.parse(localStorage.getItem(HWKEY))||[]) }catch(e){ return new Set() }
}
function hwSave(d){
  const live=new Set((DATA.deadlines||[]).map(hwId)), arr=JSON.stringify([...d].filter(k=>live.has(k)));
  try{ localStorage.setItem(HWKEY, arr); if (localStorage.getItem(HWKEY)!==arr) throw new Error("not kept"); HW_MEM=null; return true }
  catch(e){ HW_MEM=new Set(JSON.parse(arr)); return false }
}
function hwId(x){ return x.hid || x.date+"|"+x.text }
function hwItem(x,done,fb){
  const on=done.has(hwId(x));
  return dlItem(x,fb,on).replace('<li class="dl','<li class="hw'+(on?' done':'')+' dl')
    .replace(/<\/li>$/,`<button type="button" class="hw-check" role="checkbox" aria-checked="${on}" aria-label="${on?"בוצע":"סימון כבוצע"}: ${esc(x.label)}, ${DAYS[wday(x.date)]} ${dm(x.date)}" data-hw="${esc(hwId(x))}"><i>${IC("check")}</i></button></li>`);
}
function prepLinks(s,nm){
  const out=[], al=l=>nm?` aria-label="${esc(l+": "+nm)}"`:"";
  if (s.lemida) out.push(`<a class="btn ext" href="${esc(s.lemida)}" target="_blank" rel="noopener"${al("הקורס בלמדה")}>הקורס בלמדה</a>`);
  const lauren = s.course.key==="biblio" && S && S.biblio==="lauren";
  const lessonDir = !lauren && s.n && (LESSONS[s.course.key]||{})[s.n];
  const folder = lessonDir || (!lauren && FOLDERS[s.course.key]);
  if (folder) out.push(`<a class="btn ext" href="https://drive.google.com/drive/folders/${encodeURIComponent(folder)}" target="_blank" rel="noopener"${al(lessonDir?"חומרי השיעור":"חומרי הקורס")}>${lessonDir?"חומרי השיעור":"חומרי הקורס"}</a>`);
  return out.length?`<div class="acts">${out.join("")}</div>`:"";
}
const SEENKEY="tzofen-home-v1-seen";
let PREP_NEW=new Set();
function prepSessions(now,list){
  const t=Date.now(), horizon=addDays(now.date,28), seen=new Set(), out=[];
  for (const s of list){
    if (s.mine || endAt(s)<=t || seen.has(s.course.key)) continue;
    seen.add(s.course.key);
    if (s.date<=horizon) out.push(s);
  }
  return out;
}
function prepSig(s){
  const l=s.lesson||{}, txt=[l.topic,l.reading,l.note].map(x=>x||"").join("|")+(l.optional?"|"+l.optional:"");
  if (!(l.topic||l.reading||l.optional||l.note)) return "";
  let h=5381; for (let i=0;i<txt.length;i++) h=((h*33)^txt.charCodeAt(i))>>>0;
  return h.toString(36);
}
function prepSeen(){
  PREP_NEW=new Set();
  if (!S) return;
  const cur={}; for (const s of prepSessions(nowIL(),sessionsFor(S))) cur[s.course.key+"|"+s.date]=prepSig(s);
  let old=null;
  try{ old=JSON.parse(localStorage.getItem(SEENKEY)) }catch(e){}
  if (old && typeof old==="object") for (const k in cur) if (cur[k] && (k in old) && old[k]!==cur[k]) PREP_NEW.add(k);   // a class that only just entered the view is not "changed"
  try{ localStorage.setItem(SEENKEY,JSON.stringify(cur)) }catch(e){}
}
const WP_SRC={syl:"הסילבוס והלמדה", lec:"סימון המרצה", lemida:"למדה", sched:'לו"ז הקורס של הכיתה', board:"לוח המבחנים של הכיתה"};
function wpType(x){
  const text=x.text||"", test=/בוחן|מבחן|בחינה/.test(text), lemida=/lemida\.biu\.ac\.il/.test(x.link||"");
  if (x.kind==="exam") return {label:"מבחן", src:WP_SRC.board, test:true};
  if (x.kind==="event" && test) return {label:/מבחן|בחינה/.test(text)?"מבחן":"בוחן", src:WP_SRC.sched, test:true};
  if (x.kind==="due" && lemida) return /בוחן/.test(text) ? {label:"בוחן בלמדה", src:WP_SRC.lemida, test:true} : {label:"מטלה (למדה)", src:WP_SRC.lemida};
  if (x.kind==="due") return {label:"מטלה", src:WP_SRC.sched};
  return {label:"תאריך", src:WP_SRC.sched};
}
function weekPlan(sess, dls, t, names, o){
  o=Object.assign({sessMs:28*864e5, dlMs:14*864e5}, o||{});
  const next=new Map();
  for (const s of sess){ if (!s.mine && s.endMs>t && !next.has(s.key)) next.set(s.key,s) }
  const open=dls.filter(x=>x.course && x.dueMs>t-6*36e5);          // an item with no course key stays in the Deadlines tab
  const keys=[...new Set([...next.keys(), ...open.map(x=>x.course)])];
  const rows=[], later=[];
  for (const key of keys){
    const s=next.get(key)||null, mine=open.filter(x=>x.course===key).sort((a,b)=>a.dueMs-b.dueMs);
    const near=mine.filter(x=>x.dueMs<=t+o.dlMs);
    if (!near.length && !(s && s.startMs<=t+o.sessMs)){ if (s) later.push({key, name:s.name, date:s.date}); continue }
    let pick=near.slice();
    if (!pick.length && mine.length) pick=[mine[0]];               // nothing soon: show the nearest one, whatever its date
    const farTest=mine.find(x=>!pick.includes(x) && wpType(x).test);  // and where the next test is
    if (farTest) pick.push(farTest);
    const L=(s && s.lesson) || {}, info=!!(L.topic||L.reading||L.optional||L.note), lines=[];
    if (L.topic) lines.push({k:"topic", label:"נושא", text:L.topic});
    if (L.reading) lines.push({k:"reading", label:"קריאה לפני השיעור", text:L.reading, src:WP_SRC.syl});
    if (L.optional) lines.push({k:"optional", label:"רשות", text:L.optional, src:WP_SRC.lec});
    if (info && !L.reading && !L.optional) lines.push({k:"unmarked", label:"קריאה לפני השיעור", text:"המרצה לא סימן קריאה"});
    if (L.note) lines.push({k:"note", label:"הערה", text:L.note});
    rows.push({key, name:(names&&names[key])||(s&&s.name)||key, next:s, info, lines,
      tasks:pick.map(x=>Object.assign({type:wpType(x)}, x))});
  }
  const when=r=>[r.next?r.next.startMs:Infinity, r.tasks.length?r.tasks[0].dueMs:Infinity];
  rows.sort((a,b)=>{ const x=when(a), y=when(b); return x[0]<y[0]?-1:x[0]>y[0]?1:x[1]<y[1]?-1:x[1]>y[1]?1:0 });
  return {rows, later};
}
function stampText(iso,now){
  if (!iso) return null;
  const d=iso.slice(0,10), tm=iso.length>10?iso.slice(11,16):"";
  if (d===now.date) return `היום${tm?` ב-<span class="num">${tm}</span>`:""}`;
  const n=daysFrom(d,now.date);
  return `ב-<span class="num">${dm(d)}</span>${tm?` <span class="num">${tm}</span>`:""}${n>=2?` (לפני ${nDays(n)})`:""}`;
}
function wpTask(x,now,done,cname){
  const left=x.dueMs-Date.now(), isDone=x.kind==="due" && done.has(hwId(x)), hot=left>0 && left<=48*3600e3 && !isDone, k=dlKind(x);
  const lab=stripCourse(x.label,cname);
  const title=bidi(lab)+(x.link?` <a class="dl-open" href="${esc(x.link)}" target="_blank" rel="noopener" aria-label="פתיחה בלמדה: ${esc(x.label)}">בלמדה</a>`:"");
  const until=k==="quiz"?"פתוח עד":x.kind==="due"?"להגשה עד":"תאריך:";
  return `<li><span class="ty">${esc(x.type.label)}</span><span class="ci-tx">${title}</span>`+
    `<span class="ci-due${hot?" hot":""}">${hot?'<span class="dl-urgent">דחוף</span> ':""}${until} ${DAYS[wday(x.date)]} ${dateH(x.date)}${x.time?` · ${timeH(x.time)}`:""}</span>`+
    `<span class="ci-due ci-left${hot?" hot":""}">${isDone?"סומן כבוצע":countText("dl",left,k)}</span>`+
    (x.type.src===WP_SRC.lemida?"":`<small class="ci-src">מקור: ${esc(x.type.src)}</small>`)+`</li>`;
}
function wpRow(r,now,done,isNew,day){
  const s=r.next, cs=Object.values(DATA.courses).find(c=>c.key===r.key)||{};
  const where=s?`מקום: ${esc(whereText({place:s.where, mine:!!(s.ref&&s.ref.mine)}) || "המקום עוד לא פורסם")}`:"";
  const items=r.lines.map(l=>l.k==="topic"||l.k==="note"
      ? `<li><p class="m"><b>${l.label}</b><span>${bidi(l.text)}</span></p></li>`
      : `<li><span class="ty${l.k==="unmarked"?" un":""}">${l.label}</span><span class="ci-tx">${bidi(l.text)}</span>${l.src?`<small class="ci-src">מקור: ${esc(l.src)}</small>`:""}</li>`)
    .concat(r.tasks.map(x=>wpTask(x,now,done,r.name)));
  const lec=lecturerOf(r.key), nq=r.tasks.find(x=>x.type.test);
  const meta=[lec?`מרצה: ${esc(lec.name)}`:"", nq?`${dlKind(nq)==="exam"?"המבחן הבא":"הבוחן הבא"}: ${DAYS[wday(nq.date)]} <span class="num">${dm(nq.date)}</span>`:""].filter(Boolean).join(" · ");
  const chg=s&&s.change?`<p class="cw-change">${CHANGE_RX.test(s.change)?"שינוי ביום הזה":"הערה"}: ${esc(s.change)}. <a class="ext" href="${esc(DATA.source)}" target="_blank" rel="noopener">לצפייה בלו"ז הרשמי</a></p>`:"";
  return `<li class="cw has-fb" data-course="${esc(r.key)}"><div class="cw-h"><h2 class="cw-name">${bidi(r.name)}${isNew?` <span class="tag"><span class="sr"> </span>חדש</span>`:""}</h2>`+
    (s?`<small class="cw-when">השיעור הבא: ${day(s.date)} · <span class="num">${s.start}</span></small>`:`<small class="cw-when">אין שיעורים נוספים בלו"ז</small>`)+`</div>`+
    (where?`<p class="cw-where">${where}</p>`:"")+
    (meta?`<p class="cw-meta">${meta}</p>`:"")+chg+
    (s&&!r.info?`<p class="ci-empty">בלי נושא או קריאה עדיין, בדקו בלמדה.</p>`:"")+
    (items.length?`<ul class="ci-list">${items.join("")}</ul>`:"")+
    recList(r.key)+
    `<div class="cw-foot">`+prepLinks(s&&s.ref?s.ref:{lemida:cs.lemida, course:{key:r.key}, n:0}, r.name)+`<div class="cw-fb">${fbLink(r.name,"קורסים")}</div></div></li>`;
}
function stripCourse(label, name){
  const l=String(label||""), n=String(name||"");
  if (n && l.startsWith(n)){ const r=l.slice(n.length).replace(/^\s*[:\-]\s*/,"").trim(); if (r) return r }
  return l;
}
const recN = c => c===1 ? "הקלטה אחת" : c+" הקלטות";
function recList(key){
  const rs=(DATA.recordings||[]).filter(r=>r.key===key);
  if (!rs.length || !S || !takes(S,key)) return "";
  const kind={live:"הקלטת שיעור", independent:"הקלטה עצמית של המרצה, ללימוד לבד"};
  const cs=Object.values(DATA.courses).find(c=>c&&c.key===key), fresh=rs.some(r=>r.new);
  const rows=rs.slice(0,6).map(r=>{
    const d=r.start.slice(0,10), tm=r.start.slice(11,16), len=recLen(r.length);
    return `<div class="rec-r"><span class="rm">${esc(kind[r.kind]||"הקלטה")}, ${DAYS[wday(d)]} <span class="num">${dm(d)}</span>, שעה <span class="num">${tm}</span>${len?`, ${esc(len)}`:""}</span></div>`;
  }).join("");
  const link=cs&&cs.lemida?`<a class="ext-link ext" href="${esc(cs.lemida)}" target="_blank" rel="noopener" aria-label="ההקלטות בדף הקורס בלמדה: ${esc(cs.name)}">ההקלטות בלמדה</a>`:"";
  return `<details class="cw-rec rec-c" data-k="rec:${esc(key)}"><summary><span class="rn">${recN(rs.length)}${fresh?'<span class="tag"><span class="sr"> </span>חדש</span>':""}</span>${ICON.chev}</summary><div class="rec-in">${rows}${link}</div></details>`;
}
function wpBare(rows,day){
  const n=rows.length;
  const li=rows.map(r=>{
    const s=r.next, cs=Object.values(DATA.courses).find(c=>c&&c.key===r.key)||{};
    const when=s?`${day(s.date)} · <span class="num">${s.start}</span>`:"אין שיעורים נוספים בלו\"ז";
    const rc=(DATA.recordings||[]).filter(x=>x.key===r.key).length;
    const body=`<span class="bare-n">${bidi(r.name)}</span><small>${when}${rc?` · ${recN(rc)}`:""}</small>`;
    return `<li>${cs.lemida?`<a class="bare-a ext" href="${esc(cs.lemida)}" target="_blank" rel="noopener" aria-label="${esc(r.name)}, הקורס בלמדה">${body}</a>`:`<span class="bare-a">${body}</span>`}</li>`;
  }).join("");
  return `<li class="cw cw-bare has-fb"><div class="bare-head"><p class="bare-t">${n===1?"קורס אחד בלי נושא עדיין":n+" קורסים בלי נושא עדיין"}, בדקו בלמדה.</p><div class="cw-fb">${fbLink(n===1?rows[0].name:"קורסים בלי נושא","קורסים")}</div></div><ul class="bare-list">${li}</ul></li>`;
}
let PREP_FILTER="";
function recLen(l){ const p=String(l||"").split(":").map(Number); if (p.length<2||p.some(isNaN)) return ""; const m=p.length===3?p[0]*60+p[1]:p[0]; if (m<60) return m===1?"דקה":m+" דקות"; const h=Math.floor(m/60), r=m%60, hs=nHours(h); return r ? and(hs, r===1?"דקה":r+" דקות") : hs }
function renderPrep(now,list,dls){
  const v=document.getElementById("v-prep");
  if (!S){ v.innerHTML=emptyState(); return }
  const t=Date.now();
  const day=iso=>iso===now.date?"היום":iso===addDays(now.date,1)?"מחר":`${DAYS[wday(iso)]} ${dm(iso)}`;
  const sess=list.map(s=>({key:s.course.key, name:s.course.name||s.title, date:s.date, start:s.start, startMs:startAt(s), endMs:endAt(s),
    mine:!!s.mine, where:(s.course&&s.course.place)||"", lesson:s.lesson||{}, change:CHANGES[s.date]||"", ref:s}));
  const names=Object.fromEntries(Object.values(DATA.courses).map(c=>[c.key,c.name]));
  const plan=weekPlan(sess, dls.map(x=>Object.assign({dueMs:dueAt(x).getTime()},x)), t, names);
  const courses=plan.rows.map(r=>({key:r.key,name:r.name}));
  if (PREP_FILTER && !courses.some(c=>c.key===PREP_FILTER)) PREP_FILTER="";
  const shown=PREP_FILTER?plan.rows.filter(r=>r.key===PREP_FILTER):plan.rows;
  const laterShown=PREP_FILTER?[]:plan.later;
  const chips=courses.length>1?`<div class="pf"><label for="pf-sel">קורס</label><select id="pf-sel"><option value="">כל הקורסים</option>`+courses.map(c=>`<option value="${esc(c.key)}"${PREP_FILTER===c.key?" selected":""}>${esc(c.name)}</option>`).join("")+`</select></div>`:"";
  const done=hwDone();
  const ck=DATA.checked||{};
  const stale=ck.readings && daysFrom(ck.readings,now.date)>=7;
  const sl=stampText(ck.lemida,now), sr=stampText(ck.readings,now);
  const checkedLine=freshChip(stale&&sr ? `הקריאות עודכנו ${sr}` : sl ? `עודכן ${sl}` : "לא ידוע מתי עודכן",
    `${sl?`ההגשות עודכנו ${sl}`:"לא ידוע מתי עודכנו ההגשות"}, ${sr?`והקריאות והנושאים ${sr}`:"ולא ידוע מתי עודכנו הקריאות והנושאים"}. חסר משהו? בדקו בלמדה. ${FB_LINE_TXT}`, stale);
  let cards="", bare=[];
  for (const r of shown){
    if (!r.info && !r.tasks.length) bare.push(r);
    else cards+=wpRow(r,now,done,PREP_NEW.has(r.key+"|"+(r.next&&r.next.date)),day);
  }
  if (bare.length) cards+=wpBare(bare,day);
  const body=checkedLine+(shown.length?`<ul class="dls prep">${cards}</ul>`:`<p class="clear">אין שיעורים או תאריכים קרובים${PREP_FILTER?" בקורס הזה":""}.</p>`)+
    (laterShown.length?`<p class="prep-note">אין שיעור בחודש הקרוב: ${laterShown.map(x=>`${bidi(x.name)} (<span class="num">${dm(x.date)}</span>)`).join(", ")}</p>`:"");
  v.innerHTML=chips+`<section><p class="sec-sub">הנושא, ההקלטות והבחנים של כל קורס</p>${body}</section>`;
}


const LIB_KIND_NAME={summaries:"סיכומי השיעורים", prep:"הכנה לשיעורים", guides:"מפות, מדריכים ומילון", lecturer:"חומרי המרצה מהלמדה"};
const LIB_ORDER=["summaries","prep","guides","lecturer"];
const LIB_EXT={pdf:"PDF", mp3:"שמע", pptx:"PPT", ppt:"PPT", docx:"DOC", doc:"DOC", txt:"TXT", html:"קישורים", xlsx:"XLS"};
let LIB_Q="", LIB_OPEN=null, LIB_MINE=[];
const LIB_GO=IC("arrow-up-right","lib-go flip");
const LIB_WHERE={prep:"3 - הכנה לשיעורים", guides:"0 - מפות, מדריכים ומילון", lecturer:"1 - חומרי המרצה (מהלמדה)"};
function libExact(key,path){
  const fid=DFILES[key]&&DFILES[key][path];
  if (fid) return {href:`https://drive.google.com/file/d/${encodeURIComponent(fid)}/view`, exact:"file"};
  const parts=String(path||"").split("/"); parts.pop();
  while (parts.length){ const d=DFOLD[key]&&DFOLD[key][parts.join("/")]; if (d) return {href:`https://drive.google.com/drive/folders/${encodeURIComponent(d)}`, exact:"folder"}; parts.pop() }
  return null;
}
function libHref(key,lesson,kind){
  const own=kind==="summaries"&&lesson&&LESSONS[key]&&LESSONS[key][String(lesson).padStart(2,"0")];
  const id=own||FOLDERS[key];
  return id?`https://drive.google.com/drive/folders/${encodeURIComponent(id)}`:"";
}
function libGroupName(g){
  const m=g.match(/^(?:ל)?שיעור 0*(\d+) - (.*)$/); if (m) return `שיעור ${m[1]} · ${m[2]}`;
  return g.replace(/^\d+ - /,"");
}
function libRow(key,lesson,f,now,kind,extra){
  const [name,ext,d,vars,paths]=f, fresh=daysFrom(d,now.date)<=3 && daysFrom(d,now.date)>=0;
  const kindTxt=LIB_EXT[ext]||String(ext).toUpperCase();
  const ex=(paths||[]).map(p=>libExact(key,p)), main=ex[0]||null;
  const own=kind==="summaries"&&lesson&&LESSONS[key]&&LESSONS[key][String(lesson).padStart(2,"0")];
  let href="", where="";
  if (main){ href=main.href; if (main.exact==="folder") where="נפתח בתיקייה שלו" }
  else { href=libHref(key,lesson,kind); if (href&&!own&&LIB_WHERE[kind]) where=`בתיקיית הקורס: ${LIB_WHERE[kind]}` }
  const chips=(paths||[]).map((p,i)=>({v:(vars&&vars[i])||"גרסה נוספת",e:ex[i]})).slice(1).filter(c=>c.e&&c.e.exact==="file");
  const shownVars=(vars||[]).filter((v,i)=>v&&(i===0||!(ex[i]&&ex[i].exact==="file")));
  const sub=[kindTxt, shownVars.length?shownVars.join(" · "):"", extra||"", where].filter(Boolean).join(" · ");
  const body=`<span class="lib-n"><bdi>${esc(name)}</bdi>${fresh?'<span class="tag"><span class="sr"> </span>חדש</span>':""}${sub?`<small>${esc(sub)}</small>`:""}</span>`;
  const label=`${name}${vars&&vars[0]?" ("+vars[0]+")":""}`;
  const a=href?`<a class="lib-r lib-main" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(label)}, נפתח בדרייב${where?", "+esc(where):""}">${body}${LIB_GO}</a>`:`<span class="lib-r lib-main">${body}</span>`;
  if (!chips.length) return a;
  return `<div class="lib-row">${a}${chips.map(c=>`<a class="lib-alt" href="${esc(c.e.href)}" target="_blank" rel="noopener" aria-label="${esc(name)} (${esc(c.v)}), נפתח בדרייב">${esc(c.v)}</a>`).join("")}</div>`;
}
function libBody(key,groups,now){
  let h="";
  for (const kind of LIB_ORDER){
    const gs=groups.filter(g=>g[0]===kind); if (!gs.length) continue;
    gs.sort((a,b)=> kind==="lecturer"||kind==="guides" ? String(a[1]).localeCompare(String(b[1]),"he",{numeric:true}) : (b[2]-a[2]) || String(b[1]).localeCompare(String(a[1]),"he"));
    const inner=gs.map(g=>{
      const rows=`<ul class="lib-f">${g[3].map(f=>`<li>${libRow(key,g[2],f,now,kind)}</li>`).join("")}</ul>`;
      return (g[1]?`<p class="lib-g"><bdi>${esc(libGroupName(g[1]))}</bdi></p>`:"")+rows;
    }).join("");
    const n=gs.reduce((a,g)=>a+g[3].length,0);
    h+= kind==="lecturer"
      ? `<details class="lib-lec" data-k="lec:${esc(key)}"><summary>${LIB_KIND_NAME[kind]} (${n})</summary>${inner}</details>`
      : `<h2 class="lib-k">${LIB_KIND_NAME[kind]}</h2>${inner}`;
  }
  return h;
}
function libList(now){
  const L=DATA.library||{}, names=Object.fromEntries(Object.values(DATA.courses).map(c=>[c.key,c.name]));
  const keys=Object.keys(L).sort((a,b)=>{ const ia=LIB_MINE.indexOf(a), ib=LIB_MINE.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b) });
  const q=LIB_Q.trim().toLowerCase();
  if (q){
    const hits=[];
    for (const k of keys) for (const g of L[k]) for (const f of g[3]) if ((f[0]+" "+g[1]+" "+(names[k]||"")).toLowerCase().includes(q)) hits.push([k,g,f]);
    if (!hits.length) return `<p class="clear">לא נמצא כלום עבור "${esc(LIB_Q.trim())}". אפשר לנסות מילה קצרה יותר.</p>`;
    return `<ul class="lib-f lib-found">${hits.slice(0,60).map(([k,g,f])=>`<li>${libRow(k,g[2],f,now,g[0],`${names[k]||k}${g[1]?" · "+libGroupName(g[1]):""}`)}</li>`).join("")}</ul>`+(hits.length>60?`<p class="prep-note">מוצגות 60 התוצאות הראשונות מתוך ${hits.length}. כדאי לדייק את החיפוש.</p>`:"");
  }
  if (LIB_OPEN===null) LIB_OPEN=new Set(keys.length?[keys.find(k=>LIB_MINE.includes(k))||keys[0]]:[]);
  return keys.map(k=>{
    const n=L[k].reduce((a,g)=>a+g[3].length,0), fresh=L[k].reduce((a,g)=>a+g[3].filter(f=>{const d=daysFrom(f[2],now.date); return d>=0&&d<=3}).length,0);
    return `<details class="lib-c" data-lib="${esc(k)}"${LIB_OPEN.has(k)?" open":""}><summary><span class="lib-cn">${bidi(names[k]||k)}</span><span class="lib-cm">${n===1?"קובץ אחד":n+" קבצים"}${fresh?`<span class="tag"><span class="sr">, </span>${fresh===1?"חדש אחד":fresh+" חדשים"}</span>`:""}</span></summary><div class="lib-b"${LIB_OPEN.has(k)?"":" data-lazy=\"1\""}>${LIB_OPEN.has(k)?libBody(k,L[k],now):""}</div></details>`;   // a folded course is built when it is opened
  }).join("");
}
function renderLibrary(now,force,list){
  const v=document.getElementById("v-lib"); if (!v) return;
  if (list) LIB_MINE=[...new Set(list.filter(s=>endAt(s)>Date.now()).sort((a,b)=>startAt(a)-startAt(b)).map(s=>s.course&&s.course.key).filter(Boolean))];
  if (v.hidden && !force) return;   // built when the tab is first opened, repainted only while it is showing
  const L=DATA.library||{}, total=Object.values(L).reduce((a,gs)=>a+gs.reduce((b,g)=>b+g[3].length,0),0);
  if (!total){ v.innerHTML=`<p class="clear">הספרייה עדיין ריקה.</p>`; return }
  if (!(DRIVE_ID && VAULT_OK && Object.keys(FOLDERS).length)){
    v.dataset.ready="";
    v.innerHTML=`<div class="lib-note"><p>הספרייה נפתחת מהקישור של הקבוצה בוואטסאפ, זה שיש בסופו <bdi class="ltr-run" dir="ltr" lang="en">#d=</bdi> ואחריו אותיות ומספרים. הדביקו אותו פעם אחת והחומרים יופיעו כאן.</p><button type="button" class="btn primary" data-open-set>הדבקת הקישור</button></div>`;
    return;
  }
  if (!v.dataset.ready){
    v.innerHTML=`<p class="sec-sub">${total===1?"קובץ אחד":total+" קבצים"} בדרייב</p><div id="lib-note"></div><div class="lib-find"><input type="search" id="lib-q" placeholder="חיפוש בכל החומרים" aria-label="חיפוש בספרייה" autocomplete="off" enterkeyhint="search"></div><div id="lib-list"></div>`;
    v.dataset.ready="1";
    document.getElementById("lib-q").addEventListener("input",e=>{ LIB_Q=e.target.value; document.getElementById("lib-list").innerHTML=libList(nowIL()) });
    v.addEventListener("toggle",e=>{
      const d=e.target;
      if (d.dataset&&d.dataset.lib){
        if (LIB_OPEN===null) LIB_OPEN=new Set();
        d.open?LIB_OPEN.add(d.dataset.lib):LIB_OPEN.delete(d.dataset.lib);
        const b=d.querySelector(":scope>.lib-b[data-lazy]");
        if (d.open && b){ b.innerHTML=libBody(d.dataset.lib,(DATA.library||{})[d.dataset.lib]||[],nowIL()); b.removeAttribute("data-lazy") }
      }
    },true);
  }
  document.getElementById("lib-note").innerHTML = freshChip(`הרשימה נכון ל-<span class="num">${dm(DATA.built||now.date)}</span>`, "לחיצה על קובץ פותחת את התיקייה שלו בדרייב. סיכומים נפתחים בתיקיית השיעור, והשאר בתיקיית הקורס, ומתחת לכל קובץ כתוב באיזו תת-תיקייה הוא.", false);
  const act=document.activeElement, typing=act&&act.id==="lib-q";
  const list_=document.getElementById("lib-list"); const y=window.scrollY;
  list_.innerHTML=libList(now);
  if (!typing) window.scrollTo(0,y);
}

const H1_NAME={today:"היום ומחר", week:"השבוע", prep:"קורסים", lib:"ספרייה", dl:"דדליינים", prac:"תרגול"};
function paintH1(){
  const now=nowIL(), d=new Date(now.date+"T12:00:00Z"), h=document.getElementById("today-long");
  const html=`<span class="h1-t">${H1_NAME[TAB]||H1_NAME.today}</span><small class="h1-d">יום ${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ב${MONTHS[d.getUTCMonth()]}</small>`;
  if (h.dataset.k!==html){ h.dataset.k=html; h.innerHTML=html }
}
const UI_ROOTS="#t-main,#t-dl,#t-strip,#v-week,#v-dl,#v-prep,#v-lib";
const attrq = v => String(v).replace(/["\\]/g,"\\$&");
function detKey(d){ const k=d.dataset.k||d.dataset.pk||d.id; if (!k) return ""; const r=d.closest(UI_ROOTS); return r ? r.id+"/"+k : "" }
function uiSnapshot(){
  const open=new Set();
  for (const d of document.querySelectorAll("details[open]")){ const k=detKey(d); if (k) open.add(k) }
  let focus=null; const a=document.activeElement;
  if (a && a!==document.body && a.closest){
    const r=a.closest(UI_ROOTS);
    if (r){
      focus={root:r.id, sel:"", sum:""};
      if (a.matches("button.row-h")){ const li=a.closest("li[data-uid]"); if (li) focus.sel=`li[data-uid="${attrq(li.dataset.uid)}"]>button.row-h` }
      else if (a.matches("summary")){ focus.sum=detKey(a.parentElement) }
      else { for (const n of ["data-hw","data-day","data-week","data-tab","data-open-set","data-park-refresh"]) if (a.hasAttribute(n)){ focus.sel=`[${n}="${attrq(a.getAttribute(n))}"]`; break }
        if (!focus.sel && a.id) focus.sel="#"+CSS.escape(a.id);
        if (!focus.sel && a.hasAttribute("href")) focus.sel=`a[href="${attrq(a.getAttribute("href"))}"]` }
    }
  }
  return {open, focus};
}
function uiRestore(sn){
  for (const r of UI_ROOTS.split(",")) for (const d of document.querySelectorAll(r+" details")){ const k=detKey(d); if (k && sn.open.has(k) && !d.open) d.open=true }
  const f=sn.focus; if (!f) return;
  const a=document.activeElement;
  if (a && a!==document.body && a!==document.documentElement && a.isConnected) return;   // focus survived, or moved somewhere sensible
  const root=document.getElementById(f.root); let t=null;
  if (root && !root.closest("[hidden]")){
    if (f.sum){ const d=[...root.querySelectorAll("details")].find(x=>detKey(x)===f.sum); t=d&&d.querySelector(":scope>summary") }
    else if (f.sel){ try{ t=root.querySelector(f.sel) }catch(e){} }
  }
  if (!t) t=document.getElementById("main");   // the element is gone: the page content, never the top of the document
  try{ t.focus({preventScroll:true}) }catch(e){}
}
let lastKey="";
function render(force){
  const now=nowIL();
  const key=now.date+"|"+now.min;
  if (!force && key===lastKey) return; lastKey=key;
  const snap=uiSnapshot();
  const d=new Date(now.date+"T12:00:00Z");
  paintH1();
  document.getElementById("tb-date").innerHTML=`${DAYS[d.getUTCDay()]} <span class="num">${dm(now.date)} · ${now.hh}:${now.mm}</span>`;
  document.getElementById("data-date").textContent = dm(DATA.built||now.date);
  const list=S?sessionsFor(S):[];
  const dls=S?deadlinesFor(S):[];
  const openPark=[...document.querySelectorAll("details.park-mini[open]")].map(d=>d.closest("[id]")&&d.closest("[id]").id);
  const blank=(...ids)=>{ for (const id of ids){ const el=document.getElementById(id); if (el && el.firstChild) el.textContent="" } };
  renderToday(now,list,dls);
  if (TAB==="week") renderWeek(now,list,dls); else blank("v-week");
  for (const id of openPark){ const d=id&&document.querySelector(`#${CSS.escape(id)} details.park-mini`); if (d) d.open=true }
  paintParking();
  if (TAB==="dl") renderDl(now,dls); else blank("v-dl");
  if (TAB==="prep") renderPrep(now,list,dls); else blank("v-prep");
  renderLibrary(now,false,list);
  uiRestore(snap);
  const hot=dls.filter(upcoming).length;
  const badge=document.getElementById("dl-badge");
  badge.hidden=!hot; badge.textContent=hot||"";
  document.getElementById("tab-dl").setAttribute("aria-label", "דדליינים"+(hot?", "+(hot===1?"דחוף אחד":hot+" דחופים"):""));
}

const TABS=["today","week","prep","lib","dl","prac"];
function setTab(t,focus){
  if (t!==TAB){ SCROLLS[TAB]=window.scrollY; hsTab(t) }
  TAB=t; paintH1();
  for (const k of TABS){
    const b=document.getElementById("tab-"+k), on=k===t;
    b.setAttribute("aria-selected",on); b.tabIndex=on?0:-1;
    document.getElementById("v-"+k).hidden=!on;
  }
  if (focus) document.getElementById("tab-"+t).focus();
  if (t==="prep") prepSeen();
  render(true);   // the view that just opened is built now (the other views are empty)
  if (t==="lib") renderLibrary(nowIL(), true);
  if (t==="prac"){ loadPractice(); placePrac() } else document.documentElement.classList.remove("d5focus");
  parkOnView();
  window.scrollTo({top:KEEP_SCROLL.has(t) ? (SCROLLS[t]||0) : 0, behavior:"instant"});   // a long tab you come back to keeps its place
  tick();   // a countdown in the view that just appeared is not up to a second old
}
document.querySelector(".tabbar").addEventListener("keydown",e=>{
  const VT=TABS.filter(k=>!document.getElementById("tab-"+k).hidden), i=VT.indexOf(TAB);
  // right-to-left: the next tab sits to the left
  const step = e.key==="ArrowLeft"?1 : e.key==="ArrowRight"?-1 : 0;
  if (e.key==="Home"||e.key==="End"){ e.preventDefault(); setTab(VT[e.key==="Home"?0:VT.length-1],true); return }
  if (!step) return;
  e.preventDefault(); setTab(VT[(i+step+VT.length)%VT.length],true);
});
function goDay(iso){
  const now=nowIL();
  WEEK_OFF=Math.round((Date.parse(weekStart(iso))-Date.parse(weekStart(now.date)))/(7*864e5));
  SEL_DAY=iso;
  if (TAB!=="week") setTab("week");
  render(true);
  const el=document.getElementById("w-"+iso);
  const pg=el&&el.closest("details.wk-past"); if (pg&&!pg.open){ pg.open=true; WK_PAST_OPEN=true }
  if (el) el.scrollIntoView({behavior:REDUCED.matches?"auto":"smooth",block:"start"});
}
let HW_LOCK="";
function toggleHw(id, fromUndo){
  if (!fromUndo && HW_LOCK===id) return;
  HW_LOCK=id; setTimeout(()=>{ if (HW_LOCK===id) HW_LOCK="" },300);
  const d=hwDone();
  if (d.has(id)) d.delete(id); else d.add(id);
  const saved=hwSave(d);
  const y=window.scrollY;
  render(true);
  let again=null; for (const b of document.querySelectorAll(".hw-check")) if (b.dataset.hw===id && !b.closest(".view").hidden){ again=b; break }   // the same item can sit in a hidden tab too
  if (again){ try{ again.focus({preventScroll:true}) }catch(err){ again.focus() } }
  window.scrollTo(0,y);
  syncNote(id,d.has(id));
  if (!saved) toast("לא נשמר במכשיר הזה");
  else if (d.has(id)) toastUndo("סומן כבוצע",()=>toggleHw(id,true));
}
document.addEventListener("click",e=>{
  const t=e.target.closest ? e.target : null; if (!t) return;
  const chk=t.closest(".hw-check");
  if (chk){ toggleHw(chk.dataset.hw, false); return }
  const tab=t.closest(".tab");
  if (tab && tab.tagName==="A") return;   // the practice link is a normal page link
  if (tab){ const k=tab.id.slice(4); if (k===TAB) window.scrollTo({top:0,behavior:REDUCED.matches?"auto":"smooth"}); else setTab(k); return }
  const head=t.closest("button.row-h");
  if (head){
    const li=head.closest(".row"), open=!li.classList.contains("open"), uid=li.dataset.uid;
    li.classList.toggle("open",open); head.setAttribute("aria-expanded",open);
    if (open){ OPEN.add(uid); CLOSED.delete(uid) } else { OPEN.delete(uid); CLOSED.add(uid) }
    return;
  }
  const day=t.closest("[data-day]"); if (day){ goDay(day.dataset.day); return }
  const wk=t.closest("[data-week]");
  if (wk){ const n=+wk.dataset.week; WEEK_OFF = n===0?0:WEEK_OFF+n; SEL_DAY=null; render(true); return }
  const go=t.closest("[data-tab]"); if (go){ setTab(go.dataset.tab); return }
  if (t.closest("[data-open-set]")){ openSetup(); return }
  if (t.closest("[data-park-refresh]")){ fetchParking(); return }
  if (t.closest("[data-prac-retry]")){ loadPractice(); return }
});
(function(){
  const v=document.getElementById("v-week"); let x0=null,y0=0;
  v.addEventListener("touchstart",e=>{ const p=e.touches[0]; x0=p.clientX; y0=p.clientY },{passive:true});
  v.addEventListener("touchend",e=>{
    if (x0===null) return; const p=e.changedTouches[0], dx=p.clientX-x0, dy=p.clientY-y0; x0=null;
    if (Math.abs(dx)<70 || Math.abs(dx)<Math.abs(dy)*1.6) return;
    WEEK_OFF += dx>0 ? 1 : -1; SEL_DAY=null; render(true);
    v.classList.remove("view"); void v.offsetWidth; v.classList.add("view");
  },{passive:true});
})();

const dlg=document.getElementById("setup");
function courseChecks(){
  document.getElementById("f-courses").innerHTML=Object.values(DATA.courses).filter(c=>c.key!=="biblio"&&c.key!=="terror").map(c=>
    `<label><input type="checkbox" switch role="switch" value="${esc(c.key)}" id="c-${esc(c.key)}" checked><span>${esc(c.name)}<small>${esc(whenText(c.when))}</small></span></label>`).join("");
  paintCourseSub();
}
function whenText(w){ return String(w||"").split(" · ").filter(p=>!/חופשת סמסטר/.test(p)).join(" · ") }
function paintCourseSub(){
  const all=[...document.querySelectorAll("#f-courses input")], on=all.filter(c=>c.checked).length, el=document.querySelector("#courses-box .fold-sub");
  if (el) el.textContent = on===all.length ? "כולם מסומנים" : on+" מסומנים מתוך "+all.length;
}
document.getElementById("f-courses").addEventListener("change",paintCourseSub);
function electiveChecks(){
  const E=Object.entries(DATA.electives||{});
  document.getElementById("f-el-box").hidden=!E.length;
  document.getElementById("f-electives").innerHTML=E.map(([k,e])=>{
    const feed="webcal://orihamo.github.io/tzofen/cal/elective-"+k+".ics";
    return `<div class="el"><label><input type="checkbox" switch role="switch" value="${esc(k)}" id="e-${esc(k)}"><span>${esc(e.name)}<small>${esc(whenText(e.when))}</small></span></label>`+
      `<div class="el-btns"><a class="btn" href="${esc(feed)}" rel="noopener">ליומן באייפון</a>`+
      `<a class="btn" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feed)}" target="_blank" rel="noopener">ליומן גוגל</a></div></div>`;
  }).join("");
}
let extraSeq=0;
function extraRow(x={}){
  const i=extraSeq++;
  const div=document.createElement("div"); div.className="extra";
  const opt=[0,1,2,3,4,5].map(n=>`<option value="${n}"${+x.day===n?" selected":""}>${DAYS[n]}</option>`).join("");
  div.innerHTML=`<label class="wide">שם הקורס<input type="text" id="x-name-${i}" maxlength="60" value="${esc(x.name||"")}" placeholder="למשל: אנגלית מתקדמים א'"></label>`+
    `<label>יום<select id="x-day-${i}">${opt}</select></label>`+
    `<label>משעה<input type="time" id="x-start-${i}" value="${esc(x.start||"")}"></label>`+
    `<label>עד שעה<input type="time" id="x-end-${i}" value="${esc(x.end||"")}"></label>`+
    `<label>מתאריך<input type="date" id="x-from-${i}" value="${esc(x.from||DATA.semester.from)}"></label>`+
    `<label>עד תאריך<input type="date" id="x-to-${i}" value="${esc(x.to||END_DATE)}"></label>`+
    `<label class="wide">קישור לזום (לא חובה)<input type="url" id="x-link-${i}" value="${esc(x.link||"")}" dir="ltr" placeholder="https://"></label>`+
    `<button type="button" class="linkbtn rm">הסרה</button>`;
  div.querySelector(".rm").onclick=()=>div.remove();
  document.getElementById("f-extras").appendChild(div);
}
function fill(){
  courseChecks();
  electiveChecks();
  for (const k of (S||{}).electives||[]){ const c=document.getElementById("e-"+k); if(c) c.checked=true }
  document.getElementById("f-extras").innerHTML="";
  const st=S||{};
  document.getElementById("f-remind").value=String(st.remind??15);
  for (const r of document.querySelectorAll('input[name=biblio]')) r.checked=r.value===st.biblio;
  document.getElementById("terror-sw").checked = st.terror==="yes";
  for (const r of document.querySelectorAll('input[name=terror]')) r.checked=r.value===(st.terror==="yes"?"yes":"no");   // the hidden pair mirrors the switch
  for (const k of st.off||[]){ const c=document.getElementById("c-"+k); if(c) c.checked=false }
  document.getElementById("courses-box").open = (st.off||[]).length>0; paintCourseSub();
  (st.extras||[]).forEach(extraRow);
  document.getElementById("f-link-box").hidden = !!DRIVE_ID;
  const mo=document.getElementById("more-opts"), tg=document.getElementById("opts-toggle");
  mo.hidden = !S; tg.hidden = !!S; tg.setAttribute("aria-expanded", "false");
  document.getElementById("f-link").value = "";
}
const PINOFFER=KEY+"-pinoffer";
function paintMoreOffer(){
  const el=document.getElementById("more-offer"); if (!el) return;
  let on=false; try{ on=!IN_APP && localStorage.getItem(PINOFFER)==="1" }catch(e){}
  el.hidden=!on;
  const fp=document.getElementById("foot-pin"), li=fp&&fp.closest("li"); if (li) li.hidden = on || IN_APP;   // the offer card and the row say the same thing: show one
}
document.getElementById("offer-no").onclick=()=>{ try{ localStorage.setItem(PINOFFER,"0") }catch(e){} paintMoreOffer() };
document.getElementById("offer-yes").onclick=()=>{ try{ localStorage.setItem(PINOFFER,"0") }catch(e){} document.getElementById("more").close(); openPin() };
function openSetup(){ fill(); calLinks(); lecturers(); document.getElementById("set-err").textContent=""; document.getElementById("copy-msg").textContent=""; document.getElementById("copy-url").hidden=true; dlg.showModal(); dlg.scrollTop=0 }
function read(){
  const v=n=>(document.querySelector(`input[name=${n}]:checked`)||{}).value||"";
  const extras=[...document.querySelectorAll("#f-extras .extra")].map(div=>{
    const g=s=>div.querySelector(`[id^="x-${s}-"]`).value.trim();
    return {name:g("name"),day:g("day"),start:g("start"),end:g("end"),from:g("from"),to:g("to"),link:g("link")};
  }).filter(x=>x.name);
  return {biblio:v("biblio"), terror:document.getElementById("terror-sw").checked?"yes":"no",   // the switch is the answer: off means not registered
    off:[...document.querySelectorAll("#f-courses input:not(:checked)")].map(c=>c.value),
    electives:[...document.querySelectorAll("#f-electives input:checked")].map(c=>c.value),
    extras, remind:+document.getElementById("f-remind").value};
}
function check(st){
  if (!st.biblio) return "בחרו קבוצה בהדרכה ביבליוגרפית (או 'לא לוקחים').";
  for (const x of st.extras){
    if (!x.start||!x.end) return `חסרות שעות ל"${x.name}".`;
    if (x.end<=x.start) return `שעת הסיום של "${x.name}" לפני שעת ההתחלה.`;
    if (!x.from||!x.to||x.to<x.from) return `בדקו את התאריכים של "${x.name}".`;
    if (x.link && !/^https:\/\//.test(x.link)) return `הקישור של "${x.name}" צריך להתחיל ב-https://`;
  }
  return "";
}
document.getElementById("set-form").addEventListener("submit",e=>{
  e.preventDefault();
  const st=read(), err=check(st);
  document.getElementById("set-err").textContent=err;
  if (err){
    const bad = !st.biblio ? document.querySelector("input[name=biblio]") : document.getElementById("f-extras");
    if (bad.closest("#more-opts")){ document.getElementById("more-opts").hidden=false; document.getElementById("opts-toggle").hidden=true }   // the group question is not inside the fold
    bad.closest("fieldset").scrollIntoView({block:"center",behavior:REDUCED.matches?"auto":"smooth"});
    (bad.focus ? bad : document.getElementById("add-extra")).focus({preventScroll:true});
    return;
  }
  const rawLink = document.getElementById("f-link").value.trim();
  const pasted = driveIdFrom(rawLink);
  if (rawLink && !pasted){
    document.getElementById("set-err").textContent = "הקישור לא מזוהה. הדביקו את הקישור מהקבוצה בוואטסאפ, או את קישור תיקיית הדרייב.";
    document.getElementById("f-link").focus(); return;
  }
  if (pasted && !DRIVE_ID){ DRIVE_ID = pasted; try{ localStorage.setItem(DKEY, pasted) }catch(e){} showDrive(); openVault();
    const pf = document.querySelector("#v-prac iframe"); if (pf) pf.src = pf.src }
  const first=!S;
  S=st; const kept=store(S); writeAddress(); dlg.close(); render(true);
  toast(kept ? "נשמר" : "לא נשמר במכשיר הזה. ההגדרות יעבדו עד שתסגרו את הדף.");
  if (first && kept && !IN_APP) try{ localStorage.setItem(PINOFFER,"1") }catch(e){}   // offered once, as a calm line in More; the sheet never opens by itself
});
document.getElementById("add-extra").onclick=()=>extraRow();
document.getElementById("opts-toggle").onclick=e=>{ document.getElementById("more-opts").hidden=false; e.currentTarget.hidden=true };
function appLink(){ return location.origin + location.pathname + (DRIVE_ID ? "#d=" + DRIVE_ID : "") }
let copyT;
document.getElementById("copy-link").onclick=async()=>{
  const u=document.getElementById("copy-url"), msg=document.getElementById("copy-msg"), link=appLink();
  clearTimeout(copyT);
  try{
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("no clipboard");
    await navigator.clipboard.writeText(link);
    u.hidden=true; msg.textContent="הועתק"; copyT=setTimeout(()=>msg.textContent="",2500);
  }catch(err){ u.value=link; u.hidden=false; u.focus(); u.select(); msg.textContent="סמנו את הקישור והעתיקו" }
};
const toastEl=document.getElementById("toast"); let toastT;
function armToast(ms){
  clearTimeout(toastT);
  toastT=setTimeout(()=>{ toastEl.classList.remove("on"); toastT=setTimeout(()=>{ toastEl.textContent="" },250) },ms);
}
function toast(text){
  clearTimeout(toastT); toastEl.textContent=text; void toastEl.offsetWidth; toastEl.classList.add("on");
  armToast(2500);
}
toastEl.addEventListener("pointerenter",()=>clearTimeout(toastT));
toastEl.addEventListener("focusin",()=>clearTimeout(toastT));
for (const ev of ["pointerleave","focusout"]) toastEl.addEventListener(ev,()=>{ if (toastEl.classList.contains("on") && toastEl.querySelector(".undo")) armToast(4000) });
document.addEventListener("keydown",e=>{   // Ctrl or Cmd + Z takes back the last tick while the message is showing
  if (!(e.ctrlKey||e.metaKey) || e.shiftKey || String(e.key).toLowerCase()!=="z") return;
  const tag=document.activeElement&&document.activeElement.tagName; if (tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return;
  const u=document.querySelector(".toast.on .undo"); if (u){ e.preventDefault(); u.click() }
});
function toastUndo(text,undo){
  clearTimeout(toastT); toastEl.textContent=text+" ";
  const b=document.createElement("button"); b.type="button"; b.className="undo"; b.textContent="ביטול הסימון";
  let armed=false; setTimeout(()=>{ armed=true },250);
  b.onclick=()=>{ if (!armed) return; clearTimeout(toastT); toastEl.classList.remove("on"); toastEl.textContent=""; undo() };   // a double tap on the tick must not land on Undo
  toastEl.appendChild(b); void toastEl.offsetWidth; toastEl.classList.add("on");
  armToast(6000);
}
document.getElementById("skip").addEventListener("click",e=>{
  e.preventDefault(); const m=document.getElementById("main"); m.focus({preventScroll:true}); m.scrollIntoView({block:"start"});
});
document.getElementById("open-set").onclick=openSetup;
function dirty(){
  const k=x=>JSON.stringify({biblio:x.biblio||"",terror:x.terror==="yes"?"yes":"no",off:[...(x.off||[])].sort(),electives:[...(x.electives||[])].sort(),extras:x.extras||[],remind:+(x.remind??15)});
  return dlg.open && k(read())!==k(S||{});
}
function leaveSetup(){
  if (!dirty()) return true;
  const l=document.getElementById("leave"); if (!l.open) l.showModal();
  return false;
}
document.getElementById("leave-stay").onclick=()=>document.getElementById("leave").close();
document.getElementById("leave-go").onclick=()=>{ document.getElementById("leave").close(); dlg.close() };
const HS={held:0, ign:0, skip:false, ready:false, timer:0, stack:[]};
const SCROLLS={}, KEEP_SCROLL=new Set(["prep","lib","dl"]);
const dlgLive = d => d.open && !d._closing;
function hsSync(){
  HS.timer=0;
  const want=HS.stack.filter(dlgLive).length;
  if (want>HS.held){
    try{ for (let i=HS.held;i<want;i++) history.pushState({tz:"sheet"},"",location.href) }catch(e){}
    HS.held=want;
  } else if (want<HS.held){
    const k=HS.held-want; HS.held=want; HS.ign++;
    try{ history.go(-k) }catch(e){ HS.ign=0 }
    setTimeout(()=>{ HS.ign=0 },600);   // no popstate came (nothing to go back to): do not swallow a real one later
  }
}
function hsLater(){ if (!HS.timer) HS.timer=setTimeout(hsSync,0) }
function hsTab(t){
  if (HS.skip || !HS.ready) return;
  try{
    if (HS.held>0){ HS.held--; history.replaceState({tz:"tab",t},"",location.href) }   // a sheet that closes because a tab was chosen hands its entry to the tab
    else history.pushState({tz:"tab",t},"",location.href);
  }catch(e){}
}
function closeTopSheet(){
  const top=[...HS.stack].reverse().find(dlgLive); if (!top) return false;
  if (top===dlg && !leaveSetup()) return true;   // unsaved settings: the leave sheet asks first
  top.close(); return true;
}
addEventListener("popstate",e=>{
  if (HS.ign>0){ HS.ign--; if (!HS.ign) writeAddress(); return }   // stepping back off a closed sheet restores the old address: write the current answers into it again
  if (HS.held>0) HS.held--;                      // the browser removed one of our sheet entries
  if (closeTopSheet()){ hsLater(); return }
  const st=e.state;
  if (st && st.tz==="sheet"){ HS.ign++; try{ history.back() }catch(x){ HS.ign=0 } return }   // forward onto a sheet that is gone: step back off it
  if (st && st.tz==="tab" && TABS.includes(st.t) && st.t!==TAB && !(st.t==="prac" && document.getElementById("tab-prac").hidden)){
    HS.skip=true; try{ setTab(st.t,false) } finally { HS.skip=false }
  }
});
function visible(el){ return !!(el && el.isConnected && el.getClientRects().length) }
function focusBack(d){
  if (HS.stack.some(x=>x!==d && dlgLive(x))) return;   // another sheet is on top
  const mb=document.getElementById("tab-more");
  let t=d._opener;
  if (!visible(t) || (t.closest && t.closest("dialog:not([open])"))) t = d._viaMore && visible(mb) ? mb : null;
  if (!t) t=document.getElementById("main");
  const go=()=>{ const a=document.activeElement; if (!a || a===document.body || a===document.documentElement || !visible(a) || a.closest("dialog:not([open])")){ try{ t.focus({preventScroll:true}) }catch(e){} } };
  go(); requestAnimationFrame(go);
}
const _show0=(window.HTMLDialogElement?HTMLDialogElement.prototype:HTMLElement.prototype).showModal;
(window.HTMLDialogElement?HTMLDialogElement.prototype:HTMLElement.prototype).showModal=function(){
  const d=this, was=d.open, a=document.activeElement;
  if (!was){
    d._viaMore = !!(a && a.closest && a.closest("#more"));
    d._opener = a && a!==document.body && !d._viaMore ? a : null;
  }
  const r=_show0.apply(d,arguments);
  if (!was && d.open){ HS.stack=HS.stack.filter(x=>x!==d); HS.stack.push(d); hsLater() }
  return r;
};
document.addEventListener("close",e=>{
  const d=e.target; if (!d || d.tagName!=="DIALOG") return;
  HS.stack=HS.stack.filter(x=>x!==d);
  hsLater();
  focusBack(d);
},true);
for (const b of document.querySelectorAll("[data-close]")) b.onclick=()=>{ const d=b.closest("dialog"); if (d!==dlg || leaveSetup()) d.close() };
dlg.addEventListener("cancel",e=>{ if (!leaveSetup()) e.preventDefault() });
for (const id of ["pin","news","more"]) document.getElementById(id).addEventListener("click",e=>{ if (e.target===e.currentTarget) e.currentTarget.close() });  // settings close only with X or Esc

function icsEsc(s){ return String(s).replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/([,;])/g,"\\$1") }
function fold(line){
  const enc=new TextEncoder(); const out=[]; let cur="", n=0;
  for (const ch of line){ const b=enc.encode(ch).length; if (n+b>(out.length?74:75)){ out.push(cur); cur=""; n=0 } cur+=ch; n+=b }
  out.push(cur); return out.join("\r\n ");
}
function ics(st){
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z$/,"Z");
  const today=nowIL().date;
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//tzofen-home//he","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:צופן","X-WR-TIMEZONE:Asia/Jerusalem",
    "BEGIN:VTIMEZONE","TZID:Asia/Jerusalem",
    "BEGIN:DAYLIGHT","TZOFFSETFROM:+0200","TZOFFSETTO:+0300","TZNAME:IDT","DTSTART:19700327T020000","RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=23,24,25,26,27,28,29;BYDAY=FR","END:DAYLIGHT",
    "BEGIN:STANDARD","TZOFFSETFROM:+0300","TZOFFSETTO:+0200","TZNAME:IST","DTSTART:19701025T020000","RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU","END:STANDARD",
    "END:VTIMEZONE"];
  for (const s of sessionsFor(st)){
    if (s.date<today) continue;
    const dt=t=>s.date.replace(/-/g,"")+"T"+t.replace(":","")+"00";
    const desc=[s.place, s.zoom?"זום: "+s.zoom:"", s.lemida?"למדה: "+s.lemida:"", s.mine?"":"מקור: לו\"ז צופן הרשמי "+DATA.source].filter(Boolean).join("\n");
    L.push("BEGIN:VEVENT","UID:"+s.uid+"@tzofen-home","DTSTAMP:"+stamp,"DTSTART;TZID=Asia/Jerusalem:"+dt(s.start),"DTEND;TZID=Asia/Jerusalem:"+dt(s.end),
      "SUMMARY:"+icsEsc(s.title),"LOCATION:"+icsEsc(s.zoom?"זום":(s.course.place||"")),"DESCRIPTION:"+icsEsc(desc));
    if (s.zoom) L.push("URL:"+s.zoom);
    if (st.remind>0) L.push("BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEsc(s.title),"TRIGGER:-PT"+st.remind+"M","END:VALARM");
    L.push("END:VEVENT");
  }
  for (const x of deadlinesFor(st)){
    const day=x.date.replace(/-/g,""), t=(x.time||"23:59").replace(":","")+"00";
    L.push("BEGIN:VEVENT","UID:dl-"+day+"-"+(x.course||"x")+"-"+x.text.length+"@tzofen-home","DTSTAMP:"+stamp,
      "DTSTART;TZID=Asia/Jerusalem:"+day+"T"+t,"DTEND;TZID=Asia/Jerusalem:"+day+"T"+t,
      "SUMMARY:"+icsEsc((x.kind==="due"?"הגשה: ":"")+x.label),"DESCRIPTION:"+icsEsc(x.link?"למדה: "+x.link:"מקור: לו\"ז צופן"),
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEsc(x.label),"TRIGGER:-P1D","END:VALARM","END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n")+"\r\n";
}
function download(){
  const st=dlg.open?read():S;
  const err=st?check(st):"כדי להוריד את הקובץ, מלאו קודם את ההגדרות.";
  if (err){ if(!dlg.open) openSetup(); document.getElementById("set-err").textContent=err; return }
  const blob=new Blob([ics(st)],{type:"text/calendar;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="tzofen.ics";
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove()},1500);
}
const UA = navigator.userAgent;
const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const ANDROID = /Android/.test(UA);
const STANDALONE = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const ANDROID_PKG = {"calendar.google.com":"com.google.android.calendar","mail.google.com":"com.google.android.gm","drive.google.com":"com.google.android.apps.docs"};
function appUrl(href){
  let u; try{ u=new URL(href) }catch(e){ return null }
  if (u.protocol!=="https:") return null;
  if (IOS){
    if (u.host==="calendar.google.com" && u.pathname.includes("/render")) return STANDALONE ? "x-safari-" + href : null;
    if (u.host==="calendar.google.com" || u.host==="mail.google.com" || u.host==="drive.google.com") return null;
    return STANDALONE ? "x-safari-" + href : null;          // Lemida, Zoom pages: open in Safari itself
  }
  if (ANDROID){
    const fb = ";S.browser_fallback_url=" + encodeURIComponent(href) + ";end";
    if (u.host==="calendar.google.com" && u.pathname.includes("/render")) return STANDALONE ? "intent://" + u.host + u.pathname + u.search + "#Intent;scheme=https;package=com.android.chrome" + fb : null;
    const pkg = ANDROID_PKG[u.host];
    if (pkg && u.host==="drive.google.com") return "intent://" + u.host + u.pathname + u.search + "#Intent;scheme=https;package=" + pkg + fb;
    if (pkg) return "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=" + pkg + fb;
    return STANDALONE ? "intent://" + u.host + u.pathname + u.search + "#Intent;scheme=https;package=com.android.chrome" + fb : null;
  }
  return null;
}
document.addEventListener("click", e=>{
  if (e.defaultPrevented) return;
  const a = e.target.closest && e.target.closest("a[href]");
  if (!a || !(IOS||ANDROID)) return;
  const app = appUrl(a.href);
  if (!app) return;
  e.preventDefault();
  const web = a.href;
  location.href = app;
  if (IOS){  // no app (or old iOS): if we are still here, open the normal page
    setTimeout(()=>{ if (!document.hidden) window.open(web, "_blank") }, 1400);
  }
});

document.addEventListener("change",e=>{
  if (e.target && e.target.id==="pf-sel"){ PREP_FILTER=e.target.value; render(true); const again=document.getElementById("pf-sel"); if (again) again.focus({preventScroll:true}) }
});
const SYNC_URL="";
const SK_KEY="tzofen-home-v1-synckey", SK_MAP="tzofen-home-v1-syncmap", SK_AT="tzofen-home-v1-syncat";
let syncTimer=null, syncBusy=false, syncState="idle";   // idle | ok | pending
function sget(k){ try{ return localStorage.getItem(k) }catch(e){ return null } }
function sset(k,v){ try{ localStorage.setItem(k,v) }catch(e){} }
function itemKey(id){ let a=0x811c9dc5, b=0x9e3779b1; for (let i=0;i<id.length;i++){ const c=id.charCodeAt(i); a=Math.imul(a^c,16777619)>>>0; b=((Math.imul(b^c,2246822519)>>>0)+i)>>>0 } return a.toString(36)+b.toString(36) }
function syncMap(){ try{ return JSON.parse(sget(SK_MAP))||{} }catch(e){ return {} } }
function pruneMap(m){ const cut=Date.now()-120*864e5, out={}; for (const [k,v] of Object.entries(m)) if (v && v.t>cut) out[k]=v; return out }
function mergeMaps(a,b){ const out={...a}; for (const [k,v] of Object.entries(b||{})){ if (v && (!out[k] || v.t>out[k].t)) out[k]=v } return out }
function newCode(){ const A="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"; return Array.from(crypto.getRandomValues(new Uint8Array(22)),v=>A[v&63]).join("") }
async function keyId(code){ const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("tzofen-tick:"+code)); return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("") }
function adoptLocalTicks(map){   // ticks made before sync existed become entries too
  for (const hid of hwDone()){ const k=itemKey(hid); if (!map[k]) map[k]={d:1,t:Date.now()} }
  return map;
}
function applyMapToDone(map){    // what the page shows as done = items whose newest entry says done
  const look={}; for (const x of DATA.deadlines||[]) if (x.kind==="due") look[itemKey(hwId(x))]=hwId(x);
  const ids=[]; for (const [k,v] of Object.entries(map)) if (v.d===1 && look[k]) ids.push(look[k]);
  const was=JSON.stringify([...hwDone()].sort());
  try{ localStorage.setItem(HWKEY,JSON.stringify(ids)) }catch(e){}
  return was!==JSON.stringify([...ids].sort());
}
function syncNote(id,on){
  if (!SYNC_URL) return;
  const m=adoptLocalTicks(syncMap()); m[itemKey(id)]={d:on?1:0,t:Date.now()};
  sset(SK_MAP,JSON.stringify(pruneMap(m)));
  if (!sget(SK_KEY)) sset(SK_KEY,newCode());
  clearTimeout(syncTimer); syncState="pending"; paintSync(); syncTimer=setTimeout(syncNow,800);
}
async function syncNow(){
  const code=sget(SK_KEY);
  if (!SYNC_URL || !code || syncBusy) return;
  syncBusy=true;
  try{
    const id=await keyId(code);
    let map=adoptLocalTicks(syncMap());
    const res=await fetch(SYNC_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({id,map:pruneMap(map)}),redirect:"follow"});
    const j=await res.json();
    if (!j || !j.ok) throw new Error("server");
    map=pruneMap(mergeMaps(map,j.map));
    sset(SK_MAP,JSON.stringify(map)); sset(SK_AT,String(Date.now())); syncState="ok";
    if (applyMapToDone(map)) render(true);
  }catch(e){ syncState="pending" }
  syncBusy=false; paintSync();
}
function agoText(ms){ const m=Math.max(0,Math.round((Date.now()-ms)/60000)); return m<1?"הרגע":m<60?nMins(m):m<1440?nHours(Math.round(m/60)):nDays(Math.round(m/1440)) }
function paintSync(){
  const el=document.getElementById("sync-status"); if (!el) return;
  const at=+sget(SK_AT)||0;
  el.textContent=!sget(SK_KEY)?"עדיין אין קוד. הוא ייווצר כשתסמנו הגשה כבוצעה."
    : syncState==="pending"?"ממתין לחיבור לרשת. ינסה שוב לבד."
    : at?"מסונכרן, עודכן "+(agoText(at)==="הרגע"?"הרגע":"לפני "+agoText(at)):"מתחבר...";
}
const syncDlg=document.getElementById("sync");
document.getElementById("more-sync-li").hidden=!SYNC_URL;
if (SYNC_URL) document.getElementById("help-sync").hidden=false;
function openSync(){
  if (!sget(SK_KEY)) sset(SK_KEY,newCode());
  document.getElementById("sync-code").value=sget(SK_KEY); document.getElementById("sync-msg").textContent=""; document.getElementById("sync-in").value="";
  paintSync(); syncDlg.showModal(); syncNow();
}
syncDlg.addEventListener("click",e=>{ if (e.target===e.currentTarget) e.currentTarget.close() });
document.getElementById("sync-copy").onclick=async e=>{
  const u=document.getElementById("sync-code"), b=e.currentTarget;
  try{ await navigator.clipboard.writeText(u.value); b.textContent="הועתק" }catch(err){ u.select(); b.textContent="סמנו והעתיקו" }
};
document.getElementById("sync-join").onclick=()=>{
  const v=document.getElementById("sync-in").value.trim(), msg=document.getElementById("sync-msg");
  if (!/^[A-Za-z0-9_-]{22}$/.test(v)){ msg.textContent="הקוד צריך להיות בן 22 תווים. בדקו שהעתקתם אותו שלם."; return }
  sset(SK_KEY,v); document.getElementById("sync-code").value=v; document.getElementById("sync-in").value="";
  msg.textContent="מתחבר..."; syncState="pending"; syncNow().then(()=>{ msg.textContent=syncState==="ok"?"החיבור הצליח. הסימונים התאחדו.":"אין חיבור כרגע. הקוד נשמר והחיבור יתבצע לבד כשיחזור הקשר." });
};
if (SYNC_URL){
  if (sget(SK_KEY)) syncNow();
  document.addEventListener("visibilitychange",()=>{ if (!document.hidden) syncNow() });
  addEventListener("online",syncNow);
}
const help=document.getElementById("help");
function paintFaq(){
  const box=document.getElementById("help-faq"), f=(DATA.taskhelp||{}).faq||[];
  box.innerHTML=f.map(x=>`<p class="help-q">${esc(x.q)}</p><p class="help-a">${bidi(String(x.a||"").replace(/\s*\u2190\s*/g," > "))}</p>`).join("");   // the old arrow glyph becomes a plain ">"
}
paintFaq();
function openHelp(){ if (!help.open) help.showModal() }
help.addEventListener("click",e=>{ if (e.target===e.currentTarget) e.currentTarget.close() });
document.addEventListener("keydown",e=>{
  if (e.ctrlKey||e.metaKey||e.altKey) return;
  const el=document.activeElement, tag=el&&el.tagName;
  if (tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||document.querySelector("dialog[open]")) return;
  if (e.key==="?"){ e.preventDefault(); openHelp(); return }
  const KEYTAB={"1":"today","2":"week","3":"prep","4":"dl","5":"lib"};   // practice has no key
  if (KEYTAB[e.key] && S){ e.preventDefault(); setTab(KEYTAB[e.key],false) }
});
const pin=document.getElementById("pin");
function openPin(){
  const u=document.getElementById("pin-url"); u.value=location.origin+location.pathname+(DRIVE_ID?"#d="+DRIVE_ID:""); pin.showModal(); u.select();
}
document.getElementById("pin-copy").onclick=async e=>{
  const u=document.getElementById("pin-url"), b=e.currentTarget;
  try{ await navigator.clipboard.writeText(u.value); b.textContent="הועתק" }
  catch(err){ u.select(); b.textContent="סמנו והעתיקו" }
};
document.getElementById("dl-ics").onclick=download;
const CAL_SITE="orihamo.github.io/tzofen/cal/";
function feedName(st){ return (st.biblio||"none") + (st.terror==="yes"?"-terror":"") }
function calLinks(){
  const v=n=>(document.querySelector(`input[name=${n}]:checked`)||{}).value||(S&&S[n])||"";
  const ok=v("biblio") && v("terror"), f=feedName({biblio:v("biblio"),terror:v("terror")});
  const ios=document.getElementById("cal-ios"), g=document.getElementById("cal-google");
  ios.href = ok ? "webcal://"+CAL_SITE+f+".ics" : "#";
  g.href = ok ? "https://calendar.google.com/calendar/render?cid="+encodeURIComponent("webcal://"+CAL_SITE+f+".ics") : "#";
  for (const b of [ios,g]){ b.setAttribute("aria-disabled", ok ? "false" : "true"); if (ok) b.removeAttribute("tabindex"); else b.tabIndex=-1 }
  document.getElementById("cal-hint").dataset.missing = ok ? "" : "1";
}
document.getElementById("set-form").addEventListener("change",calLinks);
document.querySelector(".cal-btns").addEventListener("click",e=>{ if (e.target.closest('[aria-disabled="true"]')) e.preventDefault() });
function lecturers(){
  const rows=[];
  for (const c of Object.values(DATA.courses)){
    const l=lecturerOf(c.key); if (!l) continue;
    rows.push(`<li><b>${esc(c.name)}</b>${esc(l.name)}${l.hours?`<br>שעת קבלה: ${ltrTimes(l.hours)}`:""}${l.email?`<br><a href="mailto:${esc(l.email)}" dir="ltr">${esc(l.email)}</a>`:""}</li>`);
  }
  document.getElementById("lect-list").innerHTML = rows.join("") || `<li>אין עדיין פרטים מהסילבוסים.</li>`;
}
function openIcs(){ openSetup(); document.getElementById("cal-box").scrollIntoView({block:"start"}) }

const UPDATES=[
  {id:"2026-11-06-f", date:"2026-11-06", tab:"קורסים", text:"בלשונית קורסים רואים לכל קורס את השיעור הבא, ההקלטות, המרצה והבוחן הבא. קורסים בלי נושא עדיין מקופלים לשורה אחת."},
  {id:"2026-11-06-e", date:"2026-11-06", tab:"היום", text:"שיעורים שכבר נגמרו מקופלים לשורה אחת, והשיעור הבא נשאר למעלה. אם שני שיעורים מתקיימים באותה שעה, אפשר לראות את שניהם."},
  {id:"2026-11-06-d", date:"2026-11-06", tab:"דדליינים", text:"בחנים בלמדה נספרים בנפרד מהגשות, ובכל כרטיס יש קישור קטן לפתיחה בלמדה."},
  {id:"2026-11-06-c", date:"2026-11-06", tab:"השבוע", text:"בימי שישי אחר הצהריים אפשר לקפוץ ישר לשבוע הבא."},
  {id:"2026-11-06-b", date:"2026-11-06", tab:"הגדרות", text:"בפעם הראשונה צריך רק לבחור קבוצה ולסמן אם אתם בטרור וגרילה. שאר האפשרויות נמצאות תחת עוד אפשרויות."},
  {id:"2026-11-06-a", date:"2026-11-06", tab:"כללי", text:"השבוע נפתח על היום, אפשר לבטל סימון הגשה מיד, ובכל קורס ובכל הגשה יש כפתור קטן ששולח לאורי הודעה אם מצאתם טעות."}
];
const NEWSKEY=KEY+"-news";
function newsSeen(){ try{ return localStorage.getItem(NEWSKEY) }catch(e){ return null } }
function paintNews(){
  const unseen=!!UPDATES.length && newsSeen()!==UPDATES[0].id;
  document.getElementById("more-dot").hidden=!unseen; document.getElementById("news-dot").hidden=!unseen;
  document.getElementById("tab-more").setAttribute("aria-label","עוד: ספרייה, תרגול והגדרות נוספות"+(unseen?", יש עדכון חדש":""));
}
function openNews(){
  document.getElementById("news-list").innerHTML=UPDATES.slice(0,6).map(u=>`<li><p class="news-m"><span class="num">${dm(u.date)}</span> · ${esc(u.tab)}</p><p class="news-t">${esc(u.text)}</p></li>`).join("");
  document.getElementById("news").showModal();
  try{ localStorage.setItem(NEWSKEY, UPDATES[0].id) }catch(e){}
  paintNews();
}
const ACT={help:openHelp, pin:openPin, ics:openIcs, sync:openSync, news:openNews};
document.getElementById("swd-keep").onclick=()=>{ SWD_ASK=null; document.getElementById("swd").close() };
document.getElementById("swd-switch").onclick=()=>{ const a=SWD_ASK; SWD_ASK=null; document.getElementById("swd").close(); if (a) adoptDrive(a.id,a.v) };
paintNews();
document.getElementById("more-report").href="https://wa.me/"+WA_NUM+"?text="+encodeURIComponent('היי אורי, לגבי הדף: ');
document.getElementById("rep-set").href=document.getElementById("more-report").href;
{ const fr=document.getElementById("foot-report"); if (fr) fr.href=document.getElementById("more-report").href }

(function(){
  const h1=document.getElementById("today-long"); let queued=false;
  const check=()=>{ queued=false; document.body.classList.toggle("scrolled", h1.getBoundingClientRect().bottom<0) };
  addEventListener("scroll",()=>{ if (!queued){ queued=true; requestAnimationFrame(check) } },{passive:true});
  addEventListener("scrollend",check,{passive:true});
  check();
})();

if (IN_APP) document.getElementById("foot-pin").closest("li").hidden = true;  // already on the home screen
render(true);
openVault();
writeAddress();
(function renderLoop(){ render(false); setTimeout(renderLoop, 60000 - Date.now()%60000 + 150) })();
setInterval(tick,1000);
document.addEventListener("visibilitychange",()=>{ if (!document.hidden){ render(true); parkOnView() } });
document.addEventListener("toggle",e=>{ if (e.target.matches && e.target.matches("details.park-mini") && e.target.open) parkOnView() },true);
document.addEventListener("toggle",e=>{
  const d=e.target; if (!d.matches) return;
  if (d.matches("details.past-sess") && d.dataset.pk){ if (d.open) PAST_OPEN.add(d.dataset.pk); else PAST_OPEN.delete(d.dataset.pk) }
  if (d.id==="wk-past") WK_PAST_OPEN=d.open;   // both directions: closed by the person stays closed after the next refresh
},true);
parkOnView();
function placePrac(){
  const v=document.getElementById("v-prac"), tb=document.querySelector(".tabbar");
  if (!v || !tb) return;
  if (getComputedStyle(tb).position==="fixed"){ v.style.removeProperty("--prac-top"); v.style.removeProperty("--prac-bottom"); return }
  if (getComputedStyle(tb).display==="none") return;   // a session is on: the frame takes the whole screen
  window.scrollTo({top:0,behavior:"instant"});
  v.style.setProperty("--prac-top", Math.ceil(tb.getBoundingClientRect().bottom + 10) + "px");
  v.style.setProperty("--prac-bottom", "env(safe-area-inset-bottom)");
}
window.addEventListener("resize", ()=>{ if (TAB==="prac") placePrac() });
function pracFail(host){
  const f=host.querySelector("iframe"); if (f) f.remove();
  if (host.querySelector(".prac-err")) return;
  host.insertAdjacentHTML("beforeend",`<div class="prac-err" role="status"><p>התרגול לא נטען. בדקו חיבור ונסו שוב</p><button type="button" class="btn primary" data-prac-retry>ניסיון נוסף</button></div>`);
}
const PRAC_MAP={"--paper":"--bg","--surface":"--bg-card","--surface2":"--bg-card-2","--line":"--sep-opaque","--line2":"--ctl-edge","--ink":"--label","--ink2":"--label-2","--ink3":"--label-2",
  "--mark":"--tint-fill","--mark-hover":"--tint-bright","--on-mark":"--on-tint-fill","--mark-soft":"--tint-soft","--mark-ink":"--tint","--hot":"--danger","--hot-soft":"--danger-soft",
  "--free":"--success","--free-soft":"--success-soft","--bar":"--label-2","--bar-dim":"--sep-opaque","--scrim":"--scrim"};
function stylePractice(f){
  try{
    const d=f.contentDocument; if (!d || !d.head) return;
    const cs=getComputedStyle(document.documentElement);
    let css=":root:root:root{color-scheme:"+(cs.colorScheme||"light").split(" ")[0]+";--font:system-ui,-apple-system,\"Segoe UI\",Arial,sans-serif;";
    for (const [k,v] of Object.entries(PRAC_MAP)){ const val=cs.getPropertyValue(v).trim(); if (val) css+=k+":"+val+";" }
    css+="}.btn.primary,.btn.primary:hover{background:var(--mark)!important;border-color:var(--mark)!important;color:var(--on-mark)!important}";
    let st=d.getElementById("tz-theme"); if (!st){ st=d.createElement("style"); st.id="tz-theme"; d.head.appendChild(st) }
    if (st.textContent!==css) st.textContent=css;
  }catch(e){}
}
function loadPractice(){
  const host = document.getElementById("v-prac");
  const have = host.querySelector("iframe");
  if (have){ stylePractice(have); return }
  const old=host.querySelector(".prac-err"); if (old) old.remove();
  const mk=()=>{
    if (host.querySelector("iframe")) return;
    const f = document.createElement("iframe"); f.title = "תרגול יומי"; f.src = "practice.html?embed=1"; f.setAttribute("allow", "clipboard-read");
    let ok=false;
    f.addEventListener("load", ()=>{ ok=true; stylePractice(f) });
    f.addEventListener("error", ()=>pracFail(host));
    setTimeout(()=>{ if (!ok && f.isConnected) pracFail(host) }, 20000);
    host.appendChild(f);
  };
  if (location.protocol==="http:" || location.protocol==="https:"){
    fetch("practice.html?embed=1",{cache:"no-store"}).then(r=>{ if (!r.ok) pracFail(host); else mk() }, ()=>mk());
  } else mk();
}
window.addEventListener("message", e=>{
  if (e.origin !== location.origin || !e.data || !e.data.d5) return;
  if (e.data.d5 === "drive" && validId(e.data.id)) offerDrive(e.data.id);
  if (e.data.d5 === "focus"){ document.documentElement.classList.toggle("d5focus", !!e.data.on); if (!e.data.on) placePrac() }
  if (e.data.d5 === "go" && TABS.includes(tabName(e.data.tab))) setTab(tabName(e.data.tab));
});
HS.skip = true;
{
  const t0 = tabName(hashParam("t") || ""); let hs = null; try{ hs = history.state }catch(e){}
  const t1 = t0 && TABS.includes(t0) ? t0 : hs && hs.tz === "tab" && TABS.includes(hs.t) && !(hs.t === "prac" && document.getElementById("tab-prac").hidden) ? hs.t : "";
  if (t1) setTab(t1);
}
HS.skip = false;
try{ history.replaceState({tz:"tab",t:TAB}, "", location.href) }catch(e){}   // the first entry knows which tab it is
HS.ready = true;
if (HS.stack.some(dlgLive)) hsLater();
if ("serviceWorker" in navigator && (location.protocol==="https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)))
  navigator.serviceWorker.register("sw.js").catch(()=>{});  // back from the background: fresh day
if (!S) openSetup();
else if (!S.biblio){ openSetup(); document.getElementById("set-err").textContent="ההגדרות ששמרתם נפגעו. בחרו שוב את הקבוצה בהדרכה הביבליוגרפית ולחצו על שמירה." }
if (S_DAMAGED && !S) document.getElementById("set-err").textContent="ההגדרות ששמרתם נפגעו. ענו שוב על השאלות ולחצו על שמירה.";
;
(function () {
  "use strict";
  var G = typeof window !== "undefined" ? window : {};
  if (G.D5Notify) return;

  var FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdx6YR36K56lZRU0dQ-28bUFb7XwZ_qok4PD-xdkXvPrfnY_A/formResponse";
  var FORM_FIELDS = {"id": "entry.1596408415", "sub": "entry.691292505", "hour": "entry.1565611198"};
  var VAPID_PUBLIC = "BJYIG31aSFaCLjsKoyf--dY0Ge0OQTeRcqwmn7S6y4Khx8ubKuNDjyKuid3OCKSrhyv7LpS3sUIESQhkZMY0hYw";
  var K = { key: "daily5-k", dev: "daily5-dev", hour: "daily5-hour", snooze: "d5n-snooze", prefs: "d5n-prefs", done: "d5n-done" };
  var SNOOZE_MS = 7 * 864e5;
  var TYPES = [["practice", "תרגול יומי (אם עוד לא סיימתם)"], ["deadline", "מטלות ותאריכי הגשה"], ["class", "שיעורים למחרת"], ["updates", "עדכונים: מטלות, מבחנים והקלטות חדשות, וקבצים חדשים בדרייב"]];
  var TZ = "Asia/Jerusalem";
  var TITLE = "תרגול יומי - 5 דקות";

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function hh(h) { return pad(h) + ":00"; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return pad2(b); }).join(""); }
  function pad2(b) { return (b < 16 ? "0" : "") + b.toString(16); }
  function ub64(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var r = atob(s), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o;
  }
  var REM_PUBLIC = true;
  function enabled() { return REM_PUBLIC || store("daily5-rem") === "1"; }
  function formReady() { return FORM_URL.indexOf("https://") === 0 && FORM_FIELDS && FORM_FIELDS.id; }
  function unlocked() { return /^[A-Za-z0-9_-]{43}$/.test(store(K.key) || ""); }
  function deviceId() {
    var d = store(K.dev);
    if (!d) { d = hex(crypto.getRandomValues(new Uint8Array(4))); store(K.dev, d); }
    return d;
  }
  function rowId() {
    var dev = deviceId(), tok = store(K.key) || "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(tok)) return Promise.resolve("g." + dev);
    var pre = new TextEncoder().encode("daily5-slot"), key = ub64(tok), all = new Uint8Array(pre.length + key.length);
    all.set(pre); all.set(key, pre.length);
    return crypto.subtle.digest("SHA-256", all).then(function (d) { return hex(d).slice(0, 16) + "." + dev; })
      .catch(function () { return "g." + dev; });
  }
  function post(id, sub, hour) {
    var b = new URLSearchParams();
    b.set(FORM_FIELDS.id, id); b.set(FORM_FIELDS.sub, sub); b.set(FORM_FIELDS.hour, hour);
    return fetch(FORM_URL, { method: "POST", mode: "no-cors", body: b });
  }
  function readPrefs() {
    try {
      var p = JSON.parse(store(K.prefs) || "null");
      if (p && Array.isArray(p.t) && p.h >= 7 && p.h <= 22) return p;
    } catch (e) {}
    return null;
  }
  function savedHour() { var p = readPrefs(), h = +(p ? p.h : store(K.hour)); return h >= 7 && h <= 22 ? h : 20; }

  function practiceUrl() {
    var base = (typeof location !== "undefined" ? location.href : "https://example.invalid/tzofen/").split("#")[0].split("?")[0];
    return base.replace(/[^\/]*$/, "") + "practice.html";   /* never carries the personal key */
  }
  function firstDay(hour, now) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() >= hour) d.setDate(d.getDate() + 1);
    return d;
  }
  function stamp(d, h, m) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(h) + pad(m) + "00"; }
  function googleUrl(hour, now) {
    var d = firstDay(hour, now || new Date());
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(TITLE) +
      "&dates=" + stamp(d, hour, 0) + "/" + stamp(d, hour, 5) + "&ctz=" + TZ +
      "&details=" + encodeURIComponent("חמישה כרטיסים, שלוש דקות.\n" + practiceUrl()) + "&recur=RRULE:FREQ=DAILY";
  }
  function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function fold(line) {   /* RFC 5545: 75 octets per line, never inside a multi-byte character */
    var out = [], cur = "", n = 0, max = 75, chars = Array.from(line), i, c, b;
    for (i = 0; i < chars.length; i++) {
      c = chars[i].codePointAt(0); b = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      if (n + b > max) { out.push(cur); cur = " "; n = 1; max = 75; }
      cur += chars[i]; n += b;
    }
    out.push(cur);
    return out.join("\r\n");
  }
  function icsText(hour, now) {
    now = now || new Date();
    var d = firstDay(hour, now), u = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tzofen//Daily 5//HE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VTIMEZONE", "TZID:" + TZ,
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "TZNAME:IDT", "DTSTART:20130329T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=FR;BYMONTHDAY=23,24,25,26,27,28,29", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "TZNAME:IST", "DTSTART:20131027T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT", "UID:daily5-practice@tzofen", "DTSTAMP:" + u, "SEQUENCE:" + Math.floor(now.getTime() / 60000),
      "DTSTART;TZID=" + TZ + ":" + stamp(d, hour, 0), "DTEND;TZID=" + TZ + ":" + stamp(d, hour, 5),
      "RRULE:FREQ=DAILY", "SUMMARY:" + esc(TITLE), "DESCRIPTION:" + esc("חמישה כרטיסים, שלוש דקות.\n" + practiceUrl()),
      "URL:" + practiceUrl(), "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(TITLE), "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ];
    return lines.map(fold).join("\r\n") + "\r\n";
  }
  function downloadIcs(hour) {
    var blob = new Blob([icsText(hour)], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "daily5.ics"; a.rel = "noopener"; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  function isIos() {
    var ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function standalone() { return navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches); }
  function canPush() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function state() {
    if (!enabled()) return "off";
    if (!formReady()) return "unsupported";
    if (isIos() && !standalone()) return "ios";
    if (!canPush()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission === "granted" && readPrefs()) return "on";
    return "setup";
  }
  function snoozed() { return +(store(K.snooze) || 0) > Date.now(); }

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }
  function getSub() {
    return withTimeout(navigator.serviceWorker.register("sw.js").catch(function () {}).then(function () { return navigator.serviceWorker.ready; }), 8000)
      .then(function (reg) {
        return reg.pushManager.getSubscription().then(function (s) {
          return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ub64(VAPID_PUBLIC) });
        });
      });
  }
  function enable(hour, types) {
    var ask = Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    return Promise.resolve(ask).then(function (p) {
      if (p !== "granted") throw new Error("perm");
      return getSub();
    }).then(function (sub) {
      var j = sub.toJSON(); j.prefs = { t: types, h: hour };
      return rowId().then(function (id) { return post(id, JSON.stringify(j), String(hour)); });
    }).then(function () {
      store(K.hour, String(hour)); store(K.prefs, JSON.stringify({ t: types, h: hour, ts: Date.now() }));
    });
  }
  function disable() {
    var p = readPrefs(), hour = p ? p.h : savedHour();
    return withTimeout(navigator.serviceWorker.ready, 8000).then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (sub) {
        var j = sub.toJSON(); j.prefs = { t: [], h: hour };
        return rowId().then(function (id) { return post(id, JSON.stringify(j), String(hour)); });
      }
    }).then(function () { store(K.prefs, JSON.stringify({ t: [], h: hour, ts: Date.now() })); });
  }
  function done() {
    try {
      var p = readPrefs(), d = ymd(new Date());
      if (!formReady() || !p || p.t.indexOf("practice") < 0 || store(K.done) === d) return Promise.resolve();
      return rowId().then(function (id) { return post(id, "", "done:" + d); }).then(function () { store(K.done, d); }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  var mounted = [], uid = 0;
  function el(tag, cls, text) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text;
    if (cls === "d5n-t" && tag === "p") { e.setAttribute("role", "heading"); e.setAttribute("aria-level", "2"); }
    return e;
  }
  function btn(text, cls, fn) { var b = el("button", "d5n-b" + (cls ? " " + cls : ""), text); b.type = "button"; b.addEventListener("click", fn); return b; }

  var CSS = [
    ".d5n{--n-ink:var(--label,var(--ink,#17181a));--n-ink2:var(--label-2,var(--ink-2,var(--ink2,#45474c)));--n-ink3:var(--label-2,var(--ink-3,var(--ink3,#5c5f64)));",
    "--n-surface:var(--bg-card,var(--surface,#fff));--n-surface2:var(--fill-3,var(--surface-2,var(--surface2,#f7f7f4)));--n-line:var(--sep,var(--line,#e1e1db));--n-line2:var(--fill-2,var(--line-2,var(--line2,#c6c6bf)));",
    "--n-mark:var(--tint-fill,var(--mark,#f4b41a));--n-markh:var(--tint-fill,var(--mark-hover,#e6a710));--n-onmark:var(--on-tint-fill,var(--on-mark,#17181a));--n-free:var(--success,var(--free,#3c6635));--n-hot:var(--danger,var(--hot,#b8261a));",
    "color:var(--n-ink);font-family:inherit;min-width:0}",
    ".d5n[hidden]{display:none!important}.d5n[data-d5n]{grid-column:1/-1}",
    ".d5n-card{display:flex;flex-direction:column;gap:12px;background:var(--n-surface);border-radius:var(--r-card,14px);padding:16px}",
    ".d5n-panel{display:flex;flex-direction:column;gap:12px}",
    ".d5n-t{margin:0;font-size:1.0625rem;font-weight:600;line-height:1.3}",
    ".d5n-p{margin:0;font-size:.9375rem;line-height:1.5;color:var(--n-ink2)}",
    ".d5n-row{display:flex;flex-wrap:wrap;gap:8px}",
    ".d5n-b{min-height:44px;padding:0 16px;border-radius:var(--r-ctl,10px);border:1px solid var(--n-line2);background:var(--n-surface2);color:var(--n-ink);font-family:inherit;font-size:.9375rem;font-weight:500;line-height:1.2;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;text-align:center;transition:transform .12s,background-color .12s}",
    "@media (hover:hover){.d5n-b:hover{background:var(--n-surface2)}}",
    ".d5n-b.pri{background:var(--n-mark);border-color:var(--n-mark);color:var(--n-onmark)}@media (hover:hover){.d5n-b.pri:hover{background:var(--n-markh)}}",
    ".d5n-b[disabled]{opacity:.55;cursor:default}",
    ".d5n-link{background:none;border:0;padding:0 2px;min-height:44px;color:var(--n-ink2);text-decoration:underline;text-underline-offset:3px;font:inherit;font-size:.875rem;cursor:pointer;align-self:flex-start}",
    ".d5n-lbl{font-size:.8125rem;font-weight:500;color:var(--n-ink3)}",
    ".d5n select{font:inherit;color:var(--n-ink);background:var(--n-surface);border:1px solid var(--n-line2);border-radius:10px;min-height:48px;padding:0 12px;width:100%}",
    ".d5n fieldset{margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:6px;min-width:0}.d5n legend{padding:0;margin-bottom:6px}",
    ".d5n-chk-list{border:1px solid var(--n-line2);border-radius:10px;overflow:hidden;background:var(--n-surface)}",
    ".d5n-chk{display:flex;align-items:center;gap:12px;min-height:48px;padding:6px 14px;cursor:pointer;font-size:1rem}.d5n-chk+.d5n-chk{border-top:1px solid var(--n-line)}",
    ".d5n-chk input{width:22px;height:22px;flex:none;margin:0;accent-color:var(--tint-fill,var(--n-ink))}",
    ".d5n-msg{margin:0;font-size:.875rem;line-height:1.4;min-height:1.4em;color:var(--n-ink2)}.d5n-msg:empty{display:none}.d5n-msg.ok{color:var(--n-free)}.d5n-msg.bad{color:var(--n-hot)}",
    ".d5n-cal{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--n-line);padding-top:12px}",
    ".d5n :focus-visible{outline:2px solid var(--n-ink);outline-offset:2px}",
    "dialog.d5n-dlg{border:0;padding:0;margin:auto 0 0;width:100%;max-width:100%;max-height:92vh;max-height:92dvh;overflow:auto;background:var(--n-surface,#fff);color:var(--n-ink,#17181a);border-radius:var(--r-sheet,22px) var(--r-sheet,22px) 0 0;box-sizing:border-box}",
    "dialog.d5n-dlg::backdrop{background:var(--scrim,rgba(23,22,18,.28))}",
    "@media (min-width:600px){dialog.d5n-dlg{margin:auto;width:440px;border-radius:var(--r-sheet,22px)}}",
    ".d5n-dh{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px 4px}.d5n-dh .d5n-t{font-size:1.25rem}",
    ".d5n-db{padding:8px 16px calc(20px + env(safe-area-inset-bottom,0px))}",
    ".d5n-x{width:44px;height:44px;border:0;background:none;color:var(--n-ink2);border-radius:10px;cursor:pointer;display:grid;place-items:center}.d5n-x svg{width:22px;height:22px;fill:currentColor}",
    "@media (prefers-reduced-motion:reduce){.d5n-b{transition:none}}"
  ].join("");

  function hourSelect(value, onChange) {
    var s = el("select"); s.id = "d5n-h" + (++uid);
    for (var h = 7; h <= 22; h++) { var o = el("option", "", hh(h)); o.value = h; s.appendChild(o); }
    s.value = String(value);
    if (onChange) s.addEventListener("change", onChange);
    return s;
  }

  function calendarBlock(getHour, ownSelect) {
    var wrap = el("div", "d5n-cal"), sel = null, g;
    wrap.appendChild(el("p", "d5n-lbl", "הוספה ליומן"));
    wrap.appendChild(el("p", "d5n-p", "אירוע יומי של 5 דקות, אפשר גם בלי התראות מהדף."));
    if (ownSelect) {
      var l = el("label", "d5n-lbl", "באיזו שעה?"); sel = hourSelect(savedHour(), upd); l.htmlFor = sel.id;
      wrap.appendChild(l); wrap.appendChild(sel); getHour = function () { return +sel.value; };
    }
    var row = el("div", "d5n-row");
    g = el("a", "d5n-b", "יומן גוגל"); g.target = "_blank"; g.rel = "noopener";
    row.appendChild(g);
    row.appendChild(btn("קובץ ליומן (אייפון ואחרים)", "", function () { downloadIcs(getHour()); }));
    wrap.appendChild(row);
    function upd() { g.href = googleUrl(getHour()); }
    upd();
    wrap._upd = upd;
    return wrap;
  }

  function formBlock(m, st) {
    var wrap = el("div", "d5n-panel"), p = readPrefs(), on = st === "on";
    var allowed = TYPES.filter(function (t) { return t[0] !== "practice" || unlocked(); });
    var chosen = p ? p.t : allowed.map(function (t) { return t[0]; });
    var msg = el("p", "d5n-msg"); msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
    var cal = null;
    if (on) {
      wrap.appendChild(el("p", "d5n-p", p.t.length ? "ההתראות פועלות, כל יום ב-" + hh(p.h) + "." : "ההתראות כבויות."));
    }
    var lh = el("label", "d5n-lbl", "באיזו שעה?"), sel = hourSelect(savedHour(), function () { if (cal) cal._upd(); });
    lh.htmlFor = sel.id; wrap.appendChild(lh); wrap.appendChild(sel);
    var fs = el("fieldset"), lg = el("legend", "d5n-lbl", "מה להזכיר"), list = el("div", "d5n-chk-list"), boxes = [];
    fs.appendChild(lg);
    allowed.forEach(function (t) {
      var lab = el("label", "d5n-chk"), cb = el("input"); cb.type = "checkbox"; cb.value = t[0]; cb.checked = chosen.indexOf(t[0]) >= 0;
      boxes.push(cb); lab.appendChild(cb); lab.appendChild(el("span", "", t[1])); list.appendChild(lab);
    });
    fs.appendChild(list); wrap.appendChild(fs);
    function say(t, k) { msg.textContent = t || ""; msg.className = "d5n-msg" + (k ? " " + k : ""); }
    var go = btn(on ? "שמירה" : "הפעלת התראות", "pri", function () {
      var types = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }), hour = +sel.value;
      if (!types.length) { say("בחרו לפחות סוג אחד של התראה.", "bad"); return; }
      go.disabled = true; say("רגע...");
      enable(hour, types).then(function () {
        m.ui.msg = ["נשמר. ההתראות יגיעו בשעה " + hh(hour) + ".", "ok"]; m.ui.phase = "done"; refresh();
      }).catch(function (e) {
        var perm = e && e.message === "perm";
        if (perm && state() === "denied") { refresh(); return; }
        say(perm ? "בלי הרשאה אי אפשר לשלוח התראות. אפשר לנסות שוב." : "משהו השתבש. נסו שוב בעוד רגע.", "bad");
        go.disabled = false;
      });
    });
    var row = el("div", "d5n-row"); row.appendChild(go);
    if (m.kind === "card") row.appendChild(btn("לא עכשיו", "", function () { snooze(m); }));
    wrap.appendChild(row);
    if (on && p.t.length) {
      var off = el("button", "d5n-link", "כיבוי ההתראות"); off.type = "button";
      off.addEventListener("click", function () {
        off.disabled = true; say("רגע...");
        disable().then(function () { m.ui.msg = ["ההתראות כבויות.", "ok"]; refresh(); }).catch(function () { say("משהו השתבש. נסו שוב בעוד רגע.", "bad"); off.disabled = false; });
      });
      wrap.appendChild(off);
    }
    wrap.appendChild(msg);
    if (m.ui.msg) { say(m.ui.msg[0], m.ui.msg[1]); m.ui.msg = null; }
    if (unlocked()) { cal = calendarBlock(function () { return +sel.value; }, false); wrap.appendChild(cal); }
    return wrap;
  }

  function snooze(m) { store(K.snooze, String(Date.now() + SNOOZE_MS)); m.ui.phase = "closed"; refresh(); }

  function render(m) {
    var host = m.host, st = state(), ui = m.ui, box, focusEl = null;
    if (st === "off") { host.textContent = ""; host.hidden = true; return; }
    host.textContent = ""; host.classList.add("d5n"); host.setAttribute("dir", "rtl"); host.setAttribute("lang", "he");
    if (m.kind === "card") {
      var show = ui.phase !== "closed" && (ui.phase === "done" || ui.phase === "form" || (!snoozed() && (st === "setup" || st === "denied")));
      if (!show) { host.hidden = true; return; }
    }
    host.hidden = false;
    if (m.kind === "panel") box = host; else { box = el("div", "d5n-card"); host.appendChild(box); }

    if (m.kind === "card" && ui.phase === "done") {
      box.appendChild(el("p", "d5n-t", "התראות"));
      var mm = el("p", "d5n-msg ok", ui.msg ? ui.msg[0] : "נשמר."); mm.setAttribute("role", "status"); box.appendChild(mm);
      box.appendChild(el("p", "d5n-p", "אפשר לשנות או לכבות בכל רגע: עוד > התראות."));
      box.appendChild(btn("סגירה", "", function () { ui.phase = "closed"; ui.msg = null; refresh(); }));
      if (!ui.timer) ui.timer = setTimeout(function () { ui.timer = null; if (ui.phase === "done") { ui.phase = "closed"; ui.msg = null; refresh(); } }, 8000);
      return;
    }
    if (m.kind === "section") box.appendChild(el("p", "d5n-t", "התראה יומית"));
    if (m.kind === "section" && st === "setup") box.appendChild(el("p", "d5n-p", "הודעה קצרה בשעה שתבחרו, ורק אם עוד לא סיימתם."));

    if (m.kind === "card" && ui.phase !== "form") {
      if (st === "denied") {
        box.classList.add("d5n-slim");
        box.appendChild(el("p", "d5n-p", "ההתראות חסומות. להפעלה: עוד > התראות"));
        var srow = el("div", "d5n-row");
        srow.appendChild(btn("סגירה", "", function () { snooze(m); }));
        box.appendChild(srow);
        return;
      }
      box.appendChild(el("p", "d5n-t", "חדש: התראות"));
      {
        box.appendChild(el("p", "d5n-p", "הודעה כשנוסף תאריך, מטלה, הקלטה או קובץ חדש בדרייב, והתראה ערב לפני שיעורים ודדליינים. אפשר לכבות בכל רגע."));
        var row = el("div", "d5n-row");
        var yes = btn("כן", "pri", function () { ui.phase = "form"; ui.focus = true; refresh(); });
        row.appendChild(yes); row.appendChild(btn("לא עכשיו", "", function () { snooze(m); }));
        box.appendChild(row);
      }
      return;
    }
    if (m.kind === "card") box.appendChild(el("p", "d5n-t", "התראות"));

    if (st === "unsupported") {
      box.appendChild(el("p", "d5n-p", "הדפדפן הזה לא תומך בהתראות. אפשר להוסיף אירוע יומי ליומן."));
      if (unlocked()) box.appendChild(calendarBlock(null, true));
    } else if (st === "ios") {
      box.appendChild(el("p", "d5n-p", m.kind === "section"
        ? "באייפון אין התראות מהדף. אפשר להוסיף אירוע יומי ליומן."
        : "באייפון אין התראות מהדף. אפשר לקבל תזכורות ביומן: עוד > הוספת השיעורים ליומן."));
      if (unlocked()) box.appendChild(calendarBlock(null, true));
    } else if (st === "denied") {
      box.appendChild(el("p", "d5n-p", "ההתראות חסומות לדף הזה. כדי להפעיל: הגדרות הטלפון, התראות, היום ומחר, ולאפשר התראות. אחר כך חוזרים לכאן."));
      if (unlocked()) box.appendChild(calendarBlock(null, true));
    } else {
      box.appendChild(formBlock(m, st));
    }
    if (ui.focus) { ui.focus = false; var f = box.querySelector("select,button,a"); if (f) f.focus({ preventScroll: false }); }
  }

  function refresh() {
    mounted = mounted.filter(function (m) { return m.host.isConnected; });
    mounted.forEach(render);
    footerButton();
  }

  function mount(host, kind) {
    if (typeof document === "undefined" || !host) return;
    if (!document.getElementById("d5n-css")) { var s = el("style"); s.id = "d5n-css"; s.textContent = CSS; document.head.appendChild(s); }
    if (!mounted.some(function (m) { return m.host === host; })) mounted.push({ host: host, kind: kind, ui: { phase: "ask" } });
    refresh();
  }

  function footerButton() {
    var slot = document.getElementById("more-d5n-li");
    if (!slot || !document.querySelector("[data-d5n=card]")) return;
    var st = state();
    var line = st === "denied" ? "חסום בהגדרות הטלפון" : st === "ios" ? "לא זמין באייפון, אפשר ליומן" : st === "on" ? "פועל" : "התראות על שיעורים והגשות";
    var have = document.getElementById("foot-notify");
    if (have) { var hs = have.querySelector(".more-sub"); if (hs) hs.textContent = line; return; }
    if (st === "off") return;
    if (st === "unsupported" && !unlocked()) return;
    var b = el("button", "more-row"), s = el("span", "", "התראות"), sub = el("small", "more-sub", line);
    b.type = "button"; b.id = "foot-notify"; s.appendChild(sub); b.appendChild(s);
    var go = document.createElementNS("http://www.w3.org/2000/svg", "svg"), use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    go.setAttribute("class", "i go flip"); go.setAttribute("aria-hidden", "true"); go.setAttribute("focusable", "false");
    use.setAttribute("href", "#i-caret-right"); go.appendChild(use); b.appendChild(go);
    b.addEventListener("click", function () { var md = document.getElementById("more"); if (md && md.open) md.close(); openPanel(); });
    slot.appendChild(b); slot.hidden = false;
  }
  function openPanel() {
    var dlg = el("dialog", "d5n d5n-dlg"), head = el("div", "d5n-dh"), body = el("div", "d5n-db"), t = el("h2", "d5n-t", "התראות");
    dlg.setAttribute("aria-labelledby", "d5n-dlg-t"); t.id = "d5n-dlg-t"; t.tabIndex = -1; dlg.setAttribute("dir", "rtl"); dlg.setAttribute("lang", "he");
    var x = el("button", "d5n-x"); x.type = "button"; x.setAttribute("aria-label", "סגירה");
    x.innerHTML = '<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    head.appendChild(t); head.appendChild(x); dlg.appendChild(head); dlg.appendChild(body); document.body.appendChild(dlg);
    var m = { host: body, kind: "panel", ui: { phase: "ask" } }; body.classList.add("d5n-panel"); mounted.push(m); render(m);
    x.addEventListener("click", function () { dlg.close ? dlg.close() : dlg.removeAttribute("open"); });
    dlg.addEventListener("close", function () { mounted = mounted.filter(function (q) { return q !== m; }); dlg.remove(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg && dlg.close) dlg.close(); });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    t.focus();
  }

  var api = { mount: mount, refresh: refresh, done: done, open: function () { if (typeof document !== "undefined") openPanel(); },
    state: state, _ics: icsText, _google: googleUrl, _fold: fold };
  G.D5Notify = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    var init = function () {
      var hosts = document.querySelectorAll("[data-d5n]");
      for (var i = 0; i < hosts.length; i++) mount(hosts[i], hosts[i].getAttribute("data-d5n"));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }
})();
;
(function(){
  "use strict";
  if (!window.HTMLDialogElement || !window.requestAnimationFrame) return;
  var PH = matchMedia("(max-width:640px)"), RM = matchMedia("(prefers-reduced-motion: reduce)");
  var oShow = HTMLDialogElement.prototype.showModal, oClose = HTMLDialogElement.prototype.close;
  var TAU = Math.PI * 2;
  function phone(){ return PH.matches && !RM.matches }
  function run(d, from, to, v0, response, until, done){
    cancel(d);
    var w = TAU / response, x0 = from - to, t0 = performance.now();
    function frame(now){
      var t = Math.min((now - t0) / 1000, 1.2);
      var x = (x0 + (v0 + w * x0) * t) * Math.exp(-w * t), y = to + x;
      put(d, y);
      if ((until && until(y)) || t >= 1.2 || Math.abs(x) < .3){ d._raf = 0; put(d, to); done && done(); return }
      d._raf = requestAnimationFrame(frame);
    }
    d._raf = requestAnimationFrame(frame);
  }
  function cancel(d){ if (d._raf){ cancelAnimationFrame(d._raf); d._raf = 0 } }
  function put(d, y){
    d._y = y;
    d.style.transform = Math.abs(y) < .3 ? "" : "translate3d(0," + y + "px,0)";
    var h = d.offsetHeight || 1;
    d.style.setProperty("--sh", String(Math.max(0, Math.min(1, 1 - y / h))));
  }
  function reset(d){ d.style.transform = ""; d.style.opacity = ""; d.style.removeProperty("--sh"); d.removeAttribute("data-sj"); d._y = 0; d._closing = false; d._anim = null }
  HTMLDialogElement.prototype.showModal = function(){
    var d = this;
    if (d._closing && d.open){      /* opened again while it is still closing: carry on from where it is on screen, no jump */
      cancel(d);
      if (d._anim){ d._anim.onfinish = d._anim.oncancel = null; d._anim.cancel(); d._anim = null }
      d._closing = false;
      if (RM.matches) return;
      run(d, d._y || 0, 0, 0, .38, null, function(){ d.style.willChange = "" });
      return;
    }
    if (d.open) return oShow.call(d);
    if (!phone()){ if (RM.matches) d.style.opacity = ""; return oShow.call(d) }
    d.setAttribute("data-sj", "");
    oShow.call(d);
    var h = d.offsetHeight; put(d, h);
    run(d, h, 0, 0, .38, null, function(){ d.style.willChange = "" });
  };
  HTMLDialogElement.prototype.close = function(rv){
    var d = this;
    if (!d.open || d._closing) return oClose.call(d, rv);
    if (RM.matches){            /* reduced motion: short fade, no travel */
      d._closing = true;
      var a = d.animate([{opacity: 1}, {opacity: 0}], {duration: 140, easing: "linear"});
      a.onfinish = a.oncancel = function(){ reset(d); oClose.call(d, rv) };
      d._anim = a;
      return;
    }
    if (!phone()) return oClose.call(d, rv);
    d._closing = true;
    var h = d.offsetHeight, v = d._v || 0; d._v = 0;
    run(d, d._y || 0, h + 24, Math.max(v, 0), .3, function(y){ return y >= h }, function(){ reset(d); oClose.call(d, rv) });
  };
  function wire(d){
    d.addEventListener("cancel", function(e){          /* Esc: same exit, after the sheet's own guard has run */
      if (e.defaultPrevented || d._closing) return;
      if (phone() || RM.matches){ e.preventDefault(); d.close() }
    });
    var g = null;
    d.addEventListener("pointerdown", function(e){
      if (!phone() || (e.pointerType === "mouse" && e.button !== 0)) return;
      var hd = e.target.closest(".sheet-h");
      if (!hd || e.target.closest("button,a,input,select,textarea")) return;
      cancel(d); d._closing = false;                     /* grab it mid-flight: start from where it is on screen */
      g = {id: e.pointerId, sy: e.clientY, y0: d._y || 0, moved: false, h: [], el: hd};
      hd.setPointerCapture(e.pointerId);
    });
    d.addEventListener("pointermove", function(e){
      if (!g || e.pointerId !== g.id) return;
      var dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dy) < 6) return;           /* small hysteresis before it counts as a drag */
      g.moved = true;
      var y = g.y0 + dy;
      if (y < 0){ var o = -y, D = 160; y = -(o * D * .55) / (D + .55 * o) }   /* rubber band above the rest position */
      put(d, y);
      g.h.push([e.timeStamp, y]); if (g.h.length > 6) g.h.shift();
    });
    function end(e, cancelled){
      if (!g || e.pointerId !== g.id) return;
      var s = g; g = null;
      if (!s.moved){ return }
      var h = d.offsetHeight, y = d._y, v = 0;
      if (s.h.length > 1){ var a = s.h[0], b = s.h[s.h.length - 1], dt = (b[0] - a[0]) / 1000; if (dt > 0) v = (b[1] - a[1]) / dt }
      var proj = y + (v / 1000) * .998 / (1 - .998);       /* where the flick is heading (UIScrollView deceleration) */
      if (!cancelled && v > -200 && proj > h * .5){
        d._v = v;
        var x = d.querySelector("[data-close]");           /* same path as the X button, so unsaved-change guards still apply */
        if (x) x.click(); else d.close();
        if (d.open && !d._closing) run(d, d._y, 0, v, .3, null, null);   /* guard said no: spring back with the finger's velocity */
      } else run(d, y, 0, v, .3, null, null);
    }
    d.addEventListener("pointerup", function(e){ end(e, false) });
    d.addEventListener("pointercancel", function(e){ end(e, true) });
  }
  for (var i = 0, ds = document.querySelectorAll("dialog"); i < ds.length; i++) wire(ds[i]);
  document.documentElement.classList.add("sj");
  document.addEventListener("touchstart", function(){}, {passive: true});   /* lets :active fire on iPhone Safari */
})();
;
(function(){
  "use strict";
  var RM = matchMedia("(prefers-reduced-motion: reduce)"), WIDE = matchMedia("(min-width:900px)");
  var TAU = Math.PI * 2;
  function springPts(zeta, response, n){
    var w = TAU / response, pts = [], T = response * 1.4, i, t, p, wd;
    for (i = 0; i <= n; i++){
      t = T * i / n;
      if (zeta >= 1) p = 1 - (1 + w * t) * Math.exp(-w * t);
      else { wd = w * Math.sqrt(1 - zeta * zeta); p = 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t)) }
      pts.push(p);
    }
    return {pts: pts, ms: T * 1000};
  }
  var S1 = springPts(1, .23, 20), SB = springPts(.62, .32, 24);
  function anim(el, S, frame){
    var kf = S.pts.map(frame);
    return el.animate(kf, {duration: S.ms, easing: "linear", fill: "backwards"});
  }
  var clamp = function(v, a, b){ return Math.max(a, Math.min(b, v)) };

  var tabbar = document.querySelector(".tabbar"), more = document.getElementById("tab-more"), pill = tabbar.querySelector(".pill");
  function selTab(){
    if (TAB === "lib" || TAB === "prac") return more;
    return document.getElementById("tab-" + TAB);
  }
  function place(instant){
    if (WIDE.matches || !pill) return;
    var t = selTab(); if (!t) return;
    var r = t.getBoundingClientRect(), b = tabbar.getBoundingClientRect();
    if (!r.width) return;
    if (instant){ pill.style.transition = "none" }
    tabbar.style.setProperty("--px", (r.left - b.left) + "px");
    tabbar.style.setProperty("--pw", r.width + "px");
    if (instant){ void pill.offsetWidth; pill.style.transition = "" }
  }
  function syncMore(){   /* More is a button, not a tab: it says "current" while Library or Practice is showing */
    if (TAB === "lib" || TAB === "prac") more.setAttribute("aria-current", "true"); else more.removeAttribute("aria-current");
  }

  var ORDER = ["today", "week", "prep", "lib", "dl", "prac"], ghost = null;
  var orig = window.setTab;
  function dropGhost(){ if (ghost){ ghost.remove(); ghost = null } }
  window.setTab = function(t, focus){
    var from = TAB;
    if (t === from) return orig(t, focus);
    var vOld = document.getElementById("v-" + from), vNew = document.getElementById("v-" + t);
    var carry = null, oldOp = 1, cs;
    if (ghost && ghost._src === t){ cs = getComputedStyle(ghost); carry = {op: parseFloat(cs.opacity), tx: new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform).m41}; if (isNaN(carry.op)) carry = null }
    if (vOld && !vOld.hidden){ oldOp = parseFloat(getComputedStyle(vOld).opacity); if (isNaN(oldOp)) oldOp = 1 }
    dropGhost();
    var canSlide = vOld && !vOld.hidden && from !== "prac" && t !== "prac";
    var dir = ORDER.indexOf(t) > ORDER.indexOf(from) ? -1 : 1, g = null;
    if (canSlide && !RM.matches){
      var r = vOld.getBoundingClientRect();
      g = vOld.cloneNode(true);
      g.removeAttribute("id"); g.removeAttribute("role"); g.removeAttribute("aria-labelledby");
      var ids = g.querySelectorAll("[id]"); for (var i = 0; i < ids.length; i++) ids[i].removeAttribute("id");
      g.setAttribute("aria-hidden", "true"); g.inert = true; g.hidden = false; g._src = from;
      g.style.cssText = "position:fixed;margin:0;z-index:5;pointer-events:none;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px";
      document.body.appendChild(g); ghost = g;
    }
    orig(t, focus);
    syncMore(); place(false); document.documentElement.dataset.tab = TAB;
    var tab = selTab();
    if (RM.matches){
      vNew.animate([{opacity: 0}, {opacity: 1}], {duration: 160, easing: "linear"});
    } else {
      var so = carry ? clamp(carry.op, 0, 1) : 0, sx = carry ? carry.tx : dir * 28;
      anim(vNew, S1, function(p){ return {opacity: so + (1 - so) * clamp((p - .2) * 1.7, 0, 1), transform: "translate3d(" + (sx * (1 - p)).toFixed(2) + "px,0,0)"} });
      if (g){
        var a = anim(g, S1, function(p){ return {opacity: oldOp * clamp(1 - p * 5.5, 0, 1), transform: "translate3d(" + (-dir * 28 * p).toFixed(2) + "px,0,0)"} });
        a.onfinish = a.oncancel = function(){ if (ghost === g) dropGhost(); else g.remove() };
      }
      if (tab && tab.firstElementChild){ var ic = tab.querySelector(".ic"); if (ic) anim(ic, SB, function(p){ return {transform: "scale(" + (.78 + .22 * p).toFixed(3) + ")"} }) }
    }
  };
  syncMore(); place(true); document.documentElement.dataset.tab = TAB;
  addEventListener("resize", function(){ place(true) });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ place(true) });

  tabbar.addEventListener("keydown", function(e){
    if (WIDE.matches || !e.target.closest || !e.target.closest(".tablist")) return;
    var step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0, hm = e.key === "Home", en = e.key === "End";
    if (!step && !hm && !en) return;
    var list = Array.prototype.filter.call(tabbar.querySelectorAll(".tablist .tab"), function(t){ return t.offsetParent !== null });
    var cur = list.indexOf(document.activeElement); if (cur < 0) cur = 0;
    var next = hm ? 0 : en ? list.length - 1 : (cur + step + list.length) % list.length, t = list[next];
    e.preventDefault(); e.stopImmediatePropagation();
    setTab(t.id.slice(4), true);
  }, true);

  var md = document.getElementById("more");
  more.addEventListener("click", function(e){
    e.stopPropagation();
    var pr = document.getElementById("tab-prac"), row = md.querySelector('[data-go="prac"]');
    if (row) row.parentNode.hidden = pr.hidden;
    var ls = document.getElementById("more-lib-sub");   /* the library only opens with the group link: say so before the tap */
    if (ls) ls.textContent = (typeof DRIVE_ID !== "undefined" && DRIVE_ID && typeof VAULT_OK !== "undefined" && VAULT_OK) ? "כל החומרים בדרייב, לפי קורס" : "נפתחת מהקישור של הקבוצה";
    if (typeof paintMoreOffer === "function") paintMoreOffer();
    md.showModal();
  });
  md.addEventListener("click", function(e){
    if (e.target === md){ md.close(); return }
    var b = e.target.closest("[data-go],[data-act]"); if (!b) return;
    md.close(); window.__fromMore = !!b.dataset.act;
    if (b.dataset.go) setTab(b.dataset.go); else if (b.dataset.act && typeof ACT !== "undefined" && ACT[b.dataset.act]) ACT[b.dataset.act]();
  });
  md.addEventListener("close", function(){ more.setAttribute("aria-expanded", "false") });
  more.addEventListener("click", function(){ more.setAttribute("aria-expanded", "true") });

  var h1 = document.getElementById("today-long"), tb = document.getElementById("topbar"), q = false;
  function upd(){
    q = false;
    var p = clamp((tb.offsetHeight + 4 - h1.getBoundingClientRect().bottom) / 28, 0, 1);
    tb.style.setProperty("--p", p.toFixed(3));
    tb.classList.toggle("on", p > 0);
  }
  addEventListener("scroll", function(){ if (!q){ q = true; requestAnimationFrame(upd) } }, {passive: true});
  addEventListener("resize", upd);
  upd();
})();

(function(){
  "use strict";
  var doc = document, root = doc.documentElement;
  var RM = matchMedia("(prefers-reduced-motion: reduce)");

  try { if ("switch" in HTMLInputElement.prototype) root.classList.add("nsw") } catch (e) {}

  var ac = null;
  function buzz(ms){
    try {
      if (RM.matches || !navigator.vibrate) return;
      var ua = navigator.userActivation;                  /* the browser only allows a vibration right after a tap or key press */
      if (ua && !ua.isActive) return;
      navigator.vibrate(ms || 8);
    } catch (e) {}
  }
  function tick(){
    try {
      if (localStorage.getItem("tz-sound") !== "1") return;
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 1400; g.gain.value = .02;
      o.connect(g); g.connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .03); o.stop(ac.currentTime + .035);
    } catch (e) {}
  }
  function feedback(ms){ buzz(ms); tick() }

  var ROW = ".row-h,.lib-r,.lib-c>summary,details>summary,.quick a,.more-row,.opts.list label,.checks label,.el label,.prac,a.alert,.day,.tcard>summary";
  var BTN = ".btn,.d5n-b,.d5n-link,.icon-btn,.hw-check,.tab,.opts:not(.list) label,.linkbtn,.lib-alt,.tf-clear,.toast .undo";
  var LNK = ".dl-title a,.ci-tx a,.quiet a,.help-a a,p.hint a,.faq a,a[href^='mailto:'],.foot a,.lect a,.fb,.recs a,.park-off a";
  var ALL = ROW + "," + BTN + "," + LNK;
  var press = null, SLOP = 10;
  function kindOf(el){ return el.matches(".checks input,.el input") ? "sw" : el.matches(BTN) ? "btn" : el.matches(ROW) ? "row" : "link" }
  function inside(el, x, y){ var r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom }
  function setOn(on){ if (!press) return; if (on !== press.on){ press.on = on; press.el.classList.toggle("pressed", on) } }
  doc.addEventListener("pointerdown", function(e){
    if (press){ press.el.classList.remove("pressed"); press = null }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    var t = e.target.closest && (e.target.closest(".checks input[type=checkbox],.el input[type=checkbox]") || e.target.closest(ALL));
    if (!t || t.disabled || t.getAttribute("aria-disabled") === "true") return;
    t.setAttribute("data-pk", kindOf(t));
    press = {el: t, id: e.pointerId, x: e.clientX, y: e.clientY, on: false, type: e.pointerType};
    setOn(true);                                                                       /* same frame as the event */
  }, {capture: true, passive: true});
  doc.addEventListener("pointermove", function(e){
    if (!press || e.pointerId !== press.id) return;
    var d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    var ok = inside(press.el, e.clientX, e.clientY) && (press.type === "mouse" || d <= SLOP);
    setOn(ok);                                                                         /* cancels on drag-away, restores on return */
  }, {capture: true, passive: true});
  function end(e){
    if (!press || e.pointerId !== press.id) return;
    var p = press; press = null;
    p.el.classList.remove("pressed");                                                  /* CSS fades it out */
  }
  doc.addEventListener("pointerup", end, {capture: true, passive: true});
  doc.addEventListener("pointercancel", end, {capture: true, passive: true});
  addEventListener("blur", function(){ if (press){ press.el.classList.remove("pressed"); press = null } });

  doc.addEventListener("change", function(e){
    var t = e.target; if (!t || t.tagName !== "INPUT") return;
    if (t.type === "checkbox" || t.type === "radio") feedback(8);
    var list = t.closest && t.closest(".opts.list");
    if (list){ list.classList.add("anim"); clearTimeout(list._a); list._a = setTimeout(function(){ list.classList.remove("anim") }, 800) }
  }, true);
  doc.addEventListener("click", function(e){
    var t = e.target.closest && e.target.closest(".tab,.hw-check,.more-row");
    if (t) feedback(t.classList.contains("hw-check") ? 12 : 6);
  }, true);

  function segs(){ return doc.querySelectorAll(".opts:not(.list):not(.hid)") }
  function place(seg, still){
    var th = seg.querySelector(".seg-thumb"), on = seg.querySelector("input:checked"), lab = on && on.closest("label");
    if (!th) return;
    if (!lab || !lab.offsetWidth){ seg.classList.remove("seg-on"); th.style.opacity = "0"; return }
    var s = seg.getBoundingClientRect(), r = lab.getBoundingClientRect();
    if (still){ seg.classList.add("seg-still") }
    th.style.opacity = "1";
    seg.style.setProperty("--tx", (r.left - s.left - (parseFloat(getComputedStyle(seg).borderLeftWidth) || 0)) + "px");
    seg.style.setProperty("--tw", r.width + "px");
    seg.classList.add("seg-on");
    if (still){ void th.offsetWidth; seg.classList.remove("seg-still") }
  }
  function build(){
    segs().forEach(function(seg){
      if (!seg.querySelector(".seg-thumb")){ var i = doc.createElement("i"); i.className = "seg-thumb"; i.setAttribute("aria-hidden", "true"); seg.insertBefore(i, seg.firstChild);
        seg.addEventListener("change", function(){ place(seg, false) });
        if (window.ResizeObserver) new ResizeObserver(function(){ place(seg, true) }).observe(seg) }
      place(seg, true);
    });
  }
  var sw = doc.getElementById("terror-sw"), ry = doc.querySelector("input[name=terror][value=yes]"), rn = doc.querySelector("input[name=terror][value=no]");
  function fromRadios(){ if (sw && ry) sw.checked = ry.checked }
  if (sw && ry && rn){
    sw.addEventListener("change", function(){ var r = sw.checked ? ry : rn; r.checked = true; r.dispatchEvent(new Event("change", {bubbles: true})) });
    [ry, rn].forEach(function(r){ r.addEventListener("change", fromRadios) });
  }
  var DP = window.HTMLDialogElement ? HTMLDialogElement.prototype : HTMLElement.prototype;   /* old iOS: the page script brings its own showModal */
  var oShow = DP.showModal;
  DP.showModal = function(){
    var d = this, r = oShow.apply(d, arguments);
    fromRadios();
    requestAnimationFrame(function(){ build(); requestAnimationFrame(build) });
    return r;
  };
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(build);
  build();

  var clr = null, cur = null;
  var X = '<i><svg class="i" aria-hidden="true" focusable="false"><use href="#i-x"/></svg></i>';
  function textLike(el){ return el && el.tagName === "INPUT" && /^(text|email|url|tel)$/.test(el.type) && !el.readOnly && !el.closest(".copy-row") }
  function ensureClr(){
    if (clr) return clr;
    clr = doc.createElement("button"); clr.type = "button"; clr.className = "tf-clear"; clr.tabIndex = -1; clr.setAttribute("aria-label", "ניקוי"); clr.innerHTML = X;
    clr.addEventListener("pointerdown", function(e){ e.preventDefault() });            /* keep the keyboard and the focus */
    clr.addEventListener("click", function(){ if (!cur) return; cur.value = ""; cur.dispatchEvent(new Event("input", {bubbles: true})); cur.focus(); sync() });
    return clr;
  }
  function sync(){ if (clr && cur) clr.classList.toggle("on", !!cur.value) }
  function detach(){ if (clr && clr.parentNode){ clr.parentNode.classList.remove("tf-host"); clr.remove() } if (cur) cur.classList.remove("tf-cur"); cur = null }
  doc.addEventListener("focusin", function(e){
    var el = e.target;
    if (!textLike(el)){ detach(); return }
    if (cur !== el){ detach(); cur = el; var host = el.parentNode; host.classList.add("tf-host"); host.appendChild(ensureClr());
      clr.style.top = (el.offsetTop + (el.offsetHeight - 44) / 2) + "px"; clr.style.insetInlineEnd = "4px" }
    sync();
    var dlg = el.closest("dialog");
    if (dlg) setTimeout(function(){ try { el.scrollIntoView({block: "center", behavior: RM.matches ? "auto" : "smooth"}) } catch (x) {} }, 320);
  });
  doc.addEventListener("focusout", function(e){ if (textLike(e.target)) setTimeout(function(){ if (!doc.activeElement || doc.activeElement !== cur) detach() }, 60) });
  doc.addEventListener("input", function(e){ if (e.target === cur) sync() });
  doc.addEventListener("keydown", function(e){
    if (e.key === "Enter" && textLike(e.target) && e.target.closest("dialog")){ e.preventDefault(); e.target.blur() }
  });

  if (window.visualViewport){
    var vv = visualViewport, f = 0;
    var upd = function(){ f = 0; var kb = Math.max(0, innerHeight - vv.height - vv.offsetTop); root.style.setProperty("--kb", kb > 80 ? kb + "px" : "0px") };
    var q = function(){ if (!f) f = requestAnimationFrame(upd) };
    vv.addEventListener("resize", q); vv.addEventListener("scroll", q);
  }
})();
