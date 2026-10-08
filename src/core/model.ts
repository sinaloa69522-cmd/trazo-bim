// Modelo del proyecto. Coordenadas en metros; el eje Y crece hacia abajo en planta.

export interface Wall {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick: number;
  height: number;
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

export interface Model {
  walls: Wall[];
  openings: Opening[];
  lines: Line[];
  dims: Dim[];
  rooms: Room[];
  nid: number;
}

export type LayerId = "muros" | "puertas" | "ventanas" | "cotas" | "anot" | "hab";

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
];

export const emptyModel = (): Model => ({ walls: [], openings: [], lines: [], dims: [], rooms: [], nid: 1 });

export const nextId = (m: Model) => m.nid++;

export function cloneModel(m: Model): Model {
  return JSON.parse(JSON.stringify(m));
}

/** Acepta modelos guardados por versiones anteriores. */
export function normalizeModel(raw: unknown): Model {
  const m = { ...emptyModel(), ...(raw as Partial<Model>) };
  m.rooms = m.rooms ?? [];
  return m;
}

/** Vivienda de ejemplo de 10 x 7 m. */
export function sampleModel(): Model {
  const m = emptyModel();
  const W = (x1: number, y1: number, x2: number, y2: number, thick = 0.25) => {
    const w: Wall = { id: nextId(m), x1, y1, x2, y2, thick, height: 2.7 };
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
