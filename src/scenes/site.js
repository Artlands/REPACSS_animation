// The site at GLEAMM / Reese Technology Center (33.61229 N, 102.04853 W, NW corner of the Reese airfield), laid out from
// USDA NAIP aerial imagery and the site photos in REPACSS.pdf / repacss.org/gallery (+z = south, +x = east, 1 unit = 1 m,
// building centred at the origin). The ground is the NAIP orthophoto itself (public domain, USGS The National Map):
// 1.2 km square at 0.4 m/px over a 4 km square at 2 m/px, so roads, runway and fields sit where they really are.
//  - tan ribbed-steel lab building, low gable roof (ridge N-S), north gable with roll-up door + sign,
//    flat canopy on brown posts over the NW corner, lattice tower and guyed mast behind
//  - six external cooling units on the west wall, square battery enclosure (550 kWh) to the south
//  - white diesel genset, utility poles and transformer to the west
//  - 350 kW field: 5 E-W rows of two-high racks west of the building; the two southern rows (94 m) are longer than the
//    three northern ones (47 m). Rows at z 8.5 / 14 / 19.5 match the imagery; the two newest rows north of them are placed
//    at the same pitch. Inverters at the east row ends
//  - lattice met tower ~130 m SW; three research wind turbines 290-405 m south (they feed the utility grid, not REPACSS)
import * as THREE from 'three';
import { C, ui, ramp, win, rng, solarArray, std, emis, sky, flow, tube, cable, textSprite, textPlane, V, camPath, glowSprite } from '../lib.js';

function ribbedTex(base = '#c9c1a2', rib = 'rgba(0,0,0,.13)', hi = 'rgba(255,255,255,.12)') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 16) { g.fillStyle = rib; g.fillRect(x, 0, 3, 64); g.fillStyle = hi; g.fillRect(x + 3, 0, 2, 64); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const groundTex = await Promise.all(['reese_naip_4km.jpg', 'gleamm_naip_1200m.jpg'].map(f => new THREE.TextureLoader().loadAsync('assets/' + f).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t; })));
const mat = (o) => new THREE.MeshStandardMaterial({ roughness: .7, metalness: .25, ...o });

/** box with ribbed walls; uv repeat sized to metres so ribs are ~0.3 m apart */
function ribBox(w, h, d, tex) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
  // faces: +x,-x,+y,-y,+z,-z (4 verts each); scale u by face width / 4.8 m
  const fw = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setX(i, uv.getX(i) * fw[f] / 4.8); }
  return new THREE.Mesh(geo, mat({ map: tex }));
}

function gleammBuilding() {
  const g = new THREE.Group(), wall = ribbedTex(), trim = mat({ color: 0x5b3a2e }), roofM = mat({ color: 0xd2d3cf, roughness: .6, metalness: .3 });
  const W = 12.7, D = 11.3, EAVE = 4.3, x0 = -W / 2, z0 = -D / 2;
  const NX = -1.5, NZ = -1.2;                       // canopy notch: x in [x0, NX], z in [z0, NZ]
  // enclosed volume = east block (full depth) + west block behind the canopy
  const A = ribBox(NX * -1 + W / 2, EAVE, D, wall); A.position.set((NX + W / 2) / 2, EAVE / 2, 0); g.add(A);
  const B = ribBox(NX - x0, EAVE, D / 2 - NZ, wall); B.position.set((x0 + NX) / 2, EAVE / 2, (NZ + D / 2) / 2); g.add(B);
  // low-pitch gable roof over the whole footprint, ridge running N-S
  const rise = .55, half = W / 2 + .25, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  for (const sgn of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(slope, .12, D + .5 + (sgn > 0 ? .02 : 0)), roofM);
    r.position.set(sgn * half / 2, EAVE + rise / 2 + .06, 0); r.rotation.z = -sgn * ang; g.add(r);
  }
  // gable triangles (N and S) + trim
  const tri = new THREE.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, rise); tri.closePath();
  for (const z of [z0 - .01, -z0 + .01]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat({ color: 0xc9c1a2, side: THREE.DoubleSide })); m.position.set(0, EAVE, z); g.add(m); }
  for (const [w, h, d, x, y, z] of [[W + .1, .18, .14, 0, EAVE - .05, z0 - .02], [.18, EAVE - .04, .18, x0 - .02, EAVE / 2, -z0 + .02], [.18, EAVE - .04, .18, W / 2 + .02, EAVE / 2, z0 - .02], [.18, EAVE - .04, .18, W / 2 + .02, EAVE / 2, -z0 + .02]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trim); m.position.set(x, y, z); g.add(m);
  }
  // canopy posts at the open corner (brown) and its concrete slab
  for (const [x, z] of [[NX - .1, z0 + .1], [x0 + .1, z0 + .1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.2, EAVE - .02, .2), trim); p.position.set(x, EAVE / 2 + .1, z); g.add(p); }
  const slab = new THREE.Mesh(new THREE.BoxGeometry(NX - x0 + 1, .12, NZ - z0 + 1), mat({ color: 0xbdb8ae, roughness: .95, metalness: 0 })); slab.position.set((x0 + NX) / 2 - .51, .07, (z0 + NZ) / 2 - .51); g.add(slab);
  // north face: white roll-up door, man door in the canopy recess, sign, wall packs
  const roll = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.4, .06), mat({ color: 0xf2f2ef }));
  roll.position.set(4.3, 1.7, z0 - .04); g.add(roll);
  for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.78, .02, .02), mat({ color: 0xc8c8c4 })); l.position.set(4.3, .2 + i * .27, z0 - .08); g.add(l); }
  const rollTrim = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.55, .04), trim); rollTrim.position.set(4.3, 1.75, z0 - .015); g.add(rollTrim);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, .06), mat({ color: 0x4a3a32 })); door.position.set(-3.6, 1.24, NZ - .04); g.add(door);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.3, .62, .04), mat({ color: 0x463a30 })); plate.position.set(4.3, 3.95, z0 - .05); g.add(plate);
  for (const [txt, y, h] of [['TTU GLEAMM', 4.08, .2], ['MICROGRID RESEARCH FACILITY', 3.84, .16]]) { const t = textPlane(txt, { color: '#e9e6dc', h, pad: 6 }); t.position.set(4.3, y, z0 - .08); t.rotation.y = Math.PI; t.scale.x = Math.min(1, 2.1 / t.geometry.parameters.width); g.add(t); }
  for (const [x, z] of [[2.4, z0 - .1], [-1.9, NZ - .1]]) { const wp = new THREE.Mesh(new THREE.BoxGeometry(.35, .3, .2), mat({ color: 0x2a2a2a })); wp.position.set(x, 3.3, z); g.add(wp); }
  // REPACSS machine-room glow through a louvre on the east wall (the pod is inside)
  const glow = new THREE.Mesh(new THREE.BoxGeometry(.06, .25, 5), emis(C.elec, 2.5)); glow.position.set(W / 2 + .03, 3.2, 1.5); g.add(glow);   // stylised: shows the cluster is inside
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.glow = glow; return g;
}

function condenser() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat({ color: 0x9aa0a6, metalness: .5 })); b.position.y = .62; g.add(b);
  const f = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .05, 24), mat({ color: 0x25282c })); f.position.y = 1.24; g.add(f); g.fan = f;
  return g;
}

function latticeTower(h) {
  const g = new THREE.Group(), m = new THREE.LineBasicMaterial({ color: 0x9aa0a8 }), pts = [];
  const w = (y) => .9 * (1 - y / h) + .35;
  const leg = (a, y) => V(Math.cos(a) * w(y), y, Math.sin(a) * w(y));
  const A = [0, 2.094, 4.189];
  for (let y = 0; y < h; y += 1.2) for (let k = 0; k < 3; k++) { const a = A[k], b = A[(k + 1) % 3];
    pts.push(leg(a, y), leg(a, y + 1.2), leg(a, y), leg(b, y + 1.2), leg(a, y + 1.2), leg(b, y + 1.2)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m));
  for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .1, 16), std(0xdddddd)); d.rotation.z = Math.PI / 2; d.position.set(Math.cos(i * 2) * .5, h - 2 - i * .8, Math.sin(i * 2) * .5); g.add(d); }
  return g;
}

export function buildSite() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb7c4d6, 300, 1400);
  scene.add(sky('#2f6fb8', '#86b4e0', '#e8dcc4'));
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7350, 1.1); scene.add(hemi);
  // sun high in the southern sky (+z is south)
  const sunL = new THREE.DirectionalLight(0xfff1d6, 2.6); sunL.position.set(-30, 90, 70); sunL.target.position.set(-30, 0, 5); scene.add(sunL.target); sunL.castShadow = true;
  Object.assign(sunL.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 320 }); sunL.shadow.mapSize.set(4096, 4096); sunL.shadow.bias = -.0004;
  scene.add(sunL);
  const sunDisc = glowSprite(0xfff3cf, 60, .9); sunDisc.position.set(-120, 220, 260); scene.add(sunDisc);

  // ground: NAIP orthophotos centred on the building (north up), the fine one over the coarse one; darkened because the
  // photo already carries its own sunlight
  for (const [map, size, y] of [[groundTex[0], 4000, -.06], [groundTex[1], 1200, 0]]) {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map, color: 0xc0c0c0, roughness: 1, metalness: 0 }));
    gm.rotation.x = -Math.PI / 2; gm.position.y = y; gm.receiveShadow = true; scene.add(gm);
  }

  // building
  const dc = gleammBuilding(); scene.add(dc);
  const glow = dc.glow;
  // six external cooling units on the west side, 2 × 3 along the wall
  const conds = [];
  for (let i = 0; i < 6; i++) { const cd = condenser(); cd.position.set(-7.4 - (i % 2) * 1.6, 0, 1.2 + (i >> 1) * 1.6); scene.add(cd); conds.push(cd); }
  // lattice met tower south-west of the array (position from the imagery)
  const tw = latticeTower(60); tw.position.set(-128, 0, 77); scene.add(tw);

  // PV field: [columns, row centre z, east-end x] per row, 2-high racks; the two northern rows stop short of the genset
  const ROWS = [[45, -2.5, -18.8], [45, 3, -18.8], [45, 8.5, -16.8], [90, 14, -16.8], [90, 19.5, -16.8]];
  const pv = new THREE.Group(); scene.add(pv);
  for (const [cols, z, ex] of ROWS) { const a = solarArray(1, cols, .55, { high: 2 }); a.position.set(ex - (cols - 1) * 1.05, 0, z); pv.add(a); }
  pv.traverse(o => { o.castShadow = true; o.receiveShadow = true; if (o.isInstancedMesh && o.material.map) { o.material = o.material.clone(); o.material.roughness = .45; o.material.envMapIntensity = .4; } });
  for (const [, z0, ex] of ROWS) {   // string inverters on a post frame just east of each row end (clear of the modules)
    const ix = ex + 1.25, frame = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 2.9), std(0x9aa0a8, { metalness: .8 })); frame.position.set(ix, 1.55, z0); scene.add(frame);
    for (const dz of [-1.35, 1.35]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.5, .06), std(0x9aa0a8, { metalness: .8 })); p.position.set(ix, .75, z0 + dz); scene.add(p); }
    for (let k = 0; k < 3; k++) { const inv = new THREE.Mesh(new THREE.BoxGeometry(.3, .8, .7), std(0xe6e8ea)); inv.position.set(ix + .2, 1.1, z0 - .9 + k * .9); inv.castShadow = true; scene.add(inv); }
  }

  // diesel genset (white CAT enclosure on a black base tank) west of the building
  const gen = new THREE.Group(); gen.position.set(-13, 0, -2.5); scene.add(gen);
  const gBase = new THREE.Mesh(new THREE.BoxGeometry(6.3, .6, 2.6), mat({ color: 0x1e1f22 })); gBase.position.y = .3; gen.add(gBase);
  const gBody = new THREE.Mesh(new THREE.BoxGeometry(6, 2.3, 2.3), mat({ color: 0xece8dc, roughness: .55 })); gBody.position.y = 1.75; gen.add(gBody);
  const gEnd = new THREE.Mesh(new THREE.BoxGeometry(.05, 1.9, 2), mat({ color: 0x151515 })); gEnd.position.set(3.03, 1.75, 0); gen.add(gEnd);
  for (let i = 0; i < 4; i++) { const dr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, .04), mat({ color: 0xdfdbcf })); dr.position.set(-2 + i * 1.25, 1.75, 1.17); gen.add(dr); }
  gen.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // battery storage: one square 550 kWh enclosure south of the building
  const batt = new THREE.Group(); batt.position.set(1.5, 0, 9.5); scene.add(batt);
  const bBox = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 3.2), mat({ color: 0xe5dcc5, roughness: .7 })); bBox.position.y = 1.3; batt.add(bBox);
  const bPad = new THREE.Mesh(new THREE.BoxGeometry(3.8, .15, 3.8), mat({ color: 0xbdb8ae, roughness: .95, metalness: 0 })); bPad.position.y = .07; batt.add(bPad);
  for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.1, .04), mat({ color: 0xdcd3bb })); d.position.set(sx * .75, 1.25, 1.62); batt.add(d); }
  const battLed = new THREE.Mesh(new THREE.BoxGeometry(1.8, .12, .04), emis(0x7dffa5, 2)); battLed.position.set(0, 2.4, 1.63); batt.add(battLed);
  batt.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // three research wind turbines south of the site (positions from the imagery; ~32 m hub, 27 m rotor), rotors facing south
  const turbines = [];
  for (const [x, z, ph] of [[-15, 288, 0], [-15, 400, 1.3], [-95, 405, 2.4]]) {
    const w = new THREE.Group(); w.position.set(x, 0, z); scene.add(w);
    const white = std(0xf2f4f6, { metalness: .1, roughness: .5 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.5, 32, 16), white); tower.position.y = 16; w.add(tower);
    const nac = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.5), white); nac.position.set(0, 32.5, 0); w.add(nac);
    const rotor = new THREE.Group(); rotor.position.set(0, 32.5, 2.6); w.add(rotor);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 13.5, .3), white); b.geometry.translate(0, 6.75, 0); b.rotation.z = k * Math.PI * 2 / 3; b.position.z = k * .05; rotor.add(b); }
    w.traverse(o => { if (o.isMesh) o.castShadow = true; });
    rotor.ph = ph; turbines.push(rotor);
  }

  // utility: pad-mount transformer by the battery yard, pole line running north
  const swg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1), std(0x8a919c)); swg.position.set(-8.6, .8, -7.5); swg.castShadow = true; scene.add(swg);   // ATS / service switchgear
  const xfmr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2), std(0x5f7f5a)); xfmr.position.set(-24, .9, -8); xfmr.castShadow = true; scene.add(xfmr);
  const poles = [];
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Group(), wood = std(0x6e5a44, { metalness: 0, roughness: .9 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.15, .2, 11, 8), wood); pole.position.y = 5.5; p.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, .2, .2), wood); arm.position.y = 10.2; p.add(arm);
    p.position.set(-27 - i * 3, 0, -12 - i * 32); scene.add(p); poles.push(p);
  }
  for (const dx of [-1.3, 0, 1.3]) {
    const pts = poles.map(p => p.position.clone().add(V(dx, 10.3, 0))); pts.unshift(V(-24 + dx * .3, 1.9, -8));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(200)), new THREE.LineBasicMaterial({ color: 0x30343c })));
  }

  // energy flows into the building's west wall: PV inverters, battery, grid, generator
  const flows = [
    [cable([-15.3, .3, 8.5], [-6.4, .3, 4.5], 1.2), C.sun, 1],
    [cable([-21, .3, -6.5], [-6.4, .3, -2.5], 1.4), 0xe4e8f0, .35],
    [cable([-7.9, .3, -7.5], [-6.4, .3, -3.5], .8), 0xffffff, .8],
    [cable([1.5, .3, 7.8], [1.5, .3, 5.7], .8), 0x7dffa5, .6],
    [cable([-9.9, .3, -2.5], [-6.4, .3, .5], .9), 0xffb07a, .25],
  ].map(([cv, col, dens], i) => { const f = flow(cv, 60, col, .7, 20 + i); const tb = tube(cv, col, .09, .35); scene.add(f, tb); f.tube = tb; f.dens = dens; return f; });

  const site = { scene, dc, flows, sunL, hemi, sunDisc, glow, swg, xfmr, pv, batt, gen, turbines };
  site.animate = (t, flowOn = 1) => {
    conds.forEach((cd, i) => cd.fan.rotation.y = t * 9 + i);
    flows.forEach(f => { f.update(t, .1, flowOn * f.dens); f.tube.material.opacity = .35 * flowOn; });
    glow.material.emissiveIntensity = 2 + .6 * Math.sin(t * 3);
    battLed.material.emissiveIntensity = 1.4 + .8 * Math.sin(t * 2);
    turbines.forEach(r => r.rotation.z = t * .9 + r.ph);
  };
  return site;
}

export default function site(sc, shared) {
  const S = shared.site = buildSite();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .5, 900);
  const s = sc.s;
  const keys = [
    [0, V(-36, 290, 46), V(-36, 0, 10)],
    [s(0) + 3, V(-26, 140, 110), V(-26, 0, 8)],
    [s(1) - .5, V(9, 2.2, -24), V(-3, 3.2, 3)],
    [s(1) + 4.5, V(4, 2.6, -21), V(-4, 3.4, 3)],
    [s(2) - .3, V(-26, 30, 78), V(-50, 0, 20)],
    [s(2) + 3, V(-10, 5, 48), V(-60, 2, 18)],
    [s(3) - .3, V(-16, 16, 34), V(-8, 1, -2)],
    [s(3) + 4, V(-18, 15, 32), V(-10, 1, -4)],
    [s(4) - .35, V(-18, 15, 32), V(-10, 1, -4)],     // hold, then cut to the turbines to the south
    [s(4) - .3, V(-40, 30, -60), V(-45, 0, 300)],      // from north of the array: rows + building in front, turbines beyond
    [sc.dur, V(-38, 32, -48), V(-47, 0, 310)],
  ];
  function update(t) {
    camPath(camera, t, keys); S.animate(t, ramp(t, 2, 3));
    S.sunL.color.setHex(0xfff1d6); S.hemi.color.setHex(0xcfe3ff); S.sunL.intensity = 2.6; S.hemi.intensity = 1.1;
    const y = camera.position.y; S.scene.fog.near = 300 + y; S.scene.fog.far = 1400 + 1.5 * y;
    ui.el('s-haze', '', '', 0, 0, 1 - ramp(t, 0, 2.2), { width: '1920px', height: '1080px', background: '#c9d8ea' });
    ui.el('s-scrim', '', '', 0, 0, win(t, .5, sc.dur, .8), { width: '1920px', height: '300px', background: 'linear-gradient(rgba(2,6,16,.75),rgba(2,6,16,0))', zIndex: -1 });
    ui.el('s-k', 'kicker', 'The site', 90, 70, win(t, .5, sc.dur, .8));
    ui.el('s-t', 'h1', 'GLEAMM · Reese Technology Center', 90, 104, win(t, .5, sc.dur, .8), { fontSize: '50px' });
    ui.el('s-l', 'sub', 'Global Laboratory for Energy Asset Management and Manufacturing · 10 miles west of Texas Tech, Lubbock', 92, 172, win(t, 1.2, sc.dur, .8), { color: '#dfe7f5', fontSize: '24px' });
    ui.label('s-dc', 'GLEAMM building · REPACSS<small>HPC + AI machine room inside</small>', V(1, 5.4, 0), camera, win(t, 1.6, s(2) - .4, .6), '#ff8a94');
    ui.el('s-lab', 'card', '<div class="cap" style="margin:0">GLEAMM microgrid · since 2015</div><div style="font-size:23px;margin-top:8px;line-height:1.55">building + energy infrastructure<br>multiple energy sources &amp; storage<br>dense instrumentation &amp; control</div>', 90, 780, win(t, s(1) + .6, s(2) - .2, .5));
    ui.label('s-pv', 'Solar array<small>350 kW</small>', V(-50, 4, 9), camera, win(t, s(2) + .2, s(3) - .2, .6), '#ffc46b');
    const op3 = win(t, s(3) + .2, s(4) - .2, .5);
    ui.label('s-bt', 'Battery storage<small>550 kWh</small>', V(1.5, 3.4, 9.5), camera, op3, '#7dffa5');
    ui.label('s-gn', 'Diesel generator<small>500 kW · automatic transfer switch</small>', V(-13, 4, -2.5), camera, ramp(t, s(3) + 1.6, .5) * op3, '#ffb07a');
    ui.label('s-gr', 'Utility grid<small>commercial power</small>', V(-24, 3.4, -8), camera, ramp(t, s(3) + 3.4, .5) * op3, '#e4e8f0');
    ui.label('s-wd', 'Wind turbines<small>feed the utility grid · low-cost power</small>', V(-40, 52, 360), camera, win(t, s(4) + .6, sc.dur, .6), '#cfe8ff');
  }
  return { scene: S.scene, camera, update, noFadeIn: true, exposure: .9, bloom: { strength: .35, radius: .4, threshold: .92 } };
}
