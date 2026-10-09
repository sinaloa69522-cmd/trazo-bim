import { bounds, dimOffset, dir, distSeg, dimGeom, fits, loc, onSlab, pointInPolygon, polygonArea, roofGeom, stairSteps, textBox, type Pt } from "../core/geometry";
import {
  attachWalls, cloneModel, emptyProject, newLevel, nextId, nextSectionName, normalizeProject, sampleProject, type Level, type Project, type ProjectInfo,
  type LayerId, type Model, type RoofKind, type Wall,
} from "../core/model";
import { parseDxf } from "../core/dxfImport";
import { FURNITURE, furnitureDef, furnitureOutline } from "../core/furniture";
import { extend, offset, trim, type Linear } from "../core/modify";
import { GENERIC, wallType } from "../core/wallTypes";
import { computeRooms, roomAt, type RoomGrid } from "../core/rooms";
import { deleteElements, reflection, transformElements, translation, type Xform } from "../core/transform";

export type Tool = "select" | "wall" | "door" | "window" | "line" | "dim" | "room" | "move" | "copy" | "mirror" | "trim" | "extend" | "offset" | "slab" | "roof" | "stair" | "furniture" | "section" | "hole" | "text";
/** Herramientas que actúan pulsando directamente sobre un muro o una línea. */
const PICK_TOOLS: Tool[] = ["trim", "extend", "offset"];
/** Herramientas que actúan sobre la selección actual. */
const MODIFY_TOOLS: Tool[] = ["move", "copy", "mirror"];
export type SelType = "wall" | "opening" | "line" | "dim" | "room" | "slab" | "roof" | "stair" | "furniture" | "section" | "text";
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

export const ROOF_LABEL: Record<RoofKind, string> = { flat: "Plana", gable: "A dos aguas", hip: "A cuatro aguas" };

const COMMANDS: Record<string, Tool> = {
  M: "wall", MURO: "wall", P: "door", PUERTA: "door", V: "window", VENTANA: "window",
  L: "line", LINEA: "line", "LÍNEA": "line", C: "dim", COTA: "dim", S: "select", SEL: "select",
  H: "room", HAB: "room", HABITACION: "room", "HABITACIÓN": "room",
  MO: "move", MOVER: "move", CO: "copy", COPIA: "copy", SI: "mirror", SIMETRIA: "mirror", "SIMETRÍA": "mirror",
  LO: "slab", LOSA: "slab", TR: "trim", RECORTAR: "trim", AL: "extend", ALARGAR: "extend", DE: "offset", DESFASE: "offset", EQ: "offset", EQUIDISTANCIA: "offset",
  CU: "roof", CUBIERTA: "roof", TEJADO: "roof", ES: "stair", ESCALERA: "stair", MB: "furniture", MOBILIARIO: "furniture", MUEBLE: "furniture",
  HL: "hole", HUECO: "hole", TX: "text", TEXTO: "text", SE: "section", SECCION: "section", "SECCIÓN": "section", CORTE: "section",
};

/**
 * Estado del editor y toda la lógica de interacción, sin DOM.
 * La planta, el visor 3D y la interfaz React se suscriben a sus cambios.
 */
export class Editor {
  project: Project = emptyProject();
  /** Índice del nivel en el que se dibuja. */
  active = 0;
  /** El nivel activo: todas las herramientas trabajan sobre él. */
  get model(): Level { return this.project.levels[this.active]; }
  set model(m: Model) { this.project.levels[this.active] = { ...this.model, ...m }; }
  rooms: RoomGrid | null = null;
  vis: Record<LayerId, boolean> = { muros: true, puertas: true, ventanas: true, cotas: true, anot: true, hab: true, losas: true, cubiertas: true, escaleras: true, mobiliario: true, secciones: true };
  defaults = { wallType: GENERIC, thick: 0.15, height: 2.7, doorW: 0.9, doorH: 2.1, winW: 1.2, winH: 1.2, sill: 0.9, slabThick: 0.2, roofKind: "gable" as RoofKind, pitch: 30, overhang: 0.5, stairW: 1, furnKind: "bed2", furnRot: 0, textSize: 0.25 };
  tool: Tool = "select";
  /** Elementos seleccionados. */
  sels: Selection[] = [];
  /** La selección cuando hay exactamente un elemento; null si no hay ninguno o hay varios. */
  get sel(): Selection | null { return this.sels.length === 1 ? this.sels[0] : null; }
  set sel(s: Selection | null) { this.sels = s ? [s] : []; }
  /** Distancia de desfase (equidistancia) y elemento elegido para desfasar. */
  offsetDist = 1;
  offsetTarget: Linear | null = null;
  /** Ventana de selección en curso, en coordenadas del dibujo. */
  box: { a: Pt; b: Pt } | null = null;
  ortho = true;
  osnap = true;
  view = { scale: 55, ox: 120, oy: 90 };
  draft: { pts: Pt[] } | null = null;
  mouse = { x: 0, y: 0, in: false };
  snap: SnapPt | null = null;
  hover: Selection | null = null;
  openCand: OpeningCandidate | null = null;
  grip: GripDrag | null = null;
  /** Punto donde se insertará el texto que se está escribiendo en la línea de comandos */
  textAt: Pt | null = null;
  message = "Bienvenido. Se ha cargado una vivienda de ejemplo.";

  private history: string[] = [];
  private lastCmd = "";
  private listeners = new Set<() => void>();
  private modelListeners = new Set<() => void>();
  version = 0;

  constructor(private storage: Storage | null = null) {
    const saved = this.load();
    this.project = saved ?? sampleProject();
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
    attachWalls(this.project);
    this.rooms = computeRooms(this.model);
    this.save();
    this.modelListeners.forEach((f) => f());
    this.emit();
  }
  /** Cambios visuales que también afectan al 3D (capas, selección). */
  refresh3d() { this.modelListeners.forEach((f) => f()); this.emit(); }

  // ---------- persistencia e historial ----------
  private save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.project)); } catch { /* sin almacenamiento */ } }
  private load(): Project | null {
    try { const s = this.storage?.getItem(STORAGE_KEY); return s ? normalizeProject(JSON.parse(s)) : null; } catch { return null; }
  }
  snapshot() { this.history.push(JSON.stringify({ p: this.project, a: this.active })); if (this.history.length > 200) this.history.shift(); }
  undo() {
    const s = this.history.pop();
    if (!s) { this.log("Nada que deshacer."); return; }
    const h = JSON.parse(s) as { p: Project; a: number };
    this.project = h.p; this.active = Math.min(h.a, h.p.levels.length - 1);
    this.sel = null; this.log("Deshecho."); this.changed();
  }
  log(t: string) { this.message = t; this.emit(); }

  loadSample() { this.snapshot(); this.project = { ...sampleProject(), info: this.project.info }; this.active = 0; this.sel = null; this.log("Vivienda de ejemplo cargada."); this.changed(); }
  clear() { this.snapshot(); this.project = { ...emptyProject(), info: this.project.info }; this.active = 0; this.sel = null; this.log("Dibujo nuevo. Usa Deshacer si te equivocaste."); this.changed(); this.setTool("wall"); }

  /** Cambia los datos del cajetín. */
  setInfo(patch: Partial<ProjectInfo>) { this.edit(() => { this.project.info = { ...this.project.info, ...patch }; }); }

  // ---------- niveles ----------
  /** Nivel inmediatamente inferior al activo (se muestra de referencia en planta). */
  levelBelow(): Level | null {
    const cur = this.model;
    const below = this.project.levels.filter((l) => l.elev < cur.elev).sort((a, b) => b.elev - a.elev);
    return below[0] ?? null;
  }
  setActiveLevel(i: number) {
    if (i < 0 || i >= this.project.levels.length || i === this.active) return;
    this.active = i; this.sels = []; this.draft = null; this.offsetTarget = null;
    this.rooms = computeRooms(this.model);
    this.message = `Nivel activo: ${this.model.name} (cota ${this.model.elev.toFixed(2)} m).`;
    this.refresh3d();
  }
  /** Altura de planta del nivel activo: la del muro más alto, o 3 m si no hay muros. */
  private storyHeight() {
    const hs = this.model.walls.map((w) => w.height);
    return Math.max(hs.length ? Math.max(...hs) : 2.7, 2.7) + 0.3;
  }
  /** Desnivel hasta el nivel de encima, o la altura de planta si es el último. */
  floorToFloor() {
    const up = this.project.levels.filter((l) => l.elev > this.model.elev).map((l) => l.elev);
    return Math.round((up.length ? Math.min(...up) - this.model.elev : this.storyHeight()) * 100) / 100;
  }
  /** Crea un nivel encima del activo, vacío o como copia del activo (muros, huecos, losas, escaleras…). */
  addLevel(copy: boolean) {
    this.snapshot();
    const top = Math.max(...this.project.levels.map((l) => l.elev));
    const elev = Math.round((Math.max(top, this.model.elev) + this.storyHeight()) * 100) / 100;
    const n = this.project.levels.length;
    // la copia no lleva cubiertas (se mueven abajo) ni secciones (cortan todo el edificio)
    const content = copy ? { ...cloneModel(this.model), roofs: [], sections: [] } : undefined;
    const lv = newLevel(n === 1 ? "Planta 1" : `Planta ${n}`, elev, content);
    // al copiar la planta más alta, su cubierta sube a la copia para seguir coronando el edificio
    const src = this.model, moved = copy && src.elev >= top - 1e-6 ? src.roofs.length : 0;
    if (moved) { lv.roofs = src.roofs; src.roofs = []; }
    this.project.levels.push(lv);
    this.project.levels.sort((a, b) => a.elev - b.elev);
    this.active = this.project.levels.indexOf(lv);
    this.sels = [];
    this.message = copy ? `${lv.name} creada como copia, a ${elev.toFixed(2)} m.${moved ? " La cubierta ha subido a la nueva planta." : ""}` : `${lv.name} creada a ${elev.toFixed(2)} m. El nivel de abajo se ve en gris como referencia.`;
    this.changed();
  }
  renameLevel(name: string) { this.edit(() => { this.model.name = name; }); }
  setLevelElevation(elev: number) {
    this.edit(() => {
      const lv = this.model;
      lv.elev = elev;
      this.project.levels.sort((a, b) => a.elev - b.elev);
      this.active = this.project.levels.indexOf(lv);
    });
  }
  deleteLevel() {
    if (this.project.levels.length < 2) { this.log("El proyecto necesita al menos un nivel."); return; }
    this.snapshot();
    const name = this.model.name;
    this.project.levels.splice(this.active, 1);
    this.active = Math.max(0, this.active - 1);
    this.sels = [];
    this.message = `Nivel "${name}" borrado. Usa Deshacer si te equivocaste.`;
    this.changed();
  }

  // ---------- consultas ----------
  wallById(id: number) { return this.model.walls.find((w) => w.id === id); }
  isSelected(type: SelType, id: number) { return this.sels.some((s) => s.type === type && s.id === id); }
  selObj(): (Seg & { id: number }) | Model["openings"][number] | Model["rooms"][number] | Model["slabs"][number] | Model["roofs"][number] | Model["stairs"][number] | Model["furniture"][number] | Model["sections"][number] | Model["texts"][number] | null {
    if (!this.sel) return null;
    const m = this.model;
    const list = { wall: m.walls, line: m.lines, dim: m.dims, opening: m.openings, room: m.rooms, slab: m.slabs, roof: m.roofs, stair: m.stairs, furniture: m.furniture, section: m.sections, text: m.texts }[this.sel.type] as { id: number }[];
    return (list.find((o) => o.id === this.sel!.id) as never) ?? null;
  }
  grips(): { k: 0 | 1 | "mid"; x: number; y: number }[] {
    const o = this.selObj();
    if (!o || !["wall", "line", "roof", "stair", "section"].includes(this.sel!.type)) return [];
    const s = o as Seg;
    const g: { k: 0 | 1 | "mid"; x: number; y: number }[] = [{ k: 0, x: s.x1, y: s.y1 }, { k: 1, x: s.x2, y: s.y2 }];
    if (this.sel!.type !== "roof") g.push({ k: "mid", x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
    return g;
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
      case "mirror": return n ? "SIMETRÍA  Segundo punto del eje:" : "SIMETRÍA  Primer punto del eje de simetría:";
      case "slab": return n < 3 ? `LOSA  Precisa ${n ? "siguiente" : "primer"} vértice del contorno:` : "LOSA  Siguiente vértice [Enter o clic en el primero cierra]:";
      case "roof": return n ? "CUBIERTA  Esquina opuesta del perímetro:" : `CUBIERTA  Primera esquina del perímetro (${ROOF_LABEL[d.roofKind].toLowerCase()}, ${d.pitch}°):`;
      case "stair": return n ? "ESCALERA  Punto de llegada (o longitud):" : `ESCALERA  Punto de arranque (ancho ${d.stairW.toFixed(2)} m):`;
      case "text": return this.textAt ? "TEXTO  Escribe el texto y pulsa Intro [Esc cancela]:" : `TEXTO  Punto de inserción (altura ${d.textSize.toFixed(2)} m):`;
      case "hole": return n ? "HUECO  Esquina opuesta del hueco:" : "HUECO EN LOSA  Primera esquina del hueco (dentro de una losa):";
      case "section": return n ? "SECCIÓN  Punto final de la línea de corte (se mira a su izquierda):" : "SECCIÓN  Primer punto de la línea de corte:";
      case "furniture": return `MOBILIARIO  Haz clic para colocar ${furnitureDef(d.furnKind).label.toLowerCase()} [R gira 90°, Esc termina]:`;
      case "trim": return "RECORTAR  Haz clic en el tramo de muro o línea que quieres quitar:";
      case "extend": return "ALARGAR  Haz clic cerca del extremo que quieres alargar:";
      case "offset": return this.offsetTarget
        ? "DESFASE  Haz clic en el lado donde va la copia:"
        : `DESFASE  Elige un muro o línea, o teclea otra distancia <${this.offsetDist.toFixed(2)} m>:`;
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
      cotas: m.dims.length, anot: m.lines.length + m.texts.length, hab: m.rooms.length, losas: m.slabs.length,
      cubiertas: m.roofs.length, escaleras: m.stairs.length, mobiliario: m.furniture.length, secciones: m.sections.length,
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
    if (MODIFY_TOOLS.includes(t) && !this.sels.length) { this.message = "Selecciona primero uno o varios elementos."; t = "select"; }
    if (MODIFY_TOOLS.includes(t) && this.sels.every((s) => s.type === "opening")) {
      this.message = "Las puertas y ventanas se mueven con su muro. Selecciona el muro."; t = "select";
    }
    this.tool = t; this.draft = null; this.openCand = null; this.box = null; this.offsetTarget = null; this.textAt = null;
    if (t !== "select" && !MODIFY_TOOLS.includes(t)) this.sels = [];
    this.refresh3d();
  }
  toggleOrtho() { this.ortho = !this.ortho; this.log(`ORTO ${this.ortho ? "activado" : "desactivado"}.`); }
  toggleOsnap() { this.osnap = !this.osnap; this.log(`REFENT ${this.osnap ? "activado" : "desactivado"}.`); }
  setLayer(id: LayerId, on: boolean) { this.vis[id] = on; this.sel = null; this.refresh3d(); }
  select(s: Selection | null) { this.sel = s; this.refresh3d(); }
  /** Añade o quita un elemento de la selección (Ctrl o Mayús + clic). */
  toggleSelect(s: Selection) {
    this.sels = this.isSelected(s.type, s.id) ? this.sels.filter((x) => !(x.type === s.type && x.id === s.id)) : [...this.sels, s];
    this.refresh3d();
  }

  /**
   * Selección por ventana, como en AutoCAD: de izquierda a derecha selecciona lo que queda
   * completamente dentro; de derecha a izquierda (captura), también lo que la cruza.
   */
  selectBox(a: Pt, b: Pt, additive: boolean) {
    const crossing = b.x < a.x;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const segHit = (s: Seg) => {
      if (inside(s.x1, s.y1) && inside(s.x2, s.y2)) return true;
      if (!crossing) return false;
      if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true;
      const edges: Seg[] = [
        { x1: x0, y1: y0, x2: x1, y2: y0 }, { x1: x1, y1: y0, x2: x1, y2: y1 },
        { x1: x1, y1: y1, x2: x0, y2: y1 }, { x1: x0, y1: y1, x2: x0, y2: y0 },
      ];
      return edges.some((e) => segmentsCross(s, e));
    };
    const m = this.model, found: Selection[] = [];
    if (this.vis.muros) for (const w of m.walls) if (segHit(w)) found.push({ type: "wall", id: w.id });
    for (const o of m.openings) {
      const w = this.wallById(o.wallId);
      if (!w || (o.kind === "door" && !this.vis.puertas) || (o.kind === "window" && !this.vis.ventanas)) continue;
      const c = loc(w, o.t * dir(w).L, 0);
      if (inside(c.x, c.y) && !found.some((f) => f.type === "wall" && f.id === w.id)) found.push({ type: "opening", id: o.id });
    }
    if (this.vis.anot) for (const l of m.lines) if (segHit(l)) found.push({ type: "line", id: l.id });
    if (this.vis.anot) for (const t of m.texts) {
      const bx = textBox(t);
      if (crossing ? bx.some((p) => inside(p.x, p.y)) : bx.every((p) => inside(p.x, p.y))) found.push({ type: "text", id: t.id });
    }
    if (this.vis.cotas) for (const d of m.dims) if (segHit(d)) found.push({ type: "dim", id: d.id });
    if (this.vis.hab) for (const r of m.rooms) {
      const c = this.rooms?.rooms.get(r.id), p = c?.ok ? { x: c.cx, y: c.cy } : r;
      if (inside(p.x, p.y)) found.push({ type: "room", id: r.id });
    }
    if (this.vis.losas) for (const sl of m.slabs) {
      const edgesOf = sl.pts.map((p, i) => { const q = sl.pts[(i + 1) % sl.pts.length]; return { x1: p.x, y1: p.y, x2: q.x, y2: q.y }; });
      if (crossing ? edgesOf.some(segHit) : sl.pts.every((p) => inside(p.x, p.y))) found.push({ type: "slab", id: sl.id });
    }
    if (this.vis.cubiertas) for (const r of m.roofs) {
      const ol = roofGeom(r).outline;
      const edgesOf = ol.map((p, i) => { const q = ol[(i + 1) % 4]; return { x1: p.x, y1: p.y, x2: q.x, y2: q.y }; });
      if (crossing ? edgesOf.some(segHit) : ol.every((p) => inside(p.x, p.y))) found.push({ type: "roof", id: r.id });
    }
    if (this.vis.mobiliario) for (const f of m.furniture) {
      const ol = furnitureOutline(f);
      if (crossing ? inside(f.x, f.y) || ol.some((p) => inside(p.x, p.y)) : ol.every((p) => inside(p.x, p.y))) found.push({ type: "furniture", id: f.id });
    }
    if (this.vis.escaleras) for (const st of m.stairs) if (segHit(st)) found.push({ type: "stair", id: st.id });
    if (this.vis.secciones) for (const se of m.sections) if (segHit(se)) found.push({ type: "section", id: se.id });
    const merged = additive ? [...this.sels] : [];
    for (const f of found) if (!merged.some((x) => x.type === f.type && x.id === f.id)) merged.push(f);
    this.sels = merged;
    this.box = null;
    this.message = merged.length ? `${merged.length} elemento${merged.length > 1 ? "s" : ""} seleccionado${merged.length > 1 ? "s" : ""}.` : "Ningún elemento dentro de la ventana.";
    this.refresh3d();
  }

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
      if (this.draft && !MODIFY_TOOLS.includes(this.tool)) for (const q of this.draft.pts) test(q.x, q.y, "end");
      if (r) return r;
    }
    let x = wx, y = wy;
    const orth = from && this.ortho && this.tool !== "roof" && this.tool !== "hole" && (this.tool !== "dim" || this.draft?.pts.length === 1);
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
    if (this.vis.anot) for (const t of m.texts) if (pointInPolygon({ x: wx, y: wy }, textBox(t))) take(0.02, { type: "text", id: t.id });
    if (this.vis.anot) for (const l of m.lines) { const r = distSeg(wx, wy, l.x1, l.y1, l.x2, l.y2); if (r.d < tol) take(r.d, { type: "line", id: l.id }); }
    if (this.vis.cotas) for (const d of m.dims) { const g = dimGeom(d), r = distSeg(wx, wy, g.a.x, g.a.y, g.b.x, g.b.y); if (r.d < tol * 2) take(r.d, { type: "dim", id: d.id }); }
    if (this.vis.secciones) for (const se of m.sections) { const r = distSeg(wx, wy, se.x1, se.y1, se.x2, se.y2); if (r.d < tol) take(r.d, { type: "section", id: se.id }); }
    if (this.vis.escaleras) for (const st of m.stairs) { const r = distSeg(wx, wy, st.x1, st.y1, st.x2, st.y2); if (r.d < st.width / 2) take(r.d + 0.2, { type: "stair", id: st.id }); }
    if (this.vis.mobiliario) for (const f of m.furniture)
      if (pointInPolygon({ x: wx, y: wy }, furnitureOutline(f))) take(0.15 + Math.hypot(wx - f.x, wy - f.y) * 0.01, { type: "furniture", id: f.id });
    if (!best && this.vis.hab) { const r = roomAt(m, this.rooms, wx, wy); if (r) best = { type: "room", id: r.id }; }
    if (!best && this.vis.cubiertas) for (const r of m.roofs) if (pointInPolygon({ x: wx, y: wy }, roofGeom(r).outline)) best = { type: "roof", id: r.id };
    if (!best && this.vis.losas) for (const sl of m.slabs) if (onSlab({ x: wx, y: wy }, sl)) best = { type: "slab", id: sl.id };
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
    if (MODIFY_TOOLS.includes(this.tool)) return this.modify(p);
    if (this.tool === "wall" || this.tool === "line") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const last = this.draft.pts[this.draft.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) return;
      this.snapshot();
      if (this.tool === "wall") {
        const w: Wall = { id: nextId(m), type: this.defaults.wallType, x1: last.x, y1: last.y, x2: p.x, y2: p.y, thick: this.defaults.thick, height: this.defaults.height, attach: true };
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
    if (this.tool === "slab") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const first = this.draft.pts[0], last = this.draft.pts[this.draft.pts.length - 1];
      if (this.draft.pts.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) < 0.01) { this.closeSlab(); return; }
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) return;
      this.draft.pts.push(p); this.emit();
      return;
    }
    if (this.tool === "roof" || this.tool === "stair") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const a = this.draft.pts[0];
      if (this.tool === "roof" ? Math.abs(p.x - a.x) < 0.3 || Math.abs(p.y - a.y) < 0.3 : Math.hypot(p.x - a.x, p.y - a.y) < 0.5) {
        this.log(this.tool === "roof" ? "La cubierta necesita un rectángulo: elige la esquina opuesta." : "La escalera es demasiado corta.");
        return;
      }
      this.snapshot();
      const d = this.defaults, id = nextId(m);
      if (this.tool === "roof") {
        m.roofs.push({ id, x1: a.x, y1: a.y, x2: p.x, y2: p.y, kind: d.roofKind, pitch: d.pitch, overhang: d.overhang, base: d.height, thick: 0.15 });
        this.sels = [{ type: "roof", id }];
        this.message = `Cubierta ${ROOF_LABEL[d.roofKind].toLowerCase()} creada. Cambia el tipo y la pendiente en Propiedades.`;
      } else {
        const st = { id, x1: a.x, y1: a.y, x2: p.x, y2: p.y, width: d.stairW, height: this.floorToFloor() };
        m.stairs.push(st);
        const k = stairSteps(st);
        this.sels = [{ type: "stair", id }];
        this.message = `Escalera de ${k.n} peldaños: huella ${(k.tread * 100).toFixed(0)} cm, contrahuella ${(k.riser * 100).toFixed(1)} cm.` +
          (k.tread < 0.25 ? " La huella es corta: alarga el tramo." : "");
      }
      this.draft = null;
      this.changed();
      return;
    }
    if (this.tool === "text") { this.textAt = p; this.message = "Escribe el texto en la línea de comandos y pulsa Intro."; this.emit(); return; }
    if (this.tool === "hole") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const a = this.draft.pts[0];
      if (Math.abs(p.x - a.x) < 0.1 || Math.abs(p.y - a.y) < 0.1) { this.log("El hueco necesita un rectángulo: elige la esquina opuesta."); return; }
      const rect = [a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }].map((q) => ({ x: q.x, y: q.y }));
      if (!this.addHole(m, rect)) { this.log("Dibuja el hueco dentro de una losa de este nivel."); return; }
      this.draft = null;
      this.changed();
      return;
    }
    if (this.tool === "section") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const a = this.draft.pts[0];
      if (Math.hypot(p.x - a.x, p.y - a.y) < 0.5) { this.log("La línea de corte es demasiado corta."); return; }
      this.snapshot();
      const se = { id: nextId(m), x1: a.x, y1: a.y, x2: p.x, y2: p.y, name: nextSectionName(this.project) };
      m.sections.push(se);
      this.sels = [{ type: "section", id: se.id }];
      this.draft = null;
      this.message = `Sección ${se.name}-${se.name}' creada. Mírala en Lámina › Secciones; Invertir en Propiedades cambia el lado que se ve.`;
      this.changed();
      return;
    }
    if (this.tool === "furniture") {
      this.snapshot();
      const f = { id: nextId(m), kind: this.defaults.furnKind, x: p.x, y: p.y, rot: this.defaults.furnRot };
      m.furniture.push(f);
      this.message = `${furnitureDef(f.kind).label} colocado. Haz clic para otro, R para girar o Esc para terminar.`;
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

  /** Mover, copiar o simetría sobre toda la selección. */
  private modify(p: Pt) {
    if (!this.sels.length) { this.setTool("select"); return; }
    if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
    const bp = this.draft.pts[0];
    if (Math.hypot(p.x - bp.x, p.y - bp.y) < 1e-6) return;
    const xf: Xform = this.tool === "mirror" ? reflection(bp, p) : translation(p.x - bp.x, p.y - bp.y);
    this.snapshot();
    const copy = this.tool !== "move";
    const result = transformElements(this.model, this.sels, xf, copy);
    // cada sección copiada lleva su propia letra
    if (copy) for (const r of result) if (r.type === "section") { const se = this.model.sections.find((x) => x.id === r.id); if (se) se.name = nextSectionName(this.project); }
    const n = result.length;
    if (this.tool === "copy") {
      this.message = `${n} copia${n > 1 ? "s" : ""} creada${n > 1 ? "s" : ""}. Haz clic para otra copia o Esc para terminar.`;
    } else {
      this.message = this.tool === "move" ? `${n} elemento${n > 1 ? "s" : ""} movido${n > 1 ? "s" : ""}.` : `Simetría creada con ${n} elemento${n > 1 ? "s" : ""}. Los originales se conservan.`;
      if (this.tool === "mirror") this.sels = result;
      this.draft = null; this.tool = "select";
    }
    this.changed();
  }

  /** Vista previa de la transformación en curso (para dibujarla). */
  previewXform(): Xform | null {
    if (!MODIFY_TOOLS.includes(this.tool) || !this.draft?.pts.length || !this.mouse.in) return null;
    const bp = this.draft.pts[0], p = this.snap ?? this.mouse;
    if (Math.hypot(p.x - bp.x, p.y - bp.y) < 1e-6) return null;
    return this.tool === "mirror" ? reflection(bp, p) : translation(p.x - bp.x, p.y - bp.y);
  }

  /** Convierte las líneas seleccionadas en muros con el espesor y la altura por defecto. */
  linesToWalls() {
    const lines = this.sels.filter((s) => s.type === "line");
    if (!lines.length) { this.log("Selecciona líneas para convertirlas en muros."); return; }
    this.snapshot();
    const m = this.model, ids = new Set(lines.map((s) => s.id)), made: Selection[] = [];
    for (const l of m.lines.filter((l) => ids.has(l.id))) {
      const w: Wall = { id: nextId(m), type: this.defaults.wallType, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, thick: this.defaults.thick, height: this.defaults.height, attach: true };
      m.walls.push(w);
      made.push({ type: "wall", id: w.id });
    }
    m.lines = m.lines.filter((l) => !ids.has(l.id));
    this.sels = made;
    this.message = `${made.length} línea${made.length > 1 ? "s" : ""} convertida${made.length > 1 ? "s" : ""} en muros de ${this.defaults.thick.toFixed(2)} m.`;
    this.changed();
  }

  /** Importa un DXF como líneas de anotación y las deja seleccionadas. */
  importDxf(text: string, fileName = "DXF") {
    const r = parseDxf(text);
    if (!r.segments.length) { this.log(`${fileName}: no se encontraron líneas ni polilíneas para importar.`); return; }
    this.snapshot();
    const m = this.model, made: Selection[] = [];
    for (const s of r.segments) {
      const id = nextId(m);
      m.lines.push({ id, x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y });
      made.push({ type: "line", id });
    }
    this.vis.anot = true;
    this.tool = "select"; this.draft = null;
    this.sels = made;
    const skipped = Object.entries(r.skipped).map(([k, v]) => `${v} ${k}`).join(", ");
    this.message = `${fileName}: ${made.length} líneas importadas (unidades: ${r.unitsLabel})${skipped ? `; sin importar: ${skipped}` : ""}. Usa "Convertir en muros" para pasarlas a muros.`;
    this.changed();
    this.fitRequest?.();
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

  /** Elige la pieza de la biblioteca que se colocará y activa la herramienta. */
  pickFurniture(kind: string) {
    this.defaults.furnKind = kind;
    if (this.tool !== "furniture") this.setTool("furniture"); else this.emit();
  }
  /** Gira 90° la pieza que se va a colocar. */
  rotateFurniturePreview() { this.defaults.furnRot = (this.defaults.furnRot + 90) % 360; this.log(`Giro ${this.defaults.furnRot}°.`); }
  /** Lista de piezas de la biblioteca. */
  get furnitureCatalog() { return FURNITURE; }

  /** Cierra el contorno de la losa en curso y la crea. */
  closeSlab() {
    const pts = this.draft?.pts ?? [];
    if (pts.length < 3) { this.log("Una losa necesita al menos 3 vértices."); return; }
    this.snapshot();
    const sl = { id: nextId(this.model), pts: pts.map((p) => ({ ...p })), thick: this.defaults.slabThick, holes: [] };
    this.model.slabs.push(sl);
    this.draft = null;
    this.sels = [{ type: "slab", id: sl.id }];
    this.message = `Losa de ${polygonArea(sl.pts).toFixed(2)} m² y ${sl.thick.toFixed(2)} m de espesor creada.`;
    this.changed();
  }

  finishDraft() { if (this.draft) { this.draft = null; this.log("Comando terminado."); } }

  /** Muro o línea bajo el cursor. */
  pickLinear(wx: number, wy: number): Linear | null {
    const tol = 6 / this.view.scale;
    let best: Linear | null = null, bd = Infinity;
    if (this.vis.muros) for (const w of this.model.walls) {
      const r = distSeg(wx, wy, w.x1, w.y1, w.x2, w.y2);
      if (r.d < w.thick / 2 + tol && r.d < bd) { bd = r.d; best = { type: "wall", id: w.id }; }
    }
    if (this.vis.anot) for (const l of this.model.lines) {
      const r = distSeg(wx, wy, l.x1, l.y1, l.x2, l.y2);
      if (r.d < tol && r.d < bd) { bd = r.d; best = { type: "line", id: l.id }; }
    }
    return best;
  }

  /** Clic con recortar, alargar o desfase. */
  private pickAction(p: Pt) {
    if (this.tool === "offset" && this.offsetTarget) {
      this.snapshot();
      const made = offset(this.model, this.offsetTarget, this.offsetDist, p);
      if (!made) { this.history.pop(); this.offsetTarget = null; this.emit(); return; }
      this.offsetTarget = null;
      this.message = `Copia desfasada ${this.offsetDist.toFixed(2)} m. Elige otro elemento o pulsa Esc.`;
      this.changed();
      return;
    }
    const target = this.pickLinear(p.x, p.y);
    if (!target) { this.log("Haz clic sobre un muro o una línea."); return; }
    if (this.tool === "offset") { this.offsetTarget = target; this.hover = target; this.emit(); return; }
    this.snapshot();
    const ok = this.tool === "trim" ? trim(this.model, target, p) : extend(this.model, target, p);
    if (!ok) {
      this.history.pop();
      this.log(this.tool === "trim" ? "Ningún muro ni línea corta ese elemento." : "No hay ningún muro ni línea en esa dirección.");
      return;
    }
    this.sels = [];
    this.message = this.tool === "trim" ? "Tramo recortado." : "Elemento alargado.";
    this.changed();
  }

  deleteSel() {
    if (!this.sels.length) return;
    this.snapshot();
    const n = this.sels.length;
    deleteElements(this.model, this.sels);
    this.sels = [];
    this.message = n > 1 ? `${n} elementos borrados.` : "Elemento borrado.";
    this.changed();
  }

  /** Aplica un cambio de propiedad con deshacer. */
  edit(fn: () => void) { this.snapshot(); fn(); this.changed(); }

  escape() {
    if (this.textAt) { this.textAt = null; this.log("Texto cancelado."); return; }
    if (MODIFY_TOOLS.includes(this.tool)) { this.setTool("select"); return; }
    if (this.tool === "offset" && this.offsetTarget) { this.offsetTarget = null; this.emit(); return; }
    if (this.draft) this.finishDraft();
    else if (this.tool !== "select") this.setTool("select");
    else this.select(null);
  }

  // ---------- línea de comandos ----------
  runCommand(raw: string) {
    if (this.tool === "text" && this.textAt) {
      const txt = raw.trim();
      if (!txt) { this.textAt = null; this.log("Texto cancelado."); return; }
      const m = this.model, t = { id: nextId(m), x: this.textAt.x, y: this.textAt.y, text: txt, size: this.defaults.textSize, rot: 0 };
      this.snapshot();
      m.texts.push(t);
      this.textAt = null;
      this.message = "Texto añadido. Haz clic para otro o Esc para terminar.";
      this.changed();
      return;
    }
    const s = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (!s) {
      if (this.draft && this.tool === "slab") { this.closeSlab(); return; }
      if (this.draft && this.tool !== "dim") { this.finishDraft(); return; }
      if (this.lastCmd) this.runCommand(this.lastCmd);
      return;
    }
    if (COMMANDS[s]) { this.lastCmd = s; this.setTool(COMMANDS[s]); if (this.tool === COMMANDS[s]) this.log(`Comando: ${s}`); return; }
    if (s === "B" || s === "BORRAR") return this.deleteSel();
    if (s === "U" || s === "DESHACER") return this.undo();
    if (s === "Z" || s === "ZOOM" || s === "ENCUADRAR") { this.fitRequest?.(); return; }
    if (this.tool === "furniture" && (s === "R" || s === "GIRAR")) { this.rotateFurniturePreview(); return; }
    const num = s.replace(",", ".");
    if (this.tool === "offset" && /^\d*\.?\d+$/.test(num)) {
      const v = parseFloat(num);
      if (v > 0) { this.offsetDist = v; this.log(`Distancia de desfase: ${v.toFixed(2)} m.`); }
      return;
    }
    const lengthOk = this.draft?.pts.length &&
      (["wall", "line", "move", "copy", "mirror", "slab", "stair"].includes(this.tool) || (this.tool === "dim" && this.draft.pts.length === 1));
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
    this.log(`Comando desconocido: "${raw}". Prueba M, P, V, L, C, H, LO, CU, ES, MB, MO, CO, SI, TR, AL, DE, B (borrar), U (deshacer), Z (encuadrar).`);
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
    else if (PICK_TOOLS.includes(this.tool)) this.hover = this.offsetTarget ?? this.pickLinear(w.x, w.y);
    else if (this.tool === "door" || this.tool === "window") this.openCand = this.openingCandidate(w.x, w.y);
    else this.snap = this.snapPoint(w.x, w.y);
    this.emit();
  }
  pointerLeave() { this.mouse.in = false; this.hover = null; this.emit(); }

  /**
   * Clic principal. Con la herramienta de selección, si no hay nada bajo el cursor (o solo una habitación)
   * devuelve box=true: el lienzo decide al soltar si fue un clic o una ventana de selección.
   */
  pointerDown(sx: number, sy: number, additive = false): { box: boolean; pick?: Selection | null } {
    const w = this.toW(sx, sy);
    this.mouse = { x: w.x, y: w.y, in: true };
    if (this.tool === "select") {
      const g = this.grips().find((g) => { const s = this.toS(g.x, g.y); return Math.hypot(s.x - sx, s.y - sy) < 9; });
      if (g && !additive) { this.startGrip(g.k, g); return { box: false }; }
      const h = this.pick(w.x, w.y);
      if (h && h.type !== "room") { if (additive) this.toggleSelect(h); else this.select(h); return { box: false }; }
      return { box: true, pick: h };
    }
    if (this.tool === "door" || this.tool === "window") { this.placeOpening(w.x, w.y); return { box: false }; }
    if (this.tool === "room") { this.placeRoom(w.x, w.y); return { box: false }; }
    if (PICK_TOOLS.includes(this.tool)) { this.pickAction(w); return { box: false }; }
    this.commitPoint(this.snapPoint(w.x, w.y));
    return { box: false };
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
    const linear = this.sel!.type === "wall" || this.sel!.type === "line";
    const j0 = linear ? this.joined(o.x1, o.y1, o) : [], j1 = linear ? this.joined(o.x2, o.y2, o) : [];
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
      const p = this.snapPoint(w.x, w.y, this.sel?.type === "roof" ? null : fixed, g.skip);
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

  /**
   * Añade un hueco a la losa del nivel que contiene su centro. Devuelve false si no hay ninguna.
   * Guarda deshacer y deja la losa seleccionada; quien llama debe avisar del cambio.
   */
  private addHole(lv: Level, ring: Pt[]): boolean {
    const c = { x: ring.reduce((s, q) => s + q.x, 0) / ring.length, y: ring.reduce((s, q) => s + q.y, 0) / ring.length };
    const sl = lv.slabs.find((x) => onSlab(c, x));
    if (!sl) return false;
    this.snapshot();
    sl.holes.push(ring);
    if (lv === this.model) this.sels = [{ type: "slab", id: sl.id }];
    this.message = `Hueco de ${polygonArea(ring).toFixed(2)} m² abierto en la losa${lv === this.model ? "" : ` de ${lv.name}`}.`;
    return true;
  }

  /** Nivel inmediatamente por encima del activo, si lo hay. */
  levelAbove(): Level | null {
    const e = this.model.elev;
    return this.project.levels.filter((l) => l.elev > e + 1e-6).sort((a, b) => a.elev - b.elev)[0] ?? null;
  }

  /** Abre en la losa del nivel de arriba un hueco con la huella de la escalera. */
  openAboveStair(id: number) {
    const st = this.model.stairs.find((x) => x.id === id), up = this.levelAbove();
    if (!st) return;
    if (!up) { this.log("No hay ningún nivel por encima. Crea uno con Nuevo nivel."); return; }
    const { L } = dir(st), h = st.width / 2;
    const ring = [loc(st, 0, -h), loc(st, L, -h), loc(st, L, h), loc(st, 0, h)];
    if (!this.addHole(up, ring)) { this.log(`${up.name} no tiene ninguna losa sobre la escalera.`); return; }
    this.changed();
  }

  /** Quita todos los huecos de una losa. */
  clearHoles(id: number) {
    const sl = this.model.slabs.find((x) => x.id === id);
    if (sl?.holes.length) this.edit(() => { sl.holes = []; });
  }

  /** Cambia el tipo de los muros indicados; los tipos del catálogo fijan el espesor. */
  setWallType(ids: number[], type: string) {
    const ws = this.model.walls.filter((w) => ids.includes(w.id));
    if (!ws.length) return;
    this.edit(() => { for (const w of ws) { w.type = type; if (type !== GENERIC) w.thick = wallType(type).thick; } });
    this.message = `${ws.length > 1 ? `${ws.length} muros cambiados` : "Muro cambiado"} a ${wallType(type).name.toLowerCase()}.`;
    this.emit();
  }

  /** Invierte el sentido de una sección: se ve el otro lado del corte. */
  flipSection(id: number) {
    const se = this.model.sections.find((x) => x.id === id);
    if (se) this.edit(() => { [se.x1, se.y1, se.x2, se.y2] = [se.x2, se.y2, se.x1, se.y1]; });
  }

  /** Copia independiente del modelo, útil para pruebas. */
  exportModel(): Model { return cloneModel(this.model); }
}

/** ¿Se cortan los segmentos p y q? */
function segmentsCross(p: Seg, q: Seg) {
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  return o(p.x1, p.y1, p.x2, p.y2, q.x1, q.y1) !== o(p.x1, p.y1, p.x2, p.y2, q.x2, q.y2) &&
    o(q.x1, q.y1, q.x2, q.y2, p.x1, p.y1) !== o(q.x1, q.y1, q.x2, q.y2, p.x2, p.y2);
}
