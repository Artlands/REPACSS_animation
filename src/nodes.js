// Detailed server models for the compute close-ups. Scale: 1 unit = 100 mm (2U ≈ 0.88).
// +z = front (drive bays), -z = rear (PSUs, NICs). Each builder returns a group with animation handles.
// Layouts follow REPACSS_nodes.pdf: CPU = Dell PowerEdge R7625 (2 × EPYC 9754), GPU = PowerEdge R760xa
// (2 × Xeon Gold 6448Y, 4 × H100 NVL in front cages); both 2U with a hexagon bezel and one PSU in each rear corner.
import * as THREE from 'three';
import { C, std, emis, textSprite, ramp, ease, lerp } from './lib.js';

const D = new THREE.Object3D();
/** InstancedMesh from a list of [x,y,z, sx?,sy?,sz?, ry?] */
function inst(geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach(([x, y, z, sx = 1, sy = 1, sz = 1, ry = 0], i) => { D.position.set(x, y, z); D.scale.set(sx, sy, sz); D.rotation.set(0, ry, 0); D.updateMatrix(); m.setMatrixAt(i, D.matrix); });
  return m;
}
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

let _perf;
function perfTex() {   // perforated sheet metal
  if (_perf) return _perf;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#5b6372'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#1a1e26';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.beginPath(); g.arc(x * 16 + (y % 2) * 8 + 4, y * 16 + 8, 5, 0, 7); g.fill(); }
  _perf = new THREE.CanvasTexture(c); _perf.wrapS = _perf.wrapT = THREE.RepeatWrapping; _perf.repeat.set(10, 2); return _perf;
}
function labelTex(lines, w = 512, h = 256, bg = '#1c1f26', fg = '#d8dde6') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([t, size, y, col]) => { g.font = `700 ${size}px "Avenir Next", Helvetica`; g.fillStyle = col || fg; g.fillText(t, w / 2, y); });
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx;
}

let _hex;
function hexTex() {   // transparent hexagon lattice for the front bezel
  if (_hex) return _hex;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 200; const g = c.getContext('2d');
  g.strokeStyle = '#b4bac3'; g.lineWidth = 9; const R = 46, hw = R * Math.sqrt(3);
  for (let row = -1; row < 4; row++) for (let col = -1; col < 13; col++) {
    const cx = 40 + col * hw + (row % 2 ? hw / 2 : 0), cy = row * R * 1.5 + 30;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); } g.closePath(); g.stroke();
  }
  g.fillStyle = '#2a2e36'; g.fillRect(0, 0, 70, 200); g.fillRect(954, 0, 70, 200);
  _hex = new THREE.CanvasTexture(c); _hex.colorSpace = THREE.SRGBColorSpace; return _hex;
}
function bezel(g, W, H, z) {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(W + .1, H), new THREE.MeshStandardMaterial({ map: hexTex(), transparent: true, alphaTest: .3, metalness: .8, roughness: .35, side: THREE.DoubleSide }));
  b.position.set(0, H / 2 + .015, z); g.add(b); return b;
}

// ---------- shared parts ----------
function chassis(g, W, Dp, H, frontBays) {
  const sheet = std(0x4a5160, { metalness: .85, roughness: .35 });
  g.add(box(W, .03, Dp, sheet, 0, .015, 0));
  for (const s of [-1, 1]) g.add(box(.03, H, Dp + .06, sheet, s * (W / 2 + .015), H / 2, 0));
  const front = new THREE.Mesh(new THREE.BoxGeometry(W - .002, H - .03, .04), new THREE.MeshStandardMaterial({ map: perfTex(), metalness: .7, roughness: .4 }));
  front.position.set(0, H / 2 + .015, Dp / 2 + .021); if (!frontBays) g.add(front);
  const rear = box(W - .002, H - .03, .03, std(0x2d323c, { metalness: .8 }), 0, H / 2 + .015, -Dp / 2 - .016); g.add(rear);
  // removable lid
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W + .1, .02, Dp + .1), new THREE.MeshStandardMaterial({ map: perfTex(), metalness: .8, roughness: .35, transparent: true }));
  lid.position.y = H + .011; g.add(lid); g.lid = lid; g.H = H;
}

function fanWall(g, W, z, H, n = 6) {
  const fans = [], housing = std(0x15181e, { roughness: .6 }), blade = std(0x23272f, { roughness: .5 });
  const fw = (W - .1) / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + .05 + fw * (i + .5);
    const h = new THREE.Mesh(new THREE.BoxGeometry(fw - .03, H - .1, .38), housing); h.position.set(x, H / 2, z); g.add(h);
    const rot = new THREE.Group(); rot.position.set(x, H / 2, z + .2); g.add(rot);
    rot.add(new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .05, 16).rotateX(Math.PI / 2), std(0x30353f)));
    const bg = new THREE.BoxGeometry(.06, Math.min(fw, H) * .42, .015); bg.translate(0, Math.min(fw, H) * .22, 0);
    for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(bg, blade); b.rotation.z = k * Math.PI * 2 / 7; b.rotation.y = .35; b.position.z = k * .006; rot.add(b); }
    fans.push(rot);
  }
  return fans;
}

/** DDR5 RDIMMs standing along z. slots: list of x. Returns { chips } for glow */
function dimms(g, xs, z, len = 1.33) {
  const n = xs.length;
  const pcb = inst(new THREE.BoxGeometry(.012, .31, len), std(0x1f5e3a, { roughness: .6 }), xs.map(x => [x, .2, z]));
  const slot = inst(new THREE.BoxGeometry(.05, .06, len + .1), std(0x111318), xs.map(x => [x, .06, z]));
  const latch = inst(new THREE.BoxGeometry(.044, .1, .04), std(0x8d939c, { roughness: .6 }), xs.flatMap(x => [[x, .1, z - len / 2 - .06], [x, .1, z + len / 2 + .06]]));
  const chipList = [];
  for (const x of xs) for (const s of [-1, 1]) for (let k = 0; k < 10; k++) chipList.push([x + s * .01, .22, z - len / 2 + .1 + k * (len - .2) / 9]);
  const chips = inst(new THREE.BoxGeometry(.008, .1, .1), std(0x0b0b0d, { roughness: .4, emissive: 0x6fffb0, emissiveIntensity: 0 }), chipList);
  const spd = inst(new THREE.BoxGeometry(.01, .04, .05), std(0x222222), xs.map(x => [x + .01, .33, z - .1]));
  g.add(pcb, slot, latch, chips, spd);
  return chips;
}

/** VRM phases: chokes + power stages + caps in a row along x */
function vrm(g, x0, x1, z, n) {
  const step = (x1 - x0) / (n - 1), ch = [], fet = [], cap = [];
  for (let i = 0; i < n; i++) { const x = x0 + i * step; ch.push([x, .1, z]); fet.push([x, .067, z - .1]); cap.push([x, .105, z + .1]); }
  g.add(inst(new THREE.BoxGeometry(.065, .08, .065), std(0x6b6f78, { metalness: .6 }), ch));
  g.add(inst(new THREE.BoxGeometry(.05, .015, .05), std(0x111111), fet));
  g.add(inst(new THREE.CylinderGeometry(.018, .018, .09, 10), std(0x2a2f6a, { metalness: .6 }), cap));
}

function heatsink(w, d, h, finCount = 34) {
  const g = new THREE.Group(), al = std(0xc9ced6, { metalness: .9, roughness: .3 }), cu = std(0xc6834a, { metalness: .95, roughness: .3 });
  g.add(box(w, .05, d, cu, 0, .025, 0));
  const fins = []; for (let i = 0; i < finCount; i++) fins.push([-w / 2 + .02 + i * (w - .04) / (finCount - 1), .05 + h / 2, 0]);
  g.add(inst(new THREE.BoxGeometry(.008, h, d), al, fins));
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, w * .95, 10), cu); p.rotation.z = Math.PI / 2; p.position.set(0, .05 + h * (.25 + .15 * i), -d * .3 + i * d * .2); g.add(p); }
  return g;
}

function psu(g, x, y, z, w = .86, h = .4, d = 1.85) {
  const p = new THREE.Group(); p.position.set(x, y, z); g.add(p);
  p.add(box(w, h, d, std(0x3b414c, { metalness: .8 })));
  const grill = new THREE.Mesh(new THREE.PlaneGeometry(w * .6, h * .7), new THREE.MeshStandardMaterial({ map: perfTex(), metalness: .6 })); grill.position.set(-w * .12, 0, -d / 2 - .002); grill.rotation.y = Math.PI; p.add(grill);
  const handle = box(.06, h * .6, .12, std(0xd9a321), w * .38, 0, -d / 2 - .06); p.add(handle);
  const led = box(.04, .04, .01, emis(0x5dff8a, 2.5), w * .25, h * .3, -d / 2 - .006); p.add(led);
  return led;
}

function nic(g, x, z, label, ports = 1) {
  const c = new THREE.Group(); c.position.set(x, .45, z); g.add(c);
  c.add(box(.02, .68, 1.6, std(0x1d4d3a)));
  c.add(box(.06, .45, .55, std(0x9aa1ab, { metalness: .9 }), .04, .02, .15));   // heatsink
  c.add(box(.1, .68, .02, std(0xb0b6bf, { metalness: .9 }), 0, 0, -.81));       // bracket
  const leds = [];
  for (let i = 0; i < ports; i++) { c.add(box(.09, .18, .1, std(0x22262d), .02, .14 - i * .26, -.86)); const l = box(.03, .03, .01, emis(0x8fd0ff, 2), .02, .25 - i * .26, -.92); c.add(l); leds.push(l); }
  return leds;
}

// ---------- CPU node: 2 × AMD EPYC 9754 (Bergamo: 8 Zen 4c CCDs × 16 cores + 1 IOD), 24 × DDR5, NVMe ----------
export function cpuNodeDetailed() {
  const g = new THREE.Group(), W = 4.4, Dp = 7.2, H = .86;
  chassis(g, W, Dp, H, true);
  const pcb = box(W - .12, .025, 4.9, std(0x163d2c, { roughness: .7 }), 0, .045, -1.05); g.add(pcb);
  // front: 12 × 2.5" NVMe bays + backplane, behind the hexagon bezel
  const bays = [], bayMat = std(0x2b303a, { metalness: .7 });
  for (let i = 0; i < 12; i++) { const x = -1.87 + i * .34; g.add(box(.3, .66, .02, std(0x1d2028), x, .42, 3.6)); g.add(box(.27, .6, .9, bayMat, x, .42, 3.12));
    const l = box(.04, .04, .01, emis(i === 3 ? C.elec : 0x5dff8a, 1.6), x + .08, .66, 3.615); g.add(l); bays.push(l); }
  bezel(g, W, H - .03, 3.75);
  g.add(box(W - .2, .7, .04, std(0x1a3a2c), 0, .4, 2.58));
  const fans = fanWall(g, W, 1.95, H);
  // sockets
  const sockets = [], cores = [], sinks = [];
  for (const sx of [-1, 1]) {
    const cx = sx * 1.1, cz = -.45;
    g.add(box(1.02, .05, 1.2, std(0x9aa0aa, { metalness: .9 }), cx, .07, cz));                         // SP5 retention frame
    g.add(box(.76, .03, .86, std(0x2a5a3a, { roughness: .5 }), cx, .1, cz));                            // organic substrate
    g.add(box(.26, .025, .4, std(0x8f969f, { metalness: .9, roughness: .25 }), cx, .125, cz));          // I/O die
    // 8 CCDs, two columns of 4 either side of the IOD, 16 Zen 4c cores each (2 × 8)
    const coreList = [];
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
      const ccx = cx + side * .25, ccz = cz - .3 + k * .2;
      g.add(box(.13, .02, .17, std(0x5d6470, { metalness: .9, roughness: .2 }), ccx, .122, ccz));
      for (let a = 0; a < 2; a++) for (let b = 0; b < 8; b++) coreList.push([ccx - .03 + a * .06, .137, ccz - .07 + b * .02]);
    }
    const cm = inst(new THREE.BoxGeometry(.045, .006, .016), new THREE.MeshBasicMaterial({ color: 0xffffff }), coreList);
    cm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(coreList.length * 3), 3);
    g.add(cm); cores.push(cm);
    const lidT = textSprite('AMD EPYC 9754', { color: '#ffffff', h: .07 });
    // IHS + heatsink lift as one unit
    const lift = new THREE.Group(); lift.position.set(cx, 0, cz); g.add(lift);
    const ihs = new THREE.Mesh(new THREE.BoxGeometry(.74, .03, .84), new THREE.MeshStandardMaterial({ map: labelTex([['AMD', 54, 90, '#ffffff'], ['EPYC 9754', 40, 160]], 512, 256, '#a7adb6', '#1b1e24'), metalness: .8, roughness: .3, transparent: true }));
    ihs.position.y = .158; lift.add(ihs);
    const hs = heatsink(.98, 1.15, .52); hs.position.y = .17; lift.add(hs);
    lift.hs = hs; lift.ihs = ihs; sinks.push(lift);
    vrm(g, cx - .45, cx + .45, cz + .78, 10);
    vrm(g, cx - .45, cx + .45, cz - .78, 8);
    // 12 DIMMs per socket (one per DDR5 channel), 6 each side
    const xs = []; for (let k = 0; k < 6; k++) xs.push(cx - .58 - k * .075, cx + .58 + k * .075);
    sockets.push(dimms(g, xs, cz));
  }
  // rear: 2 PSUs, 2 × ConnectX-7 (NDR 200 Gb/s), OCP 3.0 25 GbE, BMC
  // rear (R7625): PSU in each corner, ConnectX-7 NDR 200G in the left and right risers (one per socket), OCP 3.0 25 GbE centre
  const psuLeds = [psu(g, -1.72, .22, -2.62), psu(g, 1.72, .22, -2.62)];
  const nicLeds = [...nic(g, -1.0, -2.75, 'ConnectX-7 · NDR 200G'), ...nic(g, 1.0, -2.75, 'ConnectX-7 · NDR 200G')];
  g.add(box(.9, .05, .7, std(0x1d4d3a), 0, .1, -3.15));
  for (let i = 0; i < 2; i++) { g.add(box(.16, .12, .12, std(0x22262d), -.15 + i * .3, .2, -3.5)); }
  const bmc = box(.16, .02, .16, std(0x111111), -.2, .07, -2.6); g.add(bmc);
  const bmcL = textSprite('BMC', { color: '#bbbbbb', h: .06 }); bmcL.position.set(-.2, .14, -2.6); g.add(bmcL);
  // M.2 boot + misc ICs
  g.add(box(.22, .015, .8, std(0x1a1a1a), -.55, .07, -2.2));
  g.add(inst(new THREE.BoxGeometry(.08, .015, .08), std(0x0d0d0d), [[.1, .065, -1.8], [.3, .065, -1.9], [-.1, .065, -1.6], [.5, .065, -1.7], [0, .065, 1.1], [.4, .065, 1.2]]));

  g.anchors = { socket: new THREE.Vector3(1.1, .14, -.45), ccd: new THREE.Vector3(1.35, .14, -.55), dimm: new THREE.Vector3(-1.9, .4, -.45), vrm: new THREE.Vector3(-1.1, .12, .33),
    nvme: new THREE.Vector3(-.85, .8, 3.12), fans: new THREE.Vector3(-1.5, .9, 1.95), nic: new THREE.Vector3(1.0, .85, -2.75), psu: new THREE.Vector3(1.72, .9, -2.62) };
  const col = new THREE.Color();
  g.update = (t, k) => {   // k: { lid, lift, glow }
    g.lid.position.y = H + ease(k.lid) * 2.4; g.lid.material.opacity = 1 - ease(k.lid); g.lid.visible = k.lid < .99;
    sinks.forEach(s => { s.position.y = ease(k.lift) * 1.5; s.ihs.material.opacity = 1 - .75 * ease(k.lift); s.hs.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = 1 - .6 * ease(k.lift); } }); });
    cores.forEach((cm, si) => { for (let i = 0; i < 128; i++) { const v = .25 + .75 * Math.max(0, Math.sin(t * 5 + i * .41 + si * 2)) ** 2; cm.setColorAt(i, col.setHex(C.elec).multiplyScalar(.35 * v * k.glow + .05)); } cm.instanceColor.needsUpdate = true; });
    sockets.forEach(ch => ch.material.emissiveIntensity = .35 * k.glow * (.5 + .5 * Math.sin(t * 7)));
    fans.forEach((f, i) => f.rotation.z = t * 25 + i);
    nicLeds.forEach((l, i) => l.material.emissiveIntensity = Math.sin(t * 13 + i * 2) > 0 ? 3 : .4);
    bays.forEach((l, i) => l.material.emissiveIntensity = i === 2 ? 1.5 + 1.5 * Math.abs(Math.sin(t * 9)) : 1.2);
  };
  return g;
}

// ---------- GPU node: 2 × Xeon Gold 6448Y, 16 × DDR5, 4 × H100 NVL (two NVLink-bridged pairs) ----------
let _fins;
function finsTex() {   // H100 NVL cooler face: dark frame, gold fin stack, NVIDIA badge at the bracket end
  if (_fins) return _fins;
  const c = document.createElement('canvas'); c.width = 256; c.height = 640; const g = c.getContext('2d');
  g.fillStyle = '#26282d'; g.fillRect(0, 0, 256, 640);
  g.fillStyle = '#3a3d44'; g.fillRect(14, 14, 228, 612);
  for (let x = 22; x < 234; x += 7) { g.fillStyle = '#c9a45a'; g.fillRect(x, 22, 3, 520); g.fillStyle = '#7d6533'; g.fillRect(x + 3, 22, 2, 520); }
  g.fillStyle = '#16171a'; g.fillRect(22, 552, 212, 66);
  g.fillStyle = '#76e05a'; g.font = '700 30px "Avenir Next", Helvetica'; g.textAlign = 'center'; g.fillText('NVIDIA', 128, 584); g.fillStyle = '#e8edf2'; g.font = '600 24px "Avenir Next", Helvetica'; g.fillText('H100 NVL', 128, 610);
  _fins = new THREE.CanvasTexture(c); _fins.colorSpace = THREE.SRGBColorSpace; _fins.anisotropy = 8; return _fins;
}
function h100Card() {
  const c = new THREE.Group();   // lying flat: x = card height (111 mm), y = dual-slot thickness, z = length (267 mm)
  const pcb = box(1.08, .02, 2.62, std(0x123a26, { roughness: .6 }), 0, -.15, 0); c.add(pcb);
  // GH100 on CoWoS interposer with 6 HBM3 stacks (94 GB active)
  const inter = box(.62, .015, .5, std(0x6b5a3a, { metalness: .5 }), 0, -.13, .25); c.add(inter);
  const die = box(.3, .02, .27, std(0x9aa3ad, { metalness: .95, roughness: .2 }), 0, -.115, .25); c.add(die);
  const sms = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 18; j++) sms.push([-.13 + i * .037, -.103, .14 + j * .0128]);
  const smMesh = inst(new THREE.BoxGeometry(.03, .004, .009), new THREE.MeshBasicMaterial({ color: 0xffffff }), sms);
  smMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sms.length * 3), 3); c.add(smMesh);
  const hbm = inst(new THREE.BoxGeometry(.1, .03, .085), std(0x30343c, { metalness: .8, emissive: C.gpu, emissiveIntensity: .1 }), [[-.22, -.11, .14], [-.22, -.11, .25], [-.22, -.11, .36], [.22, -.11, .14], [.22, -.11, .25], [.22, -.11, .36]]);
  c.add(hbm);
  vrm(c, -.45, .45, -.35, 12); c.children.slice(-3).forEach(m => m.position.y -= .15);
  c.add(box(.06, .03, 1.0, std(0xd4b25a, { metalness: 1 }), .56, -.15, -.2));                        // PCIe Gen5 x16 edge
  c.add(box(.18, .1, .12, std(0x1a1a1a), .3, -.08, -1.15));                                            // 16-pin power
  const nvl = []; for (let i = 0; i < 3; i++) { const n = box(.04, .04, .22, std(0xc0a050, { metalness: 1 }), -.55, -.13, -.6 + i * .5); c.add(n); nvl.push(n); }  // NVLink fingers
  // shroud with fin stack (lifts to reveal the board)
  const shroud = new THREE.Group(); c.add(shroud);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.08, .03, 2.62), [std(0x1b1d22), std(0x1b1d22), new THREE.MeshStandardMaterial({ map: finsTex(), metalness: .7, roughness: .35 }), std(0x1b1d22), std(0x1b1d22), std(0x1b1d22)]);
  top.position.y = .17; shroud.add(top);
  for (const s of [-1, 1]) shroud.add(box(.02, .32, 2.58, std(0x8f959e, { metalness: .85, roughness: .3 }), s * .52, .02, 0));
  const fins = []; for (let i = 0; i < 40; i++) fins.push([-.48 + i * .0246, .085, .1]);
  shroud.add(inst(new THREE.BoxGeometry(.006, .13, 2.2), std(0xb8bec7, { metalness: .9, roughness: .3 }), fins));
  const stripe = box(.02, .03, 2.4, emis(C.gpu, .6), .5, .19, 0); shroud.add(stripe);
  c.shroud = shroud; c.sm = smMesh; c.hbm = hbm; c.nvl = nvl;
  return c;
}

export function gpuNodeDetailed() {
  const g = new THREE.Group(), W = 4.4, Dp = 7.2, H = .88;
  chassis(g, W, Dp, H, false);
  g.add(box(W - .12, .025, 2.9, std(0x163d2c, { roughness: .7 }), 0, .045, -1.95));
  // 4 GPUs at the front in two cages (left/right), each cage an NVLink-bridged pair. Packed flat in the 2U chassis;
  // the 'lift' animation raises them into the upright side-by-side pose of the Dell R760xa render in REPACSS_nodes.pdf,
  // with three NVLink bridges across the top edge of each pair.
  const cards = [];
  for (const sx of [-1, 1]) for (const lv of [0, 1]) {
    const c = h100Card(); c.position.set(sx * 1.05, .22 + lv * .4, 1.95); g.add(c); c.lv = lv; c.sx = sx; cards.push(c);
  }
  const bridges = [], bMat = std(0xc9ced6, { metalness: .95, roughness: .25, emissive: 0x76e05a, emissiveIntensity: 0 });
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bMat); b.sx = sx; b.i = i; g.add(b); bridges.push(b); }
  // between the cages: PCIe riser cards standing on the board, then two PCIe-switch heatsinks
  g.add(box(.9, .04, 2.7, std(0x1d4d3a), 0, .08, 2.0));      // PCIe Gen5 switch board in the centre aisle
  for (let i = 0; i < 4; i++) g.add(box(.03, .6, .9, std(0x1d4d3a), -.3 + i * .2, .41, 1.25));
  for (const z of [2.35, 2.95]) { const hs = heatsink(.4, .45, .2, 12); hs.position.set(0, .1, z); g.add(hs); }
  const fans = fanWall(g, W, .1, H);
  // CPUs at the rear: LGA4677, monolithic MCC die (32 cores)
  const sinks = [], cores = [];
  for (const sx of [-1, 1]) {
    const cx = sx * 1.15, cz = -1.75;
    g.add(box(.95, .05, .8, std(0x9aa0aa, { metalness: .9 }), cx, .07, cz));
    g.add(box(.78, .03, .57, std(0x2a5a3a), cx, .1, cz));
    const coreList = []; for (let a = 0; a < 8; a++) for (let b = 0; b < 4; b++) coreList.push([cx - .2 + a * .057, .133, cz - .1 + b * .067]);
    g.add(box(.48, .02, .3, std(0x7d848e, { metalness: .9, roughness: .2 }), cx, .118, cz));
    const cm = inst(new THREE.BoxGeometry(.045, .006, .05), new THREE.MeshBasicMaterial({ color: 0xffffff }), coreList);
    cm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(32 * 3), 3); g.add(cm); cores.push(cm);
    const lift = new THREE.Group(); lift.position.set(cx, 0, cz); g.add(lift);
    const ihs = new THREE.Mesh(new THREE.BoxGeometry(.76, .03, .55), new THREE.MeshStandardMaterial({ map: labelTex([['intel', 54, 90, '#ffffff'], ['XEON GOLD 6448Y', 34, 165]], 512, 256, '#a7adb6', '#1b1e24'), metalness: .8, transparent: true }));
    ihs.position.y = .15; lift.add(ihs);
    const hs = heatsink(.9, .8, .5, 30); hs.position.y = .17; lift.add(hs); lift.ihs = ihs; lift.hs = hs; sinks.push(lift);
    const xs = []; for (let k = 0; k < 4; k++) xs.push(cx - .55 - k * .075, cx + .55 + k * .075);
    dimms(g, xs, cz, 1.2);
    vrm(g, cx - .4, cx + .4, cz + .62, 8);
  }
  // rear (R760xa): PSU in each corner, ConnectX-7 NDR 200G cards either side of the perforated centre
  const psuLeds = [psu(g, -1.72, .22, -2.85, .86, .4, 1.4), psu(g, 1.72, .22, -2.85, .86, .4, 1.4)];
  const nicLeds = [...nic(g, -.95, -3.0, 'ConnectX-7 · NDR 200G'), ...nic(g, .95, -3.0, 'ConnectX-7 · NDR 200G')];
  bezel(g, W, H - .03, 3.67);

  // exploded (upright) pose: pair centred on its cage, cards .44 apart, NVLink fingers up, die of the outer right card faces +x
  const UP = 1.75;
  g.anchors = { gpu: new THREE.Vector3(1.05, UP + .6, 1.95), die: new THREE.Vector3(1.16, UP, 2.2), nvlink: new THREE.Vector3(1.05, UP + .58, 1.95),
    cpu: new THREE.Vector3(-1.15, .5, -1.75), dimm: new THREE.Vector3(1.85, .4, -1.75), psu: new THREE.Vector3(1.72, .9, -2.85) };
  const col = new THREE.Color();
  g.update = (t, k) => {   // k: { lid, lift (top cards up), shroud (one card opens), glow, link }
    g.lid.position.y = H + ease(k.lid) * 2.4; g.lid.material.opacity = 1 - ease(k.lid); g.lid.visible = k.lid < .99;
    const u = ease(k.lift);
    cards.forEach(c => {
      // flat & stacked in the cage -> upright side by side above it (rotate -90° about z: NVLink edge up, PCIe edge down, cooler face toward +x)
      c.position.set(c.sx * 1.05 + u * (c.lv ? .22 : -.22) * c.sx, lerp(.22 + c.lv * .4, UP, u), 1.95);
      c.rotation.z = -u * Math.PI / 2;
      const open = c.sx > 0 && c.lv === 1 ? ease(k.shroud) : 0;
      c.shroud.position.y = open * .9 * (1 - u); c.shroud.position.z = open * 2.9 * u;   // flat: lift off; upright: slide forward along the card
      c.shroud.traverse(o => { if (o.material && !Array.isArray(o.material)) { o.material.transparent = true; o.material.opacity = 1 - .7 * open; } });
      let n = 0; for (let i = 0; i < 8; i++) for (let j = 0; j < 18; j++) { const w = Math.max(0, Math.sin((i + j) * .6 - t * 6)) ** 3; c.sm.setColorAt(n++, col.setRGB(.1 + w * .4, .25 + w * .9, .1 + w * .3).multiplyScalar(k.glow)); }
      c.sm.instanceColor.needsUpdate = true; c.hbm.material.emissiveIntensity = .1 + .6 * k.glow * Math.abs(Math.sin(t * 5));
    });
    bridges.forEach(b => {   // vertical links on the side of the stack -> flat bridges across the top edge of the upright pair
      b.position.set(b.sx * 1.05 + (1 - u) * .6 * b.sx, lerp(.42, UP + .61, u), 1.35 + b.i * .5);
      b.scale.set(lerp(.04, .74, u), lerp(.5, .04, u), lerp(.12, .24, u));
    });
    bMat.emissiveIntensity = k.link * (.05 + .12 * Math.abs(Math.sin(t * 8)));
    sinks.forEach(s => { s.position.y = ease(k.lift) * 1.2; s.ihs.material.opacity = 1 - .75 * ease(k.lift); });
    cores.forEach((cm, si) => { for (let i = 0; i < 32; i++) cm.setColorAt(i, col.setHex(0x9fd6ff).multiplyScalar(.1 + .5 * k.glow * Math.max(0, Math.sin(t * 4 + i + si)))); cm.instanceColor.needsUpdate = true; });
    fans.forEach((f, i) => f.rotation.z = t * 25 + i);
    nicLeds.forEach((l, i) => l.material.emissiveIntensity = Math.sin(t * 13 + i * 2) > 0 ? 3 : .4);
  };
  return g;
}

// ---------- storage node: Dell PowerEdge R760xd2 (REPACSS_storage.pdf) — 2U, 12 × 3.5" SATA carriers (4 × 3, orange release
// buttons; one slides out), backplane, fans, 2 CPUs + 16 DIMMs (512 GB), NVMe acceleration drives, HBA, ConnectX-7, PSUs ----------
function hddCarrier(g, x, y, z) {
  const c = new THREE.Group(); c.position.set(x, y, z); g.add(c);
  c.add(box(.98, .25, 1.48, std(0x40454f, { metalness: .7, roughness: .4 })));                       // carrier + drive body
  c.add(box(.96, .22, .03, std(0x2a2e36, { metalness: .6 }), 0, 0, .755));                             // front
  for (let v = 0; v < 6; v++) c.add(box(.06, .16, .01, std(0x101215), -.02 + v * .085, 0, .772));      // grille
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .03, 20), std(0xe07a2a, { roughness: .5 })); btn.rotation.x = Math.PI / 2; btn.position.set(-.38, 0, .78); c.add(btn);   // orange release button
  c.add(box(.12, .16, .04, std(0x9aa0aa, { metalness: .9 }), -.22, 0, .78));                           // latch
  const led = box(.04, .04, .01, emis(C.store, 2), .44, .07, .775); c.add(led);
  // drive internals (visible when pulled): platters + actuator
  const inner = new THREE.Group(); inner.position.y = .13; c.add(inner);
  for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .012, 48), std(0xd7dce3, { metalness: 1, roughness: .12 })); p.position.set(0, .01 + k * .025, .15); inner.add(p); }
  inner.add(box(.04, .03, .62, std(0x8a8f98, { metalness: .9 }), .3, .07, -.15));                      // actuator arm
  inner.visible = false; c.inner = inner; c.led = led; return c;
}

export function storageNodeDetailed() {
  const g = new THREE.Group(), W = 4.4, Dp = 7.2, H = .88;
  chassis(g, W, Dp, H, true);
  g.add(box(W - .12, .025, 3.8, std(0x163d2c, { roughness: .7 }), 0, .045, -1.6));
  // 12 LFF bays: 4 across × 3 high
  const drives = [];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) drives.push(hddCarrier(g, -1.56 + k * 1.04, .16 + r * .27, 2.86));
  g.add(box(W - .2, .8, .05, std(0x1a3a2c), 0, .44, 2.07));                                          // SAS/NVMe backplane
  const fans = fanWall(g, W, 1.45, H);
  // two CPUs with heatsinks + 8 DIMMs each
  const sinks = [];
  for (const sx of [-1, 1]) {
    const cx = sx * 1.05, cz = -.7;
    g.add(box(.8, .05, .7, std(0x9aa0aa, { metalness: .9 }), cx, .07, cz));
    const hs = heatsink(.75, .7, .42, 26); hs.position.set(cx, .1, cz); g.add(hs); sinks.push(hs);
    const xs = []; for (let k = 0; k < 4; k++) xs.push(cx - .5 - k * .075, cx + .5 + k * .075);
    dimms(g, xs, cz, 1.1);
  }
  // HBA, NVMe acceleration (E3.S drives at the rear), ConnectX-7 NICs, BMC, PSUs
  const hba = new THREE.Group(); hba.position.set(-.2, .45, -2.55); g.add(hba);
  hba.add(box(.02, .6, 1.3, std(0x1d4d3a))); hba.add(box(.07, .25, .5, std(0x9aa1ab, { metalness: .9 }), .04, .05, .1));
  const cache = []; for (let i = 0; i < 4; i++) { const m = box(.22, .7, .9, std(0x2b303a, { metalness: .7 }), .25 + i * .26, .42, -3.0); g.add(m); const l = box(.04, .04, .01, emis(C.elec, 2), .25 + i * .26, .7, -3.46); g.add(l); cache.push(l); }
  const nicLeds = [...nic(g, -1.0, -2.75, 'ConnectX-7'), ...nic(g, 1.0, -2.75, 'ConnectX-7')];
  const psuLeds = [psu(g, -1.72, .22, -2.62), psu(g, 1.72, .22, -2.62)];

  g.anchors = { drives: new THREE.Vector3(.52, .9, 3.6), pulled: new THREE.Vector3(.52, .6, 4.6), backplane: new THREE.Vector3(1.6, .9, 2.07), cpu: new THREE.Vector3(-1.05, .7, -.7),
    cache: new THREE.Vector3(.64, .9, -3.0), hba: new THREE.Vector3(-.2, .9, -2.55), nic: new THREE.Vector3(1.0, .85, -2.75) };
  const pulledDrive = drives[5];
  g.update = (t, k) => {   // k: { lid, pull, glow }
    g.lid.position.y = H + ease(k.lid) * 2.4; g.lid.material.opacity = 1 - ease(k.lid); g.lid.visible = k.lid < .99;
    pulledDrive.position.z = 2.86 + ease(k.pull) * 1.6; pulledDrive.inner.visible = k.pull > .5; pulledDrive.inner.children.slice(0, 3).forEach(p => p.rotation.y = t * 30);
    drives.forEach((d, i) => d.led.material.emissiveIntensity = Math.sin(t * 9 + i * 1.7) > 0 ? 2.4 : .3);
    cache.forEach((l, i) => l.material.emissiveIntensity = (Math.sin(t * 15 + i) > 0 ? 3 : .4) * (.3 + .7 * k.glow));
    fans.forEach((f, i) => f.rotation.z = t * 25 + i);
    nicLeds.forEach((l, i) => l.material.emissiveIntensity = Math.sin(t * 13 + i * 2) > 0 ? 3 : .4);
  };
  return g;
}
