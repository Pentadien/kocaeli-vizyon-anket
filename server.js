/*
 * KATILIM — Canlı Görüş ve Oylama Platformu
 * Kocaeli Büyükşehir Belediyesi · Şehir Planlama Şube Müdürlüğü
 *
 * Harici bağımlılık YOKTUR. Yalnızca Node.js (v18+) gerekir:
 *     node server.js
 *
 * Ortam değişkenleri (isteğe bağlı):
 *   PORT            Sunucu portu (varsayılan 3000)
 *   ADMIN_PASSWORD  Yönetim paneli şifresi (varsayılan: kocaeli2053 — MUTLAKA değiştirin)
 *   PUBLIC_URL      Katılımcıların QR ile gideceği dış adres (ör. https://katilim.kocaeli.bel.tr)
 *   DATA_FILE       Veri dosyası yolu (varsayılan ./data/veri.json)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kocaeli2053';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'veri.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const BASLANGIC = Date.now();

/* ------------------------------------------------------------------ */
/*  Veri katmanı                                                       */
/* ------------------------------------------------------------------ */

let db = { settings: { publicUrl: process.env.PUBLIC_URL || '' }, events: [] };

const uid = (n = 10) => crypto.randomBytes(16).toString('base64url').replace(/[-_]/g, '').slice(0, n);

function loadDb() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      db.settings = db.settings || {};
      if (process.env.PUBLIC_URL) db.settings.publicUrl = process.env.PUBLIC_URL;
      db.events = db.events || [];
      console.log(`[veri] ${db.events.length} etkinlik yüklendi: ${DATA_FILE}`);
      return;
    }
  } catch (e) {
    console.error('[veri] Dosya okunamadı, yedek alınıp yeni dosya açılıyor:', e.message);
    try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.bozuk-' + Date.now()); } catch (_) {}
  }
  db.events = require('./seed.js')(uid);
  saveNow();
  console.log('[veri] Başlangıç etkinlikleri oluşturuldu.');
}

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 400);
}
function saveNow() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

const findEventByCode = (code) =>
  db.events.find((e) => e.code.toLocaleUpperCase('tr-TR') === String(code || '').toLocaleUpperCase('tr-TR'));
const findEventById = (id) => db.events.find((e) => e.id === id);

/* ------------------------------------------------------------------ */
/*  Sonuç hesaplama                                                    */
/* ------------------------------------------------------------------ */

const STOP = new Set(('ve ile bir bu şu o da de ki mi mu mı mü için gibi daha çok en her ama fakat veya ya hem ' +
  'olan olarak olması olmalı olmalıdır olacak olur olsun ise ne nasıl neden niçin kadar sonra önce göre ' +
  'diye yani ayrıca bizim biz siz onlar ben sen kendi tüm bütün yeni iyi var yok değil ki çünkü the of').split(' '));

function normalize(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function wordFreq(texts) {
  const freq = new Map();
  for (const t of texts) {
    let tokens;
    if (Array.isArray(t)) tokens = t.map(normalize).filter(Boolean);   // ayrı kutular: her biri bütün bir ifade
    else {
      const n = normalize(t);
      if (!n) continue;
      const words = n.split(' ');
      // Kısa yanıtlar (≤3 kelime) bütün olarak sayılır: "yeşil kent" gibi ifadeler bölünmez.
      tokens = words.length <= 3 ? [n] : words.filter((w) => w.length > 2 && !STOP.has(w));
    }
    for (const w of new Set(tokens)) freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([text, count]) => ({ text, count }));
}

/* Öncelik puanlı sıralama: kutu sırası ağırlıktır (5 kutuda 1. = 5 puan … 5. = 1 puan).
   Aynı ifade büyük/küçük harf ve noktalama farkı gözetmeden birleştirilir. */
function oncelikSiralamasi(cevaplar, kutu) {
  const harita = new Map();
  for (const a of cevaplar) {
    const liste = Array.isArray(a.value) ? a.value : [a.value];
    const gorulen = new Set();
    liste.forEach((ham, i) => {
      const k = normalize(ham);
      if (!k || gorulen.has(k)) return;
      gorulen.add(k);
      const o = harita.get(k) || { anahtar: k, puan: 0, kez: 0, birinci: 0, yazimlar: new Map() };
      o.puan += Math.max(1, kutu - i);
      o.kez += 1;
      if (i === 0) o.birinci += 1;
      const y = String(ham).trim();
      o.yazimlar.set(y, (o.yazimlar.get(y) || 0) + 1);
      harita.set(k, o);
    });
  }
  return [...harita.values()]
    .sort((a, b) => b.puan - a.puan || b.kez - a.kez || a.anahtar.localeCompare(b.anahtar, 'tr'))
    .slice(0, 15)
    .map((o) => {
      const yazim = [...o.yazimlar.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { anahtar: o.anahtar, text: yazim.charAt(0).toLocaleUpperCase('tr-TR') + yazim.slice(1), puan: o.puan, kez: o.kez, birinci: o.birinci };
    });
}

function questionResults(ev, q, { withPeople = false, includeHidden = false } = {}) {
  const answers = Object.values(ev.answers || {}).filter((a) => a.qid === q.id);
  const res = { qid: q.id, respondents: answers.length };
  if (q.type === 'tek' || q.type === 'coklu') {
    const counts = q.options.map(() => 0);
    for (const a of answers) for (const i of [].concat(a.value)) if (counts[i] !== undefined) counts[i]++;
    res.counts = counts;
  } else if (q.type === 'olcek') {
    const min = q.scaleMin ?? 1, max = q.scaleMax ?? 5;
    const counts = Array.from({ length: max - min + 1 }, () => 0);
    let sum = 0;
    for (const a of answers) { const v = Number(a.value); if (v >= min && v <= max) { counts[v - min]++; sum += v; } }
    res.counts = counts;
    res.mean = answers.length ? sum / answers.length : null;
  } else if (q.type === 'acik') {
    const visible = answers.filter((a) => includeHidden || !a.hidden);
    res.words = wordFreq(visible.map((a) => a.value));
    if (q.display === 'yaris') res.siralama = oncelikSiralamasi(visible, q.kelimeSayisi || 5);
    res.items = visible
      .sort((a, b) => b.ts - a.ts)
      .slice(0, includeHidden ? 1000 : 60)
      .map((a) => {
        const p = ev.participants[a.pid] || {};
        const it = { id: a.qid + ':' + a.pid, text: Array.isArray(a.value) ? a.value.join(' · ') : a.value, liste: Array.isArray(a.value) ? a.value : undefined, ts: a.ts, hidden: !!a.hidden };
        if (withPeople) { it.name = p.ad || ''; it.kurum = p.kurum || ''; it.birim = p.birim || ''; }
        return it;
      });
  }
  return res;
}

/* Katılımcının göreceği (sonuçsuz) durum */
function publicState(ev) {
  return {
    code: ev.code, title: ev.title, subtitle: ev.subtitle, date: ev.date, status: ev.status,
    fields: ev.fields, kvkk: ev.kvkk, kurumOnerileri: ev.kurumOnerileri || [],
    currentQuestionId: ev.currentQuestionId || null,
    questions: ev.questions.filter((q) => q.state === 'acik').map(stripQuestion),
  };
}
function stripQuestion(q) {
  const o = { id: q.id, type: q.type, text: q.text, note: q.note || '' };
  if (q.type === 'tek' || q.type === 'coklu') { o.options = q.options; o.maxSelect = q.maxSelect || 0; }
  if (q.type === 'olcek') { o.scaleMin = q.scaleMin ?? 1; o.scaleMax = q.scaleMax ?? 5; o.minLabel = q.minLabel || ''; o.maxLabel = q.maxLabel || ''; }
  if (q.type === 'acik') { o.maxLength = q.maxLength || 280; o.kelimeSayisi = q.kelimeSayisi || 0; }
  return o;
}

/* Yansıtma ekranının göreceği durum */
function screenState(ev) {
  const q = ev.questions.find((x) => x.id === ev.currentQuestionId) || null;
  return {
    code: ev.code, title: ev.title, subtitle: ev.subtitle, status: ev.status,
    publicUrl: db.settings.publicUrl || '',
    screen: ev.screen || 'lobi',
    showNames: !!ev.showNamesOnScreen,
    participantCount: Object.keys(ev.participants).length,
    questionIndex: q ? ev.questions.indexOf(q) + 1 : 0,
    questionTotal: ev.questions.length,
    question: q ? { ...stripQuestion(q), state: q.state, showResults: q.showResults !== false, display: q.display || '' } : null,
    results: q ? questionResults(ev, q, { withPeople: !!ev.showNamesOnScreen }) : null,
    // "Tüm soruları yansıt" görünümü için bütün soruların sonuçları
    tumu: ev.screen === 'tumu' ? ev.questions.map((x) => ({
      question: { ...stripQuestion(x), state: x.state, showResults: x.showResults !== false, display: x.display || '' },
      results: questionResults(ev, x, { withPeople: false }),
    })) : null,
    tunelUyari: /pinggy/.test(db.settings.publicUrl || '') && !process.env.PINGGY_TOKEN,
  };
}

/* Yönetim panelinin göreceği durum */
function adminLive(ev) {
  return {
    participantCount: Object.keys(ev.participants).length,
    currentQuestionId: ev.currentQuestionId || null,
    screen: ev.screen || 'lobi',
    results: ev.questions.map((q) => questionResults(ev, q, { withPeople: true, includeHidden: true })),
  };
}

/* ------------------------------------------------------------------ */
/*  Canlı yayın (Server-Sent Events)                                   */
/* ------------------------------------------------------------------ */

const clients = new Map(); // eventId -> Set<{res, role}>
const dirty = new Map();   // eventId -> {meta:boolean, data:boolean}
const versions = new Map(); // eventId -> {m, d}  (yoklama/polling için değişiklik sayaçları)
const ver = (ev) => { if (!versions.has(ev.id)) versions.set(ev.id, { m: Date.now(), d: Date.now() }); return versions.get(ev.id); };

function markDirty(ev, { meta = false } = {}) {
  const d = dirty.get(ev.id) || { meta: false, data: false };
  d.data = true; if (meta) d.meta = true;
  dirty.set(ev.id, d);
  const v = ver(ev); v.d++; if (meta) v.m++;
  saveSoon();
}

function send(res, type, payload) {
  try { res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`); } catch (_) {}
}

setInterval(() => {
  for (const [id, d] of dirty) {
    const ev = findEventById(id);
    const set = clients.get(id);
    dirty.delete(id);
    if (!ev || !set || !set.size) continue;
    let pub, scr, adm;
    for (const c of set) {
      if (c.role === 'katilimci' && d.meta) send(c.res, 'durum', pub || (pub = publicState(ev)));
      else if (c.role === 'ekran') send(c.res, 'durum', scr || (scr = screenState(ev)));
      else if (c.role === 'yonetim') send(c.res, 'canli', adm || (adm = adminLive(ev)));
    }
  }
}, 250);

setInterval(() => {
  for (const set of clients.values()) for (const c of set) { try { c.res.write(': nabız\n\n'); } catch (_) {} }
}, 20000);

function openStream(req, res, ev, role) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const client = { res, role };
  if (!clients.has(ev.id)) clients.set(ev.id, new Set());
  clients.get(ev.id).add(client);
  if (role === 'katilimci') send(res, 'durum', publicState(ev));
  if (role === 'ekran') send(res, 'durum', screenState(ev));
  if (role === 'yonetim') send(res, 'canli', adminLive(ev));
  req.on('close', () => clients.get(ev.id)?.delete(client));
}

/* ------------------------------------------------------------------ */
/*  Yardımcılar                                                        */
/* ------------------------------------------------------------------ */

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 200 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Gövde çok büyük')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('Geçersiz JSON')); } });
    req.on('error', reject);
  });
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function isAdmin(req) {
  const key = req.headers['x-yonetim-anahtari'] || '';
  const a = Buffer.from(String(key)); const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Basit hız sınırlaması (IP başına) */
const hits = new Map();
function rateLimited(req, max = 40, windowMs = 10000) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; }
  h.n++; hits.set(ip, h);
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > 60000) hits.delete(k); }, 60000);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveFile(res, rel) {
  const p = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!p.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:30px;text-align:center"><h2>KATILIM · Sayfa bulunamadı</h2><p>Adres: ' + rel.replace(/[<>&"]/g, '') + '</p><p><a href="/">Kod ile katıl</a></p></body>'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': rel.endsWith('.html') ? 'no-cache' : 'public, max-age=300' });
    res.end(buf);
  });
}

function validateQuestion(q) {
  const types = ['tek', 'coklu', 'acik', 'olcek'];
  const out = {
    id: q.id && /^[A-Za-z0-9]{4,20}$/.test(q.id) ? q.id : uid(8),
    type: types.includes(q.type) ? q.type : 'tek',
    text: clean(q.text, 300) || 'Yeni soru',
    note: clean(q.note, 300),
    state: ['beklemede', 'acik', 'kapali'].includes(q.state) ? q.state : 'beklemede',
    showResults: q.showResults !== false,
    display: clean(q.display, 20),
  };
  if (out.type === 'tek' || out.type === 'coklu') {
    out.options = (Array.isArray(q.options) ? q.options : []).map((o) => clean(o, 140)).filter(Boolean).slice(0, 12);
    if (out.options.length < 2) out.options = out.options.concat(['Seçenek A', 'Seçenek B']).slice(0, 2);
    out.maxSelect = out.type === 'coklu' ? Math.max(0, Math.min(out.options.length, parseInt(q.maxSelect, 10) || 0)) : 1;
  }
  if (out.type === 'olcek') {
    out.scaleMin = Math.max(0, Math.min(1, parseInt(q.scaleMin, 10) || 1));
    out.scaleMax = Math.max(3, Math.min(10, parseInt(q.scaleMax, 10) || 5));
    out.minLabel = clean(q.minLabel, 40); out.maxLabel = clean(q.maxLabel, 40);
  }
  if (out.type === 'acik') {
    out.maxLength = Math.max(20, Math.min(1000, parseInt(q.maxLength, 10) || 280));
    // 0 = tek metin kutusu; 1-10 = o kadar ayrı kısa yanıt kutusu (ör. "5 anahtar kelime")
    out.kelimeSayisi = Math.max(0, Math.min(10, parseInt(q.kelimeSayisi, 10) || 0));
  }
  return out;
}

function csvCell(v) { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

function exportCsv(ev) {
  const header = ['Katılımcı No', 'Ad Soyad', 'Kurum', 'Birim', 'Unvan/Görev', 'Katılım Zamanı', 'Soru No', 'Soru', 'Soru Tipi', 'Yanıt', 'Yanıt Zamanı', 'Ekranda Gizlendi'];
  const rows = [header];
  const pIndex = {}; let n = 0;
  for (const pid of Object.keys(ev.participants)) pIndex[pid] = ++n;
  const tipAd = { tek: 'Tek seçim', coklu: 'Çoklu seçim', acik: 'Açık uçlu', olcek: 'Ölçek' };
  const fmt = (ts) => new Date(ts).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  ev.questions.forEach((q, qi) => {
    for (const a of Object.values(ev.answers).filter((x) => x.qid === q.id)) {
      const p = ev.participants[a.pid] || {};
      let val = a.value;
      if (q.type === 'tek' || q.type === 'coklu') val = [].concat(a.value).map((i) => q.options[i]).join(' | ');
      else if (Array.isArray(a.value)) val = a.value.map((x, i) => `${i + 1}) ${x}`).join(' | ');
      rows.push([pIndex[a.pid] || '', p.ad, p.kurum, p.birim, p.unvan, p.ts ? fmt(p.ts) : '', qi + 1, q.text, tipAd[q.type], val, fmt(a.ts), a.hidden ? 'Evet' : '']);
    }
  });
  // Excel'in Türkçe karakterleri doğru açması için BOM + noktalı virgül ayırıcı
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

/* ------------------------------------------------------------------ */
/*  Yönlendirme                                                        */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const m = (re) => p.match(re);
  let r;

  try {
    /* ---------- Sayfalar ---------- */
    if (req.method === 'GET') {
      if (p === '/' ) return serveFile(res, 'giris.html');
      if (p === '/yonetim') return serveFile(res, 'yonetim.html');
      if (m(/^\/k\/[^/]+\/?$/)) return serveFile(res, 'katil.html');
      if (m(/^\/ekran\/[^/]+\/?$/)) return serveFile(res, 'ekran.html');
      if (p === '/saglik') return json(res, 200, { ok: true, etkinlik: db.events.length, baslangic: BASLANGIC });
    }

    /* ---------- Katılımcı API ---------- */
    if ((r = m(/^\/api\/etkinlik\/([^/]+)$/)) && req.method === 'GET') {
      const ev = findEventByCode(r[1]);
      if (!ev) return json(res, 404, { hata: 'Etkinlik bulunamadı. Kodu kontrol edin.' });
      const out = publicState(ev);
      const pid = url.searchParams.get('pid');
      if (pid && ev.participants[pid]) {
        out.ben = { ad: ev.participants[pid].ad };
        out.yanitlarim = {};
        for (const a of Object.values(ev.answers)) if (a.pid === pid) out.yanitlarim[a.qid] = a.value;
      }
      return json(res, 200, out);
    }

    if ((r = m(/^\/api\/etkinlik\/([^/]+)\/akis$/)) && req.method === 'GET') {
      const ev = findEventByCode(r[1]);
      if (!ev) return json(res, 404, { hata: 'Etkinlik bulunamadı' });
      const role = url.searchParams.get('rol') === 'ekran' ? 'ekran' : 'katilimci';
      return openStream(req, res, ev, role);
    }

    // Yoklama (polling): canlı akışın (SSE) geçemediği ağlar/tüneller için
    if ((r = m(/^\/api\/etkinlik\/([^/]+)\/durum$/)) && req.method === 'GET') {
      const ev = findEventByCode(r[1]);
      if (!ev) return json(res, 404, { hata: 'Etkinlik bulunamadı' });
      const ekran = url.searchParams.get('rol') === 'ekran';
      const v = ekran ? ver(ev).d : ver(ev).m;
      if (url.searchParams.get('v') === String(v)) return json(res, 200, { v, degismedi: true });
      return json(res, 200, { v, veri: ekran ? screenState(ev) : publicState(ev) });
    }

    if ((r = m(/^\/api\/etkinlik\/([^/]+)\/katil$/)) && req.method === 'POST') {
      // Salondaki herkes aynı Wi-Fi (aynı dış IP) üzerinden gelebilir: sınır yalnızca saldırıyı önleyecek kadar geniştir
      if (rateLimited(req, 400)) return json(res, 429, { hata: 'Çok fazla deneme. Lütfen birkaç saniye bekleyin.' });
      const ev = findEventByCode(r[1]);
      if (!ev) return json(res, 404, { hata: 'Etkinlik bulunamadı' });
      if (ev.status !== 'aktif') return json(res, 403, { hata: 'Bu etkinlik şu anda katılıma kapalı.' });
      const b = await readBody(req, 8 * 1024);
      const f = ev.fields || {};
      const person = { ad: clean(b.ad, 80), kurum: clean(b.kurum, 120), birim: clean(b.birim, 120), unvan: clean(b.unvan, 80) };
      const labels = { ad: 'Ad Soyad', kurum: 'Kurum / Kuruluş', birim: 'Birim', unvan: 'Unvan / Görev' };
      for (const k of Object.keys(labels)) {
        if (f[k] === 'zorunlu' && !person[k]) return json(res, 400, { hata: `${labels[k]} alanı zorunludur.` });
        if (f[k] === 'kapali') person[k] = '';
      }
      if (ev.kvkk && ev.kvkk.metin && !b.kvkkOnay) return json(res, 400, { hata: 'Devam etmek için aydınlatma metnini onaylamanız gerekir.' });
      const pid = uid(14);
      ev.participants[pid] = { ...person, kvkkOnay: !!b.kvkkOnay, ts: Date.now() };
      markDirty(ev);
      return json(res, 200, { pid });
    }

    if ((r = m(/^\/api\/etkinlik\/([^/]+)\/yanit$/)) && req.method === 'POST') {
      if (rateLimited(req, 1500)) return json(res, 429, { hata: 'Çok hızlı gönderim. Lütfen bekleyin.' });
      const ev = findEventByCode(r[1]);
      if (!ev) return json(res, 404, { hata: 'Etkinlik bulunamadı' });
      const b = await readBody(req, 8 * 1024);
      if (!ev.participants[b.pid]) return json(res, 401, { hata: 'Katılım kaydınız bulunamadı. Sayfayı yenileyin.', yenidenKayit: true });
      const q = ev.questions.find((x) => x.id === b.qid);
      if (!q) return json(res, 404, { hata: 'Soru bulunamadı' });
      if (q.state !== 'acik' || ev.status !== 'aktif') return json(res, 403, { hata: 'Bu soru yanıta kapatıldı.' });
      let value;
      if (q.type === 'tek') {
        const i = parseInt(b.value, 10);
        if (!(i >= 0 && i < q.options.length)) return json(res, 400, { hata: 'Lütfen bir seçenek işaretleyin.' });
        value = i;
      } else if (q.type === 'coklu') {
        const arr = [...new Set([].concat(b.value).map((x) => parseInt(x, 10)).filter((i) => i >= 0 && i < q.options.length))];
        if (!arr.length) return json(res, 400, { hata: 'Lütfen en az bir seçenek işaretleyin.' });
        if (q.maxSelect && arr.length > q.maxSelect) return json(res, 400, { hata: `En fazla ${q.maxSelect} seçenek işaretleyebilirsiniz.` });
        value = arr.sort((a, c) => a - c);
      } else if (q.type === 'olcek') {
        const v = parseInt(b.value, 10);
        if (!(v >= (q.scaleMin ?? 1) && v <= (q.scaleMax ?? 5))) return json(res, 400, { hata: 'Lütfen bir değer seçin.' });
        value = v;
      } else if (q.kelimeSayisi) {
        const gorulen = new Set();
        value = [].concat(b.value).map((x) => clean(x, q.maxLength || 60)).filter((x) => {
          const k = x.toLocaleLowerCase('tr-TR'); if (!x || gorulen.has(k)) return false; gorulen.add(k); return true;
        }).slice(0, q.kelimeSayisi);
        if (!value.length) return json(res, 400, { hata: 'Lütfen en az bir kutuyu doldurun.' });
      } else {
        value = clean(b.value, q.maxLength || 280);
        if (!value) return json(res, 400, { hata: 'Lütfen yanıtınızı yazın.' });
      }
      const key = q.id + ':' + b.pid;
      const prev = ev.answers[key];
      ev.answers[key] = { qid: q.id, pid: b.pid, value, ts: Date.now(), hidden: prev ? !!prev.hidden && prev.value === value : false };
      markDirty(ev);
      return json(res, 200, { ok: true, guncellendi: !!prev });
    }

    /* ---------- Yönetim API ---------- */
    if (p.startsWith('/api/yonetim/')) {
      // EventSource başlık gönderemediği için akışta anahtar sorgu parametresiyle gelir
      if (!isAdmin(req) && !(url.searchParams.get('anahtar') && (req.headers['x-yonetim-anahtari'] = url.searchParams.get('anahtar')) && isAdmin(req))) {
        return json(res, 401, { hata: 'Yetkisiz. Şifreyi kontrol edin.' });
      }

      if (p === '/api/yonetim/giris' && req.method === 'POST') return json(res, 200, { ok: true });

      if (p === '/api/yonetim/ayarlar') {
        if (req.method === 'GET') return json(res, 200, { ...db.settings, tunel: tunelDurum, yerelAdresler: yerelAdresler() });
        if (req.method === 'PUT') { const b = await readBody(req); db.settings.publicUrl = clean(b.publicUrl, 200).replace(/\/+$/, ''); db.settings.publicUrlKaynak = 'elle'; saveSoon(); db.events.forEach((e) => markDirty(e)); return json(res, 200, { ...db.settings, tunel: tunelDurum, yerelAdresler: yerelAdresler() }); }
      }

      // Tüm verinin yedeği ve geri yüklenmesi (ücretsiz barındırmada sunucu yeniden başlarsa veriyi geri getirmek için)
      if (p === '/api/yonetim/tum-yedek.json' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="katilim-tum-yedek-${new Date().toISOString().slice(0, 10)}.json"` });
        return res.end(JSON.stringify({ tur: 'katilim-tum-yedek', tarih: Date.now(), events: db.events }));
      }
      if (p === '/api/yonetim/ice-aktar' && req.method === 'POST') {
        const b = await readBody(req, 20 * 1024 * 1024);
        const gelen = Array.isArray(b.events) ? b.events : (b && b.code && Array.isArray(b.questions) ? [b] : null);
        if (!gelen) return json(res, 400, { hata: 'Dosya tanınmadı. Bu uygulamadan indirilen bir yedek (JSON) seçin.' });
        const sonuc = [];
        for (const e of gelen) {
          if (!e || !e.code || !Array.isArray(e.questions)) continue;
          const ev = {
            id: /^[A-Za-z0-9]{6,20}$/.test(e.id || '') ? e.id : uid(10),
            code: clean(e.code, 16).toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, '') || ('E' + uid(5).toUpperCase()),
            title: clean(e.title, 160), subtitle: clean(e.subtitle, 200), date: clean(e.date, 20),
            status: ['taslak', 'aktif', 'kapali'].includes(e.status) ? e.status : 'taslak',
            fields: e.fields || { ad: 'zorunlu', kurum: 'zorunlu', birim: 'istege', unvan: 'istege' },
            kvkk: { metin: String((e.kvkk && e.kvkk.metin) || '').slice(0, 6000) },
            kurumOnerileri: Array.isArray(e.kurumOnerileri) ? e.kurumOnerileri.map((x) => clean(x, 120)).slice(0, 80) : [],
            showNamesOnScreen: !!e.showNamesOnScreen,
            questions: e.questions.slice(0, 60).map((q) => ({ ...validateQuestion(q), state: ['beklemede', 'acik', 'kapali'].includes(q.state) ? q.state : 'beklemede' })),
            currentQuestionId: e.currentQuestionId || null, screen: ['soru', 'tumu'].includes(e.screen) ? e.screen : 'lobi',
            participants: e.participants && typeof e.participants === 'object' ? e.participants : {},
            answers: e.answers && typeof e.answers === 'object' ? e.answers : {},
            created: e.created || Date.now(),
          };
          // Aynı kimlik ya da aynı kodlu etkinlik varsa yedektekiyle değiştir
          db.events = db.events.filter((x) => x.id !== ev.id && x.code !== ev.code);
          db.events.push(ev); markDirty(ev, { meta: true });
          sonuc.push(ev.code);
        }
        saveSoon();
        return json(res, 200, { ok: true, yuklenen: sonuc });
      }

      if (p === '/api/yonetim/etkinlikler' && req.method === 'GET') {
        return json(res, 200, db.events.map((e) => ({ id: e.id, code: e.code, title: e.title, date: e.date, status: e.status, soru: e.questions.length, katilimci: Object.keys(e.participants).length })));
      }

      if (p === '/api/yonetim/etkinlikler' && req.method === 'POST') {
        const b = await readBody(req);
        let code = clean(b.code, 16).toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, '') || ('E' + uid(5).toUpperCase());
        while (findEventByCode(code)) code = code.slice(0, 12) + Math.floor(Math.random() * 90 + 10);
        const src = b.kopyala ? findEventById(b.kopyala) : null;
        const ev = {
          id: uid(10), code, title: clean(b.title, 160) || (src ? src.title + ' (kopya)' : 'Yeni Etkinlik'), subtitle: src ? src.subtitle : '',
          date: clean(b.date, 20), status: 'taslak',
          fields: src ? { ...src.fields } : { ad: 'zorunlu', kurum: 'zorunlu', birim: 'istege', unvan: 'istege' },
          kvkk: src ? { ...src.kvkk } : { metin: require('./seed.js').KVKK },
          kurumOnerileri: src ? [...(src.kurumOnerileri || [])] : require('./seed.js').KURUMLAR,
          showNamesOnScreen: src ? !!src.showNamesOnScreen : false,
          questions: src ? src.questions.map((q) => ({ ...JSON.parse(JSON.stringify(q)), id: uid(8), state: 'beklemede' })) : [],
          currentQuestionId: null, screen: 'lobi', participants: {}, answers: {}, created: Date.now(),
        };
        db.events.push(ev); saveSoon();
        return json(res, 200, { id: ev.id });
      }

      if ((r = m(/^\/api\/yonetim\/etkinlik\/([^/]+)$/))) {
        const ev = findEventById(r[1]);
        if (!ev) return json(res, 404, { hata: 'Etkinlik yok' });
        if (req.method === 'GET') {
          const { answers, participants, ...rest } = ev;
          return json(res, 200, { ...rest, katilimcilar: Object.entries(participants).map(([pid, x]) => ({ pid, ...x })) });
        }
        if (req.method === 'PUT') {
          const b = await readBody(req);
          if (b.code !== undefined) {
            const code = clean(b.code, 16).toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, '');
            if (!code) return json(res, 400, { hata: 'Etkinlik kodu boş olamaz' });
            const other = findEventByCode(code);
            if (other && other.id !== ev.id) return json(res, 400, { hata: 'Bu kod başka bir etkinlikte kullanılıyor' });
            ev.code = code;
          }
          if (b.title !== undefined) ev.title = clean(b.title, 160);
          if (b.subtitle !== undefined) ev.subtitle = clean(b.subtitle, 200);
          if (b.date !== undefined) ev.date = clean(b.date, 20);
          if (b.status !== undefined && ['taslak', 'aktif', 'kapali'].includes(b.status)) ev.status = b.status;
          if (b.fields) for (const k of ['ad', 'kurum', 'birim', 'unvan']) if (['zorunlu', 'istege', 'kapali'].includes(b.fields[k])) ev.fields[k] = b.fields[k];
          if (b.kvkk !== undefined) ev.kvkk = { metin: clean(b.kvkk.metin, 6000).replace(/ {2,}/g, ' ') || '' };
          if (b.kvkkHam !== undefined) ev.kvkk = { metin: String(b.kvkkHam).slice(0, 6000) };
          if (Array.isArray(b.kurumOnerileri)) ev.kurumOnerileri = b.kurumOnerileri.map((x) => clean(x, 120)).filter(Boolean).slice(0, 80);
          if (b.showNamesOnScreen !== undefined) ev.showNamesOnScreen = !!b.showNamesOnScreen;
          if (Array.isArray(b.questions)) {
            const old = Object.fromEntries(ev.questions.map((q) => [q.id, q]));
            ev.questions = b.questions.slice(0, 60).map((q) => {
              const v = validateQuestion(q);
              const o = old[v.id];
              if (o) v.state = o.state; // durum yalnızca canlı yönetimden değişir
              // Seçenekler değiştiyse eski seçimli yanıtlar geçersiz kalabilir: aralık dışı olanları ayıkla
              return v;
            });
            const ids = new Set(ev.questions.map((q) => q.id));
            for (const [k, a] of Object.entries(ev.answers)) if (!ids.has(a.qid)) delete ev.answers[k];
            if (ev.currentQuestionId && !ids.has(ev.currentQuestionId)) ev.currentQuestionId = null;
          }
          markDirty(ev, { meta: true });
          return json(res, 200, { ok: true, code: ev.code });
        }
        if (req.method === 'DELETE') {
          db.events = db.events.filter((e) => e.id !== ev.id); saveSoon();
          for (const c of clients.get(ev.id) || []) try { c.res.end(); } catch (_) {}
          clients.delete(ev.id);
          return json(res, 200, { ok: true });
        }
      }

      if ((r = m(/^\/api\/yonetim\/etkinlik\/([^/]+)\/akis$/)) && req.method === 'GET') {
        const ev = findEventById(r[1]);
        if (!ev) return json(res, 404, { hata: 'Etkinlik yok' });
        return openStream(req, res, ev, 'yonetim');
      }

      if ((r = m(/^\/api\/yonetim\/etkinlik\/([^/]+)\/canli$/)) && req.method === 'GET') {
        const ev = findEventById(r[1]);
        if (!ev) return json(res, 404, { hata: 'Etkinlik yok' });
        const v = ver(ev).d;
        if (url.searchParams.get('v') === String(v)) return json(res, 200, { v, degismedi: true });
        return json(res, 200, { v, veri: adminLive(ev) });
      }

      if ((r = m(/^\/api\/yonetim\/etkinlik\/([^/]+)\/kontrol$/)) && req.method === 'POST') {
        const ev = findEventById(r[1]);
        if (!ev) return json(res, 404, { hata: 'Etkinlik yok' });
        const b = await readBody(req);
        const q = b.qid ? ev.questions.find((x) => x.id === b.qid) : null;
        const idx = q ? ev.questions.indexOf(q) : ev.questions.findIndex((x) => x.id === ev.currentQuestionId);
        switch (b.islem) {
          case 'ac': if (q) q.state = 'acik'; break;
          case 'kapat': if (q) q.state = 'kapali'; break;
          case 'beklet': if (q) q.state = 'beklemede'; break;
          case 'yansit': if (q) { ev.currentQuestionId = q.id; ev.screen = 'soru'; } break;
          case 'yansit-ac': if (q) { ev.currentQuestionId = q.id; ev.screen = 'soru'; q.state = 'acik'; } break;
          case 'sonuc': if (q) q.showResults = !!b.deger; break;
          case 'lobi': ev.screen = 'lobi'; break;
          case 'tumu': ev.screen = 'tumu'; break;
          case 'soruEkrani': ev.screen = 'soru'; break;
          case 'sonraki': case 'onceki': {
            const ni = b.islem === 'sonraki' ? idx + 1 : idx - 1;
            const nq = ev.questions[ni];
            if (nq) {
              if (b.otomatikAc) { const cur = ev.questions[idx]; if (cur && cur.state === 'acik' && b.oncekiniKapat) cur.state = 'kapali'; nq.state = 'acik'; }
              ev.currentQuestionId = nq.id; ev.screen = 'soru';
            }
            break;
          }
          case 'tumunuAc': ev.questions.forEach((x) => { x.state = 'acik'; }); break;
          case 'tumunuKapat': ev.questions.forEach((x) => { if (x.state === 'acik') x.state = 'kapali'; }); break;
          case 'gizle': case 'goster': {
            const a = ev.answers[b.yanitId]; if (a) a.hidden = b.islem === 'gizle'; break;
          }
          case 'sifirla': ev.answers = {}; ev.participants = {}; ev.questions.forEach((x) => { x.state = 'beklemede'; }); ev.currentQuestionId = null; ev.screen = 'lobi'; break;
          case 'soruSifirla': if (q) for (const [k, a] of Object.entries(ev.answers)) if (a.qid === q.id) delete ev.answers[k]; break;
          default: return json(res, 400, { hata: 'Bilinmeyen işlem' });
        }
        markDirty(ev, { meta: true });
        return json(res, 200, { ok: true, currentQuestionId: ev.currentQuestionId, screen: ev.screen, questions: ev.questions.map((x) => ({ id: x.id, state: x.state, showResults: x.showResults !== false })) });
      }

      if ((r = m(/^\/api\/yonetim\/etkinlik\/([^/]+)\/disa-aktar\.(csv|json)$/)) && req.method === 'GET') {
        const ev = findEventById(r[1]);
        if (!ev) return json(res, 404, { hata: 'Etkinlik yok' });
        const fname = `${ev.code}-${new Date().toISOString().slice(0, 10)}`;
        if (r[2] === 'csv') {
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}-yanitlar.csv"` });
          return res.end(exportCsv(ev));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}-yedek.json"` });
        return res.end(JSON.stringify(ev, null, 2));
      }

      return json(res, 404, { hata: 'Bulunamadı' });
    }

    /* ---------- Statik dosyalar ---------- */
    if (req.method === 'GET' && !p.includes('..')) return serveFile(res, p.slice(1));
    res.writeHead(405); res.end();
  } catch (e) {
    console.error('[hata]', e);
    if (!res.headersSent) json(res, 500, { hata: e.message || 'Sunucu hatası' });
  }
});

/* ------------------------------------------------------------------ */
/*  İnternete açma: Cloudflare hızlı tüneli (isteğe bağlı)             */
/* ------------------------------------------------------------------ */

const os = require('os');
function yerelAdresler() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  return out;
}

let tunelDurum = { durum: 'kapali', adres: '', mesaj: '', saglayici: '' };
let tunelSureci = null, kapaniyor = false;

function adresiYayinla(adres, saglayici) {
  tunelDurum = { durum: 'acik', adres, mesaj: '', saglayici, baslangic: Date.now(), pro: !!process.env.PINGGY_TOKEN };
  if (!process.env.PUBLIC_URL) {
    db.settings.publicUrl = adres; db.settings.publicUrlKaynak = 'tunel'; saveSoon();
    db.events.forEach((e) => markDirty(e, { meta: true }));
  }
  console.log('\n  ✔ İNTERNET ADRESİ HAZIR (' + saglayici + '): ' + adres);
  console.log('    QR kodlar bu adresi gösterecek. Yeni adresin telefonlarda açılması 10-30 sn sürebilir.');
  if (saglayici === 'Pinggy' && !process.env.PINGGY_TOKEN) console.log('    Not: Ücretsiz Pinggy tüneli 60 dakikada bir yenilenir ve ilk girişte bir uyarı sayfası gösterir ("Enter site").');
  console.log('');
}
function adresiKaldir() {
  if (db.settings.publicUrlKaynak === 'tunel') { db.settings.publicUrl = ''; saveSoon(); db.events.forEach((e) => markDirty(e, { meta: true })); }
}

function tunelBaslat() {
  if (process.env.TUNEL !== '1') return;
  const s = (process.env.TUNEL_SAGLAYICI || '').toLowerCase();
  if (s === 'tailscale') return tailscaleBaslat();
  if (s === 'pinggy') return pinggyBaslat();
  cloudflareBaslat();
}

/* 0) Tailscale Funnel — 443 portu, uyarı sayfası yok, adres sabit (https://<makine>.<tailnet>.ts.net) */
function tailscaleExe() {
  const aday = [process.env.TAILSCALE,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Tailscale', 'tailscale.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Tailscale', 'tailscale.exe')].filter(Boolean);
  return aday.find((p) => fs.existsSync(p)) || 'tailscale';
}
function tailscaleBaslat() {
  const { execFile } = require('child_process');
  const exe = tailscaleExe();
  tunelDurum = { durum: 'baglaniyor', adres: '', mesaj: 'Tailscale Funnel açılıyor…', saglayici: 'Tailscale' };
  console.log('  Tailscale Funnel açılıyor…');
  const hata = (m) => { tunelDurum = { durum: 'hata', adres: '', mesaj: m, saglayici: 'Tailscale' }; adresiKaldir(); console.log('\n  ✖ ' + m + '\n'); };
  // Funnel'ı bu porta yönlendir (zaten açıksa aynı ayarı yeniden yazar)
  execFile(exe, ['funnel', '--bg', String(PORT)], { windowsHide: true, timeout: 30000 }, (err, out, errOut) => {
    const metin = (out || '') + (errOut || '');
    if (err && err.code === 'ENOENT') return hata('Tailscale bulunamadı. Kurulum için "Baslat-Tailscale.bat" dosyasını çalıştırın.');
    const onay = metin.match(/https:\/\/login\.tailscale\.com\/\S+/);
    if (err && onay) return hata('Funnel bu hesapta henüz onaylanmamış. Şu adresi açıp onaylayın, sonra yeniden başlatın: ' + onay[0]);
    if (err && /access denied|administrator|permission|yetki/i.test(metin)) return hata('Tailscale Funnel yönetici yetkisi istiyor. "Baslat-Tailscale.bat" dosyasını çalıştırın (yönetici izni ister).');
    if (err && !/available on the internet/i.test(metin)) console.log('    [tailscale] ' + metin.replace(/\s+/g, ' ').trim().slice(0, 300));
    execFile(exe, ['status', '--json'], { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (err2, out2) => {
      let dns = '';
      try { const j = JSON.parse(out2); dns = ((j.Self && j.Self.DNSName) || '').replace(/\.$/, ''); if (j.BackendState && j.BackendState !== 'Running') return hata('Tailscale çalışmıyor ya da oturum açılmamış (durum: ' + j.BackendState + '). "Baslat-Tailscale.bat" ile giriş yapın.'); } catch (_) {}
      if (!dns) return hata('Tailscale adresi okunamadı. Tailscale\'de oturum açık mı? "Baslat-Tailscale.bat" dosyasını çalıştırın.' + (err2 ? ' [' + err2.message + ']' : ''));
      adresiYayinla('https://' + dns, 'Tailscale');
      console.log('    Not: Bu adres ilk kez açılıyorsa genel DNS kaydının yayılması 10 dakikayı bulabilir.\n');
    });
  });
}

/* 1) Cloudflare hızlı tüneli — süre sınırı yok, ancak 7844 portunu kullanır (kurum ağlarında kapalı olabilir) */
function cloudflareBaslat() {
  const aday = [process.env.CLOUDFLARED, path.join(__dirname, 'cloudflared', 'cloudflared.exe'), path.join(__dirname, 'cloudflared', 'cloudflared')].filter(Boolean);
  const exe = aday.find((p) => fs.existsSync(p));
  if (!exe) return pinggyBaslat();
  const { spawn } = require('child_process');
  tunelDurum = { durum: 'baglaniyor', adres: '', mesaj: 'İnternet tüneli açılıyor (Cloudflare)…', saglayici: 'Cloudflare' };
  console.log('  İnternet tüneli açılıyor (Cloudflare)…');
  let bitti = false, vazgecildi = false, adres = '';
  const vazgec = (neden) => {
    if (bitti) return; bitti = true; vazgecildi = true;
    console.log('  ✖ Cloudflare tüneli kurulamadı (' + neden + '). 443 portu üzerinden Pinggy deneniyor…');
    try { tunelSureci && tunelSureci.kill(); } catch (_) {}
    setTimeout(pinggyBaslat, 500);
  };
  try { tunelSureci = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { windowsHide: true }); }
  catch (e) { return vazgec(e.message); }
  const zaman = setTimeout(() => vazgec('zaman aşımı; büyük olasılıkla güvenlik duvarı 7844 portunu engelliyor'), 25000);
  const oku = (buf) => {
    const t = buf.toString();
    const mm = t.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (mm && !adres) adres = mm[0];
    if (/Registered tunnel connection/i.test(t) && adres && !bitti) { bitti = true; clearTimeout(zaman); adresiYayinla(adres, 'Cloudflare'); }
  };
  tunelSureci.stdout.on('data', oku); tunelSureci.stderr.on('data', oku);
  tunelSureci.on('error', (e) => { clearTimeout(zaman); vazgec(e.code || e.message); });
  tunelSureci.on('exit', () => {
    clearTimeout(zaman);
    if (kapaniyor || vazgecildi) return;
    if (!bitti) return vazgec('program kapandı');
    if (tunelDurum.saglayici === 'Cloudflare') { console.log('\n  ⚠ Cloudflare tüneli kapandı; Pinggy deneniyor…\n'); adresiKaldir(); pinggyBaslat(); }
  });
}

/* 2) Pinggy — Windows'un kendi SSH istemcisiyle 443 portundan bağlanır; ücretsiz sürümde 60 dk'da bir yenilenir */
function pinggyAnahtar() {
  const { spawnSync } = require('child_process');
  const ev = process.env.USERPROFILE || process.env.HOME || __dirname;
  const dizin = path.join(ev, '.ssh');
  const anahtar = path.join(dizin, 'katilim_pinggy');
  if (!fs.existsSync(anahtar)) {
    try { fs.mkdirSync(dizin, { recursive: true }); } catch (_) {}
    const r = spawnSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-q', '-C', 'katilim', '-f', anahtar], { windowsHide: true });
    if (r.error || !fs.existsSync(anahtar)) return null;
  }
  return anahtar;
}
let pinggyDeneme = 0;
function pinggyBaslat() {
  if (kapaniyor) return;
  const { spawn } = require('child_process');
  tunelDurum = { durum: 'baglaniyor', adres: '', mesaj: 'İnternet tüneli açılıyor (Pinggy, 443 portu)…', saglayici: 'Pinggy' };
  console.log('  İnternet tüneli açılıyor (Pinggy, 443 portu)…');
  const anahtar = pinggyAnahtar();
  const args = ['-p', '443', '-T', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
    '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20'];
  if (anahtar) args.push('-i', anahtar);
  // PINGGY_TOKEN tanımlıysa Pro tünel: uyarı sayfası yok, 60 dk sınırı yok, sabit adres
  const token = (process.env.PINGGY_TOKEN || '').trim();
  args.push(`-R0:127.0.0.1:${PORT}`, token ? `${token}@pro.pinggy.io` : 'free@a.pinggy.io');
  let adres = '', son = '';
  try { tunelSureci = spawn('ssh', args, { windowsHide: true }); }
  catch (e) { return pinggyHata('SSH istemcisi çalıştırılamadı: ' + e.message); }
  const oku = (buf) => {
    const t = buf.toString(); son = (son + t).slice(-400);
    // Pinggy çıktısında tanıtım/panel bağlantıları da olabilir (ör. dashboard.pinggy.io); yalnızca tünel adresini al
    if (!adres) for (const line of t.split(/\r?\n/)) if (line.trim()) console.log('    [pinggy] ' + line.trim().slice(0, 160));
    const adaylar = (t.match(/https:\/\/[a-z0-9.-]+/gi) || []).map((u) => u.toLowerCase())
      .filter((u) => /\.pinggy\.(link|online|net)$/.test(u) && !/^https:\/\/(www|dashboard|app|docs)\./.test(u));
    if (adaylar.length && !adres) { adres = adaylar[0]; pinggyDeneme = 0; adresiYayinla(adres, 'Pinggy'); }
  };
  tunelSureci.stdout.on('data', oku); tunelSureci.stderr.on('data', oku);
  tunelSureci.on('error', (e) => {
    pinggyHata(e.code === 'ENOENT'
      ? 'Bu bilgisayarda Windows SSH istemcisi yok. Ayarlar > Uygulamalar > İsteğe bağlı özellikler > "OpenSSH İstemcisi"ni ekleyin ya da bilgisayarı telefon hotspot\'una bağlayın.'
      : 'SSH hatası: ' + e.message);
  });
  tunelSureci.on('exit', () => {
    if (kapaniyor || tunelDurum.durum === 'hata') return;
    adresiKaldir();
    if (adres) {   // süre doldu ya da bağlantı koptu: yeniden aç, QR kendiliğinden güncellenir
      console.log('\n  ↻ Pinggy tüneli yenileniyor (60 dk sınırı ya da bağlantı kopması). Yeni adres birazdan…\n');
      return setTimeout(pinggyBaslat, 1500);
    }
    if (++pinggyDeneme < 3) return setTimeout(pinggyBaslat, 3000);
    pinggyHata('Pinggy tüneli de kurulamadı. Kurum ağı dış bağlantıları tamamen engelliyor olabilir. Bilgisayarı telefon hotspot\'una bağlayın ya da internette barındırılan sürümü (Render) kullanın. [Ayrıntı: ' + son.replace(/\s+/g, ' ').trim().slice(-200) + ']');
  });
}
function pinggyHata(m) {
  tunelDurum = { durum: 'hata', adres: '', mesaj: m, saglayici: 'Pinggy' };
  adresiKaldir();
  console.log('\n  ✖ ' + m + '\n');
}
const tunelKapat = () => {
  kapaniyor = true;
  try { tunelSureci && tunelSureci.kill(); } catch (_) {}
  if (tunelDurum.saglayici === 'Tailscale') { try { require('child_process').execFileSync(tailscaleExe(), ['funnel', 'reset'], { windowsHide: true, timeout: 8000 }); } catch (_) {} }
};

loadDb();
// Önceki oturumdan kalan (artık geçersiz) tünel adresini temizle
if (db.settings.publicUrlKaynak === 'tunel' && !process.env.PUBLIC_URL) { db.settings.publicUrl = ''; }
server.listen(PORT, () => {
  console.log(`\n  KATILIM çalışıyor →  http://localhost:${PORT}`);
  console.log(`  Yönetim paneli    →  http://localhost:${PORT}/yonetim`);
  const yerel = yerelAdresler();
  if (yerel.length) console.log('  Aynı Wi-Fi ağı için →  ' + yerel.join('  |  '));
  if (ADMIN_PASSWORD === 'kocaeli2053') console.log('  ⚠  Varsayılan yönetim şifresi kullanılıyor. ADMIN_PASSWORD ile değiştirin.');
  console.log('');
  tunelBaslat();
});

process.on('SIGINT', () => { tunelKapat(); saveNow(); process.exit(0); });
process.on('SIGTERM', () => { tunelKapat(); saveNow(); process.exit(0); });
process.on('exit', tunelKapat);
