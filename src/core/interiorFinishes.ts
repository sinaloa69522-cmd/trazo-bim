// Acabados interiores de cada espacio (piso, muros y plafón) para el plano y la tabla de acabados.
// Sin elegir, se proponen según el nombre del espacio (baño, cocina, cochera…).

import type { Level, Room } from "./model";
import { computeRooms, RC } from "./rooms";

export type FinishPart = "floor" | "wall" | "ceiling";

export interface InteriorFinish {
  id: string;
  /** Clave del plano: P-1 (piso), M-1 (muro), C-1 (plafón) */
  code: string;
  name: string;
  /** Especificación corta para la tabla */
  spec: string;
  color: string;
}

export const FLOORS: InteriorFinish[] = [
  { id: "porcelanato", code: "P-1", name: "Porcelanato 60 × 60", spec: "Porcelanato rectificado 60 × 60 cm sobre firme, pegado con adhesivo, junta de 2 mm", color: "#d8d2c4" },
  { id: "ceramica", code: "P-2", name: "Loseta cerámica 45 × 45", spec: "Loseta cerámica 45 × 45 cm, adhesivo y boquilla a juego", color: "#d6c3a5" },
  { id: "antiderrapante", code: "P-3", name: "Loseta antiderrapante", spec: "Loseta cerámica antiderrapante 33 × 33 cm para zonas húmedas", color: "#b9c4c8" },
  { id: "laminado", code: "P-4", name: "Piso laminado de madera", spec: "Piso laminado 8 mm sobre bajo alfombra de espuma, zoclo de MDF", color: "#c49a6c" },
  { id: "pulido", code: "P-5", name: "Concreto pulido", spec: "Firme de concreto con acabado pulido y sellador acrílico", color: "#b3b0aa" },
  { id: "marmol", code: "P-6", name: "Mármol", spec: "Mármol 40 × 40 cm pulido y abrillantado", color: "#e9e4dc" },
];
export const WALLS: InteriorFinish[] = [
  { id: "yeso-pintura", code: "M-1", name: "Yeso y pintura vinílica", spec: "Aplanado de yeso a regla, sellador y dos manos de pintura vinílica", color: "#f1ede4" },
  { id: "azulejo", code: "M-2", name: "Azulejo hasta 2.10 m", spec: "Azulejo cerámico 30 × 60 cm hasta 2.10 m, arriba yeso y pintura de esmalte", color: "#c9dbe0" },
  { id: "mortero-pintura", code: "M-3", name: "Mortero y pintura", spec: "Aplanado cemento-arena 1:4 acabado fino y pintura vinílica", color: "#e3ddd2" },
  { id: "aparente", code: "M-4", name: "Block aparente", spec: "Muro aparente junteado, sellador transparente", color: "#c2bdb4" },
];
export const CEILINGS: InteriorFinish[] = [
  { id: "yeso", code: "C-1", name: "Yeso y pintura", spec: "Aplanado de yeso en losa y dos manos de pintura vinílica blanca", color: "#f6f4ef" },
  { id: "tablaroca", code: "C-2", name: "Plafón de tablaroca", spec: "Plafón corrido de tablaroca 12.7 mm sobre canaleta, pasta y pintura", color: "#efefea" },
  { id: "esmalte", code: "C-3", name: "Yeso con pintura de esmalte", spec: "Yeso en losa con pintura de esmalte, para zonas húmedas", color: "#eef3f4" },
  { id: "aparente", code: "C-4", name: "Concreto aparente", spec: "Losa aparente con sellador", color: "#c9c6c0" },
];

export const FINISH_LISTS: Record<FinishPart, InteriorFinish[]> = { floor: FLOORS, wall: WALLS, ceiling: CEILINGS };
export const PART_LABEL: Record<FinishPart, string> = { floor: "Piso", wall: "Muros", ceiling: "Plafón" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Acabado propuesto según el tipo de espacio. */
export function defaultFinish(name: string, part: FinishPart): string {
  const n = norm(name);
  const wet = /bano|wc|sanitario|lavado|servicio|regadera/.test(n), kitchen = /cocina/.test(n), garage = /cochera|garage|garaje|estacionamiento|bodega|patio/.test(n);
  if (part === "floor") return wet ? "antiderrapante" : garage ? "pulido" : /recamara|dormitorio|estudio/.test(n) ? "laminado" : "porcelanato";
  if (part === "wall") return wet || (kitchen && !/sala|estancia|estar/.test(n)) ? "azulejo" : garage ? "mortero-pintura" : "yeso-pintura";
  return wet ? "esmalte" : garage ? "aparente" : "yeso";
}

/** Acabado de una parte del espacio: el elegido o el propuesto. */
export function roomFinish(r: Room, part: FinishPart): InteriorFinish {
  const id = r.finishes?.[part] ?? defaultFinish(r.name, part), list = FINISH_LISTS[part];
  return list.find((f) => f.id === id) ?? list[0];
}

export interface FinishRow { room: Room; name: string; area: number; perimeter: number; wallArea: number; floor: InteriorFinish; wall: InteriorFinish; ceiling: InteriorFinish }

/**
 * Tabla de acabados de un nivel: por espacio cerrado, su área de piso (y de plafón), su perímetro
 * y la superficie de muros (perímetro × altura menos los vanos que dan al espacio, contados una vez).
 */
export function finishTable(lv: Level): FinishRow[] {
  const g = computeRooms(lv);
  if (!g) return [];
  const H = lv.walls.length ? Math.max(...lv.walls.map((w) => w.height)) : 2.7;
  return lv.rooms.flatMap((r) => {
    const c = g.rooms.get(r.id);
    if (!c?.ok || !c.mask) return [];
    // perímetro: bordes de celda entre el espacio y lo que no es él
    let edges = 0;
    const { nx, ny } = g, m = c.mask;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!m[j * nx + i]) continue;
      if (i === 0 || !m[j * nx + i - 1]) edges++;
      if (i === nx - 1 || !m[j * nx + i + 1]) edges++;
      if (j === 0 || !m[(j - 1) * nx + i]) edges++;
      if (j === ny - 1 || !m[(j + 1) * nx + i]) edges++;
    }
    const perimeter = edges * RC;
    // vanos de los muros que tocan el espacio: los que tienen el espacio a un lado
    const holes = lv.openings.reduce((s, o) => {
      const w = lv.walls.find((x) => x.id === o.wallId);
      if (!w) return s;
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, sAt = o.t * L, off = w.thick / 2 + RC * 1.5;
      const side = (k: number) => { const x = w.x1 + ux * sAt - uy * off * k, y = w.y1 + uy * sAt + ux * off * k, i = Math.floor((x - g.x0) / RC), j = Math.floor((y - g.y0) / RC); return i >= 0 && j >= 0 && i < nx && j < ny && m[j * nx + i] === 1; };
      return side(1) || side(-1) ? s + o.width * Math.min(o.height, H - o.sill) : s;
    }, 0);
    return [{ room: r, name: r.name, area: c.area, perimeter, wallArea: Math.max(0, perimeter * H - holes), floor: roomFinish(r, "floor"), wall: roomFinish(r, "wall"), ceiling: roomFinish(r, "ceiling") }];
  });
}
