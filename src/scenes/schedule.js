// Challenge 2: energy-aware workflow scheduling — jobs packed under a solar forecast plus a small grid budget.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, rng, std, textSprite, grid, V, camPath, ease } from '../lib.js';

const HOURS = 24, X = (h) => (h - 12) * 1.2;   // hour -> x
const GRID = 1.5;                                // power units bought from the grid at any hour
const solar = (h) => Math.max(0, Math.sin(Math.PI * (h - 6.5) / 13)) ** 1.2 * 8 * (1 - .35 * Math.exp(-(((h - 15.5) / .6) ** 2)));
const cap = (h) => GRID + solar(h);              // forecast capacity in "power units"
const KINDS = {
  mpi: { color: 0x3f7bff, name: 'MPI simulation' }, ai: { color: C.gpu, name: 'AI training' },
  arr: { color: C.elec, name: 'job array' }, pre: { color: 0x9b7bd8, name: 'preemptible' },
};

// greedy packer: each job lands where it fits under the forecast, big jobs first near solar noon
function pack() {
  const r = rng(21), jobs = [];
  for (let i = 0; i < 3; i++) jobs.push({ k: 'mpi', w: 3 + (i % 2), h: 1.5 });
  for (let i = 0; i < 3; i++) jobs.push({ k: 'ai', w: 2 + i % 2, h: 1.5 });
  for (let i = 0; i < 14; i++) jobs.push({ k: 'arr', w: 1, h: .5 + (r() < .5 ? .5 : 0) });
  for (let i = 0; i < 26; i++) jobs.push({ k: 'pre', w: 1 + (r() < .3 ? 1 : 0), h: .5 });
  const height = new Float32Array(HOURS), placed = [];
  for (const j of jobs) {
    let best = null;
    for (let s0 = 0; s0 + j.w <= HOURS; s0++) {
      let base = 0, room = 1e9;
      for (let h = s0; h < s0 + j.w; h++) { base = Math.max(base, height[h]); room = Math.min(room, cap(h), cap(h + .5), cap(h + 1)); }
      if (base + j.h > room - .15) continue;
      const score = base + (j.k === 'mpi' || j.k === 'ai' ? Math.abs(s0 + j.w / 2 - 13) * .3 : 0);
      if (!best || score < best.score) best = { s0, base, score };
    }
    if (!best) continue;
    for (let h = best.s0; h < best.s0 + j.w; h++) height[h] = best.base + j.h;
    placed.push({ ...j, s0: best.s0, y: best.base });
  }
  return placed;
}

export default function schedule(sc) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x060812);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, .1, 300);
  scene.add(new THREE.AmbientLight(0xffffff, .55)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-6, 14, 12); scene.add(dl);
  scene.add(grid(80, 80, 0x18284a, .45));

  // forecast surface: an extruded area under cap(h)
  const shape = new THREE.Shape(); shape.moveTo(X(0), GRID);
  for (let i = 0; i <= 200; i++) { const h = i / 200 * HOURS; shape.lineTo(X(h), cap(h)); }
  shape.lineTo(X(HOURS), GRID); shape.lineTo(X(0), GRID);
  const gridBand = new THREE.Mesh(new THREE.PlaneGeometry(HOURS * 1.2, GRID), new THREE.MeshBasicMaterial({ color: 0x8f9bb3, transparent: true, opacity: .14, depthWrite: false }));
  gridBand.position.set(0, GRID / 2, -1.2); scene.add(gridBand);
  const gl = textSprite('grid budget', { color: '#b8c2d6', h: .5 }); gl.position.set(X(1.8), GRID + .45, -1.2); scene.add(gl);
  const area = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: C.sun, transparent: true, opacity: .05, depthWrite: false }));
  area.position.z = -1.2; scene.add(area);
  const edgePts = []; for (let i = 0; i <= 200; i++) { const h = i / 200 * HOURS; edgePts.push(new THREE.Vector3(X(h), cap(h), 1.2)); }
  const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: 0xffd38a })); scene.add(edge);
  const edgeB = edge.clone(); edgeB.position.z = -2.4; scene.add(edgeB);
  for (const h of [0, 6, 12, 18, 24]) { const s = textSprite(['00:00', '06:00', '12:00', '18:00', '24:00'][h / 6], { color: '#8ea3c9', h: .5, mono: true }); s.position.set(X(h), -.5, 2); scene.add(s); }
  const fl = textSprite('solar forecast', { color: '#ffd38a', h: .6 }); fl.position.set(X(8.2), cap(8.2) + .8, 0); scene.add(fl);

  const jobs = pack();
  const meshes = jobs.map((j, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(j.w * 1.2 - .08, j.h - .06, 2), std(KINDS[j.k].color, { emissive: KINDS[j.k].color, emissiveIntensity: .15, roughness: .5, metalness: .1, transparent: true }));
    m.userData = j; scene.add(m); return m;
  });
  // drop order: big jobs first, then arrays, then preemptible filling gaps
  const order = [...meshes].sort((a, b) => ['mpi', 'ai', 'arr', 'pre'].indexOf(a.userData.k) - ['mpi', 'ai', 'arr', 'pre'].indexOf(b.userData.k) || a.userData.y - b.userData.y);
  const s = sc.s, t0 = s(1) + 2, t1 = s(3) - .3;
  order.forEach((m, i) => m.userData.t = lerp(t0, t1, i / (order.length - 1)));
  // "now" cursor
  const now = new THREE.Mesh(new THREE.BoxGeometry(.06, 11, .06), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75 })); now.position.y = 5.5; scene.add(now);

  const keys = [[0, V(-6, 4, 26), V(0, 4, 0)], [s(1), V(-10, 8, 22), V(0, 3.5, 0)], [s(2) + 2, V(4, 10, 21), V(0, 3.5, 0)], [s(3), V(10, 6, 20), V(0, 3.5, 0)], [sc.dur, V(3, 7, 24), V(0, 4, 0)]];

  function update(t) {
    camPath(camera, t, keys);
    meshes.forEach(m => {
      const j = m.userData, u = ease((t - j.t) / .7);
      m.visible = t > j.t;
      m.position.set(X(j.s0 + j.w / 2), j.y + j.h / 2 + (1 - u) * 9, 0);
      m.material.opacity = Math.min(1, (t - j.t) * 4);
      m.material.emissiveIntensity = .15 + (1 - ramp(t, j.t + .7, .5)) * .8;
    });
    const nh = lerp(5, 21, ramp(t, s(3), sc.dur - s(3)));
    now.position.x = X(nh); now.visible = t > s(3);
    area.material.opacity = .05 + .04 * ramp(t, s(1) + .5, 1);

    ui.header('sch-h', 'Research challenge 2', 'Workflow scheduling integration', win(t, .4, sc.dur, .6));
    ui.el('sch-f', 'card', `<div class="cap" style="margin:0">Energy-aware placement</div><div style="font-size:23px;margin-top:8px;line-height:1.55">solar production forecast<br>→ Slurm scheduling policies<br>→ jobs placed where the power is</div>`, 1350, 170, win(t, s(1) + .3, sc.dur, .5));
    Object.entries(KINDS).forEach(([k, v], i) => ui.el('sch-l' + k, 'chip', `<span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#${v.color.toString(16).padStart(6, '0')};margin-right:10px"></span>${v.name}`, 90 + i * 300, 960, ramp(t, s(2) + i * .7, .5), { fontSize: '21px' }));
    ui.el('sch-g', 'card', `<div class="cap" style="margin:0">Trade-off under study</div><div style="font-size:23px;margin-top:8px">energy cost &nbsp;⟷&nbsp; quality of service (wait time, deadlines)</div>`, 90, 820, win(t, s(3) + .3, sc.dur, .5));
  }
  return { scene, camera, update, env: .15, bloom: { strength: .6, radius: .4, threshold: .8 } };
}
