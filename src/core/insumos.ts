// Explosión de insumos: los materiales que lleva la obra (cemento, arena, grava, varilla, block, loseta,
// pintura…) a partir de las cantidades del modelo, con consumos por unidad de obra habituales en México
// y su desperdicio. Es una estimación para comprar y presupuestar; el constructor la ajusta.

import { dir, polygonArea, roofGeom, slabArea } from "./geometry";
import { finishTable } from "./interiorFinishes";
import { runLength } from "./mep";
import type { Project } from "./model";
import { castillos, padFootings, stripFootings, stripSize } from "./mxStruct";
import { builtArea } from "./rooms";
import { wallType } from "./wallTypes";
import { GROUPS_US, insumosUs } from "./insumosUs";

export interface Insumo {
  group: string;
  name: string;
  unit: string;
  qty: number;
  /** De dónde sale la cantidad */
  note: string;
}

/** Concreto hecho en obra por m³ (f'c 200 y 250 kg/cm²): bultos de cemento de 50 kg, arena y grava en m³, agua en litros. */
export const CONCRETE = { 200: { cem: 7, arena: 0.5, grava: 0.66, agua: 220 }, 250: { cem: 8.2, arena: 0.46, grava: 0.66, agua: 210 } };
/** Mortero cemento-arena 1:4 por m³ */
export const MORTAR = { cem: 7.4, arena: 1.1 };
/** Peso de la varilla por metro (kg/m) */
export const BAR = { "#2": 0.25, "#3": 0.56, "#4": 0.99 };

const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Consumos de toda la obra. */
export function insumos(p: Project): Insumo[] {
  if (p.units === "imperial") return insumosUs(p);
  const L = p.levels, out: Insumo[] = [];
  const acc = new Map<string, Insumo>();
  const add = (group: string, name: string, unit: string, qty: number, note: string) => {
    if (!(qty > 1e-6)) return;
    const k = `${group}|${name}|${unit}`, cur = acc.get(k);
    if (cur) { cur.qty += qty; if (!cur.note.includes(note)) cur.note += `; ${note}`; } else { const x = { group, name, unit, qty, note }; acc.set(k, x); out.push(x); }
  };
  const concrete = (m3: number, fc: 200 | 250, note: string) => {
    const c = CONCRETE[fc];
    add("Concreto y agregados", `Cemento gris CPC 30R (bulto 50 kg)`, "bulto", m3 * c.cem * 1.05, note);
    add("Concreto y agregados", "Arena", "m³", m3 * c.arena * 1.1, note);
    add("Concreto y agregados", "Grava de 19 mm (¾\")", "m³", m3 * c.grava * 1.1, note);
    add("Concreto y agregados", "Agua", "l", m3 * c.agua, note);
  };
  const mortar = (m3: number, note: string) => {
    add("Concreto y agregados", `Cemento gris CPC 30R (bulto 50 kg)`, "bulto", m3 * MORTAR.cem * 1.05, note);
    add("Concreto y agregados", "Arena", "m³", m3 * MORTAR.arena * 1.1, note);
  };
  const steel = (kg: number, bar: keyof typeof BAR, note: string) => {
    add("Acero de refuerzo", bar === "#2" ? "Alambrón #2 (¼\")" : `Varilla corrugada ${bar} (${bar === "#3" ? "⅜" : "½"}\")`, "kg", kg * 1.07, note);
    add("Acero de refuerzo", "Alambre recocido calibre 18", "kg", kg * 0.03, note);
  };

  // cimentación: zapatas corridas, aisladas, cadena de desplante y firme
  const zs = stripFootings(p);
  for (const z of zs) {
    const { h } = stripSize(p, z.mark), len = dir(z.wall).L + z.B;
    concrete(len * z.B * h, 200, "zapatas corridas");
    // transversales #3 @ 20 (o 15) cm y 3 a 4 longitudinales
    steel(((len / 0.2) * z.B + 3 * len) * BAR["#3"], "#3", "zapatas corridas");
    add("Concreto y agregados", "Concreto pobre para plantilla (f'c 100)", "m³", len * z.B * 0.05, "plantilla de zapatas");
  }
  for (const z of padFootings(p)) { concrete(z.B * z.B * z.h + z.dado * z.dado * 0.6, 200, "zapatas aisladas"); steel(2 * (z.B / 0.2) * z.B * BAR["#4"], "#4", "zapatas aisladas"); }
  const lv0 = L[0];
  const desplante = lv0 ? lv0.walls.filter((w) => w.thick >= 0.1).reduce((s, w) => s + dir(w).L, 0) : 0;
  const cadena = (len: number, note: string) => {
    concrete(len * 0.15 * 0.2, 200, note);
    steel(len * 4 * BAR["#3"], "#3", note);
    steel((len / 0.2) * 0.62 * BAR["#2"], "#2", note);
    add("Cimbra", "Duela y polín de pino para cimbra (3 usos)", "m²", (len * 0.4) / 3, note);
  };
  cadena(desplante, "cadena de desplante");

  // por nivel: castillos, cadena de cerramiento, muros
  L.forEach((lv) => {
    const H = lv.walls.length ? Math.max(...lv.walls.map((w) => w.height)) : 2.6;
    const ks = castillos(lv).length;
    concrete(ks * H * 0.15 * 0.15, 200, "castillos");
    steel(ks * H * 4 * BAR["#3"], "#3", "castillos");
    steel(ks * (H / 0.2) * 0.62 * BAR["#2"], "#2", "castillos");
    add("Cimbra", "Duela y polín de pino para cimbra (3 usos)", "m²", (ks * H * 0.3) / 3, "castillos");
    cadena(lv.walls.filter((w) => w.thick >= 0.1).reduce((s, w) => s + dir(w).L, 0), "cadena de cerramiento");
    for (const w of lv.walls) {
      const t = wallType(w.type), len = dir(w).L;
      const a = Math.max(0, len * w.height - lv.openings.filter((o) => o.wallId === w.id).reduce((s, o) => s + o.width * Math.min(o.height, w.height - o.sill), 0));
      if (!a) continue;
      if (t.hatch === "block") { add("Muros", `Block hueco de concreto ${w.thick >= 0.14 ? "15 × 20 × 40" : "12 × 20 × 40"} cm`, "pza", a * 12.5 * 1.05, "muros de block"); mortar(a * 0.012, "junteo de block"); }
      else if (t.hatch === "brick") { const n = w.thick >= 0.2 ? 110 : 55; add("Muros", "Tabique rojo recocido 7 × 14 × 28 cm", "pza", a * n * 1.05, "muros de tabique"); mortar(a * (w.thick >= 0.2 ? 0.06 : 0.03), "junteo de tabique"); }
      else if (t.hatch === "concrete") { concrete(a * w.thick, 250, "muros de concreto"); steel(a * w.thick * 90, "#3", "muros de concreto"); }
      else if (t.hatch === "drywall") { add("Muros", "Placa de yeso (tablaroca) 1.22 × 2.44 m", "pza", (a * 2 * 1.08) / 2.98, "muros de tablaroca"); add("Muros", "Bastidor: canal y poste de lámina galvanizada", "m", a * 2.6, "muros de tablaroca"); }
      else { add("Muros", "Block hueco de concreto 15 × 20 × 40 cm", "pza", a * 12.5 * 1.05, "muros sin tipo (como block)"); mortar(a * 0.012, "junteo de block"); }
    }
  });

  // losas (las de los niveles superiores son entrepisos; la de planta baja, firme)
  L.forEach((lv, i) => lv.slabs.forEach((sl) => {
    const a = slabArea(sl);
    if (i === 0) {
      concrete(a * 0.1, 200, "firme de planta baja");
      add("Acero de refuerzo", "Malla electrosoldada 6-6/10-10 (rollo 100 m²)", "rollo", (a * 1.1) / 100, "firme de planta baja");
    } else {
      concrete(a * sl.thick, 250, "losas de entrepiso");
      steel(a * 7.5, "#3", "losas de entrepiso");
      add("Cimbra", "Triplay de pino 16 mm y polines para losa (3 usos)", "m²", a / 3, "losas de entrepiso");
    }
  }));

  // cubiertas
  for (const lv of L) for (const rf of lv.roofs) {
    const plan = polygonArea(roofGeom(rf).outline) - (rf.holes ?? []).reduce((t, h) => t + polygonArea(h), 0);
    if (rf.kind === "flat") {
      concrete(plan * 0.12, 250, "losa de azotea"); steel(plan * 7, "#3", "losa de azotea");
      add("Cimbra", "Triplay de pino 16 mm y polines para losa (3 usos)", "m²", plan / 3, "losa de azotea");
      add("Azotea", "Tezontle para relleno de pendientes", "m³", plan * 0.1, "azotea");
      mortar(plan * 0.03, "entortado de azotea");
      add("Azotea", "Impermeabilizante acrílico (cubeta 19 l)", "cubeta", (plan * 1.1 * 1.2) / 19, "azotea, 2 manos");
      add("Azotea", "Malla de refuerzo para impermeabilizante (rollo 100 m²)", "rollo", (plan * 1.1) / 100, "azotea");
    } else {
      const a = plan / Math.cos((Math.min(75, rf.pitch) * Math.PI) / 180);
      concrete(a * 0.1, 250, "losa inclinada"); steel(a * 6.5, "#3", "losa inclinada");
      add("Cimbra", "Triplay de pino 16 mm y polines para losa (3 usos)", "m²", a / 3, "losa inclinada");
      add("Cubierta", "Teja de barro tipo Santa Clara", "pza", a * 18 * 1.08, "cubierta inclinada");
      mortar(a * 0.025, "asentado de teja");
    }
  }

  // aplanados, pisos, azulejo y pintura
  const fins = L.flatMap((lv) => finishTable(lv));
  const walls = L.reduce((t, lv) => t + lv.walls.reduce((u, w) => u + dir(w).L * w.height, 0) - lv.openings.reduce((u, o) => u + o.width * o.height, 0), 0);
  const ext = L.reduce((t, lv) => t + lv.walls.filter((w) => w.thick >= 0.2).reduce((u, w) => u + dir(w).L * w.height, 0), 0);
  const tile = fins.filter((f) => f.wall.id === "azulejo").reduce((t, f) => t + f.perimeter * 2.1, 0);
  const inner = Math.max(0, walls * 2 - ext);
  mortar(ext * 0.02, "aplanado exterior");
  add("Aplanados", "Yeso (bulto 40 kg)", "bulto", (Math.max(0, inner - tile) * 12 * 1.05) / 40 + (fins.reduce((t, f) => t + f.area, 0) * 10) / 40, "aplanado de yeso en muros y plafones");
  const floor = fins.reduce((t, f) => t + f.area, 0);
  const byFloor = new Map<string, number>();
  for (const f of fins) byFloor.set(f.floor.name, (byFloor.get(f.floor.name) ?? 0) + f.area);
  for (const [name, a] of byFloor) add("Pisos y recubrimientos", name, "m²", a * 1.08, "pisos");
  add("Pisos y recubrimientos", "Azulejo cerámico 30 × 60 cm", "m²", tile * 1.08, "muros de baños y cocina");
  add("Pisos y recubrimientos", "Adhesivo para piso y muro (bulto 20 kg)", "bulto", ((floor + tile) * 5) / 20, "pisos y azulejo");
  add("Pisos y recubrimientos", "Boquilla sin arena (bolsa 5 kg)", "bolsa", ((floor + tile) * 0.4) / 5, "pisos y azulejo");
  const paint = Math.max(0, walls * 2 - tile) + floor;
  add("Pintura", "Sellador vinílico 5×1 (cubeta 19 l)", "cubeta", (paint * 0.08) / 19, "muros y plafones");
  add("Pintura", "Pintura vinílica (cubeta 19 l)", "cubeta", (paint * 2 * 0.1) / 19, "muros y plafones, 2 manos");

  // instalaciones: metros de canalización y tubería con 10 % de desperdicio
  const runs = L.flatMap((lv) => lv.runs), m = (s: string) => runs.filter((x) => x.system === s).reduce((t, x) => t + runLength(x), 0) * 1.1;
  add("Instalaciones", "Poliducto naranja 13 mm (½\")", "m", m("elec"), "canalización eléctrica");
  add("Instalaciones", "Cable THW-LS calibre 12 AWG", "m", m("elec") * 3, "fase, neutro y tierra");
  add("Instalaciones", "Tubo CPVC 13 mm (½\") agua fría", "m", m("af"), "agua fría");
  add("Instalaciones", "Tubo CPVC 13 mm (½\") agua caliente", "m", m("ac"), "agua caliente");
  add("Instalaciones", "Tubo PVC sanitario 100 mm (4\")", "m", m("san") * 0.6, "desagües y bajadas");
  add("Instalaciones", "Tubo PVC sanitario 50 mm (2\")", "m", m("san") * 0.4, "desagües de lavabos y fregadero");
  const fx = L.flatMap((lv) => lv.fixtures);
  add("Instalaciones", "Chalupa y tapa para contacto o apagador", "pza", fx.filter((f) => ["interruptor", "conmutador", "enchufe", "enchufe-fuerza"].includes(f.kind)).length, "salidas eléctricas");
  add("Instalaciones", "Caja de registro octagonal para luminaria", "pza", fx.filter((f) => ["luz", "aplique"].includes(f.kind)).length, "salidas de alumbrado");

  // limpieza
  add("Limpieza", "Acarreo de escombro en camión de 7 m³", "viaje", Math.ceil((L.reduce((t, lv) => t + builtArea(lv), 0) * 0.08) / 7), "limpieza de obra");

  out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  return out.map((x) => ({ ...x, qty: r(x.unit === "pza" || x.unit === "bulto" || x.unit === "cubeta" || x.unit === "rollo" || x.unit === "bolsa" || x.unit === "viaje" ? Math.ceil(x.qty - 1e-9) : x.qty) }));
}

/** Orden de los grupos en la tabla */
export const GROUPS = ["Concreto y agregados", "Acero de refuerzo", "Cimbra", "Muros", "Cubierta", "Azotea", "Aplanados", "Pisos y recubrimientos", "Pintura", "Instalaciones", "Limpieza"];

/** Grupos en el orden del documento, en inglés para EE.UU. */
export const insumoGroups = (p: Project) => (p.units === "imperial" ? GROUPS_US : GROUPS);
