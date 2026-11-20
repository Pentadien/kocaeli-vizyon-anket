/* Ortak yardımcılar ve sonuç görselleştirme (ekran + yönetim) */
'use strict';

// CSS değişkeni olarak tutulur; böylece koyu temada renkler kendiliğinden açılır
const PALET = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10', '--c11', '--c12'].map((v) => `var(${v})`);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? n.style.setProperty(sk, sv) : (n.style[sk] = sv); }
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

const yuzde = (n, t) => (t ? Math.round((n / t) * 100) : 0);

/* Sayıyı eski değerinden yenisine yumuşakça sayarak götürür */
function sayac(node, hedef, { ondalik = 0, onEk = '', sonEk = '', sure = 700 } = {}) {
  if (!node) return;
  if (hedef == null || isNaN(hedef)) { node.textContent = onEk + '–' + sonEk; node._d = null; return; }
  const bas = node._d == null ? 0 : node._d;
  node._d = hedef;
  cancelAnimationFrame(node._raf);
  const yaz = (v) => { node.textContent = onEk + v.toLocaleString('tr-TR', { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik }) + sonEk; };
  if (bas === hedef) return yaz(hedef);
  const t0 = performance.now();
  const adim = (t) => {
    const k = Math.min(1, (t - t0) / sure), e = 1 - Math.pow(1 - k, 3);
    yaz(bas + (hedef - bas) * e);
    if (k < 1) node._raf = requestAnimationFrame(adim);
  };
  node._raf = requestAnimationFrame(adim);
}
const fmtSayi = (n) => new Intl.NumberFormat('tr-TR').format(n);

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(unescape(encodeURIComponent(text)));   // UTF-8 güvenli
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/* Canlı bağlantı: önce anlık akış (SSE) denenir. Ağ ya da tünel akışı geçirmezse
   (ör. Cloudflare hızlı tüneli) birkaç saniye içinde kısa aralıklı yoklamaya geçilir. */
function canliBaglan({ sse, yoklama, olay, aralik = 2000, onVeri, onDurum }) {
  let es = null, zamanlayici = null, kapandi = false, v = '', kip = 'sse', hataSay = 0;
  const durum = (b) => onDurum && onDurum(b);
  const yoklamaBaslat = () => {
    kip = 'yoklama'; es && es.close(); es = null;
    const tur = async () => {
      if (kapandi) return;
      try {
        const r = await fetch(yoklama + (yoklama.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(v), { cache: 'no-store', headers: yoklama.startsWith('/api/yonetim') ? { 'x-yonetim-anahtari': sessionStorage.getItem('yonetimAnahtari') || '' } : {} });
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        v = j.v; hataSay = 0; durum(true);
        if (!j.degismedi) onVeri(j.veri);
      } catch (e) { hataSay++; if (hataSay > 1) durum(false); }
      zamanlayici = setTimeout(tur, document.hidden ? aralik * 3 : aralik);
    };
    tur();
  };
  if (!sse || !window.EventSource || /[?&]mod=yoklama/.test(location.search)) yoklamaBaslat();
  else {
    let ilkGeldi = false;
    es = new EventSource(sse);
    const bekle = setTimeout(() => { if (!ilkGeldi) yoklamaBaslat(); }, 4000);
    es.addEventListener(olay, (e) => { ilkGeldi = true; clearTimeout(bekle); durum(true); onVeri(JSON.parse(e.data)); });
    es.onerror = () => {
      if (kip !== 'sse') return;
      if (!ilkGeldi) { clearTimeout(bekle); yoklamaBaslat(); return; }
      durum(false);   // tarayıcı kendiliğinden yeniden bağlanır
    };
  }
  return { kapat() { kapandi = true; es && es.close(); clearTimeout(zamanlayici); }, get kip() { return kip; } };
}

/* ------------------------------------------------------------------ */
/*  Sonuç çizimi — aynı soru için DOM korunur, yalnızca değerler        */
/*  güncellenir; böylece çubuklar akıcı biçimde büyür.                  */
/* ------------------------------------------------------------------ */
function sonucCiz(kap, soru, sonuc, ops = {}) {
  if (!soru || !sonuc) { kap.replaceChildren(el('div', { class: 'bos-sonuc', text: 'Henüz soru seçilmedi' })); kap.dataset.anahtar = ''; return; }
  const gorunum = soruGorunumu(soru);
  const anahtar = soru.id + '|' + gorunum + '|' + (soru.options || []).join('¦') + '|' + (ops.kisiler ? 1 : 0);
  const yeni = kap.dataset.anahtar !== anahtar;
  if (yeni) { kap.replaceChildren(); kap.dataset.anahtar = anahtar; }
  ({ cubuk: cubukCiz, halka: halkaCiz, olcek: olcekCiz, bulut: bulutCiz, kartlar: kartCiz, yaris: yarisCiz })[gorunum](kap, soru, sonuc, yeni, ops);
}

function soruGorunumu(soru) {
  if (soru.type === 'olcek') return 'olcek';
  if (soru.type === 'acik') return soru.display === 'bulut' ? 'bulut' : soru.display === 'yaris' ? 'yaris' : 'kartlar';
  if (soru.type === 'tek' && soru.display === 'halka') return 'halka';
  return 'cubuk';
}

function cubukCiz(kap, soru, sonuc, yeni, ops = {}) {
  const toplamOy = sonuc.counts.reduce((a, b) => a + b, 0);
  const payda = soru.type === 'coklu' ? sonuc.respondents : toplamOy;  // çoklu seçimde yüzde = katılımcı oranı
  const enBuyuk = Math.max(1, ...sonuc.counts);
  if (yeni) {
    const sar = el('div', { class: 'cubuklar' });
    soru.options.forEach((o, i) => {
      sar.append(el('div', { class: 'cubuk-satir', style: { animationDelay: (i * 70) + 'ms' } },
        el('div', { class: 'cubuk-ad', text: o }),
        el('div', { class: 'cubuk-iz' },
          el('div', { class: 'cubuk-dolgu', style: { '--renk': PALET[i % PALET.length] } }),
          el('div', { class: 'cubuk-deger' }, el('span', { class: 'yz' }), el('small')))));
    });
    kap.append(sar);
  }
  const satirlar = kap.querySelectorAll('.cubuk-satir');
  sonuc.counts.forEach((n, i) => {
    const s = satirlar[i]; if (!s) return;
    const g = (n / enBuyuk) * (ops.enUzun || 82);   // en uzun çubuk; değer yazısına yer kalır
    s.querySelector('.cubuk-dolgu').style.width = g + '%';
    const d = s.querySelector('.cubuk-deger');
    d.style.left = g + '%';
    sayac(d.querySelector('.yz'), yuzde(n, payda), { onEk: '%' });
    d.querySelector('small').textContent = `(${fmtSayi(n)})`;
  });
}

function halkaCiz(kap, soru, sonuc, yeni) {
  const toplam = sonuc.counts.reduce((a, b) => a + b, 0);
  const NS = 'http://www.w3.org/2000/svg';
  if (yeni) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 42 42'); svg.classList.add('halka-svg');
    const zemin = document.createElementNS(NS, 'circle');
    Object.entries({ cx: 21, cy: 21, r: 15.915, class: 'halka-zemin' }).forEach(([k, v]) => zemin.setAttribute(k, v));
    svg.append(zemin);
    soru.options.forEach((_, i) => {
      const c = document.createElementNS(NS, 'circle');
      Object.entries({ cx: 21, cy: 21, r: 15.915, class: 'halka-dilim', 'stroke-dasharray': '0 100', 'stroke-dashoffset': 25 }).forEach(([k, v]) => c.setAttribute(k, v));
      c.style.stroke = PALET[i % PALET.length];
      svg.append(c);
    });
    const lej = el('div', { class: 'lejant' });
    soru.options.forEach((o, i) => lej.append(el('div', { class: 'lejant-oge', style: { animationDelay: (i * 70) + 'ms' } }, el('i', { style: { background: PALET[i % PALET.length] } }), el('span', { text: o }), el('em'))));
    kap.append(el('div', { class: 'halka-sar' }, el('div', { class: 'halka' }, svg, el('div', { class: 'halka-orta' }, el('b'), el('span', { text: 'yanıt' }))), lej));
  }
  let birikim = 0;
  kap.querySelectorAll('.halka-dilim').forEach((c, i) => {
    const pay = toplam ? (sonuc.counts[i] / toplam) * 100 : 0;
    c.setAttribute('stroke-dasharray', `${Math.max(0, pay - (pay > 0.6 ? 0.6 : 0))} ${100 - pay + (pay > 0.6 ? 0.6 : 0)}`);
    c.setAttribute('stroke-dashoffset', String(25 - birikim));
    birikim += pay;
  });
  sayac(kap.querySelector('.halka-orta b'), toplam);
  kap.querySelectorAll('.lejant-oge em').forEach((e, i) => sayac(e, yuzde(sonuc.counts[i], toplam), { onEk: '%' }));
}

function olcekCiz(kap, soru, sonuc, yeni) {
  const min = soru.scaleMin ?? 1;
  const enBuyuk = Math.max(1, ...sonuc.counts);
  if (yeni) {
    const sut = el('div', { class: 'olcek-sutunlar' });
    const alt = el('div', { class: 'olcek-alt' });
    sonuc.counts.forEach((_, i) => {
      const renk = `color-mix(in srgb, var(--turkuaz) ${30 + (i / Math.max(1, sonuc.counts.length - 1)) * 70}%, var(--lacivert))`;
      sut.append(el('div', { class: 'olcek-sutun', style: { animationDelay: (i * 80) + 'ms' } }, el('div', { class: 'olcek-dolgu', style: { background: renk } }, el('span'))));
      alt.append(el('div', { text: String(min + i) }));
    });
    kap.append(el('div', { class: 'olcek' },
      el('div', { class: 'olcek-sol' }, sut, alt, el('div', { class: 'olcek-uclar' }, el('span', { text: soru.minLabel || '' }), el('span', { text: soru.maxLabel || '' }))),
      el('div', { class: 'ortalama' }, el('b'), el('span', { text: 'ortalama' }))));
  }
  kap.querySelectorAll('.olcek-dolgu').forEach((d, i) => {
    const n = sonuc.counts[i] || 0;
    d.style.height = Math.max(1, (n / enBuyuk) * 88) + '%';
    d.querySelector('span').textContent = n ? fmtSayi(n) : '';
  });
  sayac(kap.querySelector('.ortalama b'), sonuc.mean, { ondalik: 1 });
}

function bulutCiz(kap, soru, sonuc, yeni) {
  let b = kap.querySelector('.bulut');
  if (!b) { b = el('div', { class: 'bulut' }); kap.append(b); }
  const kelimeler = sonuc.words || [];
  if (!kelimeler.length) { b.replaceChildren(el('div', { class: 'bos-sonuc', text: 'Yanıtlar geldikçe kelime bulutu oluşacak…' })); return; }
  const enBuyuk = kelimeler[0].count;
  b.dataset.taban = parseFloat(getComputedStyle(kap).getPropertyValue('--bulut-taban')) || 1;
  // Tema paleti: kapsayıcıda data-palet varsa o renkler kullanılır (ör. olumlu = yeşiller)
  const palet = (kap.dataset.palet || '').split(',').filter(Boolean);
  const renk = (t) => (palet.length ? palet[hash(t) % palet.length] : PALET[hash(t) % 7]);
  // Kararlı yerleşim: en sık kelime ortada kalsın diye sıralamayı ortadan dışa doğru diz
  const sirali = []; kelimeler.forEach((k, i) => (i % 2 ? sirali.push(k) : sirali.unshift(k)));
  const mevcut = new Map([...b.querySelectorAll('span')].map((s) => [s.dataset.k, s]));
  const yeniListe = sirali.map((k) => {
    let s = mevcut.get(k.text);
    if (!s) { s = el('span', { 'data-k': k.text, text: k.text }); }
    s.style.color = renk(k.text);
    s.dataset.o = k.count / enBuyuk;   // boyut, kaç kez yazıldığıyla doğru orantılı: en çok yazılan en büyük
    s.classList.toggle('zirve', k.count === enBuyuk && enBuyuk > 1);
    s.title = k.count + ' kez';
    return s;
  });
  b.replaceChildren(...yeniListe);
  bulutSigdir(b);
  requestAnimationFrame(() => bulutSigdir(b));
  if (!b._ro && window.ResizeObserver) { b._ro = new ResizeObserver(() => bulutSigdir(b)); b._ro.observe(b); }
}

/* Bulutu alana sığdır: büyük ölçekten başlayıp taşma bitene dek küçült */
function bulutSigdir(b) {
  const ogeler = [...b.querySelectorAll('span[data-o]')];
  if (!ogeler.length || !b.clientHeight) return;
  const taban = parseFloat(b.dataset.taban) || 1;
  const boyut = (s, f) => (taban * f * (0.35 + parseFloat(s.dataset.o) * 2.65)) + 'em';
  const eski = ogeler.map((s) => s.style.fontSize);
  ogeler.forEach((s) => { s.style.transition = 'none'; });
  // Alana sığan en büyük ölçeği ikili aramayla bul: bulut alanı doldurur ama taşmaz
  const tasiyor = (f) => { ogeler.forEach((s) => { s.style.fontSize = boyut(s, f); }); return b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1; };
  let alt = 0.05, ust = 12;
  for (let i = 0; i < 16; i++) { const orta = (alt + ust) / 2; if (tasiyor(orta)) ust = orta; else alt = orta; }
  const f = alt * 0.97; tasiyor(f);
  // Ölçü bitti: eski boyuttan yenisine yumuşak geçiş
  const hedef = ogeler.map((s) => s.style.fontSize);
  ogeler.forEach((s, i) => { if (eski[i]) s.style.fontSize = eski[i]; });
  void b.offsetHeight;
  ogeler.forEach((s, i) => { s.style.transition = ''; s.style.fontSize = hedef[i]; });
}

/* Canlı sıralama yarışı: satırlar konumlarına kayarak yer değiştirir */
function yarisCiz(kap, soru, sonuc, yeni, ops = {}) {
  let y = kap.querySelector('.yaris');
  if (!y) { y = el('div', { class: 'yaris' }); kap.append(y); y._satir = new Map(); y._sira = new Map(); }
  const adet = ops.yarisAdet || 10;
  const liste = (sonuc.siralama || []).slice(0, adet);
  let bos = y.querySelector('.bos-sonuc');
  if (!liste.length) { if (!bos) y.append(el('div', { class: 'bos-sonuc', text: 'Yanıtlar geldikçe sıralama oluşacak…' })); return; }
  if (bos) bos.remove();
  const enYuksek = liste[0].kez || 1;
  const satirYuk = y.clientHeight / adet;
  y.style.setProperty('--satir', satirYuk + 'px');
  const kalan = new Set(liste.map((x) => x.anahtar));
  for (const [k, d] of y._satir) if (!kalan.has(k)) { d.classList.add('cikiyor'); setTimeout(() => d.remove(), 600); y._satir.delete(k); y._sira.delete(k); }
  liste.forEach((x, i) => {
    let d = y._satir.get(x.anahtar);
    const yeniGeldi = !d;
    if (!d) {
      d = el('div', { class: 'yaris-satir yeni' },
        el('div', { class: 'yaris-no' }),
        el('div', { class: 'yaris-govde' },
          el('div', { class: 'yaris-ust' }, el('span', { class: 'yaris-ad' }), el('span', { class: 'yaris-ok' })),
          el('div', { class: 'yaris-iz' }, el('div', { class: 'yaris-dolgu' }))),
        el('div', { class: 'yaris-puan' }, el('b'), el('small')));
      d.style.transform = `translateY(${adet * satirYuk}px)`;   // aşağıdan girsin
      y.append(d); y._satir.set(x.anahtar, d);
      void d.offsetHeight;
      setTimeout(() => d.classList.remove('yeni'), 1600);
    }
    const onceki = y._sira.get(x.anahtar);
    if (onceki != null && onceki > i) {   // sıra yükseldi
      const ok = d.querySelector('.yaris-ok');
      ok.textContent = '▲ ' + (onceki - i);
      ok.classList.remove('goster'); void ok.offsetWidth; ok.classList.add('goster');
      d.classList.remove('yukseldi'); void d.offsetWidth; d.classList.add('yukseldi');
    }
    y._sira.set(x.anahtar, i);
    d.dataset.derece = i < 3 ? String(i + 1) : '';
    d.style.transform = `translateY(${i * satirYuk}px)`;
    d.querySelector('.yaris-no').textContent = i + 1;
    d.querySelector('.yaris-ad').textContent = x.text;
    d.querySelector('.yaris-dolgu').style.width = Math.max(2, (x.kez / enYuksek) * 100) + '%';
    sayac(d.querySelector('.yaris-puan b'), x.kez);
    d.querySelector('.yaris-puan small').textContent = 'kişi';
  });
  if (!y._ro && window.ResizeObserver) { y._ro = new ResizeObserver(() => { const h = y.clientHeight / adet; y.style.setProperty('--satir', h + 'px'); y._satir.forEach((d, k) => { d.style.transform = `translateY(${y._sira.get(k) * h}px)`; }); }); y._ro.observe(y); }
}

function kartCiz(kap, soru, sonuc, yeni, ops) {
  let k = kap.querySelector('.kartlar');
  if (!k) { k = el('div', { class: 'kartlar' }); kap.append(k); }
  const ogeler = sonuc.items || [];
  if (!ogeler.length) { k.replaceChildren(el('div', { class: 'bos-sonuc', text: 'Yanıtlar geldikçe burada görünecek…' })); return; }
  const mevcut = new Map([...k.querySelectorAll('.kart-yanit')].map((d) => [d.dataset.id + '|' + d.dataset.ts + '|' + d.dataset.h, d]));
  const liste = ogeler.slice(0, ops.enFazla || 60).map((o) => {
    let d = mevcut.get(o.id + '|' + o.ts + '|' + (o.hidden ? 1 : 0));
    if (!d) {
      d = el('div', { class: 'kart-yanit' + (o.hidden ? ' gizlendi' : ''), 'data-id': o.id, 'data-ts': o.ts, 'data-h': o.hidden ? 1 : 0 }, el('div', { text: o.text }));
      if (ops.kisiler && (o.name || o.kurum)) d.append(el('div', { class: 'kim', text: [o.name, o.kurum].filter(Boolean).join(' · ') }));
      if (ops.moderasyon) d.append(ops.moderasyon(o));
    }
    return d;
  });
  k.replaceChildren(...liste);
}

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; }
