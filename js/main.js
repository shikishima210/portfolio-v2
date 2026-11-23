import { WORKS } from './works-data.js';
import { createGrid } from './backdrop.js';

const $ = s => document.querySelector(s);
const pad = n => String(n + 1).padStart(2, '0');
const N = WORKS.length;
const TOTAL = String(N).padStart(2, '0');
const body = document.body;
const isLoading = () => body.classList.contains('loading');

/* ============ フォルダ(作品一覧) ============ */
const folders = $('#folders');
folders.innerHTML = WORKS.map((w, i) => {
  // PC:右上に2列でずらして積む / SP:下に2段(6+5)
  const col = i % 2, x = col === 0 ? (i % 4 === 0 ? 0 : 14) : (i % 4 === 1 ? 84 : 72);
  const r = i < 6 ? 0 : 1, c = i < 6 ? i : i - 6;
  return `<button class="folder" data-i="${i}" aria-label="${pad(i)} ${w.title}" data-title="${w.title}"
    style="--x:${1210 + x};--y:${64 + i * 32};--xs:${12 + c * 57 + (r ? 28 : 0)};--ys:${708 + r * 50}">
    <i></i><b>${pad(i)}</b></button>`;
}).join('');

/* 読み込み中・詳細を開いている間に、見えていない操作部品へ触れないようにする */
const uiLayer = $('.ui-layer'), docLayer = $('.doc-layer');
function setInert(){
  folders.inert = isLoading();
  uiLayer.inert = isLoading() || !!(show && show.opened);
  docLayer.inert = isLoading() || !(show && show.opened);
  $('#listBtn').inert = isLoading();
}

/* ============ 読み込み ============ */
const pctEl = $('#loaderPct'), barEl = $('#loaderBar');
let shown = 0, real = 0, done = false, show = null;
setTimeout(() => { done = true; }, 12000);      // 失敗しても待たせ続けない(3Dの読み込みより先に仕掛ける)
const tick = setInterval(() => {
  const cap = done ? 1 : Math.min(.95, real);
  shown = Math.min(cap, shown + (cap - shown) * .16 + (done ? .02 : .002));
  pctEl.textContent = Math.round(shown * 100);
  barEl.style.transform = `scaleX(${shown})`;
  if(done && shown >= .999 && show){
    clearInterval(tick);
    setTimeout(() => {
      body.classList.remove('loading');
      show.start(); showWork(show.index, true); setInert();
    }, 250);
  }
}, 40);

/* ============ 3D(だめなら画像で見せる) ============ */
const tag = $('#tag');
const moveTag = (x, y) => { tag.style.transform = `translate(${x + 16}px, ${y + 14}px)`; };
const hooks = {
  onProgress: p => { real = p; },
  onReady: () => { done = true; },
  onPick: i => {
    if(show.opened){ if(i === show.index) return; openWork(i); return; }
    const s = show.slotOf(i);
    if(s === '0') openWork(i); else goTo(i);
  },
  onEmpty: () => closeWork(),
  onSwipe: d => step(d),
  onHover: (i, x, y) => {
    if(i < 0 || show.opened){ tag.classList.remove('on'); return; }
    tag.innerHTML = `<b>${pad(i)}</b>${WORKS[i].title}`; moveTag(x, y); tag.classList.add('on');
  },
  onHoverMove: moveTag,
};
let lookNote = () => '', isFlippable = () => false;
try{
  const m = await import('./scene.js');
  lookNote = m.lookNote; isFlippable = m.isFlippable;
  show = m.createShowcase($('#stage'), WORKS, hooks);
}catch(err){
  console.warn('3D を使えないので画像で表示します', err);
  show = createFlat();
  done = true;
}

/* 3D が動かない環境用:今の作品の画像を1枚出すだけ。API は 3D と同じ */
function createFlat(){
  body.classList.add('no3d');
  $('#stage').hidden = true;
  const img = $('#flat');
  let index = 0, opened = false;
  const set = () => { img.src = `assets/img/${WORKS[index].main}.jpg`; img.alt = WORKS[index].title; };
  img.addEventListener('click', () => (opened ? null : openWork(index)));
  set();
  return {
    frame(){}, resize(){}, start(){ img.hidden = false; },
    go(i){ index = (i + N) % N; set(); },
    open(){ opened = true; }, close(){ opened = false; },
    flip(){ return 'front'; }, get face(){ return 'front'; },
    slotOf(i){ return i === index ? '0' : 'hidden'; },
    get index(){ return index; }, get opened(){ return opened; },
  };
}

const grid = createGrid($('#grid'));
// フォーカスなどでウィンドウの中身が勝手にずれないようにする
const winEl = $('#win');
winEl.addEventListener('scroll', () => { winEl.scrollTop = 0; winEl.scrollLeft = 0; });
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { show.resize(); grid.resize(); }); });
(function loop(t){ requestAnimationFrame(loop); grid.frame(t); show.frame(t); })(performance.now());

/* ============ 今の作品の表示 ============ */
const label = $('#label'), winname = $('#winname');
function showWork(i, first){
  const w = WORKS[i];
  $('#labelNo').textContent = `${pad(i)} / ${TOTAL}`;
  $('#labelTitle').textContent = w.title;
  $('#labelMeta').innerHTML = `${w.adopted ? '<span class="chip adopted">採用</span>' : ''}<span class="chip">${w.kind}</span><span>${w.year}</span><span class="br"></span><button class="pill" id="viewBtn">作品の詳細を見る →</button>`;
  $('#viewBtn').addEventListener('click', () => openWork(show.index));
  winname.textContent = `${pad(i)} / ${TOTAL} — ${w.title}`;
  folders.querySelectorAll('.folder').forEach((f, k) => {
    f.classList.toggle('on', k === i);
    if(k === i) f.setAttribute('aria-current', 'true'); else f.removeAttribute('aria-current');
  });
  if(!first){ label.classList.remove('swap'); void label.offsetWidth; label.classList.add('swap'); }
}

/* ============ 送る ============ */
let lock = 0;
function goTo(i, dir){
  i = (i + N) % N;
  if(i === show.index) return;
  if(!dir){ const f = (i - show.index + N) % N; dir = f <= N / 2 ? 1 : -1; }
  show.go(i, dir); showWork(i);
  if(show.opened) fillDoc(i);
}
function step(d){
  const now = performance.now();
  if(now < lock) return;
  lock = now + 650;
  goTo(show.index + d, d);
}
// ホイール・トラックパッド:ひとつながりの操作(慣性を含む)で1作品だけ進める
let acc = 0, gestureT = 0, steppedAt = 0;
winEl.addEventListener('wheel', e => {
  if(show.opened || isLoading() || body.classList.contains('list-open')) return;
  e.preventDefault();
  const now = performance.now();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
  const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
  if(now - gestureT > 220){ acc = 0; steppedAt = 0; }   // 手が止まったら新しい操作
  gestureT = now;
  if(steppedAt && now - steppedAt < 1200) return;         // 慣性の続きは無視
  acc += d;
  if(Math.abs(acc) > 45){ step(acc > 0 ? 1 : -1); acc = 0; steppedAt = now; }
}, {passive:false});
folders.addEventListener('click', e => {
  const b = e.target.closest('.folder'); if(!b) return;
  const i = +b.dataset.i;
  if(show.opened) openWork(i); else goTo(i);
});

/* ============ 作品ウィンドウ ============ */
const doc = $('#doc'), docBody = $('#docBody'), tools = $('#tools'), flipBtn = $('#flipBtn');
// 共同制作の担当は本文の「〜担当」の文から拾って、作品名の下にまとめる
const roleOf = w => (w.process.split('。').find(s => s.includes('担当')) || '').replace(/^.*?自分は/, '').trim();
function fillDoc(i){
  const w = WORKS[i];
  const role = roleOf(w);
  $('#docName').textContent = `${pad(i)} / ${TOTAL}　${w.title}`;
  docBody.innerHTML = `
    <div class="p-chips">${w.adopted ? '<span class="chip adopted">採用</span>' : ''}${w.tags.map(t => `<span class="chip">${t}</span>`).join('')}</div>
    <h2 class="p-title">${w.title}</h2>
    <dl class="p-sum">
      ${role ? `<div><dt>担当</dt><dd>${role}。</dd></div>` : ''}
      <div><dt>結果</dt><dd>${w.result}</dd></div>
    </dl>
    <section class="p-concept"><h3>コンセプト</h3><p>${w.lead}</p></section>
    <ol class="p-steps">
      <li><h3><i>01</i>背景・目的</h3><p>${w.problem}</p></li>
      <li><h3><i>02</i>プロセス</h3><p>${w.process}</p></li>
      <li><h3><i>03</i>結果</h3><p>${w.result}</p></li>
    </ol>
    <dl class="p-spec">
      <div><dt>制作年月</dt><dd>${w.year}</dd></div>
      <div><dt>制作期間</dt><dd>${w.period}</dd></div>
      <div><dt>ツール</dt><dd>${w.tools}</dd></div>
      ${lookNote(w.id) ? `<div><dt>サイト上の表示</dt><dd>${lookNote(w.id)}</dd></div>` : ''}
    </dl>
    ${w.live ? `<a class="p-live" href="${w.live}" target="_blank" rel="noopener noreferrer">サイトを見る(別タブ) →</a>` : ''}
    <div class="p-shots">${w.shots.map((s, k) => `<button data-src="assets/img/${s}.jpg" aria-label="${w.title} 画像${k + 1}を拡大"><img src="assets/img/${s}.jpg" alt="${w.title} 画像${k + 1}" loading="lazy"></button>`).join('')}</div>`;
  docBody.scrollTop = 0;
  flipBtn.hidden = !isFlippable(w.id);
  flipBtn.textContent = '裏面を見る';
}
let backFocus = null;
function openWork(i){
  const wasOpen = show.opened;
  if(i !== show.index){ const f = (i - show.index + N) % N; show.go(i, f <= N / 2 ? 1 : -1); showWork(i); }
  fillDoc(i);
  show.open();
  tag.classList.remove('on');
  doc.classList.add('on'); doc.setAttribute('aria-hidden', 'false');
  tools.classList.add('on');
  body.classList.add('is-open');
  setInert();
  if(!wasOpen){ backFocus = document.activeElement; }
  setTimeout(() => docBody.focus({preventScroll:true}), 60);
}
function closeWork(){
  if(!show.opened) return;
  show.close();
  doc.classList.remove('on'); doc.setAttribute('aria-hidden', 'true');
  tools.classList.remove('on');
  body.classList.remove('is-open');
  setInert();
  const back = backFocus && backFocus !== body && backFocus.isConnected && !backFocus.closest('[inert]') ? backFocus : $('#viewBtn');
  back && back.focus({preventScroll:true});
}
$('#docClose').addEventListener('click', closeWork);
$('#prev').addEventListener('click', () => openWork((show.index - 1 + N) % N));
$('#next').addEventListener('click', () => openWork((show.index + 1) % N));
const faceText = () => { flipBtn.textContent = show.face === 'back' ? '表面を見る' : '裏面を見る'; };
flipBtn.addEventListener('click', () => { show.flip(); faceText(); });
// ドラッグで回したあとも、ボタンの文言を見えている面に合わせる
$('#stage').addEventListener('pointerup', () => { if(show.opened) setTimeout(faceText, 0); });

/* ============ 作品一覧(全体を見渡す) ============ */
const list = $('#list'), listGrid = $('#listGrid');
$('#listTitle small').textContent = `全${N}点`;
listGrid.innerHTML = WORKS.map((w, i) => `
  <li><button class="card" data-i="${i}">
    <span class="card-img"><img src="assets/img/${w.main}.jpg" alt="" loading="lazy"></span>
    <span class="card-no">${pad(i)}</span>
    <span class="card-title">${w.title}</span>
    <span class="card-meta">${w.adopted ? '<span class="chip adopted">採用</span>' : ''}<span class="chip">${w.kind}</span><span>${w.year}</span></span>
  </button></li>`).join('');
let listBack = null;
function openList(){
  listBack = document.activeElement;
  if(show.opened) closeWork();
  body.classList.add('list-open');
  winEl.inert = true;
  list.hidden = false; list.setAttribute('aria-hidden', 'false');
  void list.offsetWidth; list.classList.add('on');   // 表示してから薄く出す
  setTimeout(() => $('#listClose').focus({preventScroll:true}), 60);
}
function closeList(){
  body.classList.remove('list-open');
  winEl.inert = false;
  list.classList.remove('on'); list.setAttribute('aria-hidden', 'true');
  setTimeout(() => { if(!list.classList.contains('on')) list.hidden = true; }, 350);
  listBack && listBack.isConnected && listBack.focus({preventScroll:true});
}
$('#listBtn').addEventListener('click', openList);
$('#listBtn2').addEventListener('click', openList);
$('#listClose').addEventListener('click', closeList);
listGrid.addEventListener('click', e => {
  const b = e.target.closest('.card'); if(!b) return;
  listBack = null; closeList(); openWork(+b.dataset.i);
});

/* ============ 画像の拡大 ============ */
const lb = $('#lightbox'), lbImg = $('#lightboxImg'), lbClose = $('#lightboxClose');
let lbBack = null;
docBody.addEventListener('click', e => {
  const b = e.target.closest('.p-shots button'); if(!b) return;
  lbBack = b;
  lbImg.src = b.dataset.src; lbImg.alt = b.querySelector('img').alt;
  lb.classList.add('on'); lb.setAttribute('aria-hidden', 'false');
  winEl.inert = true;
  setTimeout(() => lbClose.focus({preventScroll:true}), 60);
});
const closeLb = () => {
  lb.classList.remove('on'); lb.setAttribute('aria-hidden', 'true');
  winEl.inert = false;
  lbBack && lbBack.focus({preventScroll:true});
};
lb.addEventListener('click', closeLb);

/* ============ キーボード ============ */
addEventListener('keydown', e => {
  if(lb.classList.contains('on')){
    if(e.key === 'Escape') closeLb();
    if(e.key === 'Tab'){ e.preventDefault(); lbClose.focus(); }   // 拡大中は閉じるボタンの外へ出さない
    return;
  }
  if(isLoading()) return;
  if(body.classList.contains('list-open')){ if(e.key === 'Escape') closeList(); return; }
  if(e.key === 'Escape' && show.opened){ closeWork(); return; }
  if(show.opened){
    // 開いている間:左右で作品を送り、上下・PageUp/Down は本文のスクロールに使う
    if(e.key === 'ArrowRight'){ e.preventDefault(); openWork((show.index + 1) % N); }
    if(e.key === 'ArrowLeft'){ e.preventDefault(); openWork((show.index - 1 + N) % N); }
    return;
  }
  if(['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)){ e.preventDefault(); step(1); }
  if(['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)){ e.preventDefault(); step(-1); }
  if(e.key === 'Enter' && !e.target.closest('button, a')) openWork(show.index);
});

setInert();
