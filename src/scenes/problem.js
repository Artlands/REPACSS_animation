// The mismatch: flat data-center demand vs. variable solar supply, then a power-aware load that follows supply.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, grid, rack, V, camPath, textSprite } from '../lib.js';

const N = 240;
const hx = (h) => (h - 12) * 1.1;                          // hour -> x
const solar = (h) => {
  const s = Math.max(0, Math.sin(Math.PI * (h - 6.3) / 13.4)) ** 1.4 * 6.2;
  const cloud = 1 - .65 * Math.exp(-(((h - 13.2) / .45) ** 2)) - .4 * Math.exp(-(((h - 10.4) / .3) ** 2));
  return s * cloud;
};
const GRID_FLOOR = 1.0;   // minimal load kept on grid power overnight
const DEMAND = 4.6;

function wall(color, z, op = .35) {
  const pos = new Float32Array(N * 2 * 3), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const top = new THREE.Line(lgeo, new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true }));
  const g = new THREE.Group(); g.add(mesh, top);
  g.set = (fn, prog = 1, base = () => 0) => {
    const a = pos, l = lgeo.attributes.position.array, hmax = 24 * prog;
    for (let i = 0; i < N; i++) {
      const h = Math.min(i / (N - 1) * 24, hmax), y0 = base(h), y = y0 + fn(h);
      a.set([hx(h), y0, z, hx(h), y, z], i * 6); l.set([hx(h), y, z + .01], i * 3);
    }
    geo.attributes.position.needsUpdate = true; lgeo.attributes.position.needsUpdate = true; geo.computeBoundingSphere();
  };
  return g;
}

export default function problem(sc) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050914);
  scene.fog = new THREE.Fog(0x050914, 40, 90);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, .1, 300);
  scene.add(new THREE.AmbientLight(0xffffff, .6)); const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(5, 10, 10); scene.add(d);
  scene.add(grid(80, 80, 0x1a2a50, .45));

  // axis ticks for hours
  for (const h of [0, 6, 12, 18, 24]) {
    const s = textSprite(['12 AM', '6 AM', 'NOON', '6 PM', '12 AM'][h / 6], { color: '#8ea3c9', h: .55 });
    s.position.set(hx(h), -.1, 3.2); scene.add(s);
  }

  // a small cluster on the left that "pulls" the flat demand
  const racks = new THREE.Group(); racks.position.set(-17.5, 0, -1);
  for (let i = 0; i < 4; i++) { const r = rack(); r.position.x = i * 1.1; racks.add(r); }
  racks.rotation.y = .5; scene.add(racks);

  const sW = wall(C.sun, -1.6, .32), dW = wall(C.red, 1.5, .1), aW = wall(C.tok, 1.52, .38);
  scene.add(sW, dW, aW);

  const keys = [[0, V(-12, 9, 24), V(-4, 2, 0)], [9, V(-4, 7, 22), V(0, 2.5, 0)], [17, V(4, 8, 21), V(1, 3, 0)], [24, V(0, 10, 23), V(0, 3, 0)], [31, V(-3, 7, 19), V(0, 3, 0)]];

  function update(t) {
    camPath(camera, t, keys);
    const s = sc.s;
    const dOn = ramp(t, 1.2, 2.5);
    dW.set(() => DEMAND, dOn); dW.visible = dOn > 0;
    racks.children.forEach(r => r.nodes.forEach((n, i) => n.led.material.emissiveIntensity = .8 + Math.sin(t * 6 + i) * .25));
    const sOn = ramp(t, s(2), 3.5);
    sW.set(solar, sOn); sW.visible = sOn > 0;
    const m = ramp(t, s(4) + .3, 3.5);
    aW.set(h => lerp(DEMAND, Math.max(GRID_FLOOR, .92 * solar(h)), m), 1); aW.visible = m > 0; aW.children[0].material.opacity = .38 * m;
    dW.children[0].material.opacity = .1 * (1 - .6 * m);

    const lab = (id, html, h, y, z, op, col) => ui.label(id, html, V(hx(h), y, z), camera, op, col);
    lab('p-d', 'Conventional demand<small>flat, 24 / 7</small>', 2.2, DEMAND + .3, 1.5, dOn * (1 - m), '#ff6b75');
    lab('p-s', 'Solar output', 12, solar(12) + .4, -1.6, ramp(t, s(2) + 1.5, 1) * (1 - m), '#ffc46b');
    lab('p-c', 'Cloud passes', 13.2, solar(13.2) + .5, -1.6, win(t, s(2) + 2.5, s(4), .6), '#d6e4ff');
    lab('p-n', 'No sun<small>grid only</small>', 2.5, .4, -1.6, win(t, s(2) + 3.5, s(4), .6), '#c7d0e0');
    lab('p-a', 'Power-aware load<small>follows the sun</small>', 9, .92 * solar(9) + .4, 1.5, ramp(t, s(4) + 2.5, 1), '#cdb6ff');

    const oh = win(t, .5, sc.dur, .8);
    ui.header('p-h', 'The challenge', 'Steady demand · variable supply', oh);
    const oc = ramp(t, s(3) + .3, .8);
    ui.el('p-card', 'card', `<div class="big" style="font-size:40px">REPACSS</div><div class="cap">NSF Grant No. 2404438</div><div class="cap" style="text-transform:none;letter-spacing:0;font-size:22px;color:#cfd8ee;margin-top:14px">Make the computer follow the energy —<br>not the energy follow the computer.</div>`, 1340, 760, oc);
  }
  return { scene, camera, update, bloom: { strength: .7, radius: .4, threshold: .8 } };
}
