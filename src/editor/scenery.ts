// Entorno de la vista 3D realista: cielo, mapa de entorno para reflejos, pasto, pavimento y árboles.
import * as THREE from "three";

export const SKY = { top: new THREE.Color(0x3f7fd0), horizon: new THREE.Color(0xd3e2f0), ground: new THREE.Color(0x6f7458) };

/** Cúpula de cielo degradado (azul arriba, bruma en el horizonte); siempre detrás de todo. */
export function skyDome() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY.top }, horizon: { value: SKY.horizon }, ground: { value: SKY.ground } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 2.5), 0.55)) : mix(horizon, ground, min(1.0, -h * 6.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), m);
  s.frustumCulled = false; s.renderOrder = -1;
  return s;
}

/** Mapa de entorno (cielo, sol y suelo) para que vidrios, metales y techos reflejen algo creíble. */
export function skyEnvironment(ren: THREE.WebGLRenderer) {
  const sc = new THREE.Scene(), dome = skyDome();
  dome.scale.setScalar(50);
  sc.add(dome);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 11, 9) }));
  sun.position.set(24, 32, 16);
  sc.add(sun);
  const pm = new THREE.PMREMGenerator(ren), rt = pm.fromScene(sc, 0.02);
  pm.dispose();
  return rt.texture;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Lienzo de pasto: manchas de verdes y briznas. Se repite cada `m` metros. */
function grassCanvas() {
  const N = 256, cv = document.createElement("canvas"), R = rng(7);
  cv.width = cv.height = N;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#6f8a45"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 260; i++) {
    const x = R() * N, y = R() * N, r = 6 + R() * 26, l = 30 + R() * 14, hue = 78 + R() * 22;
    g.fillStyle = `hsla(${hue},${34 + R() * 16}%,${l}%,0.18)`;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 5000; i++) {
    const x = R() * N, y = R() * N;
    g.fillStyle = R() < 0.5 ? "rgba(40,60,20,0.35)" : "rgba(170,190,110,0.3)";
    g.fillRect(x, y, 1, 2 + R() * 2);
  }
  return cv;
}

/** Lienzo de concreto con juntas cada 1,5 m (el módulo es de 3 m). */
function pavingCanvas() {
  const N = 256, cv = document.createElement("canvas"), R = rng(11);
  cv.width = cv.height = N;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#b9b4aa"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 3000; i++) {
    const v = 150 + R() * 70;
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.25)`;
    g.fillRect(R() * N, R() * N, 1 + R() * 2, 1 + R() * 2);
  }
  g.strokeStyle = "rgba(80,76,70,0.55)"; g.lineWidth = 2;
  for (const p of [0, N / 2]) { g.beginPath(); g.moveTo(p + 1, 0); g.lineTo(p + 1, N); g.moveTo(0, p + 1); g.lineTo(N, p + 1); g.stroke(); }
  return cv;
}

/** Material hecho para una sola reconstrucción: el visor lo libera al rehacer la escena. */
const temp = (m: THREE.MeshStandardMaterial) => { m.userData.temp = true; return m; };

const texCache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, make: () => HTMLCanvasElement, ren: THREE.WebGLRenderer) {
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ren.capabilities.getMaxAnisotropy();
    texCache.set(key, t);
  }
  return t;
}

/** Plano de pasto grande centrado en (cx, cz); la niebla disimula su borde. */
export function grass(ren: THREE.WebGLRenderer, cx: number, cz: number, y: number, size: number) {
  const t = tex("grass", grassCanvas, ren).clone();
  t.needsUpdate = true;
  const tile = 3;
  t.repeat.set(size / tile, size / tile);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), temp(new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: 0xa6ae92 })));
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  return m;
}

/** Material de pavimento (banqueta alrededor de la casa), UV en metros desde el origen. */
export function pavingMaterial(ren: THREE.WebGLRenderer, w: number, d: number) {
  const t = tex("paving", pavingCanvas, ren).clone();
  t.needsUpdate = true;
  t.repeat.set(w / 3, d / 3);
  return temp(new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
}

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 });
const leafMats = [0x4d6b2e, 0x5b7a34, 0x3f5f2a, 0x6a8340].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
const leafGeo = new THREE.IcosahedronGeometry(1, 1);
const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 7);

/** Árbol de copa redonda hecho de varias esferas facetadas; h: altura total. */
export function tree(x: number, z: number, y: number, h: number, seed: number) {
  const R = rng(seed), g = new THREE.Group(), th = h * 0.42, cr = h * 0.27;
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.scale.set(h / 7, th + cr * 0.6, h / 7);
  trunk.position.y = (th + cr * 0.6) / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const mat = leafMats[Math.floor(R() * leafMats.length)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + R(), d = i ? cr * 0.55 : 0, s = cr * (i ? 0.7 + R() * 0.2 : 1);
    const b = new THREE.Mesh(leafGeo, mat);
    b.scale.set(s, s * 0.85, s);
    b.position.set(Math.cos(a) * d, th + cr + (i ? (R() - 0.3) * cr * 0.6 : 0), Math.sin(a) * d);
    b.rotation.set(R() * 3, R() * 3, 0);
    b.castShadow = true;
    g.add(b);
  }
  g.position.set(x, y, z);
  return g;
}

/**
 * Árboles alrededor del rectángulo [x0,x1]×[z0,z1] (planta con su margen), a unos metros de él.
 * El frente que mira la cámara inicial (lados +x y +z) queda despejado salvo las esquinas lejanas.
 */
export function treeSpots(x0: number, z0: number, x1: number, z1: number) {
  const R = rng(Math.round((x1 - x0) * 31 + (z1 - z0) * 17)), out: { x: number; z: number; h: number }[] = [];
  const off = () => 3 + R() * 3, h = () => 6 + R() * 3.5;
  const along = (a: number, b: number, at: (t: number) => void) => {
    const n = Math.max(1, Math.round((b - a) / 7));
    for (let i = 0; i < n; i++) at(a + ((i + 0.5) / n) * (b - a) + (R() - 0.5) * 2);
  };
  along(x0 - 2, x1 + 2, (x) => out.push({ x, z: z0 - off(), h: h() })); // fondo
  along(z0 - 2, z1 + 2, (z) => out.push({ x: x0 - off(), z, h: h() })); // costado izquierdo
  out.push({ x: x1 + off() + 2, z: z0 - off(), h: h() }, { x: x0 - off(), z: z1 + off() + 2, h: h() });
  return out;
}
