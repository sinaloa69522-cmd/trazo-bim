// Presupuesto para EE.UU.: partidas de vivienda en wood frame como las cotiza un general contractor
// (sitework, slab, framing, roofing, envelope, openings, finishes, MEP), en pies, pies cuadrados, LF, SQ y
// piezas, con precios de referencia en dólares (promedio nacional, costo directo de subcontrato).
// Cada despacho debe poner los suyos; las cantidades salen del modelo igual que en el presupuesto mexicano.

import type { Budget, BudgetItem, BudgetSettings } from "./budget";
import { roomUse } from "./codeCheck";
import { deckTakeoff } from "./decks";
import { dir, polygonArea, roofGeom, slabArea } from "./geometry";
import { CAB_CAT, isWallCabinet } from "./kitchen";
import { furnitureDef } from "./furniture";
import { runLength } from "./mep";
import type { Project } from "./model";
import { isExterior } from "./permit";
import { builtArea, computeRooms } from "./rooms";
import { FT } from "./units";
import { wallType } from "./wallTypes";

export const CHAPTERS_US: [string, string][] = [
  ["01", "Sitework & foundation"], ["02", "Concrete slab & floor system"], ["03", "Framing"], ["04", "Roofing"],
  ["05", "Exterior envelope"], ["06", "Doors & windows"], ["07", "Stairs, decks & porches"], ["08", "Flooring"],
  ["09", "Electrical"], ["10", "Plumbing"], ["11", "Fixtures, cabinets & appliances"], ["12", "Drywall, paint & interior finishes"],
  ["13", "HVAC"],
];

const SF = FT * FT, LF = FT;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Precio por dispositivo eléctrico y de plomería, con su nombre en inglés. */
export const MEP_US: Record<string, [string, number]> = {
  luz: ["Ceiling light outlet with box and fixture allowance", 185], aplique: ["Wall sconce outlet", 165], interruptor: ["Single-pole switch", 120],
  conmutador: ["3-way switch", 150], enchufe: ["Duplex receptacle 15/20 A (TR, AFCI/GFCI as required)", 135], "enchufe-fuerza": ["240 V receptacle (range / dryer)", 320],
  cuadro: ["200 A main panel with breakers", 3600], acometida: ["Electrical service entrance and meter base", 2800],
  "toma-af": ["Cold water supply rough-in", 160], "toma-ac": ["Hot water supply rough-in", 175], desague: ["Fixture drain & trap rough-in", 210],
  sumidero: ["Floor drain", 380], bajante: ["DWV stack & vent through roof", 950], llave: ["Shut-off valve", 90], contador: ["Water service & meter connection", 1800],
  registro: ["Cleanout", 260], tinaco: ["Water storage tank", 900], termo: ["Water heater 50 gal, installed", 2400],
};
const RUN_US: Record<string, [string, number]> = {
  elec: ["NM-B branch wiring", 4.5], af: ["PEX cold water piping", 6], ac: ["PEX hot water piping, insulated", 7.5], san: ["PVC DWV piping", 16],
};
const FIXTURE_US: Record<string, [string, number]> = {
  wc: ["Water closet, installed", 650], basin: ["Lavatory with faucet, installed", 600], bath: ["Bathtub with shower valve, installed", 1900],
  shower: ["Shower stall with valve and glass door", 2600], kitchen: ["Kitchen sink with faucet and disposal", 950],
};

/** Presupuesto de EE.UU. con la misma estructura que el mexicano. */
export function usBudget(p: Project, s: BudgetSettings): Budget {
  const items: Omit<BudgetItem, "price" | "amount">[] = [];
  const add = (code: string, desc: string, unit: string, qty: number, base: number) => {
    if (qty > 1e-6) items.push({ code, chapter: code.slice(0, 2), desc, unit, qty: r2(qty), base });
  };
  const lv = p.levels, L0 = lv[0];
  const foot = L0 ? builtArea(L0) : 0;

  // 01 sitework & foundation: layout, excavation and continuous footings under the walls of the first floor
  add("01.01", "Site clearing, layout, rough grading and erosion control", "sq ft", foot / SF, 1.75);
  const extLen = (L0?.walls ?? []).filter((w, i, all) => isExterior(w, i, all)).reduce((t, w) => t + dir(w).L, 0);
  const intLen = (L0?.walls ?? []).filter((w, i, all) => !isExterior(w, i, all)).reduce((t, w) => t + dir(w).L, 0);
  add("01.02", "Continuous footing 16\" × 8\" with #4 bars, excavation and backfill (exterior walls)", "LF", extLen / LF, 48);
  add("01.03", "Thickened slab footing 12\" × 8\" (interior bearing walls)", "LF", intLen / LF * 0.5, 28);

  // 02 slab on grade (first floor) and framed floors above
  const slabSf = (l: (typeof lv)[number]) => l.slabs.reduce((t, sl) => t + slabArea(sl), 0) / SF;
  add("02.01", "Slab on grade 4\" with 10 mil vapor retarder, WWF and 4\" gravel base", "sq ft", L0 ? slabSf(L0) : 0, 8.5);
  add("02.02", "Floor system: I-joists or 2x10 @ 16\" o.c. with 3/4\" T&G subfloor, glued and screwed", "sq ft", lv.slice(1).reduce((t, l) => t + slabSf(l), 0), 14);

  // 03 framing: walls by type (gross area, openings framed with headers), roof framing over the plan area
  const wallSf = (pred: (w: (typeof lv)[number]["walls"][number], all: (typeof lv)[number]["walls"]) => boolean) =>
    lv.reduce((t, l) => t + l.walls.filter((w) => pred(w, l.walls)).reduce((u, w) => u + dir(w).L * w.height, 0), 0) / SF;
  const ext = (w: (typeof lv)[number]["walls"][number], all: (typeof lv)[number]["walls"]) => isExterior(w, 0, all);
  const cmu = (w: { type: string }) => wallType(w.type).id === "us-cmu8";
  add("03.01", "Exterior wall framing 2x6 @ 16\" o.c. with 7/16\" OSB sheathing, headers and hold-downs", "sq ft", wallSf((w, all) => ext(w, all) && !cmu(w)), 10.5);
  add("03.02", "Interior partition framing 2x4 @ 16\" o.c.", "sq ft", wallSf((w, all) => !ext(w, all) && !cmu(w)), 5.5);
  add("03.03", "8\" CMU wall, grouted cells with vertical reinforcing", "sq ft", wallSf((w) => cmu(w)), 19);
  let pitched = 0, flat = 0, planRoof = 0, eaves = 0;
  for (const l of lv) for (const r of l.roofs) {
    const g = roofGeom(r), a = polygonArea(g.outline) - (r.holes ?? []).reduce((t, h) => t + polygonArea(h), 0);
    planRoof += a;
    for (let i = 0; i < g.outline.length; i++) { const q = g.outline[i], n = g.outline[(i + 1) % g.outline.length]; eaves += Math.hypot(n.x - q.x, n.y - q.y); }
    if (r.kind === "flat") flat += a; else pitched += a / Math.cos((Math.min(75, r.pitch) * Math.PI) / 180);
  }
  add("03.04", "Roof framing: engineered trusses @ 24\" o.c. with 7/16\" OSB roof sheathing", "sq ft", (pitched + flat) / SF, 8);

  // 04 roofing
  add("04.01", "Architectural asphalt shingles with synthetic underlayment, ice & water shield, drip edge and ridge vent", "SQ", pitched / SF / 100, 480);
  add("04.02", "Low-slope roof: TPO membrane over tapered insulation", "sq ft", flat / SF, 11);
  add("04.03", "Seamless aluminum gutters and downspouts", "LF", eaves / LF, 13);

  // 05 exterior envelope: siding and insulation
  const openings = lv.flatMap((l) => l.openings.filter((o) => l.walls.some((w) => w.id === o.wallId)).map((o) => ({ o, w: l.walls.find((w) => w.id === o.wallId)!, all: l.walls })));
  const extOpen = openings.filter((x) => ext(x.w, x.all)).reduce((t, x) => t + x.o.width * x.o.height, 0) / SF;
  const extNet = Math.max(0, wallSf((w, all) => ext(w, all)) - extOpen);
  add("05.01", "Fiber-cement lap siding with weather-resistive barrier, trim and caulking", "sq ft", extNet, 10);
  add("05.02", "Wall insulation R-21 fiberglass batts (2x6 exterior walls)", "sq ft", extNet, 1.9);
  add("05.03", "Ceiling insulation R-49 blown-in (attic)", "sq ft", planRoof / SF, 2.1);

  // 06 doors & windows
  const doors = openings.filter((x) => x.o.kind === "door");
  add("06.01", "Interior pre-hung door, hollow core, with casing and hardware", "ea", doors.filter((x) => !ext(x.w, x.all)).length, 480);
  add("06.02", "Exterior insulated door, fiberglass, with lockset and deadbolt", "ea", doors.filter((x) => ext(x.w, x.all)).length, 1650);
  add("06.03", "Vinyl windows, double-pane Low-E, with flashing and interior trim", "sq ft", openings.filter((x) => x.o.kind === "window").reduce((t, x) => t + x.o.width * x.o.height, 0) / SF, 58);

  // 07 stairs, decks & porches
  add("07.01", "Interior stair: stringers, treads and risers, handrail and guard", "flight", lv.reduce((t, l) => t + l.stairs.length, 0), 4200);
  const decks = lv.flatMap((l) => (l.decks ?? []).map((d) => deckTakeoff(d, l.walls)));
  add("07.02", "Deck / porch framing and decking", "sq ft", decks.reduce((t, q) => t + q.area, 0) / SF, 48);
  add("07.03", "Deck guard 36\" with balusters", "LF", decks.reduce((t, q) => t + q.guard, 0) / LF, 65);
  add("07.04", "Deck stair riser", "ea", decks.reduce((t, q) => t + q.risers, 0), 160);

  // 08 flooring: tile in wet rooms, luxury vinyl plank elsewhere
  let wet = 0, dry = 0, ceiling = 0;
  for (const l of lv) {
    const g = computeRooms(l);
    if (!g) continue;
    for (const r of l.rooms) {
      const c = g.rooms.get(r.id);
      if (!c?.ok) continue;
      ceiling += c.area;
      const u = roomUse(r.name);
      if (u === "bano" || u === "lavado") wet += c.area; else if (u !== "cochera") dry += c.area;
    }
  }
  add("08.01", "Luxury vinyl plank flooring with underlayment and base", "sq ft", dry / SF, 7.5);
  add("08.02", "Porcelain tile flooring on backer board (baths and laundry)", "sq ft", wet / SF, 15);

  // 09 electrical and 10 plumbing: devices by kind and runs by system
  const fixtures = lv.flatMap((l) => l.fixtures), runs = lv.flatMap((l) => l.runs);
  const kinds = [...new Set(fixtures.map((f) => f.kind))];
  for (const k of kinds) {
    const d = MEP_US[k];
    if (!d) continue;
    const elec = ["luz", "aplique", "interruptor", "conmutador", "enchufe", "enchufe-fuerza", "cuadro", "acometida"].includes(k);
    add(`${elec ? "09" : "10"}.${String(Object.keys(MEP_US).indexOf(k) + 1).padStart(2, "0")}`, d[0], "ea", fixtures.filter((f) => f.kind === k).length, d[1]);
  }
  for (const [sys, [desc, price]] of Object.entries(RUN_US))
    add(`${sys === "elec" ? "09" : "10"}.9${Object.keys(RUN_US).indexOf(sys)}`, desc, "LF", runs.filter((r) => r.system === sys).reduce((t, r) => t + runLength(r), 0) / LF, price);
  add("09.95", "Smoke / CO alarms, hardwired and interconnected", "ea", lv.reduce((t, l) => t + l.rooms.filter((r) => roomUse(r.name).startsWith("recamara")).length + 1, 0), 140);

  // 11 fixtures, cabinets & appliances
  for (const [k, [desc, price]] of Object.entries(FIXTURE_US))
    add(`11.${k}`, desc, "ea", lv.reduce((t, l) => t + l.furniture.filter((f) => f.kind === k).length, 0), price);
  const furn = lv.flatMap((l) => l.furniture).filter((f) => furnitureDef(f.kind).cat === CAB_CAT);
  const lf = (pred: (k: string) => boolean) => furn.filter((f) => pred(f.kind)).reduce((t, f) => t + furnitureDef(f.kind).w, 0) / LF;
  add("11.20", "Base cabinets with quartz countertop", "LF", lf((k) => !isWallCabinet(k) && k !== "cab-oven"), 420);
  add("11.21", "Wall cabinets", "LF", lf((k) => k.startsWith("cab-w")), 260);
  add("11.22", "Oven tower cabinet", "ea", furn.filter((f) => f.kind === "cab-oven").length, 1800);
  add("11.23", "Range hood vented to exterior", "ea", furn.filter((f) => f.kind === "cab-hood").length, 650);
  const kitchens = lv.reduce((t, l) => t + l.furniture.filter((f) => f.kind === "kitchen").length, 0);
  add("11.30", "Appliance package allowance (range, refrigerator, dishwasher, microwave)", "ea", kitchens, 6500);

  // 12 drywall, paint & finishes
  const intSf = wallSf((w, all) => !ext(w, all)), extInner = wallSf((w, all) => ext(w, all));
  const allOpen = openings.reduce((t, x) => t + x.o.width * x.o.height, 0) / SF;
  const board = Math.max(0, intSf * 2 + extInner - allOpen) + ceiling / SF;
  const tile = wet / SF * 1.6;
  add("12.01", "1/2\" gypsum board hung, taped and finished (level 4), walls and ceilings", "sq ft", board, 3.4);
  add("12.02", "Ceramic wall tile at tub / shower surrounds and backsplash", "sq ft", tile, 19);
  add("12.03", "Interior paint: primer and two coats, walls and ceilings", "sq ft", Math.max(0, board - tile), 2.1);
  add("12.04", "Interior trim: base, casing and window stools", "LF", (lv.reduce((t, l) => t + l.walls.reduce((u, w) => u + dir(w).L, 0), 0) * 1.6) / LF, 6);
  add("12.05", "Exterior paint and final caulking", "sq ft", extNet, 1.6);
  add("12.06", "Final clean", "sq ft", lv.reduce((t, l) => t + builtArea(l), 0) / SF, 0.6);

  // 13 HVAC: heat pump split system sized at about 550 sq ft per ton, ducts and exhaust fans
  const cond = lv.reduce((t, l) => t + builtArea(l), 0) / SF;
  add("13.01", "Heat pump split system (SEER2 15), air handler and line set", "ton", Math.max(1.5, Math.ceil((cond / 550) * 2) / 2), 3200);
  add("13.02", "Supply and return ductwork with registers", "sq ft", cond, 4.5);
  add("13.03", "Bath exhaust fan 80 cfm ducted to exterior", "ea", lv.reduce((t, l) => t + l.rooms.filter((r) => roomUse(r.name) === "bano").length, 0), 380);

  const priced: BudgetItem[] = items.map((it) => {
    const price = s.prices[it.code] ?? it.base;
    return { ...it, price, amount: r2(it.qty * price) };
  });
  const chapters = CHAPTERS_US.map(([code, name]) => {
    const its = priced.filter((x) => x.chapter === code).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    return { code, name, items: its, total: r2(its.reduce((t, x) => t + x.amount, 0)) };
  }).filter((c) => c.items.length);
  const direct = r2(chapters.reduce((t, c) => t + c.total, 0));
  const indirect = r2((direct * s.indirect) / 100), subtotal = r2(direct + indirect), tax = r2((subtotal * s.tax) / 100);
  return { chapters, direct, indirect, subtotal, tax, total: r2(subtotal + tax) };
}
