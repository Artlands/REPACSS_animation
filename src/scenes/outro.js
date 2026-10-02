// Outro: the site at golden hour, impact, and the end card.
import * as THREE from 'three';
import { ui, ramp, win, V, camPath } from '../lib.js';

export default function outro(sc, shared) {
  const S = shared.site;
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .5, 900);
  const s = sc.s;
  const keys = [[0, V(60, 22, 90), V(4, 4, 10)], [s(1), V(10, 30, 110), V(0, 6, 0)], [s(2), V(-40, 45, 140), V(0, 10, -10)], [sc.dur, V(-60, 70, 170), V(0, 12, -20)]];
  const day = { sun: new THREE.Color(0xfff1d6), hemi: new THREE.Color(0xcfe3ff) }, gold = { sun: new THREE.Color(0xffb36a), hemi: new THREE.Color(0xffcf9e) };

  function update(t) {
    camPath(camera, t, keys); S.animate(t + 40); S.scene.fog.near = 120; S.scene.fog.far = 420;
    S.sunL.color.copy(gold.sun); S.hemi.color.copy(gold.hemi); S.sunL.intensity = 2.2; S.hemi.intensity = .8;
    const card = (id, html, x, y, a, b) => ui.el(id, 'card', html, x, y, win(t, a, b, .5));
    ui.el('o-scrim', '', '', 0, 0, win(t, .4, s(2), .6), { width: '1920px', height: '300px', background: 'linear-gradient(rgba(2,6,16,.75),rgba(2,6,16,0))', zIndex: -1 });
    ui.el('o-k', 'kicker', 'Impact', 90, 70, win(t, .4, s(2), .6));
    ui.el('o-t', 'h1', 'A national resource, a blueprint for industry', 90, 104, win(t, .4, s(2), .6), { fontSize: '50px' });
    card('o-a', `<div class="big" style="font-size:40px">NSF ACCESS</div><div class="cap">allocated production resource · open nationwide</div>`, 90, 760, s(0) + .3, s(2));
    // slogan lock-up (logo mark + three lines), as on the booth artwork
    const sg = win(t, s(1) + .4, s(2) - .3, .6);
    ui.el('o-sd', '', '', 0, 0, sg * .55, { width: '1920px', height: '1080px', background: 'linear-gradient(90deg,rgba(2,4,10,.85),rgba(2,4,10,.2))', zIndex: -1 });
    ui.el('o-sm', '', '<img src="assets/mark-red.svg" style="width:300px;display:block">', 110, 330, sg);
    ui.el('o-sl', 'slogan', 'Accelerating <b>Discovery</b><br><b>Reducing</b> Costs<br>Improving <b>Efficiency</b>', 460, 345, sg, { fontSize: '76px' });
    const end = ramp(t, s(2) - .2, 1.2);
    ui.el('o-dim', '', '', 0, 0, end * .6, { width: '1920px', height: '1080px', background: '#02040a', zIndex: -1 });
    ui.el('o-c', 'h1', shared.endLine ?? '<span style="color:var(--sun)">Photons</span> <span style="color:#8090b0">→</span> <span style="color:var(--elec)">Electrons</span> <span style="color:#8090b0">→</span> <span style="color:#8dff6f">FLOPs</span> <span style="color:#8090b0">→</span> <span style="color:var(--tok)">Tokens</span>', 960, 230, end, { fontSize: '54px', transform: 'translateX(-50%)' });
    const e2 = ramp(t, s(2) + 2.6, 1);
    ui.el('o-r', '', '<img src="assets/repacss-red.svg" style="width:880px;display:block">', 960, 350, e2, { transform: 'translateX(-50%)' });
    ui.el('o-s', 'slogan', 'Accelerating <b>Discovery</b>, <b>Reducing</b> Costs, Improving <b>Efficiency</b>', 960, 605, ramp(t, s(2) + 3.2, 1), { fontSize: '38px', fontWeight: '500', transform: 'translateX(-50%)' });
    ui.el('o-u', 'sub', 'repacss.org', 960, 690, ramp(t, s(2) + 3.6, 1), { fontSize: '32px', color: '#fff', transform: 'translateX(-50%)' });
    ui.el('o-f', 'sub', 'Texas Tech University · Supported by the U.S. National Science Foundation under Grant No. 2404438', 960, 790, ramp(t, s(2) + 4, 1), { fontSize: '22px', transform: 'translateX(-50%)' });
    ui.el('o-bk', '', '', 0, 0, ramp(t, sc.dur - 1.2, 1.2), { width: '1920px', height: '1080px', background: '#000' });
  }
  return { scene: S.scene, camera, update, exposure: .85, bloom: { strength: .4, radius: .5, threshold: .9 } };
}
