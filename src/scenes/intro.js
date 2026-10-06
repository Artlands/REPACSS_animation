// Cold open: the sun and the Earth, a photon crossing between them, the title card, then a dive into West Texas.
// Earth textures: NASA Blue Marble / Black Marble derived maps (three.js examples).
// Final approach: USDA NAIP aerial imagery (public domain, via USGS The National Map) in two patches centred on GLEAMM.
import * as THREE from 'three';
import { C, ui, ramp, win, rng, glowSprite, curve, V, camPath, vlerp, ease, clamp } from '../lib.js';

const load = (f) => new THREE.TextureLoader().loadAsync('assets/' + f).then(t => { t.anisotropy = 16; return t; });
const [dayTex, nightTex, cloudTex, specTex, texasTex, naip100, naip4] = await Promise.all(['earth_bm_5400.jpg', 'earth_lights_2048.png', 'earth_clouds_2048.png', 'earth_specular_2048.jpg', 'texas_bm_240ppd.jpg', 'reese_naip_100km.jpg', 'reese_naip_4km.jpg'].map(load));
dayTex.colorSpace = nightTex.colorSpace = cloudTex.colorSpace = texasTex.colorSpace = naip100.colorSpace = naip4.colorSpace = THREE.SRGBColorSpace;
const TEXAS = new THREE.Vector4(-110, -94, 27, 40);   // lon0, lon1, lat0, lat1 of the 240 px/deg NASA Blue Marble patch

const R = 10;
/** lat/lon (deg) -> point on a three.js SphereGeometry of radius r (u = 0 at lon -180) */
export const ll = (lat, lon, r = R) => {
  const phi = (lon + 180) / 360 * Math.PI * 2, th = (90 - lat) * Math.PI / 180;
  return V(-Math.cos(phi) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(phi) * Math.sin(th) * r);
};
// GLEAMM building at the NW corner of the Reese airfield (from NAIP imagery); TTU campus ~16 km (10 mi) east
const TTU = [33.584, -101.875], GLEAMM = [33.61229, -102.04853];
const KM = R / 6371;
const RAD = Math.PI / 180, hav = (a, b) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * RAD / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin((b[1] - a[1]) * RAD / 2) ** 2));
const DIST_KM = hav(GLEAMM, TTU);   // ≈ 16.4 km ≈ 10.2 mi

export default function intro(sc) {
  const s = sc.s;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x010208);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .5, 4000);
  scene.add(new THREE.AmbientLight(0x6070a0, .08));

  // starfield on a far shell
  const r = rng(7), sp = new Float32Array(5000 * 3);
  for (let i = 0; i < 5000; i++) { const v = V(r() - .5, r() - .5, r() - .5).normalize().multiplyScalar(1500 + r() * 500); sp.set([v.x, v.y, v.z], i * 3); }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)),
    new THREE.PointsMaterial({ color: 0xaab8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: .8 }));
  scene.add(stars);

  // sun (far left), its light falls on the Earth
  const SUN = V(-300, 30, -60);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(16, 48, 32), new THREE.MeshBasicMaterial({ color: 0xfff6e2, toneMapped: false })); sun.position.copy(SUN); scene.add(sun);
  const corona = glowSprite(C.sun, 150, .95); corona.position.copy(SUN); scene.add(corona);
  const halo = glowSprite(0xffe2a0, 60, 1); halo.position.copy(SUN); scene.add(halo);
  const key = new THREE.DirectionalLight(0xfff4e6, 3.2); key.position.copy(SUN); scene.add(key);
  const sunDir = SUN.clone().normalize();

  // Earth: oriented so Lubbock ends up facing the sun-lit side toward the final camera
  const earth = new THREE.Group(); scene.add(earth);
  const spin = new THREE.Group(); earth.add(spin);
  const target = V(-.6, .45, .66).normalize();
  earth.quaternion.setFromUnitVectors(ll(...GLEAMM).normalize(), target);
  // one pass: day map (+ hi-res Texas patch) lit by the sun, city lights on the night side, clouds, ocean glint.
  // A single sphere avoids the z-fighting that stacked shells produce at this scale.
  const surf = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), new THREE.ShaderMaterial({
    uniforms: { day: { value: dayTex }, night: { value: nightTex }, clouds: { value: cloudTex }, spec: { value: specTex }, texas: { value: texasTex },
      box: { value: TEXAS }, sunDir: { value: sunDir }, cloudShift: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: `uniform sampler2D day, night, clouds, spec, texas; uniform vec4 box; uniform vec3 sunDir; uniform float cloudShift;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 N=normalize(vN), V=normalize(cameraPosition-vW);
        float lon=vUv.x*360.-180., lat=vUv.y*180.-90.;
        vec3 col=texture2D(day,vUv).rgb;
        vec2 tuv=vec2((lon-box.x)/(box.y-box.x),(lat-box.z)/(box.w-box.z));
        if(tuv.x>0.&&tuv.x<1.&&tuv.y>0.&&tuv.y<1.){
          float e=smoothstep(0.,.08,min(min(tuv.x,1.-tuv.x),min(tuv.y,1.-tuv.y)));
          col=mix(col,texture2D(texas,tuv).rgb,e);
        }
        float nd=dot(N,sunDir), lit=smoothstep(-.08,.25,nd);
        float cl=texture2D(clouds,vUv+vec2(cloudShift,0.)).a;
        cl*=1.-.9*smoothstep(3.,1.1,length(cameraPosition)-10.);   // thin the clouds on final approach
        float sp=texture2D(spec,vUv).r*pow(max(dot(reflect(-sunDir,N),V),0.),40.)*lit;
        vec3 dayc=col*(.04+1.25*max(nd,0.))+sp*vec3(.55,.6,.65);
        dayc=mix(dayc,vec3(1.)*(.05+1.15*max(nd,0.)),cl*.9);
        vec3 nightc=texture2D(night,vUv).rgb*vec3(1.,.82,.55)*1.4*(1.-cl*.8);
        gl_FragColor=vec4(mix(nightc,dayc,lit),1.);
      }`,
  }));
  spin.add(surf);
  // atmosphere halo just outside the limb (view-space fresnel on a slightly larger back-facing shell)
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.025, 128, 64), new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }',
    fragmentShader: 'uniform vec3 sunDir; varying vec3 vN; varying vec3 vW; void main(){ vec3 v=normalize(cameraPosition-vW); float k=pow(clamp(1.+dot(v,vN)*1.6,0.,1.),2.2); float lit=smoothstep(-.35,.4,dot(vN,sunDir)); gl_FragColor=vec4(vec3(.32,.58,1.)*k*lit*1.4,1.); }',
  }));
  earth.add(atmo);

  // aerial-photo patches tangent to the globe at GLEAMM (square in metres, north up), edges feathered into the globe map
  const up0 = ll(...GLEAMM).normalize(), east0 = ll(GLEAMM[0], GLEAMM[1] + .01).sub(ll(...GLEAMM)).normalize(), north0 = ll(GLEAMM[0] + .01, GLEAMM[1]).sub(ll(...GLEAMM)).normalize();
  const patch = (map, halfKm, lift, order) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfKm * KM, 2 * halfKm * KM), new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, sunDir: { value: sunDir }, nrm: { value: V(0, 0, 0) }, tint: { value: new THREE.Color(1, 1, 1) }, fade: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 * order, polygonOffsetUnits: -4 * order,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D map; uniform vec3 sunDir, nrm, tint; uniform float fade; varying vec2 vUv;
        void main(){ float nd=dot(nrm,sunDir); vec3 c=texture2D(map,vUv).rgb*tint*(.04+1.25*max(nd,0.));
          float e=smoothstep(0.,.18,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y))); gl_FragColor=vec4(c,e*fade); }`,
    }));
    m.matrixAutoUpdate = false; m.matrix.makeBasis(east0, north0, up0).setPosition(up0.clone().multiplyScalar(R + lift)); m.renderOrder = order;
    spin.add(m); return m;
  };
  const patches = [patch(naip100, 50, 1e-6, 1), patch(naip4, 2, 2e-6, 2)];
  const BM_TINT = new THREE.Color(.66, .59, .36);   // NAIP mean colour → Blue Marble mean colour over the same 100 km (linear)

  // a photon travels sun -> Earth
  const pPath = curve([SUN.x + 20, SUN.y, SUN.z], [-120, 22, -90], target.clone().multiplyScalar(R * 1.02).toArray());
  const photon = glowSprite(0xfff1b8, 5); scene.add(photon);
  const trail = Array.from({ length: 28 }, (_, i) => { const t = glowSprite(C.sun, 4.4 - i * .14, .8 - i * .027); scene.add(t); return t; });

  // pins (world positions resolved every frame because the globe spins)
  const pin = glowSprite(0xff3040, .25); scene.add(pin);
  const ttuPin = glowSprite(0xffffff, .25); scene.add(ttuPin);
  const pinW = V(0, 0, 0), ttuW = V(0, 0, 0);
  // globe spin eases to a stop at the end of the scene so the final approach lands still
  const rotAt = (t) => { const T = sc.dur - t; return -.012 * (T > 6 ? T - 3 : T * T / 12); };
  const dirAt = (p, t) => ll(...p).normalize().applyAxisAngle(V(0, 1, 0), rotAt(t)).applyQuaternion(earth.quaternion);

  // camera: wide two-shot, slow push, then the dive toward Lubbock
  const surfDir = target, tan = V(0, 1, 0).cross(surfDir).normalize();
  const above = (alt, side = 0, up = 0, d = surfDir) => d.clone().multiplyScalar(R + alt).add(V(0, 1, 0).cross(d).normalize().multiplyScalar(side)).add(V(0, up, 0));
  // from t0 the camera follows the GLEAMM point down; log-altitude keys: 4.2 (~2700 km) → .06 (~38 km), a slow hold while
  // Texas Tech and the distance are shown, then down to .004 (~2.5 km)
  const t0 = s(5) + 2.5, A0 = 4.2;
  const altKeys = [[t0, A0], [t0 + 3, .06], [t0 + 5.4, .042], [sc.dur, .004]].map(([tk, a]) => [tk, Math.log(a)]);
  const altAt = (t) => { let i = 0; while (i < altKeys.length - 2 && t > altKeys[i + 1][0]) i++;
    const [ta, la] = altKeys[i], [tb, lb] = altKeys[i + 1]; return Math.exp(la + (lb - la) * ease((t - ta) / (tb - ta))); };
  const keys = [
    [0, V(40, 14, 150), V(-120, 8, -20)],
    [s(2) + 1, V(36, 13, 140), V(-108, 6, -12)],
    [s(3) + 1, V(-10, 12, 62), V(-20, 4, 0)],
    [s(4) + 1.5, above(28, 8, 2), tan.clone().multiplyScalar(-9)],
    [t0, above(A0, 1, 1.4, dirAt(GLEAMM, t0)), dirAt(GLEAMM, t0).multiplyScalar(R)],
  ];

  function update(t) {
    spin.rotation.y = rotAt(t);
    const gd = dirAt(GLEAMM, t);
    if (t < t0) camPath(camera, t, keys);
    else { const alt = altAt(t), k = alt / A0; camera.position.copy(above(alt, k, 1.4 * k, gd)); camera.lookAt(gd.clone().multiplyScalar(R)); }
    surf.material.uniforms.cloudShift.value = t * .0004;
    // keep depth precision: near plane follows the altitude
    const alt = camera.position.length() - R; camera.near = clamp(alt * .25, 2e-4, .5); camera.far = alt < .6 ? 40 : 4000; camera.updateProjectionMatrix();
    // patches fade in on the way down, carrying the Blue Marble colour at first and their own colour near the ground
    const hi = clamp((alt - .08) / .7);
    patches.forEach(p => { const u = p.material.uniforms; u.nrm.value.copy(gd); u.fade.value = clamp((1.4 - alt) / .8); u.tint.value.setRGB(1, 1, 1).lerp(BM_TINT, hi); });
    corona.material.opacity = .85 + .1 * Math.sin(t * 1.7);
    // photon: launches with sentence 2, lands as it ends
    const pt = ramp(t, s(2) + .4, 4.2), live = pt > 0 && pt < 1;
    photon.visible = live; const v = V(0, 0, 0); pPath.getPointAt(pt, v); photon.position.copy(v);
    trail.forEach((tr, i) => { pPath.getPointAt(Math.max(0, pt - i * .008), tr.position); tr.visible = live; });
    // pins
    surf.updateMatrixWorld(true);
    const ph = R + Math.min(.015, alt * .02);   // pins float just above the ground, closer as the camera descends
    pinW.copy(gd).multiplyScalar(ph); ttuW.copy(dirAt(TTU, t)).multiplyScalar(ph);
    pin.position.copy(pinW); const pinOn = ramp(t, s(5) + 2, 1);
    pin.material.opacity = pinOn; pin.scale.setScalar(camera.position.distanceTo(pinW) * .03 * (1 + .25 * Math.sin(t * 5)));
    const ttuOn = clamp(Math.min((.1 - alt) / .03, (alt - .02) / .008));   // Texas Tech + distance shown around the hold (~60 → 13 km)
    if (ttuOn > 0) {   // dashed screen-space line GLEAMM ↔ Texas Tech
      camera.updateMatrixWorld();   // project with this frame's camera, not last frame's
      const sp = (w) => { const p = w.clone().project(camera); return [(p.x * .5 + .5) * 1920, (-p.y * .5 + .5) * 1080]; };
      const [ax, ay] = sp(pinW), [bx, by] = sp(ttuW);
      ui.el('i-dl', '', `<svg width="1920" height="1080"><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#ffd27a" stroke-width="3" stroke-dasharray="14 10" stroke-linecap="round"/><circle cx="${ax}" cy="${ay}" r="7" fill="#ff3040"/><circle cx="${bx}" cy="${by}" r="7" fill="#fff"/></svg>`, 0, 0, ttuOn, { zIndex: -1 });
      ui.el('i-dist', 'sub', `${DIST_KM.toFixed(1)} km · ${(DIST_KM / 1.609).toFixed(1)} miles`, (ax + bx) / 2, (ay + by) / 2 + 18, ttuOn, { color: '#ffd27a', fontSize: '26px', fontWeight: '600', transform: 'translateX(-50%)', textShadow: '0 1px 10px rgba(0,0,0,.9)', whiteSpace: 'nowrap' });
    }
    ttuPin.position.copy(ttuW); ttuPin.material.opacity = ttuOn; ttuPin.scale.setScalar(camera.position.distanceTo(ttuW) * .02);

    // overlay
    const o1 = win(t, .4, s(3) - .4, .8);
    ui.el('i-q', 'sub', 'Every answer an AI model gives you is built one token at a time.', 90, 940, o1 * ramp(t, s(0) + .2, .6), { fontSize: '30px', color: '#cfd8ee' });
    ui.el('i-q2', 'sub', '…and every token begins as energy.', 90, 990, o1 * ramp(t, s(1), .6), { fontSize: '30px', color: 'var(--sun)' });
    ui.label('i-sun', 'The Sun<small>150 million km away · light takes 8 min 20 s</small>', SUN.clone().add(V(0, 26, 0)), camera, win(t, s(2) + .3, s(3) + .5, .6), '#ffd27a');
    ui.label('i-earth', 'Earth', target.clone().multiplyScalar(R * 1.35).add(V(0, 4, 0)), camera, win(t, s(2) + 3.6, s(3) + .5, .6), '#9fd0ff');
    const ot = win(t, s(3) + .3, s(5) + 1.2, 1);
    ui.el('i-dim', '', '', 0, 0, ot * .55, { width: '1920px', height: '1080px', background: 'linear-gradient(90deg,rgba(1,2,8,.9),rgba(1,2,8,0) 65%)', zIndex: -1 });
    ui.el('i-k', 'kicker', 'Texas Tech University · NSF Award 2404438', 90, 690, ot);
    ui.el('i-t', '', '<img src="assets/repacss-red.svg" style="width:700px;display:block">', 70, 722, ot);
    ui.el('i-s', 'sub', '<b style="color:#fff">RE</b>motely-managed <b style="color:#fff">P</b>ower <b style="color:#fff">A</b>ware <b style="color:#fff">C</b>omputing <b style="color:#fff">S</b>ystems and <b style="color:#fff">S</b>ervices', 92, 905, ot);
    ui.el('i-p', 'h1', '<span style="color:var(--sun)">From Photons</span> <span style="color:var(--dim);font-weight:400">to</span> <span style="color:var(--tok)">Tokens</span>', 92, 960, ot * ramp(t, s(4), 1), { fontSize: '46px' });
    // dive: place names
    const dv = ramp(t, s(5) + .4, 1);
    ui.label('i-tx', 'West Texas<small>Southern High Plains</small>', ll(35.2, -101.0, R).applyMatrix4(surf.matrixWorld), camera, dv * (1 - ramp(t, s(5) + 4.4, .8)), '#e8eefc');
    ui.label('i-gl', 'GLEAMM · REPACSS<small>Reese Technology Center</small>', pinW, camera, win(t, s(5) + 2.4, sc.dur - 1.6, .6), '#ff8a94');
    ui.label('i-ttu', 'Texas Tech University<small>Lubbock</small>', ttuW, camera, ttuOn, '#e8eefc');

    // atmospheric haze hands off to the site's aerial shot
    ui.el('i-haze', '', '', 0, 0, ramp(t, sc.dur - 2.2, 2.2), { width: '1920px', height: '1080px', background: '#c9d8ea' });
  }
  return { scene, camera, update, noFadeOut: true, bloom: { strength: 1.0, radius: .6, threshold: .7 } };
}
