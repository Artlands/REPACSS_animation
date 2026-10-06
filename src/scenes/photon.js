// Photon -> electron: p-n junction cross-section, cells -> modules -> arrays, inverter/MPPT, grid tie, bus -> PDU -> PSUs.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, rng, glowSprite, std, emis, flow, tube, curve, cable, solarArray, rack, panelMaterial, V, camPath, vlerp, textSprite } from '../lib.js';

const FINGERS = [-4.5, -1.5, 1.5, 4.5];

function bandSVG(p) {   // energy band diagram; p = 0..1 excitation progress
  const ey = lerp(150, 52, p);
  return `<svg width="380" height="210" viewBox="0 0 380 210" style="display:block">
  <rect x="20" y="20" width="250" height="34" fill="#3fd8ff22" stroke="#3fd8ff"/><text x="280" y="42" fill="#7fe6ff" font-size="16">Conduction band</text>
  <rect x="20" y="146" width="250" height="34" fill="#ff6a3d22" stroke="#ff6a3d"/><text x="280" y="168" fill="#ff9a7d" font-size="16">Valence band</text>
  <line x1="200" y1="58" x2="200" y2="142" stroke="#aab" stroke-dasharray="4 4"/><text x="208" y="105" fill="#fff" font-size="18" font-weight="700">E<tspan font-size="12" dy="4">g</tspan><tspan dy="-4"> ≈ 1.12 eV</tspan></text>
  <path d="M60 ${(150 + ey) / 2 + 30} q 12 -14 24 0 t 24 0 t 24 0" stroke="#ffd27a" fill="none" stroke-width="3" opacity="${p > 0 && p < 1 ? 1 : .35}"/><text x="56" y="${(150 + ey) / 2 + 58}" fill="#ffd27a" font-size="16">hν</text>
  <circle cx="140" cy="${ey}" r="9" fill="#3fd8ff"/><text x="132" y="${ey + 5}" fill="#002" font-size="13" font-weight="800">e⁻</text>
  <circle cx="140" cy="163" r="9" fill="none" stroke="#ff6a3d" stroke-width="3" opacity="${p}"/><text x="156" y="168" fill="#ff9a7d" font-size="14" opacity="${p}">h⁺</text>
  </svg>`;
}

function ivSVG(t) {   // I-V and P-V curves with the MPP marker
  const I = v => 9 * (1 - Math.exp((v - 0.68) / .035)) , pts = [], pp = [];
  for (let v = 0; v <= .68; v += .01) { pts.push(`${30 + v * 400},${180 - I(v) * 16}`); pp.push(`${30 + v * 400},${180 - I(v) * v * 30}`); }
  const vm = .575 + .012 * Math.sin(t * 3), x = 30 + vm * 400, yi = 180 - I(vm) * 16, yp = 180 - I(vm) * vm * 30;
  return `<svg width="340" height="210" viewBox="0 0 340 210" style="display:block">
  <line x1="30" y1="180" x2="320" y2="180" stroke="#667"/><line x1="30" y1="20" x2="30" y2="180" stroke="#667"/>
  <polyline points="${pts}" fill="none" stroke="#3fd8ff" stroke-width="3"/><polyline points="${pp}" fill="none" stroke="#ffb53c" stroke-width="3"/>
  <line x1="${x}" y1="20" x2="${x}" y2="180" stroke="#fff" stroke-dasharray="3 4" opacity=".6"/>
  <circle cx="${x}" cy="${yp}" r="7" fill="#fff"/><circle cx="${x}" cy="${yi}" r="5" fill="#3fd8ff"/>
  <text x="${x + 10}" y="${yp - 8}" fill="#fff" font-size="16" font-weight="700">MPP</text>
  <text x="40" y="40" fill="#3fd8ff" font-size="15">current I</text><text x="40" y="60" fill="#ffb53c" font-size="15">power P = I·V</text>
  <text x="270" y="198" fill="#99a" font-size="14">voltage</text></svg>`;
}

export default function photon(sc) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03060f);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .1, 600);
  scene.add(new THREE.AmbientLight(0xaabbdd, .7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(10, 20, 15); scene.add(dl);

  // ---------- A: cell cross-section ----------
  const A = new THREE.Group(); scene.add(A);
  const slab = (y0, y1, color, op, e = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(14, y1 - y0, 6),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: op, roughness: .3, metalness: .1, emissive: color, emissiveIntensity: e, depthWrite: false }));
    m.position.y = (y0 + y1) / 2; A.add(m); return m; };
  slab(-2.3, -2.0, 0x9aa0aa, 1);
  const pLayer = slab(-2.0, -0.2, 0x9a4a8a, .28);
  const junction = slab(-0.2, 0.2, 0x7fe6ff, .22, .6);
  const nLayer = slab(0.2, 0.85, 0x2f6fe0, .3);
  slab(0.85, 0.92, 0x0b1d50, .7);
  FINGERS.forEach(x => { const f = new THREE.Mesh(new THREE.BoxGeometry(.28, .3, 6.05), std(0xdfe4ea, { metalness: 1, roughness: .2 })); f.position.set(x, 1.05, 0); A.add(f); });
  const busbar = new THREE.Mesh(new THREE.BoxGeometry(13.9, .34, .5), std(0xdfe4ea, { metalness: 1, roughness: .2 })); busbar.position.set(0, 1.06, 3.2); A.add(busbar);
  // built-in field arrows (n -> p, pointing down)
  const arrows = [];
  for (let i = 0; i < 9; i++) for (const z of [-2, 2]) {
    const a = new THREE.ArrowHelper(V(0, -1, 0), V(-6 + i * 1.5, .25, z), .5, 0xffffff, .18, .12); A.add(a); arrows.push(a);
  }
  const lab3 = (txt, col, pos, h = .5) => { const s = textSprite(txt, { color: col, h }); s.position.copy(pos); A.add(s); return s; };
  const lN = lab3('n-type Si', '#8fb6ff', V(-8.9, .85, 0)), lJ = lab3('p-n junction', '#7fe6ff', V(-9.2, 0, 0)), lP = lab3('p-type Si', '#e3a2d6', V(-8.9, -1.1, 0)),
    lB = lab3('back contact', '#c0c4cc', V(-9.2, -2.15, 0), .4), lF = lab3('front fingers', '#dfe4ea', V(4.5, 1.8, -2.6), .4);
  const albl = [lN, lJ, lP, lB, lF];

  // photon / electron / hole pool driven by a precomputed event list
  const r = rng(5), events = [{ t0: 3.4, x: -.8, z: 0, big: true }];
  for (let t0 = sc.s(2) + 2.6; t0 < sc.s(4) + 1; t0 += .16 + r() * .22) events.push({ t0, x: (r() - .5) * 12, z: (r() - .5) * 4.6 });
  const POOL = 48, LIFE = 4.2;
  const slots = Array.from({ length: POOL }, () => {
    const ph = glowSprite(0xffe08a, .8), e = glowSprite(C.elec, .55), h = glowSprite(C.hole, .55), core = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    e.add(core); A.add(ph, e, h); return { ph, e, h };
  });

  // ---------- B: cells -> module -> array ----------
  const B0 = V(80, 0, 0), B = new THREE.Group(); B.position.copy(B0); scene.add(B);
  const cellGeo = new THREE.BoxGeometry(1.5, .06, 1.5), cellMat = panelMaterial();
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, 60); B.add(cells);
  const modBack = new THREE.Mesh(new THREE.BoxGeometry(6 * 1.6 + .3, .05, 10 * 1.6 + .3), std(0xc9ccd2, { metalness: .9 })); modBack.position.y = -.05; B.add(modBack);
  const arr = solarArray(5, 12, .5); arr.scale.setScalar(5.6); arr.position.set(-6, -6, -95); B.add(arr);
  const stringWire = []; for (let i = 0; i < 6; i++) { const cv = curve([-4 + i * 1.6, .1, -8], [-4 + i * 1.6, .1, 8]); const tb = tube(cv, C.elec, .04, 0); B.add(tb); stringWire.push(tb); }

  // ---------- C: one left-to-right chain: PV string → inverter → switchgear (+ battery, generator, grid) → UPS → PDU → rack PSUs ----------
  const backup = [];   // battery/generator boxes, labels and feeders (shown from sentence 6)
  const C0 = V(170, 0, 0), Cg = new THREE.Group(); Cg.position.copy(C0); scene.add(Cg);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 80), new THREE.MeshStandardMaterial({ color: 0x0c1324, roughness: .9 })); floor.rotation.x = -Math.PI / 2; Cg.add(floor);
  const cHemi = new THREE.HemisphereLight(0xc8d6ff, 0x101420, .9); cHemi.position.copy(C0); scene.add(cHemi);
  const mini = solarArray(2, 8, .55); mini.position.set(-27, 0, -1.5); Cg.add(mini);
  const box = (w, h, d, col, pos, txt) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(col, { metalness: .4 })); m.position.copy(pos); Cg.add(m);
    if (txt) { const sp = textSprite(txt, { color: '#fff', h: .5 }); sp.position.set(pos.x, pos.y + h / 2 + .6, pos.z); Cg.add(sp); } return m; };
  box(1.6, 2.6, .9, 0xe8ebef, V(-10, 1.3, 0), 'Inverter · MPPT');
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.9, .45), emis(C.elec, 1.2)); scr.position.set(-10, 1.8, .46); Cg.add(scr);
  box(3.2, 2.4, 1.4, 0x8a919c, V(0, 1.2, 0), 'Switchgear · AC bus');
  // utility feed arriving from behind on wooden poles
  for (let i = 0; i < 3; i++) { const z = -10 - i * 9; const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 8, 8), std(0x6e5a44, { metalness: 0 })); pole.position.set(0, 4, z); Cg.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, .15, .15), std(0x6e5a44, { metalness: 0 })); arm.position.set(0, 7.6, z); Cg.add(arm); }
  for (const dx of [-.9, 0, .9]) Cg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3([V(dx, 7.7, -28), V(dx, 7.4, -19), V(dx, 7.7, -10), V(dx * .4, 2.4, -.7)]).getPoints(60)), new THREE.LineBasicMaterial({ color: 0x9aa0aa })));
  const gridT = textSprite('Utility grid', { color: '#e4e8f0', h: .5 }); gridT.position.set(0, 8.6, -10); Cg.add(gridT);
  box(.9, 2.6, .9, 0x2a3140, V(9, 1.3, 0), 'PDU');
  box(1.2, 2.2, 1.2, 0x2d3a52, V(5, 1.1, 0), 'UPS');
  // battery + generator appear when the narration brings them onto the bus
  for (const [w, h, d, col, pos, txt] of [[2.6, 1.8, 1.6, 0xe9e3d2, V(-6, .9, -7), 'Battery · 550 kWh'], [3, 1.8, 1.4, 0xe4e4df, V(6.5, .9, -8), 'Generator · 500 kW']]) { box(w, h, d, col, pos, txt); backup.push(...Cg.children.slice(-2)); }
  const rk = rack(); rk.position.set(15, 0, 0); Cg.add(rk);
  const rkT = textSprite('Server rack', { color: '#fff', h: .5 }); rkT.position.set(15, rk.height + .6, 0); Cg.add(rkT);
  // redundant PSUs on the rear of one node
  const node = rk.nodes[7]; const psus = [];
  for (const dx of [-.36, .36]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.16, .1, .06), emis(0x5dff8a, 1)); p.position.set(dx, 0, -.83); node.add(p); psus.push(p); }
  const psuLbl = textSprite('2 × PSU (redundant)', { color: '#7dffa5', h: .16 }); psuLbl.position.set(0, .3, -1.0); node.add(psuLbl);

  // DC flat line and AC sine "waveform" displays floating over the cables
  const mkWave = (n) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); return g; };
  const dcG = mkWave(2), acG = mkWave(160);
  const dcL = new THREE.Line(dcG, new THREE.LineBasicMaterial({ color: 0x9feeff })); const acL = new THREE.Line(acG, new THREE.LineBasicMaterial({ color: 0xffe2a0 }));
  Cg.add(dcL, acL);
  const dcT = textSprite('DC', { color: '#9feeff', h: .55 }); dcT.position.set(-15, 4.3, 0); Cg.add(dcT);
  const acT = textSprite('AC · 60 Hz', { color: '#ffe2a0', h: .55 }); acT.position.set(-5, 4.6, 0); Cg.add(acT);
  dcG.attributes.position.array.set([-19, 3.6, 0, -11.2, 3.6, 0]);

  const lines = [
    [cable([-18.5, .3, 0], [-10.8, .3, .2], .6), C.elec],
    [cable([-9.2, .3, .2], [-1.6, .3, .2], .6), C.sun],
    [curve([0, 7.6, -27], [0, 7.4, -19], [0, 7.6, -10], [0, 2.4, -.7]), 0xe4e8f0],
    [cable([1.6, .3, .2], [4.4, .3, .2], .6), C.sun],
    [cable([5.6, .3, .2], [8.6, .3, .2], .6), C.sun],
    [cable([-4.7, .3, -7], [-1.2, .3, -.7], .5), 0x7dffa5],
    [cable([5, .3, -8], [1.2, .3, -.7], .7), 0xffb07a],
    [cable([9.4, .3, .2], [14.5, .3, -.4], .6), C.sun],
  ].map(([cv, col], i) => { const f = flow(cv, 40, col, .5, 40 + i), tb = tube(cv, col, .05, .3); Cg.add(f, tb); if (i >= 5) backup.push(tb); return f; });

  const keys = [
    [0, V(-3, 9, 22), V(0, -.5, 0)],
    [sc.s(1) + 2, V(-1, 4.5, 17), V(-.5, -.4, 0)],
    [sc.s(2) + 2, V(-3, 2.6, 15), V(-1, -.5, 0)],
    [sc.s(3) + 1, V(2, 1.4, 14.5), V(0, -.6, 0)],
    [sc.s(3) + 5.5, V(1, 5, 17), V(0, -.5, 0)],
    [sc.s(4) + .8, V(B0.x + 4, 9, 13), V(B0.x, 0, 0)],
    [sc.s(4) + 3.2, V(B0.x + 2, 28, 40), V(B0.x - 4, -4, -30)],
    [sc.s(5) + .6, V(C0.x - 14, 6, 15), V(C0.x - 14, 2, 0)],
    [sc.s(6) - .3, V(C0.x - 9, 6, 15), V(C0.x - 10, 2, 0)],
    [sc.s(6) + 2.5, V(C0.x + 8, 9, 14), V(C0.x, 3, -8)],
    [sc.s(7) + .2, V(C0.x + 6, 6, 13), V(C0.x + 11, 1.8, 0)],
    [sc.s(7) + 1.6, V(C0.x + 7, 5.5, 12), V(C0.x + 12, 1.8, 0)],
    [sc.s(7) + 1.65, V(C0.x + 13.5, 4, -8.5), V(C0.x + 15, 1.6, -.6)],   // cut to the rear of the rack (no fly-through)
    [sc.s(7) + 3.5, V(C0.x + 12.4, 3.4, -6.5), V(C0.x + 15, 1.6, -.6)],
    [sc.dur, V(C0.x + 12.9, 3, -5.6), V(C0.x + 15, 1.6, -.6)],
  ];

  const v = V(0, 0, 0);
  function update(t) {
    const s = sc.s;
    camPath(camera, t, keys);
    // A: carriers
    const fieldOn = ramp(t, s(3), 1);
    arrows.forEach((a, i) => { a.visible = fieldOn > .02; a.setColor(new THREE.Color(0xffffff).multiplyScalar(.3 + .7 * fieldOn * (.6 + .4 * Math.sin(t * 4 - i)))); });
    junction.material.emissiveIntensity = .4 + 1.2 * fieldOn;
    albl.forEach((l, i) => l.material.opacity = ramp(t, 1 + i * .3, .6));
    slots.forEach(o => { o.ph.visible = o.e.visible = o.h.visible = false; });
    const used = new Set();
    for (let k = events.length - 1; k >= 0; k--) {
      const ev = events[k], slot = slots[k % POOL], u = t - ev.t0;
      if (u < 0 || u > LIFE || used.has(slot)) continue;
      used.add(slot);
      const fly = ev.big ? 1.8 : .7;
      if (u < fly) {   // photon descending with a wiggle
        const q = u / fly; slot.ph.visible = true; slot.ph.scale.setScalar(ev.big ? 1.3 : .8);
        slot.ph.position.set(ev.x + 7 * (1 - q) + Math.sin(q * 30) * .12, 10 * (1 - q), ev.z + 2 * (1 - q));
      } else {
        const q = (u - fly) / (LIFE - fly), fx = FINGERS.reduce((a, b) => Math.abs(b - ev.x) < Math.abs(a - ev.x) ? b : a);
        slot.e.visible = slot.h.visible = q < 1;
        // electron: up to n-layer surface, over to the nearest finger, then along it to the busbar
        const e1 = ramp(q, 0, .3), e2 = ramp(q, .3, .3), e3 = ramp(q, .6, .4);
        slot.e.position.set(lerp(ev.x, fx, e2), lerp(0, .95, e1) + .15 * e2, lerp(ev.z, 3.2, e3));
        slot.h.position.set(ev.x, lerp(0, -1.95, ramp(q, 0, .55)), ev.z);
        slot.h.material.opacity = 1 - ramp(q, .7, .3);
      }
    }
    const big = t - 3.4;
    const flash = win(big, 1.7, 2.6, .3);
    // B: cells assemble, wires light, array appears
    const d = new THREE.Object3D();
    for (let i = 0; i < 60; i++) {
      const c = i % 6, rr = i / 6 | 0, a = ramp(t, s(4) - .6 + i * .02, .4);
      d.position.set(-4 + c * 1.6, 0, -7.2 + rr * 1.6); d.scale.setScalar(Math.max(a, .001)); d.updateMatrix(); cells.setMatrixAt(i, d.matrix);
    }
    cells.instanceMatrix.needsUpdate = true;
    stringWire.forEach((w, i) => w.material.opacity = .8 * ramp(t, s(4) + .6 + i * .1, .4));
    arr.visible = ramp(t, s(4) + 1.4, 1.2) > .02; arr.scale.setScalar(5.6 * Math.max(.001, ramp(t, s(4) + 1.4, 1.2)));
    // C: waveforms, flows
    const ac = acG.attributes.position.array;
    for (let i = 0; i < 160; i++) { const x = -8.8 + i / 159 * 6.8; ac.set([x, 3.6 + .6 * Math.sin(i / 159 * 6 * Math.PI - t * 6), 0], i * 3); }
    acG.attributes.position.needsUpdate = true;
    lines.forEach((f, i) => f.update(t, .25, i === 2 ? .5 * ramp(t, s(6), 1) : i >= 5 ? .5 * ramp(t, s(6) + .6 + (i - 5) * .6, 1) : ramp(t, s(5) - 1, 1)));
    backup.forEach(o => o.visible = t > sc.s(6) - .4);
    psus.forEach((p, i) => p.material.emissiveIntensity = .6 + ramp(t, s(7) + 2, 1) * (.6 + .4 * Math.sin(t * 5 + i * 3)));

    // overlay
    ui.el('ph-k', 'kicker', 'From photons', 90, 70, win(t, .4, sc.dur, .6));
    ui.el('ph-t', 'h1', ['Photovoltaic conversion', 'Photovoltaic conversion', 'Cells → modules → arrays', 'Power conditioning'][t < s(4) ? 0 : t < s(5) ? 2 : 3], 90, 104, win(t, .4, sc.dur, .6), { fontSize: '50px' });
    ui.el('ph-e', 'card mono', `<span style="color:#ffd27a">E = hν</span> &gt; E<sub>g</sub> ≈ 1.12 eV &nbsp;⟶&nbsp; <span style="color:#7fe6ff">e⁻</span> + <span style="color:#ff9a7d">h⁺</span>`, 90, 880, win(t, s(2) + .3, s(4), .5), { fontSize: '30px' });
    ui.el('ph-b', 'card', `<div class="cap" style="margin:0 0 6px">Silicon band diagram</div>${bandSVG(ramp(t, s(2) + 2.2, 1.2))}`, 1440, 600, win(t, s(2) + .5, s(3) + 1.5, .5));
    ui.el('ph-f', 'card', `<div class="cap" style="margin:0">Built-in field</div><div style="font-size:23px;margin-top:8px;line-height:1.5">E-field points n → p<br><span style="color:#7fe6ff">electrons</span> drift up to the n-side<br><span style="color:#ff9a7d">holes</span> drift down to the p-side<br>⇒ photocurrent (DC), ≈0.6 V per cell</div>`, 1360, 640, win(t, s(3) + 1.5, s(4), .5));
    ui.el('ph-hv', 'chip', 'photon · hν', 980, 330, win(big, .2, 1.8, .3), { color: '#ffd27a' });
    ui.el('ph-c', 'card', `<div class="cap" style="margin:0">Series &amp; parallel wiring</div><div style="font-size:23px;margin-top:8px;line-height:1.5">cells in series → module voltage<br>modules in strings → array voltage<br>strings in parallel → array current</div>`, 1360, 700, win(t, s(4) + .3, s(5), .5));
    ui.el('ph-iv', 'card', `<div class="cap" style="margin:0 0 6px">Maximum power point tracking</div>${ivSVG(t)}`, 1440, 640, win(t, s(5) + 1, s(6), .5));
    ui.el('ph-w', 'card', `<div class="cap" style="margin:0">One AC bus</div><div style="font-size:23px;margin-top:8px;line-height:1.5">battery · generator · utility grid<br>cover whatever the sun cannot</div>`, 90, 820, win(t, s(6) + .6, s(7), .5));
    ui.el('ph-p', 'card', `<div class="cap" style="margin:0">Power distribution</div><div style="font-size:23px;margin-top:8px;line-height:1.5">switchgear → UPS → PDU → rack<br>every 2U node: <b style="color:#7dffa5">redundant power supplies</b></div>`, 90, 820, win(t, s(7) + .5, sc.dur, .5));
    if (flash > 0) ui.el('ph-x', 'chip', 'electron–hole pair', 1000, 520, flash, { color: '#7fe6ff' });
  }
  return { scene, camera, update, env: .25, bloom: { strength: .9, radius: .5, threshold: .7 } };
}
