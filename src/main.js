// Deterministic renderer: window.renderAt(t) draws exactly one frame for time t (seconds).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { W, H, ui, clamp, ramp } from './lib.js';
import intro from './scenes/intro.js';
import problem from './scenes/problem.js';
import site from './scenes/site.js';
import energy from './scenes/energy.js';
import photon from './scenes/photon.js';
import compute from './scenes/compute.js';
import tokens from './scenes/tokens.js';
import measure from './scenes/measure.js';
import remote from './scenes/remote.js';
import schedule from './scenes/schedule.js';
import checkpoint from './scenes/checkpoint.js';
import outro from './scenes/outro.js';
import endcard from './scenes/endcard.js';
import { SHORTS, SHORT_COUNT } from './shorts.js';
import { zcheck } from './zcheck.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(W, H);   // render.mjs sets the ratio (SCALE=2 → 4K)
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').prepend(renderer.domElement);

// MSAA through the post chain (default composer targets are not antialiased)
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W * devicePixelRatio, H * devicePixelRatio, { samples: 4, type: THREE.HalfFloatType }));
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .8, .5, .75);
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());
composer.setSize(W, H);   // CSS size; the composer scales its targets and passes by the pixel ratio

const q = new URLSearchParams(location.search), STORY = q.get('story') || '';   // ?story=short_site
const timeline = await (await fetch(`timeline${STORY ? '_' + STORY : ''}.json`, { cache: 'no-store' })).json();
const SHORT = SHORTS[STORY];   // booth shorts: opening title card
const builders = { intro, problem, site, energy, photon, compute, tokens, measure, remote, schedule, checkpoint, outro, endcard };
const shared = {};   // scenes may share objects (e.g. outro reuses the site)
const scenes = timeline.scenes.map(sc => {
  const s = (i) => sc.sentences[Math.min(i, sc.sentences.length - 1)].start;
  return { ...sc, s, obj: builders[sc.id]({ ...sc, s }, shared) };
});
// soft studio reflections for every scene's metals and glass
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
for (const sc of scenes) { const s3 = sc.obj.scene; if (!s3.environment) { s3.environment = envTex; s3.environmentIntensity = sc.obj.env ?? .45; } }
const fade = document.getElementById('fade'), bug = document.getElementById('bug');

window.total = timeline.total;
window.renderAt = (t) => {
  let sc = scenes.find(x => t < x.start + x.dur) || scenes.at(-1);
  const lt = t - sc.start;
  ui.begin();
  const o = sc.obj;
  o.update(lt);
  if (SHORT) titleCard(sc, lt);
  caption(sc, lt);
  const b = o.bloom || {};
  bloom.strength = (b.strength ?? .8) * .35; bloom.radius = .35; bloom.threshold = Math.max(.9, b.threshold ?? .9);
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderPass.scene = o.scene; renderPass.camera = o.camera;
  composer.render();
  ui.end();
  // dip to black between scenes
  const f = .6;
  const i = scenes.indexOf(sc), next = scenes[i + 1];
  const fadeOut = !next || o.noFadeOut || next.obj.noFadeIn ? 0 : 1 - clamp((sc.dur - lt) / f);
  const fadeIn = o.noFadeIn ? 0 : 1 - clamp(lt / f);
  const sm = (x) => x * x * (3 - 2 * x);
  fade.style.opacity = sm(Math.max(fadeIn, fadeOut));
  const endCard = sc === scenes.at(-1) ? clamp((lt - sc.s(2) + .8) / .6) : 0;
  bug.style.opacity = sc.id === 'intro' || sc.id === 'endcard' ? 0 : .42 * (1 - endCard);
};
window.timeline = timeline;

// ---- burned-in captions (booth screens often play without sound) and the shorts' opening title card ----
/** split a sentence into caption chunks of at most ~68 characters (one line), breaking after punctuation once a chunk
 *  has 28+ characters; a short tail is folded into the previous chunk */
function chunks(text) {
  const out = []; let cur = '';
  for (const x of text.split(' ')) {
    if (cur && (cur + ' ' + x).length > 68) { out.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x;
    if (cur.length >= 28 && /[,.:;?]$/.test(x)) { out.push(cur); cur = ''; }
  }
  if (cur) { if (cur.length < 16 && out.length && (out.at(-1) + ' ' + cur).length <= 80) out[out.length - 1] += ' ' + cur; else out.push(cur); }
  return out;
}
function titleCard(sc, lt) {
  // title card over the first scene's opening seconds
  if (sc === scenes[0]) {
    const a = ramp(lt, .2, .5) * (1 - ramp(lt, 3.6, .6));
    ui.el('sh-dim', '', '', 0, 0, a * .88, { width: '1920px', height: '1080px', background: 'radial-gradient(ellipse at center,rgba(2,4,10,.9),rgba(2,4,10,.5))', zIndex: 4 });   // above the scene's own labels
    ui.el('sh-k', 'kicker', `REPACSS · ${SHORT.n} / ${SHORT_COUNT}`, 960, 400, a, { transform: 'translateX(-50%)', fontSize: '22px', zIndex: 5 });
    ui.el('sh-t', 'h1', SHORT.title, 960, 450, a, { transform: 'translateX(-50%)', fontSize: '84px', whiteSpace: 'nowrap', zIndex: 5 });
    ui.el('sh-s', 'sub', SHORT.sub, 960, 570, a, { transform: 'translateX(-50%)', fontSize: '30px', color: '#dfe7f5', whiteSpace: 'nowrap', zIndex: 5 });
  }
}
function caption(sc, lt) {
  // caption: the chunk of the current sentence, timed by character count; held through the gap after it
  const ss = sc.sentences; let k = -1;
  for (let i = 0; i < ss.length; i++) if (lt >= ss[i].start - .05) k = i;
  // the intro already prints its first two lines on screen
  if (k < 0 || sc.id === 'intro' && k < 2 || sc.id === 'endcard' && lt > ss[k].end + .4 || lt > ss[k].end + 1.2) return;
  const cs = chunks(ss[k].text), tot = cs.reduce((n, c) => n + c.length, 0), u = clamp((lt - ss[k].start) / (ss[k].end - ss[k].start));
  let acc = 0, j = 0; for (; j < cs.length - 1; j++) { acc += cs[j].length; if (u * tot < acc) break; }
  ui.el('sh-cap', '', cs[j], 960, 1066, 1, { transform: 'translate(-50%,-100%)', fontSize: '34px', fontWeight: '600', color: '#fff', background: 'rgba(2,4,10,.78)',
    padding: '8px 22px', borderRadius: '12px', whiteSpace: 'nowrap', letterSpacing: '.01em', zIndex: 6 });
}
window.zcheckAt = (t) => { window.renderAt(t); const sc = scenes.find(x => t < x.start + x.dur) || scenes.at(-1); return zcheck(sc.obj.scene); };
// the slogan's italic Raleway (display=block) only downloads on first use, which left its first frame blank: load it up front
await Promise.all(['italic 500 40px Raleway', 'italic 700 40px Raleway'].map(f => document.fonts.load(f)));
window.renderAt(0);
window.ready = true;

// interactive preview: index.html?t=12  or ?play
if (q.has('t')) window.renderAt(+q.get('t'));
if (q.has('play')) { const t0 = performance.now() - (+q.get('play') || 0) * 1000; const loop = () => { window.renderAt((performance.now() - t0) / 1000); requestAnimationFrame(loop); }; loop(); }
