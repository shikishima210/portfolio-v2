import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* 作品ごとの見せ方。
   paper  : 紙のシミュレーション(表・裏)
   poster : 紙 + 立体出力したタイトル文字
   board  : のりパネ + 看板に載せた3Dモデル
   phone  : Webサイトを端末の画面で
   model  : 実データ(3Dプリント / Womp / Blender) */
const LOOK = {
  sensor : {type:'paper',  front:'sensor_a', back:'sensor_b', note:'紙のシミュレーション ／ 表・裏'},
  design : {type:'paper',  front:'design_b', back:'design_c', note:'紙のシミュレーション ／ 表・裏'},
  movie  : {type:'paper',  front:'movie_a',  back:'movie_b',  note:'紙のシミュレーション ／ 表・裏'},
  civic  : {type:'poster', front:'civic', model:'civic', note:'ポスター ＋ 立体出力したタイトル文字(Fusion360 実データ)'},
  ocboard: {type:'board',  front:'oc_board', sats:['oc-mic','oc-rocket','oc-camera','oc-pc'], note:'のりパネ ＋ 看板に配置した3Dモデル(Womp 実データ)'},
  qr     : {type:'qr',     model:'qr', ry:Math.PI/3, rx:.22, note:'留め具4点は3Dプリントの実データ(Fusion360)。板は寸法から再現'},
  kinen  : {type:'model',  model:'kinen', rx:.6, note:'3Dプリントの実データ(Shapr3D)'},
  toilet : {type:'model',  model:'toilet', rx:Math.PI/2, rz:Math.PI/2, plate:0x9d7384, note:'矢印は3Dプリントの実データ(Shapr3D)。背面の板は写真から再現'},
  polaris: {type:'phone',  screen:'polaris_b', note:'Webサイト(STUDIO)'},
  room   : {type:'model',  model:'room', ry:-.5, note:'Blender 制作データ'},
  cracker: {type:'model',  model:'cracker', ry:-.3, note:'Womp 制作データ'},
};
export const lookNote = id => (LOOK[id] || {}).note || '';
export const isFlippable = id => ['paper'].includes((LOOK[id] || {}).type);

const SIZE = 1;            // 1作品の基準サイズ
const TAU = Math.PI * 2;
const damp = (k, dt) => 1 - Math.exp(-k * dt);


/* =========================================================
   ショーケース:参考画像のロケットの位置に作品が浮かび、
   スクロールで「今 → 次 → その次」が入れ替わる。
   置き場所は HTML の .slot(Figma の座標)を読み取って決める。
   ========================================================= */
export function createShowcase(canvas, works, hooks = {}){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = works.length;

  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .5;
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0xb9b1a2, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe2cc, .7);
  rim.position.set(-4, 2, -3); scene.add(rim);

  // 遠くから狭い画角で見て、画面上の位置と大きさを素直に合わせる
  const camera = new THREE.PerspectiveCamera(22, 1, .1, 100);
  camera.position.set(0, 0, 16);
  camera.lookAt(0, 0, 0);

  /* ---------- 読み込み ---------- */
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, loaded, total) => hooks.onProgress && hooks.onProgress(loaded / total);
  manager.onError = url => console.warn('読み込み失敗:', url);

  const texLoader = new THREE.TextureLoader(manager);
  const draco = new DRACOLoader(manager).setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  const gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco);

  function tex(name, onload){
    const t = texLoader.load(`assets/img/${name}.jpg`, onload);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function model(name, cb, onFail){
    gltfLoader.load(`assets/model/${name}.glb`, g => {
      g.scene.traverse(o => { if(o.isMesh){ o.material.envMapIntensity = .8; } });
      cb(g.scene);
    }, undefined, err => {
      console.warn('モデルを読めませんでした:', name, err);
      onFail && onFail();
    });
  }
  /* モデルを読めなかった作品は、作品画像の板で代わりに見せる(空白のまま待たせない) */
  function fallback(it){
    const w = works[it.i];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.75 * SIZE, SIZE),
      new THREE.MeshStandardMaterial({map:tex(w.main), roughness:.85, side:THREE.DoubleSide}));
    it.body.add(m);
    it.ready = true;
  }

  /* 大きさを揃えて原点に置く(奥行きは少し軽く扱う) */
  function fit(obj, size = SIZE){
    const box = new THREE.Box3().setFromObject(obj);
    const s = box.getSize(new THREE.Vector3());
    const k = size / Math.max(s.x, s.y, s.z * .6);
    obj.scale.multiplyScalar(k);
    const box2 = new THREE.Box3().setFromObject(obj);
    obj.position.sub(box2.getCenter(new THREE.Vector3()));
  }

  /* ---------- 紙 ---------- */
  const papers = [];
  function makePaper({front, back, w, h, stiff = 1, seed = 0}){
    const geo = new THREE.PlaneGeometry(w, h, 22, 30);
    const base = geo.attributes.position.array.slice();
    const fMat = new THREE.MeshStandardMaterial({map:tex(front), roughness:.88, metalness:0, envMapIntensity:.3});
    let bMat;
    if(back){
      const bt = tex(back);
      bt.wrapS = THREE.RepeatWrapping; bt.repeat.x = -1; bt.offset.x = 1;   // 裏から見て正しい向きに
      bMat = new THREE.MeshStandardMaterial({map:bt, roughness:.9, side:THREE.BackSide, envMapIntensity:.3});
    }else{
      bMat = new THREE.MeshStandardMaterial({color:0xf6f3ec, roughness:.95, side:THREE.BackSide});
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, fMat), new THREE.Mesh(geo, bMat));
    const p = {geo, base, w, h, stiff, seed, amt:1, owner:building};
    papers.push(p);
    return g;
  }
  /* たわみ: 横方向の反り + ゆるい波 + 角の持ち上がり。amt は風の強さ */
  function bendPaper(p, t){
    const pos = p.geo.attributes.position.array, b = p.base;
    const a = p.amt / p.stiff, hw = p.w / 2, hh = p.h / 2, s = p.seed;
    const bow = .085 * (.75 + .25 * Math.sin(t * .6 + s));
    for(let i = 0; i < pos.length; i += 3){
      const u = b[i] / hw, v = b[i + 1] / hh;
      const corner = Math.max(0, (u - v) * .5 - .3);
      pos[i + 2] = a * (
        p.w * bow * u * u
        + p.h * .022 * Math.sin(v * 2.3 + u * .9 + t * 1.15 + s)
        + p.h * .16 * corner * corner * (1 + .4 * Math.sin(t * 1.7 + s))
      );
    }
    p.geo.attributes.position.needsUpdate = true;
    p.geo.computeVertexNormals();
  }

  /* ---------- 作品を組み立てる ---------- */
  let building = -1;
  const items = works.map((w, i) => {
    const look = LOOK[w.id] || {type:'paper', front:w.main};
    const holder = new THREE.Group();      // 位置・回転・拡大を受け持つ
    const body = new THREE.Group();        // 中身(ここを揃える)
    holder.add(body);
    scene.add(holder);
    const it = {i, id:w.id, look, holder, body, extra:[], seed:i * 1.37,
      pos:new THREE.Vector3(), quat:new THREE.Quaternion(), scl:1, ready:false, hit:null};
    building = i; build(it);
    return it;
  });

  function build(it){
    const L = it.look, body = it.body;
    const A4 = 1 / Math.SQRT2;
    if(L.type === 'paper'){
      body.add(makePaper({front:L.front, back:L.back, w:A4 * SIZE, h:SIZE, seed:it.seed}));
      it.ready = true;
    }
    if(L.type === 'poster'){
      const poster = makePaper({front:L.front, w:.707 * SIZE, h:SIZE, stiff:1.4, seed:it.seed});
      body.add(poster);
      model(L.model, m => {
        m.rotation.x = Math.PI / 2;
        const g = new THREE.Group(); g.add(m); fit(g, .78 * SIZE);
        const wrap = new THREE.Group(); wrap.add(g);
        wrap.position.set(-.24 * SIZE, 0, .16);
        body.add(wrap);
        it.extra.push({obj:wrap, base:wrap.position.clone(), amp:.018, sp:.9});
        it.ready = true;
      }, () => { it.ready = true; });   // 文字が無くてもポスターは見せる
    }
    if(L.type === 'board'){
      const w = SIZE, h = SIZE * 712 / 949, d = .035;
      const side = new THREE.MeshStandardMaterial({color:0xfafaf7, roughness:.8});
      const face = new THREE.MeshStandardMaterial({map:tex(L.front), roughness:.7, envMapIntensity:.3});
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, face, side]);
      body.add(board);
      const spots = [[-.52, .36, .22, .3], [.55, .32, .18, .34], [-.5, -.34, .26, .3], [.5, -.36, .2, .28]];
      let n = 0;
      L.sats.forEach((name, k) => model(name, m => {
        const g = new THREE.Group(); g.add(m); fit(g, spots[k][3]);
        const wrap = new THREE.Group(); wrap.add(g);
        wrap.position.set(spots[k][0], spots[k][1], spots[k][2]);
        body.add(wrap);
        it.extra.push({obj:wrap, base:wrap.position.clone(), amp:.03, sp:1.1 + k * .2, spin:true});
        if(++n === L.sats.length) it.ready = true;
      }, () => { if(++n === L.sats.length) it.ready = true; }));
    }
    if(L.type === 'phone'){
      const w = .47 * SIZE, h = SIZE, d = .05;
      const shell = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, .055),
        new THREE.MeshStandardMaterial({color:0x1d1c19, roughness:.35, metalness:.2}));
      const sw = w - .035, sh = h - .06;
      const st = tex(L.screen);
      const vis = (sh / sw) * (579 / 1600);          // 画面に見える縦の割合
      st.repeat.set(1, vis); st.offset.set(0, 1 - vis);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh),
        new THREE.MeshBasicMaterial({map:st, toneMapped:false}));
      screen.position.z = d / 2 + .002;
      body.add(shell, screen);
      it.screen = {tex:st, vis};
      it.ready = true;
    }
    if(L.type === 'qr'){
      model(L.model, m => {
        const root = new THREE.Group(); root.add(m);
        // 実物は板3枚を三角に組み、四隅を留め具で挟む。寸法は実データ(mm)を正規化した値
        const k = 1 / 204, PW = 96 * k, PH = 190 * k, PT = 4 * k;
        const r = PW / (2 * Math.tan(Math.PI / 3));
        const wood = new THREE.MeshStandardMaterial({color:0xd2b186, roughness:.82});
        for(let j = 0; j < 3; j++){
          const a = j / 3 * TAU;
          const p = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, PT), wood);
          p.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
          p.rotation.y = a;
          root.add(p);
        }
        const view = new THREE.Group(); view.add(root);
        view.rotation.set(L.rx || 0, L.ry || 0, 0, 'YXZ');
        fit(view); body.add(view);
        it.ready = true;
      }, () => fallback(it));
    }
    if(L.type === 'model'){
      model(L.model, m => {
        if(L.rx) m.rotation.x = L.rx;
        if(L.ry) m.rotation.y = L.ry;
        const g = new THREE.Group(); g.add(m);
        if(L.rz) g.rotation.z = L.rz;
        if(L.plate){
          // 矢印の後ろに看板の板(先端を矢羽根の形に切る)
          const b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
          const w = sz.x * 1.25, h = sz.y * 1.3, tip = h * .42;
          const sh = new THREE.Shape();
          sh.moveTo(-w / 2 - tip, 0); sh.lineTo(-w / 2, h / 2); sh.lineTo(w / 2, h / 2);
          sh.lineTo(w / 2, -h / 2); sh.lineTo(-w / 2, -h / 2); sh.closePath();
          const depth = sz.z * .5;
          const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled:true, bevelSize:depth * .15, bevelThickness:depth * .15, bevelSegments:2}),
            new THREE.MeshStandardMaterial({color:L.plate, roughness:.7}));
          plate.position.set(c.x - tip * .25, c.y, b.min.z - depth);
          const outer = new THREE.Group(); outer.add(g, plate);
          fit(outer); body.add(outer);
        }else{
          fit(g); body.add(g);
        }
        it.ready = true;
      }, () => fallback(it));
    }
  }

  /* 当たり判定は箱で(三角形ごとの判定は重いので)。作品の準備ができたら、その作品の座標で作る */
  const hitMat = new THREE.MeshBasicMaterial({visible:false});
  function makeHit(it){
    const h = it.holder;
    const p = h.position.clone(), q = h.quaternion.clone(), s = h.scale.clone();
    h.position.set(0, 0, 0); h.quaternion.identity(); h.scale.setScalar(1);
    h.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(it.body);
    h.position.copy(p); h.quaternion.copy(q); h.scale.copy(s);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, .4), Math.max(size.y, .4), Math.max(size.z, .25)), hitMat);
    hit.position.copy(c);
    hit.userData.index = it.i;
    h.add(hit); it.hit = hit;
  }
  let reported = false;
  function checkReady(){
    items.forEach(it => { if(it.ready && !it.hit) makeHit(it); });
    if(!reported && items.every(it => it.hit)){ reported = true; hooks.onReady && hooks.onReady(); }
  }

  /* ---------- 置き場所(.slot)を読む ---------- */
  const slotEls = {};
  document.querySelectorAll('.slot').forEach(el => { slotEls[el.dataset.slot] = el; });
  const slots = {};
  let W = 1, H = 1;
  function measure(){
    const cr = canvas.getBoundingClientRect();
    W = cr.width; H = cr.height;
    if(!W || !H) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect, perPx = 2 * halfH / H;
    for(const [name, el] of Object.entries(slotEls)){
      const r = el.getBoundingClientRect();
      if(!r.width){ slots[name] = null; continue; }
      const cx = r.left + r.width / 2 - cr.left, cy = r.top + r.height / 2 - cr.top;
      slots[name] = {
        pos: new THREE.Vector3((cx / W * 2 - 1) * halfW, -(cy / H * 2 - 1) * halfH, 0),
        size: Math.max(r.width, r.height) * perPx,
        rot: THREE.MathUtils.degToRad(+el.dataset.r || 0),
      };
    }
  }

  /* ---------- 状態 ---------- */
  let index = 0, opened = false, started = false, t = 0, last = performance.now();
  let userRot = 0, userRotGoal = 0, userTilt = 0, hovered = -1;
  items.forEach(it => {
    it.st = {pos:new THREE.Vector3(), scale:1e-4, rot:0, prev:new THREE.Vector3()};
    it.slot = 'hidden'; it.leave = 'enter'; it.holder.visible = false;
  });
  const mod = n => ((n % N) + N) % N;

  function slotOf(i){
    const k = mod(i - index);
    if(opened) return k === 0 ? 'open' : 'hidden';
    if(k === 0) return '0';
    if(k === 1 && slots['1']) return '1';
    if(k === 2 && slots['2']) return '2';
    return 'hidden';
  }
  /* 並びを決め直す。come:入ってくる側 / go:出ていく側 */
  function assign(come, go){
    items.forEach(it => {
      const next = slotOf(it.i), was = it.slot;
      if(next !== 'hidden' && was === 'hidden'){
        const from = slots[come] || slots.enter;
        if(from && !it.holder.visible){ it.st.pos.copy(from.pos); it.st.scale = from.size * .5; it.st.rot = from.rot; }
        it.holder.visible = true;
      }
      if(next === 'hidden' && was !== 'hidden') it.leave = go;
      it.slot = next;
    });
  }

  /* ---------- 入力 ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(x, y){
    const r = canvas.getBoundingClientRect();
    ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = items.filter(it => it.hit && it.holder.visible && it.slot !== 'hidden').map(it => it.hit);
    const hit = ray.intersectObjects(targets, false)[0];
    return hit ? hit.object.userData.index : -1;
  }
  let down = null;
  canvas.addEventListener('pointerdown', e => {
    down = {x:e.clientX, y:e.clientY, lx:e.clientX, ly:e.clientY, moved:0};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if(down){
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      down.lx = e.clientX; down.ly = e.clientY; down.moved += Math.abs(dx) + Math.abs(dy);
      if(opened){ userRotGoal += dx * .012; userTilt = THREE.MathUtils.clamp(userTilt + dy * .006, -.6, .6); }
      return;
    }
    const h = pick(e.clientX, e.clientY);
    if(h !== hovered){ hovered = h; hooks.onHover && hooks.onHover(h, e.clientX, e.clientY); }
    else if(h >= 0) hooks.onHoverMove && hooks.onHoverMove(e.clientX, e.clientY);
    canvas.style.cursor = h >= 0 ? (opened ? 'grab' : 'pointer') : '';
  });
  const up = e => {
    if(!down) return;
    const d = down; down = null;
    if(d.moved < 6){
      const h = pick(e.clientX, e.clientY);
      if(h >= 0) hooks.onPick && hooks.onPick(h);
      else if(opened) hooks.onEmpty && hooks.onEmpty();
      return;
    }
    // 一覧ではスワイプで作品を送る(上へ払う=次)
    const dy = d.y - e.clientY, dx = d.x - e.clientX;
    if(!opened && Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) hooks.onSwipe && hooks.onSwipe(dy > 0 ? 1 : -1);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('pointerleave', () => { if(!down && hovered >= 0){ hovered = -1; hooks.onHover && hooks.onHover(-1); } });

  /* ---------- 毎フレーム ---------- */
  const _e = new THREE.Euler();
  function frame(now){
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    if(!reported) checkReady();
    const k = damp(opened ? 5 : 3.6, dt);
    userRot += (userRotGoal - userRot) * damp(7, dt);
    if(!down) userTilt += (0 - userTilt) * damp(2.5, dt);

    items.forEach(it => {
      if(!it.holder.visible) return;
      const hidden = it.slot === 'hidden';
      const target = hidden ? (slots[it.leave] || slots.enter) : slots[it.slot];
      if(!target){ it.holder.visible = false; return; }
      const st = it.st;
      st.prev.copy(st.pos);
      st.pos.lerp(target.pos, k);
      st.scale += (target.size * (hidden ? .45 : .92) - st.scale) * k;
      st.rot += (target.rot - st.rot) * k;
      if(hidden && st.pos.distanceTo(target.pos) < target.size * .08){ it.holder.visible = false; return; }

      const isOpen = it.slot === 'open', calm = isOpen ? .25 : 1, big = it.slot === '0' ? 1 : .7;
      const bob = reduce ? 0 : Math.sin(t * 1.1 + it.seed) * .04 * st.scale * calm;
      it.holder.position.set(st.pos.x, st.pos.y + bob, 0);
      const hov = it.i === hovered && !opened ? 1.05 : 1;
      it.holder.scale.setScalar(Math.max(st.scale * hov, 1e-4));
      const sway = reduce ? 0 : Math.sin(t * .55 + it.seed) * .42 * calm * big;
      const nod = reduce ? 0 : Math.sin(t * .7 + it.seed) * .07 * calm;
      _e.set(nod + (isOpen ? userTilt : 0), sway + (isOpen ? userRot : 0), st.rot, 'ZYX');
      it.holder.quaternion.setFromEuler(_e);

      // 動いた速さで紙に風を当てる
      it.speed = st.pos.distanceTo(st.prev) / Math.max(dt, 1e-3) / Math.max(st.scale, .1);

      it.extra.forEach(x => {
        x.obj.position.y = x.base.y + (reduce ? 0 : Math.sin(t * x.sp + it.seed) * x.amp);
        if(x.spin && !reduce) x.obj.rotation.y = Math.sin(t * .6 + x.sp) * .5;
      });
      if(it.screen){
        const s = it.screen, p = reduce ? 0 : (1 - Math.cos(t * .32)) / 2;
        s.tex.offset.y = (1 - s.vis) * (1 - p);
      }
    });

    papers.forEach(p => {
      const it = items[p.owner];
      if(!it || !it.holder.visible) return;
      const target = it.slot === 'open' ? .2 : .75 + Math.min(2.2, (it.speed || 0) * .35);
      p.amt += (target - p.amt) * damp(3, dt);
      bendPaper(p, reduce ? 0 : t);
    });

    renderer.render(scene, camera);
  }

  measure();
  return {
    frame,
    // 縦横が切り替わると置き場所の数が変わるので、並びも決め直す
    resize(){ measure(); if(started) assign('enter', 'exit'); },
    start(){ if(started) return; started = true; measure(); assign('enter', 'exit'); },
    go(i, dir){ index = mod(i); dir = dir || 1; assign(dir > 0 ? 'enter' : 'exit', dir > 0 ? 'exit' : 'enter'); },
    open(){ opened = true; userRot = userRotGoal = 0; userTilt = 0; hovered = -1; assign('enter', 'enter'); },
    close(){ opened = false; assign('enter', 'enter'); },
    // ドラッグで回したあとでも、いま近い面の「反対の面」の正面にそろえる
    flip(){ userRotGoal = (Math.round(userRotGoal / Math.PI) + 1) * Math.PI; },
    get face(){ return Math.abs(Math.round(userRotGoal / Math.PI)) % 2 ? 'back' : 'front'; },
    slotOf(i){ return items[i] ? items[i].slot : 'hidden'; },
    get index(){ return index; },
    get opened(){ return opened; },
  };
}
