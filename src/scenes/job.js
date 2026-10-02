// "The Journey of Job 41827": one researcher's drought model for the Ogallala aquifer, from a laptop on the Great Plains,
// through a solar-aware Slurm queue, onto 32 REPACSS nodes, through a checkpoint under lingering clouds, and back.
// Site, cutaway cluster and machine room come from day.js; the Earth from intro.js; the outro is reused.
// Researcher, job, schedule, energy and risk-map values are illustrative (labeled so on screen).
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, clamp, ease, rng, V, camPath, glowSprite, flow, curve, std, textSprite, grid } from '../lib.js';
import { kit } from './day.js';
import { earthGlobe, ll } from './intro.js';

const KICK = 'The journey of job 41827';
const END = '<span style="color:var(--tok)">A question</span> <span style="color:#8090b0">→</span> <span style="color:var(--sun)">sunlight</span> <span style="color:#8090b0">→</span> <span style="color:#7dffa5">an answer</span>';
const R = 10, HOME = [40.81, -96.70], GLEAMM = [33.597, -102.047];
// High Plains (Ogallala) aquifer outline, simplified
const OGALLALA = [[43.6, -103.4], [43.2, -100.5], [42.7, -98.4], [41.4, -97.4], [40.2, -98.2], [39.2, -98.6], [38.2, -99.3], [37.1, -99.8], [36.1, -100.0], [35.2, -100.4],
  [34.2, -100.6], [33.1, -101.0], [32.1, -101.6], [31.9, -102.6], [32.6, -103.4], [34.2, -103.7], [35.8, -103.4], [37.2, -102.8], [38.6, -102.4], [39.6, -102.9], [40.6, -104.3], [42.0, -104.7], [43.2, -104.2]];

/** job status card, bottom right */
function jobCard(id, st, col, prog, op, extra = '') {
  ui.el(id, 'card', `<div class="cap" style="margin:0 0 8px">job 41827 · ogallala-drought · illustrative</div><div style="font-size:26px;color:${col};font-weight:600">${st}</div>
    <div style="width:420px;height:10px;border-radius:5px;background:rgba(255,255,255,.08);margin-top:12px;overflow:hidden"><div style="width:${clamp(prog) * 420}px;height:10px;background:linear-gradient(90deg,#7b5cff,#b18cff)"></div></div>
    <div style="font-size:18px;color:var(--dim);margin-top:8px">32 nodes · 8,192 cores · ${Math.round(clamp(prog) * 100)}% complete${extra}</div>`, 1360, 740, op);
}

/** Earth over the Great Plains: pins, the aquifer outline + a risk map, and a data arc between HOME and GLEAMM */
function plains(sunDir, from, to) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x010208);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .05, 4000);
  const r = rng(3), sp = new Float32Array(4000 * 3);
  for (let i = 0; i < 4000; i++) { const v = V(r() - .5, r() - .5, r() - .5).normalize().multiplyScalar(1500 + r() * 500); sp.set([v.x, v.y, v.z], i * 3); }
  scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)), new THREE.PointsMaterial({ color: 0xaab8ff, size: 2, sizeAttenuation: false })));
  const { surf, atmo } = earthGlobe(sunDir.normalize()); scene.add(surf, atmo);
  const pins = [from, to].map(p => { const g = glowSprite(p === GLEAMM ? 0xff3040 : C.tok, .2); g.position.copy(ll(...p, R * 1.002)); scene.add(g); return g; });
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(OGALLALA.map(p => ll(...p, R * 1.0015))), new THREE.LineBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0 }));
  scene.add(outline);
  // risk dots inside the outline (illustrative: more stress in the south, where the aquifer is thinnest)
  const inside = (la, lo) => { let c = false; for (let i = 0, j = OGALLALA.length - 1; i < OGALLALA.length; j = i++) { const [ai, oi] = OGALLALA[i], [aj, oj] = OGALLALA[j]; if ((ai > la) !== (aj > la) && lo < (oj - oi) * (la - ai) / (aj - ai) + oi) c = !c; } return c; };
  const P = [], Cc = [], lo = new THREE.Color(0x2fbf71), hi = new THREE.Color(0xff4d3d), mid = new THREE.Color(0xffc23a);
  for (let la = 31.9; la < 43.7; la += .22) for (let lo2 = -104.7; lo2 < -97.4; lo2 += .26) if (inside(la, lo2)) {
    const k = clamp((43 - la) / 10 + .25 * Math.sin(lo2 * 1.7 + la * 1.3) + (r() - .5) * .15);
    const c = k < .5 ? lo.clone().lerp(mid, k * 2) : mid.clone().lerp(hi, k * 2 - 1);
    P.push(...ll(la, lo2, R * 1.0012).toArray()); Cc.push(c.r, c.g, c.b);
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  const risk = new THREE.Points(dg, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false })); scene.add(risk);
  // data arc
  const a = ll(...from, 1), b = ll(...to, 1);
  const arc = new THREE.CatmullRomCurve3(Array.from({ length: 32 }, (_, i) => { const u = i / 31; return a.clone().lerp(b, u).normalize().multiplyScalar(R * (1.002 + .03 * Math.sin(Math.PI * u))); }));
  const packets = flow(arc, 24, from === GLEAMM ? C.tok : 0xcdb6ff, .1, 9); scene.add(packets);
  const line = new THREE.Mesh(new THREE.TubeGeometry(arc, 64, .006, 6), new THREE.MeshBasicMaterial({ color: 0xcdb6ff, transparent: true, opacity: 0 })); scene.add(line);
  const C0 = ll(38.2, -99.8, 1);
  const above = (alt, dLat = 0, dLon = 0) => ll(38.2 + dLat, -99.8 + dLon, R + alt);
  return { scene, camera, pins, outline, risk, packets, line, C0, above, at: (p) => ll(...p, R * 1.002) };
}

// ---------- 11 PM: enter ----------
export function submit(sc) {
  const s = sc.s, G = plains(ll(-20, 80, 1), HOME, GLEAMM), camera = G.camera, center = G.C0.clone().multiplyScalar(R);
  const keys = [[0, G.above(9, -4, 3), G.at(HOME)], [s(1), G.above(6.5, -5, 1), center], [s(2) + 1, G.above(5, -6, -1), G.at(GLEAMM)], [sc.dur, G.above(7, -7, 0), center]];
  const cmd = 'sbatch ogallala_drought.sh', tEnd = sc.sentences.at(-1).end;
  function update(t) {
    camPath(camera, t, keys);
    G.pins.forEach(p => p.scale.setScalar(camera.position.distanceTo(p.position) * .03 * (1 + .2 * Math.sin(t * 5))));
    G.pins[1].material.opacity = ramp(t, s(2), 1);
    G.outline.material.opacity = .9 * win(t, s(1) + .4, sc.dur, .8);
    const go = ramp(t, s(2) + .4, 1); G.packets.update(t, .25, go); G.line.material.opacity = .35 * go;
    const hd = win(t, .5, tEnd - .4, .7);
    kit.header('sb', 23.02 + t / 3600, 'Enter', hd, KICK);
    const typed = cmd.slice(0, Math.floor(clamp((t - s(0) - 1.6) / 1.6) * cmd.length));
    ui.el('sb-term', 'card', `<div class="mono" style="font-size:22px;line-height:1.7"><span style="color:#7dffa5">researcher@laptop</span> <span style="color:var(--dim)">~ %</span> ${typed}<span style="color:var(--tok);opacity:${t < s(0) + 3.6 ? 1 : 0}">▍</span><br><span style="opacity:${ramp(t, s(0) + 3.6, .2)}">Submitted batch job <b style="color:var(--tok)">41827</b></span></div>`, 90, 820, win(t, s(0) + .6, tEnd - .4, .5));
    ui.label('sb-home', 'A researcher<small>somewhere on the Great Plains · 11 PM</small>', G.at(HOME), camera, win(t, s(0) + .6, s(2) + 2, .5), '#cdb6ff');
    ui.label('sb-aq', 'Ogallala aquifer<small>High Plains aquifer · beneath 8 states</small>', ll(39.5, -101.5, R), camera, win(t, s(1) + 1, s(2) + .4, .5), '#7fe6ff');
    ui.label('sb-gl', 'REPACSS · Lubbock, Texas<small>via NSF ACCESS</small>', G.at(GLEAMM), camera, win(t, s(2) + 1, tEnd - .4, .5), '#ff8a94');
    const ti = win(t, tEnd - .2, sc.dur + 1, .9);
    ui.el('sb-dim', '', '', 0, 0, ti * .5, { width: '1920px', height: '1080px', background: '#02040a', zIndex: -1 });
    ui.el('sb-ti', 'h1', 'The Journey of Job <span style="color:var(--tok)">41827</span>', 960, 420, ti, { fontSize: '88px', transform: 'translateX(-50%)' });
    ui.el('sb-ts', 'sub', 'One simulation, from a laptop to the sun and back', 960, 545, ramp(t, tEnd + .5, .9) * ti, { fontSize: '34px', color: '#e2d6ff', transform: 'translateX(-50%)' });
  }
  return { scene: G.scene, camera, update, bloom: { strength: 1, radius: .6, threshold: .7 } };
}

// ---------- the queue: packing jobs under tomorrow's sunlight ----------
export function queue(sc) {
  const s = sc.s;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x04070e);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .1, 300);
  scene.add(new THREE.AmbientLight(0xa0b0d0, .7)); const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 8, 10); scene.add(key);
  const gr = grid(80, 80, 0x16223a, .5); gr.position.y = -.02; scene.add(gr);
  const X = (H) => (((H - 22) % 24 + 24) % 24) * .9 - 10.8, Y = (n) => n * .06;
  const sunN = (H) => 125 * Math.max(0, Math.sin(Math.PI * (H - 6.85) / 14.15)) ** 1.2;
  // forecast: shaded area + glowing edge, revealed left to right
  const pts = Array.from({ length: 241 }, (_, i) => { const k = i / 10, H = (22 + k) % 24; return V(k * .9 - 10.8, Y(H > 6.85 && H < 21 ? sunN(H) : 0), 0); });
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y))); shape.lineTo(10.8, 0); shape.lineTo(-10.8, 0);
  const area = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: C.sun, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); area.position.z = -.5; scene.add(area);
  const edge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 480, .045, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a })); edge.position.z = -.5; scene.add(edge);
  const nEdge = edge.geometry.index.count;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(21.6, .02, .02), new THREE.MeshBasicMaterial({ color: 0x5d6b85 })); cap.position.y = Y(130); scene.add(cap);
  const capL = textSprite('130 nodes', { color: '#8ea3c9', h: .32 }); capL.position.set(-12.2, Y(130), 0); scene.add(capL);
  [[22, '10 PM'], [2, '2 AM'], [6, '6 AM'], [10, '10 AM'], [14, '2 PM'], [18, '6 PM'], [22, '10 PM ']].forEach(([H, l], i) => { const sp = textSprite(l.trim(), { color: '#8ea3c9', h: .34 }); sp.position.set(i === 6 ? 10.8 : X(H), -.5, .4); scene.add(sp); });
  // jobs: [kind, solar slot (start H, hours, y0 nodes, nodes), first-come slot]
  const K = { big: 0x3fd8ff, flex: 0x7dffa5, prio: 0xff9a3c, mine: C.tok };
  const jobs = [
    ['prio', [22, 8, 0, 10], [22, 8, 0, 10]], ['big', [9, 5, 0, 40], [23, 5, 10, 40]], ['big', [14, 4, 0, 38], [23, 4, 78, 38]], ['big', [12, 3, 72, 28], [23, 3, 50, 28]],
    ['flex', [8, 1.5, 0, 14], [23, 1.5, 116, 14]], ['flex', [17.5, 2, 0, 30], [2, 2, 50, 30]], ['flex', [16, 2, 40, 20], [3, 2, 80, 20]], ['mine', [10, 6, 40, 32], [10, 6, 40, 32]],
  ].map(([k, sol, fifo], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .8), std(K[k], { emissive: K[k], emissiveIntensity: k === 'mine' ? .45 : .12, transparent: true, metalness: .2, roughness: .6 }));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35 })); m.add(e);
    const place = ([H, d, y0, n]) => ({ x: X(H) + d * .45, y: Y(y0) + Y(n) / 2, w: d * .9, h: Y(n) });
    scene.add(m); return { m, k, i, A: place(fifo), B: place(sol) };
  });
  const mine = jobs.at(-1);
  const keys = [[0, V(-1, 5.5, 23), V(0, 5.5, 0)], [s(3), V(1, 5, 18), V(.5, 5, 0)], [s(4) + 1, V(-1.5, 4.6, 12), V(-1.4, 4, 0)], [sc.dur, V(-1, 4.6, 11.5), V(-1.4, 4, 0)]];
  function update(t) {
    camPath(camera, t, keys);
    const fc = ramp(t, s(2) + .2, 2.4);
    area.material.opacity = .16 * fc; edge.geometry.setDrawRange(0, Math.floor(nEdge * fc / 6) * 6); edge.visible = fc > 0;
    for (const j of jobs) {
      const u = j.k === 'mine' ? 1 : ease((t - s(3) - .3 - j.i * .45) / 1.3), p = { x: lerp(j.A.x, j.B.x, u), y: lerp(j.A.y, j.B.y, u) + Math.sin(Math.PI * clamp(u)) * 1.2 };
      const drop = j.k === 'mine' ? ease((t - s(4) - 1.2) / 1.2) : 1;
      j.m.position.set(p.x, p.y + (1 - drop) * 6, 0); j.m.scale.set(lerp(j.A.w, j.B.w, u), j.A.h + (j.B.h - j.A.h) * u, 1);
      const op = j.k === 'mine' ? ramp(t, s(4) + 1.2, .4) : ramp(t, .6 + j.i * .25, .5);
      j.m.material.opacity = .72 * op; j.m.children[0].material.opacity = .35 * op; j.m.visible = op > .01;
    }
    mine.m.material.emissiveIntensity = .45 + .25 * Math.sin(t * 4);
    kit.header('qu', 23.05 + t / 3600, 'In the queue', win(t, .4, sc.dur, .6), KICK);
    ui.el('qu-a', 'chip', 'First come, first served: big runs start at night, on grid power', 90, 200, win(t, s(1) + .3, s(2) + .4, .5), { color: '#cfd8ee' });
    ui.el('qu-b', 'chip', '<span style="color:var(--sun)">Tomorrow\'s solar forecast</span> · big runs under the peak, flexible work in the shoulders', 90, 200, win(t, s(2) + .6, s(4), .5), { color: '#cfd8ee' });
    const lg = (c, n) => `<span style="color:#${c.toString(16).padStart(6, '0')}">■</span> ${n}`;
    ui.el('qu-lg', 'sub', [lg(K.big, 'large parallel'), lg(K.flex, 'flexible / preemptible'), lg(K.prio, 'high priority'), lg(K.mine, 'job 41827')].join('&nbsp;&nbsp;&nbsp;'), 92, 262, win(t, 1, sc.dur, .6), { fontSize: '20px' });
    ui.el('qu-m', 'card', '<div class="cap" style="margin:0 0 6px">Scheduled</div><div style="font-size:26px;color:#cdb6ff;font-weight:600">job 41827</div><div style="font-size:19px;color:var(--dim);margin-top:6px">32 nodes · 6 h · starts 10 AM, in the solar window</div>', 90, 340, win(t, s(4) + 2.2, sc.dur, .5));
  }
  return { scene, camera, update, bloom: { strength: .5, radius: .5, threshold: .85 } };
}

// ---------- 10 AM: the job starts ----------
export function morning(sc, shared) {
  const S = kit.W0(shared, END), s = sc.s, camera = new THREE.PerspectiveCamera(42, 16 / 9, .5, 900);
  const keys = [[0, V(-30, 62, 112), V(-55, 0, 18)], [s(1) - 1.2, V(-10, 30, 60), V(-20, 0, 6)], [s(1) + .5, V(13, 3.2, 6), V(2.5, 1.3, .3)], [sc.dur, V(10.5, 2.8, 4.2), V(2.5, 1.3, .3)]];
  function update(t) {
    camPath(camera, t, keys);
    const h = 10 + t / 600;
    S.set(t, h, { camera, busy: .5, xray: ramp(t, s(1) - 1, 1.2), job: ramp(t, s(1) + .3, 2.5) }); S.flowsAt(t, [.8, .1, .9, 0, 0]);
    kit.header('mo', h, 'The job begins', win(t, .4, sc.dur, .6), KICK);
    ui.label('mo-pv', 'Solar array<small>350 kW · climbing</small>', V(-54, 4, 22), camera, win(t, s(0) + .4, s(1) - 1.4, .5), '#ffc46b');
    ui.label('mo-j', 'job 41827<small>Rack 91 + Rack 92 · 32 nodes</small>', V(2.4, 2.9, 1.8), camera, win(t, s(1) + 1, sc.dur, .5), '#cdb6ff');
    jobCard('mo-c', t < s(1) + .3 ? 'STARTING' : 'RUNNING', t < s(1) + .3 ? '#ffd27a' : '#cdb6ff', .02 * ramp(t, s(1), 3), win(t, .8, sc.dur, .5));
  }
  return { scene: S.scene, camera, update, exposure: 1, bloom: { strength: .45, radius: .45, threshold: .9 } };
}

// ---------- 11:30 AM: inside, slices of the plains ----------
export function run(sc) {
  const s = sc.s, { scene, camera, row, bus } = kit.room(), mine = kit.JOB_NODES(row), mset = new Set(mine);
  const nodes = row.racks.flatMap(rk => rk.nodes), r = rng(21);
  mine.forEach(n => n.led.material.emissive.setHex(C.tok));
  // halo exchange: packets arcing out in front of the racks between neighbouring slices
  const wp = mine.map(n => n.getWorldPosition(V(0, 0, 0)).add(V(0, 0, .45)));
  const msgs = Array.from({ length: 36 }, (_, i) => {
    const a = wp[i % 32], b = wp[(i * 7 + 3) % 32];
    const f = flow(curve(a.toArray(), a.clone().lerp(b, .5).add(V(0, .3, .8 + r() * .6)).toArray(), b.toArray()), 4, i % 2 ? C.tok : 0x9fd6ff, .14, 50 + i); scene.add(f); return f;
  });
  const x0 = row.racks[0].position.x, x1 = row.racks[1].position.x;
  const keys = [[0, V(x0 - 3, 3.4, 9), V(x0 + .6, 2.3, 0)], [s(1), V(x0 + 2.6, 2.5, 4.2), V(x0 + .7, 2.2, .6)], [s(2), V(x0 + 1.2, 2.8, 5.5), V(x1, 2.2, .4)], [sc.dur, V(x0 - 1, 3.6, 10), V(x1, 2.4, 0)]];
  // 8 × 4 slices of the plains, one per node (illustrative soil moisture)
  const tiles = (t, hx) => { let o = ''; for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) {
      const m = .5 + .35 * Math.sin(i * .9 + j * 1.3 + t * .4), c = `hsl(${lerp(28, 150, m)},55%,${lerp(30, 42, m)}%)`;
      o += `<rect x="${i * 60 + 2}" y="${j * 60 + 2}" width="56" height="56" rx="4" fill="${c}" stroke="#b18cff" stroke-width="${1 + 2.5 * hx * (Math.sin(t * 12 + i + j * 3) > 0 ? 1 : .2)}"/>`;
    } return `<svg width="482" height="242" style="display:block">${o}</svg>`; };
  function update(t) {
    camPath(camera, t, keys); row.spin(t);
    nodes.forEach((n, i) => { n.led.material.emissiveIntensity = (mset.has(n) ? 2.2 : 1) + .3 * Math.sin(t * 4 + i); n.dot.material.emissiveIntensity = Math.sin(t * 9 + i * 7) > .2 ? 1.5 : .25; });
    bus.forEach(f => f.update(t, .3, 1));
    const hx = ramp(t, s(1) + .3, 1); msgs.forEach(f => f.update(t, .9, hx));
    kit.header('rn', 11.5 + t / 3600, 'Slices of the plains', win(t, .4, sc.dur, .6), KICK);
    ui.el('rn-map', 'card', `<div class="cap" style="margin:0 0 10px">One slice per node · soil moisture · illustrative</div>${tiles(t, hx)}<div style="font-size:17px;color:var(--dim);margin-top:8px">${hx > .5 ? '<span style="color:#cdb6ff">■</span> edges exchanged over 200 Gb/s InfiniBand' : '32 slices · 32 nodes'}</div>`, 1300, 250, win(t, s(0) + .5, s(2) - .2, .5));
    const kwh = 31.4 + (t - s(2)) * .9;
    ui.el('rn-e', 'card', `<div class="cap" style="margin:0 0 6px">Energy for job 41827 so far · illustrative</div><div class="big mono" style="color:#cdb6ff">${Math.max(31.4, kwh).toFixed(1)} kWh</div><div style="font-size:18px;color:var(--dim);margin-top:8px">metered per node · ~0.9 kW each</div>`, 1360, 300, win(t, s(2) + .4, sc.dur, .5));
    jobCard('rn-c', 'RUNNING', '#cdb6ff', lerp(.15, .45, t / sc.dur), win(t, .8, sc.dur, .5));
  }
  return { scene, camera, update, env: .3, bloom: { strength: .8, radius: .45, threshold: .72 } };
}

// ---------- 1 PM: clouds that will not move ----------
export function overcast(sc, shared) {
  const S = kit.W0(shared, END), s = sc.s, camera = new THREE.PerspectiveCamera(42, 16 / 9, .5, 900);
  const keys = [[0, V(-20, 66, 118), V(-55, 0, 18)], [s(1) + 2, V(-70, 52, 104), V(-55, 0, 20)], [s(2) - .3, V(14, 3.4, 7), V(2.5, 1.3, .3)], [s(3) + 1, V(10.5, 2.9, 4.4), V(2.5, 1.3, .3)], [sc.dur, V(11, 3, 5), V(2.5, 1.3, .3)]];
  const ck = s(2) + 1.8, off = s(2) + 5;
  function update(t) {
    camPath(camera, t, keys);
    const h = 13 + .9 * ramp(t, 0, s(2)), cover = ease(t / (s(0) + 3));
    const job = 1 - ramp(t, off, 2), soc = .7 - .5 * clamp((t - s(1)) / (ck - s(1)));
    S.set(t, h, { camera, cloud: lerp(-240, -55, cover), storm: .3 * cover, busy: lerp(.6, .3, ramp(t, off, 2)), xray: ramp(t, s(2) - 1.2, 1.2), job }); S.flowsAt(t, [.25, .05, .7, t < off ? .9 : 0, 0]);
    kit.header('oc', h, 'Clouds that will not move', win(t, .4, sc.dur, .6), KICK);
    kit.mixCard('oc-m', { solar: lerp(.7, .22, cover), soc, batt: t < off ? 1 : 0, grid: .05, wind: .1, status: t < s(1) ? 'Heavy cloud cover' : t < ck ? 'Battery carrying the load' : 'Battery low · scheduler acts', color: t < ck ? '#7dffa5' : '#ffb020' }, win(t, s(0) + .8, s(2) + .2, .6));
    const st = t < s(1) ? ['RUNNING', '#cdb6ff'] : t < ck - .6 ? ['RUNNING · on battery', '#7dffa5'] : t < off - .5 ? ['CHECKPOINTING → local NVMe', '#7fe6ff'] : t < s(3) ? ['STATE SAVED · powering down', '#7fe6ff'] : ['SUSPENDED · waiting for the sun', '#ffd27a'];
    jobCard('oc-c', st[0], st[1], .52, win(t, .8, sc.dur, .5), t > off ? ' · nothing lost' : '');
    ui.label('oc-nv', 'Checkpoint<small>1.92 TB NVMe on every node</small>', V(2.4, 2.9, 1.8), camera, win(t, ck - .4, off + 1, .4), '#7fe6ff');
  }
  return { scene: S.scene, camera, update, exposure: 1, bloom: { strength: .45, radius: .45, threshold: .9 } };
}

// ---------- 3:15 PM: the sun returns ----------
export function resume(sc, shared) {
  const S = kit.W0(shared, END), s = sc.s, camera = new THREE.PerspectiveCamera(42, 16 / 9, .5, 900);
  const keys = [[0, V(-60, 56, 110), V(-55, 0, 18)], [s(1) - .3, V(-30, 44, 96), V(-50, 0, 16)], [s(1) + 1, V(13, 3.2, 6), V(2.5, 1.3, .3)], [s(2) - .2, V(10.5, 2.8, 4.4), V(2.5, 1.3, .3)], [sc.dur, V(70, 26, 96), V(-4, 3, 6)]];
  function update(t) {
    camPath(camera, t, keys);
    const h = 15.25 + 3 * ramp(t, s(2) - .5, 2.5), gone = ease(t / (s(0) + 5)), job = ramp(t, s(1) + 1.2, 2);
    const prog = .52 + .48 * ramp(t, s(1) + 2, s(2) - s(1) - 1);
    S.set(t, h, { camera, cloud: lerp(-55, 230, gone), storm: .3 * (1 - gone), busy: .6, xray: win(t, s(1) + .2, s(2) + .3, .9), job }); S.flowsAt(t, [.9, .05, .9, .3, 0]);
    kit.header('rs', h, prog < 1 ? 'The sun returns' : 'Complete', win(t, .4, sc.dur, .6), KICK);
    const st = t < s(1) + 1.2 ? ['SUSPENDED · sun returning', '#ffd27a'] : t < s(1) + 3 ? ['RESTORING from NVMe', '#cdb6ff'] : prog < 1 ? ['RUNNING · resumed at step 5,214', '#cdb6ff'] : ['COMPLETED ✓', '#7dffa5'];
    jobCard('rs-c', st[0], st[1], prog, win(t, .8, sc.dur, .5), prog >= 1 ? ' · 188 kWh · 81% sunlight' : '');
  }
  return { scene: S.scene, camera, update, exposure: 1, bloom: { strength: .45, radius: .45, threshold: .9 } };
}

// ---------- results travel home ----------
export function results(sc) {
  const s = sc.s, G = plains(ll(32, -135, 1), GLEAMM, HOME), camera = G.camera, center = G.C0.clone().multiplyScalar(R);
  const keys = [[0, G.above(5, -7, -2), G.at(GLEAMM)], [s(1) - .3, G.above(5.5, -6, 1), G.at(HOME)], [s(1) + 2, G.above(4.2, -6.5, -.5), ll(37.5, -101.2, R)], [s(2), G.above(4.6, -7, -.5), ll(37.8, -101, R)], [sc.dur, G.above(12, -9, 0), center]];
  function update(t) {
    camPath(camera, t, keys);
    G.pins.forEach(p => p.scale.setScalar(camera.position.distanceTo(p.position) * .03 * (1 + .2 * Math.sin(t * 5))));
    const go = win(t, .6, s(1) + 1.5, .8); G.packets.update(t, .25, go); G.line.material.opacity = .35 * go;
    G.outline.material.opacity = .9 * ramp(t, s(1) - .5, 1); G.risk.material.opacity = ramp(t, s(1) + .3, 1.6);
    kit.header('re', 18.4 + t / 3600, 'Back home', win(t, .4, sc.sentences.at(-1).start - .2, .6), KICK);
    ui.label('re-h', 'Results delivered<small>drought risk · irrigation scenarios</small>', G.at(HOME), camera, win(t, 1.4, s(1) + 1, .5), '#cdb6ff');
    ui.el('re-lg', 'card', `<div class="cap" style="margin:0 0 10px">Aquifer stress · illustrative</div><div style="width:340px;height:12px;border-radius:6px;background:linear-gradient(90deg,#2fbf71,#ffc23a,#ff4d3d)"></div><div style="display:flex;justify-content:space-between;width:340px;font-size:17px;color:var(--dim);margin-top:6px"><span>stable</span><span>most at risk</span></div><div style="font-size:20px;margin-top:12px;color:#7dffa5">careful irrigation: water saved ↑</div>`, 90, 800, win(t, s(1) + .8, s(2) + .2, .5));
    const q = win(t, s(2) + .2, sc.dur + 1, .8);
    ui.el('re-dim', '', '', 0, 0, q * .35, { width: '1920px', height: '1080px', background: '#02040a', zIndex: -1 });
    ui.el('re-q', 'h1', 'Sunlight on the High Plains,<br>helping the High Plains keep their water.', 960, 400, q, { fontSize: '58px', textAlign: 'center', transform: 'translateX(-50%)', whiteSpace: 'normal', width: '1400px' });
  }
  return { scene: G.scene, camera, update, bloom: { strength: 1, radius: .6, threshold: .7 } };
}
