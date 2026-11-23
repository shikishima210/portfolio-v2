/* 背景のグリッド。線をゆっくり波打たせる(参考画像のゆがんだ方眼) */
export function createGrid(canvas){
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  let w = 0, h = 0, u = 1, sp = 92, ox = 40, oy = 90, dpr = 1;

  function resize(){
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    // --u は calc() なので、実寸は目印の要素から測る
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:calc(100 * var(--u))';
    document.body.appendChild(probe); u = probe.getBoundingClientRect().width / 100; probe.remove();
    const mobile = matchMedia('(max-aspect-ratio:1/1)').matches;
    sp = (mobile ? 60 : 92) * u; ox = (mobile ? 20 : 40) * u; oy = (mobile ? 70 : 90) * u;
  }

  // ゆがみ:画面の中央ほど大きく膨らむ
  function warp(x, y, t){
    const nx = x / w - .5, ny = y / h - .5, a = 16 * u;
    return [
      x + Math.sin(ny * 3.2 + t * .35) * a * (1 - nx * nx * 2),
      y + Math.sin(nx * 2.6 + t * .28) * a * (1 - ny * ny * 2),
    ];
  }

  function draw(t){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = css.getPropertyValue('--grid').trim() || '#ccc9c2';
    ctx.lineWidth = 1;
    const step = 24;
    ctx.beginPath();
    for(let x = ox % sp - sp; x < w + sp; x += sp){
      for(let y = -step; y <= h + step; y += step){ const [a, b] = warp(x, y, t); y === -step ? ctx.moveTo(a, b) : ctx.lineTo(a, b); }
    }
    for(let y = oy % sp - sp; y < h + sp; y += sp){
      for(let x = -step; x <= w + step; x += step){ const [a, b] = warp(x, y, t); x === -step ? ctx.moveTo(a, b) : ctx.lineTo(a, b); }
    }
    ctx.stroke();
  }

  resize();
  let last = 0;
  return {
    // 動きを減らす設定では1回しか描かないので、大きさが変わったら描き直す
    resize(){ resize(); if(reduce) draw(0); },
    frame(now){
      if(reduce){ if(!last){ draw(0); last = 1; } return; }
      if(now - last < 33) return;          // 30fps で十分
      last = now; draw(now / 1000);
    },
  };
}
