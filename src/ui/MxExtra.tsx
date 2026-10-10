// Láminas complementarias del juego en metros (México): portada con índice, notas generales con
// abreviaturas y simbología, y tres láminas más de detalles (estructurales, arquitectónicos e instalaciones).
import type { ReactNode } from "react";
import { foundationType } from "../core/foundation";
import { projectAreas } from "../core/permit";
import { roomSchedule } from "../core/schedules";
import { fmtArea } from "../core/units";
import type { Editor } from "../editor/Editor";
import { SiteMap } from "./SiteMap";
import { Bar, Block, Break, CONC, cellsOf, Dim, Earth, FONT, Grid, NoteCol, Notes, NOTES, Section, T, Title, type Box } from "./MxSheets";
import { box, Ln, Shape, type Frame, type XY } from "./PermitSheets";
import { columnSpec, K1 } from "../core/mxStruct";
import type { Project } from "../core/model";

export const MX_EXTRA_SIDE = ["mxport", "mxnotas", "mxarq", "mxinst"];

// ---------- textos ----------

const REGLAMENTOS = [
  "Reglamento de Construcciones del municipio o estado donde se ubica la obra.",
  "Normas Técnicas Complementarias (NTC) para Diseño y Construcción de Estructuras de Concreto y de Mampostería.",
  "NTC para Diseño y Construcción de Cimentaciones y NTC sobre Criterios y Acciones para el Diseño Estructural.",
  "NOM-001-SEDE-2012, Instalaciones eléctricas (utilización).",
  "NTC para Diseño y Ejecución de Obras e Instalaciones Hidráulicas.",
  "NOM-002-CONAGUA-2015 (tuberías) y NOM-009-CONAGUA-2001 (inodoros).",
];

const GENERALES: { title: string; notes: string[] }[] = [
  { title: "Generales", notes: [
    "Las cotas están en metros y rigen sobre el dibujo; los detalles se acotan en centímetros.",
    "Los niveles se refieren al nivel de piso terminado de planta baja, N.P.T. ±0.00.",
    "Verificar cotas, niveles y ejes en obra antes de construir; cualquier diferencia se consulta con el proyectista.",
    "Los planos arquitectónicos, estructurales y de instalaciones se complementan; ningún plano se usa por separado.",
    "El constructor es responsable de la seguridad en la obra, del apuntalamiento y de las obras provisionales.",
  ] },
  { title: "Terreno y cimentación", notes: [
    "Capacidad de carga supuesta del terreno: 8 t/m². Confirmarla con estudio de mecánica de suelos antes de colar.",
    "Despalmar 20 cm de capa vegetal y retirar raíces, basura y rellenos sueltos del área de desplante.",
    "Desplante mínimo a 0.80 m bajo el terreno natural, sobre terreno firme, con plantilla de 5 cm f'c = 100 kg/cm².",
    "Rellenos con tepetate o material de banco compactado en capas de 20 cm al 90 % de la prueba Proctor.",
  ] },
  { title: "Concreto y acero", notes: [
    "Concreto f'c = 200 kg/cm² en zapatas, cadenas y castillos; f'c = 250 kg/cm² en columnas, trabes, losas y escaleras.",
    "Agregado máximo de 19 mm (¾\"); revenimiento de 10 cm ± 2 cm; no agregar agua en obra.",
    "Acero de refuerzo corrugado fy = 4200 kg/cm²; alambrón #2 liso fy = 2530 kg/cm²; malla electrosoldada 6-6/10-10.",
    "Traslapes de 40 diámetros, no más del 50 % de las varillas en una misma sección.",
    "Vibrar todo el concreto y curarlo con agua o membrana durante 7 días como mínimo.",
    "Descimbrar trabes y losas a los 14 días como mínimo, o cuando el concreto alcance el 70 % de su resistencia.",
  ] },
  { title: "Mampostería", notes: [
    "Muros de block hueco de concreto de 12×20×40 o 15×20×40 cm (f*p ≥ 60 kg/cm²) o tabique rojo recocido.",
    "Mortero cemento-arena 1:4 con juntas de 1 cm; mojar las piezas de barro antes de asentarlas.",
    "Castillos en cada extremo e intersección de muros, en jambas de vanos y a cada 3.00 m como máximo.",
    "Cadena de cerramiento sobre todos los muros de carga y dala de repisón bajo ventanas mayores de 1.20 m.",
  ] },
  { title: "Acabados", notes: [
    "Aplanado exterior de mortero cemento-arena 1:4 de 1.5 cm, acabado fino, con pintura vinílica para exteriores.",
    "Aplanado interior de yeso a reventón de 1.5 cm con pintura vinílica; en baños, azulejo hasta 1.80 m (2.10 m en la regadera).",
    "Pisos de loseta cerámica asentada con adhesivo sobre firme de 8 cm; zoclo de 7 cm del mismo material.",
    "Azotea con relleno de tezontle al 2 %, entortado de 3 cm, chaflanes e impermeabilizante con garantía mínima de 5 años.",
  ] },
  { title: "Instalaciones", notes: [
    "Eléctrica conforme a la NOM-001-SEDE-2012: poliducto de 13 mm, conductores THW-LS y tierra física con varilla copperweld.",
    "Hidráulica en CPVC o cobre tipo M; prueba de presión a 8 kg/cm² durante 3 horas antes de cubrir las tuberías.",
    "Sanitaria en PVC con pendiente mínima del 2 %, registros a cada 10 m y ventilación sobre la azotea.",
    "No ranurar ni perforar castillos, columnas, trabes ni losas sin autorización del responsable estructural.",
  ] },
];

const ABREV: [string, string][] = [
  ["N.P.T.", "Nivel de piso terminado"], ["N.T.N.", "Nivel de terreno natural"], ["N.L.A.", "Nivel de lecho alto de losa"],
  ["N.L.B.", "Nivel de lecho bajo de losa"], ["s.N.P.T.", "Sobre el nivel de piso terminado"], ["f'c", "Resistencia del concreto a 28 días"],
  ["fy", "Límite de fluencia del acero"], ["Vs", "Varillas"], ["E", "Estribos"], ["@", "Separación a cada"],
  ["a.s.", "Ambos sentidos"], ["Ø", "Diámetro"], ["cal.", "Calibre AWG del conductor"], ["e", "Espesor"],
  ["ZC / ZA", "Zapata corrida / aislada"], ["K / C", "Castillo / columna"], ["T / L", "Trabe / losa"], ["CD / CC", "Cadena de desplante / de cerramiento"],
  ["B.A.N.", "Bajada de aguas negras"], ["B.A.P.", "Bajada de aguas pluviales"], ["A.F. / A.C.", "Agua fría / agua caliente"],
  ["C.C.", "Centro de carga"], ["CFE", "Comisión Federal de Electricidad"], ["D.R.O.", "Director responsable de obra"],
];

function Sym({ children }: { children: ReactNode }) {
  return <svg width="16mm" height="7mm" viewBox="0 0 16 7" aria-hidden="true" fontFamily={FONT}>{children}</svg>;
}
const GEN_SYMS: [string, ReactNode][] = [
  ["Eje de proyecto", <Sym><circle cx={3} cy={3.5} r={2.6} fill="#fff" stroke="#111" strokeWidth={0.25} /><text x={3} y={4.4} fontSize={2.6} textAnchor="middle">A</text><line x1={5.6} y1={3.5} x2={16} y2={3.5} stroke="#111" strokeWidth={0.2} strokeDasharray="2.5 .6 .5 .6" /></Sym>],
  ["Nivel en planta", <Sym><rect x={1} y={1} width={14} height={5} fill="none" stroke="#111" strokeWidth={0.25} /><text x={8} y={4.6} fontSize={2.4} textAnchor="middle">N.P.T. +0.00</text></Sym>],
  ["Nivel en corte y fachada", <Sym><path d="M2 2l2 3 2-3z" fill="none" stroke="#111" strokeWidth={0.2} /><path d="M2 2l2 3V2z" fill="#111" /><line x1={0} y1={5} x2={16} y2={5} stroke="#111" strokeWidth={0.25} /><text x={7} y={2.8} fontSize={2.2}>+2.70</text></Sym>],
  ["Línea de corte", <Sym><path d="M1 3.5h14" stroke="#111" strokeWidth={0.25} strokeDasharray="3 .8 .6 .8" /><path d="M1 1.2v4.6M15 1.2v4.6" stroke="#111" strokeWidth={0.6} /><text x={2} y={2.2} fontSize={2}>A</text><text x={12.6} y={2.2} fontSize={2}>A'</text></Sym>],
  ["Llamada de detalle", <Sym><circle cx={4} cy={3.5} r={3} fill="none" stroke="#111" strokeWidth={0.25} /><line x1={1} y1={3.5} x2={7} y2={3.5} stroke="#111" strokeWidth={0.2} /><text x={4} y={3} fontSize={2.2} textAnchor="middle">1</text><text x={4} y={5.8} fontSize={1.5} textAnchor="middle">EST-03</text></Sym>],
  ["Cota", <Sym><path d="M1 4h14M1 2v4M15 2v4M0.2 4.8l1.6-1.6M14.2 4.8l1.6-1.6" stroke="#111" strokeWidth={0.2} /><text x={8} y={3.2} fontSize={2.2} textAnchor="middle">3.50</text></Sym>],
  ["Muro de block", <Sym><rect x={1} y={2} width={14} height={3} fill="#fff" stroke="#111" strokeWidth={0.3} /><path d="M2 5l3-3M5 5l3-3M8 5l3-3M11 5l3-3" stroke="#999" strokeWidth={0.15} /></Sym>],
  ["Concreto armado", <Sym><rect x={1} y={2} width={14} height={3} fill={CONC} stroke="#111" strokeWidth={0.3} /><circle cx={4} cy={3.5} r={0.5} /><circle cx={12} cy={3.5} r={0.5} /></Sym>],
  ["Terreno natural", <Sym><path d="M1 2h14" stroke="#111" strokeWidth={0.3} /><path d="M2 6l3-4M5 6l3-4M8 6l3-4M11 6l3-4" stroke="#777" strokeWidth={0.15} /></Sym>],
  ["Norte", <Sym><circle cx={8} cy={3.5} r={3} fill="none" stroke="#111" strokeWidth={0.25} /><path d="M8 .8l1.3 4.6L8 4.6l-1.3.8z" fill="#111" /></Sym>],
];

// ---------- portada ----------

export function MxCoverBody({ ed, box: b }: { ed: Editor; box: Box }) {
  const p = ed.project, info = p.info, a = projectAreas(p), ft = foundationType(p);
  const cols = p.levels.reduce((t, l) => t + l.columns.length, 0);
  return (
    <div className="pcover" style={{ left: `${b.x + 6}mm`, top: `${b.y + b.h * 0.5}mm`, width: `${b.w - 12}mm`, height: `${b.h * 0.5 - 4}mm` }}>
      <div>
        <h3>{info.name || "Casa habitación unifamiliar"}</h3>
        <p className="pc-sub">Propietario: {info.client || "—"}</p>
        <h4>Datos del proyecto</h4>
        <table><tbody>
          <tr><td>Uso</td><td>Habitacional unifamiliar</td></tr>
          <tr><td>Niveles</td><td>{p.levels.length}</td></tr>
          {a.levels.map((l) => <tr key={l.name}><td>Superficie útil · {l.name}</td><td>{fmtArea(l.living)}</td></tr>)}
          <tr><td><b>Superficie útil total</b></td><td><b>{fmtArea(a.living)}</b></td></tr>
          <tr><td>Desplante (huella)</td><td>{fmtArea(a.footprint)}</td></tr>
        </tbody></table>
      </div>
      <div>
        <h4>Sistema constructivo</h4>
        <ul>
          <li>Cimentación: {ft.id === "slab" ? "zapatas corridas de concreto armado con cadena de desplante" : ft.name.toLowerCase()}{cols ? ` y ${cols} zapatas aisladas bajo columnas` : ""}.</li>
          <li>Muros de carga de block de concreto confinados con castillos y cadenas.</li>
          <li>Losas macizas de concreto armado f'c = 250 kg/cm².</li>
          <li>Instalaciones eléctrica, hidráulica y sanitaria ocultas.</li>
        </ul>
        <h4>Reglamentos y normas</h4>
        <ul>{REGLAMENTOS.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
      <div>
        <h4>Croquis de localización</h4>
        <SiteMap ed={ed} h={38} empty="UBICACIÓN DEL PREDIO · ponla en «Datos del proyecto»" />
        <h4>Responsables</h4>
        <table><tbody>
          <tr><td>Proyectista</td><td>{info.author || "—"}</td></tr>
          <tr><td>D.R.O.</td><td>Nombre, firma y registro</td></tr>
          <tr><td>Corresp. estructural</td><td>Nombre, firma y cédula</td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

// ---------- notas generales ----------

export function MxNotesBody({ box: b }: { box: Box }) {
  let n = 0;
  return (
    <div className="pgnotes mx" style={{ left: `${b.x + 5}mm`, top: `${b.y + 5}mm`, width: `${b.w - 10}mm`, height: `${b.h - 8}mm` }}>
      <h4>Reglamentos y normas aplicables</h4>
      <ul>{REGLAMENTOS.map((r) => <li key={r}>{r}</li>)}</ul>
      {GENERALES.map((s) => {
        const start = n + 1; n += s.notes.length;
        return <section key={s.title}><h4>{s.title}</h4><ol start={start}>{s.notes.map((x, i) => <li key={i}>{x}</li>)}</ol></section>;
      })}
    </div>
  );
}

// ---------- columna lateral ----------

/** Acabados por local según su nombre. */
function finishOf(name: string) {
  const n = name.toLowerCase();
  if (/baño|bano|wc|sanitario/.test(n)) return { piso: "Loseta antiderrapante", muro: "Azulejo h = 1.80 m (2.10 en regadera)", plafon: "Yeso con pintura anti-hongos" };
  if (/cocina/.test(n)) return { piso: "Loseta cerámica", muro: "Azulejo en cubierta h = 0.60 m", plafon: "Yeso y pintura vinílica" };
  if (/lavado|patio|cochera|garaje|terraza/.test(n)) return { piso: "Concreto escobillado", muro: "Mortero fino y pintura", plafon: "Mortero y pintura" };
  return { piso: "Loseta cerámica 45×45", muro: "Yeso y pintura vinílica", plafon: "Yeso y pintura vinílica" };
}

export function MxExtraSide({ ed, content, set = [] }: { ed: Editor; content: string; set?: { no: string; title: string }[] }) {
  if (content === "mxport") return <div className="tables">
    <h4>Índice de planos</h4>
    <table><tbody>{set.map((s) => <tr key={s.no}><td><b>{s.no}</b></td><td>{s.title}</td></tr>)}</tbody></table>
    <h4>Claves</h4>
    <table><tbody>
      <tr><td><b>G</b></td><td>Generales</td></tr><tr><td><b>ARQ</b></td><td>Arquitectónicos</td></tr><tr><td><b>EST</b></td><td>Estructurales</td></tr>
      <tr><td><b>IE</b></td><td>Instalación eléctrica</td></tr><tr><td><b>IH</b></td><td>Instalación hidráulica</td></tr><tr><td><b>IS</b></td><td>Instalación sanitaria</td></tr>
      <tr><td><b>DI</b></td><td>Detalles de instalaciones</td></tr>
    </tbody></table>
    {ed.project.info.site && !(ed.project.info.site.lat === 0 && ed.project.info.site.lon === 0) && <>
      <h4>Localización en la zona</h4>
      <SiteMap ed={ed} h={55} dz={-3} empty="" />
    </>}
  </div>;
  if (content === "mxnotas") return <div className="tables">
    <h4>Abreviaturas</h4>
    <table><tbody>{ABREV.map(([k, v]) => <tr key={k}><td><b>{k}</b></td><td>{v}</td></tr>)}</tbody></table>
    <h4>Simbología general</h4>
    <table className="symleg"><tbody>{GEN_SYMS.map(([n, s]) => <tr key={n}><td>{s}</td><td>{n}</td></tr>)}</tbody></table>
  </div>;
  if (content === "mxarq") {
    const rooms = roomSchedule(ed.project);
    return <div className="tables">
      <h4>Cuadro de acabados</h4>
      {rooms.length ? <table><thead><tr><th>Local</th><th>Piso</th><th>Muros</th><th>Plafón</th></tr></thead><tbody>
        {rooms.map((r, i) => { const f = finishOf(r.name); return <tr key={i}><td><b>{r.name}</b></td><td>{f.piso}</td><td>{f.muro}</td><td>{f.plafon}</td></tr>; })}
      </tbody></table> : <p className="empty">Define habitaciones para el cuadro de acabados.</p>}
      <h4>Notas</h4>
      <Notes items={[
        "Medidas en cm, salvo indicación.",
        "Acabados a elegir por el propietario dentro de las especificaciones.",
        "Pendiente mínima del 2 % en banquetas, patios y azoteas hacia las coladeras o bajadas.",
        "Sellar con silicón todas las juntas entre cancelería y muros.",
        "Los detalles son típicos y aplican en todos los casos similares.",
      ]} />
    </div>;
  }
  if (content === "mxinst") return <div className="tables">
    <h4>Especificaciones</h4>
    <Notes items={[...NOTES.elec.slice(2, 4), ...NOTES.hid.slice(2, 4), ...NOTES.san.slice(0, 2)]} />
    <h4>Alturas de salidas (s.N.P.T.)</h4>
    <table><tbody>
      {ALTURAS.map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{v}</td></tr>)}
    </tbody></table>
  </div>;
  return null;
}

const ALTURAS: [string, string][] = [
  ["Contacto general", "0.30 m"], ["Contacto en cocina y baño", "1.20 m"], ["Apagador", "1.20 m"], ["Arbotante", "2.00 m"],
  ["Centro de carga", "1.60 m"], ["Salidas de lavabo A.F. / A.C.", "0.55 m"], ["Salida de W.C.", "0.20 m"],
  ["Regadera", "1.90 m"], ["Llaves de regadera", "1.10 m"], ["Fregadero", "0.60 m"],
];

// ---------- dibujos: encaje y escala ----------

const SCALES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
/** Marco de un dibujo (en cm) dentro de su cuarto de lámina, a la escala normalizada que quepa. */
function fit(b: Box, i: number, [x0, x1, y0, y1]: [number, number, number, number]) {
  const { cw, ch, at } = cellsOf(b), W = cw * 0.62 - 22, H = ch - 42;
  const kMax = Math.min(W / (x1 - x0), H / (y1 - y0)), den = SCALES.find((s) => 10 / s <= kMax) ?? 100, k = 10 / den;
  const f: Frame = { ox: at(i).x + 14 + (W - (x1 - x0) * k) / 2 - x0 * k, oy: at(i).y + ch - 26 + y0 * k, k };
  return { f, scale: `1:${den}`, nx: at(i).x + cw * 0.62, ny: at(i).y + 14, tx: at(i).x + 6, ty: at(i).y + ch - 7 };
}
const Pipe = ({ f, p, w = 0.6, color = "#111", dash }: { f: Frame; p: XY[]; w?: number; color?: string; dash?: string }) => {
  const d = p.map((q, i) => { const x = f.ox + q[0] * f.k, y = f.oy - q[1] * f.k; return `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`; }).join("");
  return <path d={d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash} />;
};
const Valve = ({ f, at, vertical }: { f: Frame; at: XY; vertical?: boolean }) => {
  const [x, y] = [f.ox + at[0] * f.k, f.oy - at[1] * f.k], s = 1.4;
  return <path d={vertical ? `M${x - s} ${y - s}h${2 * s}L${x - s} ${y + s}h${2 * s}z` : `M${x - s} ${y - s}v${2 * s}L${x + s} ${y - s}v${2 * s}z`} fill="#111" />;
};

// ---------- EST: detalles complementarios ----------

/** Nudo columna-trabe, cerramiento sobre vano, refuerzo en hueco de losa y anclaje de castillos. */
export function MxStructDetails2({ box: b, p, sheet }: { box: Box; p: Project; sheet: string }) {
  const col = p.levels.flatMap((l) => l.columns)[0], cw = col ? Math.round(col.w * 100) : 30, cs = columnSpec(col ?? { w: 0.3, d: 0.3 });
  const bh = 40, e = 12;
  const d1 = fit(b, 0, [-25, 190, -10, 260]), f1 = d1.f;
  const d2 = fit(b, 1, [-10, 215, -5, 275]), f2 = d2.f;
  const d3 = fit(b, 2, [-15, 220, -15, 175]), f3 = d3.f;
  const d4 = fit(b, 3, [-50, 90, -10, 200]), f4 = d4.f;
  const yb = 200, ties = (x0: number, x1: number, ys: number[], f: Frame) => ys.map((y) => <Ln key={y} f={f} p={[[x0, y], [x1, y]]} w={0.15} />);
  return <Grid b={b}>
    {/* 9. nudo columna-trabe */}
    <Shape f={f1} p={box(0, 0, cw, yb + bh + e)} fill={CONC} w={0.35} />
    <Shape f={f1} p={box(cw, yb, 180, yb + bh)} fill={CONC} w={0.35} />
    <Shape f={f1} p={box(-20, yb + bh, 180, yb + bh + e)} fill={CONC} w={0.3} />
    <Break f={f1} x0={0} x1={cw} y={0} />
    {[4, cw - 4].map((x) => <Ln key={x} f={f1} p={[[x, 0], [x, yb + bh + e - 3]]} w={0.4} />)}
    {ties(4, cw - 4, [10, 20, 30, 40, 55, 70, 85, 100, 115, 130, 145, 160, 170, 180, 190, 205, 220, 235], f1)}
    <Ln f={f1} p={[[cw - 4, yb + 4], [180, yb + 4]]} w={0.4} />
    <Ln f={f1} p={[[6, yb + 24], [6, yb + bh - 4], [180, yb + bh - 4]]} w={0.4} />
    <Ln f={f1} p={[[8, yb + 18], [8, yb + 4], [cw, yb + 4]]} w={0.4} />
    {[cw + 5, cw + 13, cw + 21, cw + 29, cw + 37, cw + 52, cw + 67, cw + 82, cw + 97, cw + 112, cw + 127].map((x) => <Ln key={x} f={f1} p={[[x, yb + 3], [x, yb + bh - 3]]} w={0.15} />)}
    <Dim f={f1} a={[0, 0]} b={[cw, 0]} off={-8} />
    <Dim f={f1} a={[180, yb]} b={[180, yb + bh]} off={6} />
    <Dim f={f1} a={[cw, yb + bh + e]} b={[cw + 40, yb + bh + e]} off={6} s="L/4 E @ 8" />
    <NoteCol f={f1} x={d1.nx} y0={d1.ny} items={[
      [[cw / 2, yb + bh + e / 2], `Losa e = ${e} cm colada monolítica con la trabe`],
      [[6, yb + 30], "Lecho superior de la trabe anclado con escuadra de 12 Ø dentro de la columna"],
      [[8, yb + 12], "Lecho inferior anclado con escuadra dentro del nudo"],
      [[cw / 2, yb + 20], "Estribos de la columna continúan dentro del nudo"],
      [[cw / 2, 175], `Columna C-1 ${cs.size}: ${cs.bars}; E @ 10 cm en 60 cm junto a losas y zapatas`],
      [[cw / 2, 70], `${cs.ties} en la zona central`],
    ]} />
    <Title x={d1.tx} y={d1.ty} n={9} title="Nudo columna-trabe" scale={d1.scale} sheet={sheet} />

    {/* 10. cerramiento sobre vano */}
    <Block f={f2} x0={0} x1={200} y0={0} y1={250} />
    <Shape f={f2} p={box(50, 90, 150, 210)} fill="#fff" w={0.35} />
    <Ln f={f2} p={[[50, 90], [150, 210]]} w={0.12} /><Ln f={f2} p={[[150, 90], [50, 210]]} w={0.12} />
    {[35, 150].map((x) => <g key={x}><Shape f={f2} p={box(x, 0, x + 15, 250)} fill={CONC} w={0.3} />{[x + 4, x + 11].map((v) => <Ln key={v} f={f2} p={[[v, 0], [v, 262]]} w={0.25} dash="1.2 .5" />)}</g>)}
    <Shape f={f2} p={box(0, 210, 200, 230)} fill={CONC} w={0.3} />
    <Shape f={f2} p={box(35, 80, 165, 90)} fill={CONC} w={0.3} />
    <Shape f={f2} p={box(-5, 250, 205, 250 + e)} fill={CONC} w={0.35} />
    <Ln f={f2} p={[[-5, 0], [205, 0]]} w={0.35} />
    <Dim f={f2} a={[50, 90]} b={[150, 90]} off={-30} s="vano" />
    <Dim f={f2} a={[200, 0]} b={[200, 90]} off={8} s="90" />
    <Dim f={f2} a={[200, 90]} b={[200, 210]} off={8} s="120" />
    <NoteCol f={f2} x={d2.nx} y0={d2.ny} items={[
      [[100, 250 + e / 2], `Losa de concreto e = ${e} cm`],
      [[100, 220], "Cadena de cerramiento CC-1 15×20 corrida sobre el vano, 4 Vs #3, E #2 @ 20"],
      [[42, 150], `Castillo ${K1.mark} ${K1.size} en cada jamba: ${K1.bars}`],
      [[100, 85], "Dala de repisón 15×10, 2 Vs #3, E #2 @ 25, empotrada en los castillos"],
      [[20, 40], "Muro de block 15 cm junteado con mortero 1:4"],
    ]} />
    <Title x={d2.tx} y={d2.ty} n={10} title="Castillos y cerramiento en vano" scale={d2.scale} sheet={sheet} />

    {/* 11. hueco en losa (planta) */}
    <Shape f={f3} p={box(0, 0, 200, 160)} fill="#f4f4f4" w={0.35} />
    {[20, 40, 60, 80, 100, 120, 140].map((y) => <Ln key={y} f={f3} p={y > 45 && y < 115 ? [[0, y], [70, y]] : [[0, y], [200, y]]} w={0.12} dash="1 .6" />)}
    {[40, 60, 80, 100, 120, 140].filter((y) => y > 45 && y < 115).map((y) => <Ln key={`r${y}`} f={f3} p={[[130, y], [200, y]]} w={0.12} dash="1 .6" />)}
    {[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x) => <Ln key={x} f={f3} p={x > 65 && x < 135 ? [[x, 0], [x, 50]] : [[x, 0], [x, 160]]} w={0.12} dash="1 .6" />)}
    {[80, 100, 120].map((x) => <Ln key={`t${x}`} f={f3} p={[[x, 110], [x, 160]]} w={0.12} dash="1 .6" />)}
    <Shape f={f3} p={box(70, 50, 130, 110)} fill="#fff" w={0.4} />
    <Ln f={f3} p={[[70, 50], [130, 110]]} w={0.15} /><Ln f={f3} p={[[130, 50], [70, 110]]} w={0.15} />
    {[45, 115].map((y) => <Ln key={y} f={f3} p={[[30, y], [170, y]]} w={0.5} />)}
    {[65, 135].map((x) => <Ln key={x} f={f3} p={[[x, 10], [x, 150]]} w={0.5} />)}
    {[[70, 50, -1, -1], [130, 50, 1, -1], [130, 110, 1, 1], [70, 110, -1, 1]].map(([x, y, sx, sy], i) => {
      const cx = x + sx * 8, cy = y + sy * 8, d = 30 / Math.SQRT2;
      return <Ln key={i} f={f3} p={[[cx - sx * d, cy + sy * d], [cx + sx * d, cy - sy * d]]} w={0.5} />;
    })}
    <Dim f={f3} a={[70, 110]} b={[130, 110]} off={20} s="60" />
    <Dim f={f3} a={[30, 45]} b={[70, 45]} off={-12} s="40" />
    <NoteCol f={f3} x={d3.nx} y0={d3.ny} items={[
      [[100, 80], "Hueco en losa (ductos, tragaluz o escalera)"],
      [[150, 45], "2 Vs #3 adicionales en cada borde, 40 cm más allá del hueco"],
      [[135, 140], "Varillas del armado cortadas en el hueco"],
      [[60, 130], "Vs #3 a 45° de 60 cm en cada esquina"],
      [[20, 20], "Armado de la losa según el cuadro de losas"],
    ]} />
    <Title x={d3.tx} y={d3.ty} n={11} title="Refuerzo en hueco de losa (planta)" scale={d3.scale} sheet={sheet} />

    {/* 12. anclaje de castillo */}
    <Earth f={f4} x0={-50} x1={90} y0={-10} y1={0} />
    <Section f={f4} x0={-45} y0={0} w={15} h={20} />
    <Shape f={f4} p={box(-30, 0, 90, 20)} fill={CONC} w={0.35} />
    <Shape f={f4} p={box(0, 20, 15, 170)} fill={CONC} w={0.35} />
    <Block f={f4} x0={15} x1={90} y0={20} y1={170} />
    <Block f={f4} x0={-30} x1={0} y0={20} y1={170} />
    <Shape f={f4} p={box(-30, 170, 90, 190)} fill={CONC} w={0.35} />
    <Shape f={f4} p={box(-30, 190, 90, 200)} fill={CONC} w={0.25} />
    <Ln f={f4} p={[[-26, 4], [86, 4]]} w={0.3} /><Ln f={f4} p={[[-26, 16], [86, 16]]} w={0.3} />
    <Ln f={f4} p={[[34, 5], [4, 5], [4, 186], [34, 186]]} w={0.45} />
    <Ln f={f4} p={[[-19, 7], [11, 7], [11, 95]]} w={0.45} />
    <Ln f={f4} p={[[11, 55], [11, 184], [-19, 184]]} w={0.45} dash="2 .6" />
    {ties(4, 11, [25, 35, 45, 55, 75, 95, 115, 135, 145, 155, 165], f4)}
    <Dim f={f4} a={[4, 5]} b={[34, 5]} off={-12} s="30" />
    <Dim f={f4} a={[15, 55]} b={[15, 95]} off={4} s="40 Ø" />
    <NoteCol f={f4} x={d4.nx} y0={d4.ny} items={[
      [[30, 180], "Cadena de cerramiento CC-1 15×20"],
      [[20, 186], "Varillas del castillo con escuadra de 30 cm dentro de la cadena"],
      [[11, 75], "Traslape de 40 Ø (40 cm en Vs #3), alternado"],
      [[7.5, 140], `Castillo ${K1.mark} ${K1.size}: ${K1.ties}`],
      [[20, 5], "Escuadra de 30 cm anclada en la cadena de desplante"],
      [[60, 10], "Cadena de desplante CD-1 15×20 sobre la zapata"],
    ]} />
    <Title x={d4.tx} y={d4.ty} n={12} title="Anclaje y traslape de castillos" scale={d4.scale} sheet={sheet} />
  </Grid>;
}

// ---------- ARQ: detalles arquitectónicos ----------

/** Muro con aplanados, piso sobre firme, vano de ventana y banqueta perimetral. */
export function MxArchDetails({ box: b, sheet }: { box: Box; sheet: string }) {
  const d1 = fit(b, 0, [-25, 45, -10, 120]), f1 = d1.f;
  const d2 = fit(b, 1, [-5, 125, -55, 65]), f2 = d2.f;
  const d3 = fit(b, 2, [-30, 50, 40, 265]), f3 = d3.f;
  const d4 = fit(b, 3, [-110, 70, -45, 90]), f4 = d4.f;
  return <Grid b={b}>
    {/* 1. muro con aplanados */}
    <Block f={f1} x0={0} x1={15} y0={0} y1={110} />
    <Shape f={f1} p={box(-1.5, 0, 0, 110)} fill="#cfcfcf" w={0.25} />
    <Shape f={f1} p={box(15, 0, 16.5, 110)} fill="#fff" w={0.25} />
    <Ln f={f1} p={[[-2.2, 0], [-2.2, 110]]} w={0.15} dash="1 .5" />
    <Ln f={f1} p={[[17.2, 0], [17.2, 110]]} w={0.15} dash="1 .5" />
    <Break f={f1} x0={-2} x1={17} y={0} /><Break f={f1} x0={-2} x1={17} y={110} />
    {[0, 15].map((x) => <T key={x} f={f1} at={[x === 0 ? -14 : 30, 55]} s={x === 0 ? "EXTERIOR" : "INTERIOR"} size={2} />)}
    <Dim f={f1} a={[0, 110]} b={[15, 110]} off={8} />
    <NoteCol f={f1} x={d1.nx} y0={d1.ny} items={[
      [[-2.2, 95], "Pintura vinílica para exteriores o impermeabilizante acrílico"],
      [[-0.8, 80], "Aplanado exterior de mortero cemento-arena 1:4, 1.5 cm, acabado fino"],
      [[7.5, 60], "Block hueco de concreto 15×20×40 con juntas de mortero 1:4 de 1 cm"],
      [[15.8, 40], "Aplanado interior de yeso a reventón, 1.5 cm"],
      [[17.2, 25], "Sellador y pintura vinílica, 2 manos"],
    ]} />
    <Title x={d1.tx} y={d1.ty} n={1} title="Muro con aplanados (corte)" scale={d1.scale} sheet={sheet} />

    {/* 2. piso sobre firme */}
    <Earth f={f2} x0={0} x1={125} y0={-55} y1={-30} />
    <Shape f={f2} p={box(0, -30, 100, -10)} fill="url(#mxfill)" w={0.2} />
    <Shape f={f2} p={box(0, -10, 100, -2)} fill={CONC} w={0.3} />
    <Ln f={f2} p={[[2, -6], [98, -6]]} w={0.2} dash="2 .8" />
    <Shape f={f2} p={box(0, -2, 100, -1)} fill="#aaa" w={0.1} />
    <Shape f={f2} p={box(0, -1, 100, 0)} fill="#fff" w={0.3} />
    <Block f={f2} x0={101.5} x1={116.5} y0={-30} y1={60} />
    <Shape f={f2} p={box(100, 0, 101.5, 60)} fill="#fff" w={0.2} />
    <Shape f={f2} p={box(99, 0, 100, 7)} fill="#fff" w={0.3} />
    <Break f={f2} x0={100} x1={117} y={60} />
    <T f={f2} at={[50, 3]} s="N.P.T. ±0.00" size={2} />
    <Dim f={f2} a={[0, -10]} b={[0, -2]} off={-4} s="8" />
    <Dim f={f2} a={[0, -30]} b={[0, -10]} off={-4} s="20" />
    <NoteCol f={f2} x={d2.nx} y0={d2.ny} items={[
      [[99.5, 4], "Zoclo de 7 cm del mismo material"],
      [[60, -0.5], "Loseta cerámica con juntas de 3 mm y boquilla"],
      [[40, -1.5], "Adhesivo (pegazulejo) de 5 mm"],
      [[30, -6], "Firme de concreto f'c = 150 de 8 cm con malla 6-6/10-10"],
      [[50, -20], "Relleno de tepetate compactado en capas de 20 cm al 90 % Proctor"],
      [[60, -45], "Terreno natural despalmado"],
    ]} />
    <Title x={d2.tx} y={d2.ty} n={2} title="Piso sobre firme y zoclo" scale={d2.scale} sheet={sheet} />

    {/* 3. vano de ventana (corte) */}
    <Block f={f3} x0={0} x1={15} y0={40} y1={80} />
    <Break f={f3} x0={0} x1={15} y={40} />
    <Shape f={f3} p={[[-4, 80], [15, 80], [15, 90], [0, 92], [-4, 88]]} fill={CONC} w={0.3} />
    <Shape f={f3} p={box(5, 90, 10, 210)} fill="#fff" w={0.3} />
    <Ln f={f3} p={[[7.5, 92], [7.5, 208]]} w={0.15} />
    <Shape f={f3} p={box(0, 210, 15, 230)} fill={CONC} w={0.3} />
    <Section f={f3} x0={0} y0={210} w={15} h={20} />
    <Block f={f3} x0={0} x1={15} y0={230} y1={250} />
    <Shape f={f3} p={box(-5, 250, 30, 262)} fill={CONC} w={0.3} />
    <Break f={f3} x0={-5} x1={30} y={262} />
    <T f={f3} at={[-18, 120]} s="EXT." size={2} /><T f={f3} at={[24, 120]} s="INT." size={2} />
    <Dim f={f3} a={[15, 90]} b={[15, 210]} off={28} s="120" />
    <Dim f={f3} a={[15, 40]} b={[15, 90]} off={28} s="90 s.N.P.T." />
    <NoteCol f={f3} x={d3.nx} y0={d3.ny} items={[
      [[7.5, 220], "Cadena de cerramiento CC-1 15×20 sobre el vano"],
      [[7.5, 160], "Cancel de aluminio con vidrio de 6 mm; sellar con silicón el perímetro"],
      [[-2, 86], "Repisón de concreto con pendiente al exterior y gotero"],
      [[7.5, 60], "Antepecho de block 15 cm"],
      [[20, 256], "Losa de entrepiso o azotea"],
    ]} />
    <Title x={d3.tx} y={d3.ty} n={3} title="Vano de ventana (corte)" scale={d3.scale} sheet={sheet} />

    {/* 4. banqueta perimetral */}
    <Earth f={f4} x0={-110} x1={0} y0={-45} y1={-8} />
    <Shape f={f4} p={[[-100, -8], [0, -8], [0, 0], [-100, -2]]} fill={CONC} w={0.3} />
    <Shape f={f4} p={[[-110, -45], [-100, -45], [-100, -2], [-110, -2.2]]} fill="url(#mxfill)" w={0.15} />
    <Section f={f4} x0={0} y0={-20} w={15} h={20} />
    <Block f={f4} x0={0} x1={15} y0={0} y1={80} />
    <Break f={f4} x0={0} x1={15} y={80} />
    <Shape f={f4} p={box(15, 5, 70, 15)} fill={CONC} w={0.3} />
    <Shape f={f4} p={box(15, -20, 70, 5)} fill="url(#mxfill)" w={0.15} />
    <Shape f={f4} p={box(-1, -8, 0, 0)} fill="#111" w={0.1} />
    <T f={f4} at={[45, 18]} s="N.P.T. ±0.00" size={2} />
    <T f={f4} at={[-50, 3]} s="pend. 2 %" size={2} />
    <Dim f={f4} a={[-100, -8]} b={[0, -8]} off={-30} s="100" />
    <Dim f={f4} a={[0, 0]} b={[0, 15]} off={-6} s="15" />
    <NoteCol f={f4} x={d4.nx} y0={d4.ny} items={[
      [[7.5, 50], "Muro con aplanado exterior"],
      [[40, 10], "Firme interior de 8 cm (ver detalle 2)"],
      [[-0.5, -4], "Junta de 1 cm con sellador elástico"],
      [[-60, -5], "Banqueta de concreto f'c = 150 de 8 cm, acabado escobillado, juntas a cada 1.50 m"],
      [[7.5, -10], "Cadena de desplante CD-1"],
      [[-50, -25], "Relleno compactado al 90 % Proctor"],
    ]} />
    <Title x={d4.tx} y={d4.ty} n={4} title="Banqueta perimetral (corte)" scale={d4.scale} sheet={sheet} />
  </Grid>;
}

// ---------- DI: detalles de instalaciones ----------

const BLUE = "#1f5fbf", RED = "#c4302b", GREEN = "#2f7d32";

/** Registro sanitario, tinaco en azotea, tierra física y alturas de salidas en baño. */
export function MxInstDetails({ box: b, sheet }: { box: Box; sheet: string }) {
  const d1 = fit(b, 0, [-40, 110, -20, 95]), f1 = d1.f;
  const d2 = fit(b, 1, [-30, 180, -30, 235]), f2 = d2.f;
  const d3 = fit(b, 2, [-30, 110, -140, 190]), f3 = d3.f;
  const d4 = fit(b, 3, [-10, 240, -10, 260]), f4 = d4.f;
  return <Grid b={b}>
    {/* 1. registro sanitario */}
    <Earth f={f1} x0={-40} x1={-14} y0={-16} y1={78} />
    <Earth f={f1} x0={74} x1={110} y0={-16} y1={78} />
    <Shape f={f1} p={box(-14, -16, 74, -8)} fill="url(#mxfill)" w={0.2} />
    <Shape f={f1} p={box(-14, -8, 74, 0)} fill={CONC} w={0.3} />
    <Shape f={f1} p={box(-14, 0, 0, 78)} fill="#d9a38a" w={0.3} />
    <Shape f={f1} p={box(60, 0, 74, 78)} fill="#d9a38a" w={0.3} />
    <Shape f={f1} p={[[0, 0], [60, 0], [60, 12], [50, 12], [48, 6], [42, 2], [30, 1], [18, 2], [12, 6], [10, 12], [0, 12]]} fill={CONC} w={0.3} />
    <Shape f={f1} p={box(-3, 78, 63, 86)} fill={CONC} w={0.35} />
    <Ln f={f1} p={[[-3, 86], [-3, 78], [0, 78]]} w={0.5} /><Ln f={f1} p={[[63, 86], [63, 78], [60, 78]]} w={0.5} />
    <Pipe f={f1} p={[[-40, 22], [0, 18]]} w={2.4} color="#777" />
    <Pipe f={f1} p={[[60, 12], [110, 9]]} w={2.4} color="#777" />
    <Ln f={f1} p={[[-40, 78], [110, 78]]} w={0.3} />
    <T f={f1} at={[100, 80]} s="N.T.N." anchor="end" />
    <Dim f={f1} a={[0, 0]} b={[60, 0]} off={-26} s="40 × 60 int." />
    <Dim f={f1} a={[74, 0]} b={[74, 78]} off={10} s="60 mín." />
    <NoteCol f={f1} x={d1.nx} y0={d1.ny} items={[
      [[30, 84], "Tapa de concreto f'c = 150 con marco y contramarco de ángulo de 1¼\""],
      [[-7, 50], "Muros de tabique rojo recocido de 14 cm, aplanado pulido de cemento"],
      [[-20, 21], "Llegada de PVC sanitario Ø 100 mm con pendiente del 2 %"],
      [[30, 4], "Media caña de concreto en el fondo"],
      [[30, -4], "Firme de concreto f'c = 150 de 8 cm"],
      [[90, 10], "Salida al colector o a la red municipal"],
    ]} />
    <Title x={d1.tx} y={d1.ty} n={1} title="Registro sanitario 40×60" scale={d1.scale} sheet={sheet} />

    {/* 2. tinaco en azotea */}
    <Shape f={f2} p={box(-30, 0, 180, 12)} fill={CONC} w={0.35} />
    <Shape f={f2} p={box(-30, 12, 180, 18)} fill="url(#mxfill)" w={0.15} />
    {[0, 85].map((x) => <Block key={x} f={f2} x0={x} x1={x + 15} y0={18} y1={68} />)}
    <Shape f={f2} p={box(-5, 68, 105, 76)} fill={CONC} w={0.3} />
    <Shape f={f2} p={[[0, 76], [100, 76], [100, 190], [90, 205], [70, 212], [30, 212], [10, 205], [0, 190]]} fill="#fff" w={0.45} />
    <Shape f={f2} p={box(42, 212, 58, 218)} fill="#fff" w={0.35} />
    <Ln f={f2} p={[[2, 180], [98, 180]]} w={0.2} dash="1.5 .8" />
    <T f={f2} at={[50, 140]} s="TINACO 1100 L" size={2.2} />
    <Pipe f={f2} p={[[150, -30], [150, 222], [70, 222], [70, 200]]} color={BLUE} />
    <Pipe f={f2} p={[[100, 82], [125, 82], [125, -30]]} color={BLUE} />
    <Pipe f={f2} p={[[125, 82], [125, 230]]} color={BLUE} dash="1.2 .6" />
    <Valve f={f2} at={[112, 82]} />
    <Valve f={f2} at={[150, 40]} vertical />
    <T f={f2} at={[-25, 2]} s="N.L.A." anchor="start" />
    <Dim f={f2} a={[0, 18]} b={[0, 68]} off={-12} s="50" />
    <NoteCol f={f2} x={d2.nx} y0={d2.ny} items={[
      [[125, 228], "Jarro de aire Ø 13 mm, 0.30 m sobre el nivel máximo del agua"],
      [[150, 150], "Alimentación desde cisterna o red, Ø 13 mm"],
      [[70, 205], "Válvula de flotador"],
      [[112, 82], "Salida Ø 25 mm con llave de paso y tuerca unión"],
      [[50, 72], "Base de block de 0.50 m con losa de 8 cm"],
      [[60, 6], "Losa de azotea impermeabilizada"],
    ]} />
    <Title x={d2.tx} y={d2.ty} n={2} title="Tinaco en azotea" scale={d2.scale} sheet={sheet} />

    {/* 3. tierra física */}
    <Earth f={f3} x0={-30} x1={110} y0={-140} y1={0} />
    <Ln f={f3} p={[[-30, 0], [110, 0]]} w={0.35} />
    <Shape f={f3} p={box(0, -30, 30, 0)} fill="#fff" w={0.35} />
    <Shape f={f3} p={box(-3, -2, 33, 2)} fill={CONC} w={0.3} />
    <Pipe f={f3} p={[[15, -12], [15, -130]]} w={1.2} color="#a0522d" />
    <Break f={f3} x0={10} x1={20} y={-100} />
    <Pipe f={f3} p={[[15, -12], [40, -12], [60, -12], [60, 150]]} w={0.5} color={GREEN} />
    <Shape f={f3} p={box(62, 0, 77, 190)} fill="url(#mxblock)" w={0.3} />
    <Shape f={f3} p={box(46, 140, 62, 175)} fill="#fff" w={0.4} />
    <T f={f3} at={[54, 156]} s="C.C." size={1.8} />
    <Ln f={f3} p={[[46, 0], [77, 0]]} w={0.3} />
    <Dim f={f3} a={[0, -130]} b={[0, -12]} off={-14} s="3.00 m" />
    <Dim f={f3} a={[77, 0]} b={[77, 140]} off={8} s="1.60" />
    <NoteCol f={f3} x={d3.nx} y0={d3.ny} items={[
      [[54, 165], "Centro de carga a 1.60 m s.N.P.T."],
      [[60, 80], "Conductor de cobre desnudo cal. 8 AWG en tubo conduit"],
      [[15, -10], "Conector mecánico o soldadura exotérmica"],
      [[30, -1], "Registro de 30×30 cm con tapa"],
      [[15, -60], "Varilla copperweld 5/8\" × 3.00 m"],
      [[80, -100], "Resistencia a tierra de 25 Ω máximo"],
    ]} />
    <Title x={d3.tx} y={d3.ty} n={3} title="Sistema de tierra física" scale={d3.scale} sheet={sheet} />

    {/* 4. alturas de salidas en baño */}
    <Shape f={f4} p={box(0, 0, 240, 260)} fill="#fafafa" w={0.3} />
    <Shape f={f4} p={box(0, 0, 240, 180)} fill="url(#mxblock)" w={0.1} />
    <Ln f={f4} p={[[-10, 0], [240, 0]]} w={0.4} />
    <Shape f={f4} p={[[25, 0], [45, 0], [48, 35], [22, 35]]} fill="#fff" w={0.3} />
    <Shape f={f4} p={box(15, 38, 55, 75)} fill="#fff" w={0.3} />
    <Shape f={f4} p={box(80, 78, 130, 85)} fill="#fff" w={0.3} />
    <Shape f={f4} p={[[95, 0], [115, 0], [110, 78], [100, 78]]} fill="#fff" w={0.3} />
    <Pipe f={f4} p={[[30, 20], [30, -10]]} w={1} color="#777" />
    <Pipe f={f4} p={[[50, 20], [50, 0]]} color={BLUE} />
    <Pipe f={f4} p={[[98, 55], [98, 0]]} color={BLUE} /><Pipe f={f4} p={[[112, 55], [112, 0]]} color={RED} dash="1.4 .5 .3 .5" />
    <Pipe f={f4} p={[[190, 110], [190, 190], [180, 195]]} color={BLUE} />
    <Pipe f={f4} p={[[205, 110], [205, 120]]} color={RED} dash="1.4 .5 .3 .5" />
    {[[190, 110], [205, 110]].map(([x, y]) => <Bar key={x} f={f4} at={[x, y]} r={0.9} />)}
    {[[150, 120, "C"], [225, 120, "A"], [60, 30, "C"]].map(([x, y, s]) => <g key={`${x}${y}`}><Shape f={f4} p={box(+x - 4, +y - 4, +x + 4, +y + 4)} fill="#fff" w={0.3} /><T f={f4} at={[+x, +y - 2.5]} s={String(s)} size={1.6} /></g>)}
    <Shape f={f4} p={box(100, 196, 120, 204)} fill="#fff" w={0.3} />
    <Dim f={f4} a={[140, 0]} b={[140, 120]} off={0} s="1.20" />
    <Dim f={f4} a={[85, 0]} b={[85, 55]} off={0} s="0.55" />
    <Dim f={f4} a={[175, 0]} b={[175, 110]} off={0} s="1.10" />
    <Dim f={f4} a={[175, 110]} b={[175, 195]} off={0} s="1.90" />
    <Dim f={f4} a={[235, 0]} b={[235, 200]} off={0} s="2.00" />
    <NoteCol f={f4} x={d4.nx} y0={d4.ny} items={[
      [[110, 200], "Arbotante a 2.00 m"],
      [[180, 195], "Salida de regadera a 1.90 m; mezcladora a 1.10 m"],
      [[225, 120], "Apagador a 1.20 m"],
      [[150, 120], "Contacto con protección GFCI a 1.20 m"],
      [[105, 55], "Salidas de lavabo A.F. y A.C. a 0.55 m"],
      [[50, 18], "Alimentación de W.C. a 0.20 m; descarga Ø 100 mm"],
    ]} />
    <Title x={d4.tx} y={d4.ty} n={4} title="Alturas de salidas en baño" scale={d4.scale} sheet={sheet} />
  </Grid>;
}
