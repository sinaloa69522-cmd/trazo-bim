// Juego ejecutivo en metros al estilo de México: títulos, columna lateral (cuadros, simbología y notas)
// de cada lámina y las dos láminas de detalles estructurales dibujadas en SVG (medidas en cm).
import type { ReactNode } from "react";
import { foundationType } from "../core/foundation";
import { furnitureDef } from "../core/furniture";
import { mepDef } from "../core/mep";
import type { Project } from "../core/model";
import { beams, CADENAS, castillos, columnSpec, K1, padFootings, padSize, slabPanels, stripFootings, stripSize } from "../core/mxStruct";
import { circuitSchedule, mepSchedule, runSchedule } from "../core/schedules";
import { fmtDim } from "../core/units";
import type { Editor } from "../editor/Editor";
import { SymbolIcon, SystemIcon } from "./MepIcons";
import { box, Ln, map, Note, Shape, type Frame, type XY } from "./PermitSheets";

export type MxKind = "mxport" | "mxnotas" | "mxcim" | "mxest" | "mxdet1" | "mxdet2" | "mxdet3" | "mxarq" | "hid" | "san" | "mxinst";
export const MX_KINDS: MxKind[] = ["mxport", "mxnotas", "mxcim", "mxest", "mxdet1", "mxdet2", "mxdet3", "mxarq", "hid", "san", "mxinst"];
export const MX_TEXT = ["mxport", "mxnotas", "mxdet1", "mxdet2", "mxdet3", "mxarq", "mxinst"];

/** Título de cada lámina del juego en metros (también las de arquitectura e instalación eléctrica). */
export const MX_TITLES: Record<string, string> = {
  mxport: "Portada e índice de planos",
  mxnotas: "Notas generales y abreviaturas",
  plan: "Planta arquitectónica",
  fach: "Fachadas",
  sec: "Cortes arquitectónicos",
  elev: "Elevaciones",
  mxcim: "Planta de cimentación",
  mxest: "Planta estructural de losa",
  mxdet1: "Detalles de cimentación, castillos y columnas",
  mxdet2: "Detalles de trabes, losas y escaleras",
  mxdet3: "Detalles estructurales complementarios",
  mxarq: "Detalles arquitectónicos",
  mxinst: "Detalles de instalaciones",
  elec: "Instalación eléctrica",
  hid: "Instalación hidráulica (plomería)",
  san: "Instalación sanitaria (hidrosanitario)",
};

// ---------- notas ----------

export const NOTES: Record<string, string[]> = {
  plan: [
    "Cotas en metros; niveles en metros referidos al nivel de piso terminado (N.P.T. ±0.00).",
    "Las cotas rigen sobre el dibujo. Verificar medidas y niveles en obra antes de construir.",
    "Muros de block hueco de concreto 12×20×40 cm o tabique rojo recocido, junteados con mortero cemento-arena 1:4.",
    "Aplanado interior de yeso y exterior de mortero cemento-arena 1:4 acabado fino.",
    "Firme de concreto f'c = 150 kg/cm² de 8 cm sobre relleno compactado al 90 % Proctor.",
    "Castillos, cadenas, trabes y losas: ver planos estructurales. Instalaciones: ver planos IE, IH e IS.",
  ],
  fach: [
    "Alturas en metros referidas al N.P.T. ±0.00 de planta baja.",
    "En azotea plana: pretil de 0.60 m con dala de remate y chaflán impermeabilizado.",
    "Bajadas de agua pluvial de PVC Ø 100 mm; ver instalación sanitaria.",
    "Acabados según la tabla; colores a elegir por el propietario.",
  ],
  sec: [
    "Alturas en metros referidas al N.P.T. ±0.00. N.L.A.: nivel de lecho alto de losa.",
    "Ver detalles de losa, trabes y escalera en los planos estructurales.",
    "Azotea con relleno de tezontle para dar pendiente del 2 %, entortado e impermeabilizante.",
  ],
  elev: [
    "Alzados de las cuatro fachadas con sus niveles en metros.",
    "Vanos de puertas y ventanas según la tabla de carpintería y cancelería.",
  ],
  mxcim: [
    "Cotas en metros; secciones y armados en cm.",
    "Capacidad de carga del terreno supuesta de 8 t/m². Confirmar con estudio de mecánica de suelos.",
    "Desplante mínimo a 0.80 m bajo el terreno natural, sobre terreno firme libre de materia orgánica.",
    "Plantilla de concreto pobre f'c = 100 kg/cm² de 5 cm bajo toda zapata.",
    "Concreto f'c = 200 kg/cm² en zapatas, cadenas y castillos; f'c = 250 kg/cm² en columnas y dados.",
    "Acero de refuerzo corrugado fy = 4200 kg/cm²; alambrón #2 fy = 2530 kg/cm².",
    "Recubrimiento libre: 5 cm en zapatas, 3 cm en cadenas y castillos, 2.5 cm en columnas.",
    "Traslapes de 40 diámetros; estribos cerrados con ganchos a 135°.",
    "Castillos y columnas anclados a la cimentación con escuadra de 30 cm.",
    "Relleno compactado en capas de 20 cm al 90 % Proctor. Impermeabilizar la cadena de desplante.",
    "Reglamento de Construcciones y NTC de Cimentaciones y de Concreto vigentes, o el reglamento local.",
  ],
  mxest: [
    "Losa maciza de concreto f'c = 250 kg/cm² perimetralmente apoyada y armada en dos direcciones.",
    "Espesor mínimo: perímetro del tablero / 180, no menor de 10 cm (NTC Concreto).",
    "Bastones de Vs #3 en apoyos continuos a L/4; recubrimiento libre de 2 cm.",
    "Cadena de cerramiento CC-1 sobre todos los muros que reciben losa.",
    "Trabes y columnas según cuadros; estribos cerrados a 135°.",
    "Huecos en losa: 2 Vs #3 adicionales en cada borde, 40 cm más allá del hueco.",
    "Curado húmedo 7 días mínimo. Descimbrar losas a los 14 días y trabes a los 21 días.",
    "Azotea con pendiente del 2 % hacia las bajadas pluviales, entortado e impermeabilizante.",
  ],
  mxdet: [
    "Medidas en cm, salvo indicación. Niveles en metros.",
    "Concreto f'c = 200 kg/cm² en zapatas, cadenas y castillos; f'c = 250 kg/cm² en columnas, trabes, losas y escaleras.",
    "Acero corrugado fy = 4200 kg/cm²; alambrón #2 fy = 2530 kg/cm².",
    "Varillas: #2 = 1/4\", #3 = 3/8\", #4 = 1/2\", #5 = 5/8\".",
    "Recubrimientos libres: zapatas 5 cm, cadenas y castillos 3 cm, trabes y columnas 2.5 cm, losas 2 cm.",
    "Traslapes de 40 diámetros, no más del 50 % en una misma sección; ganchos de estribos a 135°.",
    "Vibrar el concreto; curado húmedo mínimo de 7 días.",
    "Los detalles son típicos y aplican en todos los casos similares.",
  ],
  elec: [
    "Instalación conforme a la NOM-001-SEDE-2012.",
    "Tubería poliducto naranja de 13 mm (½\") en losas y muros; PVC conduit tipo pesado de 19 mm en piso y exterior.",
    "Conductores de cobre THW-LS 90 °C: cal. 14 AWG en alumbrado, cal. 12 AWG en contactos, cal. 10 AWG en cargas de 220 V.",
    "Conductor de puesta a tierra cal. 12 AWG desnudo en todos los circuitos; varilla copperweld de 3 m con registro.",
    "Contactos a 0.30 m s.N.P.T.; en baño y cocina a 1.20 m con protección contra falla a tierra (GFCI).",
    "Apagadores a 1.20 m s.N.P.T.; arbotantes a 2.00 m; centro de carga a 1.60 m.",
    "Interruptores termomagnéticos según el cuadro de cargas.",
  ],
  hid: [
    "Tubería de CPVC (o cobre tipo M) para agua fría y caliente; diámetros en mm.",
    "Alimentación desde la toma municipal con medidor y llave de paso, a cisterna y tinaco.",
    "Tinaco de 1100 L en azotea, a 2.00 m mínimo sobre la salida de la regadera más alta.",
    "Calentador de gas de paso o de depósito con jarro de aire y ventilación al exterior.",
    "Llave de paso a la entrada de cada núcleo sanitario y de la cocina.",
    "Prueba hidrostática a 8 kg/cm² durante 3 horas antes de tapar ranuras.",
    "No ranurar castillos, trabes ni columnas para alojar tuberías.",
  ],
  san: [
    "Tubería de PVC sanitario: Ø 100 mm en W.C. y colectores; Ø 50 mm en lavabos, regaderas, fregaderos y coladeras.",
    "Pendiente mínima del 2 % en ramales y colectores.",
    "Registros de 40×60 cm a cada 10 m como máximo, en cambios de dirección y al pie de las bajadas.",
    "Tubo de ventilación Ø 50 mm prolongado 0.30 m sobre la azotea.",
    "Coladeras con céspol (trampa hidráulica).",
    "Aguas pluviales separadas del drenaje sanitario; descarga a la red municipal o a pozo de absorción.",
    "Prueba de estanqueidad por llenado antes de rellenar las zanjas.",
  ],
};

export const Notes = ({ items, start }: { items: string[]; start?: number }) => <ol className="pnotes" start={start}>{items.map((n, i) => <li key={i}>{n}</li>)}</ol>;

export function MxNotes({ content }: { content: string }) {
  const n = NOTES[content];
  return n ? <><h4>Notas</h4><Notes items={n} /></> : null;
}

// ---------- símbolos de estructura ----------

function Sym({ children }: { children: ReactNode }) {
  return <svg width="14mm" height="5mm" viewBox="0 0 14 5" aria-hidden="true">{children}</svg>;
}
const STRUCT_SYMS: [string, ReactNode][] = [
  ["Eje de proyecto", <Sym><circle cx={2.4} cy={2.5} r={2} fill="#fff" stroke="#111" strokeWidth={0.25} /><text x={2.4} y={3.3} fontSize={2.2} textAnchor="middle">1</text><line x1={4.4} y1={2.5} x2={14} y2={2.5} stroke="#111" strokeWidth={0.2} strokeDasharray="2.5 .6 .5 .6" /></Sym>],
  ["Castillo K-1", <Sym><rect x={5.5} y={1} width={3} height={3} fill="#111" /></Sym>],
  ["Columna C-1", <Sym><rect x={4.5} y={0.5} width={4} height={4} fill="#555" stroke="#111" strokeWidth={0.2} /><path d="M4.5 .5l4 4M8.5 .5l-4 4" stroke="#fff" strokeWidth={0.25} /></Sym>],
  ["Zapata (contorno)", <Sym><rect x={1} y={0.6} width={12} height={3.8} fill="none" stroke="#111" strokeWidth={0.25} strokeDasharray="1.2 .6" /></Sym>],
  ["Trabe", <Sym><rect x={1} y={1.5} width={12} height={2} fill="#eee" stroke="#111" strokeWidth={0.25} strokeDasharray="1.6 .6" /></Sym>],
  ["Losa armada en dos direcciones", <Sym><path d="M3 2.5h8M7 .4v4.2M3 2.5l1-.6M3 2.5l1 .6M11 2.5l-1-.6M11 2.5l-1 .6" stroke="#111" strokeWidth={0.25} fill="none" /></Sym>],
];
export function StructLegend({ only }: { only?: string[] }) {
  return <table className="symleg"><tbody>{STRUCT_SYMS.filter(([n]) => !only || only.some((o) => n.startsWith(o))).map(([n, s]) => <tr key={n}><td>{s}</td><td>{n}</td></tr>)}</tbody></table>;
}

// ---------- equivalencias de nombres (México) ----------

const MX_FIXTURE: Record<string, string> = {
  luz: "Salida de centro (luminaria)", aplique: "Arbotante", interruptor: "Apagador sencillo", conmutador: "Apagador de escalera (3 vías)",
  enchufe: "Contacto doble polarizado 127 V", "enchufe-fuerza": "Contacto 220 V / 20 A", cuadro: "Centro de carga", acometida: "Acometida CFE y medidor",
  "toma-af": "Salida de agua fría", "toma-ac": "Salida de agua caliente", desague: "Salida de drenaje", sumidero: "Coladera con céspol",
  bajante: "Bajada de aguas (B.A.N. / B.A.P.)", llave: "Llave de paso", contador: "Medidor de agua", termo: "Calentador de agua",
  registro: "Registro sanitario 40×60 cm", tinaco: "Tinaco 1100 L",
};
const MX_SYS: Record<string, string> = { elec: "Tubería por losa y muro", af: "Tubería de agua fría", ac: "Tubería de agua caliente", san: "Tubería de drenaje (PVC)" };
const MX_CIRCUIT: Record<string, string> = { C1: "Alumbrado", C2: "Contactos generales", C3: "Contactos de fuerza (220 V)", C4: "Lavado y calentador", C5: "Contactos de cocina y baño" };

/** Carga por salida para el cuadro de cargas (W). */
const WATTS: Record<string, number> = { luz: 100, aplique: 60, enchufe: 180, "enchufe-fuerza": 1500, termo: 1500 };
const BREAKERS = [[15, "14"], [20, "12"], [30, "10"], [40, "8"], [50, "6"]] as const;

export interface LoadRow { circuit: string; name: string; points: number; watts: number; volts: number; amps: number; breaker: number; awg: string; poles: number }

/** Cuadro de cargas de un nivel: carga, corriente, protección y calibre por circuito. */
export function loadSchedule(p: Project, level: number): LoadRow[] {
  const lv = p.levels[level];
  return circuitSchedule(p, level).map((c) => {
    const fx = lv.fixtures.filter((f) => f.circuit === c.circuit);
    const watts = fx.reduce((t, f) => t + (WATTS[f.kind] ?? 0), 0), power = fx.some((f) => f.kind === "enchufe-fuerza"), volts = power ? 220 : 127;
    // los circuitos con contactos van a 20 A y cal. 12 como mínimo; el alumbrado puede ir a 15 A
    const min = fx.some((f) => f.kind.startsWith("enchufe") || f.kind === "termo") ? 20 : 15;
    const amps = watts / (volts * 0.9), [breaker, awg] = BREAKERS.find(([b]) => b >= Math.max(min, amps * 1.25)) ?? BREAKERS[BREAKERS.length - 1];
    return { circuit: c.circuit, name: MX_CIRCUIT[c.circuit] ?? c.name, points: c.points, watts, volts, amps, breaker, awg, poles: power ? 2 : 1 };
  });
}

/** Diámetros de alimentación y descarga por mueble sanitario. */
const MUEBLES: Record<string, { name: string; af: number; ac: number; dr: number; ud: number }> = {
  wc: { name: "W.C. (inodoro)", af: 13, ac: 0, dr: 100, ud: 4 },
  basin: { name: "Lavabo", af: 13, ac: 13, dr: 50, ud: 1 },
  shower: { name: "Regadera", af: 13, ac: 13, dr: 50, ud: 2 },
  bath: { name: "Tina", af: 13, ac: 13, dr: 50, ud: 3 },
  kitchen: { name: "Fregadero", af: 13, ac: 13, dr: 50, ud: 2 },
};
export function fixtureRows(p: Project, level: number) {
  const rows = new Map<string, { name: string; af: number; ac: number; dr: number; ud: number; n: number }>();
  for (const f of p.levels[level].furniture) {
    const d = furnitureDef(f.kind), m = MUEBLES[f.kind] ?? (d.ifc.cls === "IFCSANITARYTERMINAL" ? { name: d.label, af: 13, ac: 13, dr: 50, ud: 2 } : null);
    if (!m) continue;
    const r = rows.get(m.name) ?? { ...m, n: 0 };
    r.n++; rows.set(m.name, r);
  }
  return [...rows.values()];
}

/** Diagrama unifilar: acometida, medidor, interruptor general, centro de carga y circuitos derivados. */
function Unifilar({ rows }: { rows: LoadRow[] }) {
  const h = 8 + rows.length * 5, x0 = 4;
  return (
    <svg width="100%" viewBox={`0 0 100 ${h}`} style={{ display: "block" }} fontSize={2.4} fontFamily="'IBM Plex Sans Condensed','Arial Narrow',sans-serif">
      <text x={x0} y={4}>CFE</text>
      <line x1={x0 + 6} y1={3} x2={20} y2={3} stroke="#111" strokeWidth={0.3} />
      <circle cx={23} cy={3} r={3} fill="none" stroke="#111" strokeWidth={0.3} /><text x={23} y={3.9} textAnchor="middle">M</text>
      <line x1={26} y1={3} x2={34} y2={3} stroke="#111" strokeWidth={0.3} />
      <path d="M34 3l4-2.4M38 3h4" stroke="#111" strokeWidth={0.3} fill="none" /><text x={34} y={8} fontSize={2}>Int. general</text>
      <rect x={42} y={0.5} width={14} height={h - 3} fill="none" stroke="#111" strokeWidth={0.35} />
      <text x={49} y={h - 0.6} textAnchor="middle" fontSize={2}>Centro de carga</text>
      {rows.map((r, i) => {
        const y = 4 + i * 5;
        return <g key={r.circuit}>
          <path d={`M56 ${y}h4l3 -2M63 ${y}h6`} stroke="#111" strokeWidth={0.3} fill="none" />
          <text x={70} y={y + 0.8}>{r.circuit} · {r.poles}×{r.breaker} A · cal. {r.awg}</text>
        </g>;
      })}
    </svg>
  );
}

// ---------- columna lateral ----------

export function MxSide({ ed, content, level }: { ed: Editor; content: string; level: number }) {
  const p = ed.project, lv = p.levels[level];
  if (content === "mxcim") {
    const zs = stripFootings(p), pads = padFootings(p), c1 = stripSize(p, "ZC-1"), c2 = stripSize(p, "ZC-2"), za = padSize(p);
    const has = (m: string) => zs.some((z) => z.mark === m);
    return <div className="tables">
      <h4>Cuadro de zapatas</h4>
      <table><thead><tr><th>Marca</th><th>Tipo</th><th>Sección</th><th>Armado</th></tr></thead><tbody>
        {has("ZC-1") && <tr><td><b>ZC-1</b></td><td>Corrida, muros de fachada</td><td>{Math.round(c1.B * 100)} × {Math.round(c1.h * 100)}</td><td>{c1.bars}</td></tr>}
        {has("ZC-2") && <tr><td><b>ZC-2</b></td><td>Corrida, muros interiores</td><td>{Math.round(c2.B * 100)} × {Math.round(c2.h * 100)}</td><td>{c2.bars}</td></tr>}
        <tr><td><b>ZA-1</b></td><td>Aislada, bajo columna ({pads.length})</td><td>{Math.round((pads[0]?.B ?? za.B) * 100)} × {Math.round((pads[0]?.B ?? za.B) * 100)} × {Math.round(za.h * 100)}</td><td>{za.bars}</td></tr>
      </tbody></table>
      <h4>Castillos, columnas y cadenas</h4>
      <VerticalTable ed={ed} level={level} desplante />
      <h4>Simbología</h4>
      <StructLegend />
      <MxNotes content="mxcim" />
      <p className="note">Cimentación de la planta baja: {foundationType(p).id === "slab" ? "zapatas corridas de concreto armado con cadena de desplante" : "ver el tipo elegido"}; {castillos(lv).length} castillos y {lv.columns.length} columnas.</p>
    </div>;
  }
  if (content === "mxest") {
    const bs = beams(lv), sl = slabPanels(lv), types = [...new Map(bs.map((b) => [b.mark, b])).values()];
    const ls = [...new Map(sl.map((s) => [s.mark, s])).values()].sort((a, b) => a.e - b.e);
    return <div className="tables">
      <h4>Cuadro de losas</h4>
      {ls.length ? <table><thead><tr><th>Marca</th><th>Espesor</th><th>Armado</th><th className="r">Tableros</th></tr></thead><tbody>
        {ls.map((s) => <tr key={s.mark}><td><b>{s.mark}</b></td><td>{Math.round(s.e * 100)} cm maciza</td><td>{s.bars}</td><td className="r">{sl.filter((x) => x.mark === s.mark).length}</td></tr>)}
      </tbody></table> : <p className="empty">Define habitaciones para calcular los tableros de losa.</p>}
      <h4>Cuadro de trabes</h4>
      {types.length ? <table><thead><tr><th>Marca</th><th>b × h</th><th>Lecho sup.</th><th>Lecho inf.</th><th>Estribos</th></tr></thead><tbody>
        {types.map((b) => <tr key={b.mark}><td><b>{b.mark}</b></td><td>{Math.round(b.bw * 100)} × {Math.round(b.h * 100)}</td><td>{b.top}</td><td>{b.bottom}</td><td>E #3 @ {Math.round((b.h - 0.04) * 50)} cm</td></tr>)}
      </tbody></table> : <p className="empty">Sin trabes: no hay columnas ni vanos de 1.80 m o más.</p>}
      <h4>Castillos, columnas y cadenas</h4>
      <VerticalTable ed={ed} level={level} />
      <h4>Simbología</h4>
      <StructLegend only={["Eje", "Castillo", "Columna", "Trabe", "Losa"]} />
      <MxNotes content="mxest" />
    </div>;
  }
  if (content === "mxdet1" || content === "mxdet2" || content === "mxdet3") return <div className="tables"><h4>Especificaciones</h4><Notes items={NOTES.mxdet} /><h4>Cuadro de castillos y cadenas</h4><VerticalTable ed={ed} level={0} desplante /></div>;
  if (content === "elec") {
    const legend = mepSchedule(p, "elec", level), rows = loadSchedule(p, level), runs = runSchedule(p, "elec", level);
    const W = rows.reduce((t, r) => t + r.watts, 0);
    return <div className="tables">
      <h4>Simbología</h4>
      {legend.length ? <table className="legend"><tbody>{legend.map((r) => <tr key={r.kind}><td><SymbolIcon kind={r.kind} size={16} /></td><td>{MX_FIXTURE[r.kind] ?? r.label}</td><td className="r">{r.count}</td></tr>)}
        {runs.map((r) => <tr key={r.system}><td><SystemIcon sys={r.system} w={26} /></td><td>{MX_SYS[r.system]} ({fmtDim(r.length)} m)</td><td /></tr>)}
      </tbody></table> : <p className="empty">Sin salidas eléctricas en este nivel.</p>}
      <h4>Cuadro de cargas</h4>
      {rows.length ? <table><thead><tr><th>Circ.</th><th>Uso</th><th className="r">Sal.</th><th className="r">W</th><th className="r">A</th><th className="r">Prot.</th><th className="r">Cal.</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.circuit}><td><b>{r.circuit}</b></td><td>{r.name}</td><td className="r">{r.points}</td><td className="r">{r.watts}</td><td className="r">{r.amps.toFixed(1)}</td><td className="r">{r.poles}×{r.breaker}</td><td className="r">{r.awg}</td></tr>)}
        <tr className="tot"><td colSpan={3}>Carga instalada</td><td className="r">{W}</td><td colSpan={3} className="r">{W > 5000 ? "2F-3H 220/127 V" : "1F-2H 127 V"}</td></tr>
      </tbody></table> : <p className="empty">Asigna circuitos a las salidas para el cuadro de cargas.</p>}
      {rows.length > 0 && <><h4>Diagrama unifilar</h4><Unifilar rows={rows} /></>}
      <MxNotes content="elec" />
    </div>;
  }
  if (content === "hid" || content === "san") {
    const sys = content === "hid" ? ["af", "ac"] : ["san"];
    const legend = mepSchedule(p, "plum", level).filter((r) => sys.includes(mepDef(r.kind).sys)), runs = runSchedule(p, "plum", level).filter((r) => sys.includes(r.system));
    const fx = fixtureRows(p, level);
    return <div className="tables">
      <h4>Simbología</h4>
      {legend.length || runs.length ? <table className="legend"><tbody>
        {legend.map((r) => <tr key={r.kind}><td><SymbolIcon kind={r.kind} size={16} /></td><td>{MX_FIXTURE[r.kind] ?? r.label}</td><td className="r">{r.count}</td></tr>)}
        {runs.map((r) => <tr key={r.system}><td><SystemIcon sys={r.system} w={26} /></td><td>{MX_SYS[r.system]}</td><td className="r">{fmtDim(r.length)} m</td></tr>)}
      </tbody></table> : <p className="empty">Sin salidas ni tuberías {content === "hid" ? "de agua" : "de drenaje"} en este nivel.</p>}
      <h4>Cuadro de muebles</h4>
      {fx.length ? (content === "hid"
        ? <table><thead><tr><th>Mueble</th><th className="r">Pzas</th><th className="r">A.F. mm</th><th className="r">A.C. mm</th></tr></thead><tbody>
          {fx.map((r) => <tr key={r.name}><td>{r.name}</td><td className="r">{r.n}</td><td className="r">{r.af || "—"}</td><td className="r">{r.ac || "—"}</td></tr>)}</tbody></table>
        : <table><thead><tr><th>Mueble</th><th className="r">Pzas</th><th className="r">Desc. mm</th><th className="r">U.D.</th></tr></thead><tbody>
          {fx.map((r) => <tr key={r.name}><td>{r.name}</td><td className="r">{r.n}</td><td className="r">{r.dr}</td><td className="r">{r.ud * r.n}</td></tr>)}
          <tr className="tot"><td colSpan={3}>Unidades de descarga</td><td className="r">{fx.reduce((t, r) => t + r.ud * r.n, 0)}</td></tr></tbody></table>)
        : <p className="empty">Sin muebles sanitarios en este nivel.</p>}
      <MxNotes content={content} />
    </div>;
  }
  return null;
}

export function VerticalTable({ ed, level, desplante }: { ed: Editor; level: number; desplante?: boolean }) {
  const cols = ed.project.levels[level]?.columns ?? [], cs = [...new Map(cols.map((c) => { const s = columnSpec(c); return [s.size, s]; })).values()];
  return <table><thead><tr><th>Marca</th><th>Sección</th><th>Armado</th><th>Estribos</th></tr></thead><tbody>
    <tr><td><b>{K1.mark}</b></td><td>{K1.size}</td><td>{K1.bars}</td><td>{K1.ties}</td></tr>
    {cs.map((c) => <tr key={c.size}><td><b>{c.mark}</b></td><td>{c.size}</td><td>{c.bars}</td><td>{c.ties}</td></tr>)}
    {CADENAS.filter((c) => desplante || c.mark !== "CD-1").map((c) => <tr key={c.mark}><td><b>{c.mark}</b></td><td>{c.size}</td><td>{c.bars}</td><td>{c.ties}</td></tr>)}
  </tbody></table>;
}

// ---------- láminas de detalles (SVG en mm; dibujos en cm) ----------

export type Box = { x: number; y: number; w: number; h: number };
export const CONC = "#e3e3e3";
export const FONT = "'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif";

export function Title({ x, y, n, title, scale, sheet }: { x: number; y: number; n: number; title: string; scale: string; sheet: string }) {
  return (
    <g fontFamily={FONT}>
      <circle cx={x + 4} cy={y} r={3.6} fill="none" stroke="#111" strokeWidth={0.3} />
      <line x1={x + 0.4} y1={y} x2={x + 7.6} y2={y} stroke="#111" strokeWidth={0.2} />
      <text x={x + 4} y={y - 0.6} fontSize={2.4} textAnchor="middle" fontWeight={600}>{n}</text>
      <text x={x + 4} y={y + 2.6} fontSize={1.6} textAnchor="middle">{sheet}</text>
      <text x={x + 10} y={y - 0.3} fontSize={3.2} fontWeight={600}>{title.toUpperCase()}</text>
      <line x1={x + 10} y1={y + 0.6} x2={x + 10 + title.length * 2.2} y2={y + 0.6} stroke="#111" strokeWidth={0.3} />
      <text x={x + 10} y={y + 3.4} fontSize={2}>ESC. {scale}</text>
    </g>
  );
}

export const T = ({ f, at, s, size = 1.9, anchor = "middle", rot = 0 }: { f: Frame; at: XY; s: string; size?: number; anchor?: "start" | "middle" | "end"; rot?: number }) => {
  const [x, y] = map(f, at);
  return <text x={x} y={y} fontSize={size} textAnchor={anchor} fontFamily={FONT} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{s}</text>;
};
/** Cota en cm entre a y b (horizontal o vertical), desplazada off unidades. */
export function Dim({ f, a, b, off, s }: { f: Frame; a: XY; b: XY; off: number; s?: string }) {
  const horiz = Math.abs(b[1] - a[1]) < 1e-6, n: XY = horiz ? [0, off] : [off, 0];
  const A: XY = [a[0] + n[0], a[1] + n[1]], B: XY = [b[0] + n[0], b[1] + n[1]], L = horiz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  const tick = (p: XY) => <Ln f={f} p={[[p[0] - 1, p[1] - 1], [p[0] + 1, p[1] + 1]]} w={0.2} />;
  const mid: XY = horiz ? [(A[0] + B[0]) / 2, A[1] + (off >= 0 ? 1.2 : -3.5)] : [A[0] + (off >= 0 ? 3.2 : -1.2), (A[1] + B[1]) / 2];
  return <g>
    <Ln f={f} p={[a, A]} w={0.12} /><Ln f={f} p={[b, B]} w={0.12} /><Ln f={f} p={[A, B]} w={0.15} />{tick(A)}{tick(B)}
    <T f={f} at={mid} s={s ?? String(Math.round(L))} size={1.8} rot={horiz ? 0 : -90} />
  </g>;
}
export const Bar = ({ f, at, r = 0.5 }: { f: Frame; at: XY; r?: number }) => { const [x, y] = map(f, at); return <circle cx={x} cy={y} r={r} fill="#111" />; };
/** Sección de concreto rectangular con estribo y varillas en las esquinas (y n extra por cara). */
export function Section({ f, x0, y0, w, h, rec = 3, bars = 4, label }: { f: Frame; x0: number; y0: number; w: number; h: number; rec?: number; bars?: number; label?: string }) {
  const r = rec + 1, pts: XY[] = [[x0 + r, y0 + r], [x0 + w - r, y0 + r], [x0 + w - r, y0 + h - r], [x0 + r, y0 + h - r]];
  if (bars === 6) pts.push([x0 + w / 2, y0 + r], [x0 + w / 2, y0 + h - r]);
  if (bars === 8) pts.push([x0 + w / 2, y0 + r], [x0 + w / 2, y0 + h - r], [x0 + r, y0 + h / 2], [x0 + w - r, y0 + h / 2]);
  if (bars === 5) pts.splice(0, 2, [x0 + r, y0 + r], [x0 + w / 2, y0 + r], [x0 + w - r, y0 + r]);
  return <g>
    <Shape f={f} p={box(x0, y0, x0 + w, y0 + h)} fill={CONC} w={0.35} />
    <Shape f={f} p={box(x0 + rec, y0 + rec, x0 + w - rec, y0 + h - rec)} w={0.2} />
    {pts.map((p, i) => <Bar key={i} f={f} at={p} r={f.k * 0.7} />)}
    {label && <T f={f} at={[x0 + w / 2, y0 + h + 2.5]} s={label} />}
  </g>;
}
export const Earth = ({ f, x0, x1, y0, y1 }: { f: Frame; x0: number; x1: number; y0: number; y1: number }) => <Shape f={f} p={box(x0, y0, x1, y1)} fill="url(#mxearth)" w={0} />;
export const Block = ({ f, x0, x1, y0, y1 }: { f: Frame; x0: number; x1: number; y0: number; y1: number }) => {
  const ls: ReactNode[] = [];
  for (let y = y0 + 20; y < y1 - 0.5; y += 20) ls.push(<Ln key={y} f={f} p={[[x0, y], [x1, y]]} w={0.12} />);
  return <><Shape f={f} p={box(x0, y0, x1, y1)} fill="url(#mxblock)" w={0.3} />{ls}</>;
};
export const Break = ({ f, x0, x1, y }: { f: Frame; x0: number; x1: number; y: number }) => {
  const m = (x0 + x1) / 2, d = (x1 - x0) * 0.12;
  return <Ln f={f} p={[[x0 - 3, y], [m - d, y], [m - d / 2, y + 3], [m + d / 2, y - 3], [m + d, y], [x1 + 3, y]]} w={0.15} />;
};
/** Notas en columna a la derecha del dibujo. */
export function NoteCol({ f, x, y0, items }: { f: Frame; x: number; y0: number; items: [XY, string][] }) {
  let y = y0;
  return <>{items.map(([at, text], i) => { const el = <Note key={i} f={f} at={at} x={x} y={y} text={text} />; y += 5 + Math.floor(text.length / 35) * 2.2; return el; })}</>;
}

export function Grid({ b, children }: { b: Box; children: ReactNode }) {
  return (
    <svg className="pdetails" style={{ left: `${b.x}mm`, top: `${b.y}mm`, width: `${b.w}mm`, height: `${b.h}mm` }} viewBox={`0 0 ${b.w} ${b.h}`}>
      <defs>
        <pattern id="mxearth" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V1.6" stroke="#777" strokeWidth="0.12" /></pattern>
        <pattern id="mxblock" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.4" height="1.4" fill="#fff" /><path d="M0 0V1.4" stroke="#999" strokeWidth="0.1" /></pattern>
        <pattern id="mxfill" width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.25" fill="#666" /><circle cx="1.5" cy="1.5" r="0.2" fill="#666" /></pattern>
      </defs>
      <line x1={b.w / 2} y1={4} x2={b.w / 2} y2={b.h - 4} stroke="#111" strokeWidth={0.2} />
      <line x1={4} y1={b.h / 2} x2={b.w - 4} y2={b.h / 2} stroke="#111" strokeWidth={0.2} />
      {children}
    </svg>
  );
}
export const cellsOf = (b: Box) => { const cw = b.w / 2, ch = b.h / 2; return { cw, ch, at: (i: number) => ({ x: (i % 2) * cw, y: Math.floor(i / 2) * ch }) }; };

/** EST: zapata corrida, zapata aislada, castillo y columna, cadenas. */
export function MxFoundationDetails({ box: b, p, sheet }: { box: Box; p: Project; sheet: string }) {
  const { ch, at } = cellsOf(b), z = stripSize(p, "ZC-1"), za = padSize(p);
  const B = Math.round(z.B * 100), h = Math.round(z.h * 100), BA = Math.round(za.B * 100), hA = Math.round(za.h * 100);
  const col = p.levels[0]?.columns[0], cw = col ? Math.round(col.w * 100) : 30, cs = columnSpec(col ?? { w: 0.3, d: 0.3 });
  const k20 = 0.68, f1: Frame = { ox: at(0).x + 18 + (B / 2 + 10) * k20, oy: at(0).y + ch - 14, k: k20 };
  const f2: Frame = { ox: at(1).x + 18 + (BA / 2 + 20) * 0.44, oy: at(1).y + ch - 16, k: 0.44 };
  const f3: Frame = { ox: at(2).x + 14, oy: at(2).y + ch - 22, k: 1.2 };
  const f4: Frame = { ox: at(3).x + 14, oy: at(3).y + ch - 22, k: 1.4 };
  const top = h + 80, nx1 = at(0).x + b.w / 2 * 0.62, nx2 = at(1).x + b.w / 2 * 0.62;
  return <Grid b={b}>
    {/* 1. zapata corrida */}
    <Earth f={f1} x0={-B / 2 - 25} x1={-7.5} y0={-5} y1={h + 60} />
    <Earth f={f1} x0={7.5} x1={B / 2 + 25} y0={-5} y1={top - 8} />
    <Shape f={f1} p={box(-B / 2 - 5, -5, B / 2 + 5, 0)} fill="url(#mxfill)" w={0.2} />
    <Shape f={f1} p={box(-B / 2, 0, B / 2, h)} fill={CONC} w={0.35} />
    <Block f={f1} x0={-7.5} x1={7.5} y0={h} y1={h + 60} />
    <Section f={f1} x0={-7.5} y0={h + 60} w={15} h={20} />
    <Block f={f1} x0={-7.5} x1={7.5} y0={top} y1={top + 45} />
    <Break f={f1} x0={-7.5} x1={7.5} y={top + 45} />
    <Shape f={f1} p={box(7.5, top - 8, B / 2 + 25, top)} fill={CONC} w={0.25} />
    <Ln f={f1} p={[[-B / 2 + 5, 5], [B / 2 - 5, 5]]} w={0.35} />
    {[-B / 2 + 8, 0, B / 2 - 8].map((x) => <Bar key={x} f={f1} at={[x, 7]} r={0.35} />)}
    <Ln f={f1} p={[[-B / 2 - 25, h + 60], [-7.5, h + 60]]} w={0.3} />
    <T f={f1} at={[-B / 2 - 24, h + 62]} s="N.T.N." anchor="start" />
    <T f={f1} at={[B / 2 + 24, top + 2]} s="N.P.T. ±0.00" anchor="end" />
    <Dim f={f1} a={[-B / 2, 0]} b={[B / 2, 0]} off={-9} />
    <Dim f={f1} a={[-B / 2, 0]} b={[-B / 2, h]} off={-6} />
    <Dim f={f1} a={[-B / 2 - 25, 0]} b={[-B / 2 - 25, h + 60]} off={-4} s={String(h + 60)} />
    <NoteCol f={f1} x={nx1} y0={at(0).y + 14} items={[
      [[0, top + 30], "Muro de block 15 cm (ver planta)"],
      [[6, top - 10], "Cadena de desplante CD-1 15×20, 4 Vs #3, E #2 @ 20"],
      [[B / 2 + 15, top - 4], "Firme de concreto 8 cm f'c = 150 sobre relleno compactado"],
      [[-4, h + 30], "Muro de enrase de block relleno de concreto"],
      [[B / 4, 5], `Zapata ZC-1 ${B}×${h}: ${z.bars}`],
      [[B / 2, -3], "Plantilla de concreto f'c = 100, 5 cm"],
    ]} />
    <Title x={at(0).x + 6} y={at(0).y + ch - 7} n={1} title="Zapata corrida ZC-1" scale="1:15" sheet={sheet} />

    {/* 2. zapata aislada */}
    <Earth f={f2} x0={-BA / 2 - 20} x1={BA / 2 + 20} y0={-5} y1={hA + 70} />
    <Shape f={f2} p={box(-BA / 2 - 5, -5, BA / 2 + 5, 0)} fill="url(#mxfill)" w={0.2} />
    <Shape f={f2} p={box(-BA / 2, 0, BA / 2, hA)} fill={CONC} w={0.35} />
    <Shape f={f2} p={box(-(cw + 10) / 2, hA, (cw + 10) / 2, hA + 70)} fill={CONC} w={0.35} />
    <Shape f={f2} p={box(-cw / 2, hA + 70, cw / 2, hA + 160)} fill={CONC} w={0.35} />
    <Break f={f2} x0={-cw / 2} x1={cw / 2} y={hA + 160} />
    <Ln f={f2} p={[[-BA / 2 + 5, 6], [BA / 2 - 5, 6]]} w={0.35} />
    {Array.from({ length: 7 }, (_, i) => -BA / 2 + 8 + (i * (BA - 16)) / 6).map((x) => <Bar key={x} f={f2} at={[x, 8]} r={0.3} />)}
    {[-cw / 2 + 4, cw / 2 - 4].map((x) => <Ln key={x} f={f2} p={[[x + (x < 0 ? 30 : -30), 9], [x, 9], [x, hA + 160]]} w={0.35} />)}
    <Ln f={f2} p={[[-BA / 2 - 20, hA + 70], [BA / 2 + 20, hA + 70]]} w={0.3} />
    <T f={f2} at={[BA / 2 + 19, hA + 72]} s="N.T.N." anchor="end" />
    <Dim f={f2} a={[-BA / 2, 0]} b={[BA / 2, 0]} off={-10} />
    <Dim f={f2} a={[-BA / 2, 0]} b={[-BA / 2, hA]} off={-6} />
    <Dim f={f2} a={[-(cw + 10) / 2, hA]} b={[-(cw + 10) / 2, hA + 70]} off={-6} />
    <NoteCol f={f2} x={nx2} y0={at(1).y + 14} items={[
      [[0, hA + 130], `Columna C-1 ${cs.size}: ${cs.bars}, ${cs.ties}`],
      [[(cw + 10) / 4, hA + 40], `Dado ${cw + 10}×${cw + 10} cm, f'c = 250`],
      [[cw / 2 - 4, 20], "Anclaje de varillas con escuadra de 30 cm"],
      [[-BA / 4, 7], `Zapata ZA-1 ${BA}×${BA}×${hA}: ${za.bars}`],
      [[BA / 2, -3], "Plantilla f'c = 100, 5 cm"],
    ]} />
    <Title x={at(1).x + 6} y={at(1).y + ch - 7} n={2} title="Zapata aislada ZA-1" scale="1:25" sheet={sheet} />

    {/* 3. castillo y columna */}
    <Section f={f3} x0={0} y0={0} w={15} h={15} label="K-1  15×15" />
    <Dim f={f3} a={[0, 0]} b={[15, 0]} off={-4} />
    <Section f={f3} x0={30} y0={0} w={cw} h={cw} rec={2.5} bars={cs.bars.startsWith("8") ? 8 : 6} label={`C-1  ${cs.size}`} />
    <Dim f={f3} a={[30, 0]} b={[30 + cw, 0]} off={-4} />
    <T f={f3} at={[0, 46]} s={`K-1: ${K1.bars}, ${K1.ties}`} anchor="start" size={2} />
    <T f={f3} at={[0, 42.5]} s={`C-1: ${cs.bars}, ${cs.ties}`} anchor="start" size={2} />
    <T f={f3} at={[0, 39]} s="Castillos a cada 3.00 m máx., en esquinas, intersecciones y vanos" anchor="start" size={2} />
    <Title x={at(2).x + 6} y={at(2).y + ch - 7} n={3} title="Castillo K-1 y columna C-1" scale="1:10" sheet={sheet} />

    {/* 4. cadenas */}
    <Section f={f4} x0={0} y0={0} w={15} h={20} label="CD-1  15×20" />
    <Section f={f4} x0={35} y0={0} w={15} h={20} label="CC-1  15×20" />
    <Shape f={f4} p={box(28, 20, 57, 31)} fill={CONC} w={0.3} />
    <T f={f4} at={[42.5, 32.5]} s="Losa (colada monolítica con la cadena)" size={1.8} />
    <Dim f={f4} a={[0, 0]} b={[0, 20]} off={-3} />
    <Dim f={f4} a={[0, 0]} b={[15, 0]} off={-4} />
    <T f={f4} at={[0, 40]} s="4 Vs #3 y E #2 @ 20 cm; ganchos a 135°" anchor="start" size={2} />
    <Title x={at(3).x + 6} y={at(3).y + ch - 7} n={4} title="Cadenas de desplante y cerramiento" scale="1:10" sheet={sheet} />
  </Grid>;
}

/** EST: trabe, losa maciza, escalera de concreto y pretil de azotea. */
export function MxStructDetails({ box: b, p, sheet }: { box: Box; p: Project; sheet: string }) {
  const { ch, at } = cellsOf(b), bm = p.levels.flatMap((l) => beams(l))[0];
  const bw = bm ? Math.round(bm.bw * 100) : 20, bh = bm ? Math.round(bm.h * 100) : 40;
  const sl = p.levels.flatMap((l) => slabPanels(l)).sort((x, y) => y.e - x.e)[0], e = sl ? Math.round(sl.e * 100) : 10;
  const st = p.levels.flatMap((l) => l.stairs)[0], H = st ? Math.round(st.height * 100) : 270;
  const n = Math.max(2, Math.ceil(H / 18)), ri = H / n, tr = 25;
  const f5: Frame = { ox: at(0).x + 34, oy: at(0).y + ch - 30, k: 1.2 };
  const f6: Frame = { ox: at(1).x + 14, oy: at(1).y + ch - 30, k: 0.42 };
  const f7: Frame = { ox: at(2).x + 14, oy: at(2).y + ch - 22, k: Math.min(0.2, (b.w / 2 - 70) / (n * tr)) };
  const f8: Frame = { ox: at(3).x + 22, oy: at(3).y + ch - 34, k: 0.5 };
  const nx = (i: number) => at(i).x + (b.w / 2) * 0.62;
  return <Grid b={b}>
    {/* 5. trabe */}
    <Section f={f5} x0={0} y0={0} w={bw} h={bh} rec={2.5} bars={5} />
    <Shape f={f5} p={box(-15, bh, bw + 15, bh + e)} fill={CONC} w={0.3} />
    <Dim f={f5} a={[0, 0]} b={[bw, 0]} off={-4} />
    <Dim f={f5} a={[0, 0]} b={[0, bh]} off={-4} />
    <NoteCol f={f5} x={nx(0)} y0={at(0).y + 14} items={[
      [[bw / 2, bh + e / 2], `Losa e = ${e} cm colada monolítica`],
      [[bw - 3.5, bh - 3.5], `Lecho superior: ${bm?.top ?? "2 Vs #4"}`],
      [[bw - 3.5, 3.5], `Lecho inferior: ${bm?.bottom ?? "3 Vs #4"}`],
      [[bw, bh / 2], `E #3 @ ${Math.round((bh - 4) / 4)} cm en L/4 de los apoyos y @ ${Math.round((bh - 4) / 2)} cm al centro`],
    ]} />
    <Title x={at(0).x + 6} y={at(0).y + ch - 7} n={5} title={`Trabe ${bm?.mark ?? "T-1"} ${bw}×${bh}`} scale="1:10" sheet={sheet} />

    {/* 6. losa maciza sobre muros */}
    {[[-15, 0], [185, 200]].map(([x0, x1]) => <g key={x0}><Block f={f6} x0={x0} x1={x1} y0={-40} y1={0} /><Section f={f6} x0={x0} y0={0} w={15} h={20} /></g>)}
    <Shape f={f6} p={box(-15, 20, 200, 20 + e)} fill={CONC} w={0.35} />
    <Ln f={f6} p={[[-12, 23], [197, 23]]} w={0.3} />
    {Array.from({ length: 10 }, (_, i) => 5 + i * 19).map((x) => <Bar key={x} f={f6} at={[x, 24.2]} r={0.3} />)}
    <Ln f={f6} p={[[-12, 20 + e - 2], [50, 20 + e - 2], [53, 24]]} w={0.3} />
    <Ln f={f6} p={[[197, 20 + e - 2], [135, 20 + e - 2], [132, 24]]} w={0.3} />
    <Dim f={f6} a={[200, 20]} b={[200, 20 + e]} off={5} />
    <Dim f={f6} a={[0, 20]} b={[50, 20]} off={-28} s="L/4" />
    <NoteCol f={f6} x={nx(1)} y0={at(1).y + 14} items={[
      [[100, 20 + e / 2], `Losa maciza ${sl?.mark ?? "L-1"} e = ${e} cm, f'c = 250`],
      [[90, 23], `Armado inferior ${sl?.bars ?? "Vs #3 @ 20 cm a.s."}`],
      [[30, 20 + e - 2], "Bastones Vs #3 a L/4 en los apoyos"],
      [[192, 10], "Cadena de cerramiento CC-1 15×20"],
      [[5, -20], "Muro de block 15 cm"],
    ]} />
    <Title x={at(1).x + 6} y={at(1).y + ch - 7} n={6} title="Losa maciza y apoyo en muros" scale="1:25" sheet={sheet} />

    {/* 7. escalera */}
    {(() => {
      const prof: XY[] = [[0, 0]];
      for (let i = 0; i < n; i++) { prof.push([i * tr, (i + 1) * ri]); prof.push([(i + 1) * tr, (i + 1) * ri]); }
      const L = n * tr, ang = Math.atan2(H, L), d = 12 / Math.cos(ang);
      const under: XY[] = [[L, H - d], [0 + 12 * Math.tan(ang), 0]];
      return <g>
        <Shape f={f7} p={[...prof, ...under]} fill={CONC} w={0.35} />
        <Ln f={f7} p={[[4, 3], [L - 4, H - d + 3]]} w={0.4} />
        <Ln f={f7} p={[[-10, 0], [L + 30, 0]]} w={0.3} />
        <Shape f={f7} p={box(L, H - 12, L + 60, H)} fill={CONC} w={0.3} />
        <Dim f={f7} a={[0, 0]} b={[L, 0]} off={-8} s={`${n - 1} huellas de ${tr}`} />
        <Dim f={f7} a={[L + 60, 0]} b={[L + 60, H]} off={6} s={`${n} peraltes de ${ri.toFixed(1)}`} />
        <NoteCol f={f7} x={nx(2)} y0={at(2).y + 14} items={[
          [[L * 0.5, H * 0.5 - 4], "Rampa de concreto f'c = 250, e = 12 cm"],
          [[L * 0.3, H * 0.3 - 3], "Armado longitudinal Vs #3 @ 15 cm, por temperatura Vs #3 @ 25 cm"],
          [[L + 30, H - 6], "Losa de descanso / entrepiso"],
          [[tr * 2, ri * 3], `Peraltes de ${ri.toFixed(1)} cm y huellas de ${tr} cm`],
        ]} />
      </g>;
    })()}
    <Title x={at(2).x + 6} y={at(2).y + ch - 7} n={7} title="Escalera de concreto (corte)" scale="1:50" sheet={sheet} />

    {/* 8. pretil de azotea */}
    <Block f={f8} x0={0} x1={15} y0={-30} y1={0} />
    <Break f={f8} x0={0} x1={15} y={-30} />
    <Section f={f8} x0={0} y0={0} w={15} h={20} />
    <Shape f={f8} p={box(0, 20, 120, 20 + e)} fill={CONC} w={0.35} />
    <Shape f={f8} p={[[15, 20 + e], [120, 20 + e], [120, 20 + e + 6], [15, 20 + e + 12]]} fill="url(#mxfill)" w={0.25} />
    <Ln f={f8} p={[[15, 20 + e + 15], [120, 20 + e + 9]]} w={0.5} />
    <Block f={f8} x0={0} x1={15} y0={20 + e} y1={20 + e + 50} />
    <Section f={f8} x0={0} y0={20 + e + 50} w={15} h={10} rec={2} />
    <Shape f={f8} p={[[15, 20 + e + 15], [25, 20 + e + 14.5], [15, 20 + e + 25]]} fill={CONC} w={0.25} />
    <NoteCol f={f8} x={nx(3)} y0={at(3).y + 14} items={[
      [[7.5, 20 + e + 55], "Dala de remate 15×10, 2 Vs #3, E #2 @ 25"],
      [[7.5, 20 + e + 30], "Pretil de block 15 cm, h = 60 cm, con castillos a cada 3 m"],
      [[19, 20 + e + 17], "Chaflán de mortero 10×10"],
      [[80, 20 + e + 11], "Impermeabilizante prefabricado o acrílico sobre entortado de 3 cm"],
      [[70, 20 + e + 5], "Relleno de tezontle para pendiente del 2 %"],
      [[60, 20 + e / 2], `Losa de azotea e = ${e} cm`],
    ]} />
    <Title x={at(3).x + 6} y={at(3).y + ch - 7} n={8} title="Pretil y azotea" scale="1:20" sheet={sheet} />
  </Grid>;
}
