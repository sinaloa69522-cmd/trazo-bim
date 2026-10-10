import type { MemberKind } from "../core/framing";
import { deckGeom, deckType, fitDecks } from "../core/decks";
import { bounds, sheetBounds, dimOffset, dir, distSeg, dimGeom, fits, loc, onSlab, pointInPolygon, polygonArea, roofGeom, textBox, type Pt } from "../core/geometry";
import { IDEAL_TREAD, POST_R, shortTread, sizedByTread, stairGeom, stairLabel, stairLenFor, stairSteps, stairTypeName } from "../core/stairs";
import {
  attachWalls, liftBuriedRoofs, cloneModel, emptyProject, newLevel, nextId, nextSectionName, normalizeProject, sampleProject, type Level, type Project, type ProjectInfo,
  type Deck, type DeckKind, type Dim, type LayerId, type MarkKind, type Model, type RoofKind, type RunSystem, type Stair, type StairKind, type Wall,
} from "../core/model";
import { autoDims } from "../core/autodim";
import { axes } from "../core/mxStruct";
import { fmtArea, fmtElev, fmtLen, fmtSmall, imperial, parseLen, setUnitSystem, FT, IN, type UnitSystem } from "../core/units";
import { levelText, MARK_KINDS, markHit, markPts, nextDetailNum } from "../core/marks";
import type { CadImportResult } from "../core/cadImport";
import { parseDxf } from "../core/dxfImport";
import { parseProjectFile, projectFileName, readProjectImages, serializeProject } from "../core/projectFile";
import { FURNITURE, furnitureDef, furnitureOutline } from "../core/furniture";
import { autoRoute, discOfSystem, isElectric, MEP, mepDef, mepOf, runLength, sanitaryPoints, systemDef, type Discipline } from "../core/mep";
import { breakLinear, extend, offset, trim, type Linear } from "../core/modify";
import { GENERIC, wallType } from "../core/wallTypes";
import { finish } from "../core/finishes";
import { openingStyle } from "../core/openingStyles";
import { foundationType, type FoundationKind } from "../core/foundation";
import { computeRooms, RC, roomAt, type RoomGrid } from "../core/rooms";
import { hatchArea, hatchPattern, inHatch, maskLoops, IMPORTED } from "../core/hatch";
import { deleteElements, reflection, rotation, scaling, screenAngle, transformElements, translation, type Xform } from "../core/transform";

export type Tool = "select" | "wall" | "door" | "window" | "line" | "dim" | "room" | "move" | "copy" | "mirror" | "rotate" | "scale" | "array" | "trim" | "extend" | "break" | "offset" | "slab" | "roof" | "stair" | "deck" | "column" | "furniture" | "section" | "hole" | "text" | "mark" | "fixture" | "run" | "calibrate" | "hatch";
/** Herramientas que actúan pulsando directamente sobre un muro o una línea. */
const PICK_TOOLS: Tool[] = ["trim", "extend", "break", "offset"];
/** Herramientas que actúan sobre la selección actual. */
const MODIFY_TOOLS: Tool[] = ["move", "copy", "mirror", "rotate", "scale", "array"];
const MODIFY_NAME: Partial<Record<Tool, string>> = { move: "Mover", copy: "Copiar", mirror: "Simetría", rotate: "Girar", scale: "Escala", array: "Matriz" };
const fmtNum = (v: number) => String(Math.round(v * 1000) / 1000);
export type SelType = "wall" | "opening" | "line" | "dim" | "room" | "slab" | "roof" | "stair" | "deck" | "column" | "furniture" | "section" | "text" | "mark" | "fixture" | "run" | "underlay" | "hatch";
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
/** Límites del zoom, en píxeles por metro: de un plano de varios kilómetros a un detalle de milímetros. */
const MIN_ZOOM = 0.02, MAX_ZOOM = 20000;

export const ROOF_LABEL: Record<RoofKind, string> = { flat: "Plana", gable: "A dos aguas", hip: "A cuatro aguas" };

const COMMANDS: Record<string, Tool> = {
  M: "wall", MURO: "wall", P: "door", PUERTA: "door", V: "window", VENTANA: "window",
  L: "line", LINEA: "line", "LÍNEA": "line", C: "dim", COTA: "dim", S: "select", SEL: "select",
  H: "room", HAB: "room", HABITACION: "room", "HABITACIÓN": "room",
  MO: "move", MOVER: "move", MOVE: "move", CO: "copy", COPIA: "copy", COPIAR: "copy", COPY: "copy", SI: "mirror", SIMETRIA: "mirror", "SIMETRÍA": "mirror", MI: "mirror", MIRROR: "mirror",
  RO: "rotate", GI: "rotate", ROTAR: "rotate", ROTATE: "rotate", ESC: "scale", ESCALA: "scale", SC: "scale", SCALE: "scale", MA: "array", MATRIZ: "array", AR: "array", ARRAY: "array",
  LO: "slab", LOSA: "slab", TR: "trim", RECORTAR: "trim", AL: "extend", ALARGAR: "extend", PA: "break", PARTIR: "break", BR: "break", BREAK: "break", DE: "offset", DESFASE: "offset", EQ: "offset", EQUIDISTANCIA: "offset",
  CU: "roof", CUBIERTA: "roof", TEJADO: "roof", ES: "stair", ESCALERA: "stair", DK: "deck", DECK: "deck", PORCHE: "deck", CL: "column", COL: "column", COLUMNA: "column", MB: "furniture", MOBILIARIO: "furniture", MUEBLE: "furniture",
  HL: "hole", HUECO: "hole", TX: "text", TEXTO: "text", SE: "section", SECCION: "section", "SECCIÓN": "section", CORTE: "section",
  SB: "hatch", SOMBREA: "hatch", SOMBREADO: "hatch", RAYADO: "hatch", TRAMA: "hatch",
  TU: "run", TUBERIA: "run", "TUBERÍA": "run", CANALIZACION: "run", "CANALIZACIÓN": "run",
};
/** Comandos de los símbolos de anotación. */
const MARK_COMMANDS: Record<string, MarkKind> = {
  NV: "nivel", NIVEL: "nivel", LD: "detalle", LLAMADA: "detalle", DETALLE: "detalle", NT: "nota", NOTA: "nota",
};
/** Comandos que abren la biblioteca de instalaciones de una disciplina. */
const DISC_COMMANDS: Record<string, Discipline> = {
  EL: "elec", ELECTRICIDAD: "elec", PL: "plum", PLOMERIA: "plum", "PLOMERÍA": "plum", FO: "plum", FONTANERIA: "plum", "FONTANERÍA": "plum",
};
/** Capa en la que va cada disciplina. */
export const DISC_LAYER: Record<Discipline, LayerId> = { elec: "electricidad", plum: "plomeria" };

/**
 * Estado del editor y toda la lógica de interacción, sin DOM.
 * La planta, el visor 3D y la interfaz React se suscriben a sus cambios.
 */
/** Medidas por defecto de cada sistema de unidades. */
const METRIC_DEFAULTS = { wallType: GENERIC, thick: 0.15, height: 2.7, doorW: 0.9, doorH: 2.1, winW: 1.2, winH: 1.2, sill: 0.9, slabThick: 0.2, pitch: 30, overhang: 0.5, stairW: 1, textSize: 0.25 };
/** EE.UU.: muro exterior de montantes 2x6 (6 1/2" con placas), techo a 9', puerta 3'-0" × 6'-8", ventana 3'-0" × 4'-0", pendiente 6:12. */
const US_DEFAULTS = {
  wallType: "us-2x6", thick: 6.5 * IN, height: 9 * FT, doorW: 3 * FT, doorH: 80 * IN, winW: 3 * FT, winH: 4 * FT, sill: 32 * IN,
  slabThick: 4 * IN, pitch: 26.57, overhang: 18 * IN, stairW: 3 * FT, textSize: 9 * IN,
};

/** Medida habitual en las unidades del proyecto: en pies, redondeada a 2". */
const nice = (v: number) => (imperial() ? Math.round(v / (2 * IN)) * 2 * IN : v);

export class Editor {
  private _project: Project = emptyProject();
  /** Al cambiar de proyecto (abrir, deshacer, ejemplo…) las medidas pasan a escribirse en sus unidades. */
  get project(): Project { return this._project; }
  set project(p: Project) { this._project = p; setUnitSystem(p.units ?? "metric"); }
  /** Índice del nivel en el que se dibuja. */
  active = 0;
  /** El nivel activo: todas las herramientas trabajan sobre él. */
  get model(): Level { return this.project.levels[this.active]; }
  set model(m: Model) { this.project.levels[this.active] = { ...this.model, ...m }; }
  rooms: RoomGrid | null = null;
  vis: Record<LayerId, boolean> = { muros: true, puertas: true, ventanas: true, cotas: true, anot: true, hab: true, losas: true, cubiertas: true, escaleras: true, decks: true, columnas: true, mobiliario: true, secciones: true, electricidad: true, plomeria: true, calcos: true, sombreados: true, ejes: true };
  defaults = { ...METRIC_DEFAULTS, roofKind: "gable" as RoofKind, furnKind: "bed2", furnRot: 0, mepKind: "enchufe", mepRot: 0, runSys: "af" as RunSystem, hatchPattern: "diagonal", hatchScale: 1, hatchAngle: 0, hatchMode: "room" as "room" | "poly", doorStyle: "single", winStyle: "fixed", deckKind: "wood" as DeckKind, colW: 0.3, stairKind: "recta" as StairKind, stairTurn: 1 as 1 | -1, markKind: "nivel" as MarkKind, markLabel: "N.P.T.", detailSheet: "" };
  tool: Tool = "select";
  /** Elementos seleccionados. */
  sels: Selection[] = [];
  /** La selección cuando hay exactamente un elemento; null si no hay ninguno o hay varios. */
  get sel(): Selection | null { return this.sels.length === 1 ? this.sels[0] : null; }
  set sel(s: Selection | null) { this.sels = s ? [s] : []; }
  /** Distancia de desfase (equidistancia) y elemento elegido para desfasar. */
  offsetDist = 1;
  /** Elementos de la matriz (incluido el original) */
  arrayN = 3;
  /** Herramienta de modificar elegida sin selección: se elige y se confirma con Enter */
  pendingModify: Tool | null = null;
  offsetTarget: Linear | null = null;
  /** Partir: elemento elegido y primer punto de corte */
  breakFrom: { r: Linear; p: Pt } | null = null;
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
  /** Nota con flecha a la espera de su texto: punta de la flecha y arranque del texto */
  noteAt: { a: Pt; p: Pt } | null = null;
  message = "Bienvenido. Se ha cargado una vivienda de ejemplo.";

  private history: string[] = [];
  private lastCmd = "";
  private listeners = new Set<() => void>();
  private modelListeners = new Set<() => void>();
  version = 0;

  constructor(private storage: Storage | null = null) {
    const saved = this.load();
    this.project = saved ?? sampleProject();
    fitDecks(this.project);
    if (this.project.units === "imperial") Object.assign(this.defaults, US_DEFAULTS);
    this.loadImages();
    this.rooms = computeRooms(this.model);
  }

  // ---------- suscripciones ----------
  /** Cualquier cambio (vista, cursor, selección, modelo). */
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  /** Solo cambios que afectan al modelo 3D. */
  onModel(fn: () => void) { this.modelListeners.add(fn); return () => { this.modelListeners.delete(fn); }; }
  getVersion = () => this.version;
  emit() { this.version++; this.listeners.forEach((f) => f()); }
  /** Hay cambios desde la última vez que se guardó o abrió el archivo del proyecto. */
  dirty = false;
  private changed() {
    this.dirty = true;
    attachWalls(this.project);
    // una cubierta que ha quedado dentro de la planta de arriba sube a coronarla
    if (liftBuriedRoofs(this.project)) this.message += " La cubierta ha subido a la planta de arriba.";
    fitDecks(this.project);
    if (this.project.autoDims !== false) this.refreshAutoDims();
    this.rooms = computeRooms(this.model);
    this.save();
    this.modelListeners.forEach((f) => f());
    this.emit();
  }
  /** Tipo de cimentación de la planta baja. */
  setFoundation(k: FoundationKind) {
    this.edit(() => { this.project.foundation = k; });
    this.message = `Cimentación: ${foundationType(this.project).name.toLowerCase()}. Mírala con Estructura en el 3D o en la lámina S-101.`;
    this.emit();
  }

  /** El 3D muestra la estructura de madera (framing) en lugar de los acabados. */
  framing = false;
  /** Tipos de pieza ocultos en la vista de estructura (se eligen en su leyenda). */
  hiddenMembers = new Set<MemberKind>();
  toggleMember(k: MemberKind) {
    if (!this.hiddenMembers.delete(k)) this.hiddenMembers.add(k);
    this.refresh3d();
  }
  toggleFraming() {
    this.framing = !this.framing;
    this.message = this.framing ? "3D: estructura de framing. En la leyenda puedes ocultar o mostrar cada tipo de pieza." : "3D: modelo completo.";
    this.refresh3d();
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
  /**
   * Cambia las unidades del proyecto. Las medidas por defecto pasan a las habituales de cada sitio
   * (en EE.UU. muro de 2x6, puerta de 3'-0" × 6'-8"…); lo ya dibujado no cambia.
   */
  setUnits(u: UnitSystem) {
    if ((this.project.units ?? "metric") === u) return;
    this.snapshot();
    this.project = { ...this.project, units: u };
    Object.assign(this.defaults, u === "imperial" ? US_DEFAULTS : METRIC_DEFAULTS);
    this.log(u === "imperial"
      ? `Unidades de EE.UU.: pies y pulgadas. Teclea 12'6", 12' o 6" (un número solo son pies). Muro por defecto 2x6, puerta 3'-0" × 6'-8".`
      : "Unidades métricas: metros.");
    this.changed();
  }
  log(t: string) { this.message = t; this.emit(); }

  loadSample() { this.snapshot(); this.project = { ...sampleProject(), info: this.project.info, budget: this.project.budget, units: this.project.units }; this.active = 0; this.sel = null; this.log("Vivienda de ejemplo cargada."); this.changed(); }
  clear() { this.snapshot(); this.project = { ...emptyProject(), info: this.project.info, budget: this.project.budget, units: this.project.units }; this.active = 0; this.sel = null; this.log("Dibujo nuevo. Usa Deshacer si te equivocaste."); this.changed(); this.setTool("wall"); }

  // ---------- archivo del proyecto ----------
  /** Contenido y nombre del archivo .trazo del proyecto; lo marca como guardado. */
  saveFile(): { name: string; text: string } {
    const f = { name: projectFileName(this.project.info.name), text: serializeProject(this.project, new Date(), this.usedImages()) };
    this.dirty = false;
    this.log(`Proyecto guardado como ${f.name}.`);
    return f;
  }
  /** Abre un archivo .trazo; si no es válido, no toca el proyecto actual y lo explica. Se puede deshacer. */
  openFile(text: string, fileName = "archivo"): boolean {
    let p: Project;
    try { p = parseProjectFile(text); } catch (e) { this.log(`${fileName}: ${(e as Error).message}`); return false; }
    for (const [k, v] of Object.entries(readProjectImages(text))) this.storeImage(k, v);
    this.snapshot();
    this.project = p; this.active = 0; this.sels = []; this.draft = null; this.tool = "select";
    const n = p.levels.length;
    this.message = `${p.info.name || fileName} abierto: ${n} nivel${n > 1 ? "es" : ""}. Deshacer vuelve al proyecto anterior.`;
    this.changed();
    this.dirty = false;
    this.fitRequest?.();
    return true;
  }

  /** Cambia los datos del cajetín. */
  setInfo(patch: Partial<ProjectInfo>) { this.edit(() => { this.project.info = { ...this.project.info, ...patch }; }); }
  /** Cambia moneda, porcentajes o precios del presupuesto. */
  setBudget(patch: Partial<Project["budget"]>) { this.edit(() => { this.project.budget = { ...this.project.budget, ...patch }; }); }
  /** Pone un precio unitario propio a una partida; sin valor vuelve al de referencia. */
  setPrice(code: string, price: number | null) {
    const prices = { ...this.project.budget.prices };
    if (price === null) delete prices[code]; else prices[code] = price;
    this.setBudget({ prices });
  }

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
    this.message = `Nivel activo: ${this.model.name} (cota ${fmtLen(this.model.elev)}).`;
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
    // la cubierta de la planta más alta sube al nivel nuevo, vacío o copia, para seguir coronando el edificio
    const src = this.project.levels.find((l) => Math.abs(l.elev - top) < 1e-6)!, moved = src.roofs.length;
    if (moved) { lv.roofs = src.roofs; src.roofs = []; }
    this.project.levels.push(lv);
    this.project.levels.sort((a, b) => a.elev - b.elev);
    this.active = this.project.levels.indexOf(lv);
    this.sels = [];
    this.message = copy ? `${lv.name} creada como copia, a ${fmtLen(elev)}.${moved ? " La cubierta ha subido a la nueva planta." : ""}` : `${lv.name} creada a ${fmtLen(elev)}. El nivel de abajo se ve en gris como referencia.${moved ? " La cubierta ha subido a la nueva planta." : ""}`;
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
  selObj(): (Seg & { id: number }) | Model["openings"][number] | Model["rooms"][number] | Model["slabs"][number] | Model["roofs"][number] | Model["stairs"][number] | Model["decks"][number] | Model["columns"][number] | Model["furniture"][number] | Model["sections"][number] | Model["texts"][number] | Model["marks"][number] | Model["fixtures"][number] | Model["runs"][number] | Model["underlays"][number] | Model["hatches"][number] | null {
    if (!this.sel) return null;
    const m = this.model;
    const list = { wall: m.walls, line: m.lines, dim: m.dims, opening: m.openings, room: m.rooms, slab: m.slabs, roof: m.roofs, stair: m.stairs, deck: m.decks, column: m.columns, furniture: m.furniture, section: m.sections, text: m.texts, mark: m.marks, fixture: m.fixtures, run: m.runs, underlay: m.underlays, hatch: m.hatches }[this.sel.type] as { id: number }[];
    return (list.find((o) => o.id === this.sel!.id) as never) ?? null;
  }
  grips(): { k: 0 | 1 | "mid"; x: number; y: number }[] {
    const o = this.selObj();
    if (!o || !["wall", "line", "roof", "stair", "deck", "section"].includes(this.sel!.type)) return [];
    const s = o as Seg;
    const g: { k: 0 | 1 | "mid"; x: number; y: number }[] = [{ k: 0, x: s.x1, y: s.y1 }, { k: 1, x: s.x2, y: s.y2 }];
    if (this.sel!.type !== "roof" && this.sel!.type !== "deck") g.push({ k: "mid", x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
    return g;
  }
  prompt(): string {
    const n = this.draft ? this.draft.pts.length : 0, d = this.defaults;
    switch (this.tool) {
      case "select": return "Comando:";
      case "wall": return n ? "MURO  Siguiente punto o longitud [Enter termina]:" : "MURO  Precisa punto inicial:";
      case "line": return n ? "LÍNEA  Siguiente punto o longitud [Enter termina]:" : "LÍNEA  Precisa primer punto:";
      case "dim": return n === 0 ? "COTA  Origen de la primera línea de referencia:" : n === 1 ? "COTA  Origen de la segunda línea:" : "COTA  Posición de la línea de cota:";
      case "door": return `PUERTA  Haz clic sobre un muro (ancho ${fmtLen(d.doorW)}):`;
      case "window": return `VENTANA  Haz clic sobre un muro (ancho ${fmtLen(d.winW)}):`;
      case "room": return "HABITACIÓN  Haz clic dentro de un espacio cerrado por muros:";
      case "move": return n ? "MOVER  Precisa punto de destino:" : "MOVER  Precisa punto base:";
      case "copy": return n ? "COPIA  Precisa punto de destino [Esc termina]:" : "COPIA  Precisa punto base:";
      case "mirror": return n ? "SIMETRÍA  Segundo punto del eje:" : "SIMETRÍA  Primer punto del eje de simetría:";
      case "rotate": return n ? "GIRAR  Ángulo en grados o punto que lo indica:" : "GIRAR  Precisa punto base (centro del giro):";
      case "scale": return n === 0 ? "ESCALA  Precisa punto base:" : n === 1 ? "ESCALA  Factor de escala, o punto de referencia:" : "ESCALA  Punto de la nueva longitud:";
      case "array": return n ? `MATRIZ  Punto o distancia de la primera copia (${this.arrayN} elementos):` : `MATRIZ  Precisa punto base (${this.arrayN} elementos; teclea un número para cambiarlo):`;
      case "slab": return n < 3 ? `LOSA  Precisa ${n ? "siguiente" : "primer"} vértice del contorno:` : "LOSA  Siguiente vértice [Enter o clic en el primero cierra]:";
      case "roof": return n ? "CUBIERTA  Esquina opuesta del perímetro:" : `CUBIERTA  Primera esquina del perímetro (${ROOF_LABEL[d.roofKind].toLowerCase()}, ${d.pitch}°):`;
      case "column": return `COLUMNA  Punto del centro (${fmtLen(d.colW)} × ${fmtLen(d.colW)}):`;
      case "deck": return n ? "DECK  Esquina opuesta:" : `DECK  Primera esquina (${deckType(d.deckKind).name.toLowerCase()}):`;
      case "stair": return d.stairKind === "caracol" ? (n ? "ESCALERA  Radio exterior:" : "ESCALERA  Centro del caracol:") : n ? (sizedByTread(d.stairKind) ? "ESCALERA  Dirección de subida:" : "ESCALERA  Punto de llegada (o longitud):") : `ESCALERA  ${stairTypeName(d.stairKind)}: punto de arranque (ancho ${fmtLen(d.stairW)}):`;
      case "text": return this.textAt ? "TEXTO  Escribe el texto y pulsa Intro [Esc cancela]:" : `TEXTO  Punto de inserción (altura ${fmtLen(d.textSize)}):`;
      case "mark": return d.markKind === "nivel" ? `NIVEL  Punto del rótulo (${d.markLabel} ${fmtElev(this.model.elev)}):`
        : d.markKind === "detalle" ? (n === 0 ? "LLAMADA DE DETALLE  Centro de la zona que se detalla:" : n === 1 ? "LLAMADA DE DETALLE  Radio de la zona:" : "LLAMADA DE DETALLE  Posición del globo:")
        : this.noteAt ? "NOTA  Escribe el texto y pulsa Intro [Esc cancela]:" : n ? "NOTA  Punto donde va el texto:" : "NOTA  Punta de la flecha (lo que se señala):";
      case "hole": return n ? "HUECO  Esquina opuesta del hueco:" : "HUECO EN LOSA  Primera esquina del hueco (dentro de una losa):";
      case "section": return n ? "SECCIÓN  Punto final de la línea de corte (se mira a su izquierda):" : "SECCIÓN  Primer punto de la línea de corte:";
      case "fixture": return `${mepDef(d.mepKind).disc === "elec" ? "ELECTRICIDAD" : "PLOMERÍA"}  Haz clic para colocar ${mepDef(d.mepKind).label.toLowerCase()}${mepDef(d.mepKind).wall ? " (se pega al muro más cercano)" : ""} [R gira, Esc termina]:`;
      case "hatch": return n
        ? n < 3 ? "SOMBREADO  Siguiente vértice del contorno:" : "SOMBREADO  Siguiente vértice [Enter o clic en el primero cierra]:"
        : d.hatchMode === "room" ? `SOMBREADO  Haz clic dentro de una habitación (${hatchPattern(d.hatchPattern)?.label.toLowerCase()}) o en el primer vértice de un contorno:` : "SOMBREADO  Primer vértice del contorno:";
      case "run": return n < 2 ? `TUBERÍA  ${n ? "Siguiente" : "Primer"} punto (${systemDef(d.runSys).label.toLowerCase()}):` : "TUBERÍA  Siguiente punto [Enter termina]:";
      case "furniture": return `MOBILIARIO  Haz clic para colocar ${furnitureDef(d.furnKind).label.toLowerCase()} [R gira 90°, Esc termina]:`;
      case "trim": return "RECORTAR  Haz clic en el tramo de muro o línea que quieres quitar:";
      case "extend": return "ALARGAR  Haz clic cerca del extremo que quieres alargar:";
      case "break": return this.breakFrom
        ? "PARTIR  Segundo punto (se quita el tramo entre los dos) [Enter parte en el primero]:"
        : "PARTIR  Haz clic en el muro o línea, en el primer punto de corte:";
      case "calibrate": return n === 0 ? "CALIBRAR  Primer punto de una medida conocida:" : n === 1 ? "CALIBRAR  Segundo punto de la medida:" : `CALIBRAR  Mide ${imperial() ? fmtLen(this.calibDist()) : `${this.calibDist().toFixed(3)} m`} en el dibujo. Escribe la medida real${imperial() ? " (12'6\")" : " en metros"} y Enter:`;
      case "offset": return this.offsetTarget
        ? "DESFASE  Haz clic en el lado donde va la copia:"
        : `DESFASE  Elige un muro o línea, o teclea otra distancia <${fmtLen(this.offsetDist)}>:`;
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
      cotas: m.dims.length, anot: m.lines.length + m.texts.length + m.marks.length, hab: m.rooms.length, losas: m.slabs.length,
      cubiertas: m.roofs.length, escaleras: m.stairs.length, decks: m.decks.length, columnas: m.columns.length, mobiliario: m.furniture.length, secciones: m.sections.length,
      electricidad: m.fixtures.filter((f) => mepDef(f.kind).disc === "elec").length + m.runs.filter((r) => r.system === "elec").length,
      plomeria: m.fixtures.filter((f) => mepDef(f.kind).disc === "plum").length + m.runs.filter((r) => r.system !== "elec").length,
      calcos: m.underlays.length, sombreados: m.hatches.length, ejes: (({ x, y }) => x.length + y.length)(axes(m)),
    };
  }

  // ---------- vista ----------
  toS(x: number, y: number): Pt { return { x: x * this.view.scale + this.view.ox, y: y * this.view.scale + this.view.oy }; }
  toW(sx: number, sy: number): Pt { return { x: (sx - this.view.ox) / this.view.scale, y: (sy - this.view.oy) / this.view.scale }; }
  fit(width: number, height: number) {
    if (!width) return;
    // los calcos también cuentan al encuadrar en pantalla (en las láminas no se dibujan)
    // sin los restos sueltos lejanos que traen algunos DWG, que harían ver el plano diminuto
    const b = bounds(this.model, this.vis.calcos ? this.model.underlays.flatMap((u) => [{ x: u.x, y: u.y }, { x: u.x + u.w, y: u.y + u.h }]) : [], true);
    // los globos de los ejes quedan fuera del dibujo, arriba y a la izquierda
    if (this.vis.ejes && this.model.walls.length) {
      const a = sheetBounds(this.model);
      b.x0 = Math.min(b.x0, a.x0 - 2); b.y0 = Math.min(b.y0, a.y0 - 2); b.x1 = Math.max(b.x1, a.x1); b.y1 = Math.max(b.y1, a.y1);
    }
    const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(width / (b.x1 - b.x0), height / (b.y1 - b.y0))));
    this.view.scale = s;
    this.view.ox = width / 2 - ((b.x0 + b.x1) / 2) * s;
    this.view.oy = height / 2 - ((b.y0 + b.y1) / 2) * s;
    this.emit();
  }
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toW(sx, sy);
    this.view.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.view.scale * factor));
    this.view.ox = sx - before.x * this.view.scale;
    this.view.oy = sy - before.y * this.view.scale;
    this.emit();
  }
  pan(dx: number, dy: number) { this.view.ox += dx; this.view.oy += dy; this.emit(); }

  // ---------- herramientas ----------
  setTool(t: Tool) {
    if (MODIFY_TOOLS.includes(t) && !this.sels.length) {
      this.pendingModify = t; this.message = `${MODIFY_NAME[t]}: selecciona los elementos y pulsa Enter (o el botón otra vez).`; t = "select";
    } else this.pendingModify = null;
    if (MODIFY_TOOLS.includes(t) && this.sels.every((s) => s.type === "opening")) {
      this.message = "Las puertas y ventanas se mueven con su muro. Selecciona el muro."; t = "select";
    }
    this.tool = t; this.draft = null; this.openCand = null; this.box = null; this.offsetTarget = null; this.breakFrom = null; this.textAt = null; this.noteAt = null;
    if (t === "calibrate") {
      // sin selección, se calibra el único calco del nivel
      if (!this.sels.length && this.model.underlays.length === 1) this.sels = [{ type: "underlay", id: this.model.underlays[0].id }];
      if (!this.sels.length) { this.message = "Selecciona el calco o las líneas importadas que quieres poner a escala."; this.tool = "select"; }
    }
    if (t !== "select" && t !== "calibrate" && !MODIFY_TOOLS.includes(t)) this.sels = [];
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
    if (this.vis.anot) for (const mk of m.marks) if (markPts(mk).every((q) => inside(q.x, q.y)) || (crossing && inside(mk.x, mk.y))) found.push({ type: "mark", id: mk.id });
    if (this.vis.cotas) for (const d of m.dims) if (segHit(d)) found.push({ type: "dim", id: d.id });
    if (this.vis.calcos) for (const u of m.underlays) if (inside(u.x, u.y) && inside(u.x + u.w, u.y + u.h)) found.push({ type: "underlay", id: u.id });
    if (this.vis.hab) for (const r of m.rooms) {
      const c = this.rooms?.rooms.get(r.id), p = c?.ok ? { x: c.cx, y: c.cy } : r;
      if (inside(p.x, p.y)) found.push({ type: "room", id: r.id });
    }
    if (this.vis.losas) for (const sl of m.slabs) {
      const edgesOf = sl.pts.map((p, i) => { const q = sl.pts[(i + 1) % sl.pts.length]; return { x1: p.x, y1: p.y, x2: q.x, y2: q.y }; });
      if (crossing ? edgesOf.some(segHit) : sl.pts.every((p) => inside(p.x, p.y))) found.push({ type: "slab", id: sl.id });
    }
    if (this.vis.sombreados) for (const h of m.hatches) {
      const edgesOf = h.loops.flatMap((q) => q.map((p, i) => { const r = q[(i + 1) % q.length]; return { x1: p.x, y1: p.y, x2: r.x, y2: r.y }; }));
      if (crossing ? edgesOf.some(segHit) : h.loops.every((q) => q.every((p) => inside(p.x, p.y)))) found.push({ type: "hatch", id: h.id });
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
    if (this.vis.decks) for (const dk of m.decks) {
      const g = deckGeom(dk), c = g.edges.map(([a]) => a);
      if (crossing ? g.edges.some(([a, b]) => segHit({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) : c.every((p) => inside(p.x, p.y))) found.push({ type: "deck", id: dk.id });
    }
    if (this.vis.columnas) for (const c of m.columns) if (inside(c.x, c.y)) found.push({ type: "column", id: c.id });
    if (this.vis.secciones) for (const se of m.sections) if (segHit(se)) found.push({ type: "section", id: se.id });
    for (const f of m.fixtures) if (this.fixtureVisible(f) && inside(f.x, f.y)) found.push({ type: "fixture", id: f.id });
    for (const r of m.runs) {
      if (!this.vis[DISC_LAYER[discOfSystem(r.system)]]) continue;
      const segs = r.pts.slice(1).map((q, i) => ({ x1: r.pts[i].x, y1: r.pts[i].y, x2: q.x, y2: q.y }));
      if (crossing ? segs.some(segHit) : r.pts.every((q) => inside(q.x, q.y))) found.push({ type: "run", id: r.id });
    }
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
      // las tuberías se enganchan a los puntos de las instalaciones y a los vértices de otros recorridos
      if (this.tool === "run") {
        for (const f of this.model.fixtures) test(f.x, f.y, "end");
        for (const r of this.model.runs) for (const q of r.pts) test(q.x, q.y, "end");
      }
      if (r) return r;
    }
    let x = wx, y = wy;
    const orth = from && this.ortho && this.tool !== "roof" && this.tool !== "hole" && this.tool !== "mark" && (this.tool !== "dim" || this.draft?.pts.length === 1);
    if (orth) { if (Math.abs(x - from!.x) > Math.abs(y - from!.y)) y = from!.y; else x = from!.x; }
    // en métrico se redondea a 10 cm; en pies y pulgadas, a la pulgada
    const g = imperial() ? (v: number) => Math.round(v / IN) * IN : (v: number) => Math.round(v * 10) / 10;
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
    if (this.vis.anot) for (const mk of m.marks) { const d = markHit(mk, m.elev, { x: wx, y: wy }, this.view.scale); if (d < Infinity) take(d, { type: "mark", id: mk.id }); }
    if (this.vis.cotas) for (const d of m.dims) { const g = dimGeom(d), r = distSeg(wx, wy, g.a.x, g.a.y, g.b.x, g.b.y); if (r.d < tol * 2) take(r.d, { type: "dim", id: d.id }); }
    if (this.vis.secciones) for (const se of m.sections) { const r = distSeg(wx, wy, se.x1, se.y1, se.x2, se.y2); if (r.d < tol) take(r.d, { type: "section", id: se.id }); }
    if (this.vis.escaleras) for (const st of m.stairs) { const r = distSeg(wx, wy, st.x1, st.y1, st.x2, st.y2); if (r.d < st.width / 2 || pointInPolygon({ x: wx, y: wy }, stairGeom(st).outline)) take(Math.min(r.d, st.width / 2) + 0.2, { type: "stair", id: st.id }); }
    if (this.vis.columnas) for (const c of m.columns) if (Math.abs(wx - c.x) <= c.w / 2 + tol && Math.abs(wy - c.y) <= c.d / 2 + tol) take(0.01, { type: "column", id: c.id });
    // el deck se elige por dentro (detrás de muros y muebles) o por sus escalones
    if (this.vis.decks) for (const dk of m.decks) {
      const g = deckGeom(dk, m.walls), inBox = wx >= g.x0 && wx <= g.x1 && wy >= g.y0 && wy <= g.y1;
      const onSteps = g.steps?.treads.some((q) => pointInPolygon({ x: wx, y: wy }, q));
      if (inBox || onSteps) take(0.35, { type: "deck", id: dk.id });
    }
    for (const f of m.fixtures) if (this.fixtureVisible(f)) { const d = Math.hypot(wx - f.x, wy - f.y); if (d < 0.2 + tol) take(d * 0.5, { type: "fixture", id: f.id }); }
    for (const r of m.runs) if (this.vis[DISC_LAYER[discOfSystem(r.system)]]) for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], q = distSeg(wx, wy, a.x, a.y, b.x, b.y);
      if (q.d < tol) take(q.d + 0.25, { type: "run", id: r.id });
    }
    if (this.vis.mobiliario) for (const f of m.furniture)
      if (pointInPolygon({ x: wx, y: wy }, furnitureOutline(f))) take(0.15 + Math.hypot(wx - f.x, wy - f.y) * 0.01, { type: "furniture", id: f.id });
    // el calco se elige por su marco, para no estorbar al seleccionar lo que hay encima
    if (this.vis.calcos) for (const u of m.underlays) {
      const c = [{ x: u.x, y: u.y }, { x: u.x + u.w, y: u.y }, { x: u.x + u.w, y: u.y + u.h }, { x: u.x, y: u.y + u.h }];
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4], q = distSeg(wx, wy, a.x, a.y, b.x, b.y); if (q.d < tol) take(q.d + 0.3, { type: "underlay", id: u.id }); }
    }
    // el sombreado se elige por su borde o, si no hay nada más, por dentro
    if (this.vis.sombreados) for (const h of m.hatches) for (const q of h.loops) for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length], r = distSeg(wx, wy, a.x, a.y, b.x, b.y);
      if (r.d < tol) take(r.d + 0.1, { type: "hatch", id: h.id });
    }
    if (!best && this.vis.hab) { const r = roomAt(m, this.rooms, wx, wy); if (r) best = { type: "room", id: r.id }; }
    if (!best && this.vis.sombreados) for (const h of [...m.hatches].reverse()) if (inHatch({ x: wx, y: wy }, h.loops)) { best = { type: "hatch", id: h.id }; break; }
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
    if (this.tool === "calibrate") {
      const pts = this.draft?.pts ?? [];
      if (pts.length >= 2) { this.log("Escribe la medida real en metros y pulsa Enter."); return; }
      if (pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < 1e-6) return;
      this.draft = { pts: [...pts, p] }; this.emit();
      return;
    }
    if (this.tool === "wall" || this.tool === "line") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const last = this.draft.pts[this.draft.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) return;
      this.snapshot();
      if (this.tool === "wall") {
        const w: Wall = { id: nextId(m), type: this.defaults.wallType, x1: last.x, y1: last.y, x2: p.x, y2: p.y, thick: this.defaults.thick, height: this.defaults.height, attach: true };
        m.walls.push(w);
        this.message = `Muro de ${fmtLen(dir(w).L)} creado.`;
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
    if (this.tool === "hatch") {
      if (!this.draft) {
        if (this.defaults.hatchMode === "room" && this.hatchRoom(p)) return;
        this.draft = { pts: [p] }; this.emit(); return;
      }
      const first = this.draft.pts[0], last = this.draft.pts[this.draft.pts.length - 1];
      if (this.draft.pts.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) < 0.01) { this.closeHatch(); return; }
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) return;
      this.draft.pts.push(p); this.emit();
      return;
    }
    if (this.tool === "column") {
      this.snapshot();
      const id = nextId(m), w = this.defaults.colW;
      m.columns.push({ id, x: p.x, y: p.y, w, d: w });
      this.sels = [{ type: "column", id }];
      this.message = `Columna de ${fmtLen(w)} × ${fmtLen(w)} colocada; lleva su zapata aislada en la planta de cimentación. Haz clic para otra o Esc para terminar.`;
      this.changed();
      return;
    }
    if (this.tool === "deck") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const a = this.draft.pts[0];
      if (Math.abs(p.x - a.x) < 0.6 || Math.abs(p.y - a.y) < 0.6) { this.log("El deck necesita un rectángulo: elige la esquina opuesta."); return; }
      this.snapshot();
      const t = deckType(this.defaults.deckKind), id = nextId(m);
      const dk: Deck = { id, x1: a.x, y1: a.y, x2: p.x, y2: p.y, kind: t.id, height: t.height, rail: t.rail, stairW: 3 * FT, stairT: 0.5 };
      // escalones por defecto en el lado opuesto a la casa
      const g = deckGeom(dk, m.walls);
      dk.stairSide = g.house !== null ? (((g.house + 2) % 4) as 0 | 1 | 2 | 3) : 2;
      m.decks.push(dk);
      this.sels = [{ type: "deck", id }];
      this.message = `${t.name} creado${g.house !== null ? ", con ledger contra la casa" : ""}. Cambia el tipo, la altura, el barandal y los escalones en Propiedades.`;
      this.draft = null;
      this.changed();
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
        const st = this.newStair(a, p, id);
        m.stairs.push(st);
        const k = stairSteps(st);
        this.sels = [{ type: "stair", id }];
        this.message = `Escalera ${stairLabel(st.kind)} de ${k.n} peldaños: huella ${fmtSmall(k.tread)}, contrahuella ${fmtSmall(k.riser)}.` +
          (shortTread(st, k.tread) ? (st.kind === "caracol" ? " La huella es corta: agranda el radio." : " La huella es corta: alarga el tramo.") : "");
      }
      this.draft = null;
      this.changed();
      return;
    }
    if (this.tool === "mark") { this.placeMark(p); return; }
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
    if (this.tool === "fixture") {
      const c = this.fixtureCandidate(p), d = mepDef(this.defaults.mepKind);
      this.snapshot();
      let circuit = d.circuit;
      // las tomas de baños y cocinas van en su propio circuito
      if (d.kind === "enchufe" && /baño|bano|aseo|cocina/i.test(roomAt(m, this.rooms, c.x, c.y)?.name ?? "")) circuit = "C5";
      m.fixtures.push({ id: nextId(m), kind: d.kind, x: c.x, y: c.y, rot: c.rot, h: d.h, circuit });
      this.message = `${d.label} colocado${circuit ? ` (circuito ${circuit})` : ""}. Haz clic para otro o Esc para terminar.`;
      this.changed();
      return;
    }
    if (this.tool === "run") {
      if (!this.draft) { this.draft = { pts: [p] }; this.emit(); return; }
      const last = this.draft.pts[this.draft.pts.length - 1];
      // clic otra vez en el último punto: termina
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) { this.finishRun(); return; }
      this.draft.pts.push(p); this.emit();
      return;
    }
    if (this.tool === "furniture") {
      this.snapshot();
      const f = { id: nextId(m), kind: this.defaults.furnKind, ...this.furnitureCandidate(p) };
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

  /** Mover, copiar, simetría, girar, escala o matriz sobre toda la selección. */
  private modify(p: Pt) {
    if (!this.sels.length) { this.setTool("select"); return; }
    const pts = this.draft?.pts ?? [];
    if (!pts.length) { this.draft = { pts: [p] }; this.emit(); return; }
    const bp = pts[0];
    if (Math.hypot(p.x - bp.x, p.y - bp.y) < 1e-6) return;
    // escala por referencia: el segundo punto marca la longitud actual y el tercero la nueva
    if (this.tool === "scale" && pts.length === 1) { this.draft = { pts: [bp, p] }; this.emit(); return; }
    const xf = this.xformTo(p);
    if (xf) this.applyModify(xf);
  }

  /** Transformación que resulta de llevar el último punto a p con la herramienta actual. */
  private xformTo(p: Pt): Xform | null {
    const pts = this.draft?.pts ?? [], bp = pts[0];
    if (!bp || Math.hypot(p.x - bp.x, p.y - bp.y) < 1e-6) return null;
    switch (this.tool) {
      case "mirror": return reflection(bp, p);
      case "rotate": {
        let a = screenAngle(bp, p);
        if (this.ortho) a = Math.round(a / 90) * 90;
        return rotation(bp, Math.round(a * 100) / 100);
      }
      case "scale": {
        if (pts.length < 2) return null;
        const ref = Math.hypot(pts[1].x - bp.x, pts[1].y - bp.y);
        return ref > 1e-9 ? scaling(bp, Math.hypot(p.x - bp.x, p.y - bp.y) / ref) : null;
      }
      default: return translation(p.x - bp.x, p.y - bp.y);
    }
  }

  /** Aplica a la selección la transformación (o la matriz de copias). */
  private applyModify(xf: Xform) {
    if (!this.sels.length) return;
    this.snapshot();
    const tool = this.tool, copy = tool === "copy" || tool === "mirror" || tool === "array";
    let result: ReturnType<typeof transformElements> = [];
    if (tool === "array") {
      // copias a 1, 2… veces el desplazamiento
      const d = xf.map({ x: 0, y: 0 });
      for (let k = 1; k < this.arrayN; k++) result.push(...transformElements(this.model, this.sels, translation(d.x * k, d.y * k), true));
    } else result = transformElements(this.model, this.sels, xf, copy);
    // cada sección copiada lleva su propia letra
    if (copy) for (const r of result) if (r.type === "section") { const se = this.model.sections.find((x) => x.id === r.id); if (se) se.name = nextSectionName(this.project); }
    // y cada llamada de detalle copiada, su propio número
    if (copy) for (const r of result) if (r.type === "mark") { const mk = this.model.marks.find((x) => x.id === r.id); if (mk?.kind === "detalle") mk.label = nextDetailNum(this.project); }
    const n = this.sels.filter((r) => r.type !== "opening").length, el = `${n} elemento${n > 1 ? "s" : ""}`;
    if (tool === "copy") {
      this.message = `${result.length} copia${result.length > 1 ? "s" : ""} creada${result.length > 1 ? "s" : ""}. Haz clic para otra copia o Esc para terminar.`;
    } else {
      this.message = tool === "move" ? `${el} movido${n > 1 ? "s" : ""}.`
        : tool === "mirror" ? `Simetría creada con ${el}. Los originales se conservan.`
        : tool === "rotate" ? `${el} girado${n > 1 ? "s" : ""} ${fmtNum(xf.rot ?? 0)}°.${Math.abs((xf.rot ?? 0) % 90) > 1e-6 && this.sels.some((r) => r.type === "roof" || r.type === "deck" || r.type === "column") ? " Cubiertas, decks y columnas solo giran de 90 en 90°: de ellos se movió el centro." : ""}`
        : tool === "scale" ? `${el} a escala ${fmtNum(xf.map({ x: 1, y: 0 }).x - xf.map({ x: 0, y: 0 }).x)}. Los espesores de muro y las piezas de catálogo conservan su tamaño.`
        : `Matriz de ${this.arrayN} elementos: ${result.length} copias creadas.`;
      if (tool === "mirror") this.sels = result;
      this.draft = null; this.tool = "select";
    }
    this.changed();
  }

  /** Vistas previas de la transformación en curso (varias en la matriz). */
  previewXforms(): Xform[] {
    if (!MODIFY_TOOLS.includes(this.tool) || !this.draft?.pts.length || !this.mouse.in) return [];
    const xf = this.xformTo(this.snap ?? this.mouse);
    if (!xf) return [];
    if (this.tool !== "array") return [xf];
    const d = xf.map({ x: 0, y: 0 });
    return Array.from({ length: this.arrayN - 1 }, (_, i) => translation(d.x * (i + 1), d.y * (i + 1)));
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
    this.message = `${made.length} línea${made.length > 1 ? "s" : ""} convertida${made.length > 1 ? "s" : ""} en muros de ${fmtLen(this.defaults.thick)}.`;
    this.changed();
  }

  /** Importa un DXF como líneas de anotación y las deja seleccionadas. */
  importDxf(text: string, fileName = "DXF") { this.importSegments(parseDxf(text), fileName); }

  /** Pasa a líneas de anotación los segmentos leídos de un DXF, DWG o PDF y los deja seleccionados. */
  importSegments(r: CadImportResult, fileName: string, note = "") {
    const texts = r.texts ?? [], hatches = r.hatches ?? [];
    if (!r.segments.length && !texts.length && !hatches.length) { this.log(`${fileName}: no se encontraron líneas para importar.${note ? ` ${note}` : ""}`); return; }
    this.snapshot();
    const m = this.model, made: Selection[] = [];
    for (const s of r.segments) {
      const id = nextId(m);
      m.lines.push({ id, x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y });
      made.push({ type: "line", id });
    }
    for (const t of texts) {
      const id = nextId(m);
      m.texts.push({ id, x: t.x, y: t.y, text: t.text, size: t.size, rot: Math.round(t.rot * 1000) / 1000 });
      made.push({ type: "text", id });
    }
    for (const h of hatches) {
      const id = nextId(m);
      m.hatches.push(h.solid
        ? { id, loops: h.loops, pattern: "solido", scale: 1, angle: 0, name: h.name }
        : { id, loops: h.loops, pattern: IMPORTED, scale: 1, angle: 0, lines: h.lines, name: h.name });
      made.push({ type: "hatch", id });
    }
    this.vis.anot = true;
    if (hatches.length) this.vis.sombreados = true;
    this.tool = "select"; this.draft = null;
    this.sels = made;
    const skipped = Object.entries(r.skipped).map(([k, v]) => `${v} ${k}`).join(", ");
    const moved = r.moved ? ` Se trajo al origen (estaba a ${Math.round(r.moved.x)}, ${Math.round(r.moved.y)} m).` : "";
    this.message = `${fileName}: ${r.segments.length} líneas${texts.length ? `, ${texts.length} texto${texts.length > 1 ? "s" : ""}` : ""}${hatches.length ? `, ${hatches.length} sombreado${hatches.length > 1 ? "s" : ""}` : ""} importados (unidades: ${r.unitsLabel})${skipped ? `; sin importar: ${skipped}` : ""}.${moved}${note ? ` ${note}` : ""} Usa "Convertir en muros" para pasarlas a muros.`;
    this.changed();
    this.fitRequest?.();
  }

  // ---------- calcos ----------
  /** Imágenes de los calcos (data URL), fuera del proyecto para no copiarlas en cada paso de deshacer. */
  images = new Map<string, string>();
  /** Guarda la imagen en el navegador; si no cabe, avisa: se conserva al guardar el proyecto en archivo. */
  private storeImage(key: string, url: string) {
    this.images.set(key, url);
    try { this.storage?.setItem(`${STORAGE_KEY}:img:${key}`, url); return true; } catch { return false; }
  }
  private loadImages() {
    for (const l of this.project.levels) for (const u of l.underlays) {
      if (this.images.has(u.img)) continue;
      try { const v = this.storage?.getItem(`${STORAGE_KEY}:img:${u.img}`); if (v) this.images.set(u.img, v); } catch { /* sin almacenamiento */ }
    }
  }
  /** Imágenes que usa el proyecto, para guardarlas con él. */
  usedImages(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const l of this.project.levels) for (const u of l.underlays) { const v = this.images.get(u.img); if (v) out[u.img] = v; }
    return out;
  }

  /**
   * Pone una imagen como calco del nivel activo, con su esquina superior izquierda en (x, y) y w metros de ancho.
   * px es el tamaño de la imagen en píxeles, para conservar la proporción.
   */
  addUnderlay(url: string, name: string, px: { w: number; h: number }, w: number, at: Pt = { x: 0, y: 0 }) {
    const key = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const kept = this.storeImage(key, url);
    this.snapshot();
    const m = this.model, id = nextId(m), h = (w * px.h) / px.w;
    m.underlays.push({ id, img: key, name, x: at.x, y: at.y, w, h, opacity: 0.5 });
    this.vis.calcos = true;
    this.tool = "select"; this.draft = null;
    this.sels = [{ type: "underlay", id }];
    this.message = `${name}: calco de ${fmtLen(w)} × ${fmtLen(h)}. Para ponerlo a escala usa Calibrar (comando CAL) sobre una medida conocida.` +
      (kept ? "" : " Es demasiado grande para guardarlo en el navegador: guarda el proyecto en archivo para no perderlo.");
    this.changed();
    this.fitRequest?.();
  }

  /** Distancia entre los dos puntos marcados al calibrar. */
  calibDist() {
    const p = this.draft?.pts;
    return p && p.length > 1 ? Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) : 0;
  }

  /** Escala la selección (calcos, líneas importadas…) para que la medida marcada valga real metros. */
  calibrate(real: number) {
    const p = this.draft?.pts, d = this.calibDist();
    if (!p || d < 1e-6 || !(real > 0)) { this.log("Marca dos puntos de una medida conocida y escribe cuánto mide en metros."); return; }
    const k = real / d, xf = scaling(p[0], k), m = this.model;
    this.snapshot();
    for (const s of this.sels.filter((x) => x.type === "underlay")) {
      const u = m.underlays.find((x) => x.id === s.id);
      if (!u) continue;
      const c = xf.map(u);
      u.x = c.x; u.y = c.y; u.w *= k; u.h *= k;
    }
    transformElements(m, this.sels.filter((x) => x.type !== "underlay"), xf, false);
    this.draft = null; this.tool = "select";
    this.message = `Escala corregida: × ${k.toFixed(4)}. La medida marcada vale ahora ${fmtLen(real)}.`;
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
      style: door ? d.doorStyle : d.winStyle,
    });
    this.message = `Insertado: ${openingStyle({ kind: door ? "door" : "window", style: door ? d.doorStyle : d.winStyle }).name.toLowerCase()}.`;
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
    this.message = `${r.name}: ${fmtArea(c.area)}. Cambia el nombre en Propiedades.`;
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

  /** Cotas de fachada que se rehacen solas en cada cambio (se desactivan con Quitar cotas automáticas). */
  get liveDims() { return this.project.autoDims !== false; }
  setLiveDims(on: boolean) {
    this.edit(() => {
      this.project.autoDims = on;
      if (!on) for (const l of this.project.levels) l.dims = l.dims.filter((d) => !d.auto);
    });
    this.message = on ? "Las cotas de fachada se ponen y se rehacen solas mientras dibujas." : "Cotas automáticas desactivadas. Las tuyas se conservan.";
  }

  /** Rehace las cotas automáticas de cada nivel si han cambiado sus muros o huecos. */
  private refreshAutoDims() {
    for (const m of this.project.levels) {
      const want = autoDims(m), have = m.dims.filter((d) => d.auto);
      const key = (d: Omit<Dim, "id">) => [d.x1, d.y1, d.x2, d.y2, d.off].map((v) => v.toFixed(3)).join(",");
      if (want.length === have.length && want.every((d, i) => key(d) === key(have[i]))) continue;
      const gone = new Set(have.map((d) => d.id));
      m.dims = m.dims.filter((d) => !d.auto);
      for (const d of want) m.dims.push({ id: nextId(m), ...d });
      if (m === this.model) this.sels = this.sels.filter((x) => !(x.type === "dim" && gone.has(x.id)));
    }
  }

  /** Acota las fachadas del nivel: sustituye las cotas automáticas anteriores y respeta las dibujadas a mano. */
  autoDimension() {
    const m = this.model, dims = autoDims(m);
    if (!dims.length) { this.log("No hay muros de fachada paralelos a los ejes que acotar."); return; }
    this.snapshot();
    const removed = m.dims.filter((d) => d.auto).length;
    this.sels = this.sels.filter((x) => x.type !== "dim" || m.dims.some((d) => d.id === x.id && !d.auto));
    m.dims = m.dims.filter((d) => !d.auto);
    for (const d of dims) m.dims.push({ id: nextId(m), ...d });
    this.vis.cotas = true;
    this.project.autoDims = true;
    this.message = `${dims.length} cotas exteriores en cadena (huecos, muros y total)${removed ? ", sustituyendo las automáticas anteriores" : ""}. Las tuyas se conservan.`;
    this.changed();
  }

  /** Borra solo las cotas puestas por el acotado automático. */
  clearAutoDims() {
    const m = this.model, n = m.dims.filter((d) => d.auto).length;
    if (!n) return;
    this.snapshot();
    const gone = new Set(m.dims.filter((d) => d.auto).map((d) => d.id));
    m.dims = m.dims.filter((d) => !d.auto);
    this.sels = this.sels.filter((x) => !(x.type === "dim" && gone.has(x.id)));
    // si no, volverían en el siguiente cambio
    this.project.autoDims = false;
    this.message = `${n} cotas automáticas quitadas. Ya no se ponen solas; vuelve a activarlas en la herramienta Cota.`;
    this.changed();
  }

  // ---------- instalaciones ----------
  /** Lista de mecanismos y puntos de la biblioteca de instalaciones. */
  get mepCatalog() { return MEP; }
  /** ¿Se ve la capa de la disciplina de ese tipo de punto? */
  fixtureVisible(f: Pick<Model["fixtures"][number], "kind" | "circuit">) { return this.vis[DISC_LAYER[mepDef(f.kind).disc]] || (this.vis.electricidad && isElectric(f)); }
  /** Elige el mecanismo o punto que se colocará y activa la herramienta. */
  pickFixture(kind: string) {
    this.defaults.mepKind = kind;
    this.vis[DISC_LAYER[mepDef(kind).disc]] = true;
    if (this.tool !== "fixture") this.setTool("fixture"); else this.emit();
  }
  /** Abre la biblioteca de una disciplina, conservando el último tipo elegido si es de ella. */
  pickDiscipline(disc: Discipline) {
    this.pickFixture(mepDef(this.defaults.mepKind).disc === disc ? this.defaults.mepKind : mepOf(disc)[disc === "elec" ? 4 : 0].kind);
  }
  /** Elige la red de la tubería que se va a dibujar. */
  pickSystem(sys: RunSystem) {
    this.defaults.runSys = sys;
    this.vis[DISC_LAYER[discOfSystem(sys)]] = true;
    if (this.tool !== "run") this.setTool("run"); else this.emit();
  }
  /**
   * Dónde quedaría el punto bajo el cursor: los mecanismos de pared se pegan a la cara del muro
   * más cercano (a menos de 0,5 m) y se giran mirando a la habitación.
   */
  /**
   * Dónde queda la pieza que se va a colocar. Los gabinetes de cocina se pegan al muro más cercano con el
   * frente hacia el local y, a lo largo del muro, se alinean con los gabinetes vecinos y con las caras de
   * los muros que llegan a él; si no hay nada cerca, van de 5 en 5 cm.
   */
  furnitureCandidate(p: Pt): { x: number; y: number; rot: number } {
    const d = furnitureDef(this.defaults.furnKind), free = { x: p.x, y: p.y, rot: this.defaults.furnRot };
    if (!d.wall) return free;
    let best: { w: Wall; t: number; d: number } | null = null;
    for (const w of this.model.walls) { const r = distSeg(p.x, p.y, w.x1, w.y1, w.x2, w.y2); if (r.d < 0.9 + w.thick / 2 && (!best || r.d < best.d)) best = { w, t: r.t, d: r.d }; }
    if (!best) return free;
    const { w, t } = best, { L, ux, uy } = dir(w), nx = -uy, ny = ux;
    const sd = (p.x - w.x1) * nx + (p.y - w.y1) * ny >= 0 ? 1 : -1;
    // el +y local (frente), (-sen a, cos a), mira hacia fuera del muro
    let rot = (Math.round((Math.atan2(-nx * sd, ny * sd) * 180) / Math.PI) + 360) % 360;
    // los esquineros en L llevan el brazo hacia el extremo del muro más cercano (el rincón)
    if (d.kind === "cab-bc" || d.kind === "cab-wc") {
      const a = (rot * Math.PI) / 180, xToEnd2 = Math.cos(a) * ux + Math.sin(a) * uy > 0;
      if (xToEnd2 === t > 0.5) rot = (rot + 90) % 360;
    }
    const off = sd * (w.thick / 2 + d.d / 2), along = (q: Pt) => (q.x - w.x1) * ux + (q.y - w.y1) * uy;
    const across = (q: Pt) => (q.x - w.x1) * nx + (q.y - w.y1) * ny;
    const s0 = t * L, half = d.w / 2, stops: number[] = [];
    // vecinos del mismo muro y del mismo lado
    for (const f of this.model.furniture) {
      const fd = furnitureDef(f.kind);
      if (!fd.wall || Math.abs(across(f) - sd * (w.thick / 2 + fd.d / 2)) > 0.05) continue;
      const fa = (f.rot * Math.PI) / 180, fw = Math.abs(Math.cos(fa) * ux + Math.sin(fa) * uy) > 0.5 ? fd.w : fd.d;
      stops.push(along(f) - fw / 2 - half, along(f) + fw / 2 + half);
    }
    // caras de los muros que acometen (rincones)
    for (const o of this.model.walls) {
      if (o === w) continue;
      const od = dir(o);
      if (Math.abs(od.ux * ux + od.uy * uy) > 0.1) continue;
      const u = along({ x: o.x1, y: o.y1 }), ends = [across({ x: o.x1, y: o.y1 }), across({ x: o.x2, y: o.y2 })];
      if (Math.min(...ends) > w.thick / 2 + 0.05 && sd > 0 || Math.max(...ends) < -w.thick / 2 - 0.05 && sd < 0) continue;
      stops.push(u + o.thick / 2 + half, u - o.thick / 2 - half);
    }
    const near = stops.filter((s) => Math.abs(s - s0) < 0.2).sort((a, b) => Math.abs(a - s0) - Math.abs(b - s0))[0];
    const s = near ?? Math.round(s0 * 20) / 20;
    const q = loc(w, s, off);
    return { x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000, rot };
  }

  fixtureCandidate(p: Pt): { x: number; y: number; rot: number } {
    const d = mepDef(this.defaults.mepKind), free = { x: p.x, y: p.y, rot: this.defaults.mepRot };
    if (!d.wall) return free;
    let best: { w: Wall; t: number; d: number } | null = null;
    for (const w of this.model.walls) { const r = distSeg(p.x, p.y, w.x1, w.y1, w.x2, w.y2); if (r.d < 0.5 + w.thick / 2 && (!best || r.d < best.d)) best = { w, t: r.t, d: r.d }; }
    if (!best) return free;
    const { w, t } = best, { L, ux, uy } = dir(w), nx = -uy, ny = ux;
    const sd = (p.x - w.x1) * nx + (p.y - w.y1) * ny >= 0 ? 1 : -1;
    const s = Math.max(0.15, Math.min(L - 0.15, Math.round(t * L * 20) / 20));
    const q = loc(w, s, sd * (w.thick / 2 + 0.07));
    // el +y local del símbolo, (-sen a, cos a), debe apuntar hacia fuera del muro
    const rot = (Math.round((Math.atan2(-nx * sd, ny * sd) * 180) / Math.PI) + 360) % 360;
    return { x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000, rot };
  }
  /** Gira 90° el punto que se va a colocar (solo los que no van pegados a un muro). */
  rotateFixturePreview() { this.defaults.mepRot = (this.defaults.mepRot + 90) % 360; this.log(`Giro ${this.defaults.mepRot}°.`); }
  /** Termina la tubería en curso; con un solo punto no crea nada. */
  finishRun() {
    const pts = this.draft?.pts ?? [];
    this.draft = null;
    if (pts.length < 2) { this.log("Comando terminado."); return; }
    this.snapshot();
    const r = { id: nextId(this.model), system: this.defaults.runSys, pts: pts.map((q) => ({ x: q.x, y: q.y })) };
    this.model.runs.push(r);
    this.message = `${systemDef(r.system).label}: ${fmtLen(runLength(r))}. Haz clic para empezar otra o Esc para terminar.`;
    this.changed();
  }
  /** Coloca las tomas de agua y los desagües que les falten a los aparatos sanitarios del nivel. */
  placeSanitaryPoints() {
    const m = this.model, todo = m.furniture.flatMap(sanitaryPoints)
      .filter((q) => !m.fixtures.some((f) => f.kind === q.kind && Math.hypot(f.x - q.x, f.y - q.y) < 0.05));
    if (!todo.length) { this.log(m.furniture.some((f) => sanitaryPoints(f).length) ? "Todos los aparatos ya tienen sus tomas." : "No hay aparatos sanitarios en este nivel. Colócalos desde Mobiliario."); return; }
    this.snapshot();
    for (const q of todo) m.fixtures.push({ id: nextId(m), kind: q.kind, x: q.x, y: q.y, rot: 0, h: mepDef(q.kind).h, circuit: "" });
    this.vis.plomeria = true;
    this.message = `${todo.length} tomas y desagües colocados en los aparatos sanitarios.`;
    this.changed();
  }
  /** Pone un punto de luz en el centro de cada habitación cerrada que no tenga ninguno. */
  placeRoomLights() {
    const m = this.model, rg = this.rooms, made: { x: number; y: number }[] = [];
    for (const r of m.rooms) {
      const c = rg?.rooms.get(r.id);
      if (!c?.ok || m.fixtures.some((f) => f.kind === "luz" && roomAt(m, rg, f.x, f.y)?.id === r.id)) continue;
      made.push({ x: Math.round(c.cx * 100) / 100, y: Math.round(c.cy * 100) / 100 });
    }
    if (!made.length) { this.log(m.rooms.length ? "Todas las habitaciones tienen ya punto de luz." : "Define antes las habitaciones con la herramienta Habitación."); return; }
    this.snapshot();
    for (const q of made) m.fixtures.push({ id: nextId(m), kind: "luz", ...q, rot: 0, h: mepDef("luz").h, circuit: "C1" });
    this.vis.electricidad = true;
    this.message = `${made.length} puntos de luz colocados en el centro de las habitaciones.`;
    this.changed();
  }
  /** Sustituye los recorridos de la disciplina por un trazado automático esquemático. */
  routeDiscipline(disc: Discipline) {
    const m = this.model, runs = autoRoute(m.fixtures, disc);
    if (!runs.length) {
      this.log(disc === "elec" ? "Coloca un cuadro general y algún mecanismo para trazar los circuitos." : "Hace falta una llave de paso (o contador), un termo o una bajante, y tomas o desagües que unir.");
      return;
    }
    this.snapshot();
    m.runs = m.runs.filter((r) => discOfSystem(r.system) !== disc);
    for (const r of runs) m.runs.push({ id: nextId(m), ...r });
    this.vis[DISC_LAYER[disc]] = true;
    const L = runs.reduce((s, r) => s + runLength(r), 0);
    this.message = disc === "elec" ? `${runs.length} circuitos trazados desde el cuadro (${fmtLen(L)} de canalización).` : `${runs.length} recorridos de agua y saneamiento trazados (${fmtLen(L)}).`;
    this.changed();
  }

  /** Cierra el contorno de la losa en curso y la crea. */
  closeSlab() {
    const pts = this.draft?.pts ?? [];
    if (pts.length < 3) { this.log("Una losa necesita al menos 3 vértices."); return; }
    this.snapshot();
    const sl = { id: nextId(this.model), pts: pts.map((p) => ({ ...p })), thick: this.defaults.slabThick, holes: [] };
    this.model.slabs.push(sl);
    this.draft = null;
    this.sels = [{ type: "slab", id: sl.id }];
    this.message = `Losa de ${fmtArea(polygonArea(sl.pts))} y ${fmtLen(sl.thick)} de espesor creada.`;
    this.changed();
  }

  /** Sombreado nuevo con la trama, escala y giro por defecto; lo deja seleccionado. */
  private addHatch(loops: Pt[][], what: string) {
    const d = this.defaults, m = this.model;
    this.snapshot();
    const h = { id: nextId(m), loops: loops.map((q) => q.map((p) => ({ x: p.x, y: p.y }))), pattern: d.hatchPattern, scale: d.hatchScale, angle: d.hatchAngle };
    m.hatches.push(h);
    this.vis.sombreados = true;
    this.draft = null;
    this.sels = [{ type: "hatch", id: h.id }];
    this.message = `Sombreado ${hatchPattern(h.pattern)?.label.toLowerCase() ?? ""} de ${fmtArea(hatchArea(h.loops))} en ${what}. Haz clic en otra zona o Esc para terminar.`;
    this.changed();
  }
  /** Cierra el contorno del sombreado en curso. */
  closeHatch() {
    const pts = this.draft?.pts ?? [];
    if (pts.length < 3) { this.log("El contorno del sombreado necesita al menos 3 vértices."); return; }
    this.addHatch([pts], "el contorno dibujado");
  }
  /** Sombrea la habitación cerrada que hay bajo el punto (con sus islas). false si no hay ninguna. */
  private hatchRoom(p: Pt): boolean {
    const g = this.rooms, r = roomAt(this.model, g, p.x, p.y), c = r && g?.rooms.get(r.id);
    if (!g || !r || !c?.ok || !c.mask) return false;
    const loops = maskLoops(c.mask, g.nx, g.ny, g.x0, g.y0, RC);
    if (!loops.length) return false;
    this.addHatch(loops, r.name);
    return true;
  }

  finishDraft() {
    if (this.draft && this.tool === "run") { this.finishRun(); return; }
    if (this.draft && this.tool === "calibrate") { this.draft = null; this.setTool("select"); this.log("Calibración cancelada."); return; }
    if (this.draft) { this.draft = null; this.log("Comando terminado."); }
  }

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
      this.message = `Copia desfasada ${fmtLen(this.offsetDist)}. Elige otro elemento o pulsa Esc.`;
      this.changed();
      return;
    }
    if (this.tool === "break" && this.breakFrom) { this.doBreak(this.snap ?? p); return; }
    const target = this.pickLinear(p.x, p.y);
    if (!target) { this.log("Haz clic sobre un muro o una línea."); return; }
    if (this.tool === "break") { this.breakFrom = { r: target, p: this.snap ?? p }; this.hover = target; this.emit(); return; }
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

  /** Segundo punto de Partir; sin él, parte en el primero. */
  private doBreak(p2: Pt | null) {
    const b = this.breakFrom!;
    this.breakFrom = null;
    this.snapshot();
    const lost = breakLinear(this.model, b.r, b.p, p2);
    if (lost === null) { this.history.pop(); this.log("Ese punto es un extremo: no hay nada que partir."); return; }
    this.sels = [];
    const what = b.r.type === "wall" ? "Muro" : "Línea";
    this.message = lost < 0 ? `${what} quitado entero.` : `${what} partido${p2 && Math.hypot(p2.x - b.p.x, p2.y - b.p.y) > 1e-3 ? ", sin el tramo entre los dos puntos" : " en dos"}.` +
      (lost > 0 ? ` ${lost === 1 ? "Un hueco quedaba" : `${lost} huecos quedaban`} en el corte y se ha quitado.` : "");
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

  /** Guarda un ajuste visual (opacidad de un calco) sin paso de deshacer. */
  touch() { this.changed(); }

  /** Aplica un cambio de propiedad con deshacer. */
  edit(fn: () => void) { this.snapshot(); fn(); this.changed(); }

  escape() {
    if (this.pendingModify) { this.pendingModify = null; this.log("Comando cancelado."); return; }
    if (this.textAt) { this.textAt = null; this.log("Texto cancelado."); return; }
    if (this.noteAt) { this.noteAt = null; this.log("Nota cancelada."); return; }
    if (MODIFY_TOOLS.includes(this.tool)) { this.setTool("select"); return; }
    if (this.tool === "offset" && this.offsetTarget) { this.offsetTarget = null; this.emit(); return; }
    if (this.tool === "break" && this.breakFrom) { this.breakFrom = null; this.log("Partir cancelado."); return; }
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
    if (this.tool === "mark" && this.noteAt) {
      const txt = raw.trim();
      if (!txt) { this.noteAt = null; this.log("Nota cancelada."); return; }
      const m = this.model, { a, p } = this.noteAt, id = nextId(m);
      this.snapshot();
      m.marks.push({ id, kind: "nota", x: p.x, y: p.y, ax: a.x, ay: a.y, label: txt });
      this.noteAt = null;
      this.message = "Nota añadida. Haz clic para otra o Esc para terminar.";
      this.changed();
      return;
    }
    const s = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (!s) {
      if (this.tool === "break" && this.breakFrom) { this.doBreak(null); return; }
      if (this.pendingModify && this.tool === "select") { if (this.sels.length) this.setTool(this.pendingModify); else this.log("Selecciona al menos un elemento, o Esc para cancelar."); return; }
      if (this.draft && this.tool === "slab") { this.closeSlab(); return; }
      if (this.draft && this.tool === "hatch") { this.closeHatch(); return; }
      if (this.draft && this.tool !== "dim") { this.finishDraft(); return; }
      if (this.lastCmd) this.runCommand(this.lastCmd);
      return;
    }
    if (s === "CAL" || s === "CALIBRAR") { this.lastCmd = s; this.setTool("calibrate"); if (this.tool === "calibrate") this.log("Calibrar: marca dos puntos de una medida conocida."); return; }
    if (s === "AC" || s === "ACOTAR") { this.lastCmd = s; this.autoDimension(); return; }
    if (MARK_COMMANDS[s]) { this.lastCmd = s; this.pickMark(MARK_COMMANDS[s]); return; }
    if (DISC_COMMANDS[s]) { this.lastCmd = s; this.pickDiscipline(DISC_COMMANDS[s]); return; }
    if (COMMANDS[s]) { this.lastCmd = s; this.setTool(COMMANDS[s]); if (this.tool === COMMANDS[s]) this.log(`Comando: ${s}`); return; }
    if (s === "B" || s === "BORRAR") return this.deleteSel();
    if (s === "U" || s === "DESHACER") return this.undo();
    if (s === "Z" || s === "ZOOM" || s === "ENCUADRAR") { this.fitRequest?.(); return; }
    if (this.tool === "furniture" && (s === "R" || s === "GIRAR")) { this.rotateFurniturePreview(); return; }
    if (this.tool === "fixture" && (s === "R" || s === "GIRAR")) { this.rotateFixturePreview(); return; }
    // longitudes en las unidades del proyecto: 4.5, 30cm, 12'6", 6"…
    const len = parseLen(raw);
    if (this.tool === "calibrate" && (this.draft?.pts.length ?? 0) >= 2 && len > 0) { this.calibrate(len); return; }
    if (this.tool === "offset" && len > 0) {
      this.offsetDist = len; this.log(`Distancia de desfase: ${fmtLen(len)}.`);
      return;
    }
    const num = Number(raw.trim().replace(",", "."));
    if (this.tool === "rotate" && this.draft?.pts.length && Number.isFinite(num)) { this.applyModify(rotation(this.draft.pts[0], num)); return; }
    if (this.tool === "scale" && this.draft?.pts.length === 1 && Number.isFinite(num)) {
      if (num <= 0) { this.log("El factor de escala tiene que ser mayor que 0."); return; }
      this.applyModify(scaling(this.draft.pts[0], num)); return;
    }
    if (this.tool === "array" && !this.draft?.pts.length && Number.isInteger(num)) {
      if (num < 2 || num > 200) { this.log("La matriz lleva de 2 a 200 elementos."); return; }
      this.arrayN = num; this.log(`Matriz de ${num} elementos.`); return;
    }
    const lengthOk = this.draft?.pts.length &&
      (["wall", "line", "move", "copy", "mirror", "array", "slab", "stair", "run", "hatch"].includes(this.tool) || (this.tool === "dim" && this.draft.pts.length === 1));
    if (Number.isFinite(len) && lengthOk) {
      const L = len, from = this.draft!.pts[this.draft!.pts.length - 1], p = this.snap ?? this.mouse;
      let dx = p.x - from.x, dy = p.y - from.y;
      if (this.ortho) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const n = Math.hypot(dx, dy);
      if (!n) { this.log("Mueve el cursor para indicar la dirección."); return; }
      this.commitPoint({ x: from.x + (dx / n) * L, y: from.y + (dy / n) * L });
      return;
    }
    // coordenadas x;y o @dx;dy (en métrico también x,y)
    const mm = raw.trim().match(/^(@?)\s*([^;]+);([^;]+)$/) ?? (imperial() ? null : s.match(/^(@?)(-?\d*\.?\d+),(-?\d*\.?\d+)$/));
    const cx = mm ? parseLen(mm[2]) : NaN, cy = mm ? parseLen(mm[3]) : NaN;
    if (mm && Number.isFinite(cx) && Number.isFinite(cy) && !["select", "door", "window", "room"].includes(this.tool)) {
      let x = cx, y = -cy;
      if (mm[1] && this.draft?.pts.length) { const f = this.draft.pts[this.draft.pts.length - 1]; x += f.x; y += f.y; }
      this.commitPoint({ x, y });
      return;
    }
    this.log(`Comando desconocido: "${raw}". Prueba M, P, V, L, C, H, LO, CU, ES, MB, MO, CO, RO, SI, ESC, MA, TR, AL, DE, B (borrar), U (deshacer), Z (encuadrar).`);
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
    else if (PICK_TOOLS.includes(this.tool)) {
      this.hover = this.offsetTarget ?? this.breakFrom?.r ?? this.pickLinear(w.x, w.y);
      // los puntos de Partir se enganchan a extremos, intersecciones y cuadrícula
      if (this.tool === "break" && this.hover) this.snap = this.snapPoint(w.x, w.y);
    }
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
    this.message = `Hueco de ${fmtArea(polygonArea(ring))} abierto en la losa${lv === this.model ? "" : ` de ${lv.name}`}.`;
    return true;
  }

  /** Nivel inmediatamente por encima del activo, si lo hay. */
  levelAbove(): Level | null {
    const e = this.model.elev;
    return this.project.levels.filter((l) => l.elev > e + 1e-6).sort((a, b) => a.elev - b.elev)[0] ?? null;
  }

  /** Pasa una cubierta al nivel de arriba (p. ej. la de la planta baja tras añadir una planta encima). */
  moveRoofUp(id: number) {
    const r = this.model.roofs.find((x) => x.id === id), up = this.levelAbove();
    if (!r) return;
    if (!up) { this.log("No hay ningún nivel por encima. Crea uno con Nuevo nivel."); return; }
    this.snapshot();
    this.model.roofs = this.model.roofs.filter((x) => x !== r);
    // arranca sobre los muros del nivel de arriba si ya los tiene
    const hs = up.walls.map((w) => w.height);
    up.roofs.push({ ...r, id: nextId(up), base: hs.length ? Math.max(...hs) : r.base });
    this.sels = [];
    this.message = `Cubierta movida a ${up.name}.`;
    this.changed();
  }

  /** Cambia el tipo de un deck o porche; si el barandal era el del tipo anterior, toma el del nuevo. */
  setDeckKind(id: number, k: DeckKind) {
    const dk = this.model.decks.find((x) => x.id === id);
    if (!dk) return;
    this.edit(() => {
      const was = deckType(dk.kind), to = deckType(k);
      if (dk.rail === was.rail) dk.rail = to.rail;
      if (Math.abs(dk.height - was.height) < 1e-6) dk.height = to.height;
      dk.kind = k;
    });
    this.defaults.deckKind = k;
  }

  /** Escalera nueva con el tipo, el giro y el ancho por defecto; en la de caracol, b marca el radio exterior. */
  newStair(a: Pt, b: Pt, id: number): Stair {
    const d = this.defaults, kind = d.stairKind;
    const L = Math.hypot(b.x - a.x, b.y - a.y), width = kind === "caracol" ? Math.max(0.6, L - POST_R) : d.stairW;
    const st: Stair = { id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, width, height: this.floorToFloor(), kind, turn: d.stairTurn };
    // con descanso, en L y en U: el segundo clic da la dirección y el largo sale de una huella cómoda
    if (sizedByTread(kind) && L > 1e-6) {
      const len = stairLenFor(st, IDEAL_TREAD());
      st.x2 = a.x + ((b.x - a.x) / L) * len; st.y2 = a.y + ((b.y - a.y) / L) * len;
    }
    return st;
  }

  /** Abre en la losa del nivel de arriba un hueco con la huella de la escalera. */
  openAboveStair(id: number) {
    const st = this.model.stairs.find((x) => x.id === id), up = this.levelAbove();
    if (!st) return;
    if (!up) { this.log("No hay ningún nivel por encima. Crea uno con Nuevo nivel."); return; }
    const ring = stairGeom(st).outline;
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

  /** Cambia el revestimiento exterior de varios muros o el material de varias cubiertas (undefined lo quita). */
  setFinish(ids: number[], f: string | undefined, what: "wall" | "roof" = "wall") {
    const xs = what === "wall" ? this.model.walls.filter((w) => ids.includes(w.id)) : this.model.roofs.filter((r) => ids.includes(r.id));
    if (!xs.length) return;
    this.edit(() => { for (const x of xs) x.finish = f; });
    const name = finish(f)?.name.toLowerCase(), n = xs.length;
    this.message = what === "wall"
      ? `${n > 1 ? `${n} muros` : "Muro"}: ${name ? `revestimiento de ${name}` : "sin revestimiento"}.`
      : `${n > 1 ? `${n} cubiertas` : "Cubierta"}: ${name ?? "material por defecto"}.`;
    this.emit();
  }

  /**
   * Cambia el tipo de puertas o ventanas y les da sus medidas habituales: el alto y el antepecho siempre
   * (sin pasar del muro) y el ancho solo si cabe en el muro.
   */
  setOpeningStyle(ids: number[], style: string) {
    const ops = this.model.openings.filter((o) => ids.includes(o.id));
    if (!ops.length) return;
    let narrow = 0;
    this.edit(() => {
      for (const o of ops) {
        const w = this.wallById(o.wallId), st = openingStyle({ kind: o.kind, style });
        o.style = st.id;
        if (!w) continue;
        const sw = nice(st.w), sh = nice(st.h), ss = st.sill === undefined ? o.sill : nice(st.sill);
        if (fits(this.model, w, o.t, sw, o.id)) o.width = sw; else narrow++;
        o.sill = o.kind === "door" ? 0 : Math.min(ss, Math.max(0, w.height - sh - 0.05));
        o.height = Math.min(sh, w.height - o.sill - 0.05);
      }
    });
    const st = openingStyle({ kind: ops[0].kind, style });
    this.message = `${ops.length > 1 ? `${ops.length} huecos` : "Hueco"}: ${st.name.toLowerCase()}.${narrow ? " Su ancho habitual no cabe en el muro; se queda el que tenía." : ""}`;
    this.emit();
  }

  /** Tipo para las próximas puertas o ventanas, con sus medidas habituales. */
  setDefaultStyle(kind: "door" | "window", style: string) {
    const d = this.defaults, st = openingStyle({ kind, style });
    if (kind === "door") { d.doorStyle = st.id; d.doorW = nice(st.w); d.doorH = nice(st.h); }
    else { d.winStyle = st.id; d.winW = nice(st.w); d.winH = nice(st.h); d.sill = st.sill === undefined ? d.sill : nice(st.sill); }
    this.emit();
  }

  /** Herramienta de símbolos con el tipo elegido. */
  pickMark(kind: MarkKind) {
    this.setTool("mark");
    this.defaults.markKind = kind;
    this.message = MARK_KINDS.find((k) => k.id === kind)!.hint;
    this.emit();
  }

  /** Clic con la herramienta de símbolos: el nivel va de un clic; el detalle de tres y la nota de dos más el texto. */
  private placeMark(p: Pt) {
    const m = this.model, d = this.defaults;
    if (d.markKind === "nivel") {
      this.snapshot();
      const id = nextId(m);
      m.marks.push({ id, kind: "nivel", x: p.x, y: p.y, label: d.markLabel, dz: 0 });
      this.message = `Nivel ${levelText(m.marks[m.marks.length - 1], m.elev)} colocado. Haz clic para otro o Esc para terminar.`;
      this.changed();
      return;
    }
    if (this.noteAt) { this.log("Escribe el texto de la nota y pulsa Intro."); return; }
    const pts = [...(this.draft?.pts ?? []), p];
    if (pts.length > 1 && Math.hypot(p.x - pts[pts.length - 2].x, p.y - pts[pts.length - 2].y) < 1e-3) return;
    if (d.markKind === "nota") {
      if (pts.length < 2) { this.draft = { pts }; this.emit(); return; }
      this.noteAt = { a: pts[0], p };
      this.draft = null;
      this.message = "Escribe el texto de la nota en la línea de comandos y pulsa Intro.";
      this.emit();
      return;
    }
    if (pts.length < 3) { this.draft = { pts }; this.emit(); return; }
    const [c, e] = pts, r = Math.hypot(e.x - c.x, e.y - c.y);
    if (r < 0.1) { this.draft = null; this.log("La zona del detalle es demasiado chica: vuelve a marcar el centro y el radio."); return; }
    this.snapshot();
    const id = nextId(m), num = nextDetailNum(this.project);
    m.marks.push({ id, kind: "detalle", x: p.x, y: p.y, ax: c.x, ay: c.y, r, label: num, sheet: d.detailSheet });
    this.sels = [{ type: "mark", id }];
    this.draft = null;
    this.message = `Llamada de detalle ${num} creada. Escribe en Propiedades la lámina donde va el detalle.`;
    this.changed();
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
