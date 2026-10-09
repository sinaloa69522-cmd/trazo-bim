import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { bounds, dir, loc, pieces } from "../core/geometry";
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
    edge: new THREE.LineBasicMaterial({ color: 0x2b3330, transparent: true, opacity: 0.55 }),
  };

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
    const b = projectBounds(this.ed);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.1, b.y1 - b.y0), this.mat.floor);
    floor.position.set((b.x0 + b.x1) / 2, -0.32, (b.y0 + b.y1) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    project.levels.forEach((m, li) => {
      base = m.elev;
      const isSel = (t: "wall" | "opening" | "slab", id: number) => li === active && this.ed.isSelected(t, id);
      // losas: el contorno se extruye hacia abajo desde la cota del nivel
      if (vis.losas) for (const sl of m.slabs) {
        if (sl.pts.length < 3) continue;
        const shape = new THREE.Shape(sl.pts.map((p) => new THREE.Vector2(p.x, p.y)));
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
