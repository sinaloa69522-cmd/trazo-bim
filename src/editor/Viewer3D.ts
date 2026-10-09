import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { furnitureSolids, furnitureToPlan } from "../core/furniture";
import { discOfSystem, mepDef, systemDef } from "../core/mep";
import { bounds, dir, loc, pieces, roofGeom, stairSteps, type P3 } from "../core/geometry";
import type { Wall } from "../core/model";
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
    const box = (w: Wall, sa: number, sb: number, z0: number, z1: number, th: number, mat: THREE.Material, edges = true) => {
      if (sb - sa < 1e-3 || z1 - z0 < 1e-3) return;
      const { ux, uy } = dir(w), g = new THREE.BoxGeometry(sb - sa, z1 - z0, th), mesh = new THREE.Mesh(g, mat), c = loc(w, (sa + sb) / 2, 0);
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
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), this.mat.edge);
      this.group.add(e);
    };
    const b = projectBounds(this.ed);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.1, b.y1 - b.y0), this.mat.floor);
    floor.position.set((b.x0 + b.x1) / 2, -0.32, (b.y0 + b.y1) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

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
        polys(g.faces, isSel("roof", r.id) ? this.mat.roofSel : this.mat.roof);
        polys(g.gables, this.mat.gable);
      }
      if (vis.escaleras) for (const st of m.stairs) {
        const k = stairSteps(st), mat = isSel("stair", st.id) ? this.mat.sel : this.mat.stair;
        for (let i = 0; i < k.n; i++) box(st as unknown as Wall, i * k.tread, (i + 1) * k.tread, 0, (i + 1) * k.riser, st.width, mat);
      }
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
        const mat = isSel("wall", w.id) ? this.mat.sel : this.mat.wall;
        for (const [a, c] of solids) box(w, a, c, 0, H, w.thick, mat);
        for (const { o, a, b: bb } of ops) {
          const top = Math.min(H, o.sill + o.height), om = isSel("opening", o.id);
          box(w, a, bb, top, H, w.thick, mat);
          if (o.sill > 0) box(w, a, bb, 0, o.sill, w.thick, mat);
          if (o.kind === "door" && vis.puertas) box(w, a + 0.02, bb - 0.02, 0, top - 0.02, 0.045, om ? this.mat.sel : this.mat.door);
          if (o.kind === "window" && vis.ventanas) {
            const fm = om ? this.mat.sel : this.mat.frame;
            box(w, a, bb, o.sill, o.sill + 0.05, w.thick * 0.6, fm, false);
            box(w, a, bb, top - 0.05, top, w.thick * 0.6, fm, false);
            box(w, a + 0.03, bb - 0.03, o.sill + 0.05, top - 0.05, 0.02, this.mat.glass, false);
          }
        }
      }
    });
    this.dirty = true;
  }

  fit() {
    const b = projectBounds(this.ed), cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
    const top = Math.max(...this.ed.project.levels.map((l) => l.elev)) + 3;
    const r = Math.max(b.x1 - b.x0, b.y1 - b.y0, top * 1.5);
    this.ctl.target.set(cx, top / 3, cz);
    this.cam.position.set(cx + r * 1.0, top / 3 + r * 1.1, cz + r * 1.3);
    this.sun.position.set(cx + 12, 20, cz + 8);
    this.sun.target.position.set(cx, 0, cz);
    this.ctl.update();
    this.dirty = true;
  }
}

/** Extensión de todos los niveles juntos. */
function projectBounds(ed: Editor) {
  const bs = ed.project.levels.map((l) => bounds(l));
  return {
    x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)),
    x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)),
  };
}

