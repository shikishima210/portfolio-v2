/* 文字を1文字ずつ2重にして、ホバーで縦にロールさせる */
export function splitChars(el){
  const text = el.textContent;
  el.textContent = '';
  el.classList.add('roll-hit');
  el.setAttribute('aria-label', text);
  [...text].forEach(ch => {
    const span = document.createElement('span');
    span.className = 'roll-char';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<i>${ch}</i><i>${ch}</i>`;
    el.appendChild(span);
  });
}
