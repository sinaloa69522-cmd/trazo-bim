// Plantillas de vivienda para empezar un proyecto: muros, puertas, ventanas, espacios, mobiliario,
// losa, cubierta, cotas, un corte e instalaciones básicas. Todo se puede editar después.

import { allAutoDims } from "./autodim";
import { defaultBudget } from "./budget";
import { autoRoute, mepDef, sanitaryPoints } from "./mep";
import { defaultInfo, emptyModel, newLevel, nextId, type Model, type OpeningKind, type Project, type RoofKind, type Wall } from "./model";
import { typeForThick } from "./wallTypes";

export interface HouseTemplate {
  id: string;
  name: string;
  /** Una línea: medidas, superficie y espacios */
  desc: string;
  build(): Project;
}

const EXT = 0.25, INT = 0.12;

/** Ayudantes para dibujar una planta a mano: muros, huecos (por distancia desde el arranque del muro), espacios y muebles. */
function plan() {
  const m = emptyModel();
  const W = (x1: number, y1: number, x2: number, y2: number, thick = INT) => {
    const w: Wall = { id: nextId(m), type: typeForThick(thick), x1, y1, x2, y2, thick, height: 2.7, attach: true };
    m.walls.push(w);
    return w;
  };
  const O = (w: Wall, s: number, kind: OpeningKind, width: number, opt: { sill?: number; height?: number } = {}) => {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    m.openings.push({
      id: nextId(m), wallId: w.id, t: s / L, kind, width,
      height: opt.height ?? (kind === "door" ? 2.1 : 1.2), sill: opt.sill ?? (kind === "door" ? 0 : 0.9), flip: false,
    });
  };
  const R = (x: number, y: number, name: string) => m.rooms.push({ id: nextId(m), x, y, name });
  /** rot: hacia dónde da el respaldo del mueble (0 norte, 90 este, 180 sur, 270 oeste) */
  const F = (kind: string, x: number, y: number, rot = 0) => m.furniture.push({ id: nextId(m), kind, x, y, rot });
  return { m, W, O, R, F };
}

/** Cierra la planta: losa y cubierta sobre el rectángulo, cotas, un corte e instalaciones básicas. */
function finish(m: Model, w: number, d: number, roof: RoofKind, cutY: number, panel: { x: number; y: number; rot: number }): Project {
  m.slabs.push({ id: nextId(m), pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }], thick: 0.2, holes: [] });
  m.roofs.push({ id: nextId(m), x1: 0, y1: 0, x2: w, y2: d, kind: roof, pitch: roof === "flat" ? 2 : 30, overhang: roof === "flat" ? 0 : 0.5, base: 2.7, thick: 0.15 });
  m.sections.push({ id: nextId(m), x1: -1.2, y1: cutY, x2: w + 1.2, y2: cutY, name: "A" });
  m.dims.push(...allAutoDims(m).map((q) => ({ id: nextId(m), ...q })));
  // instalaciones: un punto de luz por espacio, las tomas de los muebles sanitarios y el cuadro junto a la entrada
  const Fx = (kind: string, x: number, y: number, rot = 0) => m.fixtures.push({ id: nextId(m), kind, x, y, rot, h: mepDef(kind).h, circuit: mepDef(kind).circuit });
  Fx("cuadro", panel.x, panel.y, panel.rot);
  for (const r of m.rooms) Fx("luz", r.x, r.y);
  for (const f of m.furniture) for (const q of sanitaryPoints(f)) Fx(q.kind, q.x, q.y);
  for (const disc of ["elec", "plum"] as const) for (const r of autoRoute(m.fixtures, disc)) m.runs.push({ id: nextId(m), ...r });
  return { levels: [newLevel("Planta baja", 0, m)], info: defaultInfo(), budget: defaultBudget() };
}

/** 8 × 9 m: dos recámaras al norte, baño, y sala-comedor-cocina abierta al sur. */
function twoBed(): Project {
  const { m, W, O, R, F } = plan();
  const a = W(0, 0, 8, 0, EXT), b = W(8, 0, 8, 9, EXT), c = W(8, 9, 0, 9, EXT), d = W(0, 9, 0, 0, EXT);
  const h = W(0, 3.6, 8, 3.6), v = W(4, 0, 4, 3.6), bw = W(2.4, 3.6, 2.4, 5.4);
  W(0, 5.4, 2.4, 5.4);
  O(a, 2, "window", 1.5); O(a, 6, "window", 1.5);
  O(h, 3.35, "door", 0.8); O(h, 4.6, "door", 0.8);
  O(bw, 1.2, "door", 0.7);
  O(d, 4.5, "window", 0.6, { sill: 1.5, height: 0.6 }); O(d, 1.8, "window", 1.5);
  O(c, 5, "door", 1.0); O(c, 6.6, "window", 1.8);
  O(b, 7.2, "window", 1.2);
  void v;
  R(2, 1.8, "Recámara 1"); R(6, 1.8, "Recámara 2"); R(1.2, 4.5, "Baño"); R(5, 7, "Sala, comedor y cocina");
  F("bed2", 2, 1.13); F("wardrobe", 0.43, 2.6, 270);
  F("bed2", 6, 1.13); F("wardrobe", 7.57, 2.6, 90);
  F("wc", 0.48, 4.0, 270); F("basin", 1.0, 5.12, 180); F("shower", 1.89, 4.11);
  F("sofa", 0.58, 7.2, 270); F("dining", 3.6, 7.2); F("kitchen", 7.57, 7.0, 90); F("fridge", 7.52, 8.4, 90);
  return finish(m, 8, 9, "gable", 1.8, { x: 7.805, y: 5.0, rot: 90 });
}

/** 10 × 10 m: tres recámaras, dos baños, pasillo y estancia abierta con cocina. */
function threeBed(): Project {
  const { m, W, O, R, F } = plan();
  const a = W(0, 0, 10, 0, EXT), b = W(10, 0, 10, 10, EXT), c = W(10, 10, 0, 10, EXT), d = W(0, 10, 0, 0, EXT);
  const h = W(0, 3.6, 10, 3.6);
  W(3.4, 0, 3.4, 3.6); W(6.8, 0, 6.8, 3.6);
  const b1 = W(2.4, 3.6, 2.4, 5.6), b2 = W(7.8, 3.6, 7.8, 5.6);
  W(0, 5.6, 2.4, 5.6); W(7.8, 5.6, 10, 5.6);
  O(a, 1.7, "window", 1.5); O(a, 5.1, "window", 1.5); O(a, 8.4, "window", 1.5);
  O(h, 2.9, "door", 0.7); O(h, 4.0, "door", 0.8); O(h, 7.3, "door", 0.8);
  O(b1, 1.0, "door", 0.7); O(b2, 1.0, "door", 0.7);
  O(d, 5.4, "window", 0.6, { sill: 1.5, height: 0.6 }); O(d, 2.2, "window", 1.8);
  O(b, 4.6, "window", 0.6, { sill: 1.5, height: 0.6 }); O(b, 7.4, "window", 1.2);
  O(c, 5, "door", 1.0); O(c, 7.5, "window", 2.0); O(c, 1.6, "window", 1.2);
  R(1.7, 1.8, "Recámara 1"); R(5.1, 1.8, "Recámara 2"); R(8.4, 1.8, "Recámara principal");
  R(1.2, 4.6, "Baño 1"); R(8.9, 4.6, "Baño 2"); R(5, 8, "Sala, comedor y cocina");
  F("bed1", 1.7, 1.13); F("wardrobe", 0.43, 2.7, 270);
  F("bed1", 5.1, 1.13); F("wardrobe", 6.44, 2.7, 90);
  F("bed2", 8.4, 1.13); F("wardrobe", 9.57, 2.7, 90);
  F("wc", 0.48, 4.0, 270); F("basin", 1.2, 5.32, 180); F("shower", 1.89, 4.11);
  F("wc", 9.52, 4.0, 90); F("basin", 8.8, 5.32, 180); F("shower", 8.31, 4.11);
  F("sofa", 0.58, 7.8, 270); F("dining", 4.0, 7.8); F("kitchen", 9.57, 7.4, 90); F("fridge", 9.52, 9.4, 90);
  return finish(m, 10, 10, "hip", 1.8, { x: 9.805, y: 6.2, rot: 90 });
}

/** 6 × 12 m, para lote angosto: dos recámaras al fondo, baño, cocina-comedor y sala al frente. */
function narrowTwoBed(): Project {
  const { m, W, O, R, F } = plan();
  const a = W(0, 0, 6, 0, EXT), b = W(6, 0, 6, 12, EXT), c = W(6, 12, 0, 12, EXT), d = W(0, 12, 0, 0, EXT);
  const h = W(0, 3.4, 6, 3.4);
  W(3.2, 0, 3.2, 3.4);
  const bw = W(2.4, 3.4, 2.4, 5.4);
  W(0, 5.4, 2.4, 5.4);
  O(a, 1.6, "window", 1.2); O(a, 4.6, "window", 1.2);
  O(h, 2.8, "door", 0.7); O(h, 3.7, "door", 0.8);
  O(bw, 1.0, "door", 0.7);
  O(d, 7.6, "window", 0.6, { sill: 1.5, height: 0.6 }); O(d, 5.0, "window", 1.2);
  O(c, 1.5, "door", 1.0); O(c, 4.0, "window", 2.0);
  O(b, 10, "window", 1.5);
  R(1.6, 1.7, "Recámara 1"); R(4.6, 1.7, "Recámara 2"); R(1.2, 4.4, "Baño"); R(3, 9, "Sala, comedor y cocina");
  F("bed2", 1.6, 1.13); F("bed1", 4.6, 1.13);
  F("wc", 0.48, 3.85, 270); F("basin", 1.2, 5.12, 180); F("shower", 1.89, 3.91);
  F("kitchen", 0.43, 7.0, 270); F("fridge", 0.48, 8.6, 270); F("dining", 3.4, 7.0); F("sofa", 5.43, 10, 90);
  return finish(m, 6, 12, "gable", 1.7, { x: 5.805, y: 6.0, rot: 90 });
}

export const TEMPLATES: HouseTemplate[] = [
  { id: "2rec", name: "Casa de 2 recámaras", desc: "8 × 9 m · 72 m² · 2 recámaras, 1 baño, sala-comedor-cocina abierta", build: twoBed },
  { id: "3rec", name: "Casa de 3 recámaras", desc: "10 × 10 m · 100 m² · 3 recámaras, 2 baños, estancia abierta con cocina", build: threeBed },
  { id: "angosta", name: "Casa en lote angosto", desc: "6 × 12 m · 72 m² · 2 recámaras, 1 baño, cocina-comedor y sala", build: narrowTwoBed },
];
