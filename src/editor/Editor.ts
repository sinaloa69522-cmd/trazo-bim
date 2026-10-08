import { bounds, dimOffset, dir, distSeg, dimGeom, fits, loc, type Pt } from "../core/geometry";
import {
  cloneModel, emptyModel, nextId, normalizeModel, sampleModel,
  type LayerId, type Model, type Wall,
} from "../core/model";
import { computeRooms, roomAt, type RoomGrid } from "../core/rooms";

export type Tool = "select" | "wall" | "door" | "window" | "line" | "dim" | "room" | "move" | "copy";
export type SelType = "wall" | "opening" | "line" | "dim" | "room";
export interface Selection { type: SelType; id: number }
export interface SnapPt extends Pt { kind: "end" | "mid" | null }
export interface OpeningCandidate { w: Wall; t: number; ok: boolean }

type Seg = { x1: number; y1: number; x2: number; y2: number };
interface Joint { o: Seg; e: 0 | 1 }
interface GripDrag {
  o: Seg;
  k: 0 | 1 | "mid";
  orig: Seg;
  start: Pt;
  j0: Joint[];
  j1: Joint[];
  skip: Set<object>;
  /** Huecos cuya distancia al extremo fijo se conserva al estirar */
  keep: { w: Wall; e: 0 | 1; L: number; ops: { x: Model["openings"][number]; s: number }[] }[];
}

const STORAGE_KEY = "trazo-bim";

const COMMANDS: Record<string, Tool> = {
  M: "wall", MURO: "wall", P: "door", PUERTA: "door", V: "window", VENTANA: "window",
  L: "line", LINEA: "line", "LÍNEA": "line", C: "dim", COTA: "dim", S: "select", SEL: "select",
  H: "room", HAB: "room", HABITACION: "room", "HABITACIÓN": "room",
  MO: "move", MOVER: "move", CO: "copy", COPIA: "copy",
};

/**
 * Estado del editor y toda la lógica de interacción, sin DOM.
 * La planta, el visor 3D y la interfaz React se suscriben a sus cambios.
 */
export class Editor {
  model: Model = emptyModel();
  rooms: RoomGrid | null = null;
  vis: Record<LayerId, boolean> = { muros: true, puertas: true, ventanas: true, cotas: true, anot: true, hab: true };
  defaults = { thick: 0.15, height: 2.7, doorW: 0.9, doorH: 2.1, winW: 1.2, winH: 1.2, sill: 0.9 };
  tool: Tool = "select";
  sel: Selection | null = null;
  ortho = true;
  osnap = true;
  view = { scale: 55, ox: 120, oy: 90 };
  draft: { pts: Pt[] } | null = null;
  mouse = { x: 0, y: 0, in: false };
  snap: SnapPt | null = null;
  hover: Selection | null = null;
  openCand: OpeningCandidate | null = null;
  grip: GripDrag | null = null;
  message = "Bienvenido. Se ha cargado una vivienda de ejemplo.";

  private history: string[] = [];
  private lastCmd = "";
  private listeners = new Set<() => void>();
  private modelListeners = new Set<() => void>();
  version = 0;

  constructor(private storage: Storage | null = null) {
    const saved = this.load();
    this.model = saved ?? sampleModel();
    this.rooms = computeRooms(this.model);
  }

  // ---------- suscripciones ----------
  /** Cualquier cambio (vista, cursor, selección, modelo). */
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  /** Solo cambios que afectan al modelo 3D. */
  onModel(fn: () => void) { this.modelListeners.add(fn); return () => { this.modelListeners.delete(fn); }; }
  getVersion = () => this.version;
  emit() { this.version++; this.listeners.forEach((f) => f()); }
  private changed() {
    this.rooms = computeRooms(this.model);
    this.save();
    this.modelListeners.forEach((f) => f());
    this.emit();
  }
  /** Cambios visuales que también afectan al 3D (capas, selección). */
  refresh3d() { this.modelListeners.forEach((f) => f()); this.emit(); }

  // ---------- persistencia e historial ----------
  private save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.model)); } catch { /* sin almacenamiento */ } }
  private load(): Model | null {
    try { const s = this.storage?.getItem(STORAGE_KEY); return s ? normalizeModel(JSON.parse(s)) : null; } catch { return null; }
  }
  snapshot() { this.history.push(JSON.stringify(this.model)); if (this.history.length > 200) this.history.shift(); }
  undo() {
    const s = this.history.pop();
    if (!s) { this.log("Nada que deshacer."); return; }
    this.model = JSON.parse(s); this.sel = null; this.log("Deshecho."); this.changed();
  }
  log(t: string) { this.message = t; this.emit(); }

  loadSample() { this.snapshot(); this.model = sampleModel(); this.sel = null; this.log("Vivienda de ejemplo cargada."); this.changed(); }
  clear() { this.snapshot(); this.model = emptyModel(); this.sel = null; this.log("Dibujo nuevo. Usa Deshacer si te equivocaste."); this.changed(); this.setTool("wall"); }

  // ---------- consultas ----------
  wallById(id: number) { return this.model.walls.find((w) => w.id === id); }
  selObj(): (Seg & { id: number }) | Model["openings"][number] | Model["rooms"][number] | null {
    if (!this.sel) return null;
    const m = this.model;
    const list = { wall: m.walls, line: m.lines, dim: m.dims, opening: m.openings, room: m.rooms }[this.sel.type] as { id: number }[];
    return (list.find((o) => o.id === this.sel!.id) as never) ?? null;
  }
  grips(): { k: 0 | 1 | "mid"; x: number; y: number }[] {
    const o = this.selObj();
    if (!o || !(this.sel!.type === "wall" || this.sel!.type === "line")) return [];
    const s = o as Seg;
    return [{ k: 0, x: s.x1, y: s.y1 }, { k: 1, x: s.x2, y: s.y2 }, { k: "mid", x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }];
  }
  prompt(): string {
    const n = this.draft ? this.draft.pts.length : 0, d = this.defaults;
    switch (this.tool) {
      case "select": return "Comando:";
      case "wall": return n ? "MURO  Siguiente punto o longitud [Enter termina]:" : "MURO  Precisa punto inicial:";
      case "line": return n ? "LÍNEA  Siguiente punto o longitud [Enter termina]:" : "LÍNEA  Precisa primer punto:";
      case "dim": return n === 0 ? "COTA  Origen de la primera línea de referencia:" : n === 1 ? "COTA  Origen de la segunda línea:" : "COTA  Posición de la línea de cota:";
      case "door": return `PUERTA  Haz clic sobre un muro (ancho ${d.doorW.toFixed(2)} m):`;
      case "window": return `VENTANA  Haz clic sobre un muro (ancho ${d.winW.toFixed(2)} m):`;
      case "room": return "HABITACIÓN  Haz clic dentro de un espacio cerrado por muros:";
      case "move": return n ? "MOVER  Precisa punto de destino:" : "MOVER  Precisa punto base:";
      case "copy": return n ? "COPIA  Precisa punto de destino [Esc termina]:" : "COPIA  Precisa punto base:";
    }
  }
  stats() {
    const m = this.model;
    const len = m.walls.reduce((s, w) => s + dir(w).L, 0);
    const area = m.walls.reduce((s, w) => s + dir(w).L * w.height, 0) - m.openings.reduce((s, o) => s + o.width * o.height, 0);
    const useful = [...(this.rooms?.rooms.values() ?? [])].filter((c) => c.ok).reduce((s, c) => s + c.area, 0);
    return {
      wallLength: len, wallArea: Math.max(0, area), usefulArea: useful,
      doors: m.openings.filter((o) => o.kind === "door").length,
      windows: m.openings.filter((o) => o.kind === "window").length,
    };
  }
  layerCounts(): Record<LayerId, number> {
    const m = this.model;
    return {
      muros: m.walls.length, puertas: m.openings.filter((o) => o.kind === "door").length,
      ventanas: m.openings.filter((o) => o.kind === "window").length,
      cotas: m.dims.length, anot: m.lines.length, hab: m.rooms.length,
    };
  }

  // ---------- vista ----------
  toS(x: number, y: number): Pt { return { x: x * this.view.scale + this.view.ox, y: y * this.view.scale + this.view.oy }; }
  toW(sx: number, sy: number): Pt { return { x: (sx - this.view.ox) / this.view.scale, y: (sy - this.view.oy) / this.view.scale }; }
  fit(width: number, height: number) {
    if (!width) return;
    const b = bounds(this.model);
    const s = Math.max(5, Math.min(400, Math.min(width / (b.x1 - b.x0), height / (b.y1 - b.y0))));
    this.view.scale = s;
    this.view.ox = width / 2 - ((b.x0 + b.x1) / 2) * s;
    this.view.oy = height / 2 - ((b.y0 + b.y1) / 2) * s;
    this.emit();
  }
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toW(sx, sy);
    this.view.scale = Math.max(5, Math.min(600, this.view.scale * factor));
    this.view.ox = sx - before.x * this.view.scale;
    this.view.oy = sy - before.y * this.view.scale;
    this.emit();
  }
  pan(dx: number, dy: number) { this.view.ox += dx; this.view.oy += dy; this.emit(); }

  // ---------- herramientas ----------
  setTool(t: Tool) {
    if ((t === "move" || t === "copy") && !this.selObj()) { this.message = "Selecciona primero un elemento y luego usa Mover o Copiar."; t = "select"; }
    if ((t === "move" || t === "copy") && this.sel?.type === "opening") { this.message = "Para mover una puerta o ventana, bórrala e insértala de nuevo (por ahora)."; t = "select"; }
    this.tool = t; this.draft = null; this.openCand = null;
    if (t !== "select" && t !== "move" && t !== "copy") this.sel = null;
    this.refresh3d();
  }
  toggleOrtho() { this.ortho = !this.ortho; this.log(`ORTO ${this.ortho ? "activado" : "desactivado"}.`); }
  toggleOsnap() { this.osnap = !this.osnap; this.log(`REFENT ${this.osnap ? "activado" : "desactivado"}.`); }
  setLayer(id: LayerId, on: boolean) { this.vis[id] = on; this.sel = null; this.refresh3d(); }
  select(s: Selection | null) { this.sel = s; this.refresh3d(); }

  // ---------- referencias y selección ----------
  snapPoint(wx: number, wy: number, fromOv?: Pt | null, skip?: Set<object>): SnapPt {
    const from = fromOv !== undefined ? fromOv : this.draft?.pts.length ? this.draft.pts[this.draft.pts.length - 1] : null;
    if (this.osnap) {
      let best = 12 / this.view.scale, r: SnapPt | null = null;
      const test = (x: number, y: number, kind: "end" | "mid") => {
        const d = Math.hypot(x - wx, y - wy);
        if (d < best) { best = d; r = { x, y, kind }; }
      };
      for (const s of [...this.model.walls, ...this.model.lines]) {
        if (skip?.has(s)) continue;
        test(s.x1, s.y1, "end"); test(s.x2, s.y2, "end"); test((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, "mid");
      }
      if (this.draft && this.tool !== "move" && this.tool !== "copy") for (const q of this.draft.pts) test(q.x, q.y, "end");
      if (r) return r;
    }
    let x = wx, y = wy;
    const orth = from && this.ortho && (this.tool !== "dim" || this.draft?.pts.length === 1);
    if (orth) { if (Math.abs(x - from!.x) > Math.abs(y - from!.y)) y = from!.y; else x = from!.x; }
    const g = (v: number) => Math.round(v * 10) / 10;
    if (orth && y === from!.y) x = g(x);
    else if (orth && x === from!.x) y = g(y);
    else { x = g(x); y = g(y); }
    return { x, y, kind: null };
  }

  pick(wx: number, wy: number): Selection | null {
    const m = this.model, tol = 6 / this.view.scale;
    let best: Selection | null = null, bd = Infinity;
    const take = (d: number, o: Selection) => { if (d < bd) { bd = d; best = o; } };
    for (const op of m.openings) {
      const w = this.wallById(op.wallId);
      if (!w || (op.kind === "door" && !this.vis.puertas) || (op.kind === "window" && !this.vis.ventanas)) continue;
      const { L } = dir(w), a = loc(w, op.t * L - op.width / 2, 0), b = loc(w, op.t * L + op.width / 2, 0);
      const r = distSeg(wx, wy, a.x, a.y, b.x, b.y);
      if (r.d < w.thick / 2 + tol) take(r.d - 0.05, { type: "opening", id: op.id });
    }
    if (this.vis.muros) for (const w of m.walls) { const r = distSeg(wx, wy, w.x1, w.y1, w.x2, w.y2); if (r.d < w.thick / 2 + tol) take(r.d, { type: "wall", id: w.id }); }
    if (this.vis.anot) for (const l of m.lines) { const r = distSeg(wx, wy, l.x1, l.y1, l.x2, l.y2); if (r.d < tol) take(r.d, { type: "line", id: l.id }); }
    if (this.vis.cotas) for (const d of m.dims) { const g = dimGeom(d), r = distSeg(wx, wy, g.a.x, g.a.y, g.b.x, g.b.y); if (r.d < tol * 2) take(r.d, { type: "dim", id: d.id }); }
    if (!best && this.vis.hab) { const r = roomAt(m, this.rooms, wx, wy); if (r) best = { type: "room", id: r.id }; }
    return best;
  }

  openingCandidate(wx: number, wy: number): OpeningCandidate | null {
    let best: { w: Wall; t: number } | null = null, bd = 0.6;
    for (const w of this.model.walls) { const r = distSeg(wx, wy, w.x1, w.y1, w.x2, w.y2); if (r.d < bd) { bd = r.d; best = { w, t: r.t }; } }
    if (!best) return null;
    const width = this.tool === "door" ? this.defaults.doorW : this.defaults.winW, { L } = dir(best.w);
    let t = Math.round(best.t * L * 20) / 20 / L;
    t = Math.max((width / 2 + 0.05) / L, Math.min(1 - (width / 2 + 0.05) / L, t));
    return { w: best.w, t, ok: fits(this.model, best.w, t, width) };
  }

  // ---------- acciones ----------
  commitPoint(p: Pt) {
    const m = this.model;
    if (this.tool === "move" || this.tool === "copy") return this.moveCopy(p);
    if (this.tool === "wall" || this.tool === "line") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const last = this.draft.pts[this.draft.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) return;
      this.snapshot();
      if (this.tool === "wall") {
        const w: Wall = { id: nextId(m), x1: last.x, y1: last.y, x2: p.x, y2: p.y, thick: this.defaults.thick, height: this.defaults.height };
        m.walls.push(w);
        this.message = `Muro de ${dir(w).L.toFixed(2)} m creado.`;
      } else {
        m.lines.push({ id: nextId(m), x1: last.x, y1: last.y, x2: p.x, y2: p.y });
        this.message = "Línea creada.";
      }
      const first = this.draft.pts[0];
      this.draft.pts.push(p);
      if (this.draft.pts.length > 2 && Math.hypot(p.x - first.x, p.y - first.y) < 0.01) { this.draft = null; this.message = "Contorno cerrado."; }
      this.changed();
      return;
    }
    if (this.tool === "dim") {
      if (!this.draft) this.draft = { pts: [] };
      if (this.draft.pts.length < 2) { this.draft.pts.push(p); this.emit(); return; }
      const [a, b] = this.draft.pts;
      this.snapshot();
      m.dims.push({ id: nextId(m), x1: a.x, y1: a.y, x2: b.x, y2: b.y, off: dimOffset(a, b, p) });
      this.draft = null; this.message = "Cota añadida."; this.changed();
    }
  }

  private moveCopy(p: Pt) {
    const o = this.selObj();
    if (!o || !this.sel) { this.setTool("select"); return; }
    if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
    const bp = this.draft.pts[0], dx = p.x - bp.x, dy = p.y - bp.y;
    if (Math.hypot(dx, dy) < 1e-6) return;
    this.snapshot();
    const shift = (x: object) => {
      if ("x1" in x) { const s = x as Seg; s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
      else { const r = x as Pt; r.x += dx; r.y += dy; }
    };
    const type = this.sel.type;
    if (this.tool === "move") {
      shift(o); this.message = "Elemento movido."; this.draft = null; this.tool = "select"; this.changed(); return;
    }
    const m = this.model, c = JSON.parse(JSON.stringify(o));
    c.id = nextId(m); shift(c);
    if (type === "wall") m.walls.push(c);
    if (type === "line") m.lines.push(c);
    if (type === "dim") m.dims.push(c);
    if (type === "room") { c.name = `${(o as Model["rooms"][number]).name} (copia)`; m.rooms.push(c); }
    if (type === "wall") for (const op of m.openings.filter((x) => x.wallId === o.id)) m.openings.push({ ...op, id: nextId(m), wallId: c.id });
    this.message = "Copia creada. Haz clic para otra copia o Esc para terminar.";
    this.changed();
  }

  placeOpening(wx: number, wy: number) {
    const c = this.openingCandidate(wx, wy);
    if (!c) return;
    if (!c.ok) { this.log("No cabe ahí: se solapa con otro hueco o con el extremo del muro."); return; }
    this.snapshot();
    const door = this.tool === "door", d = this.defaults;
    this.model.openings.push({
      id: nextId(this.model), wallId: c.w.id, t: c.t, kind: door ? "door" : "window",
      width: door ? d.doorW : d.winW, height: door ? d.doorH : d.winH, sill: door ? 0 : d.sill, flip: false,
    });
    this.message = door ? "Puerta insertada." : "Ventana insertada.";
    this.openCand = null;
    this.changed();
  }

  placeRoom(x: number, y: number) {
    const m = this.model, ex = roomAt(m, this.rooms, x, y);
    if (ex) { this.sel = { type: "room", id: ex.id }; this.log(`Ese espacio ya es "${ex.name}".`); return; }
    const r = { id: nextId(m), x, y, name: `Habitación ${m.rooms.length + 1}` };
    m.rooms.push(r);
    const g = computeRooms(m), c = g?.rooms.get(r.id);
    if (!c?.ok) { m.rooms.pop(); this.log("Ahí no hay un espacio cerrado por muros. Las puertas y ventanas cuentan como cerradas."); return; }
    m.rooms.pop(); this.snapshot(); m.rooms.push(r);
    this.message = `${r.name}: ${c.area.toFixed(2)} m². Cambia el nombre en Propiedades.`;
    this.sel = { type: "room", id: r.id };
    this.changed();
  }

  finishDraft() { if (this.draft) { this.draft = null; this.log("Comando terminado."); } }

  deleteSel() {
    const s = this.sel, m = this.model;
    if (!s) return;
    this.snapshot();
    if (s.type === "wall") { m.walls = m.walls.filter((w) => w.id !== s.id); m.openings = m.openings.filter((o) => o.wallId !== s.id); }
    if (s.type === "opening") m.openings = m.openings.filter((o) => o.id !== s.id);
    if (s.type === "line") m.lines = m.lines.filter((o) => o.id !== s.id);
    if (s.type === "dim") m.dims = m.dims.filter((o) => o.id !== s.id);
    if (s.type === "room") m.rooms = m.rooms.filter((o) => o.id !== s.id);
    this.sel = null; this.message = "Elemento borrado."; this.changed();
  }

  /** Aplica un cambio de propiedad con deshacer. */
  edit(fn: () => void) { this.snapshot(); fn(); this.changed(); }

  escape() {
    if (this.draft && (this.tool === "move" || this.tool === "copy")) { this.setTool("select"); return; }
    if (this.draft) this.finishDraft();
    else if (this.tool !== "select") this.setTool("select");
    else this.select(null);
  }

  // ---------- línea de comandos ----------
  runCommand(raw: string) {
    const s = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (!s) {
      if (this.draft && this.tool !== "dim") { this.finishDraft(); return; }
      if (this.lastCmd) this.runCommand(this.lastCmd);
      return;
    }
    if (COMMANDS[s]) { this.lastCmd = s; this.setTool(COMMANDS[s]); if (this.tool === COMMANDS[s]) this.log(`Comando: ${s}`); return; }
    if (s === "B" || s === "BORRAR") return this.deleteSel();
    if (s === "U" || s === "DESHACER") return this.undo();
    if (s === "Z" || s === "ZOOM" || s === "ENCUADRAR") { this.fitRequest?.(); return; }
    const num = s.replace(",", ".");
    const lengthOk = this.draft?.pts.length &&
      (["wall", "line", "move", "copy"].includes(this.tool) || (this.tool === "dim" && this.draft.pts.length === 1));
    if (/^-?\d*\.?\d+$/.test(num) && lengthOk) {
      const L = parseFloat(num), from = this.draft!.pts[this.draft!.pts.length - 1], p = this.snap ?? this.mouse;
      let dx = p.x - from.x, dy = p.y - from.y;
      if (this.ortho) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const n = Math.hypot(dx, dy);
      if (!n) { this.log("Mueve el cursor para indicar la dirección."); return; }
      this.commitPoint({ x: from.x + (dx / n) * L, y: from.y + (dy / n) * L });
      return;
    }
    const mm = s.replace(/,/g, ";").match(/^(@?)(-?\d*\.?\d+);(-?\d*\.?\d+)$/);
    if (mm && !["select", "door", "window", "room"].includes(this.tool)) {
      let x = parseFloat(mm[2]), y = -parseFloat(mm[3]);
      if (mm[1] && this.draft?.pts.length) { const f = this.draft.pts[this.draft.pts.length - 1]; x += f.x; y += f.y; }
      this.commitPoint({ x, y });
      return;
    }
    this.log(`Comando desconocido: "${raw}". Prueba M, P, V, L, C, H, MO, CO, B (borrar), U (deshacer), Z (encuadrar).`);
  }
  /** La vista de planta registra aquí cómo encuadrar, porque conoce su tamaño. */
  fitRequest: (() => void) | null = null;

  // ---------- puntero (coordenadas de pantalla relativas al lienzo) ----------
  pointerMove(sx: number, sy: number) {
    const w = this.toW(sx, sy);
    this.mouse = { x: w.x, y: w.y, in: true };
    if (this.grip) { this.dragGrip(w); return; }
    this.snap = null; this.hover = null; this.openCand = null;
    if (this.tool === "select") this.hover = this.pick(w.x, w.y);
    else if (this.tool === "door" || this.tool === "window") this.openCand = this.openingCandidate(w.x, w.y);
    else this.snap = this.snapPoint(w.x, w.y);
    this.emit();
  }
  pointerLeave() { this.mouse.in = false; this.hover = null; this.emit(); }

  /** Clic principal. Devuelve "pan" si el lienzo debe empezar a desplazar la vista. */
  pointerDown(sx: number, sy: number): { pan: boolean; pick?: Selection | null } {
    const w = this.toW(sx, sy);
    this.mouse = { x: w.x, y: w.y, in: true };
    if (this.tool === "select") {
      const g = this.grips().find((g) => { const s = this.toS(g.x, g.y); return Math.hypot(s.x - sx, s.y - sy) < 9; });
      if (g) { this.startGrip(g.k, g); return { pan: false }; }
      const h = this.pick(w.x, w.y);
      if (h && h.type !== "room") { this.select(h); return { pan: false }; }
      return { pan: true, pick: h };
    }
    if (this.tool === "door" || this.tool === "window") { this.placeOpening(w.x, w.y); return { pan: false }; }
    if (this.tool === "room") { this.placeRoom(w.x, w.y); return { pan: false }; }
    this.commitPoint(this.snapPoint(w.x, w.y));
    return { pan: false };
  }
  pointerUp() { if (this.grip) { this.grip = null; this.snap = null; this.changed(); } }

  private joined(x: number, y: number, skip: object): Joint[] {
    const r: Joint[] = [];
    for (const o of [...this.model.walls, ...this.model.lines]) {
      if (o === skip) continue;
      if (Math.hypot(o.x1 - x, o.y1 - y) < 0.01) r.push({ o, e: 0 });
      else if (Math.hypot(o.x2 - x, o.y2 - y) < 0.01) r.push({ o, e: 1 });
    }
    return r;
  }
  private startGrip(k: 0 | 1 | "mid", at: Pt) {
    const o = this.selObj() as Seg;
    this.snapshot();
    const j0 = this.joined(o.x1, o.y1, o), j1 = this.joined(o.x2, o.y2, o);
    const keep: GripDrag["keep"] = [];
    const track = (w: Seg, e: 0 | 1) => {
      if (!this.model.walls.includes(w as Wall)) return;
      const ww = w as Wall, L = dir(ww).L;
      keep.push({ w: ww, e, L, ops: this.model.openings.filter((x) => x.wallId === ww.id).map((x) => ({ x, s: x.t * L })) });
    };
    if (k !== "mid") track(o, k);
    for (const a of [...j0, ...j1]) track(a.o, a.e);
    this.grip = {
      o, k, orig: { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 }, start: { x: at.x, y: at.y },
      j0, j1, skip: new Set<object>([o, ...j0.map((a) => a.o), ...j1.map((a) => a.o)]), keep,
    };
  }
  private dragGrip(w: Pt) {
    const g = this.grip!, o = g.o, O = g.orig;
    const setEnd = (s: Seg, e: 0 | 1, x: number, y: number) => { if (e === 0) { s.x1 = x; s.y1 = y; } else { s.x2 = x; s.y2 = y; } };
    if (g.k === "mid") {
      const p = this.snapPoint(w.x, w.y, g.start, g.skip), dx = p.x - g.start.x, dy = p.y - g.start.y;
      o.x1 = O.x1 + dx; o.y1 = O.y1 + dy; o.x2 = O.x2 + dx; o.y2 = O.y2 + dy;
      this.snap = p;
    } else {
      const fixed = g.k === 0 ? { x: O.x2, y: O.y2 } : { x: O.x1, y: O.y1 };
      const p = this.snapPoint(w.x, w.y, fixed, g.skip);
      setEnd(o, g.k, p.x, p.y);
      this.snap = p;
    }
    for (const a of g.j0) setEnd(a.o, a.e, o.x1, o.y1);
    for (const a of g.j1) setEnd(a.o, a.e, o.x2, o.y2);
    for (const k of g.keep) {
      const L = dir(k.w).L;
      for (const { x, s } of k.ops) {
        const d = k.e === 0 ? L - (k.L - s) : s;
        x.t = Math.max(x.width / 2 + 0.05, Math.min(L - x.width / 2 - 0.05, d)) / L;
      }
    }
    this.rooms = computeRooms(this.model);
    this.refresh3d();
  }

  /** Copia independiente del modelo, útil para pruebas. */
  exportModel(): Model { return cloneModel(this.model); }
}
