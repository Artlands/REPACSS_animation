// Challenge 3: checkpoint & restore — a cloud cuts solar power; the battery bridges until it runs low, then the job
// checkpoints to local NVMe, nodes power down, and restore when the sun returns.
import * as THREE from 'three';
import { C, ui, ramp, win, lerp, rng, rack, std, emis, flow, tube, cable, solarArray, glowSprite, V, camPath, vlerp, ease } from '../lib.js';

export default function checkpoint(sc) {
  const s = sc.s;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b16);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .1, 300);
  const amb = new THREE.AmbientLight(0xaabbdd, .6); scene.add(amb);
  const sunL = new THREE.DirectionalLight(0xfff0d0, 1.8); sunL.position.set(-10, 12, 6); scene.add(sunL);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: .6, metalness: .3 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const sun = glowSprite(0xffd27a, 9); sun.position.set(-14, 8, -14); scene.add(sun);
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffe2a0 })); sunCore.position.copy(sun.position); scene.add(sunCore);
  const pv = solarArray(2, 6, .5); pv.position.set(-17, 0, -1); scene.add(pv);
  const cloud = new THREE.Group(); scene.add(cloud);
  const r = rng(12);
  for (let i = 0; i < 16; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1 + r() * 1.4, 20, 14), new THREE.MeshStandardMaterial({ color: 0xdfe6f2, transparent: true, opacity: .92, roughness: 1 }));
    b.position.set((r() - .5) * 8, (r() - .5) * 1.6, (r() - .5) * 2); cloud.add(b); }

  const rk = rack(); rk.position.set(5, 0, 0); scene.add(rk);
  // the job's node slides out; its front NVMe bay holds the checkpoints
  const node = rk.nodes[8];
  const nv = new THREE.Mesh(new THREE.BoxGeometry(.16, .1, .4), std(0x2c3445, { metalness: .7 })); nv.position.set(.15, -.01, .62); node.add(nv);
  const nvL = new THREE.Mesh(new THREE.BoxGeometry(.14, .025, .01), emis(C.elec, 2)); nvL.position.set(.15, -.01, .83); node.add(nvL);
  // battery cabinet between the array and the rack
  const bat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 1.2), std(0xe9e3d2, { roughness: .7 })); bat.position.set(-2, .9, -3.2); scene.add(bat);
  const socBars = Array.from({ length: 6 }, (_, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.26, .6, .04), emis(0x7dffa5, 1.5)); m.position.set(-.8 + i * .32, 1.0, .62); bat.add(m); return m; });
  const bc = cable([-.8, .3, -3.2], [4.6, .3, -.2], .6); const bFlow = flow(bc, 50, 0x7dffa5, .5, 33), bTube = tube(bc, 0x7dffa5, .05, .2); scene.add(bFlow, bTube);
  const pc = cable([-12, .3, 0], [4.6, .3, .4], 1.2); const pFlow = flow(pc, 80, C.sun, .55, 31), pTube = tube(pc, C.sun, .05, .3); scene.add(pFlow, pTube);

  // job progress ring (60 segments)
  const ring = new THREE.Group(); ring.position.set(1.4, 4.4, .5); ring.scale.setScalar(.75); scene.add(ring);
  const segs = Array.from({ length: 60 }, (_, i) => { const a = Math.PI / 2 - i / 60 * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(.12, .13, .12), emis(C.tok, 2)); m.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0); m.rotation.z = a; ring.add(m); return m; });
  // checkpoint crystals
  const crystals = Array.from({ length: 7 }, () => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(.22), emis(0xa8ecff, 2.5)); scene.add(m); return m; });
  const src = V(1.4, 4.4, .5), dst = V(0, 0, 0);

  // timeline
  const power = (t) => 1 - .82 * ramp(t, s(1) + 1.2, 2.2) + .82 * ramp(t, s(4) + .4, 1.8);
  const offA = s(3) + 1.0, onB = s(4) + 1.8;
  const nodeState = (t) => t < s(3) ? 1 : t < offA ? .35 : t < onB ? 0 : 1;
  const ck1 = 1.4, ck2 = s(2) + .3, rs = s(4) + 2.4;
  const cloudAt = s(1) + 1.2;
  const soc = (t) => .7 - .6 * ramp(t, cloudAt + 1, ck2 - cloudAt - 1) + .5 * ramp(t, s(4) + .8, 6);
  const bridging = (t) => win(t, cloudAt + .8, ck2 + .4, .5);
  const progress = (t) => t < ck2 + 2 ? .30 + .022 * t : t < rs + 1.6 ? .30 + .022 * (ck2 + 2) : .30 + .022 * (ck2 + 2) + .03 * (t - rs - 1.6);

  const keys = [[0, V(-6, 6, 20), V(-2, 4, 0)], [s(1) + 1, V(-10, 7, 18), V(-6, 6.4, -2)], [s(2), V(3, 5, 17), V(4, 3, 0)], [s(3) + 1, V(1, 4.5, 16), V(4, 3, 0)], [s(4) + 1, V(-4, 6, 18), V(0, 4, -1)], [sc.dur, V(-1, 6, 19), V(1, 4, -1)]];

  function update(t) {
    camPath(camera, t, keys);
    node.position.z = .02 + ramp(t, s(2) - 1, 1) * .9; node.updateMatrixWorld(true); nvL.getWorldPosition(dst);
    cloud.position.set(lerp(-34, -14, ease((t - s(1) + 1.2) / 3.5)) + lerp(0, 26, ease((t - s(4)) / 5)), 7.8, -12);
    const P = power(t), ns = nodeState(t), p = progress(t);
    sun.material.opacity = .25 + .75 * P; sunL.intensity = .4 + 1.4 * P;
    pFlow.update(t, .2, P); pTube.material.opacity = .08 + .25 * P;
    const B = soc(t), br = bridging(t); bFlow.update(t, .25, br); bTube.material.opacity = .06 + .25 * br;
    socBars.forEach((m, i) => { m.material.emissiveIntensity = i < Math.round(B * 6) ? 1.6 : .05; m.material.emissive.setHex(B < .25 ? 0xffb020 : 0x7dffa5); });
    rk.nodes.forEach((n, i) => { n.led.material.emissiveIntensity = ns * (.8 + .3 * Math.sin(t * 5 + i)); n.dot.material.emissiveIntensity = ns > .5 ? 1.5 : ns * 1.5; });
    const lit = Math.round(p * 60);
    segs.forEach((m, i) => m.material.emissiveIntensity = i < lit ? (ns > .5 ? 2.2 : .6) : .06);
    nvL.material.emissiveIntensity = 1 + 3 * (win(t, ck1, ck1 + 1.6, .3) + win(t, ck2, ck2 + 2.4, .3) + win(t, rs, rs + 2, .3));
    // crystals: save (src->dst) at ck1 & ck2, restore (dst->src) at rs
    crystals.forEach((c, i) => {
      const fly = (t0, a, b) => { const u = (t - t0 - i * .2) / .9; if (u < 0 || u > 1) return false;
        c.position.copy(vlerp(a, b, ease(u))).add(V(0, Math.sin(u * Math.PI) * 1.2, 0)); c.rotation.set(t * 3, t * 2, 0); return true; };
      c.visible = (i < 3 && fly(ck1, src, dst)) || fly(ck2, src, dst) || fly(rs, dst, src);
    });

    ui.header('ck-h', 'Research challenge 3', 'Checkpointing &amp; restore', win(t, .4, sc.dur, .6));
    const state = t < cloudAt + .8 ? ['RUNNING', '#7dffa5'] : t < ck2 - 1.2 ? ['RUNNING · on battery', '#7dffa5'] : t < ck2 ? ['BATTERY LOW', '#ffb020'] : t < ck2 + 2.6 ? ['CHECKPOINTING → NVMe', '#7fe6ff'] : t < s(3) ? ['STATE SAVED', '#7fe6ff'] : t < offA ? ['IDLE', '#ffb020'] : t < onB ? ['POWERED DOWN', '#ff6b75'] : t < rs + 2 ? ['RESTORING', '#cdb6ff'] : ['RUNNING · resumed', '#7dffa5'];
    ui.label('ck-job', `<span style="color:${state[1]}">${state[0]}</span><small>job 41827 · ${Math.round(p * 100)}%</small>`, V(1.4, 5.9, .5), camera, ramp(t, .6, .5), '#fff');
    ui.label('ck-nv', 'local NVMe<small>1.92 TB per node</small>', dst.clone().add(V(.3, .25, 0)), camera, win(t, s(2) + .5, sc.dur, .5), '#7fe6ff');
    // power gauge + event timeline
    const gw = 520;
    ui.el('ck-g', 'card', `<div class="cap" style="margin:0 0 10px">Solar supply · ${Math.round(P * 100)}%</div><div style="width:${gw}px;height:14px;border-radius:7px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:${P * gw}px;height:14px;background:linear-gradient(90deg,#ff6b3d,#ffb53c)"></div></div><div class="cap" style="margin:14px 0 10px">Battery charge · ${Math.round(B * 100)}%</div><div style="width:${gw}px;height:14px;border-radius:7px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:${B * gw}px;height:14px;background:${B < .25 ? '#ffb020' : 'linear-gradient(90deg,#2fbf71,#7dffa5)'}"></div></div>`, 90, 740, win(t, .6, sc.dur, .5));
    const ev = [['periodic checkpoint', ck1], ['cloud cover', cloudAt], ['battery bridges', cloudAt + .8], ['battery low → checkpoint', ck2], ['power down', offA], ['sun returns', s(4) + .4], ['restore', rs]];
    ui.el('ck-tl', 'card', ev.map(([n, a]) => `<span style="opacity:${t > a ? 1 : .25};margin-right:22px">● ${n}</span>`).join(''), 90, 960, win(t, .6, sc.dur, .5), { fontSize: '20px' });
  }
  return { scene, camera, update, bloom: { strength: .85, radius: .5, threshold: .72 } };
}
