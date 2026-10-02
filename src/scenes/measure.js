// Power instrumentation: PMUs / relays sample voltage + current; harmonic distortion per workload; energy per code.
// Harmonic profiles and ledger numbers are illustrative (marked on screen), not measurements.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, std, emis, flow, tube, curve, grid, rack, textSprite, V, camPath } from '../lib.js';

// relative current harmonic amplitudes (odd orders 1..13) per workload
const PROFILES = [
  { name: 'idle', load: .25, h: [1, .20, .12, .07, .04, .03, .02], col: '#9fb0cc' },
  { name: 'CPU · dense linear algebra', load: .85, h: [1, .05, .04, .025, .015, .01, .008], col: '#3fd8ff' },
  { name: 'GPU · LLM training', load: 1, h: [1, .08, .06, .04, .03, .022, .015], col: '#8dff6f' },
  { name: 'I/O-heavy · checkpoint write', load: .5, h: [1, .13, .08, .05, .03, .02, .012], col: '#ffc857' },
];
const ORD = [1, 3, 5, 7, 9, 11, 13];
const thd = (h) => Math.sqrt(h.slice(1).reduce((a, x) => a + x * x, 0)) / h[0];

function ribbon(n, color, w = .07) {
  const pos = new Float32Array(n * 2 * 3), idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  m.set = (x0, x1, y0, fn) => {
    for (let i = 0; i < n; i++) { const u = i / (n - 1), x = lerp(x0, x1, u), y = y0 + fn(u); pos.set([x, y - w / 2, 0, x, y + w / 2, 0], i * 6); }
    geo.attributes.position.needsUpdate = true; geo.computeBoundingSphere();
  };
  return m;
}

export default function measure(sc) {
  const s = sc.s;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x04070e);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, .1, 300);
  scene.add(new THREE.AmbientLight(0xa0b0d0, .6)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-4, 10, 10); scene.add(dl);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: .4, metalness: .5 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor); const gr = grid(200, 200, 0x16223a, .45); gr.position.y = .01; scene.add(gr);

  // feeder cable -> current transformer ring -> rack; PMU / relay reads it
  const rk = rack(); rk.position.set(-6, 0, 2); scene.add(rk);
  const feed = curve([-18, .25, 2.4], [-12, .25, 2.4], [-7.4, .25, 2.4], [-6.4, .5, 2.3]);
  scene.add(tube(feed, 0x30343c, .12, 1)); const fFlow = flow(feed, 40, C.sun, .5, 71); scene.add(fFlow);
  const ct = new THREE.Mesh(new THREE.TorusGeometry(.38, .1, 12, 32), std(0x3a3f48, { emissive: 0x3fd8ff, emissiveIntensity: .2 })); ct.rotation.y = Math.PI / 2; ct.position.set(-11, .25, 2.4); scene.add(ct);
  const pmu = new THREE.Group(); pmu.position.set(-11, 0, -.6); pmu.scale.setScalar(1.3); scene.add(pmu);
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.2), std(0x2a2f38, { metalness: .5 })); pBody.position.y = .8; pmu.add(pBody);
  const pScr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .45), emis(0x3fd8ff, 1.2)); pScr.position.set(-.5, 1.0, .61); pmu.add(pScr);
  const pLeds = Array.from({ length: 6 }, (_, i) => { const l = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .02), emis(i % 3 ? 0x40ff80 : 0xff4d5e, 1.2)); l.position.set(.4 + (i % 3) * .25, 1.1 - (i / 3 | 0) * .3, .61); pmu.add(l); return l; });
  const pT = textSprite('PMU · protective relay', { color: '#9fd6ff', h: .45 }); pT.position.set(-11, 2.8, -.6); scene.add(pT);
  const sig = curve([-11, .6, 2.1], [-11, .6, .1]); scene.add(tube(sig, 0x9fd6ff, .03, .5));
  const up = curve([-9.7, 1.4, -.6], [-8.6, 3.2, -.6], [-8.2, 5.2, -.6]); const upFlow = flow(up, 24, 0x9fd6ff, .35, 72), upTube = tube(up, 0x9fd6ff, .03, 0); scene.add(upFlow, upTube);

  // oscilloscope panel
  const SC = { x: -1, y: 6.2, w: 13, h: 5.4 };
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(SC.w + .6, SC.h + .6), new THREE.MeshBasicMaterial({ color: 0x08142a, transparent: true, opacity: .85 })); panel.position.set(SC.x, SC.y, -.65); scene.add(panel);
  const gl = []; for (let i = 0; i <= 10; i++) gl.push(V(SC.x - SC.w / 2 + i * SC.w / 10, SC.y - SC.h / 2, -.6), V(SC.x - SC.w / 2 + i * SC.w / 10, SC.y + SC.h / 2, -.6));
  for (let i = 0; i <= 6; i++) gl.push(V(SC.x - SC.w / 2, SC.y - SC.h / 2 + i * SC.h / 6, -.6), V(SC.x + SC.w / 2, SC.y - SC.h / 2 + i * SC.h / 6, -.6));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gl), new THREE.LineBasicMaterial({ color: 0x1d3a66, transparent: true, opacity: .8 })));
  const vR = ribbon(400, 0xffc46b), iR = ribbon(400, 0x3fd8ff, .085); vR.position.z = -.55; iR.position.z = -.5; scene.add(vR, iR);
  const vT = textSprite('voltage', { color: '#ffc46b', h: .4 }); vT.position.set(SC.x - SC.w / 2 + 1, SC.y + SC.h / 2 - .4, -.5); scene.add(vT);
  const iT = textSprite('current', { color: '#7fe6ff', h: .4 }); iT.position.set(SC.x - SC.w / 2 + 2.6, SC.y + SC.h / 2 - .4, -.5); scene.add(iT);

  // harmonic spectrum bars
  const SP = { x: 8.2, y: 3.6, dx: .85 };
  const bars = ORD.map((o, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(.6, 1, .6), emis(i ? 0xff6a8a : 0x3fd8ff, 1.2)); b.position.set(SP.x + i * SP.dx, SP.y, -.5); scene.add(b);
    const t = textSprite(String(o), { color: '#8ea3c9', h: .32, mono: true }); t.position.set(SP.x + i * SP.dx, SP.y - .35, -.5); scene.add(t); return b; });
  const spT = textSprite('harmonic order (× 60 Hz)', { color: '#8ea3c9', h: .34 }); spT.position.set(SP.x + 3 * SP.dx, SP.y - .85, -.5); scene.add(spT);
  const spBase = new THREE.Mesh(new THREE.BoxGeometry(6.4, .04, .7), std(0x334)); spBase.position.set(SP.x + 3 * SP.dx, SP.y - .02, -.5); scene.add(spBase);

  const keys = [[0, V(-4, 5.5, 25), V(-1, 4.5, 0)], [s(1) - .2, V(-6, 4.5, 22), V(-5, 3.4, 0)], [s(1) + 4, V(-5, 5, 23), V(-4, 3.8, 0)],
    [s(2) + .5, V(1, 6, 21), V(0, 5, 0)], [s(3) + .5, V(2, 5.5, 22), V(1.5, 4.8, 0)], [s(4) + .3, V(1, 7, 25), V(2, 4.2, 0)], [sc.dur, V(2, 7, 26), V(2, 4.2, 0)]];

  // workload schedule during sentence 3 (and held through 4)
  const wl = (t) => { const a = s(3) + .6, d = (s(4) + 3.5 - a) / 4; if (t < a) return [0, 0, 0]; const k = Math.min(3, Math.floor((t - a) / d)), u = Math.min(1, ((t - a) - k * d) / .8); return [k, u, 1]; };

  function update(t) {
    camPath(camera, t, keys);
    const on = ramp(t, .4, 1), dist = ramp(t, s(2) + 1.5, 2);
    const [k, u] = wl(t), prev = PROFILES[Math.max(0, k - 1)], cur = PROFILES[k];
    const P = t < s(3) + .6 ? { load: .85, h: PROFILES[2].h } : { load: lerp(prev.load, cur.load, u), h: cur.h.map((x, i) => lerp(prev.h[i], x, u)) };
    const H = P.h.map((x, i) => i ? x * dist * 2.2 : x);   // exaggerated for visibility, as labelled
    const tt = t * 2.2, amp = SC.h * .38;
    vR.set(SC.x - SC.w / 2, SC.x + SC.w / 2, SC.y, (x) => on * amp * .92 * Math.sin(2 * Math.PI * (x * 3 - tt)));
    iR.set(SC.x - SC.w / 2, SC.x + SC.w / 2, SC.y, (x) => on * amp * P.load * .85 * ORD.reduce((a, o, i) => a + H[i] * Math.sin(2 * Math.PI * o * (x * 3 - tt) - .4 - i * .7), 0));
    iR.material.color.setHex(dist > .3 ? 0x7fe6ff : 0x3fd8ff);
    bars.forEach((b, i) => { const h = Math.max(.02, 3 * (i ? P.h[i] * 2 * dist : 1) * ramp(t, s(2) + 1, 1.2)); b.scale.y = h; b.position.y = SP.y + h / 2; });
    fFlow.update(t, .3, on); const sOn = ramp(t, s(1) + 1, 1); upFlow.update(t, .5, sOn); upTube.material.opacity = .3 * sOn;
    ct.material.emissiveIntensity = .2 + 1.2 * sOn * (.6 + .4 * Math.sin(t * 8));
    pLeds.forEach((l, i) => l.material.emissiveIntensity = (Math.sin(t * 7 + i * 2) > 0 ? 1.6 : .3) * (i % 3 ? 1 : .5));
    rk.nodes.forEach((n, i) => n.led.material.emissiveIntensity = .5 + P.load * (.6 + .3 * Math.sin(t * 6 + i)));

    // overlay
    ui.header('m-h', 'Power instrumentation', 'Measuring every watt — and its waveform', win(t, .4, sc.dur, .6), '#9fd6ff');
    ui.el('m-pmu', 'card', `<div class="cap" style="margin:0">Facility instrumentation</div><div style="font-size:23px;margin-top:8px;line-height:1.55">phasor measurement units · relays<br>synchronized V &amp; I waveforms<br>data center + cooling power sensors</div>`, 1330, 760, win(t, s(1) + .5, s(2) + .4, .5));
    const T = thd(P.h.map((x, i) => i ? x * dist : x)) * 100;
    ui.el('m-thd', 'card', `<div class="cap" style="margin:0 0 6px">Current THD</div><div class="big mono" style="font-size:46px;color:${T > 12 ? '#ff8a94' : '#7fe6ff'}">${T.toFixed(1)}%</div><div class="cap" style="text-transform:none;letter-spacing:0;font-size:16px;margin-top:8px">√(Σ Iₙ²) / I₁ · illustrative · bars ×2 for visibility</div>`, 1440, 780, win(t, s(2) + 1.6, sc.dur, .5), { width: '320px' });
    ui.el('m-wl', 'chip', `<span style="color:${cur.col}">●</span>&nbsp; workload: <b>${cur.name}</b>`, 90, 196, win(t, s(3) + .6, s(4) + 4, .4), { fontSize: '24px' });
    const L = ramp(t, s(4) + .6, 5.5), rows = [['climate-model', 'MPI · 64 CPU nodes', 412.6], ['llm-finetune', '8 × H100', 96.3], ['genomics-array', '200 tasks', 38.1], ['viz-render', '1 GPU node', 4.7]];
    ui.el('m-led', 'card', `<div class="cap" style="margin:0 0 10px">Energy per code · illustrative</div>` + rows.map(([n, d, e], i) => `<div class="mono" style="font-size:20px;line-height:1.7;opacity:${ramp(t, s(4) + .6 + i * .6, .4)}"><span style="color:#cdb6ff">${n.padEnd(15, ' ')}</span><span style="color:var(--dim)">${d.padEnd(19, ' ')}</span><b>${(e * L).toFixed(1).padStart(6, ' ')} kWh</b></div>`).join(''), 1290, 170, win(t, s(4) + .3, sc.dur, .5));
  }
  return { scene, camera, update, env: .3, bloom: { strength: .8, radius: .45, threshold: .72 } };
}
