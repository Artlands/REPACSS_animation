// Challenge 1: remote data center management — node telemetry streams into a live dashboard; remote control actions.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, rng, machineRow, std, flow, tube, curve, grid, V, camPath, glowSprite } from '../lib.js';

const supply = (x) => 60 + 30 * Math.sin(x * .9) + 12 * Math.sin(x * 2.7 + 1) - 25 * Math.exp(-((x - 6.2) ** 2) * 3);

function drawDash(g, t, w, h) {
  g.fillStyle = 'rgba(6,14,32,0.92)'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,180,255,.5)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#9fd6ff'; g.font = '700 30px Kalam, Avenir Next, Helvetica'; g.fillText('REPACSS · LIVE TELEMETRY', 30, 50);
  g.fillStyle = '#ff6b75'; g.beginPath(); g.arc(w - 40, 40, 9 + 2 * Math.sin(t * 6), 0, 7); g.fill();
  // panel 1: available renewable power vs cluster draw
  const px = 30, py = 80, pw = w * .58, ph = 250;
  g.fillStyle = '#7f90b0'; g.font = '22px Kalam, Avenir Next'; g.fillText('Solar supply vs. cluster power draw', px, py + 10);
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(px, py + 30 + i * 50); g.lineTo(px + pw, py + 30 + i * 50); g.stroke(); }
  const plot = (fn, color, lw) => { g.strokeStyle = color; g.lineWidth = lw; g.beginPath(); for (let i = 0; i <= 120; i++) { const x = t * .35 + i / 120 * 6; const y = py + 230 - fn(x) * 2; i ? g.lineTo(px + i / 120 * pw, y) : g.moveTo(px, y); } g.stroke(); };
  plot(supply, '#ffb53c', 4); plot(x => supply(x) * .88 - 4, '#b18cff', 4);
  g.fillStyle = '#ffb53c'; g.fillText('supply', px + pw - 90, py + 50); g.fillStyle = '#b18cff'; g.fillText('draw', px + pw - 90, py + 78);
  // panel 2: node temperature heatmap
  const hx = px + pw + 40, hy = 80; g.fillStyle = '#7f90b0'; g.fillText('Node inlet temperature', hx, hy + 10);
  for (let i = 0; i < 130; i++) { const c = i % 13, r = i / 13 | 0, v = .5 + .5 * Math.sin(i * 1.7 + t * 1.3) * Math.sin(i * .3 + t * .4);
    g.fillStyle = `hsl(${lerp(200, 0, v)},85%,${45 + v * 10}%)`; g.fillRect(hx + c * 26, hy + 30 + r * 22, 23, 19); }
  // panel 3: utilization bars
  const by = 370; g.fillStyle = '#7f90b0'; g.fillText('Utilization by rack', px, by);
  for (let i = 0; i < 7; i++) { const u = .55 + .4 * Math.sin(t * .8 + i * 1.3); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(px + i * 120, by + 20, 90, 120);
    g.fillStyle = i === 2 ? '#76e05a' : '#3fd8ff'; g.fillRect(px + i * 120, by + 140 - 120 * u, 90, 120 * u); g.fillStyle = '#cfd8ee'; g.fillText(`${91 + i}`, px + i * 120 + 28, by + 172); }
  g.fillStyle = '#cfd8ee'; g.font = '600 26px Menlo, monospace';
  g.fillText('130 nodes reporting', hx, by + 120);
}

export default function remote(sc) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050811); scene.fog = new THREE.Fog(0x050811, 30, 80);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 300);
  scene.add(new THREE.AmbientLight(0x9fb0d0, .5)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(5, 12, 10); scene.add(dl);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: .4, metalness: .5 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const gr = grid(200, 330, 0x16223a, .4); gr.position.y = .01; scene.add(gr);

  const racks = [];
  const row = machineRow(); scene.add(row.group); racks.push(...row.racks);
  // dashboard panel floating above the room
  const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 600; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })); dash.position.set(0, 10, -2); scene.add(dash);
  // telemetry streams rack -> dashboard
  const streams = racks.map((r, i) => { const c = curve([r.position.x, 4.3, r.position.z], [r.position.x * .8, 6.5, r.position.z * .6 - .5], [r.position.x * .5, 7.3, -2]); const f = flow(c, 18, i === 2 ? C.gpu : C.elec, .3, 80 + i); scene.add(f); return f; });
  // remote operator link: an arc leaving the room toward a distant site
  const op = curve([5, 10, -2], [16, 16, -8], [34, 8, -16]);
  const opIn = flow(op, 30, 0xffffff, .5, 99), opTube = tube(op, 0xffffff, .03, .2); scene.add(opIn, opTube);
  const beacon = glowSprite(0xffffff, 3); beacon.position.set(34, 8, -16); scene.add(beacon);

  const s = sc.s;
  const keys = [[0, V(-14, 5, 14), V(0, 3, -2)], [s(1), V(-8, 7.5, 25), V(0, 8, -2)], [s(2) + 1, V(3, 8, 20), V(0, 8.6, -2)], [sc.dur, V(7, 8.5, 22), V(2, 8.6, -3)]];
  const rr = rng(4), heat = racks.map(r => r.nodes.map(() => rr() * 6));
  const col = new THREE.Color();

  function update(t) {
    camPath(camera, t, keys); row.spin(t);
    racks.forEach((r, ri) => r.nodes.forEach((n, i) => {
      const v = .5 + .5 * Math.sin(heat[ri][i] + t * 1.3) * Math.sin(i * .3 + t * .4);
      n.led.material.emissive.copy(col.setHSL(lerp(.55, 0, v), .9, .55)); n.led.material.emissiveIntensity = .9;
      const drained = ri === 3 && t > s(2) + 4.5 && i > 8;
      n.dot.material.emissive.setHex(drained ? 0xffb020 : 0x40ff80);
    }));
    const tOn = ramp(t, s(0) + 1, 1.5);
    streams.forEach(f => f.update(t, .5, tOn));
    drawDash(g, t, 1400, 600); tex.needsUpdate = true;
    dash.material.opacity = ramp(t, s(0) + 1.5, 1);
    const oOn = ramp(t, s(2) + 2.5, 1); opIn.update(-t, .3, oOn); opTube.material.opacity = .25 * oOn; beacon.material.opacity = oOn;

    ui.header('r-h', 'Research challenge 1', 'Remote data center management', win(t, .4, sc.dur, .6));
    const cmds = [['power-cap  rack 94', s(2) + 3], ['drain  rack 94 · lower half', s(2) + 4.5], ['shift  preemptible queue → night', s(2) + 6], ['resume  all · energy restored', s(2) + 7.5]];
    cmds.forEach(([c, a], i) => ui.el('r-c' + i, 'chip mono', `<span style="color:#7dffa5">$</span> ${c}`, 1300, 700 + i * 70, win(t, a, sc.dur, .4), { fontSize: '22px' }));
    ui.el('r-op', 'chip', '🛰  remote operators', 1450, 600, win(t, s(2) + 2.5, sc.dur, .4), { color: '#fff' });
    ui.el('r-fac', 'card', `<div class="cap" style="margin:0">Private monitoring &amp; control network</div><div style="font-size:23px;margin-top:8px;line-height:1.55">UPS · room &amp; rack PDUs · in-row coolers<br>data center + cooling power sensors<br>outdoor temperature</div>`, 90, 780, win(t, s(3) + .3, sc.dur, .5));
    ui.label('r-tel', 'node telemetry<small>power · temperature · utilization</small>', V(-6, 6.4, 0), camera, win(t, s(2) + .5, sc.dur, .5), '#7fe6ff');
  }
  return { scene, camera, update, env: .3, bloom: { strength: .8, radius: .45, threshold: .75 } };
}
