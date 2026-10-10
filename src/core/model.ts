// Modelo del proyecto. Coordenadas en metros; el eje Y crece hacia abajo en planta.

import type { UnitSystem } from "./units";
import { defaultBudget, type BudgetSettings } from "./budget";
import type { PatLine } from "./hatch";
import type { FoundationKind } from "./foundation";
import { autoRoute, mepDef, sanitaryPoints } from "./mep";
import { typeForThick } from "./wallTypes";
import { autoDims } from "./autodim";

export interface Wall {
  id: number;
  /** Tipo del catálogo (wallTypes.ts) */
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick: number;
  height: number;
  /** Si hay un nivel encima, la altura se ajusta para llegar a la cara inferior de su losa */
  attach: boolean;
  /** Revestimiento exterior (finishes.ts); sin él, la fachada muestra el material del tipo */
  finish?: string;
}

export type OpeningKind = "door" | "window";

export interface Opening {
  id: number;
  wallId: number;
  /** Posición del centro a lo largo del muro, 0..1 */
  t: number;
  kind: OpeningKind;
  width: number;
  height: number;
  sill: number;
  flip: boolean;
  /** Tipo de puerta o ventana (openingStyles.ts); sin él, de una hoja / fija */
  style?: string;
}

export interface Line {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Dim extends Line {
  /** Desplazamiento perpendicular de la línea de cota */
  off: number;
  /** Creada por el acotado automático: se sustituye al volver a acotar */
  auto?: boolean;
}

export interface Room {
  id: number;
  /** Punto semilla dentro del espacio */
  x: number;
  y: number;
  name: string;
}

export interface Slab {
  id: number;
  /** Contorno cerrado, en orden */
  pts: { x: number; y: number }[];
  /** Espesor; la losa va por debajo de la cota del nivel */
  thick: number;
  /** Huecos (patinillos, escaleras) dentro del contorno */
  holes: { x: number; y: number }[][];
}

export type RoofKind = "flat" | "gable" | "hip";

/** Cubierta rectangular definida por dos esquinas opuestas del perímetro que cubre. */
export interface Roof {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: RoofKind;
  /** Pendiente en grados (no se usa en cubierta plana) */
  pitch: number;
  /** Vuelo del alero más allá del perímetro */
  overhang: number;
  /** Altura de arranque sobre la cota del nivel */
  base: number;
  thick: number;
  /** Material de cubierta (finishes.ts); sin él, teja cerámica en las inclinadas */
  finish?: string;
}

/** Forma de la escalera (ver core/stairs.ts). */
export type StairKind = "recta" | "descanso" | "L" | "U" | "caracol";

/**
 * Escalera: (x1,y1) arranque y (x2,y2) final del primer tramo con su descanso, sobre el eje.
 * En la de caracol, (x1,y1) es el centro y (x2,y2) marca dónde arranca.
 */
export interface Stair {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  /** Desnivel que salva */
  height: number;
  /** Sin él, recta */
  kind?: StairKind;
  /** Hacia dónde gira (L, U y caracol) visto en planta: 1 a la derecha del sentido de subida, -1 a la izquierda */
  turn?: 1 | -1;
}

/** Columna de concreto armado (C-1) en planta: centro y sección. */
export interface Column {
  id: number;
  x: number;
  y: number;
  /** Lado en x y lado en y de la sección */
  w: number;
  d: number;
}

export type DeckKind = "wood" | "composite" | "ground" | "covered" | "screened" | "stoop";
export type RailKind = "none" | "wood" | "metal" | "cable" | "glass" | "vinyl";

/** Deck o porche rectangular entre dos esquinas (decks.ts): tipo, altura del piso, barandal y escalones. */
export interface Deck {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: DeckKind;
  /** Altura de la cara superior del piso sobre el terreno */
  height: number;
  /** Pegado a la casa, su piso queda 1" bajo el de la casa (por defecto); false si la altura se fijó a mano */
  matchFloor?: boolean;
  rail: RailKind;
  /** Lado de los escalones (0 arriba, 1 derecha, 2 abajo, 3 izquierda en planta); sin valor: sin escalones */
  stairSide?: 0 | 1 | 2 | 3 | null;
  stairW?: number;
  /** Posición del centro de los escalones a lo largo de su lado (0 a 1) */
  stairT?: number;
}

/** Pieza de mobiliario o aparato sanitario de la biblioteca, colocada por su centro. */
export interface Furniture {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** Giro en grados, en sentido horario en planta */
  rot: number;
}

/**
 * Línea de corte de una sección. Se mira hacia la izquierda del sentido (x1,y1) → (x2,y2):
 * en el dibujo de la sección, x1 queda a la izquierda. El corte atraviesa todos los niveles.
 */
export interface Section {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Letra de la sección: A, B… */
  name: string;
}

/** Texto de anotación: (x, y) es el inicio de la línea base. */
export interface Text {
  id: number;
  x: number;
  y: number;
  text: string;
  /** Altura de letra en metros de modelo (0.25 m se lee bien a 1:100) */
  size: number;
  /** Giro en grados, en sentido antihorario */
  rot: number;
}

/** Mecanismo eléctrico o punto de fontanería (mep.ts), colocado por su centro. */
export interface Fixture {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** Giro en grados, como el mobiliario; el fondo del símbolo (-y) va contra el muro */
  rot: number;
  /** Altura de montaje sobre el suelo */
  h: number;
  /** Circuito eléctrico (C1, C2…); vacío en fontanería */
  circuit: string;
}

/** Red de una tubería o canalización. */
export type RunSystem = "elec" | "af" | "ac" | "san";

/** Recorrido de tubería o canalización: polilínea en planta. */
export interface Run {
  id: number;
  system: RunSystem;
  pts: { x: number; y: number }[];
}

/**
 * Calco: imagen de referencia (plano escaneado, PDF, foto) bajo el dibujo, como los subyacentes de Revit.
 * (x, y) es la esquina superior izquierda; la imagen se guarda aparte, en el almacén de imágenes del proyecto.
 */
export interface Underlay {
  id: number;
  /** Clave de la imagen en el almacén */
  img: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 */
  opacity: number;
}

/** Sombreado: una zona rellena con una trama (hatch.ts), como el SOMBREA de AutoCAD. */
export interface HatchRegion {
  id: number;
  /** Contornos cerrados; uno dentro de otro es una isla (relleno par-impar) */
  loops: { x: number; y: number }[][];
  /** Trama de la biblioteca, o "importado" si trae sus propias líneas */
  pattern: string;
  /** Escala y giro (grados, antihorario) de la trama de la biblioteca */
  scale: number;
  angle: number;
  /** Líneas de trama de un sombreado importado, ya colocadas en la planta */
  lines?: PatLine[];
  /** Nombre de la trama en el archivo de origen (ANSI31, AR-CONC…) */
  name?: string;
}

/** Contenido de un nivel (una planta). Los identificadores son únicos dentro del nivel. */
export interface Model {
  walls: Wall[];
  openings: Opening[];
  lines: Line[];
  dims: Dim[];
  rooms: Room[];
  slabs: Slab[];
  roofs: Roof[];
  stairs: Stair[];
  decks: Deck[];
  columns: Column[];
  furniture: Furniture[];
  sections: Section[];
  texts: Text[];
  fixtures: Fixture[];
  runs: Run[];
  underlays: Underlay[];
  hatches: HatchRegion[];
  nid: number;
}

export interface Level extends Model {
  name: string;
  /** Cota del suelo del nivel, en metros */
  elev: number;
}

/** Datos del cajetín de las láminas. */
export interface ProjectInfo {
  name: string;
  author: string;
  client: string;
  date: string;
}

export interface Project {
  levels: Level[];
  info: ProjectInfo;
  /** Moneda, porcentajes y precios propios del presupuesto */
  budget: BudgetSettings;
  /** Cómo se escriben las medidas; el modelo siempre va en metros. Sin valor: métrico. */
  units?: UnitSystem;
  /** Tipo de cimentación (foundation.ts); sin valor: losa sobre terreno con zapatas */
  foundation?: FoundationKind;
  /** false: las cotas de fachada no se rehacen solas al dibujar */
  autoDims?: boolean;
}

export const defaultInfo = (): ProjectInfo => ({ name: "Vivienda unifamiliar", author: "", client: "", date: new Date().toISOString().slice(0, 10) });

export type LayerId = "muros" | "puertas" | "ventanas" | "cotas" | "anot" | "hab" | "losas" | "cubiertas" | "escaleras" | "decks" | "columnas" | "mobiliario" | "secciones" | "electricidad" | "plomeria" | "calcos" | "sombreados" | "ejes";

export interface Layer {
  id: LayerId;
  /** Nombre de capa en DXF */
  name: string;
  label: string;
  /** Token CSS del color */
  tok: string;
}

export const LAYERS: Layer[] = [
  { id: "muros", name: "A-MUROS", label: "Muros", tok: "--wall" },
  { id: "puertas", name: "A-PUERTAS", label: "Puertas", tok: "--door" },
  { id: "ventanas", name: "A-VENTANAS", label: "Ventanas", tok: "--window" },
  { id: "cotas", name: "A-COTAS", label: "Cotas", tok: "--dim" },
  { id: "ejes", name: "A-EJES", label: "Ejes", tok: "--anno" },
  { id: "anot", name: "A-ANOTACION", label: "Anotación", tok: "--anno" },
  { id: "hab", name: "A-HABITACIONES", label: "Habitaciones", tok: "--accent" },
  { id: "sombreados", name: "A-SOMBREADOS", label: "Sombreados", tok: "--anno" },
  { id: "losas", name: "A-LOSAS", label: "Losas", tok: "--muted" },
  { id: "cubiertas", name: "A-CUBIERTAS", label: "Cubiertas", tok: "--door" },
  { id: "escaleras", name: "A-ESCALERAS", label: "Escaleras", tok: "--fg" },
  { id: "decks", name: "A-DECKS", label: "Decks y porches", tok: "--door" },
  { id: "columnas", name: "S-COLUMNAS", label: "Columnas", tok: "--wall" },
  { id: "mobiliario", name: "A-MOBILIARIO", label: "Mobiliario", tok: "--anno" },
  { id: "secciones", name: "A-SECCIONES", label: "Secciones", tok: "--fg" },
  { id: "electricidad", name: "E-ELECTRICIDAD", label: "Electricidad", tok: "--elec" },
  { id: "plomeria", name: "P-FONTANERIA", label: "Plomería", tok: "--plum" },
  { id: "calcos", name: "A-CALCOS", label: "Calcos", tok: "--muted" },
];

export const emptyModel = (): Model => ({ walls: [], openings: [], lines: [], dims: [], rooms: [], slabs: [], roofs: [], stairs: [], decks: [], columns: [], furniture: [], sections: [], texts: [], fixtures: [], runs: [], underlays: [], hatches: [], nid: 1 });

export const newLevel = (name: string, elev: number, content: Model = emptyModel()): Level => ({ ...content, name, elev });

export const emptyProject = (): Project => ({ levels: [newLevel("Planta baja", 0)], info: defaultInfo(), budget: defaultBudget() });

export const nextId = (m: Model) => m.nid++;

export function cloneModel(m: Model): Model {
  return JSON.parse(JSON.stringify(m));
}

/** Acepta modelos guardados por versiones anteriores. */
export function normalizeModel(raw: unknown): Model {
  const m = { ...emptyModel(), ...(raw as Partial<Model>) };
  m.walls = (m.walls ?? []).map((w) => ({ ...w, attach: w.attach ?? true, type: w.type ?? typeForThick(w.thick) }));
  m.rooms = m.rooms ?? [];
  m.slabs = (m.slabs ?? []).map((s) => ({ ...s, holes: s.holes ?? [] }));
  m.roofs = m.roofs ?? [];
  m.stairs = m.stairs ?? [];
  m.decks = m.decks ?? [];
  m.columns = m.columns ?? [];
  m.furniture = m.furniture ?? [];
  m.sections = m.sections ?? [];
  m.texts = m.texts ?? [];
  m.fixtures = m.fixtures ?? [];
  m.runs = m.runs ?? [];
  m.underlays = m.underlays ?? [];
  m.hatches = m.hatches ?? [];
  return m;
}

/** Acepta proyectos guardados y también modelos de una sola planta de versiones anteriores. */
export function normalizeProject(raw: unknown): Project {
  const r = raw as Partial<Project> & Partial<Model>;
  const info = { ...defaultInfo(), ...(r?.info ?? {}) };
  const budget = { ...defaultBudget(), ...(r?.budget ?? {}) };
  const units = { ...(r?.units === "imperial" ? { units: "imperial" as const } : {}), ...(r?.foundation ? { foundation: r.foundation } : {}) };
  if (Array.isArray(r?.levels) && r.levels.length) {
    const p: Project = { levels: r.levels.map((l, i) => ({ ...normalizeModel(l), name: l.name ?? `Nivel ${i}`, elev: l.elev ?? 0 })), info, budget, ...units };
    // proyectos guardados con la cubierta atrapada bajo una planta añadida después
    liftBuriedRoofs(p);
    return p;
  }
  return { levels: [newLevel("Planta baja", 0, normalizeModel(raw))], info, budget, ...units };
}

/** Vivienda de ejemplo: planta baja de 10 x 7 m con su losa y cubierta a dos aguas. */
export function sampleProject(): Project {
  const m = sampleModel();
  m.slabs.push({ id: nextId(m), pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }], thick: 0.2, holes: [] });
  m.furniture.push(
    { id: nextId(m), kind: "bed2", x: 3, y: 1.13, rot: 0 },
    { id: nextId(m), kind: "wardrobe", x: 5.0, y: 3.57, rot: 180 },
    { id: nextId(m), kind: "wc", x: 0.48, y: 6.4, rot: 270 },
    { id: nextId(m), kind: "basin", x: 3.2, y: 6.65, rot: 180 },
    { id: nextId(m), kind: "bath", x: 4.9, y: 6.5, rot: 0 },
    { id: nextId(m), kind: "sofa", x: 9.43, y: 2.2, rot: 90 },
    { id: nextId(m), kind: "dining", x: 7.6, y: 5.2, rot: 0 },
    { id: nextId(m), kind: "kitchen", x: 7.8, y: 0.43, rot: 0 },
  );
  m.roofs.push({ id: nextId(m), x1: 0, y1: 0, x2: 10, y2: 7, kind: "gable", pitch: 30, overhang: 0.5, base: 2.7, thick: 0.15 });
  sampleInstallations(m);
  // corte transversal por el dormitorio y el estar, mirando al norte
  m.sections.push({ id: nextId(m), x1: -1.2, y1: 3, x2: 11.2, y2: 3, name: "A" });
  return { levels: [newLevel("Planta baja", 0, m)], info: defaultInfo(), budget: defaultBudget() };
}

/** Vivienda de ejemplo de 10 x 7 m. */
export function sampleModel(): Model {
  const m = emptyModel();
  const W = (x1: number, y1: number, x2: number, y2: number, thick = 0.25) => {
    const w: Wall = { id: nextId(m), type: typeForThick(thick), x1, y1, x2, y2, thick, height: 2.7, attach: true };
    m.walls.push(w);
    return w;
  };
  const a = W(0, 0, 10, 0), b = W(10, 0, 10, 7), c = W(10, 7, 0, 7), d = W(0, 7, 0, 0);
  const e = W(6, 0, 6, 7, 0.12), f = W(0, 4, 6, 4, 0.12);
  const O = (w: Wall, t: number, kind: OpeningKind, width: number) =>
    m.openings.push({
      id: nextId(m), wallId: w.id, t, kind, width,
      height: kind === "door" ? 2.1 : 1.2, sill: kind === "door" ? 0 : 0.9, flip: false,
    });
  O(a, 0.28, "window", 1.6); O(a, 0.8, "window", 1.2);
  O(c, 0.82, "door", 1.0); O(c, 0.3, "window", 2.0);
  O(d, 0.27, "window", 1.0); O(b, 0.5, "window", 1.5);
  O(e, 0.72, "door", 0.8); O(f, 0.62, "door", 0.8);
  // las cotas de fachada las pone el acotado automático
  m.dims.push(...autoDims(m).map((d) => ({ id: nextId(m), ...d })));
  m.lines.push({ id: nextId(m), x1: -1.2, y1: 8.4, x2: 11.2, y2: 8.4 });
  m.rooms.push(
    { id: nextId(m), x: 3, y: 2, name: "Dormitorio" },
    { id: nextId(m), x: 3, y: 5.5, name: "Baño" },
    { id: nextId(m), x: 8, y: 3.5, name: "Estar-comedor" },
  );
  return m;
}

/** Instalaciones de la vivienda de ejemplo: mecanismos, puntos de agua y sus recorridos. */
function sampleInstallations(m: Model) {
  // rot: el fondo del símbolo mira al muro (0 norte, 90 este, 180 sur, 270 oeste)
  const F = (kind: string, x: number, y: number, rot = 0, circuit = mepDef(kind).circuit) =>
    m.fixtures.push({ id: nextId(m), kind, x, y, rot, h: mepDef(kind).h, circuit });
  F("cuadro", 9.805, 6.2, 90);
  F("luz", 3, 2); F("luz", 3, 5.5); F("luz", 8, 2); F("luz", 7.6, 5.2);
  F("aplique", 3.2, 6.805, 180);
  F("interruptor", 4.4, 3.87, 180); F("interruptor", 4.4, 4.13, 0); F("conmutador", 6.13, 5.8, 270); F("conmutador", 9.805, 4.6, 90);
  F("enchufe", 2.0, 0.195); F("enchufe", 4.0, 0.195); F("enchufe", 0.195, 2.6, 270); F("enchufe", 9.805, 3.6, 90); F("enchufe", 8.4, 6.805, 180);
  F("enchufe", 2.4, 6.805, 180, "C5"); F("enchufe", 6.8, 0.195, 0, "C5"); F("enchufe-fuerza", 9.3, 0.195, 0);
  for (const f of m.furniture) for (const q of sanitaryPoints(f)) F(q.kind, q.x, q.y);
  F("llave", 1.0, 4.3); F("termo", 6.13, 1.2, 270); F("bajante", 0.35, 4.35); F("bajante", 6.35, 0.35);
  for (const disc of ["elec", "plum"] as const) for (const r of autoRoute(m.fixtures, disc)) m.runs.push({ id: nextId(m), ...r });
}

/** Siguiente letra libre para una sección en todo el proyecto. */
export function nextSectionName(p: Project): string {
  const used = new Set(p.levels.flatMap((l) => l.sections.map((s) => s.name)));
  for (let i = 0; ; i++) {
    const n = i < 26 ? String.fromCharCode(65 + i) : `S${i - 25}`;
    if (!used.has(n)) return n;
  }
}

/**
 * Sube al nivel de encima las cubiertas que han quedado enterradas bajo él: las que tienen dentro de su planta
 * la mayoría de los muros del nivel de arriba (un porche o un tejadillo fuera de esa huella no se toca).
 * Arrancan sobre los muros de su nuevo nivel. Devuelve cuántas se han movido.
 */
export function liftBuriedRoofs(p: Project): number {
  const lv = [...p.levels].sort((a, b) => a.elev - b.elev);
  let n = 0;
  lv.forEach((l, i) => {
    const up = lv[i + 1];
    if (!up || !up.walls.length || !l.roofs.length) return;
    const keep = l.roofs.filter((r) => {
      const x0 = Math.min(r.x1, r.x2), x1 = Math.max(r.x1, r.x2), y0 = Math.min(r.y1, r.y2), y1 = Math.max(r.y1, r.y2), e = 0.05;
      const inside = up.walls.filter((w) => {
        const x = (w.x1 + w.x2) / 2, y = (w.y1 + w.y2) / 2;
        return x > x0 - e && x < x1 + e && y > y0 - e && y < y1 + e;
      }).length;
      // la cubierta corona la planta si su arranque queda por encima del nivel de arriba
      const buried = inside * 2 > up.walls.length && l.elev + r.base < up.elev + 0.5;
      if (buried) { up.roofs.push({ ...r, id: nextId(up), base: Math.max(...up.walls.map((w) => w.height)) }); n++; }
      return !buried;
    });
    l.roofs = keep;
  });
  return n;
}

/**
 * Ajusta la altura de los muros enlazados al nivel de encima para que lleguen a la cara inferior
 * de la losa que tienen encima (o al nivel, si no quedan enteros bajo una losa). En el último nivel no cambia nada.
 * Devuelve cuántos muros han cambiado.
 */
export function attachWalls(p: Project): number {
  const lv = [...p.levels].sort((a, b) => a.elev - b.elev);
  let n = 0;
  lv.forEach((l, i) => {
    const up = lv[i + 1];
    if (!up) return;
    for (const w of l.walls) {
      if (!w.attach) continue;
      // muestras en el eje y a cada lado: un muro de fachada (con el eje en el borde de la losa) no queda
      // entero bajo ella y sube hasta el nivel, para que la fachada sea continua
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, nx = -(w.y2 - w.y1) / L, ny = (w.x2 - w.x1) / L, o = w.thick / 2 - 0.01;
      const probes = [0, o, -o].map((k) => ({ x: (w.x1 + w.x2) / 2 + nx * k, y: (w.y1 + w.y2) / 2 + ny * k }));
      const over = up.slabs.filter((s) => probes.every((q) => inPoly(q, s.pts) && !s.holes.some((h) => inPoly(q, h))));
      const h = Math.round((up.elev - l.elev - Math.max(0, ...over.map((s) => s.thick))) * 1000) / 1000;
      if (h > 0.5 && Math.abs(h - w.height) > 1e-6) { w.height = h; n++; }
    }
  });
  return n;
}

function inPoly(p: { x: number; y: number }, poly: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
