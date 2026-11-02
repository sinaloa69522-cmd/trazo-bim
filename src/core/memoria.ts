// Memoria descriptiva del proyecto, armada con los datos del modelo: datos generales, descripción,
// cuadro de áreas, sistema constructivo, acabados, carpintería, instalaciones, revisión de reglamento,
// reglamentos aplicables y firmas. Sale como documento (docx.ts) para Word o para imprimir.

import { checkProject, RULES } from "./codeCheck";
import type { Block, Doc } from "./docx";
import { foundationType } from "./foundation";
import { finishTable } from "./interiorFinishes";
import type { Project } from "./model";
import { beams, CADENAS, castillos, K1, padFootings, padSize, slabPanels, stripSize } from "./mxStruct";
import { GENERALES, REGLAMENTOS } from "./mxText";
import { openingStyle } from "./openingStyles";
import { areaTable } from "./rooms";
import { mepSchedule, openingSchedule, wallSchedule } from "./schedules";
import { stairSteps } from "./stairs";
import { earthwork, retainingWalls, terrainModel } from "./terrain";

const a2 = (v: number) => `${v.toFixed(2)} m²`;
const f2 = (v: number) => v.toFixed(2);
const NUM = ["cero", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
const num = (n: number) => NUM[n] ?? String(n);
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const fecha = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(+d) ? iso : d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
};

/** Nombre de la cubierta en palabras. */
const ROOF: Record<string, string> = { flat: "azotea plana", gable: "cubierta a dos aguas", hip: "cubierta a cuatro aguas", shed: "cubierta a un agua", mansard: "cubierta amansardada", gambrel: "cubierta holandesa" };

export function memoria(p: Project): Doc {
  const info = p.info, B: Block[] = [];
  const areas = areaTable(p.levels), useful = areas.reduce((s, l) => s + l.useful, 0), built = areas.reduce((s, l) => s + l.built, 0);
  const ft = foundationType(p);

  // 1. datos generales
  B.push({ h: "1. Datos generales" });
  B.push({ table: [
    ["Proyecto", info.name || "Casa habitación unifamiliar"],
    ["Uso", "Habitacional unifamiliar"],
    ["Propietario", info.client || "—"],
    ["Ubicación", info.site?.address || "—"],
    ["Proyectista", info.author || "—"],
    ["Fecha", fecha(info.date)],
    ["Niveles", String(p.levels.length)],
    ["Superficie construida", a2(built)],
  ], widths: [1, 2.4] });

  // 2. descripción
  B.push({ h: "2. Descripción del proyecto" });
  B.push({ p: `Se trata de una casa habitación unifamiliar de ${num(p.levels.length)} nivel${p.levels.length > 1 ? "es" : ""}, con una superficie construida de ${a2(built)} y una superficie útil de ${a2(useful)}.` });
  for (const l of areas) {
    if (!l.rooms.length) continue;
    const names = l.rooms.map((r) => r.name.toLowerCase());
    B.push({ p: `${l.level}: ${list(names)}; superficie útil de ${a2(l.useful)}.` });
  }
  const stairs = p.levels.flatMap((l) => l.stairs);
  if (stairs.length) {
    const s = stairSteps(stairs[0]);
    B.push({ p: `La comunicación entre niveles es por una escalera de ${f2(stairs[0].width)} m de ancho, con ${s.n} peraltes de ${(s.riser * 100).toFixed(1)} cm y huellas de ${(s.tread * 100).toFixed(1)} cm.` });
  }

  // 3. cuadro de áreas
  B.push({ h: "3. Cuadro de áreas" });
  const rows: string[][] = [["Nivel", "Espacio", "Área (m²)"]];
  for (const l of areas) for (const r of l.rooms) rows.push([l.level, r.name, f2(r.area)]);
  for (const l of areas) rows.push([l.level, "Superficie construida", f2(l.built)]);
  rows.push(["Total", "Superficie útil / construida", `${f2(useful)} / ${f2(built)}`]);
  B.push({ table: rows, head: true, total: true, widths: [1.2, 2.4, 1] });

  // 4. sistema constructivo
  B.push({ h: "4. Sistema constructivo" });
  B.push({ h: "Cimentación", level: 2 });
  const z1 = stripSize(p, "ZC-1"), z2 = stripSize(p, "ZC-2"), pads = padFootings(p);
  if (ft.framedFloor) B.push({ p: `${ft.name}.` });
  else B.push({ p: `Zapatas corridas de concreto armado f'c = 200 kg/cm²: ZC-1 de ${(z1.B * 100).toFixed(0)} cm bajo muros de fachada y de carga, y ZC-2 de ${(z2.B * 100).toFixed(0)} cm bajo muros interiores, de ${(z1.h * 100).toFixed(0)} cm de peralte, armadas con ${z1.bars.replace(/\.$/, "")}. Desplante mínimo a 0.80 m sobre plantilla de concreto pobre de 5 cm. Cadena de desplante ${CADENAS[0].size} con ${CADENAS[0].bars} y ${CADENAS[0].ties}.${pads.length ? ` ${pads.length} zapata${pads.length > 1 ? "s" : ""} aislada${pads.length > 1 ? "s" : ""} ZA-1 de ${(padSize(p).B * 100).toFixed(0)} × ${(padSize(p).B * 100).toFixed(0)} cm bajo columnas.` : ""}` });
  B.push({ h: "Muros", level: 2 });
  const walls = wallSchedule(p);
  if (walls.length) B.push({ table: [["Tipo", "Material", "Longitud (m)", "Superficie (m²)"], ...walls.map((w) => [w.type, w.material, f2(w.length), f2(w.area)])], head: true, widths: [2, 1.6, 1, 1] });
  const ks = p.levels.reduce((s, l) => s + castillos(l).length, 0);
  B.push({ p: `Muros confinados con ${ks} castillos ${K1.mark} de ${K1.size} (${K1.bars}, ${K1.ties}, ${K1.fc}) en esquinas, intersecciones, jambas y a no más de 3.00 m, y con ${CADENAS[1].name.toLowerCase()} ${CADENAS[1].size} sobre todos los muros de carga.` });
  const slabs = p.levels.flatMap((l) => slabPanels(l)), bm = p.levels.reduce((s, l) => s + beams(l).length, 0);
  if (slabs.length || p.levels.some((l) => l.slabs.length)) {
    B.push({ h: "Losas y trabes", level: 2 });
    const e = slabs.length ? Math.max(...slabs.map((s) => s.e)) : 0.1;
    B.push({ p: `Losas macizas de concreto armado f'c = 250 kg/cm² de ${(e * 100).toFixed(0)} cm de espesor, armadas en dos direcciones según el plano estructural${bm ? `, con ${bm} trabe${bm > 1 ? "s" : ""} de concreto armado sobre claros y vanos grandes` : ""}.` });
  }
  const roofs = p.levels.flatMap((l) => l.roofs);
  if (roofs.length) {
    B.push({ h: "Cubierta", level: 2 });
    const kinds = [...new Set(roofs.map((r) => ROOF[r.kind] ?? r.kind))];
    const pitched = roofs.filter((r) => r.kind !== "flat");
    B.push({ p: `${list(kinds).replace(/^./, (c) => c.toUpperCase())}${pitched.length ? ` con pendiente de ${Math.round(pitched[0].pitch)}° y alero de ${f2(pitched[0].overhang)} m, terminada con teja cerámica` : ", con relleno de tezontle para dar pendiente del 2 %, entortado e impermeabilizante"}.` });
  }

  // terreno
  const tm = terrainModel(p);
  if (tm) {
    const ew = earthwork(tm), rw = retainingWalls(tm);
    B.push({ h: "Terreno", level: 2 });
    B.push({ p: `Terreno con pendiente del ${tm.t.slope} %. Se forma una plataforma horizontal con margen de ${f2(tm.t.pad)} m alrededor de la casa: corte de ${ew.cut.toFixed(1)} m³ y relleno de ${ew.fill.toFixed(1)} m³ compactado en capas de 20 cm.${rw.length ? ` Muros de contención en ${list(rw.map((w) => w.side))}, de hasta ${f2(Math.max(...rw.map((w) => w.max)))} m de altura.` : ""}` });
  }

  // 5. acabados
  const fin = p.levels.flatMap((l) => finishTable(l).map((r) => ({ l: l.name, r })));
  if (fin.length) {
    B.push({ h: "5. Acabados interiores" });
    B.push({ table: [["Espacio", "Piso", "Muros", "Plafón"], ...fin.map(({ l, r }) => [p.levels.length > 1 ? `${r.name} (${l})` : r.name, r.floor.name, r.wall.name, r.ceiling.name])], head: true, widths: [1.5, 1.3, 1.3, 1.3] });
    B.push({ p: "Exteriores con aplanado de mortero cemento-arena 1:4 acabado fino y pintura vinílica para exteriores, salvo indicación en las fachadas." });
  }

  // 6. carpintería
  const doors = openingSchedule(p, "door").types, wins = openingSchedule(p, "window").types;
  if (doors.length || wins.length) {
    B.push({ h: "6. Puertas y ventanas" });
    const rowsO = [["Marca", "Tipo", "Ancho × alto (m)", "Piezas"]];
    for (const d of [...doors, ...wins]) rowsO.push([d.mark, openingStyle({ kind: d.kind, style: d.style }).name, `${f2(d.width)} × ${f2(d.height)}`, String(d.count)]);
    B.push({ table: rowsO, head: true, widths: [0.7, 2.2, 1.3, 0.7] });
    B.push({ p: "Puertas interiores de tambor de madera con marco de madera de pino y herrajes de acero inoxidable; puerta de acceso de madera sólida o multipanel con cerradura de seguridad. Ventanas de aluminio con vidrio claro de 6 mm y mosquitero en las corredizas." });
  }

  // 7. instalaciones
  B.push({ h: "7. Instalaciones" });
  const el = mepSchedule(p, "elec"), pl = mepSchedule(p, "plum");
  const count = (rows: { label: string; count: number }[]) => rows.map((r) => `${r.label.toLowerCase()} (${r.count})`);
  B.push({ h: "Eléctrica", level: 2 });
  B.push({ p: `Acometida monofásica a 127 V desde la red de CFE, medidor y centro de carga con interruptores termomagnéticos; canalización oculta en poliducto naranja y conductores THW-LS de cobre calibre 12 AWG en alumbrado y contactos y 10 AWG en cargas mayores, según NOM-001-SEDE.${el.length ? ` Comprende ${list(count(el))}.` : ""}` });
  B.push({ h: "Hidráulica", level: 2 });
  B.push({ p: `Toma domiciliaria con medidor, cisterna y tinaco con bombeo; distribución de agua fría y caliente en CPVC o cobre tipo M con calentador de gas.${pl.length ? ` Comprende ${list(count(pl))}.` : ""}` });
  B.push({ h: "Sanitaria", level: 2 });
  B.push({ p: "Desagües en PVC sanitario con pendiente mínima del 2 %, registros a cada 10 m como máximo y en cada cambio de dirección, ventilación sobre la azotea y descarga al drenaje municipal. Bajadas de agua pluvial separadas de las negras." });

  // 8. reglamento
  const chk = checkProject(p);
  B.push({ h: "8. Revisión de reglamento" });
  const errs = chk.findings.filter((f) => f.sev === "error");
  B.push({ p: errs.length
    ? `Se revisaron ${chk.checks} condiciones en ${chk.rooms.length} espacios; ${errs.length} no cumple${errs.length > 1 ? "n" : ""} y se corregirá${errs.length > 1 ? "n" : ""} antes de la entrega:`
    : `Se revisaron ${chk.checks} condiciones en ${chk.rooms.length} espacios (áreas y lados mínimos, iluminación y ventilación naturales, altura libre, puertas y escaleras) y todas cumplen con las Normas Técnicas Complementarias para el Proyecto Arquitectónico.` });
  if (errs.length) B.push({ list: errs.map((f) => `${f.where} (${p.levels[f.level].name}) — ${f.topic}: ${f.msg}.`) });
  if (chk.rooms.length) B.push({ table: [["Espacio", "Uso", "Área (m²)", "Lado (m)", "Ventanas"], ...chk.rooms.map((r) => [r.name, RULES[r.use].label, f2(r.area), f2(r.side), r.area ? `${Math.round((r.glass / r.area) * 100)} %` : ""])], head: true, widths: [1.6, 1.4, 0.8, 0.8, 0.8] });

  // 9. normas
  B.push({ h: "9. Reglamentos y normas aplicables" });
  B.push({ list: REGLAMENTOS });
  B.push({ h: "10. Especificaciones generales" });
  for (const g of GENERALES) { B.push({ h: g.title, level: 2 }); B.push({ list: g.notes }); }

  B.push({ h: "Responsables" });
  B.push({ signs: [{ role: "Proyectista", name: info.author }, { role: "Director Responsable de Obra", name: "" }, { role: "Propietario", name: info.client }] });

  return { title: "Memoria descriptiva", subtitle: `${info.name || "Casa habitación unifamiliar"}${info.client ? ` · ${info.client}` : ""}`, blocks: B };
}
