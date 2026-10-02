// Shared helpers: easing, overlay UI, sprites, particles, and reusable 3D builders.
import * as THREE from 'three';

export const W = 1920, H = 1080;
export const C = { sun: 0xffb53c, elec: 0x3fd8ff, tok: 0xb18cff, red: 0xe0202f, hole: 0xff6a3d, gpu: 0x76e05a, store: 0xffc857 };

// ---------- time / easing ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** 0→1 over [a, a+d] */
export const ramp = (t, a, d = 1) => smooth((t - a) / d);
/** opacity window: fades in at a, out at b, with fade length f */
export const win = (t, a, b, f = 0.5) => Math.min(ramp(t, a, f), 1 - ramp(t, b - f, f));
export const vlerp = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);

export function rng(seed = 1) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- overlay UI (immediate mode: every frame re-declares what is visible) ----------
const root = () => document.getElementById('ui');
const els = new Map(); const touched = new Set();
export const ui = {
  begin() { touched.clear(); },
  end() { for (const [id, e] of els) e.style.display = touched.has(id) ? '' : 'none'; },
  /** place a div at (x,y) px; style: extra css object; op: opacity */
  el(id, cls, html, x, y, op = 1, style = {}) {
    if (op <= 0.001) return null;
    let e = els.get(id);
    if (!e) { e = document.createElement('div'); e.className = cls; root().appendChild(e); els.set(id, e); }
    if (e._h !== html) { e.innerHTML = html; e._h = html; }
    touched.add(id);
    e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.opacity = op;
    for (const k in style) e.style[k] = style[k];
    return e;
  },
  /** label pinned to a 3D point */
  label(id, html, pos, camera, op = 1, color = '#fff') {
    camera.updateMatrixWorld();
    const p = pos.clone().project(camera);
    if (p.z > 1) return;
    this.el(id, 'lab', html, (p.x * .5 + .5) * W, (-p.y * .5 + .5) * H, op, { color });
  },
  /** section header used by the challenge scenes */
  header(id, kicker, title, op, color = 'var(--sun)') {
    this.el(id + 'k', 'kicker', kicker, 90, 70, op, { color });
    this.el(id + 't', 'h1', title, 90, 104, op, { fontSize: '52px' });
  },
};

// ---------- textures & sprites ----------
let _glow;
export function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.2, 'rgba(255,255,255,.85)');
  gr.addColorStop(.5, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (_glow = new THREE.CanvasTexture(c));
}

export function glowSprite(color, size = 1, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
}

/** text rendered into a sprite (always faces camera). h = world height */
export function textSprite(text, { color = '#fff', h = 1, font = '600 96px "Avenir Next", Helvetica', bg = null, pad = 24, mono = false } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  if (mono) font = font.replace(/"Avenir Next", Helvetica/, 'Menlo, monospace');
  g.font = font; const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w; c.height = 140;
  g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center';
  if (bg) { g.fillStyle = bg; roundRect(g, 0, 0, w, 140, 28); g.fill(); }
  g.fillStyle = color; g.fillText(text, w / 2, 74);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(h * w / 140, h, 1); return s;
}

/** text on a flat plane (fixed orientation) */
export function textPlane(text, opts = {}) {
  const s = textSprite(text, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.scale.x, s.scale.y),
    new THREE.MeshBasicMaterial({ map: s.material.map, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  return m;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- particles flowing along a curve ----------
export function flow(curve, n, color, size = .4, seed = 3) {
  const r = rng(seed), offs = Float32Array.from({ length: n }, () => r());
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex(), color, size, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  const v = new THREE.Vector3();
  pts.update = (t, speed = .15, density = 1) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const u = (((offs[i] + t * speed) % 1) + 1) % 1;
      if (i / n > density) { a[i * 3 + 1] = -1e4; continue; }
      curve.getPointAt(u, v); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

export function tube(curve, color, r = .05, opacity = .5) {
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
}

export const curve = (...pts) => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));

/** right-angle-ish cable from a to b, rising to height h */
export function cable(a, b, h = 1) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  return new THREE.CatmullRomCurve3([A, A.clone().setY(A.y + h), vlerp(A, B, .5).setY(Math.max(A.y, B.y) + h), B.clone().setY(B.y + h), B], false, 'catmullrom', .2);
}

// ---------- 3D builders ----------
export function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .3, ...o }); }
export function emis(color, intensity = 2) { return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity }); }

let _panelTex;
function panelTex() {
  if (_panelTex) return _panelTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#0b1f4a'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 12; j++) {
    const gr = g.createLinearGradient(0, j * 42, 0, j * 42 + 40);
    gr.addColorStop(0, '#1d3f8f'); gr.addColorStop(1, '#0f2560');
    g.fillStyle = gr; g.fillRect(i * 42 + 3, j * 42 + 3, 38, 38);
    g.fillStyle = 'rgba(200,220,255,.35)'; g.fillRect(i * 42 + 3, j * 42 + 13, 38, 1); g.fillRect(i * 42 + 3, j * 42 + 27, 38, 1);
  }
  _panelTex = new THREE.CanvasTexture(c); _panelTex.colorSpace = THREE.SRGBColorSpace; return _panelTex;
}

export function panelMaterial() {
  return new THREE.MeshStandardMaterial({ map: panelTex(), roughness: .25, metalness: .6, emissive: 0x0a1a40, emissiveIntensity: .4 });
}

/** ground-mount PV field facing +z (south): panels tilted up toward the sun on short front / tall rear posts.
 *  high = modules stacked up the slope per rack (2 = two-high portrait racks); pitch = row spacing */
export function solarArray(rows = 6, cols = 14, tilt = .55, { high = 1, pitch = 3.2 } = {}) {
  const geo = new THREE.BoxGeometry(1, .04, 1.9);
  const m = new THREE.InstancedMesh(geo, panelMaterial(), rows * cols * high);
  const d = new THREE.Object3D(); let k = 0;
  const hc = .9 + (high - 1) * .7;   // rack centre height
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (let h = 0; h < high; h++) {
    const u = (h - (high - 1) / 2) * 1.95;
    d.position.set(c * 1.05, hc - u * Math.sin(tilt), r * pitch + u * Math.cos(tilt)); d.rotation.set(tilt, 0, 0); d.updateMatrix(); m.setMatrixAt(k++, d.matrix);
  }
  const g = new THREE.Group(); g.add(m);
  const L = high * .975 - .175, dz = L * Math.cos(tilt), dy = L * Math.sin(tilt), steel = std(0x9aa0a8, { metalness: .8 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, 1, .06), steel, rows * Math.ceil(cols / 3) * 2);
  k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c += 3) for (const s of [1, -1]) {
    const h = hc - s * dy - .02; d.position.set(c * 1.05, h / 2 + .02, r * pitch + s * dz); d.rotation.set(0, 0, 0); d.scale.set(1, h, 1); d.updateMatrix(); posts.setMatrixAt(k++, d.matrix);
  }
  d.scale.set(1, 1, 1);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(cols * 1.05, .05, .05), steel, rows * 2); k = 0;
  for (let r = 0; r < rows; r++) for (const s of [1, -1]) { d.position.set((cols - 1) * 1.05 / 2, hc - s * dy - .04, r * pitch + s * dz); d.updateMatrix(); rails.setMatrixAt(k++, d.matrix); }
  g.add(posts, rails); return g;
}

/** REPACSS machine-room row (top → bottom in each cabinet), one full-width 2U node per row.
 *  Node counts per rack follow repacss_structure.pdf; switch placement follows the InfiniBand topology in REPACSS_nodes.pdf:
 *  core switches managed-ib-sw-94-44/46 at the top of Rack 94, leaf switches ib-sw-91-21 / 94-21 / 96-21 mid-rack,
 *  Rack 95 (storage on top, 10 CPU nodes below) cabled straight to the cores.
 *  Item codes: eth = Ethernet (25 GbE control) switch, ib = InfiniBand leaf, ibc = InfiniBand core, pdusw = PDU switch,
 *  cpu / gpu / amd / util = one 2U node; storage per REPACSS_storage.pdf: r660 = 1U NVMe, r760 = 2U NVMe, xd2 = 2U R760xd2
 *  (3.5" SATA + NVMe); gap = empty space, pdu4 / pdu2 = PDUs at the bottom. */
const N = (k, n) => Array(n).fill(k);
export const RACKS = [
  { name: 'Rack 91', irc: true, items: ['eth', ...N('cpu', 10), 'ib', ...N('cpu', 10), 'pdu4'] },
  { name: 'Rack 92', irc: true, items: [...N('cpu', 10), 'amd', 'amd', ...N('cpu', 10), 'pdu4'] },
  { name: 'Rack 93', irc: true, items: ['eth', ...N('gpu', 8), 'gap', 'eth', 'gpu', ...N('util', 5), 'gap', 'pdusw', 'pdu2'] },
  { name: 'Rack 94', irc: true, items: ['ibc', 'ibc', 'eth', ...N('cpu', 10), 'ib', ...N('cpu', 10), 'pdu4'] },
  { name: 'Rack 95', irc: true, items: ['eth', 'r660', 'r660', ...N('r760', 3), ...N('xd2', 4), 'gap', ...N('cpu', 10), 'pdu2'] },
  { name: 'Rack 96', irc: true, items: ['eth', ...N('cpu', 10), 'ib', ...N('cpu', 10), 'pdu4'] },
  { name: 'Rack 97', irc: false, items: [...N('cpu', 10), 'gap', ...N('cpu', 10), 'pdu4'] },
];

export const NODE_COLOR = { cpu: C.elec, gpu: C.gpu, amd: 0xff4d5e, util: 0xff9a3c, store: C.store, r660: C.store, r760: C.store, xd2: C.store };
const RACK_IN = 4.0;           // usable inner height (48U)
const U = RACK_IN / 48;
const ITEM_H = { eth: U, ib: U, ibc: U, pdusw: U, r660: U, gap: .12, pdu4: .14, pdu2: .14, row: 2 * U };

/** front-panel textures (one per node type, shared) */
const _faces = {};
function faceTex(ty) {
  if (_faces[ty]) return _faces[ty];
  const W = 640, H = ty === 'r660' ? 56 : 112, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#121419'; g.fillRect(0, 0, W, H);
  // rack ears
  g.fillStyle = '#2b2f37'; g.fillRect(0, 0, 34, H); g.fillRect(W - 34, 0, 34, H);
  g.fillStyle = '#5a606b'; g.fillRect(10, 18, 6, 10); g.fillRect(W - 16, 18, 6, 10);
  if (ty === 'store' || ty === 'xd2') {          // R760xd2: 12 × 3.5" carriers, 4 across × 3 high, orange release buttons
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
      const x = 44 + k * 140, y = 6 + r * 34;
      g.fillStyle = '#30343b'; g.fillRect(x, y, 132, 30); g.fillStyle = '#16181c';
      for (let v = 0; v < 6; v++) g.fillRect(x + 50 + v * 12, y + 5, 7, 20);
      g.fillStyle = '#e07a2a'; g.beginPath(); g.arc(x + 14, y + 15, 6, 0, 7); g.fill();
      g.fillStyle = '#8b919b'; g.fillRect(x + 26, y + 6, 16, 18);
    }
  } else {
    // drive bays behind the bezel (2.5" carriers)
    const n = ty === 'util' ? 8 : ty === 'r760' ? 24 : ty === 'r660' ? 10 : 12;
    for (let k = 0; k < n; k++) { const x = 60 + k * ((W - 120) / n); g.fillStyle = '#2a2e36'; g.fillRect(x, 12, (W - 120) / n - 6, H - 24); g.fillStyle = '#1a1d23'; g.fillRect(x + 4, 18, (W - 120) / n - 14, H - 36); }
    // hexagon bezel lattice
    g.strokeStyle = ty === 'gpu' ? '#a9b3bf' : '#9aa0a8'; g.lineWidth = H / 22;
    const R = H * .23, hw = R * Math.sqrt(3);
    for (let row = -1; row < 4; row++) for (let col = -1; col < 28; col++) {
      const cx = 70 + col * hw + (row % 2 ? hw / 2 : 0), cy = row * R * 1.5 + H * .14;
      if (cx < 40 || cx > W - 40) continue;
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); } g.closePath(); g.stroke();
    }
    if (ty === 'gpu') { g.fillStyle = 'rgba(15,17,21,.85)'; g.fillRect(250, 14, 140, H - 28); g.fillStyle = '#2f343d'; for (let k = 0; k < 4; k++) g.fillRect(262 + k * 32, 22, 24, H - 44); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (_faces[ty] = t);
}

/** one 48U cabinet built from an items list. Returns group with .nodes (one per 2U row), .switches, .pdus, .height */
export function cabinet(items, name) {
  const g = new THREE.Group(), shell = std(0x161c28, { metalness: .7, roughness: .4 });
  const H = RACK_IN + .45;
  for (const [w, h, dd, x, y, z] of [[.05, H, 1.7, -.5, H / 2, 0], [.05, H, 1.7, .5, H / 2, 0], [.948, .06, 1.66, 0, H - .03, 0], [.948, .1, 1.66, 0, .05, 0]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), shell); p.position.set(x, y, z); g.add(p);
  }
  for (const x of [-.45, .45]) for (const z of [-.75, .75]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .06, 8), std(0x333a48)); f.position.set(x, .03, z); g.add(f); }
  g.nodes = []; g.switches = []; g.pdus = [];
  const total = items.reduce((a, it) => a + (ITEM_H[it] ?? ITEM_H.row), 0), pad = Math.max(0, (RACK_IN - total) / (items.length + 1));
  const bodyM = std(0x252c3a, { metalness: .8, roughness: .35 });
  let y = RACK_IN + .3;
  const node = (ty, yc, h) => {
    const n = new THREE.Group(); n.position.set(0, yc, .02); g.add(n);
    n.add(new THREE.Mesh(new THREE.BoxGeometry(.9, h, 1.6), bodyM));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.9, h), new THREE.MeshStandardMaterial({ map: faceTex(ty), metalness: .5, roughness: .45 })); face.position.z = .808; n.add(face);
    const led = new THREE.Mesh(new THREE.BoxGeometry(.2, .018, .01), emis(NODE_COLOR[ty], .9)); led.position.set(-.3, -h / 2 + .022, .81); n.add(led);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(.025, .025, .01), emis(0x40ff80, 1.5)); dot.position.set(.42, h / 2 - .03, .81); n.add(dot);
    n.type = ty; n.led = led; n.dot = dot; g.nodes.push(n); return n;
  };
  const pdu = (x, w, yc) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, .12, .5), std(0x3a4f80, { metalness: .4 })); p.position.set(x, yc, .55); g.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(w * .6, .025, .01), emis(0x7dffa5, 1)); l.position.set(x, yc, .81); g.add(l); g.pdus.push(l); };
  for (const it of items) {
    const h = ITEM_H[it] ?? ITEM_H.row; y -= pad; const yc = y - h / 2; y -= h;
    if (it === 'eth' || it === 'ib' || it === 'ibc' || it === 'pdusw') {
      const col = it === 'ib' ? 0x2f3fa8 : it === 'ibc' ? 0x6a3fc8 : it === 'eth' ? 0x3a8fd8 : 0xe8eaee;
      const sw = new THREE.Mesh(new THREE.BoxGeometry(.92, h - .012, 1.2), std(col, { metalness: .5, emissive: col, emissiveIntensity: .15 })); sw.position.set(0, yc, .2); g.add(sw);
      const nP = it === 'pdusw' ? 8 : 16;
      for (let i = 0; i < nP; i++) { const port = new THREE.Mesh(new THREE.BoxGeometry(.035, .03, .01), emis(it === 'pdusw' ? 0x222222 : 0xffd23a, it === 'pdusw' ? .2 : 1.2)); port.position.set(-.36 + i * (.72 / (nP - 1)), yc, .805); g.add(port); }
      sw.kind = it; g.switches.push(sw);
    } else if (it === 'pdu4' || it === 'pdu2') {
      const n = it === 'pdu4' ? 4 : 2; for (let i = 0; i < n; i++) pdu(-.345 + i * .23 * (4 / n) + (n === 2 ? .115 : 0), .2, yc);
    } else if (it !== 'gap') node(it, yc, h - .01);
  }
  if (name) { const lbl = textSprite(name, { color: '#cfe3ff', h: .22, bg: 'rgba(30,110,190,.75)' }); lbl.position.set(0, H + .25, .6); g.add(lbl); g.label = lbl; }
  g.height = H; return g;
}

/** in-row cooler between cabinets */
export function inRowCooler() {
  const g = new THREE.Group(), H = RACK_IN + .45;
  const body = new THREE.Mesh(new THREE.BoxGeometry(.5, H, 1.7), std(0x2a3140, { metalness: .6 })); body.position.y = H / 2; g.add(body);
  g.fans = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group(); f.position.set(0, .7 + i * 1.0, .86); g.add(f);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.17, .02, 8, 24), std(0x56677e, { emissive: 0x3fa8ff, emissiveIntensity: .12 })); f.add(ring);
    for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(.05, .3, .01), std(0x6a7a90)); bl.rotation.z = k * Math.PI / 4; bl.position.z = k * .012; f.add(bl); }
    g.fans.push(f);
  }
  return g;
}

/** the whole row: IRC + cabinets laid out along x, centered. Returns { group, racks, ircs, spin(t) } */
export function machineRow() {
  const group = new THREE.Group(), racks = [], ircs = [];
  let x = 0;
  for (const r of RACKS) {
    if (r.irc) { const c = inRowCooler(); c.position.x = x + .25; group.add(c); ircs.push(c); x += .55; }
    const cab = cabinet(r.items, r.name); cab.position.x = x + .5; group.add(cab); racks.push(cab); x += 1.05;
  }
  group.children.forEach(o => o.position.x -= x / 2);
  return { group, racks, ircs, width: x, spin: (t) => ircs.forEach(c => c.fans.forEach((f, i) => { f.children.slice(1).forEach((b, k) => b.rotation.z = k * Math.PI / 4 + t * 6 + i); })) };
}

/** generic cabinet (one of the REPACSS CPU racks) for scenes that need a single rack */
export const rack = () => cabinet(RACKS[0].items);

export function grid(size = 200, div = 100, color = 0x1b2a4a, op = .5) {
  const g = new THREE.GridHelper(size, div, color, color); g.material.transparent = true; g.material.opacity = op; return g;
}

/** sky dome with vertical gradient */
export function sky(top = '#0a1a3a', mid = '#2a4a7a', bottom = '#c99a6a') {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(.55, mid); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
}

export function line(points, color, opacity = 1) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => p.isVector3 ? p : new THREE.Vector3(...p)));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

export function setOpacity(obj, op) {
  obj.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = op; } });
  obj.visible = op > .002;
}

export function camLook(cam, pos, target) { cam.position.copy(pos); cam.lookAt(target); }
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** piecewise camera path: keys = [[time, pos, target], ...]; eased between keys */
export function camPath(cam, t, keys) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0, q0] = keys[i], [t1, p1, q1] = keys[Math.min(i + 1, keys.length - 1)];
  const u = t1 > t0 ? ease((t - t0) / (t1 - t0)) : 1;
  cam.position.lerpVectors(p0, p1, u); cam.lookAt(vlerp(q0, q1, u));
}
