// Hand-drawn look: a normal+depth pre-pass gives geometry outlines (not texture or text edges),
// then a final screen-space pass draws them as wobbly chalk strokes that "boil" at 8 fps,
// over posterized pastel fills with hatching on a textured dark paper.
import * as THREE from 'three';

// view-space normal in rgb, inverse depth in a (0 = background)
const nrmMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: `varying vec3 vN; varying float vZ;
    void main() {
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      vN = normalize(transformedNormal); vZ = -mvPosition.z;
    }`,
  fragmentShader: `varying vec3 vN; varying float vZ;
    void main() { gl_FragColor = vec4(normalize(vN) * .5 + .5, 1. / (1. + vZ)); }`,
});

/** Outlined = opaque-ish meshes; glows, sprites (incl. 3D text), points and lines stay unlined. */
const outlined = (o) => o.isMesh && !o.isSprite && o.material.blending !== THREE.AdditiveBlending && (!o.material.transparent || o.material.opacity > .3);

export function renderNormals(renderer, scene, camera, target) {
  const hidden = [];
  scene.traverseVisible(o => { if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && !outlined(o)) { o.visible = false; hidden.push(o); } });
  const bg = scene.background; scene.background = null; scene.overrideMaterial = nrmMat;
  const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.shadowMap.autoUpdate = au;
  scene.background = bg; scene.overrideMaterial = null;
  for (const o of hidden) o.visible = true;
}

export const SketchShader = {
  uniforms: { tDiffuse: { value: null }, tNormal: { value: null }, res: { value: null }, seed: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tNormal; uniform vec2 res; uniform float seed; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y); }
    float lum(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
    float edgeAt(vec2 uv, vec2 o) {
      vec4 a = texture2D(tNormal, uv), e = vec4(0);
      vec4 n[4]; n[0] = texture2D(tNormal, uv + vec2(o.x, 0)); n[1] = texture2D(tNormal, uv - vec2(o.x, 0));
      n[2] = texture2D(tNormal, uv + vec2(0, o.y)); n[3] = texture2D(tNormal, uv - vec2(0, o.y));
      float k = 0.;
      for (int i = 0; i < 4; i++) {
        float dz = abs(a.a - n[i].a) / max(max(a.a, n[i].a), 1e-4);
        float dn = (a.a > 0. && n[i].a > 0.) ? 1. - dot(a.rgb * 2. - 1., n[i].rgb * 2. - 1.) : 0.;
        k = max(k, max(smoothstep(.04, .12, dz), smoothstep(.15, .45, dn)));
      }
      return k;
    }
    void main() {
      vec2 px = 1. / res, fc = vUv * res, s = vec2(seed * 17.3, seed * -9.1);
      vec2 w = vec2(noise(fc / 90. + s), noise(fc / 90. + s + 31.)) - .5;
      vec3 c = texture2D(tDiffuse, vUv + w * 1.2 * px).rgb;                 // fills barely move (keeps text legible)
      float edge = edgeAt(vUv + w * 4. * px, px * 1.3);                     // lines wander off-register
      float paper = noise(fc * .6) * .55 + noise(fc * .15) * .3 + noise(fc * .03) * .15;   // static paper tooth
      float y = lum(c);
      c *= mix(1., (floor(y * 5. + .5) / 5. + .02) / (y + .02), .45);                        // posterized tones
      c *= .84 + .26 * paper;                                                                 // pastel skips on the tooth
      float hatch = smoothstep(.4, .9, abs(fract((fc.x + fc.y + noise(fc * .03 + s) * 6.) / 6.) * 2. - 1.));
      c *= 1. - .28 * (1. - hatch) * smoothstep(.04, .2, y) * (1. - smoothstep(.45, .75, y)); // midtone hatching
      c = max(c, vec3(.075, .08, .095) * (.75 + .5 * paper));                                // black -> dark paper
      float stroke = edge * (.55 + .45 * smoothstep(.2, .6, noise(fc * .3 + s * 5.)));      // uneven chalk pressure
      c = mix(c, vec3(.93, .91, .86), stroke * .8);
      gl_FragColor = vec4(c, 1.);
    }`,
};
