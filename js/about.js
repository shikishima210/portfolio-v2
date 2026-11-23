import { createGrid } from './backdrop.js';

const scroller = document.getElementById('scroller');
const grid = createGrid(document.getElementById('grid'));
addEventListener('resize', () => grid.resize());
(function loop(t){ requestAnimationFrame(loop); grid.frame(t); })(performance.now());

/* 表示に入ったら出す。IntersectionObserverが動かなくても隠れたままにしない */
const els = [...document.querySelectorAll('.reveal')];
const show = el => {
  el.classList.add('in');
  el.querySelectorAll('.skill-bar i').forEach(i => { i.style.width = i.dataset.w + '%'; });
};
if('IntersectionObserver' in window){
  const io = new IntersectionObserver(es => es.forEach(e => {
    if(e.isIntersecting){ show(e.target); io.unobserve(e.target); }
  }), {root:scroller, threshold:.12});
  els.forEach(el => io.observe(el));
  document.documentElement.classList.add('js-reveal');   // 準備できてから隠す
  setTimeout(() => els.forEach(show), 1500);
}else{
  els.forEach(show);
}

/* タイトルバーの現在地:CONTACT まで来たら切り替える */
const navA = document.getElementById('navAbout'), navC = document.getElementById('navContact');
const contact = document.getElementById('contact');
function mark(){
  const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;   // 下まで来たら連絡先
  const inContact = atEnd || contact.getBoundingClientRect().top < scroller.getBoundingClientRect().top + scroller.clientHeight * .5;
  navA.classList.toggle('on', !inContact); navC.classList.toggle('on', inContact);
  if(inContact){ navC.setAttribute('aria-current', 'location'); navA.removeAttribute('aria-current'); }
  else{ navA.setAttribute('aria-current', 'location'); navC.removeAttribute('aria-current'); }
}
scroller.addEventListener('scroll', mark, {passive:true});
addEventListener('resize', mark);
addEventListener('hashchange', mark);
// about.html#contact で来たときは、ウィンドウの中をその位置まで送る
if(location.hash === '#contact') requestAnimationFrame(() => { scroller.style.scrollBehavior = 'auto'; contact.scrollIntoView(); scroller.style.scrollBehavior = ''; mark(); });
mark();
