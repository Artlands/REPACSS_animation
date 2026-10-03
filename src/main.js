// Deterministic renderer: window.renderAt(t) draws exactly one frame for time t (seconds).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SketchShader, renderNormals } from './sketch.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { W, H, ui, clamp } from './lib.js';
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
import { zcheck } from './zcheck.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').prepend(renderer.domElement);

// MSAA through the post chain (default composer targets are not antialiased)
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType }));
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .8, .5, .75);
const normals = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
const sketch = new ShaderPass(SketchShader); sketch.uniforms.res.value = new THREE.Vector2(W, H); sketch.uniforms.tNormal.value = normals.texture;
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(sketch);

// canvas text (3D labels) is drawn while scenes build, so the hand font must be ready first
await Promise.all(['400 96px Kalam', '700 96px Kalam'].map(f => document.fonts.load(f)));
const timeline = await (await fetch('timeline.json', { cache: 'no-store' })).json();
const builders = { intro, problem, site, energy, photon, compute, tokens, measure, remote, schedule, checkpoint, outro };
const shared = {};   // scenes may share objects (e.g. outro reuses the site)
const scenes = timeline.scenes.map(sc => {
  const s = (i) => sc.sentences[Math.min(i, sc.sentences.length - 1)].start;
  return { ...sc, s, obj: builders[sc.id]({ ...sc, s }, shared) };
});
// soft studio reflections for every scene's metals and glass
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
for (const sc of scenes) { const s3 = sc.obj.scene; if (!s3.environment) { s3.environment = envTex; s3.environmentIntensity = sc.obj.env ?? .45; } }
const fade = document.getElementById('fade'), bug = document.getElementById('bug'), turb = document.getElementById('turb');

window.total = timeline.total;
window.renderAt = (t) => {
  let sc = scenes.find(x => t < x.start + x.dur) || scenes.at(-1);
  const lt = t - sc.start;
  ui.begin();
  const o = sc.obj;
  o.update(lt);
  const b = o.bloom || {};
  bloom.strength = (b.strength ?? .8) * .35; bloom.radius = .35; bloom.threshold = Math.max(.9, b.threshold ?? .9);
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderPass.scene = o.scene; renderPass.camera = o.camera;
  renderNormals(renderer, o.scene, o.camera, normals);
  const boil = Math.floor(t * 8);   // hand-drawn lines re-drawn 8×/s
  sketch.uniforms.seed.value = boil % 64; turb.setAttribute('seed', boil % 64);
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
  bug.style.opacity = sc === scenes[0] ? 0 : .42 * (1 - endCard);
};
window.timeline = timeline;
window.zcheckAt = (t) => { window.renderAt(t); const sc = scenes.find(x => t < x.start + x.dur) || scenes.at(-1); return zcheck(sc.obj.scene); };
window.renderAt(0);
window.ready = true;

// interactive preview: index.html?t=12  or ?play
const q = new URLSearchParams(location.search);
if (q.has('t')) window.renderAt(+q.get('t'));
if (q.has('play')) { const t0 = performance.now() - (+q.get('play') || 0) * 1000; const loop = () => { window.renderAt((performance.now() - t0) / 1000); requestAnimationFrame(loop); }; loop(); }
