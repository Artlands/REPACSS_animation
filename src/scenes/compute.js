// Electrons -> compute: the REPACSS machine room, exploded CPU / GPU / storage nodes, network fabric, totals.
import * as THREE from 'three';
import { cpuNodeDetailed, gpuNodeDetailed, storageNodeDetailed } from '../nodes.js';
import { C, ui, ramp, win, lerp, rng, machineRow, cable, std, emis, flow, tube, curve, textSprite, grid, V, camPath, glowSprite } from '../lib.js';

// InfiniBand topology (REPACSS_nodes.pdf): mini diagram for the overlay card
function topoSVG(p) {
  const bx = (x, y, w, h, t, col, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#0d1526" stroke="${col}" opacity="${o}"/><text x="${x + w / 2}" y="${y + h / 2 + 5}" fill="${col}" font-size="13" text-anchor="middle" opacity="${o}">${t}</text>`;
  const ln = (x1, y1, x2, y2, col, w, dash = '', o = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-dasharray="${dash}" opacity="${o}"/>`;
  const core = [[150, 'core 94-44'], [330, 'core 94-46']], leaf = [[70, 'leaf 91-21'], [250, 'leaf 94-21'], [430, 'leaf 96-21']];
  const a = Math.min(1, p * 2), b = Math.max(0, Math.min(1, p * 2 - .6));
  let o = '';
  for (const [cx] of core) for (const [lx] of leaf) o += ln(cx, 34, lx, 96, '#e8eefc', 2.5, '', a);
  o += ln(150, 34, 175, 96, '#ffb07a', 2, '5 4', a) + ln(330, 34, 330, 96, '#ffb07a', 2, '5 4', a);
  for (const [lx] of leaf) for (let k = 0; k < 9; k++) o += ln(lx, 118, lx - 50 + k * 12.5, 158, '#ff5a5a', 1, '', b);
  for (let k = 0; k < 7; k++) o += ln(175, 118, 160 + k * 5, 128, '#ff5a5a', 1, '', b) + ln(330, 118, 315 + k * 5, 128, '#ff5a5a', 1, '', b);
  o += core.map(([x, t]) => bx(x - 60, 10, 120, 24, t, '#cdb6ff')).join('') + leaf.map(([x, t]) => bx(x - 52, 96, 104, 22, t, '#9fd6ff')).join('');
  o += bx(140, 96, 70, 22, '95 CPU', '#ffb07a') + bx(295, 96, 70, 22, '95 storage', '#ffb07a');
  const racks = [[40, '91'], [100, '92'], [220, '93'], [280, '94'], [400, '96'], [460, '97']];
  o += racks.map(([x, t]) => bx(x - 26, 158, 52, 22, t, '#8ea3c9', b)).join('');
  return `<svg width="780" height="291" viewBox="0 0 510 190" style="display:block">${o}</svg>`;
}

export default function compute(sc) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x04070e);
  scene.fog = new THREE.Fog(0x04070e, 25, 70);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .05, 300);
  scene.add(new THREE.AmbientLight(0xa0b0d0, .55));
  const top = new THREE.DirectionalLight(0xffffff, 1.4); top.position.set(4, 12, 8); scene.add(top);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: .35, metalness: .6 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor); const gr = grid(200, 330, 0x16223a, .5); gr.position.y = .01; scene.add(gr);

  // machine room
  // machine room: Racks 91–97 with in-row coolers (per repacss_structure.pdf)
  const row = machineRow(); scene.add(row.group);
  const racks = row.racks, half = row.width / 2;
  const sw = racks.flatMap(r => r.switches.filter(x => x.kind !== 'pdusw'));
  // overhead cable tray
  const tray = new THREE.Mesh(new THREE.BoxGeometry(row.width + .4, .08, .5), std(0x39424f, { metalness: .8 })); tray.position.set(0, 5.1, -.3); scene.add(tray);
  // UPS at the end of the row feeds every cabinet's PDUs over a floor bus (grid + solar in)
  const ups = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.4), std(0x2d3a52, { metalness: .5 })); ups.position.set(half + 1.4, 1.1, 0); scene.add(ups);
  const upsL = new THREE.Mesh(new THREE.BoxGeometry(.6, .06, .01), emis(0x7dffa5, 1.5)); upsL.position.set(half + 1.4, 1.6, .71); scene.add(upsL);
  const upsT = textSprite('UPS', { color: '#7dffa5', h: .3 }); upsT.position.set(half + 1.4, 2.5, 0); scene.add(upsT);
  const bus = racks.map((r, i) => { const cv = curve([half + .8, .15, .95], [r.position.x + .3, .15, .95], [r.position.x, .15, .7]);
    const f = flow(cv, 30, C.sun, .2, 120 + i); scene.add(f); return f; });

  // showcase models
  const show = V(40, 0, 0);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, .2, 64), std(0x0d1424, { metalness: .8, roughness: .3 })); pedestal.position.set(show.x + 12, -.1, 0); scene.add(pedestal);
  const cpu = cpuNodeDetailed(); cpu.position.copy(show); scene.add(cpu);
  const G = V(show.x + 12, 0, 0), gpu = gpuNodeDetailed(); gpu.position.copy(G); scene.add(gpu);
  const SX = show.x + 24, sto = storageNodeDetailed(); sto.position.set(SX, 0, 0); scene.add(sto);
  const A = (node, k) => node.anchors[k].clone().add(node.position);
  const showLight = new THREE.HemisphereLight(0xd0dcff, 0x1a2030, .9); scene.add(showLight);
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(show.x + 4, 12, 10); key.target.position.set(show.x + 10, 0, 0); scene.add(key, key.target);
  const spot = new THREE.PointLight(0xffffff, 60, 30); spot.position.set(show.x + 10, 8, 6); scene.add(spot);

  // a CPU node slides out of Rack 94
  const pulled = racks[3].nodes[12]; const P = new THREE.Vector3(); pulled.getWorldPosition(P);

  const s = sc.s;
  const keys = [
    [0, V(-12, 3.4, 15), V(0, 2.3, 0)],
    [s(1) - .2, V(P.x + .3, P.y + .3, 6.5), V(P.x, P.y, 0)],
    [s(1) + 2.2, V(P.x + 2.3, P.y + .9, 9), V(P.x, P.y, 1)],
    [s(1) + 3.0, V(show.x + 4.5, 4.6, 7.5), V(show.x, .3, 0)],
    [s(1) + 4.6, V(show.x + 3.8, 3.6, 6), V(show.x, .3, -.2)],
    [s(1) + 6.0, V(show.x + 2.6, 1.7, 1.5), V(show.x + 1.15, .15, -.45)],
    [s(1) + 7.9, V(show.x + 2.0, 1.4, 1.3), V(show.x + 1.15, .15, -.45)],
    [s(1) + 9.3, V(show.x - .8, 1.5, 1.6), V(show.x - 1.8, .3, -.45)],
    [s(1) + 10.8, V(show.x + 2.2, 2.0, -5.6), V(show.x + .3, .4, -2.7)],
    [s(2) - .1, V(show.x + 2.0, 2.2, -5.2), V(show.x + .3, .4, -2.7)],
    [s(2) + 1.0, V(G.x + 4.6, 4.8, 8), V(G.x, .5, .6)],
    [s(2) + 3.2, V(G.x + 3.6, 4.4, 7.4), V(G.x, 1.3, 1.4)],
    [s(2) + 4.6, V(G.x + 2.9, 2.0, 3.6), V(G.x + 1.16, 1.75, 2.2)],
    [s(2) + 6.2, V(G.x + 2.7, 2.15, 3.4), V(G.x + 1.16, 1.75, 2.2)],
    [s(2) + 7.4, V(G.x + 2.4, 3.7, 4.4), V(G.x + 1.05, 2.3, 1.95)],
    [s(3) - .3, V(G.x + 2.7, 3.9, 4.0), V(G.x + 1.05, 2.3, 1.95)],
    [s(3) + .6, V(SX - 3, 5, 9), V(SX, 0, 1)],
    [s(4) - .4, V(SX + 3, 4, 8), V(SX, 0, 1)],
    [s(4) + 1.5, V(-5, 7.5, 10), V(0, 4.2, -.5)],
    [s(5) - .3, V(5, 7, 10.5), V(0, 3.8, -.5)],
    [s(5) + 3, V(0, 6, 17), V(0, 3.4, 0)],
    [sc.dur, V(-2, 6.5, 18), V(0, 3.4, 0)],
  ];

  function update(t) {
    camPath(camera, t, keys);
    const r = rng(9);
    row.spin(t);
    const pw = ramp(t, .5, 1.5); bus.forEach(f => f.update(t, .25, pw));
    racks.forEach((rk, ri) => rk.nodes.forEach((n, i) => { const ph = r() * 6; n.led.material.emissiveIntensity = .8 + .3 * Math.sin(t * 3 + ph); n.dot.material.emissiveIntensity = (Math.sin(t * 9 + ph * 3) > .3) ? 1.5 : .3; }));
    const sl = ramp(t, s(1) + .2, 1.4); pulled.position.z = .02 + sl * 1.3; pulled.led.material.emissiveIntensity = .9 + sl * .8;
    cpu.update(t, { lid: ramp(t, s(1) + 3.0, 1.2), lift: ramp(t, s(1) + 4.4, 1.3), glow: ramp(t, s(1) + 5.2, 1) });
    gpu.update(t, { lid: ramp(t, s(2) + .6, 1), lift: ramp(t, s(2) + 1.5, 1.8), shroud: ramp(t, s(2) + 2.9, 1.2), glow: ramp(t, s(2) + 3.4, 1), link: ramp(t, s(2) + 6.2, .8) });
    sto.update(t, { lid: ramp(t, s(3) + .6, 1), pull: ramp(t, s(3) + 2, 1.2), glow: 1 });
    const net = ramp(t, s(4) - .5, 1.5);
    sw.forEach(x => x.material.emissiveIntensity = .3 + 1.5 * net);

    // overlay
    ui.el('c-k', 'kicker', 'To electrons → compute', 90, 70, win(t, .4, sc.dur, .6), { color: 'var(--elec)' });
    ui.el('c-t', 'h1', 'The REPACSS cluster', 90, 104, win(t, .4, sc.dur, .6), { fontSize: '50px' });
    const spec = (id, title, rows, a, b, x = 1330, y = 560, color = 'var(--elec)') => ui.el(id, 'card',
      `<div style="font-size:30px;font-weight:700;color:${color};margin-bottom:10px">${title}</div>` + rows.map(([k, v]) => `<div style="font-size:22px;line-height:1.55"><span style="color:var(--dim)">${k}</span>&nbsp; ${v}</div>`).join(''), x, y, win(t, a, b, .5));
    spec('c-cpu', '110 CPU nodes', [['CPU', '2 × AMD EPYC 9754'], ['Cores', '2 × 128 = 256 / node'], ['Memory', '1.5 TB DDR5 · 12 ch / socket'], ['Local', '1.92 TB NVMe']], s(1) + 3.6, s(2));
    spec('c-gpu', '8 GPU nodes', [['GPU', '4 × NVIDIA H100 NVL'], ['HBM', '94 GB per GPU'], ['Link', 'NVLink bridges'], ['CPU', '2 × Xeon Gold 6448Y · 512 GB']], s(2) + .8, s(3), 1330, 560, '#8dff6f');
    spec('c-sto', '9 storage nodes · ≈ 2.9 PB', [['2 × R660', 'NVMe (mixed use) · 25.6 TB each'], ['3 × R760', 'NVMe (read-intensive) · 184 TB each'], ['4 × R760xd2', 'SATA + NVMe accel · 584 TB each'], ['Shown', 'R760xd2 · 16 cores · 512 GB DDR5']], s(3) + .8, s(4), 1300, 560, '#ffd36b');
    ui.el('c-net', 'card', `<div style="font-size:30px;font-weight:700;color:#9fd6ff;margin-bottom:6px">InfiniBand topology</div><div style="font-size:18px;color:var(--dim);margin-bottom:8px">NDR · 2 × 200 Gb/s per node (one per socket) · 8 × 800 Gb/s core↔leaf · 25 GbE control network</div>${topoSVG(ramp(t, s(4) + .3, 4))}`, 90, 610, win(t, s(4) + .3, s(5), .5));
    const L = (id, html, p, a, b, col) => ui.label(id, html, p, camera, win(t, a, b, .4), col);
    L('c-ccd', 'EPYC 9754 package<small>8 Zen 4c CCDs × 16 cores + I/O die</small>', A(cpu, 'ccd').add(V(0, .05, 0)), s(1) + 6.0, s(1) + 9.0, '#7fe6ff');
    L('c-vrm', 'VRM power stages', A(cpu, 'vrm'), s(1) + 7.0, s(1) + 9.0, '#c7d0e0');
    L('c-dimm', '12 DDR5 channels / socket<small>24 RDIMMs · 1.5 TB</small>', A(cpu, 'dimm'), s(1) + 9.0, s(1) + 10.8, '#7dffa5');
    L('c-nic', '2 × ConnectX-7<small>NDR InfiniBand 200 Gb/s</small>', A(cpu, 'nic'), s(1) + 10.8, s(2) - .2, '#9fd6ff');
    L('c-psu', 'Redundant PSUs', A(cpu, 'psu'), s(1) + 11.2, s(2) - .2, '#7dffa5');
    L('c-h100', '4 × NVIDIA H100 NVL<small>PCIe Gen5 · two NVLink pairs</small>', A(gpu, 'gpu').add(V(-1.05, .3, 0)), s(2) + 1.4, s(2) + 3.6, '#8dff6f');
    L('c-die', 'GH100 die + 6 HBM3 stacks<small>94 GB per GPU</small>', A(gpu, 'die').add(V(0, .25, 0)), s(2) + 4.4, s(2) + 6.6, '#8dff6f');
    L('c-hdd', 'R760xd2 · 3.5″ SATA drives<small>one pulled: platters + actuator</small>', A(sto, 'pulled'), s(3) + 3, s(4) - .3, '#ffd36b');
    L('c-nvl', 'NVLink bridges<small>3 per GPU pair</small>', A(gpu, 'nvlink').add(V(0, .15, 0)), s(2) + 6.6, s(3), '#ffffff');
    ui.label('c-sw', 'InfiniBand switches<small>core · Rack 94 top · leaves mid-rack</small>', racks[3].switches[0].getWorldPosition(V(0, 0, 0)).add(V(0, .3, .9)), camera, win(t, s(4) + 1, s(5), .5), '#cdb6ff');
    ui.label('c-ups', 'UPS<small>solar · battery · grid · generator → every PDU</small>', V(half + 1.4, 2.9, 0), camera, win(t, .8, s(1) - .3, .5), '#7dffa5');
    ui.label('c-irc', 'In-row cooling', V(racks[0].position.x - .8, 4.6, .9), camera, win(t, 1.2, s(1) - .3, .5), '#9fd6ff');
    const tot = ramp(t, s(5) + .2, 2.4), num = (n) => Math.round(n * tot).toLocaleString('en-US');
    const stats = [['130', 'nodes', num(130)], ['28,984', 'CPU cores', num(28984)], ['32', 'H100 GPUs', num(32)], ['176 TB', 'memory', num(176) + ' TB'], ['3 TB', 'GPU memory', num(3) + ' TB'], ['2.9 PB', 'storage', (2.9 * tot).toFixed(1) + ' PB']];
    stats.forEach(([, cap], i) => ui.el('c-s' + i, 'card', `<div class="big">${stats[i][2]}</div><div class="cap">${cap}</div>`, 90 + i * 296, 840, ramp(t, s(5) + i * .2, .5), { width: '230px', textAlign: 'center' }));
  }
  return { scene, camera, update, env: .3, bloom: { strength: .8, radius: .45, threshold: .72 } };
}
