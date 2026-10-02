// "One Day at REPACSS": a 24-hour time-lapse of the GLEAMM site, pre-dawn to the next night.
// Reuses the site from site.js with a time-of-day light model, plus stars, cloud shadows, rain, lightning and turbine
// aviation lights; noon happens inside the machine room. The outro scene is reused for the end card.
// Power-mix values on screen are illustrative (labeled so); facility figures follow the approved script.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, clamp, rng, V, camPath, glowSprite, machineRow, std, emis, flow, curve, grid } from '../lib.js';
import { buildSite } from './site.js';

const SUNRISE = 6.85, SUNSET = 21.0;   // a West Texas summer day (CDT)
/** unit vector toward the sun at hour h: rises east (+x) a little north, crosses the south (+z), sets west */
function sunDir(h) {
  const u = (h - SUNRISE) / (SUNSET - SUNRISE), a = Math.PI * u, e = Math.sin(Math.PI * u) * 1.35;
  const hz = V(Math.cos(a), 0, Math.sin(a) * .9 - .2).normalize();
  return hz.multiplyScalar(Math.cos(e)).add(V(0, Math.sin(e), 0)).normalize();
}

function world() {
  const S = buildSite(), scene = S.scene, r = rng(5);
  S.sky = scene.children.find(o => o.material?.side === THREE.BackSide);
  // stars
  const n = 2600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = r() * 6.283, e = Math.asin(.04 + r() * .96); pos.set([Math.cos(a) * Math.cos(e) * 370, Math.sin(e) * 370, Math.sin(a) * Math.cos(e) * 370], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  S.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  scene.add(S.stars);
  // cloud bank (~160 m E-W): real shadows sweep the array as it drifts east
  S.clouds = new THREE.Group(); scene.add(S.clouds);
  const cm = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 1, metalness: 0 });
  for (let i = 0; i < 46; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(7 + r() * 9, 16, 10), cm);
    b.position.set((r() - .5) * 150, r() * 4, (r() - .5) * 70); b.scale.y = .45; b.castShadow = true; S.clouds.add(b);
  }
  // rain: short slanted streaks in a box that follows the camera
  const R = 5000, rp = new Float32Array(R * 6); S.drops = Array.from({ length: R }, () => [(r() - .5) * 120, r() * 40, (r() - .5) * 120]);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  S.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab9d0, transparent: true, opacity: 0, depthWrite: false })); scene.add(S.rain);
  // lightning bolt far to the west
  const pts = [], lr = rng(8); let p = V(-250, 175, -110);
  while (p.y > 0) { pts.push(p.clone()); p = p.add(V((lr() - .5) * 18, -14 - lr() * 10, (lr() - .5) * 10)); }
  pts.push(V(p.x, 0, p.z));
  S.bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 120, .9, 6), new THREE.MeshBasicMaterial({ color: 0xe8f0ff, fog: false, transparent: true }));
  scene.add(S.bolt);
  // red aviation lights on the turbine nacelles
  S.avia = S.turbines.map(rt => { const g = glowSprite(0xff2a2a, 7, 0); g.position.set(0, 53.6, 0); rt.parent.add(g); return g; });

  const white = new THREE.Color(1, 1, 1), night = new THREE.Color(0x0a1228), warm = new THREE.Color(0xffb27a), gray = new THREE.Color(0x262c36), fog0 = new THREE.Color(0xb7c4d6);
  /** set sky, sun, stars and weather for hour h; storm 0..1, rain 0..1 */
  S.set = (t, h, { storm = 0, rain = 0, cloud = null, flash = 0, camera } = {}) => {
    const d = sunDir(h), el = d.y, day = clamp((el + .12) / .3), low = 1 - clamp(el / .35);
    S.sunL.position.copy(S.sunL.target.position).addScaledVector(d, 150);
    S.sunL.intensity = 2.6 * clamp(el * 5) * (1 - .85 * storm);
    S.sunL.color.setHex(0xfff1d6).lerp(new THREE.Color(0xff9a50), low * .8);
    S.hemi.intensity = lerp(.07, 1.1, day) * (1 - .6 * storm) + 3 * flash;
    S.hemi.color.setHex(0x5a6f9a).lerp(new THREE.Color(0xcfe3ff), day);
    const tint = night.clone().lerp(white, day).lerp(warm, low * day * .55).lerp(gray, storm * .9).lerp(white, flash * .6);
    S.sky.material.color.copy(tint); S.scene.fog.color.copy(fog0).multiply(tint);
    S.scene.environmentIntensity = lerp(.06, .45, day) * (1 - .55 * storm) + flash;   // the studio env map would light the night
    S.scene.fog.near = lerp(120, 30, storm); S.scene.fog.far = lerp(420, 230, storm);
    S.sunDisc.position.copy(d).multiplyScalar(300); S.sunDisc.material.opacity = clamp(el * 8 + .4) * (1 - storm) * .9;
    S.sunDisc.material.color.setHex(0xfff3cf).lerp(new THREE.Color(0xff8a3c), low);
    S.stars.material.opacity = (1 - day) * (1 - storm);
    S.avia.forEach((g, i) => g.material.opacity = (1 - day * .8) * (((t + i * .6) % 2) < .3 ? 1 : .05));
    S.clouds.visible = cloud !== null;
    if (cloud !== null) S.clouds.position.set(cloud, 0, 22).addScaledVector(d, 48 / Math.max(d.y, .2));   // shadow lands at (cloud, 22)
    S.rain.material.opacity = rain * .45;
    if (rain > 0) {
      const a = S.rain.geometry.attributes.position.array, c = camera.position;
      S.drops.forEach(([x, y, z], i) => { const yy = ((y - t * 28) % 40 + 40) % 40; a.set([c.x + x, yy, c.z + z, c.x + x + .35, yy + 1.4, c.z + z], i * 6); });
      S.rain.geometry.attributes.position.needsUpdate = true;
    }
    S.bolt.visible = flash > .05; S.bolt.material.opacity = clamp(flash * 1.5);
  };
  /** flow densities: solar, grid, building bus, battery, generator */
  S.flowsAt = (t, dens) => {
    S.flows.forEach((f, i) => f.dens = dens[i]);
    S.animate(t);
    S.flows.forEach(f => f.tube.material.opacity = .35 * clamp(f.dens * 2));
  };
  return S;
}
const W0 = (shared) => { shared.site ??= buildSite(); return shared.day ??= world(); };   // outro uses its own clean site

// ---------- overlay helpers ----------
const clock = (h) => { const m = Math.floor(((h % 24) + 24) % 24 * 60), hh = Math.floor(m / 60); return `${(hh + 11) % 12 + 1}:${String(m % 60).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
function header(id, h, title, op) {
  ui.el(id + 'sc', '', '', 0, 0, op, { width: '1920px', height: '300px', background: 'linear-gradient(rgba(2,6,16,.7),rgba(2,6,16,0))', zIndex: -1 });
  ui.el(id + 'k', 'kicker', 'One day at REPACSS', 90, 70, op);
  ui.el(id + 't', 'h1', `<span class="mono" style="color:var(--sun)">${clock(h)}</span>&nbsp;&nbsp;${title}`, 90, 104, op, { fontSize: '52px' });
}
/** 24-hour strip along the bottom: 4 AM → 4 AM, with the day's events */
function dayBar(id, h, op) {
  const X = (hr) => ((hr - 4 + 24) % 24) / 24 * 1740, w = 1740;
  const ev = [[6.85, '☀ sunrise'], [13.9, 'solar noon'], [15.5, '☁ clouds'], [18.33, '⚡ storm'], [21, 'sunset'], [22, '🌬 wind']];
  ui.el(id, '', `<div style="position:relative;width:${w}px;height:40px">
    <div style="position:absolute;top:22px;width:${w}px;height:4px;border-radius:2px;background:rgba(255,255,255,.12)"></div>
    <div style="position:absolute;top:22px;width:${X(h)}px;height:4px;border-radius:2px;background:linear-gradient(90deg,#3a4f8a,#ffb53c 40%,#ffb53c 60%,#3a4f8a)"></div>
    ${ev.map(([e, n]) => `<div style="position:absolute;left:${X(e)}px;top:0;transform:translateX(-50%);font-size:14px;color:${h >= e ? '#e8eefc' : '#5d6b85'}">${n}</div>`).join('')}
    <div style="position:absolute;left:${X(h) - 7}px;top:17px;width:14px;height:14px;border-radius:7px;background:#fff;box-shadow:0 0 14px #ffd27a"></div></div>`, 90, 1000, op);
}
/** power-source card: solar 0..1 of 350 kW, soc 0..1, batt +discharging/-charging, grid 0..1 (-1 outage), wind, gen */
function mixCard(id, m, op) {
  const row = (name, col, v, txt) => `<div style="display:flex;align-items:center;gap:14px;font-size:20px;line-height:1.85"><span style="width:118px;color:${col}">${name}</span><div style="width:280px;height:10px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:${clamp(v) * 280}px;height:10px;background:${col}"></div></div><span style="width:210px;color:#c4cee0;font-size:17px">${txt}</span></div>`;
  const b = m.batt ?? 0, g = m.grid ?? 0;
  ui.el(id, 'card', `<div class="cap" style="margin:0 0 8px">Power sources · illustrative</div>`
    + row('Solar', '#ffb53c', m.solar, `${Math.round(m.solar * 350)} kW of 350`)
    + row('Battery', '#7dffa5', m.soc, `${Math.round(m.soc * 100)}% · ${b > .05 ? 'discharging' : b < -.05 ? 'charging' : 'standby'}`)
    + row('Grid', g < 0 ? '#ff6b75' : '#e4e8f0', Math.max(g, 0), g < 0 ? '<b style="color:#ff6b75">OUTAGE</b>' : g > .04 ? 'importing' : 'standby')
    + row('Wind', '#9fd6ff', m.wind ?? 0, (m.wind ?? 0) > .05 ? 'turning' : 'calm')
    + row('Generator', '#ffb07a', m.gen ?? 0, (m.gen ?? 0) > .05 ? '500 kW diesel · running' : 'standby')
    + `<div style="margin-top:10px;font-size:20px;color:${m.color || '#7dffa5'}">● ${m.status}</div>`, 90, 640, op);
}
const siteCam = () => new THREE.PerspectiveCamera(42, 16 / 9, .5, 900);
const look = { exposure: 1, bloom: { strength: .45, radius: .45, threshold: .9 } };

// ---------- 4:30 AM ----------
export function predawn(sc, shared) {
  const S = W0(shared), s = sc.s, camera = siteCam();
  const keys = [
    [0, V(46, 5, -64), V(-40, 120, -250)],
    [s(1) - .5, V(44, 6, -60), V(-30, 90, -250)],
    [s(1) + 3.5, V(30, 9, -36), V(0, 3, 0)],
    [s(2) + .2, V(18, 4.5, 9), V(6, 3.2, 1.5)],
    [s(3) - .3, V(15, 4.2, 7), V(6, 3.2, 1.5)],
    [s(3) + 2.5, V(2, 6, -22), V(-90, 26, -200)],
    [s(4) - .2, V(-2, 6, -18), V(-100, 30, -220)],
    [s(4) + 3, V(-26, 6, 6), V(200, 18, -50)],
    [sc.dur, V(-30, 6.5, 8), V(200, 22, -50)],
  ];
  const tEnd = sc.sentences.at(-1).end;
  function update(t) {
    camPath(camera, t, keys);
    const h = lerp(4.5, 4.75, t / s(4)) + 1.2 * ramp(t, s(4), sc.dur - s(4));   // time-lapse toward first light at the end
    S.set(t, h, { camera }); S.flowsAt(t, [0, .45, .7, 0, 0]);
    const hd = win(t, .6, tEnd + .3, .7);
    header('pd', h, 'Waiting for the sun', hd);
    ui.label('pd-dc', 'REPACSS<small>inside the GLEAMM building</small>', V(6.4, 4.4, 1.5), camera, win(t, s(2) + .6, s(3) - .2, .5), '#7fe6ff');
    ui.label('pd-wd', 'Wind turbines<small>interconnected · turning tonight</small>', V(-155, 78, -255), camera, win(t, s(3) + 2.2, s(4) - .2, .5), '#cfe8ff');
    mixCard('pd-m', { solar: 0, soc: .55, grid: .55, wind: .45, status: 'Overnight queue · priority work only', color: '#9fd6ff' }, win(t, s(3) + .4, tEnd + .3, .6));
    dayBar('pd-b', h, win(t, s(0) + 1, tEnd + .3, .6));
    const ti = win(t, tEnd + .4, sc.dur + 1, .9);
    ui.el('pd-ti', 'h1', 'One Day at REPACSS', 960, 420, ti, { fontSize: '96px', transform: 'translateX(-50%)' });
    ui.el('pd-ts', 'sub', 'A supercomputer that follows the sun', 960, 550, ramp(t, tEnd + 1, .9) * ti, { fontSize: '34px', color: '#ffd9a0', transform: 'translateX(-50%)' });
  }
  return { scene: S.scene, camera, update, ...look, exposure: 1.15 };
}

// ---------- 6:50 AM ----------
export function dawn(sc, shared) {
  const S = W0(shared), s = sc.s, camera = siteCam();
  const keys = [
    [0, V(-118, 3.2, 24), V(0, 5, -8)],
    [s(2), V(-104, 5, 20), V(0, 6, -6)],
    [s(3) - .3, V(-40, 46, 92), V(-55, 0, 20)],
    [sc.dur, V(-20, 34, 84), V(-45, 0, 14)],
  ];
  const plan = [['#ffb53c', '7 AM – 1 PM', 'clear', 'big parallel runs'], ['#c9d3e4', '1 – 5 PM', 'clouds', 'battery smooths dips'], ['#b18cff', '6 – 9 PM', 'storms', 'checkpoint long jobs'], ['#9fd6ff', 'night', 'wind + grid', 'priority work only']];
  function update(t) {
    camPath(camera, t, keys);
    const h = lerp(6.83, 7.7, t / sc.dur), sun = clamp((h - 6.9) / 3.5) * .5;
    S.set(t, h, { camera }); S.flowsAt(t, [sun * 2, .3 * (1 - sun), .8, .5 * ramp(t, s(3), 2), 0]);
    header('dw', h, 'First light', win(t, .4, sc.dur, .6));
    const fc = win(t, s(1) + .2, s(3) - .2, .5);
    ui.el('dw-f', 'card', `<div class="cap" style="margin:0 0 12px">Solar forecast → today's plan</div>` + plan.map(([c, when, sky, act], i) =>
      `<div style="display:flex;gap:18px;font-size:22px;line-height:1.9;opacity:${ramp(t, s(1) + 1 + i * 1.6, .5)}"><span style="width:150px;color:${c}">${when}</span><span style="width:130px">${sky}</span><span style="color:var(--dim)">→ ${act}</span></div>`).join(''), 1180, 300, fc);
    ui.label('dw-pv', 'Solar array<small>350 kW · waking up</small>', V(-54, 4, 22), camera, win(t, s(3) + 1.6, sc.dur, .6), '#ffc46b');
    ui.label('dw-bt', 'Battery<small>760 kWh · charging</small>', V(-15, 4, -10), camera, win(t, s(3) + 2.6, sc.dur, .6), '#7dffa5');
    mixCard('dw-m', { solar: sun, soc: .55 + .05 * ramp(t, s(3), 4), batt: -.3 * ramp(t, s(3), 2), grid: .3 * (1 - sun * 2), wind: .2, status: t > s(3) + 1 ? 'Releasing large parallel jobs' : 'Planning the day', color: t > s(3) + 1 ? '#7dffa5' : '#ffd27a' }, win(t, s(3) + .4, sc.dur, .6));
    dayBar('dw-b', h, win(t, .6, sc.dur, .6));
  }
  return { scene: S.scene, camera, update, ...look };
}

// ---------- 1:50 PM, inside ----------
export function noon(sc) {
  const s = sc.s;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05080f); scene.fog = new THREE.Fog(0x05080f, 25, 70);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .05, 300);
  scene.add(new THREE.AmbientLight(0xa0b0d0, .5));
  const top = new THREE.DirectionalLight(0xffe6c0, 1.4); top.position.set(4, 12, 8); scene.add(top);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: .35, metalness: .6 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor); const gr = grid(200, 330, 0x16223a, .5); gr.position.y = .01; scene.add(gr);
  const row = machineRow(); scene.add(row.group); const half = row.width / 2;
  const ups = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.4), std(0x2d3a52, { metalness: .5 })); ups.position.set(half + 1.4, 1.1, 0); scene.add(ups);
  const bus = row.racks.map((rk, i) => { const f = flow(curve([half + .8, .15, .95], [rk.position.x + .3, .15, .95], [rk.position.x, .15, .7]), 40, C.sun, .22, 300 + i); scene.add(f); return f; });
  const nodes = row.racks.flatMap(rk => rk.nodes), r = rng(4), order = nodes.map(() => r());
  const sunGlow = glowSprite(0xffc46b, 6, 0); sunGlow.position.set(half + 1.4, 2.6, 0); scene.add(sunGlow);
  const keys = [
    [0, V(-14, 3.2, 14), V(0, 2.3, 0)],
    [s(2) - .3, V(-6, 2.6, 8), V(-1, 2.2, 0)],
    [s(3), V(4, 2.4, 6.5), V(2, 2.4, 0)],
    [s(4), V(10, 3.4, 10), V(1, 2.3, 0)],
    [sc.dur, V(2, 6, 17), V(0, 2.8, 0)],
  ];
  const ask = 'Where does the energy for this answer come from?';
  const ans = 'Mostly sunlight that left the sun about eight minutes ago, and landed on a solar panel in West Texas.';
  const jobs = [['weather-sim', '2,048 CPU cores', 41.6], ['llm-serve', '4 × H100 NVL', 6.9], ['protein-md', '8 × H100 NVL', 12.3]];
  function update(t) {
    camPath(camera, t, keys); row.spin(t);
    const busy = lerp(.45, .985, ramp(t, s(1), 3));
    nodes.forEach((n, i) => { const on = order[i] < busy, g = n.type === 'gpu' && t > s(2) + 1.5;
      n.led.material.emissiveIntensity = on ? (g ? 2.4 : 1.1) + .3 * Math.sin(t * 4 + i) : .08; n.dot.material.emissiveIntensity = on && Math.sin(t * 9 + i * 7) > .2 ? 1.5 : .25; });
    bus.forEach(f => f.update(t, .3, lerp(.4, 1, ramp(t, s(1), 2)))); sunGlow.material.opacity = .5 + .3 * ramp(t, s(1), 2);
    const h = lerp(13.83, 14.05, t / sc.dur);
    header('nn', h, 'Solar noon', win(t, .4, sc.dur, .6));
    ui.label('nn-ups', 'UPS<small>sunlight in · every PDU out</small>', V(half + 1.4, 2.9, 0), camera, win(t, .8, s(2) - .3, .5), '#ffc46b');
    // a question, answered one token at a time
    const k = Math.floor(clamp((t - s(2) - 2.6) / 5.2) * ans.split(' ').length);
    ui.el('nn-q', 'card', `<div class="cap" style="margin:0 0 10px">llm-serve · H100 NVL</div><div style="font-size:22px;color:var(--dim);white-space:normal;width:560px">${ask}</div><div style="font-size:24px;margin-top:12px;white-space:normal;width:560px;color:#e9ddff">${ans.split(' ').slice(0, k).join(' ')}<span style="color:var(--tok)">▍</span></div>`, 1240, 300, win(t, s(2) + 2, s(4) - .2, .5));
    // energy per code
    const e = ramp(t, s(4), sc.dur - s(4));
    ui.el('nn-e', 'card', `<div class="cap" style="margin:0 0 10px">Energy per job, so far · illustrative</div>` + jobs.map(([j, res, kwh]) =>
      `<div style="display:flex;gap:18px;font-size:22px;line-height:1.9"><span class="mono" style="width:170px;color:#cdb6ff">${j}</span><span style="width:210px;color:var(--dim)">${res}</span><span class="mono" style="width:120px;text-align:right">${(kwh * (.8 + .2 * e)).toFixed(1)} kWh</span></div>`).join(''), 1160, 300, win(t, s(4) + .2, sc.dur, .5));
    const nb = Math.round(busy * 130);
    mixCard('nn-m', { solar: .93, soc: .78 + .02 * t / sc.dur, batt: -.4, grid: .04, wind: .1, status: `${nb} of 130 nodes busy` }, win(t, s(1) + .4, sc.dur, .6));
    dayBar('nn-b', h, win(t, .6, sc.dur, .6));
  }
  return { scene, camera, update, env: .3, bloom: { strength: .8, radius: .45, threshold: .72 } };
}

// ---------- 3:30 PM ----------
export function cloud(sc, shared) {
  const S = W0(shared), s = sc.s, camera = siteCam();
  const keys = [
    [0, V(-30, 70, 120), V(-55, 0, 18)],
    [s(3) - .3, V(-70, 58, 112), V(-55, 0, 20)],
    [s(3) + 1.5, V(6, 14, -32), V(-14, 1, -6)],
    [s(4) - .2, V(2, 13, -30), V(-16, 1, -4)],
    [sc.dur, V(-30, 60, 110), V(-55, 0, 18)],
  ];
  const t0 = s(1) - 3, t1 = s(4) + 4;
  const gx = (t) => lerp(-250, 160, (t - t0) / (t1 - t0));
  const cover = (t) => { const x = gx(t); return Math.max(0, Math.min(x + 75, -17) - Math.max(x - 75, -92)) / 75; };   // array spans x -92…-17
  const N = 140, ts = Array.from({ length: N }, (_, i) => i / (N - 1) * sc.dur);
  function update(t) {
    camPath(camera, t, keys);
    const h = lerp(15.45, 15.65, t / sc.dur), c = cover(t), sol = .86 * (1 - .65 * c);
    S.set(t, h, { cloud: gx(t), camera }); S.flowsAt(t, [sol, .05, .9, c, 0]);
    header('cl', h, 'Passing clouds', win(t, .4, sc.dur, .6));
    // solar output vs. power delivered to the cluster
    const P = (x, y) => `${(x / sc.dur * 560).toFixed(1)},${(150 - y * 140).toFixed(1)}`;
    const upto = ts.filter(x => x <= t);
    const solP = upto.map(x => P(x, .86 * (1 - .65 * cover(x)))).join(' '), supP = upto.map(x => P(x, .86)).join(' ');
    ui.el('cl-g', 'card', `<div class="cap" style="margin:0 0 10px">Solar output vs. power to the cluster</div>
      <svg width="560" height="160" style="display:block"><polygon points="${upto.length > 1 ? supP + ' ' + upto.slice().reverse().map(x => P(x, .86 * (1 - .65 * cover(x)))).join(' ') : ''}" fill="rgba(125,255,165,.28)"/>
      <polyline points="${supP}" fill="none" stroke="#7fe6ff" stroke-width="3"/><polyline points="${solP}" fill="none" stroke="#ffb53c" stroke-width="3"/></svg>
      <div style="font-size:17px;margin-top:8px"><span style="color:#ffb53c">● solar</span> &nbsp; <span style="color:#7dffa5">● battery fills the gap</span> &nbsp; <span style="color:#7fe6ff">● to the cluster</span></div>`, 1240, 300, win(t, s(1) + .3, sc.dur, .5));
    ui.label('cl-bt', 'Battery<small>760 kWh · smoothing the dip</small>', V(-15, 4, -10), camera, win(t, s(3) + 1.5, s(4) - .1, .5), '#7dffa5');
    const soc = .82 - .12 * clamp((t - s(1)) / (s(4) - s(1))) + .1 * ramp(t, s(4), sc.dur - s(4));
    mixCard('cl-m', { solar: sol, soc, batt: c > .1 ? c : -.3 * ramp(t, s(4), 1), grid: .04, wind: .15, status: c > .1 ? 'Battery bridging · every job still running' : 'Every job running' }, win(t, .8, sc.dur, .6));
    dayBar('cl-b', h, win(t, .6, sc.dur, .6));
  }
  return { scene: S.scene, camera, update, ...look };
}

// ---------- 6:20 PM ----------
export function storm(sc, shared) {
  const S = W0(shared), s = sc.s, camera = siteCam();
  const strike = s(1) + 1.6, genOn = s(3) + 1.6;
  const keys = [
    [0, V(60, 9, -10), V(-150, 30, -70)],
    [s(1) - .2, V(40, 8, -16), V(-150, 25, -80)],
    [s(1) + 2.4, V(-4, 7, -34), V(-30, 6, -30)],
    [s(2) - .2, V(18, 5, 12), V(5, 3, 1)],
    [s(3) - .2, V(14, 4.6, 9), V(6, 3.2, 1.5)],
    [s(3) + 1, V(-21, 4.5, 7), V(-13, 1.6, -2.5)],
    [s(4) - .2, V(-22, 4, 5), V(-13, 1.6, -2.5)],
    [sc.dur, V(30, 14, 34), V(-6, 2, -2)],
  ];
  const fl = (t, a) => Math.exp(-(((t - a) / .07) ** 2)) + .6 * Math.exp(-(((t - a - .22) / .06) ** 2));
  const jobs = [['climate-sim', 'long run', 'checkpoint → NVMe ✓', '#7fe6ff'], ['md-batch', 'preemptible', 'paused', '#ffd27a'], ['llm-serve', 'high priority', 'running', '#7dffa5']];
  function update(t) {
    const shake = win(t, genOn, genOn + 1.2, .3) * .04;
    camPath(camera, t, keys); camera.position.y += Math.sin(t * 60) * shake;
    const h = lerp(18.33, 18.45, t / sc.dur), flash = fl(t, s(0) + 3) * .5 + fl(t, strike) + fl(t, s(4) + 3) * .4;
    S.set(t, h, { storm: ramp(t, 0, 1.5), rain: ramp(t, .5, 2), flash, camera });
    const out = t > strike, gen = ramp(t, genOn, 1.2), ups = out && t < genOn + 1;
    S.flowsAt(t, [.05, out ? 0 : .7, ups ? .4 : .8, 0, gen]);
    if (out && t < strike + 1.2) S.glow.material.emissiveIntensity = Math.sin(t * 50) > 0 ? 3 : .4;   // the room blinks, then the UPS holds it
    ui.el('st-fl', '', '', 0, 0, flash * .55, { width: '1920px', height: '1080px', background: '#dfe8ff', zIndex: -1 });
    header('st', h, 'The storm', win(t, .4, sc.dur, .6));
    ui.label('st-gr', '<span style="color:#ff6b75">Grid down</span><small>utility line tripped</small>', V(-27, 12, -12), camera, win(t, strike + .3, s(2) - .2, .4), '#fff');
    const sec = Math.max(0, Math.min(t, genOn) - strike);
    ui.label('st-ups', `UPS carrying every node<small class="mono">${sec.toFixed(1)} s</small>`, V(6.4, 4.6, 1.5), camera, win(t, s(2) + .3, s(3) + .6, .4), '#7dffa5');
    ui.label('st-gn', 'Diesel generator<small>500 kW · online</small>', V(-13, 3.6, -2.5), camera, win(t, genOn, s(4) - .2, .4), '#ffb07a');
    ui.el('st-j', 'card', `<div class="cap" style="margin:0 0 10px">Scheduler response</div>` + jobs.map(([j, kind, st, c], i) =>
      `<div style="display:flex;gap:18px;font-size:22px;line-height:1.9;opacity:${ramp(t, s(4) + 1.2 + i * 1.6, .4)}"><span class="mono" style="width:160px;color:#cdb6ff">${j}</span><span style="width:150px;color:var(--dim)">${kind}</span><span style="color:${c}">${st}</span></div>`).join(''), 1200, 300, win(t, s(4) + .4, sc.dur, .5));
    const status = !out ? ['Storm approaching · all jobs running', '#ffd27a'] : t < genOn ? ['UPS carrying the cluster', '#ffd27a'] : t < s(4) + 1 ? ['On generator', '#ffb07a'] : ['On generator · saving long jobs', '#7fe6ff'];
    mixCard('st-m', { solar: .05, soc: .74, grid: out ? -1 : .7, wind: .3, gen: gen * .8, status: status[0], color: status[1] }, win(t, .8, sc.dur, .6));
    dayBar('st-b', h, win(t, .6, sc.dur, .6));
  }
  return { scene: S.scene, camera, update, ...look, exposure: 1.1 };
}

// ---------- 10:00 PM ----------
export function night(sc, shared) {
  const S = W0(shared), s = sc.s, camera = siteCam();
  const keys = [
    [0, V(2, 6, -22), V(-90, 26, -200)],
    [s(1) + 3, V(-6, 7, -18), V(-110, 32, -220)],
    [s(2) + .6, V(16, 4.4, 9), V(6, 3.2, 1.5)],
    [s(3), V(13, 4.2, 7), V(6, 3.2, 1.5)],
    [s(3) + 4, V(-30, 70, 130), V(-30, 0, 0)],
    [sc.dur, V(-40, 95, 160), V(-30, 0, -10)],
  ];
  const l3 = sc.sentences[3], recap = ['☀ followed the sun', '☁ rode out a cloud', '⚡ survived a storm', '∞ never stopped computing'];
  function update(t) {
    camPath(camera, t, keys);
    const h = lerp(22, 22.4, t / sc.dur);
    S.set(t, h, { camera }); S.flowsAt(t, [0, .6, .8, .3, 0]);
    S.turbines.forEach(r => r.rotation.z = t * 1.7 + r.ph);
    S.glow.material.emissiveIntensity = 2 + 2 * win(t, s(2) + .3, s(3), .6) + .6 * Math.sin(t * 3);
    header('nt', h, 'Wind and starlight', win(t, .4, l3.start - .2, .6));
    ui.label('nt-wd', 'Wind turbines<small>2 × 300 kVA · interconnected</small>', V(-155, 78, -255), camera, win(t, s(1) + .4, s(2) - .2, .5), '#cfe8ff');
    ui.label('nt-rs', 'Restoring from NVMe<small>climate-sim · md-batch · resumed ✓</small>', V(6.4, 4.6, 1.5), camera, win(t, s(2) + .8, s(3) - .2, .4), '#cdb6ff');
    mixCard('nt-m', { solar: 0, soc: .66, batt: -.2, grid: .5, wind: .8, status: t > s(2) + 1.5 ? 'Paused jobs resumed · nothing lost' : 'Grid restored', color: '#7dffa5' }, win(t, .8, l3.start - .2, .6));
    dayBar('nt-b', h, win(t, .6, sc.dur, .6));
    recap.forEach((x, i) => ui.el('nt-r' + i, 'h1', x, 960, 300 + i * 92, win(t, l3.start + i * (l3.end - l3.start) / 4.2, sc.dur, .5), { fontSize: '54px', transform: 'translateX(-50%)' }));
    ui.el('nt-dim', '', '', 0, 0, win(t, l3.start, sc.dur, .6) * .45, { width: '1920px', height: '1080px', background: '#02040a', zIndex: -1 });
  }
  return { scene: S.scene, camera, update, ...look, exposure: 1.15 };
}
