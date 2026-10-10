import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { furnitureSolids, furnitureToPlan } from "../core/furniture";
import { discOfSystem, mepDef, systemDef } from "../core/mep";
import { bounds, dir, loc, pieces, roofGeom, stairSteps, type P3, type Pt } from "../core/geometry";
import type { Opening, Wall } from "../core/model";
import { openingStyle } from "../core/openingStyles";
import { finish, gableWall, outward, roofFinish, type Finish } from "../core/finishes";
import { finishTile } from "./finishTextures";
import { framing, MEMBER_COLOR, type Member } from "../core/framing";
import { foundation, gradeLevel } from "../core/foundation";
import { deckBoxes, type Box } from "../core/decks";
import type { Editor } from "./Editor";

/** Modelo 3D generado a partir de la planta. Se reconstruye en cada cambio. */
export class Viewer3D {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private ren: THREE.WebGLRenderer;
  private ctl: OrbitControls;
  private sun = new THREE.DirectionalLight(0xffffff, 0.7);
  private group = new THREE.Group();
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
    gable: new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.92, side: THREE.DoubleSide }),
    stair: new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 }),
    furn: new THREE.MeshStandardMaterial({ color: 0xc7b299, roughness: 0.85 }),
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
  private buildFraming() {
    const ghost = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, transparent: true, opacity: 0.25, roughness: 1, depthWrite: false });
    for (const lv of this.ed.project.levels) for (const sl of lv.slabs) {
      if (sl.pts.length < 3) continue;
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(sl.pts.map((p) => new THREE.Vector2(p.x, p.y))), { depth: sl.thick, bevelEnabled: false });
      const mesh = new THREE.Mesh(g, ghost);
      mesh.rotation.x = Math.PI / 2; mesh.position.y = lv.elev;
      this.group.add(mesh);
    }
    this.members(framing(this.ed.project).filter((m) => !this.ed.hiddenMembers.has(m.kind)));
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
    this.ren = new THREE.WebGLRenderer({ antialias: true });
    this.ren.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.ren.shadowMap.enabled = true;
    this.ren.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.ren.domElement);
    this.ctl = new OrbitControls(this.cam, this.ren.domElement);
    this.ctl.enableDamping = true;
    this.ctl.maxPolarAngle = Math.PI / 2.05;
    this.ctl.addEventListener("change", () => (this.dirty = true));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8576, 0.75 * Math.PI));
    this.sun.intensity = 0.7 * Math.PI;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 80 });
    this.scene.add(this.sun, this.sun.target, this.group);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.unsub = ed.onModel(() => this.schedule());
    this.resize();
    this.build();
    this.fit();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.ctl.update() || this.dirty) { this.dirty = false; this.ren.render(this.scene, this.cam); }
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

  schedule() { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.build(), 60); }

  build() {
    const { project, vis, active } = this.ed;
    this.ren.setClearColor(new THREE.Color(this.background() || "#e4e8e6"));
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
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
    const b = projectBounds(this.ed);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.1, b.y1 - b.y0), this.mat.floor);
    floor.position.set((b.x0 + b.x1) / 2, gradeLevel(project) - 0.05, (b.y0 + b.y1) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    // en la vista de estructura el terreno baja para que se vean las zapatas
    if (this.ed.framing) {
      const zs = foundation(project).flatMap((m) => [m.a.z - m.h / 2, m.b.z - m.h / 2]);
      floor.position.y = Math.min(-0.75, ...zs) - 0.1;
      this.buildFraming(); this.dirty = true; return;
    }
    // la cimentación se ve donde asoma sobre el terreno (block del crawl space, pilares)
    if (vis.losas) this.members(foundation(project).filter((m) => ["footing", "foundation", "pier", "girder"].includes(m.kind)));

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
        const g = roofGeom(r);
        const rf = roofFinish(r);
        polys(g.faces, isSel("roof", r.id) ? this.mat.roofSel : rf ? this.finishMat(rf) : this.mat.roof);
        // cada hastial con el revestimiento del muro sobre el que se levanta
        for (const f of g.gables) { const fin = finish(gableWall(m.walls, f)?.finish); polys([f], fin ? this.finishMat(fin) : this.mat.gable); }
      }
      if (vis.escaleras) for (const st of m.stairs) {
        const k = stairSteps(st), mat = isSel("stair", st.id) ? this.mat.sel : this.mat.stair;
        for (let i = 0; i < k.n; i++) box(st as unknown as Wall, i * k.tread, (i + 1) * k.tread, 0, (i + 1) * k.riser, st.width, mat);
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
        for (const [a, c] of solids) box(w, a, c, 0, H, w.thick, mat, true, ext);
        for (const { o, a, b: bb } of ops) {
          const top = Math.min(H, o.sill + o.height), om = isSel("opening", o.id);
          box(w, a, bb, top, H, w.thick, mat, true, ext);
          if (o.sill > 0) box(w, a, bb, 0, o.sill, w.thick, mat, true, ext);
          if (o.kind === "door" ? vis.puertas : vis.ventanas) this.carpentry(box, w, o, a, bb, top, om);
        }
      }
    });
    // el primer muro (o losa, cubierta…) de un proyecto vacío o recién importado se encuadra solo
    if (this.fitEmpty && projectBounds(this.ed).solid) this.fit();
    this.dirty = true;
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
    this.cam.position.set(cx + r * 1.0, top / 3 + r * 1.1, cz + r * 1.3);
    // que no se corte el modelo en proyectos grandes
    this.cam.far = Math.max(500, r * 12); this.cam.near = Math.max(0.05, r / 5000); this.cam.updateProjectionMatrix();
    this.ctl.maxDistance = Math.max(this.ctl.maxDistance, r * 6);
    this.sun.position.set(cx + 12, 20, cz + 8);
    this.sun.target.position.set(cx, 0, cz);
    this.ctl.update();
    this.dirty = true;
  }
}

/**
 * Extensión de lo que se ve en 3D en todos los niveles. Las líneas, cotas y textos (por ejemplo un DWG
 * importado, que puede ser enorme o tener restos a kilómetros) no salen en 3D: solo cuentan si no hay nada más.
 */
export function projectBounds(ed: Editor) {
  const pts: Pt[] = [];
  for (const l of ed.project.levels) {
    for (const s of [...l.walls, ...l.roofs, ...l.stairs, ...l.decks]) pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
    for (const sl of l.slabs) pts.push(...sl.pts);
    for (const c of l.columns) pts.push(c);
    for (const f of [...l.furniture, ...l.fixtures]) pts.push(f);
  }
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

