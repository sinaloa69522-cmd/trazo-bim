// Programa de obra: actividades en el orden en que se construye una casa en México, con su duración
// calculada de las cantidades del modelo y rendimientos de cuadrilla típicos, sus traslapes, y el
// importe de cada una tomado del presupuesto para la curva de avance financiero semanal.

import { budget, defaultBudget } from "./budget";
import { dir, polygonArea, roofGeom, slabArea } from "./geometry";
import { finishTable } from "./interiorFinishes";
import { mepDef } from "./mep";
import type { Project } from "./model";
import { stripFootings } from "./mxStruct";
import { builtArea } from "./rooms";

/** Días de trabajo por semana (lunes a sábado) */
export const WEEK = 6;

export interface Activity {
  id: string;
  name: string;
  /** Inicio y duración en días hábiles, desde el día 0 */
  start: number;
  days: number;
  /** Cantidad que la define, para mostrarla */
  qty: string;
  /** Importe (costo directo más indirectos), 0 si no tiene partida en el presupuesto */
  cost: number;
}

export interface Program {
  acts: Activity[];
  /** Duración total en días hábiles y en semanas */
  days: number;
  weeks: number;
  /** Importe por semana y acumulado en % */
  weekly: number[];
  cumulative: number[];
  total: number;
}

const ceil = (v: number, min = 1) => Math.max(min, Math.ceil(v - 1e-9));

/**
 * Calcula el programa. Rendimientos de una cuadrilla (oficial y ayudante) por día, con castillos, cadenas
 * y cimbra incluidos: trazo 120 m² · zapatas 5 m · muros 12 m² · losas 15 m² · cubierta 10 m² ·
 * aplanados 20 m² · pisos 12 m² · azulejo 8 m² · pintura 50 m².
 */
export function program(p: Project): Program {
  const b = budget(p, p.budget ?? defaultBudget()), k = 1 + (p.budget?.indirect ?? 20) / 100;
  const chap = (code: string) => (b.chapters.find((c) => c.code === code)?.total ?? 0) * k;
  const item = (code: string) => (b.chapters.flatMap((c) => c.items).find((i) => i.code === code)?.amount ?? 0) * k;
  const L = p.levels, acts: Activity[] = [];
  const add = (id: string, name: string, start: number, days: number, qty: string, cost = 0) => { const a = { id, name, start: Math.max(0, Math.round(start)), days, qty, cost }; acts.push(a); return a; };
  const end = (a: Activity) => a.start + a.days;

  const foot = builtArea(L[0] ?? { walls: [] } as never);
  const pre = add("pre", "Limpieza, trazo y nivelación", 0, ceil(foot / 120, 2), `${foot.toFixed(0)} m²`, item("00.01"));
  const zl = stripFootings(p).reduce((s, z) => s + dir(z.wall).L, 0);
  const firm = (L[0]?.slabs ?? []).reduce((s, sl) => s + slabArea(sl), 0);
  // excavación, plantilla, armado y colado de zapatas, cadena de desplante, relleno y firme
  const cim = add("cim", "Excavación y cimentación", end(pre), ceil(zl / 5 + 6 + firm / 40, 6), `${zl.toFixed(0)} m de zapata`, item("00.02"));

  // por nivel: muros y castillos, luego la losa de arriba (entrepiso del siguiente nivel o azotea)
  const wallArea = L.map((lv) => lv.walls.reduce((s, w) => s + dir(w).L * w.height, 0) - lv.openings.reduce((s, o) => s + o.width * o.height, 0));
  const wallsTotal = wallArea.reduce((s, a) => s + a, 0) || 1;
  const slabTotal = L.slice(1).reduce((s, lv) => s + lv.slabs.reduce((t, sl) => t + slabArea(sl) * sl.thick, 0), 0) || 0;
  const flat = L.flatMap((lv) => lv.roofs.filter((r) => r.kind === "flat"));
  const pitched = L.flatMap((lv) => lv.roofs.filter((r) => r.kind !== "flat"));
  const roofArea = (rs: typeof flat) => rs.reduce((s, r) => s + polygonArea(roofGeom(r).outline) / (r.kind === "flat" ? 1 : Math.cos((Math.min(75, r.pitch) * Math.PI) / 180)), 0);
  const roofTotal = roofArea(flat) + roofArea(pitched);
  let t = end(cim);
  const muros: Activity[] = [];
  let lastStruct: Activity = cim;
  L.forEach((lv, i) => {
    const a = Math.max(0, wallArea[i]);
    if (a > 0) {
      const m = add(`mur${i}`, `Muros y castillos · ${lv.name}`, t, ceil(a / 12, 4), `${a.toFixed(0)} m²`, chap("02") * (a / wallsTotal));
      muros.push(m); lastStruct = m; t = end(m);
    }
    const above = L[i + 1];
    const sA = above ? above.slabs.reduce((s, sl) => s + slabArea(sl), 0) : 0;
    const fA = lv.roofs.filter((r) => r.kind === "flat").reduce((s, r) => s + polygonArea(roofGeom(r).outline), 0);
    if (sA > 0) {
      const share = slabTotal ? above.slabs.reduce((s, sl) => s + slabArea(sl) * sl.thick, 0) / slabTotal : 1;
      // cimbra, armado y colado; los muros de arriba empiezan a los 7 días del colado
      const s = add(`losa${i}`, `Losa de entrepiso sobre ${lv.name}`, t, ceil(sA / 15 + 3, 6), `${sA.toFixed(0)} m²`, chap("01") * share + (i === 0 ? chap("05") : 0));
      lastStruct = s; t = end(s) + 7;
    }
    if (fA > 0) {
      const s = add(`azo${i}`, `Losa de azotea sobre ${lv.name}`, t, ceil(fA / 15 + 3, 6), `${fA.toFixed(0)} m²`, roofTotal ? (chap("03") * fA) / roofTotal : 0);
      lastStruct = s; t = end(s);
    }
  });
  const topWalls = muros[muros.length - 1] ?? cim;
  if (pitched.length) {
    const ra = roofArea(pitched);
    lastStruct = add("cub", "Estructura y cubierta de teja", Math.max(end(topWalls), lastStruct.start), ceil(ra / 10, 6), `${ra.toFixed(0)} m²`, roofTotal ? (chap("03") * ra) / roofTotal : 0);
  }
  const structEnd = end(lastStruct);

  // instalaciones ocultas: empiezan a media obra negra del primer nivel
  const fx = L.reduce((s, lv) => s + lv.fixtures.length, 0), runs = L.reduce((s, lv) => s + lv.runs.length, 0);
  const m0 = muros[0] ?? cim;
  const inst = add("inst", "Instalaciones eléctrica, hidráulica y sanitaria (ocultas)", m0.start + Math.round(m0.days * 0.6), ceil(fx / 4 + runs / 6, 6), `${fx} salidas`, chap("07") + chap("08"));
  if (end(inst) < structEnd) inst.days = structEnd - inst.start;

  // obra gris y acabados
  const plaster = wallArea.reduce((s, a) => s + Math.max(0, a), 0) * 1.8;
  const apl = add("apl", "Aplanados interiores y exteriores", Math.max(structEnd, inst.start + Math.round(inst.days * 0.5)), ceil(plaster / 20, 5), `${plaster.toFixed(0)} m²`, item("10.01"));
  const fins = L.flatMap((lv) => finishTable(lv));
  const floor = fins.reduce((s, r) => s + r.area, 0);
  const pis = add("pis", "Firmes, pisos y zoclos", apl.start + Math.round(apl.days * 0.5), ceil(floor / 12, 4), `${floor.toFixed(0)} m²`, chap("06"));
  const tile = fins.filter((r) => r.wall.id === "azulejo").reduce((s, r) => s + r.perimeter * 2.1, 0);
  const azu = tile > 0 ? add("azu", "Azulejo en baños y cocina", pis.start, ceil(tile / 8, 3), `${tile.toFixed(0)} m²`, item("10.02")) : null;
  const ops = L.reduce((s, lv) => s + lv.openings.length, 0);
  const car = add("car", "Cancelería, puertas y ventanas", pis.start + Math.round(pis.days * 0.5), ceil(ops / 4, 3), `${ops} piezas`, chap("04"));
  const san = L.reduce((s, lv) => s + lv.furniture.filter((f) => ["wc", "basin", "bath", "shower", "kitchen"].includes(f.kind) || f.kind.startsWith("cab-")).length, 0)
    + L.reduce((s, lv) => s + lv.fixtures.filter((f) => mepDef(f.kind).disc === "elec").length, 0) / 6;
  const mue = add("mue", "Muebles sanitarios, cocina y accesorios eléctricos", Math.max(end(azu ?? pis), end(pis) - 2), ceil(san / 4, 2), `${Math.round(san)} piezas`, chap("09"));
  const paint = plaster + floor;
  const pin = add("pin", "Pintura", Math.max(end(apl), end(car) - 3), ceil(paint / 50, 4), `${paint.toFixed(0)} m²`, item("10.03"));
  add("lim", "Limpieza y entrega", Math.max(end(pin), end(mue), end(car)), 3, "", item("10.04"));

  // estructura de días y semanas
  acts.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  const days = Math.max(...acts.map(end)), weeks = Math.ceil(days / WEEK);
  const weekly = Array(weeks).fill(0);
  for (const a of acts) {
    if (!a.cost) continue;
    for (let d = a.start; d < end(a); d++) weekly[Math.floor(d / WEEK)] += a.cost / a.days;
  }
  const total = weekly.reduce((s, v) => s + v, 0);
  let acc = 0;
  const cumulative = weekly.map((v) => { acc += v; return total ? acc / total : 0; });
  return { acts, days, weeks, weekly, cumulative, total };
}

/** Fecha (ISO) del día hábil n contando desde start (lunes a sábado). */
export function workDate(startIso: string, n: number): Date {
  const d = new Date(`${startIso}T12:00:00`);
  if (isNaN(+d)) return new Date();
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  let k = 0;
  while (k < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) k++; }
  return d;
}
