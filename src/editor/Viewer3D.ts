import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { furnitureSolids, furnitureToPlan } from "../core/furniture";
import { discOfSystem, mepDef, systemDef } from "../core/mep";
import { bounds, dir, loc, parapet, pieces, roofGeom, solidPts, wallEnds, type P3, type Pt } from "../core/geometry";
import { stairGeom } from "../core/stairs";
import type { Level, Opening, Roof, Wall } from "../core/model";
import { openingStyle } from "../core/openingStyles";
import { dormerGeom } from "../core/dormers";
import { finish, gableWall, outward, roofFinish, type Finish } from "../core/finishes";
import { finishTile } from "./finishTextures";
import { framing, MEMBER_COLOR, type Member } from "../core/framing";
import { foundation, gradeLevel } from "../core/foundation";
import { deckBoxes, type Box } from "../core/decks";
import type { Editor } from "./Editor";
import { grass, pavingMaterial, SKY, skyDome, skyEnvironment, tree, treeSpots } from "./scenery";
import { IN } from "../core/units";

/** Block de concreto (CMU) de la cimentación: piezas de 16" × 8" a hueso. */
const CMU: Finish = { id: "cmu-foundation", name: "Block de concreto", en: "CMU", color: "#a9a69e", style: "brick", row: 8 * IN, len: 16 * IN, bond: true, vary: 0.05 };

/** Muro o pilar de block (no de concreto) de la cimentación. */
const isCmu = (m: Member) => (m.kind === "foundation" || m.kind === "pier") && !/CONC/.test(m.size);

/** Caras (hacia fuera) de una pieza recta como prisma: la base en planta entre sus dos alturas. */
function memberFaces(m: Member): P3[][] {
  const vertical = Math.abs(m.b.z - m.a.z) > 1e-6;
  let base: Pt[], z0: number, z1: number;
  if (vertical) {
    const al = m.along ?? { x: 1, y: 0 }, n = { x: -al.y, y: al.x }, hw = m.w / 2, hh = m.h / 2;
    base = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: m.a.x + al.x * hw * i + n.x * hh * j, y: m.a.y + al.y * hw * i + n.y * hh * j }));
    z0 = Math.min(m.a.z, m.b.z); z1 = Math.max(m.a.z, m.b.z);
  } else {
    const L = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) || 1, nx = (-(m.b.y - m.a.y) / L) * (m.w / 2), ny = ((m.b.x - m.a.x) / L) * (m.w / 2);
    base = [{ x: m.a.x + nx, y: m.a.y + ny }, { x: m.b.x + nx, y: m.b.y + ny }, { x: m.b.x - nx, y: m.b.y - ny }, { x: m.a.x - nx, y: m.a.y - ny }];
    z0 = m.a.z - m.h / 2; z1 = m.a.z + m.h / 2;
  }
  const out: P3[][] = base.map((a, i) => { const b = base[(i + 1) % 4]; return [{ ...a, z: z0 }, { ...b, z: z0 }, { ...b, z: z1 }, { ...a, z: z1 }]; });
  out.push(base.map((q) => ({ ...q, z: z1 })), [...base].reverse().map((q) => ({ ...q, z: z0 })));
  return out;
}

/** Modelo 3D generado a partir de la planta. Se reconstruye en cada cambio. */
export class Viewer3D {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private ren: THREE.WebGLRenderer;
  private ctl: OrbitControls;
  private sun = new THREE.DirectionalLight(0xffffff, 0.7);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a8576, 0.75 * Math.PI);
  private group = new THREE.Group();
  /** Vista realista: cielo, sol cálido, reflejos, pasto y árboles. Si no, la vista de modelo de siempre. */
  private realistic = true;
  private sky = skyDome();
  private env?: THREE.Texture;
  private dirty = true;
  private raf = 0;
  private timer = 0;
  private unsub: () => void;
  private ro: ResizeObserver;
  private mat = {
    wall: new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.92 }),
    sel: new THREE.MeshStandardMaterial({ color: 0x6e9cff, roughness: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 1 }),
    door: new THREE.MeshStandardMaterial({ color: 0x9a6640, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fc5e8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x40464a, roughness: 0.5 }),
    slab: new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.95 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xa4553a, roughness: 0.85, side: THREE.DoubleSide }),
    roofSel: new THREE.MeshStandardMaterial({ color: 0x6e9cff, roughness: 0.6, side: THREE.DoubleSide }),
    gable: new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.92, side: THREE.DoubleSide, shadowSide: THREE.FrontSide }),
    stair: new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 }),
    furn: new THREE.MeshStandardMaterial({ color: 0xc7b299, roughness: 0.85 }),
    /** Azotea sin material elegido: impermeabilizante elastomérico rojo óxido */
    azotea: new THREE.MeshStandardMaterial({ color: 0xa65a42, roughness: 0.85, side: THREE.DoubleSide, shadowSide: THREE.FrontSide }),
    /** Remate del pretil y gárgolas: concreto */
    coping: new THREE.MeshStandardMaterial({ color: 0xb9b5ad, roughness: 0.9 }),
    edge: new THREE.LineBasicMaterial({ color: 0x2b3330, transparent: true, opacity: 0.55 }),
  };

  private mepMats = new Map<string, THREE.Material>();
  private mepMat(color: string, line = false) {
    const k = `${line ? "l" : "m"}${color}`;
    let m = this.mepMats.get(k);
    if (!m) { m = line ? new THREE.LineBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.6 }); this.mepMats.set(k, m); }
    return m;
  }

  private finMats = new Map<string, THREE.Material>();
  /** Material con la textura del acabado; las UV de las caras van en metros. */
  private finishMat(f: Finish) {
    let m = this.finMats.get(f.id);
    if (!m) {
      const t = finishTile(f), tex = new THREE.CanvasTexture(t.canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / t.tw, 1 / t.th);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const metal = f.style === "seam" || f.style === "corr" || f.style === "panel";
      m = new THREE.MeshStandardMaterial({ map: tex, roughness: metal ? 0.45 : 0.9, metalness: metal ? 0.35 : 0, side: THREE.DoubleSide });
      this.finMats.set(f.id, m);
    }
    return m;
  }

  /**
   * Carpintería de un hueco según su tipo: hojas, vidrios, montantes y travesaños.
   * a..b es el vano a lo largo del muro y top la altura del dintel sobre el nivel.
   */
  private carpentry(box: (w: Wall, sa: number, sb: number, z0: number, z1: number, th: number, mat: THREE.Material, edges?: boolean, ext?: undefined, n?: number) => void,
    w: Wall, o: Opening, a: number, b: number, top: number, sel: boolean) {
    const st = openingStyle(o).id, W = b - a, m = (a + b) / 2, t = w.thick;
    const leafM = sel ? this.mat.sel : this.mat.door, frameM = sel ? this.mat.sel : this.mat.frame, glass = this.mat.glass;
    /** Hoja acristalada: bastidor de ancho fw y vidrio dentro. */
    const glazed = (sa: number, sb: number, z0: number, z1: number, th: number, fw = 0.06, n = 0, fm = frameM) => {
      box(w, sa, sb, z0, z0 + fw, th, fm, false, undefined, n); box(w, sa, sb, z1 - fw, z1, th, fm, false, undefined, n);
      box(w, sa, sa + fw, z0 + fw, z1 - fw, th, fm, false, undefined, n); box(w, sb - fw, sb, z0 + fw, z1 - fw, th, fm, false, undefined, n);
      box(w, sa + fw, sb - fw, z0 + fw, z1 - fw, th * 0.4, glass, false, undefined, n);
    };
    const leaf = (sa: number, sb: number, z0 = 0, z1 = top - 0.02) => box(w, sa, sb, z0, z1, 0.045, leafM);
    if (o.kind === "door") {
      switch (st) {
        case "double": leaf(a + 0.02, m - 0.005); leaf(m + 0.005, b - 0.02); break;
        case "french": glazed(a + 0.02, m - 0.005, 0, top - 0.02, 0.045, 0.1, 0, leafM); glazed(m + 0.005, b - 0.02, 0, top - 0.02, 0.045, 0.1, 0, leafM); break;
        case "entry": {
          const side = Math.min(0.36, W * 0.22);
          glazed(a, a + side, 0, top, 0.06); glazed(b - side, b, 0, top, 0.06);
          leaf(a + side + 0.02, b - side - 0.02);
          break;
        }
        case "slider": glazed(a, m + 0.05, 0, top, 0.05, 0.06, -0.03); glazed(m - 0.05, b, 0, top, 0.05, 0.06, 0.03); break;
        case "bifold": for (let i = 0; i < 4; i++) leaf(a + 0.01 + (i * W) / 4, a + ((i + 1) * W) / 4 - 0.006); break;
        case "dutch": leaf(a + 0.02, b - 0.02, 0, top * 0.5 - 0.008); leaf(a + 0.02, b - 0.02, top * 0.5 + 0.008); break;
        case "barn": {
          const sd = o.flip ? -1 : 1;
          box(w, a - 0.05, b + 0.05, 0.01, top + 0.05, 0.04, leafM, true, undefined, sd * (t / 2 + 0.035));
          box(w, a - 0.1, b + W, top + 0.08, top + 0.12, 0.03, frameM, true, undefined, sd * (t / 2 + 0.02));
          break;
        }
        case "garage": {
          const gm = sel ? this.mat.sel : this.mepMat("#ecebe6"), k = 4, hh = (top - 0.02) / k;
          for (let i = 0; i < k; i++) box(w, a + 0.01, b - 0.01, i * hh + 0.004, (i + 1) * hh - 0.004, 0.05, gm);
          // ventanillas en la sección de arriba
          const n = Math.max(2, Math.round(W / 0.6));
          for (let i = 0; i < n; i++) { const s0 = a + 0.1 + (i * (W - 0.2)) / n; box(w, s0 + 0.04, s0 + (W - 0.2) / n - 0.04, 3 * hh + 0.08, 4 * hh - 0.08, 0.055, glass, false); }
          break;
        }
        default: leaf(a + 0.02, b - 0.02);
      }
      return;
    }
    // ventanas: marco completo, vidrio y montantes o travesaños según el tipo
    const z0 = o.sill, z1 = top, fw = st === "picture" ? 0.07 : 0.05, th = t * 0.6;
    box(w, a, b, z0, z0 + fw, th, frameM, false); box(w, a, b, z1 - fw, z1, th, frameM, false);
    box(w, a, a + fw, z0 + fw, z1 - fw, th, frameM, false); box(w, b - fw, b, z0 + fw, z1 - fw, th, frameM, false);
    if (st === "jalousie") {
      for (let z = z0 + fw; z + 0.09 <= z1 - fw + 1e-6; z += 0.1) box(w, a + fw, b - fw, z, z + 0.09, 0.012, glass, false);
      return;
    }
    box(w, a + fw, b - fw, z0 + fw, z1 - fw, 0.02, glass, false);
    const mid = (z0 + z1) / 2;
    if (st === "single-hung" || st === "double-hung") box(w, a + fw, b - fw, mid - 0.025, mid + 0.025, th, frameM, false);
    if (st === "slider" || st === "casement2") box(w, m - 0.025, m + 0.025, z0 + fw, z1 - fw, th, frameM, false);
    if (st === "awning" || st === "hopper" || st === "casement") {
      // bastidor de la hoja dentro del marco
      const i = fw + 0.03;
      box(w, a + i, b - i, z0 + i, z0 + i + 0.03, th * 0.5, frameM, false); box(w, a + i, b - i, z1 - i - 0.03, z1 - i, th * 0.5, frameM, false);
    }
  }

  /** Vista de la estructura: solo las piezas de madera y las zapatas, sobre las losas en transparencia. */
  private buildFraming(polys: (ps: P3[][], mat: THREE.Material) => void) {
    const ghost = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, transparent: true, opacity: 0.25, roughness: 1, depthWrite: false });
    for (const lv of this.ed.project.levels) for (const sl of lv.slabs) {
      if (sl.pts.length < 3) continue;
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(sl.pts.map((p) => new THREE.Vector2(p.x, p.y))), { depth: sl.thick, bevelEnabled: false });
      const mesh = new THREE.Mesh(g, ghost);
      mesh.rotation.x = Math.PI / 2; mesh.position.y = lv.elev;
      this.group.add(mesh);
    }
    // el muro y los pilares de block con su aparejo, como en la vista normal
    const ms = framing(this.ed.project).filter((m) => !this.ed.hiddenMembers.has(m.kind)), cmu = this.finishMat(CMU);
    this.members(ms.filter((m) => !isCmu(m)));
    for (const m of ms.filter(isCmu)) polys(memberFaces(m), cmu);
  }

  /** Piezas como cajas orientadas: las verticales según su muro, las demás apuntando de a a b. */
  private members(ms: Member[]) {
    this.boxes(ms.map((m) => ({ ...m, color: MEMBER_COLOR[m.kind] })));
  }

  private glassMats = new Map<string, THREE.Material>();
  /** Cajas orientadas de color (piezas de estructura, decks y barandales); con opacity, translúcidas y sin arista. */
  private boxes(ms: Box[], sel = false) {
    const unit = new THREE.BoxGeometry(1, 1, 1), edges = new THREE.EdgesGeometry(unit), tmp = new THREE.Vector3();
    for (const m of ms) {
      const A = new THREE.Vector3(m.a.x, m.a.z, m.a.y), B = new THREE.Vector3(m.b.x, m.b.z, m.b.y), L = A.distanceTo(B);
      if (L < 1e-3) continue;
      let mat = sel ? this.mat.sel : this.mepMat(m.color);
      if (m.opacity !== undefined && !sel) {
        const k = `${m.color}${m.opacity}`;
        mat = this.glassMats.get(k) ?? new THREE.MeshStandardMaterial({ color: m.color, transparent: true, opacity: m.opacity, depthWrite: false, roughness: 0.2 });
        this.glassMats.set(k, mat);
      }
      const mesh = new THREE.Mesh(unit, mat);
      mesh.position.copy(A).add(B).multiplyScalar(0.5);
      if (m.along) {
        // montante: alto en y, w a lo largo del muro y h a través
        mesh.scale.set(m.w, L, m.h);
        mesh.rotation.y = -Math.atan2(m.along.y, m.along.x);
      } else {
        // pieza tumbada o inclinada: el largo en z local apuntando a B, el canto en y
        mesh.scale.set(m.w, m.h, L);
        mesh.lookAt(tmp.copy(B));
      }
      mesh.castShadow = m.opacity === undefined;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      if (m.opacity !== undefined || Math.min(m.w, m.h) < 0.03) continue;
      const e = new THREE.LineSegments(edges, this.mat.edge);
      e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.scale.copy(mesh.scale);
      this.group.add(e);
    }
  }

  constructor(private host: HTMLElement, private ed: Editor, private background: () => string) {
    // profundidad logarítmica: sin ella, caras a pocos centímetros (losa y muro, pretil y chaflán) parpadean de lejos
    this.ren = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.ren.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.ren.shadowMap.enabled = true;
    this.ren.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.ren.domElement);
    this.ctl = new OrbitControls(this.cam, this.ren.domElement);
    this.ctl.enableDamping = true;
    this.ctl.maxPolarAngle = Math.PI / 2.05;
    this.ctl.addEventListener("change", () => (this.dirty = true));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.group, this.sky);
    this.look();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.unsub = ed.onModel(() => this.schedule());
    this.resize();
    this.build();
    this.fit();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.ctl.update() || this.dirty) { this.dirty = false; this.sky.position.copy(this.cam.position); this.ren.render(this.scene, this.cam); }
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.unsub();
    this.ro.disconnect();
    this.ctl.dispose();
    this.ren.dispose();
    this.ren.domElement.remove();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.ren.setSize(w, h);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.dirty = true;
  }

  isRealistic() { return this.realistic; }
  setRealistic(on: boolean) {
    if (on === this.realistic) return;
    this.realistic = on;
    this.look();
    this.build();
  }

  /** Luces, tono y materiales de cada modo. */
  private look() {
    const r = this.realistic, m = this.mat;
    this.ren.toneMapping = r ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.ren.toneMappingExposure = r ? 0.9 : 1;
    if (r && !this.env) this.env = skyEnvironment(this.ren);
    this.scene.environment = r ? this.env! : null;
    this.sky.visible = r;
    this.hemi.color.set(r ? 0xcfe0ff : 0xffffff);
    this.hemi.groundColor.set(r ? 0x7a7560 : 0x8a8576);
    this.hemi.intensity = r ? 0.9 : 0.75 * Math.PI;
    this.sun.color.set(r ? 0xfff0dc : 0xffffff);
    this.sun.intensity = r ? 3 : 0.7 * Math.PI;
    this.sun.shadow.radius = r ? 3 : 1;
    // en la vista realista no se dibujan aristas: los muros se arman por piezas (junto a puertas y ventanas) y sus uniones se verían
    m.edge.visible = !r;
    Object.assign(m.glass, r ? { opacity: 0.6, roughness: 0.04, metalness: 0.65, envMapIntensity: 1.4 } : { opacity: 0.35, roughness: 0.1, metalness: 0.1, envMapIntensity: 1 });
    m.glass.color.set(r ? 0x5f7f92 : 0x8fc5e8);
    m.frame.color.set(r ? 0x2e3236 : 0x40464a);
    m.frame.metalness = r ? 0.5 : 0;
    m.roof.envMapIntensity = r ? 0.5 : 1;
    if (!r) this.scene.fog = null;
    this.dirty = true;
  }

  schedule() { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.build(), 60); }

  build() {
    const { project, vis, active } = this.ed;
    this.ren.setClearColor(this.realistic ? SKY.horizon : new THREE.Color(this.background() || "#e4e8e6"));
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
      const mt = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mt?.userData?.temp) { mt.map?.dispose(); mt.dispose(); }
    }
    let base = 0; // cota del nivel que se está construyendo
    /** ext: revestimiento en la cara exterior (+1 la de la normal izquierda, −1 la otra). */
    const box = (w: Wall, sa: number, sb: number, z0: number, z1: number, th: number, mat: THREE.Material, edges = true, ext?: { mat: THREE.Material; side: 1 | -1 }, n = 0) => {
      if (sb - sa < 1e-3 || z1 - z0 < 1e-3) return;
      const { ux, uy } = dir(w), g = new THREE.BoxGeometry(sb - sa, z1 - z0, th), c = loc(w, (sa + sb) / 2, n);
      if (ext) {
        // UV en metros desde el arranque del muro y la cota 0, para que las hiladas casen entre piezas
        const uv = g.attributes.uv as THREE.BufferAttribute, i0 = ext.side > 0 ? 16 : 20;
        for (let i = i0; i < i0 + 4; i++) uv.setXY(i, ext.side > 0 ? sa + uv.getX(i) * (sb - sa) : uv.getX(i) * (sb - sa) - sb, base + z0 + uv.getY(i) * (z1 - z0));
      }
      const mesh = new THREE.Mesh(g, ext ? [mat, mat, mat, mat, ext.side > 0 ? ext.mat : mat, ext.side > 0 ? mat : ext.mat] : mat);
      mesh.position.set(c.x, base + (z0 + z1) / 2, c.y);
      mesh.rotation.y = -Math.atan2(uy, ux);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      if (edges) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), this.mat.edge);
        e.position.copy(mesh.position); e.rotation.copy(mesh.rotation);
        this.group.add(e);
      }
    };
    /** Polígonos convexos (x, y de planta y z de altura) como una malla triangulada en abanico. */
    const polys = (ps: P3[][], mat: THREE.Material) => {
      const v: number[] = [];
      for (const f of ps) for (let i = 1; i + 1 < f.length; i++)
        for (const q of [f[0], f[i], f[i + 1]]) v.push(q.x, base + q.z, q.y);
      if (!v.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      // UV en metros sobre el plano de cada cara: u a lo largo del alero (horizontal), v según la pendiente
      const uv: number[] = [];
      for (const f of ps) {
        if (f.length < 3) continue;
        const A = new THREE.Vector3(f[0].x, f[0].z, f[0].y), B = new THREE.Vector3(f[1].x, f[1].z, f[1].y), C = new THREE.Vector3(f[2].x, f[2].z, f[2].y);
        const n = B.clone().sub(A).cross(C.clone().sub(A)).normalize();
        const e1 = Math.abs(n.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(n).normalize(), e2 = n.clone().cross(e1);
        if (e2.y < 0) e2.negate();
        const at = (q: P3) => { const p = new THREE.Vector3(q.x, base + q.z, q.y); uv.push(p.dot(e1), p.dot(e2)); };
        for (let i = 1; i + 1 < f.length; i++) for (const q of [f[0], f[i], f[i + 1]]) at(q);
      }
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), this.mat.edge);
      this.group.add(e);
    };
    /**
     * Muro entero como un prisma: el alzado (con muescas para las puertas y huecos para las ventanas) extruido al grueso.
     * Devuelve false si el hueco corta el muro de arriba abajo o toca sus extremos; entonces se arma por piezas.
     */
    const wallSolid = (lv: Level, w: Wall, solids: [number, number][], ops: { o: Opening; a: number; b: number }[], H: number, mat: THREE.Material, ext?: { mat: THREE.Material; side: 1 | -1 }) => {
      if (!solids.length || w.thick < 1e-3 || H < 1e-3) return false;
      const e = 1e-3, s0 = Math.min(solids[0][0], ...ops.map((p) => p.a)), s1 = Math.max(solids[solids.length - 1][1], ...ops.map((p) => p.b));
      // en las esquinas los extremos van a inglete: si los dos muros se traslapan, las caras de uno asoman por la del otro como una línea
      const [m0, m1] = wallEnds(lv, w);
      if (ops.some((p) => p.a < Math.max(s0, ...(m0 ?? [])) + e || p.b > Math.min(s1, ...(m1 ?? [])) - e)) return false;
      const cuts = ops.map(({ o, a, b: bb }) => ({ a, b: bb, lo: Math.max(0, o.sill), hi: Math.min(H, o.sill + o.height) }));
      if (cuts.some((c) => c.a < s0 + e || c.b > s1 - e || (c.lo < e && c.hi > H - e) || c.hi - c.lo < e)) return false;
      const outline: THREE.Vector2[] = [new THREE.Vector2(s0, 0)];
      for (const c of cuts.filter((c) => c.lo < e)) outline.push(new THREE.Vector2(c.a, 0), new THREE.Vector2(c.a, c.hi), new THREE.Vector2(c.b, c.hi), new THREE.Vector2(c.b, 0));
      outline.push(new THREE.Vector2(s1, 0), new THREE.Vector2(s1, H));
      for (const c of cuts.filter((c) => c.hi > H - e).reverse()) outline.push(new THREE.Vector2(c.b, H), new THREE.Vector2(c.b, c.lo), new THREE.Vector2(c.a, c.lo), new THREE.Vector2(c.a, H));
      outline.push(new THREE.Vector2(s0, H));
      const shape = new THREE.Shape(outline);
      for (const c of cuts.filter((c) => c.lo >= e && c.hi <= H - e))
        shape.holes.push(new THREE.Path([new THREE.Vector2(c.a, c.lo), new THREE.Vector2(c.b, c.lo), new THREE.Vector2(c.b, c.hi), new THREE.Vector2(c.a, c.hi)]));
      const g = new THREE.ExtrudeGeometry(shape, { depth: w.thick, bevelEnabled: false, curveSegments: 1 });
      // grupos: cara de atrás (z = 0), cara de enfrente (z = grueso) y cantos
      const lids = g.groups[0].count, half = lids / 2, rest = g.attributes.position.count - lids;
      g.clearGroups();
      g.addGroup(0, half, 0); g.addGroup(half, half, 1); g.addGroup(lids, rest, 2);
      const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), k = pos.getZ(i) / w.thick, me = Math.abs(x - s0) < 1e-6 ? m0 : Math.abs(x - s1) < 1e-6 ? m1 : null;
        if (me) pos.setX(i, me[0] + (me[1] - me[0]) * k);
      }
      g.computeVertexNormals();
      // UV en metros: s a lo largo del muro (al revés en la cara de atrás, que se ve desde el otro lado) y la cota
      for (let i = 0; i < lids; i++) uv.setXY(i, i < half ? -pos.getX(i) : pos.getX(i), base + pos.getY(i));
      const back = ext && ext.side < 0 ? ext.mat : mat, front = ext && ext.side > 0 ? ext.mat : mat;
      const { ux, uy } = dir(w), o = loc(w, 0, -w.thick / 2);
      const mesh = new THREE.Mesh(g, [back, front, mat]);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.makeBasis(new THREE.Vector3(ux, 0, uy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-uy, 0, ux)).setPosition(o.x, base, o.y);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      const ed = new THREE.LineSegments(new THREE.EdgesGeometry(g), this.mat.edge);
      ed.matrixAutoUpdate = false; ed.matrix.copy(mesh.matrix);
      this.group.add(ed);
      return true;
    };
    /** Prisma de base en planta (con huecos) que baja `depth` desde la cota y; mats: [cara de arriba, de abajo, cantos]. */
    const plate = (outer: Pt[], holes: Pt[][], depth: number, y: number, mats: THREE.Material | THREE.Material[]) => {
      const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
      for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      if (Array.isArray(mats)) {
        const lids = g.groups[0].count, half = lids / 2;
        g.clearGroups();
        g.addGroup(0, half, 0); g.addGroup(half, half, 1); g.addGroup(lids, g.attributes.position.count - lids, 2);
      }
      const mesh = new THREE.Mesh(g, mats);
      mesh.rotation.x = Math.PI / 2; // (x, y) de la planta pasa a (x, z); la extrusión baja
      mesh.position.y = y;
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), this.mat.edge);
      e.rotation.copy(mesh.rotation); e.position.copy(mesh.position);
      this.group.add(e);
    };
    /**
     * Azotea: losa maciza con su espesor (frente y plafón aplanados), impermeabilizante arriba, pretil con remate de
     * concreto, chaflán en el encuentro con el pretil y gárgolas en el lado de atrás.
     */
    const azotea = (r: Roof, sel: boolean) => {
      const g = roofGeom(r), rf = roofFinish(r), zr = r.base + r.thick, top = base + zr;
      const skin = sel ? this.mat.roofSel : rf ? this.finishMat(rf) : this.mat.azotea, plaster = sel ? this.mat.roofSel : this.mat.wall;
      plate(g.outline, r.holes ?? [], r.thick, top, [skin, plaster, plaster]);
      const pp = parapet(r);
      if (!pp) return;
      plate(pp.outer, [pp.inner], pp.h, top + pp.h, plaster);
      const grow = (q: Pt[], d: number) => { const [a, , c] = q; return [{ x: a.x - d, y: a.y - d }, { x: c.x + d, y: a.y - d }, { x: c.x + d, y: c.y + d }, { x: a.x - d, y: c.y + d }]; };
      plate(grow(pp.outer, 0.025), [grow(pp.inner, 0.025)], 0.05, top + pp.h + 0.05, sel ? this.mat.roofSel : this.mat.coping);
      // chaflán de 10 cm: cuatro faldones a 45° que se cortan a inglete en las esquinas
      const c = Math.min(0.1, pp.h / 2), lo = grow(pp.inner, -c), hi = pp.inner;
      polys(hi.map((_, i) => { const j = (i + 1) % 4; return [{ ...lo[i], z: zr }, { ...lo[j], z: zr }, { ...hi[j], z: zr + c }, { ...hi[i], z: zr + c }]; }), skin);
      // gárgolas en el lado de atrás (y menor en planta): salen 30 cm del paño del pretil, al ras de la azotea
      const [o0, , o2] = pp.outer, len = pp.t + 0.3;
      for (const k of [0.25, 0.75]) {
        const gg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, len), sel ? this.mat.roofSel : this.mat.coping);
        gg.position.set(o0.x + (o2.x - o0.x) * k, top + 0.05, o0.y + pp.t - len / 2);
        gg.castShadow = true;
        this.group.add(gg);
      }
    };
    const b = projectBounds(this.ed);
    const real = this.realistic && !this.ed.framing, gl = gradeLevel(project), cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.1, b.y1 - b.y0), real ? pavingMaterial(this.ren, b.x1 - b.x0, b.y1 - b.y0) : this.mat.floor);
    floor.position.set(cx, gl - 0.05, cz);
    floor.receiveShadow = true;
    this.group.add(floor);
    const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 10);
    if (real) {
      this.group.add(grass(this.ren, cx, cz, gl - 0.03, Math.max(400, span * 20)));
      const trees = project.entourage !== false ? treeSpots(b.x0, b.y0, b.x1, b.y1) : [];
      trees.forEach((t, i) => this.group.add(tree(t.x, t.z, gl, t.h, i * 101 + 7)));
      this.scene.fog = new THREE.Fog(SKY.horizon, span * 3, span * 14);
    } else this.scene.fog = null;
    this.placeSun(cx, cz, span / 2 + (real ? 10 : 4), floor.position.y);
    // en la vista de estructura el terreno baja para que se vean las zapatas
    if (this.ed.framing) {
      const zs = foundation(project).flatMap((m) => [m.a.z - m.h / 2, m.b.z - m.h / 2]);
      floor.position.y = Math.min(-0.75, ...zs) - 0.1;
      this.buildFraming(polys); this.dirty = true; return;
    }
    // la cimentación se ve donde asoma sobre el terreno (block del crawl space, pilares)
    // el muro y los pilares de block llevan su aparejo (hiladas de 8" y piezas de 16"); lo demás, su color
    if (vis.losas) {
      const fnd = foundation(project).filter((m) => ["footing", "foundation", "pier", "girder"].includes(m.kind));
      this.members(fnd.filter((m) => !isCmu(m)));
      const cmu = this.finishMat(CMU);
      for (const m of fnd.filter(isCmu)) polys(memberFaces(m), cmu);
    }

    project.levels.forEach((m, li) => {
      base = m.elev;
      const isSel = (t: "wall" | "opening" | "slab" | "roof" | "stair" | "furniture", id: number) => li === active && this.ed.isSelected(t, id);
      // losas: el contorno se extruye hacia abajo desde la cota del nivel
      if (vis.losas) for (const sl of m.slabs) {
        if (sl.pts.length < 3) continue;
        const shape = new THREE.Shape(sl.pts.map((p) => new THREE.Vector2(p.x, p.y)));
        for (const h of sl.holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
        const g = new THREE.ExtrudeGeometry(shape, { depth: sl.thick, bevelEnabled: false });
        const mesh = new THREE.Mesh(g, isSel("slab", sl.id) ? this.mat.sel : this.mat.slab);
        mesh.rotation.x = Math.PI / 2; // (x, y) de la planta pasa a (x, z); la extrusión baja
        mesh.position.y = base;
        mesh.castShadow = mesh.receiveShadow = true;
        this.group.add(mesh);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), this.mat.edge);
        e.rotation.copy(mesh.rotation); e.position.copy(mesh.position);
        this.group.add(e);
      }
      if (vis.cubiertas) for (const r of m.roofs) {
        if (r.kind === "flat") { azotea(r, isSel("roof", r.id)); continue; }
        const g = roofGeom(r);
        const rf = roofFinish(r);
        polys(g.faces, isSel("roof", r.id) ? this.mat.roofSel : rf ? this.finishMat(rf) : this.mat.roof);
        // cada hastial con el revestimiento del muro sobre el que se levanta
        for (const f of g.gables) { const fin = finish(gableWall(m.walls, f)?.finish); polys([f], fin ? this.finishMat(fin) : this.mat.gable); }
        for (const dm of r.dormers ?? []) {
          const dg = dormerGeom(r, dm);
          if (!dg) continue;
          polys(dg.roof, isSel("roof", r.id) ? this.mat.roofSel : rf ? this.finishMat(rf) : this.mat.roof);
          polys(dg.walls, this.mat.gable);
          polys(dg.frames, this.mat.frame);
          polys(dg.glass, this.mat.glass);
        }
      }
      if (vis.escaleras) for (const st of m.stairs) {
        const mat = isSel("stair", st.id) ? this.mat.sel : this.mat.stair;
        // cada pieza como prisma: tapa, fondo y costados, con las caras hacia fuera
        for (const pc of stairGeom(st).pieces) {
          const q = pc.pts, top = q.map((p) => ({ ...p, z: pc.z })), bot = q.map((p) => ({ ...p, z: pc.z0 }));
          const sides = q.map((a, i) => { const b = q[(i + 1) % q.length]; return [{ ...b, z: pc.z0 }, { ...a, z: pc.z0 }, { ...a, z: pc.z }, { ...b, z: pc.z }]; });
          polys([[...top].reverse(), bot, ...sides], mat);
        }
      }
      if (vis.columnas) for (const c of m.columns) {
        // hasta la losa: la altura del muro más alto del nivel
        const H = Math.max(2.4, ...m.walls.map((w) => w.height));
        box({ x1: c.x - c.w / 2, y1: c.y, x2: c.x + c.w / 2, y2: c.y } as Wall, 0, c.w, 0, H, c.d, li === active && this.ed.isSelected("column", c.id) ? this.mat.sel : this.mat.wall);
      }
      if (vis.decks) for (const dk of m.decks) this.boxes(deckBoxes(dk, m.walls, gradeLevel(project)), li === active && this.ed.isSelected("deck", dk.id));
      if (vis.mobiliario) for (const f of m.furniture) {
        const sel = isSel("furniture", f.id);
        for (const s of furnitureSolids(f.kind)) {
          // cilindros, esferas y conos se hacen unitarios y se escalan a la caja del sólido
          const g = s.shape === "cyl" ? new THREE.CylinderGeometry(0.5, 0.5, 1, 20) : s.shape === "sphere" ? new THREE.SphereGeometry(0.5, 20, 14) : s.shape === "cone" ? new THREE.ConeGeometry(0.5, 1, 20) : new THREE.BoxGeometry(s.w, s.h, s.d);
          const mesh = new THREE.Mesh(g, sel ? this.mat.sel : s.color ? this.mepMat(s.color) : this.mat.furn), c = furnitureToPlan(f, s);
          if (s.shape) mesh.scale.set(s.w, s.h, s.d);
          mesh.position.set(c.x, base + s.z0 + s.h / 2, c.y);
          mesh.rotation.y = (-f.rot * Math.PI) / 180;
          mesh.castShadow = mesh.receiveShadow = true;
          this.group.add(mesh);
        }
      }
      // instalaciones: puntos como pequeñas cajas a su altura y recorridos como líneas de su color
      for (const f of m.fixtures) {
        const d = mepDef(f.kind);
        if (!vis[d.disc === "elec" ? "electricidad" : "plomeria"]) continue;
        const sz = f.kind === "termo" ? 0.45 : f.kind === "luz" ? 0.25 : 0.1, hh = f.kind === "termo" ? 0.8 : 0.06;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, hh, sz), this.mepMat(systemDef(d.sys).color));
        const c = furnitureToPlan(f, { x: 0, y: f.kind === "termo" ? 0.2 : 0 });
        mesh.position.set(c.x, base + f.h + hh / 2, c.y);
        mesh.rotation.y = (-f.rot * Math.PI) / 180;
        this.group.add(mesh);
      }
      for (const r of m.runs) {
        if (!vis[discOfSystem(r.system) === "elec" ? "electricidad" : "plomeria"] || r.pts.length < 2) continue;
        const z = base + (r.system === "san" ? 0.02 : r.system === "elec" ? 2.6 : 2.5);
        const g = new THREE.BufferGeometry().setFromPoints(r.pts.map((q) => new THREE.Vector3(q.x, z, q.y)));
        this.group.add(new THREE.Line(g, this.mepMat(systemDef(r.system).color, true)));
      }
      if (vis.muros) for (const w of m.walls) {
        const { solids, ops } = pieces(m, w), H = w.height;
        const mat = isSel("wall", w.id) ? this.mat.sel : this.mat.wall, fin = finish(w.finish);
        const ext = fin && !isSel("wall", w.id) ? { mat: this.finishMat(fin), side: outward(m.walls, w) } : undefined;
        // el muro sale de una sola pieza con sus huecos; por piezas (junto a puertas y ventanas) quedaban rendijas que se veían como líneas
        const one = wallSolid(m, w, solids, ops, H, mat, ext);
        for (const [a, c] of one ? [] : solids) box(w, a, c, 0, H, w.thick, mat, true, ext);
        for (const { o, a, b: bb } of ops) {
          const top = Math.min(H, o.sill + o.height), om = isSel("opening", o.id);
          if (!one) {
            box(w, a, bb, top, H, w.thick, mat, true, ext);
            if (o.sill > 0) box(w, a, bb, 0, o.sill, w.thick, mat, true, ext);
          }
          if (o.kind === "door" ? vis.puertas : vis.ventanas) this.carpentry(box, w, o, a, bb, top, om);
        }
      }
    });
    // el primer muro (o losa, cubierta…) de un proyecto vacío o recién importado se encuadra solo
    if (this.fitEmpty && projectBounds(this.ed).solid) this.fit();
    this.dirty = true;
  }

  /** Sol alto desde un costado (la fachada de enfrente iluminada y la lateral en sombra), a media altura, con la cámara de sombras ajustada al proyecto (sombras más nítidas). */
  private placeSun(cx: number, cz: number, half: number, y: number) {
    const d = new THREE.Vector3(-0.5, 0.78, 0.55).normalize(), dist = half * 2 + 30;
    this.sun.position.set(cx + d.x * dist, y + d.y * dist, cz + d.z * dist);
    this.sun.target.position.set(cx, y, cz);
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: dist + half * 2 + 20 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  /** El último encuadre se hizo sin nada que ver en 3D: se vuelve a encuadrar con el primer muro. */
  private fitEmpty = false;

  fit() {
    const b = projectBounds(this.ed);
    this.fitEmpty = !b.solid;
    const cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
    const top = Math.max(...this.ed.project.levels.map((l) => l.elev)) + 3;
    const r = Math.max(b.x1 - b.x0, b.y1 - b.y0, top * 1.5);
    this.ctl.target.set(cx, top / 3, cz);
    this.cam.position.set(cx + r * 1.0, top / 3 + r * (this.realistic ? 0.55 : 1.1), cz + r * 1.3);
    // que no se corte el modelo en proyectos grandes
    this.cam.far = Math.max(500, r * 12); this.cam.near = Math.max(0.05, r / 5000); this.cam.updateProjectionMatrix();
    this.ctl.maxDistance = Math.max(this.ctl.maxDistance, r * 6);
    this.ctl.update();
    this.dirty = true;
  }
}

/**
 * Extensión de lo que se ve en 3D en todos los niveles. Las líneas, cotas y textos (por ejemplo un DWG
 * importado, que puede ser enorme o tener restos a kilómetros) no salen en 3D: solo cuentan si no hay nada más.
 */
export function projectBounds(ed: Editor) {
  const pts = ed.project.levels.flatMap(solidPts);
  if (pts.length) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), mg = 1.5;
    return { x0: Math.min(...xs) - mg, y0: Math.min(...ys) - mg, x1: Math.max(...xs) + mg, y1: Math.max(...ys) + mg, solid: true };
  }
  const bs = ed.project.levels.map((l) => bounds(l, [], true));
  return {
    x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)),
    x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)), solid: false,
  };
}

