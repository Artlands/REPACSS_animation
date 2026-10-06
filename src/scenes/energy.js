// The GLEAMM microgrid as REPACSS sees it: five sources on one AC bus -> UPS -> cluster.
// Each sentence switches the flows: battery smoothing, grid outage + generator, grid for priority work, wind.
// Wind does not feed REPACSS directly: it flows into the utility grid and arrives as low-priced grid power.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, rng, solarArray, rack, std, emis, flow, tube, cable, grid, textSprite, V, camPath, glowSprite } from '../lib.js';

// a day of jagged solar vs. the smoothed power the battery delivers (for the chart card)
const sol = (h) => { const b = Math.max(0, Math.sin(Math.PI * (h - 6.5) / 13)) ** 1.2;
  const c = [[10.2, .25], [11.1, .18], [12.6, .3], [13.4, .22], [14.8, .35], [15.5, .2]].reduce((a, [m, w]) => a - .55 * Math.exp(-(((h - m) / w) ** 2)), 1);
  return b * c; };
const smooth = (h) => { let a = 0, n = 0; for (let d = -1.2; d <= 1.2; d += .1) { a += sol(h + d); n++; } return a / n; };

function chartSVG(p) {
  const W = 520, H = 200, X = (h) => 20 + (h - 5) / 15 * (W - 40), Y = (v) => H - 24 - v * (H - 50);
  const n = Math.round(150 * p), ps = [], pm = [], ch = [], dis = [];
  for (let i = 0; i <= n; i++) { const h = 5 + i / 150 * 15, a = sol(h), b = smooth(h);
    ps.push(`${X(h)},${Y(a)}`); pm.push(`${X(h)},${Y(b)}`);
    ch.push(`${X(h)},${Y(Math.max(a, b))}`); dis.push(`${X(h)},${Y(Math.min(a, b))}`); }
  const area = (top, bot) => top.length ? `M${top.join('L')}L${[...bot].reverse().join('L')}Z` : '';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">
  <line x1="20" y1="${H - 24}" x2="${W - 20}" y2="${H - 24}" stroke="#556"/>
  <path d="${area(ch, pm)}" fill="#7dffa5" opacity=".28"/><path d="${area(pm, dis)}" fill="#3fd8ff" opacity=".22"/>
  <polyline points="${ps}" fill="none" stroke="#ffb53c" stroke-width="2.5"/><polyline points="${pm}" fill="none" stroke="#ffffff" stroke-width="3.5"/>
  <text x="24" y="20" fill="#ffb53c" font-size="15">solar output (clouds)</text><text x="24" y="40" fill="#fff" font-size="15">delivered to cluster</text>
  <text x="300" y="20" fill="#7dffa5" font-size="15">■ charging</text><text x="400" y="20" fill="#7fe6ff" font-size="15">■ discharging</text>
  <text x="${X(6)}" y="${H - 6}" fill="#8ea3c9" font-size="13">6 AM</text><text x="${X(12) - 16}" y="${H - 6}" fill="#8ea3c9" font-size="13">NOON</text><text x="${X(18) - 10}" y="${H - 6}" fill="#8ea3c9" font-size="13">6 PM</text></svg>`;
}

export default function energy(sc) {
  const s = sc.s;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050914);
  scene.fog = new THREE.Fog(0x050914, 45, 110);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, .1, 400);
  const amb = new THREE.AmbientLight(0xb0c0e0, .7); scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-8, 16, 12); scene.add(key);
  scene.add(grid(120, 120, 0x1a2a50, .45));

  // ---- sources along the back (z = -8), one AC bus (z = -1), UPS and cluster in front right ----
  const SX = { solar: -18, wind: -10, grid: -3, gen: 10, batt: 18 }, SZ = -8;
  const label = (txt, sub, col, x, y, z) => { const a = textSprite(txt, { color: col, h: .75 }); a.position.set(x, y, z); scene.add(a);
    const b = textSprite(sub, { color: '#aab6cc', h: .5, font: '400 96px "Avenir Next", Helvetica' }); b.position.set(x, y - .72, z); scene.add(b); return [a, b]; };
  const groups = {};
  // solar
  const pv = solarArray(3, 7, .55); pv.position.set(SX.solar - 3.2, 0, SZ - 3.2); scene.add(pv); groups.solar = pv;
  label('Solar', '350 kW', '#ffc46b', SX.solar, 4.4, SZ);
  // wind
  const wind = new THREE.Group(); wind.position.set(SX.wind, 0, SZ - 1); scene.add(wind); groups.wind = wind;
  const white = std(0xeef1f4, { metalness: .1, roughness: .5 });
  const tw = new THREE.Mesh(new THREE.CylinderGeometry(.15, .26, 5, 12), white); tw.position.y = 2.5; wind.add(tw);
  const nac = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, 1.1), white); nac.position.y = 5.1; wind.add(nac);
  const rotor = new THREE.Group(); rotor.position.set(0, 5.1, .65); wind.add(rotor);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.24, 2.4, .06), white); b.geometry.translate(0, 1.2, 0); b.rotation.z = k * 2.094; b.position.z = k * .012; rotor.add(b); }
  label('Wind', 'via the utility grid', '#cfe8ff', SX.wind + 3.2, 4.4, SZ);
  // utility grid
  const gridG = new THREE.Group(); gridG.position.set(SX.grid, 0, SZ); scene.add(gridG); groups.grid = gridG;
  const wood = std(0x7a6248, { metalness: 0, roughness: .9 });
  for (const z of [-6, -1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 6, 8), wood); p.position.set(0, 3, z); gridG.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, .14, .14), wood); arm.position.set(0, 5.7, z); gridG.add(arm); }
  const xf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.4), std(0x5f7f5a)); xf.position.set(0, .7, 1); gridG.add(xf);
  label('Utility grid', 'commercial power', '#e4e8f0', SX.grid, 7.4, SZ);
  // generator
  const gen = new THREE.Group(); gen.position.set(SX.gen, 0, SZ); scene.add(gen); groups.gen = gen;
  const gb = new THREE.Mesh(new THREE.BoxGeometry(4, 1.8, 1.6), std(0xe4e4df, { roughness: .6 })); gb.position.y = 1.05; gen.add(gb);
  const gs = new THREE.Mesh(new THREE.BoxGeometry(4.2, .2, 1.8), std(0x222428)); gs.position.y = .1; gen.add(gs);
  const exhaust = Array.from({ length: 10 }, (_, i) => { const p = glowSprite(0x9aa3b0, 1, 0); p.position.set(1.3, 2.4, 0); gen.add(p); return p; });
  label('Diesel generator', '500 kW · auto transfer', '#ffb07a', SX.gen, 3.8, SZ);
  // battery
  const batt = new THREE.Group(); batt.position.set(SX.batt, 0, SZ); scene.add(batt); groups.batt = batt;
  const cb = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2, 1.8), std(0xe9e3d2, { roughness: .7 })); cb.position.set(0, 1, -.6); batt.add(cb);
  const socBars = Array.from({ length: 8 }, (_, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.4, .7, .05), emis(0x7dffa5, 1.5)); m.position.set(-1.75 + i * .5, 1.1, .32); batt.add(m); return m; });
  label('Battery', '550 kWh', '#7dffa5', SX.batt, 3.8, SZ);

  // bus, UPS, cluster
  const bus = new THREE.Mesh(new THREE.BoxGeometry(40, .16, .16), emis(0xffe2a0, .8)); bus.position.set(0, .35, -1); scene.add(bus);
  const busT = textSprite('AC bus · switchgear', { color: '#ffe2a0', h: .5 }); busT.position.set(-14, 1.1, -1); scene.add(busT);
  const ups = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.4), std(0x2d3a52, { metalness: .5 })); ups.position.set(1.5, 1.1, 5); scene.add(ups);
  const upsL = new THREE.Mesh(new THREE.BoxGeometry(1, .1, .02), emis(0x7dffa5, 1.5)); upsL.position.set(1.5, 1.6, 5.72); scene.add(upsL);
  const upsT = textSprite('UPS', { color: '#7dffa5', h: .55 }); upsT.position.set(-.1, 1.6, 5.4); scene.add(upsT);
  const cl = new THREE.Group(); cl.position.set(4, 0, 5); scene.add(cl);
  const racks = Array.from({ length: 3 }, (_, i) => { const r = rack(); r.position.x = i * 1.08; r.scale.setScalar(.75); cl.add(r); return r; });
  const clT = textSprite('REPACSS cluster', { color: '#ff8a94', h: .55 }); clT.position.set(5.1, 3.9, 5); scene.add(clT);

  // flows: each source -> bus; bus -> UPS -> cluster
  const mk = (cv, col, seed) => { const f = flow(cv, 50, col, .6, seed), tb = tube(cv, col, .06, .2); scene.add(f, tb); f.tb = tb; return f; };
  const F = {
    solar: mk(cable([SX.solar, .3, SZ + 1.5], [SX.solar, .3, -1.1], .4), C.sun, 1),
    wind: mk(cable([SX.wind + .4, .3, SZ - 1], [SX.grid - .3, .3, SZ - 1], .6), 0xcfe8ff, 2),   // wind → utility grid, not the bus
    grid: mk(cable([SX.grid, .3, SZ + 1.8], [SX.grid, .3, -1.1], .4), 0xe4e8f0, 3),
    gen: mk(cable([SX.gen, .3, SZ + .8], [SX.gen, .3, -1.1], .4), 0xffb07a, 4),
    batt: mk(cable([SX.batt, .3, SZ + .4], [SX.batt, .3, -1.1], .4), 0x7dffa5, 5),
    ups: mk(cable([1.5, .3, -.9], [1.5, .3, 4.3], .3), 0xffffff, 6),
    load: mk(cable([2.3, .3, 5], [3.6, .3, 5], .5), 0xffffff, 7),
  };
  const outageX = textSprite('✕', { color: '#ff4d5e', h: 1.6 }); outageX.position.set(SX.grid, 2.2, -4.2); scene.add(outageX);

  // cloud over the solar array
  const cloud = new THREE.Group(); scene.add(cloud); const r = rng(14);
  for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.8 + r() * 1, 18, 12), new THREE.MeshStandardMaterial({ color: 0xdfe6f2, transparent: true, opacity: .9, roughness: 1 }));
    b.position.set((r() - .5) * 5, (r() - .5) * 1, (r() - .5) * 1.6); cloud.add(b); }

  const keys = [
    [0, V(0, 15, 34), V(0, 1.2, -2)],
    [s(1) - .3, V(-1, 14, 32), V(0, 1.2, -2)],
    [s(1) + 3, V(6, 12, 28), V(4, 1.2, -3)],
    [s(2) + 1, V(-2, 15, 34), V(-2, 1.2, -2)],
    [s(3) + 1, V(2, 12, 28), V(2, 1.4, -2)],
    [s(3) + 6, V(4, 11, 26), V(3, 1.4, -2)],
    [s(4) + 1, V(0, 12, 28), V(-1, 1.4, -2)],
    [s(5) + .5, V(-6, 11, 26), V(-6, 2, -4)],
    [s(6) + .3, V(0, 15, 34), V(2, 1.2, -2)],
    [sc.dur, V(0, 16, 36), V(2, 1.2, -2)],
  ];

  function update(t) {
    camPath(camera, t, keys);
    // ---- operating state per sentence ----
    const appear = (k, i) => ramp(t, .6 + i * .45, .5);
    ['solar', 'wind', 'grid', 'gen', 'batt'].forEach((k, i) => { const a = Math.max(.001, appear(k, i)); groups[k].scale.setScalar(a); });
    const cloudIn = win(t, s(1) + 2.2, s(2) + 6.5, 1.2);
    const outage = win(t, s(3) + .3, s(4) + .2, .3);
    const nightT = win(t, s(4) + .4, s(5) - .2, .8);
    const sunP = (1 - .75 * cloudIn) * (1 - .9 * nightT);
    const windP = ramp(t, s(5) + .4, 1) * (1 - ramp(t, s(6) + 1.5, 1) * .3);
    const charging = t < s(1) + 2.4 || t > s(6) ? 1 : 0;
    const discharge = cloudIn;
    const ride = win(t, s(3) + .4, s(3) + 3.0, .3);          // UPS bridge
    const genOn = ramp(t, s(3) + 2.6, .8) * (1 - ramp(t, s(4) + .1, .6));
    const gridOn = (1 - outage) * Math.max(windP, t < s(3) ? .25 : t < s(5) ? .25 + .75 * nightT : .25 + .3 * ramp(t, s(6), 1));
    const all = ramp(t, s(6) + .3, 1);

    F.solar.update(t, .3, sunP); F.solar.tb.material.opacity = .08 + .25 * sunP;
    F.wind.update(t, .3, windP); F.wind.tb.material.opacity = .08 + .25 * windP; rotor.rotation.z = t * (.6 + 2.4 * windP);
    F.grid.update(t, .3, gridOn); F.grid.tb.material.opacity = .08 + .25 * gridOn;
    F.gen.update(t, .3, genOn * (1 - all * .6)); F.gen.tb.material.opacity = .08 + .25 * genOn;
    const bChg = charging * (1 - discharge) * ramp(t, s(1), 1), bDis = Math.max(discharge, ramp(t, s(3) + 2.2, .4) * (1 - ramp(t, s(3) + 3.4, .6)) * .5);
    F.batt.update(t, bDis > bChg ? .3 : -.3, Math.max(bChg, bDis)); F.batt.tb.material.opacity = .08 + .25 * Math.max(bChg, bDis);
    F.ups.update(t, .3, 1 - .8 * ride); F.load.update(t, .3, 1);
    upsL.material.emissive.setHex(ride > .1 ? 0xffb020 : 0x7dffa5); upsL.material.emissiveIntensity = 1.5 + 2 * ride * (Math.sin(t * 14) > 0 ? 1 : .2);
    outageX.material.opacity = outage * (.7 + .3 * Math.sin(t * 8));
    bus.material.emissiveIntensity = .8 + .6 * (1 - ride);
    const soc = clampSoc(.55 + .35 * ramp(t, s(1), 2.4) - .4 * ramp(t, s(1) + 2.6, 6) + .25 * ramp(t, s(2) + 7, 4));
    socBars.forEach((b, i) => { const on = i < Math.round(soc * 8); b.material.emissiveIntensity = on ? 1.6 : .05; b.material.emissive.setHex(soc < .3 ? 0xffb020 : 0x7dffa5); });
    exhaust.forEach((p, i) => { const u = ((t * .7 + i / 10) % 1); p.position.set(1.3 + u * .4, 2.2 + u * 2.4, 0); p.scale.setScalar(.4 + u * 1.4); p.material.opacity = genOn * .35 * (1 - u); });
    cloud.position.set(lerp(-34, SX.solar, ramp(t, s(1) + 1.2, 2.2)) + lerp(0, -22, ramp(t, s(2) + 5.5, 3)), 5.6, SZ - 1);
    cloud.visible = t > s(1) + 1 && t < s(3);
    key.intensity = 1.7 * (1 - .6 * nightT); amb.intensity = .7 * (1 - .4 * nightT);
    racks.forEach((rk, ri) => rk.nodes.forEach((n, i) => { n.led.material.emissiveIntensity = .8 + .3 * Math.sin(t * 4 + i + ri); n.led.material.emissive.setHex(nightT > .4 && ri < 2 && i % 3 ? 0x334050 : 0x3fd8ff); }));

    // ---- overlay ----
    ui.header('en-h', 'The microgrid', 'More than sunlight', win(t, .4, sc.dur, .6), '#7dffa5');
    const mode = t < s(1) ? '' : t < s(1) + 2.4 ? 'Sun strong → battery charging' : t < s(3) ? 'Cloud passing → battery discharging' : t < s(3) + 2.6 ? 'GRID OUTAGE → UPS bridging' : t < s(4) ? 'Generator carrying the load' : t < s(5) ? 'After sunset → grid powers priority jobs' : t < s(6) ? 'Wind blowing → low-cost power via the grid' : 'Sources chosen by cost & availability';
    const modeCol = t < s(3) ? '#7dffa5' : t < s(4) ? '#ffb07a' : t < s(5) ? '#e4e8f0' : t < s(6) ? '#cfe8ff' : '#ffe2a0';
    ui.el('en-m', 'chip', `<span style="color:${modeCol}">●</span>&nbsp; ${mode}`, 90, 196, mode ? win(t, s(1), sc.dur, .4) : 0, { fontSize: '24px' });
    ui.el('en-c', 'card', `<div class="cap" style="margin:0 0 8px">Battery smoothing · one cloudy day</div>${chartSVG(ramp(t, s(2) + .2, 6))}`, 1290, 640, win(t, s(2), s(3) - .2, .5));
    ui.el('en-u', 'card', `<div class="cap" style="margin:0">Ride-through</div><div style="font-size:23px;margin-top:8px;line-height:1.55">grid fails → <b style="color:#7dffa5">UPS</b> holds the load<br>automatic transfer switch → <b style="color:#ffb07a">generator</b><br>500 kW · jobs keep running</div>`, 90, 800, win(t, s(3) + .6, s(4) - .2, .5));
    ui.el('en-g', 'card', `<div class="cap" style="margin:0">Commercial grid</div><div style="font-size:23px;margin-top:8px;line-height:1.55">high-priority workloads<br>keep running, day or night</div>`, 90, 820, win(t, s(4) + .6, s(5) - .2, .5));
    const rows = [['Solar', '350 kW', '#ffc46b', 'lowest cost · daytime'], ['Battery', '550 kWh', '#7dffa5', 'smooths short swings'], ['Wind', 'via utility grid', '#cfe8ff', 'low price when blowing'], ['Utility grid', 'commercial', '#e4e8f0', 'priority work · priced'], ['Diesel generator', '500 kW', '#ffb07a', 'backup · outages']];
    ui.el('en-p', 'card', `<div class="cap" style="margin:0 0 8px">Selected by cost &amp; availability</div>` + rows.map(([n, v, c, d]) => `<div style="font-size:21px;line-height:1.6"><b style="color:${c}">${n}</b> <span style="color:var(--dim)">· ${v} · ${d}</span></div>`).join(''), 1300, 640, win(t, s(6) + .4, sc.dur, .5));
  }
  return { scene, camera, update, env: .25, bloom: { strength: .8, radius: .45, threshold: .75 } };
}

const clampSoc = (x) => Math.min(1, Math.max(0, x));
