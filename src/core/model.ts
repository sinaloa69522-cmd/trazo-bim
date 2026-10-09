// Modelo del proyecto. Coordenadas en metros; el eje Y crece hacia abajo en planta.

export interface Wall {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick: number;
  height: number;
  /** Si hay un nivel encima, la altura se ajusta para llegar a la cara inferior de su losa */
  attach: boolean;
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
}

/** Escalera recta: (x1,y1) arranque y (x2,y2) llegada, sobre el eje del tramo. */
export interface Stair {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  /** Desnivel que salva */
  height: number;
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
  furniture: Furniture[];
  sections: Section[];
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
}

export const defaultInfo = (): ProjectInfo => ({ name: "Vivienda unifamiliar", author: "", client: "", date: new Date().toISOString().slice(0, 10) });

export type LayerId = "muros" | "puertas" | "ventanas" | "cotas" | "anot" | "hab" | "losas" | "cubiertas" | "escaleras" | "mobiliario" | "secciones";

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
  { id: "anot", name: "A-ANOTACION", label: "Anotación", tok: "--anno" },
  { id: "hab", name: "A-HABITACIONES", label: "Habitaciones", tok: "--accent" },
  { id: "losas", name: "A-LOSAS", label: "Losas", tok: "--muted" },
  { id: "cubiertas", name: "A-CUBIERTAS", label: "Cubiertas", tok: "--door" },
  { id: "escaleras", name: "A-ESCALERAS", label: "Escaleras", tok: "--fg" },
  { id: "mobiliario", name: "A-MOBILIARIO", label: "Mobiliario", tok: "--anno" },
  { id: "secciones", name: "A-SECCIONES", label: "Secciones", tok: "--fg" },
];

export const emptyModel = (): Model => ({ walls: [], openings: [], lines: [], dims: [], rooms: [], slabs: [], roofs: [], stairs: [], furniture: [], sections: [], nid: 1 });

export const newLevel = (name: string, elev: number, content: Model = emptyModel()): Level => ({ ...content, name, elev });

export const emptyProject = (): Project => ({ levels: [newLevel("Planta baja", 0)], info: defaultInfo() });

export const nextId = (m: Model) => m.nid++;

export function cloneModel(m: Model): Model {
  return JSON.parse(JSON.stringify(m));
}

/** Acepta modelos guardados por versiones anteriores. */
export function normalizeModel(raw: unknown): Model {
  const m = { ...emptyModel(), ...(raw as Partial<Model>) };
  m.walls = (m.walls ?? []).map((w) => ({ ...w, attach: w.attach ?? true }));
  m.rooms = m.rooms ?? [];
  m.slabs = (m.slabs ?? []).map((s) => ({ ...s, holes: s.holes ?? [] }));
  m.roofs = m.roofs ?? [];
  m.stairs = m.stairs ?? [];
  m.furniture = m.furniture ?? [];
  m.sections = m.sections ?? [];
  return m;
}

/** Acepta proyectos guardados y también modelos de una sola planta de versiones anteriores. */
export function normalizeProject(raw: unknown): Project {
  const r = raw as Partial<Project> & Partial<Model>;
  const info = { ...defaultInfo(), ...(r?.info ?? {}) };
  if (Array.isArray(r?.levels) && r.levels.length)
    return { levels: r.levels.map((l, i) => ({ ...normalizeModel(l), name: l.name ?? `Nivel ${i}`, elev: l.elev ?? 0 })), info };
  return { levels: [newLevel("Planta baja", 0, normalizeModel(raw))], info };
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
  // corte transversal por el dormitorio y el estar, mirando al norte
  m.sections.push({ id: nextId(m), x1: -1.2, y1: 3, x2: 11.2, y2: 3, name: "A" });
  return { levels: [newLevel("Planta baja", 0, m)], info: defaultInfo() };
}

/** Vivienda de ejemplo de 10 x 7 m. */
export function sampleModel(): Model {
  const m = emptyModel();
  const W = (x1: number, y1: number, x2: number, y2: number, thick = 0.25) => {
    const w: Wall = { id: nextId(m), x1, y1, x2, y2, thick, height: 2.7, attach: true };
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
  m.dims.push(
    { id: nextId(m), x1: 0, y1: 0, x2: 10, y2: 0, off: -0.9 },
    { id: nextId(m), x1: 10, y1: 0, x2: 10, y2: 7, off: -0.9 },
    { id: nextId(m), x1: 0, y1: 0, x2: 6, y2: 0, off: -0.45 },
  );
  m.lines.push({ id: nextId(m), x1: -1.2, y1: 8.4, x2: 11.2, y2: 8.4 });
  m.rooms.push(
    { id: nextId(m), x: 3, y: 2, name: "Dormitorio" },
    { id: nextId(m), x: 3, y: 5.5, name: "Baño" },
    { id: nextId(m), x: 8, y: 3.5, name: "Estar-comedor" },
  );
  return m;
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
