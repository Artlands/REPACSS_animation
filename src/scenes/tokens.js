// Compute -> tokens: GPU die, tensor-core matrix multiply, transformer layers, softmax, next-token generation.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, rng, std, emis, glowSprite, textSprite, V, camPath, ease } from '../lib.js';

const PROMPT = 'Where does REPACSS get its power?';
const OUT = [' From', ' a', ' 200', ' kW', ' solar', ' array', ',', ' backed', ' by', ' the', ' grid', '.'];
const CANDS = [[' From', .62], [' It', .17], [' REPACSS', .09], [' Solar', .07], [' The', .05]];

export default function tokens(sc) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05040c);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .1, 400);
  scene.add(new THREE.AmbientLight(0xb0a0ff, .5)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(5, 15, 10); scene.add(dl);

  // GPU die: 12x12 SMs, each with 4 tensor-core tiles
  const die = new THREE.Mesh(new THREE.BoxGeometry(26, .3, 26), std(0x14161f, { metalness: .9, roughness: .3 })); die.position.y = -.2; scene.add(die);
  const N = 12, tc = new THREE.InstancedMesh(new THREE.BoxGeometry(.85, .12, .85), new THREE.MeshBasicMaterial({ color: 0xffffff }), N * N * 4);
  const d = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let q = 0; q < 4; q++) {
    d.position.set(-12 + i * 2.05 + (q % 2) * .95, 0, -12 + j * 2.05 + (q >> 1) * .95); d.updateMatrix(); tc.setMatrixAt(k, d.matrix); tc.setColorAt(k++, new THREE.Color(0));
  }
  scene.add(tc);
  const hbmStacks = []; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const h = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 4.5), std(0x2a2d3a, { metalness: .8 })); h.position.set(s * 16.5, .3, -8 + i * 8); scene.add(h); hbmStacks.push(h); }
  const hbmT = textSprite('HBM3', { color: '#9aa3c0', h: .8 }); hbmT.position.set(-16.5, 2, 8.8); scene.add(hbmT);

  // matrix multiply above the die: W(8x8) · X(8x4) = Y(8x4)
  const M = new THREE.Group(); M.position.set(0, 7, 0); scene.add(M);
  const cubeGeo = new THREE.BoxGeometry(.8, .8, .8);
  const mat = (rows, cols, x0, color) => {
    const im = new THREE.InstancedMesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92 }), rows * cols);
    let n = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { d.position.set(x0 + c, 3.5 - r, 0); d.updateMatrix(); im.setMatrixAt(n, d.matrix); im.setColorAt(n++, new THREE.Color(color).multiplyScalar(.25)); }
    im.rows = rows; im.cols = cols; im.base = new THREE.Color(color); M.add(im); return im;
  };
  const Wm = mat(8, 8, -11, C.sun), Xm = mat(8, 4, -1, C.elec), Ym = mat(8, 4, 6.5, C.tok);
  const lbl = (t, x, y, col) => { const s = textSprite(t, { color: col, h: .9 }); s.position.set(x, y, 0); M.add(s); return s; };
  lbl('W  (weights)', -7.5, 5.2, '#ffc46b'); lbl('X  (activations)', .5, 5.2, '#7fe6ff'); lbl('Y = W·X', 8, 5.2, '#cdb6ff');
  lbl('·', -2, 0, '#fff'); lbl('=', 4.8, 0, '#fff');

  // transformer stack
  const T0 = V(60, 0, 0), T = new THREE.Group(); T.position.copy(T0); scene.add(T);
  const layers = [];
  for (let i = 0; i < 8; i++) {
    const att = i % 2 === 0;
    const p = new THREE.Mesh(new THREE.BoxGeometry(10, .35, 6), new THREE.MeshStandardMaterial({ color: att ? 0x4b3a9a : 0x23507a, transparent: true, opacity: .55, emissive: att ? C.tok : C.elec, emissiveIntensity: .15, depthWrite: false }));
    p.position.y = i * 1.5; T.add(p); layers.push(p);
    const s = textSprite(att ? 'self-attention' : 'feed-forward', { color: att ? '#cdb6ff' : '#9fdcff', h: .45 }); s.position.set(-7.2, i * 1.5, 0); T.add(s);
  }
  const beads = Array.from({ length: 6 }, (_, i) => { const b = glowSprite(i % 2 ? C.elec : C.tok, .9); T.add(b); return b; });
  // softmax bars
  const bars = CANDS.map(([w, p], i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 1.1), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: i ? 0x6a5aa8 : 0xd7c4ff, emissiveIntensity: i ? .8 : 2 }));
    b.position.set(-4 + i * 2, 13, 0); T.add(b);
    const s = textSprite(w.trim(), { color: i ? '#b8b0d8' : '#ffffff', h: .55, mono: true }); s.position.set(-4 + i * 2, 12.2, 1); T.add(s); b.lbl = s;
    const pv = textSprite(p.toFixed(2), { color: '#d6ccff', h: .45, mono: true }); T.add(pv); b.pv = pv; b.p = p; return b;
  });
  const flyToks = OUT.map(w => { const f = textSprite(w.replace(' ', '▁'), { color: '#ffffff', h: .9, bg: 'rgba(120,80,230,.75)', mono: true }); T.add(f); return f; });
  const topLbls = OUT.map(w => { const l = textSprite(w.trim(), { color: '#ffffff', h: .55, mono: true }); l.position.set(-4, 12.2, 1); T.add(l); return l; });

  const s = sc.s;
  const keys = [
    [0, V(0, 40, 26), V(0, 0, 0)],
    [s(1) - .5, V(4, 22, 22), V(0, 2, 0)],
    [s(1) + 1.5, V(-2, 12, 27), V(-1, 7.5, 0)],
    [s(2) - .4, V(1, 11, 25), V(-1, 7.5, 0)],
    [s(2) + 1.4, V(T0.x + 8, 10, 26), V(T0.x - 7, 8, 0)],
    [s(3) + 1, V(T0.x + 4, 13, 25), V(T0.x - 8, 10, 0)],
    [sc.dur, V(T0.x, 15, 29), V(T0.x - 8, 10, 0)],
  ];
  const col = new THREE.Color();

  function update(t) {
    camPath(camera, t, keys);
    // tensor cores: diagonal waves of activity
    let n = 0; const on = ramp(t, .3, 1.5);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let q = 0; q < 4; q++) {
      const w = Math.max(0, Math.sin((i + j) * .55 - t * 5 + q)) ** 3;
      tc.setColorAt(n++, col.setRGB(.05 + w * .45, .08 + w * 1.0, .1 + w * .85).multiplyScalar(on));
    }
    tc.instanceColor.needsUpdate = true;
    // matrix multiply: sweep (row r of W) x (col c of X) -> Y[r][c]
    const mOn = ramp(t, s(1), 1); M.visible = mOn > 0; M.scale.setScalar(Math.max(.001, mOn));
    const step = Math.floor(Math.max(0, t - s(1) - 1) * 6), done = Math.min(step, 32), r0 = (done % 32) / 4 | 0, c0 = done % 4;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) Wm.setColorAt(r * 8 + c, col.copy(Wm.base).multiplyScalar(r === r0 && done < 32 ? 1.3 : .3));
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      Xm.setColorAt(r * 4 + c, col.copy(Xm.base).multiplyScalar(c === c0 && done < 32 ? 1.3 : .3));
      const idx = r * 4 + c; Ym.setColorAt(idx, col.copy(Ym.base).multiplyScalar(idx < done ? 1.1 : .1));
    }
    Wm.instanceColor.needsUpdate = Xm.instanceColor.needsUpdate = Ym.instanceColor.needsUpdate = true;
    // forward pass: beads climb through the layers, repeating per token
    const tok0 = s(2) + 1.4, per = 2.6, ti = Math.max(0, Math.floor((t - tok0) / per)), u = ((t - tok0) / per) % 1;
    const running = t > tok0;
    beads.forEach((b, i) => { b.visible = running && u < .6; b.position.set(-2.5 + i, ease(u / .6) * 11, 0); });
    layers.forEach((l, i) => l.material.emissiveIntensity = .15 + (running ? 1.4 * Math.max(0, 1 - Math.abs(ease(u / .6) * 11 - i * 1.5) / 1.5) : 0));
    const barOn = running ? ramp(u, .55, .1) : 0, shuffle = rng(ti + 3);
    bars.forEach((b, i) => {
      const p = i === 0 ? b.p : b.p * (.5 + shuffle()); const h = Math.max(.01, p * 6 * barOn);
      b.scale.y = h; b.position.y = 12.6 + h / 2; b.visible = barOn > 0;
      b.pv.position.set(b.position.x, 13 + h + .4, 0); b.pv.visible = barOn > .5; b.lbl.visible = barOn > 0 && i > 0; b.material.emissiveIntensity = i ? .5 : .9;
    });
    const cur = Math.min(ti, OUT.length - 1);
    topLbls.forEach((l, i) => l.visible = barOn > 0 && i === cur);
    flyToks.forEach((f, i) => {
      f.visible = running && u > .72 && i === cur && ti < OUT.length;
      f.position.set(lerp(-4, 8, ramp(u, .78, .2)), lerp(19.5, 22, ramp(u, .78, .2)), 0);
      f.material.opacity = 1 - ramp(u, .93, .07);
    });

    // overlay
    ui.el('t-k', 'kicker', 'Compute → tokens', 90, 70, win(t, .4, sc.dur, .6), { color: 'var(--tok)' });
    ui.el('t-t', 'h1', ['Inside an H100: tensor cores', 'Matrix multiply · W·X', 'Transformer forward pass', 'Transformer forward pass'][t < s(1) ? 0 : t < s(2) + 1 ? 1 : 2], 90, 104, win(t, .4, sc.dur, .6), { fontSize: '50px' });
    const gen = running ? Math.min(OUT.length, ti + (u > .85 ? 1 : 0)) : 0;
    const txt = `<span style="color:#9fb0cc">&gt; ${PROMPT}</span><br><span style="color:#e6dcff">${OUT.slice(0, gen).map((w, i) => `<span style="background:${i === gen - 1 ? 'rgba(150,110,255,.45)' : 'rgba(150,110,255,.15)'};border-radius:4px;padding:0 2px;margin-right:1px">${w.replace(' ', '&nbsp;')}</span>`).join('')}<span style="opacity:${Math.sin(t * 8) > 0 ? 1 : 0}">▍</span></span>`;
    ui.el('t-c', 'card mono', txt, 90, 820, win(t, s(2) + .8, s(4) + 1, .5), { fontSize: '30px', lineHeight: '1.6', width: '760px', whiteSpace: 'normal' });
    ui.el('t-f', 'card', `<div class="cap" style="margin:0">Each tensor-core op</div><div class="mono" style="font-size:26px;margin-top:8px">D = A·B + C &nbsp;<span style="color:var(--dim)">(low-precision MMA)</span></div>`, 1260, 840, win(t, s(1) + .5, s(2) + .5, .5));
    ui.el('t-s', 'card', `<div class="cap" style="margin:0">Next-token distribution</div><div class="mono" style="font-size:26px;margin-top:8px">p(token | context) = softmax(z)</div>`, 1260, 840, win(t, s(2) + 4, s(4), .5));
    const ch = ramp(t, s(4) + .2, .6), items = [['☀', 'Photons', 'var(--sun)'], ['e⁻', 'Electrons', 'var(--elec)'], ['∑', 'FLOPs', '#8dff6f'], ['▁tok', 'Tokens', 'var(--tok)']];
    items.forEach(([ic, name, colr], i) => ui.el('t-ch' + i, 'card', `<div class="big" style="color:${colr};font-size:64px">${ic}</div><div class="cap" style="font-size:22px;color:#fff">${name}</div>`, 250 + i * 390, 420, ramp(t, s(4) + .2 + i * .9, .5) * (1 - ramp(t, sc.dur - 1.2, .6)), { width: '200px', textAlign: 'center' }));
    for (let i = 0; i < 3; i++) ui.el('t-ar' + i, 'h1', '→', 512 + i * 390, 455, ramp(t, s(4) + .6 + i * .9, .4) * (1 - ramp(t, sc.dur - 1.2, .6)), { fontSize: '70px', color: '#8090b0' });
    ui.el('t-dim', '', '', 0, 0, ch * .55 * (1 - ramp(t, sc.dur - 1.2, .6)), { width: '1920px', height: '1080px', background: '#000', zIndex: -1 });
  }
  return { scene, camera, update, bloom: { strength: 1.0, radius: .5, threshold: .65 } };
}
