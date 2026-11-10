// End card for the booth shorts: logo, slogan, the short's title, then a fade to black so the loop restarts cleanly.
import * as THREE from 'three';
import { ui, ramp } from '../lib.js';
import { SHORTS, SHORT_COUNT } from '../shorts.js';

export default function endcard(sc) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .1, 10);
  const meta = SHORTS[new URLSearchParams(location.search).get('story')] ?? { n: 1, title: '' };
  function update(t) {
    const a = ramp(t, .1, .8), out = 1 - ramp(t, sc.dur - 1, 1);
    const c = (x) => ({ transform: 'translateX(-50%)', ...x });
    ui.el('e-r', '', '<img src="assets/repacss-red.svg" style="width:820px;display:block">', 960, 260, a * out, c({}));
    ui.el('e-s', 'slogan', 'Accelerating <b>Discovery</b>, <b>Reducing</b> Costs, Improving <b>Efficiency</b>', 960, 500, ramp(t, .5, .8) * out, c({ fontSize: '38px', fontWeight: '500' }));
    ui.el('e-t', 'kicker', `${meta.n} / ${SHORT_COUNT} · ${meta.title}`, 960, 610, ramp(t, .8, .8) * out, c({ fontSize: '22px' }));
    ui.el('e-u', 'sub', 'repacss.org', 960, 680, ramp(t, 1, .8) * out, c({ fontSize: '34px', color: '#fff' }));
    ui.el('e-f', 'sub', 'Texas Tech University · Supported by the U.S. National Science Foundation under Grant No. 2404438', 960, 800, ramp(t, 1.2, .8) * out, c({ fontSize: '22px' }));
  }
  return { scene, camera, update, noFadeOut: true };
}
