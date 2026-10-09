import { DOOR_STYLES, openingStyle } from "./openingStyles";
import { deckTakeoff, deckType } from "./decks";
import { furnitureDef } from "./furniture";
import { dir, polygonArea, roofGeom, slabArea, stairSteps } from "./geometry";
import { MEP, runLength, SYSTEMS } from "./mep";
import type { Project } from "./model";
import { roomSchedule } from "./schedules";
import { GENERIC, WALL_TYPES, wallType, wallTypeLabel } from "./wallTypes";

/** Ajustes del presupuesto que se guardan con el proyecto. */
export interface BudgetSettings {
  currency: string;
  /** Indirectos y utilidad (gastos generales y beneficio), en % sobre el costo directo */
  indirect: number;
  /** IVA en % sobre el subtotal */
  tax: number;
  /** Precios unitarios cambiados por el usuario, por código de partida */
  prices: Record<string, number>;
}

export const CURRENCIES = ["MXN", "USD", "EUR", "COP", "PEN", "CLP", "ARS", "GTQ"];

export const defaultBudget = (): BudgetSettings => ({ currency: "MXN", indirect: 20, tax: 16, prices: {} });

export interface BudgetItem {
  code: string;
  chapter: string;
  desc: string;
  unit: string;
  qty: number;
  /** Precio de referencia, si el usuario no ha puesto otro */
  base: number;
  price: number;
  amount: number;
}

export interface Budget {
  chapters: { code: string; name: string; items: BudgetItem[]; total: number }[];
  direct: number;
  indirect: number;
  subtotal: number;
  tax: number;
  total: number;
}

/** Capítulos, en el orden en que se ejecuta la obra. */
export const CHAPTERS: [string, string][] = [
  ["01", "Estructura"], ["02", "Muros y tabiques"], ["03", "Cubiertas"], ["04", "Carpintería"], ["05", "Escaleras"],
  ["06", "Pisos"], ["07", "Instalación eléctrica"], ["08", "Plomería y saneamiento"], ["09", "Muebles sanitarios"],
];

/**
 * Precios de referencia en pesos mexicanos (costo directo de obra, orientativo).
 * Son un punto de partida: cada despacho debe poner los suyos.
 */
const WALL_PRICE: Record<string, number> = {
  "fachada-ladrillo": 950, "fachada-bloque": 620, "muro-hormigon": 2400, "tabique-ladrillo": 520, "tabique-yeso": 580, generico: 700,
};
const MEP_PRICE: Record<string, number> = {
  luz: 450, aplique: 550, interruptor: 380, conmutador: 480, enchufe: 420, "enchufe-fuerza": 650, cuadro: 6500,
  "toma-af": 650, "toma-ac": 700, desague: 600, sumidero: 750, bajante: 1800, llave: 450, contador: 2500, termo: 7500,
};
const RUN_PRICE: Record<string, number> = { elec: 120, af: 180, ac: 220, san: 280 };
const SANITARY_PRICE: Record<string, number> = { wc: 3800, basin: 2600, bath: 7500, shower: 3500, kitchen: 18000 };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Mediciones de todo el proyecto, partida por partida, valoradas con los precios del usuario o los de referencia. */
export function budget(p: Project, s: BudgetSettings = defaultBudget()): Budget {
  const items: Omit<BudgetItem, "price" | "amount">[] = [];
  const add = (code: string, desc: string, unit: string, qty: number, base: number) => {
    if (qty > 1e-9) items.push({ code, chapter: code.slice(0, 2), desc, unit, qty: r2(qty), base });
  };
  const lv = p.levels;

  // estructura: volumen de losas, descontando huecos
  add("01.01", "Losa maciza de concreto armado, incluye cimbra y acero", "m³", lv.reduce((t, l) => t + l.slabs.reduce((u, sl) => u + slabArea(sl) * sl.thick, 0), 0), 4800);

  // muros: superficie neta por tipo, descontando los huecos (como la tabla de muros)
  const walls = new Map<string, { id: string; code: string; area: number }>();
  for (const l of lv) for (const w of l.walls) {
    const t = wallType(w.type), label = wallTypeLabel(w), L = dir(w).L;
    const holes = l.openings.filter((o) => o.wallId === w.id).reduce((u, o) => u + o.width * Math.max(0, Math.min(o.height, w.height - o.sill)), 0);
    const code = `02.${String(WALL_TYPES.indexOf(t) + 1).padStart(2, "0")}${t.id === GENERIC ? `-${Math.round(w.thick * 100)}` : ""}`;
    const row = walls.get(label) ?? { id: t.id, code, area: 0 };
    row.area += Math.max(0, L * w.height - holes);
    walls.set(label, row);
  }
  for (const [label, r] of walls) add(r.code, `${label}: ${wallType(r.id).material.toLowerCase()}`, "m²", r.area, WALL_PRICE[r.id] ?? 700);

  // cubiertas: superficie real del faldón (en planta / cos de la pendiente)
  let tile = 0, flat = 0;
  for (const l of lv) for (const r of l.roofs) {
    const a = polygonArea(roofGeom(r).outline);
    if (r.kind === "flat") flat += a; else tile += a / Math.cos((Math.min(75, r.pitch) * Math.PI) / 180);
  }
  add("03.01", "Cubierta inclinada de teja cerámica sobre losa", "m²", tile, 1100);
  add("03.02", "Azotea plana con impermeabilización", "m²", flat, 650);

  // carpintería: puertas por pieza y ventanas por superficie
  const ops = lv.flatMap((l) => l.openings.filter((o) => l.walls.some((w) => w.id === o.wallId)));
  // las de una hoja conservan su partida; cada otro tipo de puerta va en la suya
  add("04.01", "Puerta de madera de una hoja, con marco y herrajes", "pza", ops.filter((o) => o.kind === "door" && openingStyle(o).id === "single").length, 4500);
  DOOR_STYLES.slice(1).forEach((st, i) => add(`04.${String(i + 3).padStart(2, "0")}`, `${st.name}, con marco y herrajes`, "pza",
    ops.filter((o) => o.kind === "door" && openingStyle(o).id === st.id).length, st.price ?? 4500));
  add("04.02", "Ventana de aluminio con vidrio", "m²", ops.filter((o) => o.kind === "window").reduce((t, o) => t + o.width * o.height, 0), 3200);

  // escaleras por metro de tramo
  add("05.01", "Escalera de concreto armado con peldaños forjados", "m", lv.reduce((t, l) => t + l.stairs.reduce((u, st) => u + stairSteps(st).L, 0), 0), 9500);

  // decks y porches: superficie por tipo, barandal y escalones
  const decks = lv.flatMap((l) => (l.decks ?? []).map((d) => ({ d, q: deckTakeoff(d, l.walls) })));
  const DECK_PRICE: Record<string, number> = { wood: 2400, composite: 3600, ground: 1900, covered: 5200, screened: 6400, stoop: 1700 };
  for (const k of Object.keys(DECK_PRICE))
    add(`05.1${Object.keys(DECK_PRICE).indexOf(k)}`, deckType(k as never).name, "m²", decks.filter((x) => x.d.kind === k).reduce((t, x) => t + x.q.area, 0), DECK_PRICE[k]);
  add("05.20", "Barandal de deck (guard 36\")", "m", decks.reduce((t, x) => t + x.q.guard, 0), 1800);
  add("05.21", "Escalón de deck con zancas y pasamanos", "pza", decks.reduce((t, x) => t + x.q.risers, 0), 1400);

  // pisos: superficie útil de los espacios cerrados
  add("06.01", "Piso cerámico con firme y pegazulejo", "m²", roomSchedule(p).reduce((t, r) => t + r.area, 0), 650);

  // instalaciones: puntos por tipo y metros por red
  const fixtures = lv.flatMap((l) => l.fixtures), runs = lv.flatMap((l) => l.runs);
  MEP.forEach((d, i) => add(`${d.disc === "elec" ? "07" : "08"}.${String(i + 1).padStart(2, "0")}`, `${d.label}, instalado`, "pza", fixtures.filter((f) => f.kind === d.kind).length, MEP_PRICE[d.kind] ?? 500));
  for (const sy of SYSTEMS)
    add(`${sy.id === "elec" ? "07" : "08"}.9${SYSTEMS.indexOf(sy)}`, sy.id === "elec" ? "Canalización con tubo flexible y cableado" : `Tubería de ${sy.label.toLowerCase()}`, "m",
      runs.filter((r) => r.system === sy.id).reduce((t, r) => t + runLength(r), 0), RUN_PRICE[sy.id]);

  // muebles sanitarios y cocina
  for (const [k, price] of Object.entries(SANITARY_PRICE))
    add(`09.${k}`, `${furnitureDef(k).label}, colocado`, "pza", lv.reduce((t, l) => t + l.furniture.filter((f) => f.kind === k).length, 0), price);

  const priced: BudgetItem[] = items.map((it) => {
    const price = s.prices[it.code] ?? it.base;
    return { ...it, price, amount: r2(it.qty * price) };
  });
  const chapters = CHAPTERS.map(([code, name]) => {
    const its = priced.filter((x) => x.chapter === code).sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
    return { code, name, items: its, total: r2(its.reduce((t, x) => t + x.amount, 0)) };
  }).filter((c) => c.items.length);
  const direct = r2(chapters.reduce((t, c) => t + c.total, 0));
  const indirect = r2((direct * s.indirect) / 100), subtotal = r2(direct + indirect), tax = r2((subtotal * s.tax) / 100);
  return { chapters, direct, indirect, subtotal, tax, total: r2(subtotal + tax) };
}

/** Cantidad con coma decimal, como la espera Excel en español. */
const dec = (v: number) => v.toFixed(2).replace(".", ",");

/** Presupuesto en CSV separado por punto y coma (con BOM para que Excel lea bien los acentos). */
export function budgetCsv(b: Budget, s: BudgetSettings, title: string): string {
  const q = (t: string) => (/[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  const rows: string[][] = [[title], [], ["Código", "Descripción", "Unidad", "Cantidad", `Precio (${s.currency})`, `Importe (${s.currency})`]];
  for (const c of b.chapters) {
    rows.push([c.code, c.name.toUpperCase()]);
    for (const it of c.items) rows.push([it.code, it.desc, it.unit, dec(it.qty), dec(it.price), dec(it.amount)]);
    rows.push(["", `Total ${c.name}`, "", "", "", dec(c.total)]);
  }
  rows.push([], ["", "Costo directo", "", "", "", dec(b.direct)], ["", `Indirectos y utilidad (${s.indirect} %)`, "", "", "", dec(b.indirect)],
    ["", "Subtotal", "", "", "", dec(b.subtotal)], ["", `IVA (${s.tax} %)`, "", "", "", dec(b.tax)], ["", "TOTAL", "", "", "", dec(b.total)]);
  return "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n") + "\r\n";
}
