// Z-fighting detector: finds pairs of visible faces from different boxes/planes that are coplanar,
// face the same way, and overlap in area. Run via `node render.mjs zcheck`.
import * as THREE from 'three';

const EPS = 2e-3, MIN_OVERLAP = 2e-3;

function facesOf(mesh, list) {
  const geo = mesh.geometry, p = geo.parameters || {};
  const mats = [];
  if (mesh.isInstancedMesh) for (let i = 0; i < mesh.count; i++) { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); mats.push(m.premultiply(mesh.matrixWorld)); }
  else mats.push(mesh.matrixWorld);
  const name = mesh.name || mesh.parent?.name || geo.type;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (mat && mat.visible === false) return;
  if (mat && mat.transparent && mat.opacity < .02) return;
  const dbl = mat && mat.side === THREE.DoubleSide;
  for (const M of mats) {
    let corners;
    if (geo.type === 'BoxGeometry') {
      const [w, h, d] = [p.width / 2, p.height / 2, p.depth / 2];
      const L = [[1, 0, 0, w, h, d], [-1, 0, 0, w, h, d], [0, 1, 0, w, h, d], [0, -1, 0, w, h, d], [0, 0, 1, w, h, d], [0, 0, -1, w, h, d]];
      for (const [nx, ny, nz] of L) {
        const c = [];
        for (const a of [-1, 1]) for (const b of [-1, 1]) {
          const v = nx ? [nx * w, a * h, b * d] : ny ? [a * w, ny * h, b * d] : [a * w, b * h, nz * d];
          c.push(new THREE.Vector3(...v).applyMatrix4(M));
        }
        push(list, c, new THREE.Vector3(nx, ny, nz).transformDirection(M), mesh, false);
      }
    } else if (geo.type === 'PlaneGeometry') {
      const [w, h] = [p.width / 2, p.height / 2];
      const c = [[-w, -h], [w, -h], [-w, h], [w, h]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(M));
      push(list, c, new THREE.Vector3(0, 0, 1).transformDirection(M), mesh, dbl);
    }
  }
}

function push(list, c, n, mesh, dbl) {
  if (c.some(v => !isFinite(v.x))) return;
  // order quad corners as a convex loop: (00, 10, 11, 01) from the generated (a,b) grid
  const q = [c[0], c[2], c[3], c[1]];
  const d = n.dot(q[0]);
  list.push({ q, n, d, mesh });
  if (dbl) list.push({ q, n: n.clone().negate(), d: -d, mesh });
}

function overlap2D(A, B, n) {
  // project to plane basis, SAT on both quads' edge normals; return min penetration
  const u = Math.abs(n.x) < .9 ? new THREE.Vector3(1, 0, 0).cross(n).normalize() : new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const v = n.clone().cross(u);
  const P = (Q) => Q.map(p => [p.dot(u), p.dot(v)]);
  const a = P(A), b = P(B);
  let pen = Infinity;
  for (const poly of [a, b]) for (let i = 0; i < 4; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4];
    const ax = [y2 - y1, x1 - x2], len = Math.hypot(...ax); if (len < 1e-9) continue;
    const pr = (pts) => pts.map(([x, y]) => (x * ax[0] + y * ax[1]) / len);
    const pa = pr(a), pb = pr(b);
    const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    pen = Math.min(pen, o);
  }
  return pen;
}

export function zcheck(scene) {
  scene.updateMatrixWorld(true);
  const list = [];
  scene.traverseVisible(o => { if (o.isMesh && !o.isSprite) facesOf(o, list); });
  const buckets = new Map();
  for (const f of list) {
    const k = [Math.round(f.n.x * 50), Math.round(f.n.y * 50), Math.round(f.n.z * 50), Math.round(f.d / EPS)].join(',');
    (buckets.get(k) || buckets.set(k, []).get(k)).push(f);
  }
  const hits = new Map();
  for (const [k, fs] of buckets) {
    // also compare with the neighbouring offset bucket to catch rounding edges
    const [a, b, c, dd] = k.split(',').map(Number);
    const near = fs.concat(buckets.get([a, b, c, dd + 1].join(',')) || []);
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < near.length; j++) {
      const F = fs[i], G = near[j];
      if (F.mesh === G.mesh && !F.mesh.isInstancedMesh) continue;
      if (F === G || Math.abs(F.d - G.d) > EPS || F.n.dot(G.n) < .999) continue;
      const pen = overlap2D(F.q, G.q, F.n);
      if (pen > MIN_OVERLAP) {
        const key = describe(F.mesh) + '  <->  ' + describe(G.mesh);
        const h = hits.get(key) || { n: 0, at: F.q[0].clone(), pen }; h.n++; hits.set(key, h);
      }
    }
  }
  return [...hits].map(([k, h]) => `${h.n}× ${k}  @ (${h.at.x.toFixed(2)}, ${h.at.y.toFixed(2)}, ${h.at.z.toFixed(2)})`);
}

function describe(m) {
  const p = m.geometry.parameters || {}, g = m.geometry.type.replace('Geometry', '');
  const dims = g === 'Box' ? `${+p.width.toFixed(3)}×${+p.height.toFixed(3)}×${+p.depth.toFixed(3)}` : g === 'Plane' ? `${+p.width.toFixed(2)}×${+p.height.toFixed(2)}` : '';
  const col = m.material && !Array.isArray(m.material) && m.material.color ? '#' + m.material.color.getHexString() : '';
  return `${m.isInstancedMesh ? 'Inst' : ''}${g}[${dims}]${col}`;
}
