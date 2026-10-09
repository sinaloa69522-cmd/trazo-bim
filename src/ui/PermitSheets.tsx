// Láminas de texto y detalles del juego de permiso de EE.UU.: portada, notas generales y detalles típicos,
// más la columna lateral (tablas y notas) de las láminas generadas desde el modelo.
import type { ReactNode } from "react";
import { ROOFINGS, SIDINGS, usedFinishes } from "../core/finishes";
import type { Project } from "../core/model";
import { feetInches, fmtArea } from "../core/units";
import { FOOTING_TYPES, headers, hvac, joistBays, projectAreas, roofFraming, site } from "../core/permit";
import { ABBREVIATIONS, CODES, DEFERRED, DESIGN_CRITERIA, GENERAL_NOTES, SCOPE, SHEET_NOTES } from "../core/permitNotes";
import type { Editor } from "../editor/Editor";
import { SheetLegend } from "./SheetLegend";

export type PermitKind = "cover" | "notes" | "site" | "found" | "floorfr" | "wallfr" | "rooffr" | "details" | "details2" | "details3" | "hvac";
export const PERMIT_KINDS: PermitKind[] = ["cover", "notes", "site", "found", "floorfr", "wallfr", "rooffr", "details", "details2", "details3", "hvac"];
/** Láminas sin dibujo de planta: se maquetan en HTML/SVG. */
export const TEXT_SHEETS = ["cover", "notes", "details", "details2", "details3"];
/** Láminas de detalles constructivos (A-501, A-502, A-503). */
export const isDetails = (c: string) => c.startsWith("details");

/** Título de cada lámina en inglés (y en qué menú sale en español). */
export const SHEET_TITLES: Record<string, { en: string; es: string }> = {
  cover: { en: "Cover Sheet", es: "Portada (cover sheet)" },
  notes: { en: "General Notes", es: "Notas generales" },
  site: { en: "Site Plan", es: "Site plan (parcela)" },
  found: { en: "Foundation Plan", es: "Cimentación" },
  floorfr: { en: "Floor / Ceiling Framing Plan", es: "Entramado de piso / techo" },
  wallfr: { en: "Wall Framing Plan", es: "Entramado de muros" },
  rooffr: { en: "Roof Framing Plan", es: "Entramado de cubierta" },
  plan: { en: "Floor Plan", es: "Planta" },
  fach: { en: "Exterior Elevations", es: "Fachadas" },
  elev: { en: "Exterior Elevations", es: "Alzados" },
  sec: { en: "Building Sections", es: "Secciones" },
  details: { en: "Typical Details", es: "Detalles típicos" },
  details2: { en: "Foundation Details", es: "Detalles de cimentación" },
  details3: { en: "Stair, Window & Deck Details", es: "Detalles de escalera, ventana y deck" },
  elec: { en: "Electrical Plan", es: "Electricidad" },
  plum: { en: "Plumbing Plan", es: "Plomería" },
  hvac: { en: "Mechanical (HVAC) Plan", es: "HVAC (aire acondicionado)" },
};

export interface SetEntry { no: string; title: string }

const NotesList = ({ notes, start = 1 }: { notes: string[]; start?: number }) => (
  <ol className="pnotes" start={start}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
);

/** Notas de una lámina; en los alzados, la de cubierta y la de revestimiento dicen los materiales elegidos en el modelo. */
function notesFor(content: string, levels: Project["levels"]) {
  let notes = SHEET_NOTES[content === "fach" ? "elev" : content];
  if (notes && (content === "fach" || content === "elev")) {
    const fins = usedFinishes(levels), roof = fins.filter((f) => ROOFINGS.includes(f)), wall = fins.filter((f) => SIDINGS.includes(f));
    if (roof.length) notes = notes.map((n) => n.replace("ASPHALT SHINGLES CLASS A", roof.map((f) => f.en.toUpperCase()).join(" / ") + ", INSTALLED PER MANUFACTURER"));
    if (wall.length) notes = [...notes, `EXTERIOR WALL FINISH: ${wall.map((f) => f.en.toUpperCase()).join(" / ")} OVER WEATHER-RESISTIVE BARRIER, INSTALLED PER MANUFACTURER AND IRC R703.`];
  }
  return notes;
}

/** Notas propias de una lámina de arquitectura o instalaciones del juego de EE.UU. */
export function SheetNotes({ content, levels = [] }: { content: string; levels?: Project["levels"] }) {
  const notes = notesFor(content, levels);
  return notes ? <><h4>{SHEET_TITLES[content]?.en ?? ""} notes</h4><NotesList notes={notes} /></> : null;
}

/** Columna lateral de las láminas del juego de EE.UU.: tablas propias de cada una y sus notas. */
export function PermitSide({ ed, content, level, set = [] }: { ed: Editor; content: string; level: number; set?: SetEntry[] }) {
  const lv = ed.project.levels[level];
  let tables: ReactNode = null;
  if (content === "found") {
    tables = <>
      <h4>Footing schedule</h4>
      <table><thead><tr><th>Mark</th><th>Size</th><th>Reinforcing</th></tr></thead><tbody>
        <tr><td><b>F1</b></td><td>{feetInches(FOOTING_TYPES.F1.width)} x {feetInches(FOOTING_TYPES.F1.depth)}</td><td>(2) #4 CONT.</td></tr>
        <tr><td><b>F2</b></td><td>{feetInches(FOOTING_TYPES.F2.width)} x {feetInches(FOOTING_TYPES.F2.depth)}</td><td>(1) #4 CONT.</td></tr>
      </tbody></table>
    </>;
  } else if (content === "floorfr") {
    const above = ed.project.levels[level + 1], bays = joistBays(lv, above ? "floor" : "ceiling");
    tables = <>
      <h4>{above ? "Floor joist schedule" : "Ceiling joist schedule"}</h4>
      {bays.length ? <table><thead><tr><th>Space</th><th className="r">Span</th><th>Member</th></tr></thead>
        <tbody>{bays.map((b, i) => <tr key={i}><td>{b.name}</td><td className="r">{feetInches(b.span, 2)}</td><td>{b.member}</td></tr>)}</tbody></table>
        : <p className="empty">Define rooms to frame their floors.</p>}
    </>;
  } else if (content === "wallfr") {
    const hs = headers(lv).types;
    tables = <>
      <h4>Header schedule</h4>
      {hs.length ? <table><thead><tr><th>Mark</th><th>Size</th><th className="r">Max opng.</th><th className="r">Qty</th></tr></thead>
        <tbody>{hs.map((h) => <tr key={h.mark}><td><b>{h.mark}</b></td><td>{h.size}</td><td className="r">{feetInches(h.maxWidth, 2)}</td><td className="r">{h.count}</td></tr>)}</tbody></table>
        : <p className="empty">No openings.</p>}
      <h4>Wall legend</h4>
      <table><tbody>
        <tr><td>EXTERIOR / BEARING</td><td>2x6 @ 16" O.C., 7/16" OSB</td></tr>
        <tr><td>INTERIOR</td><td>2x4 @ 16" O.C.</td></tr>
      </tbody></table>
    </>;
  } else if (content === "rooffr") {
    const rs = roofFraming(lv);
    tables = <>
      <h4>Roof framing</h4>
      {rs.length ? <table><thead><tr><th>Roof</th><th className="r">Run</th><th>Member</th></tr></thead>
        <tbody>{rs.map((r, i) => <tr key={i}><td>R{i + 1}</td><td className="r">{feetInches(r.run, 2)}</td><td>{r.member}</td></tr>)}</tbody></table>
        : <p className="empty">No roof on this level. Draw one with the Roof tool (CU).</p>}
    </>;
  } else if (content === "site") {
    const st = site(lv), a = projectAreas(ed.project), lot = st.w * st.d;
    tables = <>
      <h4>Site data</h4>
      <table><tbody>
        <tr><td>LOT SIZE (ASSUMED)</td><td className="r">{feetInches(st.w)} x {feetInches(st.d)}</td></tr>
        <tr><td>LOT AREA</td><td className="r">{fmtArea(lot)}</td></tr>
        <tr><td>BUILDING FOOTPRINT</td><td className="r">{fmtArea(a.footprint)}</td></tr>
        <tr><td>LOT COVERAGE</td><td className="r">{((a.footprint / lot) * 100).toFixed(1)}%</td></tr>
      </tbody></table>
    </>;
  } else if (content === "hvac") {
    const h = hvac(lv);
    tables = h ? <>
      <h4>Equipment schedule</h4>
      <table><tbody>
        <tr><td><b>AHU</b></td><td>GAS FURNACE / AIR HANDLER, {h.tons} TON, 80% AFUE MIN</td></tr>
        <tr><td><b>CU</b></td><td>SPLIT SYSTEM CONDENSER, {h.tons} TON, 14.3 SEER2 MIN</td></tr>
      </tbody></table>
      <h4>Register schedule</h4>
      <table><thead><tr><th>Mark</th><th>Space</th><th className="r">CFM</th><th className="r">Duct</th></tr></thead>
        <tbody>{h.supplies.map((s, i) => <tr key={i}><td><b>S-{i + 1}</b></td><td>{s.room}</td><td className="r">{s.cfm}</td><td className="r">{s.duct}"Ø</td></tr>)}
          <tr><td><b>R-1</b></td><td>RETURN</td><td className="r">{h.supplies.reduce((t, s) => t + s.cfm, 0)}</td><td className="r">16"Ø</td></tr></tbody></table>
    </> : <p className="empty">Define rooms to lay out the HVAC system.</p>;
  } else if (content === "cover") {
    tables = <>
      <h4>Sheet index</h4>
      <table><tbody>{set.map((s) => <tr key={s.no}><td><b>{s.no}</b></td><td>{s.title.toUpperCase()}</td></tr>)}</tbody></table>
    </>;
  } else if (content === "notes") {
    tables = <>
      <h4>Design criteria</h4>
      <table><tbody>{DESIGN_CRITERIA.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
      <h4>Abbreviations</h4>
      <table><tbody>{ABBREVIATIONS.map(([k, v]) => <tr key={k}><td><b>{k}</b></td><td>{v}</td></tr>)}</tbody></table>
    </>;
  }
  const notes = notesFor(content, ed.project.levels);
  return (
    <div className="tables">
      {tables}
      <SheetLegend content={content} finishes={usedFinishes(ed.project.levels)} />
      {notes && <><h4>{isDetails(content) ? "Notes" : `${SHEET_TITLES[content]?.en ?? ""} notes`}</h4><NotesList notes={notes} /></>}
    </div>
  );
}

/** Portada: datos del proyecto, códigos, alcance e índice de láminas. La fachada sur va dibujada arriba. */
export function CoverBody({ ed, box }: { ed: Editor; box: { x: number; y: number; w: number; h: number } }) {
  const info = ed.project.info, a = projectAreas(ed.project);
  return (
    <div className="pcover" style={{ left: `${box.x + 6}mm`, top: `${box.y + box.h * 0.5}mm`, width: `${box.w - 12}mm`, height: `${box.h * 0.5 - 4}mm` }}>
      <div>
        <h3>{info.name || "NEW SINGLE FAMILY RESIDENCE"}</h3>
        <p className="pc-sub">{info.client ? `OWNER: ${info.client}` : "OWNER: —"}</p>
        <h4>Scope of work</h4>
        <p>{SCOPE}</p>
        <h4>Project data</h4>
        <table><tbody>
          {DESIGN_CRITERIA.slice(0, 2).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
          <tr><td>STORIES</td><td>{ed.project.levels.length}</td></tr>
          {a.levels.map((l) => <tr key={l.name}><td>LIVING AREA · {l.name.toUpperCase()}</td><td>{fmtArea(l.living)}</td></tr>)}
          <tr><td><b>TOTAL CONDITIONED AREA</b></td><td><b>{fmtArea(a.living)}</b></td></tr>
          <tr><td>FIRE SPRINKLERS</td><td>PER JURISDICTION (IRC R313)</td></tr>
        </tbody></table>
      </div>
      <div>
        <h4>Applicable codes</h4>
        <ul>{CODES.map((c) => <li key={c}>{c}</li>)}</ul>
        <h4>Deferred submittals</h4>
        <ul>{DEFERRED.map((c) => <li key={c}>{c}</li>)}</ul>
        <h4>Designer</h4>
        <p>{info.author || "—"}</p>
      </div>
      <div>
        <h4>Vicinity map</h4>
        <div className="pc-map">PROJECT SITE · ATTACH VICINITY MAP</div>
      </div>
    </div>
  );
}

/** Notas generales en columnas. */
export function NotesBody({ box }: { box: { x: number; y: number; w: number; h: number } }) {
  let n = 0;
  return (
    <div className="pgnotes" style={{ left: `${box.x + 5}mm`, top: `${box.y + 5}mm`, width: `${box.w - 10}mm`, height: `${box.h - 8}mm` }}>
      <h4>Applicable codes</h4>
      <ul>{CODES.map((c) => <li key={c}>{c}</li>)}</ul>
      {GENERAL_NOTES.map((b) => {
        const start = n + 1; n += b.notes.length;
        return <section key={b.title}><h4>{b.title}</h4><NotesList notes={b.notes} start={start} /></section>;
      })}
    </div>
  );
}

// ---------- detalles típicos (SVG en mm, medidas en pulgadas) ----------

export type XY = [number, number];
export interface Frame { ox: number; oy: number; k: number }
export const map = (f: Frame, [x, y]: XY): XY => [f.ox + x * f.k, f.oy - y * f.k];
const pts = (f: Frame, ps: XY[]) => ps.map((p) => map(f, p).map((v) => v.toFixed(2)).join(",")).join(" ");

export function Shape({ f, p, fill = "none", w = 0.3, dash }: { f: Frame; p: XY[]; fill?: string; w?: number; dash?: string }) {
  return <polygon points={pts(f, p)} fill={fill} stroke="#111" strokeWidth={w} strokeDasharray={dash} />;
}
export function Ln({ f, p, w = 0.25, dash }: { f: Frame; p: XY[]; w?: number; dash?: string }) {
  return <polyline points={pts(f, p)} fill="none" stroke="#111" strokeWidth={w} strokeDasharray={dash} />;
}
export const box = (x0: number, y0: number, x1: number, y1: number): XY[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** Aislamiento en zigzag dentro de un hueco vertical. */
export function Batt({ f, x0, x1, y0, y1 }: { f: Frame; x0: number; x1: number; y0: number; y1: number }) {
  const step = (x1 - x0) * 0.6, p: XY[] = [];
  for (let y = y0, i = 0; y <= y1; y += step / 2, i++) p.push([i % 2 ? x1 - 0.3 : x0 + 0.3, y]);
  return <Ln f={f} p={p} w={0.15} />;
}
/** Nota con línea de llamada: del punto del dibujo al texto en la columna de notas. */
export function Note({ f, at, y, x, text }: { f: Frame; at: XY; y: number; x: number; text: string }) {
  const [ax, ay] = map(f, at), lines = wrap(text, 34);
  return (
    <g>
      <polyline points={`${ax},${ay} ${x - 2},${y} ${x - 0.5},${y}`} fill="none" stroke="#111" strokeWidth={0.15} />
      <circle cx={ax} cy={ay} r={0.35} fill="#111" />
      <text x={x} y={y + 0.7} fontSize={1.9} fontFamily="'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif">
        {lines.map((l, i) => <tspan key={i} x={x} dy={i ? 2.2 : 0}>{l}</tspan>)}
      </text>
    </g>
  );
}
function wrap(s: string, n: number) {
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(" ")) { if ((cur + " " + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) out.push(cur);
  return out;
}
export function DetailTitle({ x, y, n, title, scale, sheet = "A-501" }: { x: number; y: number; n: number; title: string; scale: string; sheet?: string }) {
  return (
    <g fontFamily="'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif">
      <circle cx={x + 4} cy={y} r={3.6} fill="none" stroke="#111" strokeWidth={0.3} />
      <line x1={x + 0.4} y1={y} x2={x + 7.6} y2={y} stroke="#111" strokeWidth={0.2} />
      <text x={x + 4} y={y - 0.6} fontSize={2.4} textAnchor="middle" fontWeight={600}>{n}</text>
      <text x={x + 4} y={y + 2.6} fontSize={1.8} textAnchor="middle">{sheet}</text>
      <text x={x + 10} y={y - 0.3} fontSize={3.2} fontWeight={600}>{title.toUpperCase()}</text>
      <line x1={x + 10} y1={y + 0.6} x2={x + 10 + title.length * 2.2} y2={y + 0.6} stroke="#111" strokeWidth={0.3} />
      <text x={x + 10} y={y + 3.4} fontSize={2}>SCALE: {scale}</text>
    </g>
  );
}

/** Cuatro detalles típicos: zapata, sección de muro, dintel y alero. */
export function DetailsBody({ box: b }: { box: { x: number; y: number; w: number; h: number } }) {
  const cw = b.w / 2, ch = b.h / 2, cell = (i: number) => ({ x: (i % 2) * cw, y: Math.floor(i / 2) * ch });
  const nx = (i: number) => cell(i).x + cw * 0.56;
  // 1: zapata y losa con borde engrosado, 1/2" = 1'-0"
  const f1: Frame = { ox: cell(0).x + 28, oy: cell(0).y + 62, k: 0.5 * 25.4 / 12 };
  // 2: sección de muro, 1/4" = 1'-0"
  const f2: Frame = { ox: cell(1).x + 30, oy: cell(1).y + ch - 22, k: 0.25 * 25.4 / 12 };
  // 3: dintel en alzado, 1/2" = 1'-0"
  const f3: Frame = { ox: cell(2).x + 14, oy: cell(2).y + 18, k: 0.5 * 25.4 / 12 };
  // 4: alero, 1" = 1'-0"
  const f4: Frame = { ox: cell(3).x + 50, oy: cell(3).y + 48, k: 25.4 / 12 };
  const plate = 1.5, stud = 5.5, wallH = 108;
  return (
    <svg className="pdetails" style={{ left: `${b.x}mm`, top: `${b.y}mm`, width: `${b.w}mm`, height: `${b.h}mm` }} viewBox={`0 0 ${b.w} ${b.h}`}>
      <line x1={cw} y1={4} x2={cw} y2={b.h - 4} stroke="#111" strokeWidth={0.2} />
      <line x1={4} y1={ch} x2={b.w - 4} y2={ch} stroke="#111" strokeWidth={0.2} />

      {/* 1. footing */}
      <g>
        <Shape f={f1} p={[[0, 8], [44, 8], [44, 4], [22, 4], [16, -12], [0, -12]]} fill="#e6e6e6" w={0.35} />
        <Shape f={f1} p={box(16, 0, 44, 4)} fill="url(#gravel)" w={0.15} />
        <Ln f={f1} p={[[16, 4], [44, 4]]} w={0.25} dash="1 0.6" />
        {[5, 11].map((x) => { const [cx, cy] = map(f1, [x, -8]); return <circle key={x} cx={cx} cy={cy} r={0.55} fill="#111" />; })}
        <Shape f={f1} p={box(0, 8, stud, 8 + plate)} fill="#cfe3c8" w={0.25} />
        <Shape f={f1} p={box(0, 8 + plate, stud, 30)} w={0.25} />
        <Batt f={f1} x0={0} x1={stud} y0={8 + plate} y1={30} />
        <Ln f={f1} p={[[-0.44, 8], [-0.44, 30]]} w={0.25} />
        <Ln f={f1} p={[[-1.2, 6], [-1.2, 30]]} w={0.25} />
        <Ln f={f1} p={[[2.75, 10], [2.75, -3], [4.5, -3]]} w={0.3} />
        <Ln f={f1} p={[[-26, -2], [-1, 0], [0, 0]]} w={0.35} />
        <Ln f={f1} p={[[-6, 30], [8, 30]]} w={0.15} dash="2 1" />
        <Note f={f1} at={[stud / 2, 22]} x={nx(0)} y={cell(0).y + 22} text={`2x6 STUDS @ 16" O.C. W/ R-20 BATT INSUL.`} />
        <Note f={f1} at={[-1.2, 18]} x={nx(0)} y={cell(0).y + 28} text={`SIDING OVER WRB OVER 7/16" OSB SHEATHING`} />
        <Note f={f1} at={[stud / 2, 8.7]} x={nx(0)} y={cell(0).y + 34} text={`2x6 P.T. SILL PLATE W/ SILL SEALER`} />
        <Note f={f1} at={[2.75, 2]} x={nx(0)} y={cell(0).y + 40} text={`1/2" DIA. ANCHOR BOLT @ 6'-0" O.C. MAX, 7" MIN EMBED.`} />
        <Note f={f1} at={[30, 6]} x={nx(0)} y={cell(0).y + 47} text={`4" CONC. SLAB OVER 6 MIL VAPOR RETARDER`} />
        <Note f={f1} at={[30, 2]} x={nx(0)} y={cell(0).y + 53} text={`4" COMPACTED GRAVEL BASE`} />
        <Note f={f1} at={[8, -8]} x={nx(0)} y={cell(0).y + 59} text={`16" x 8" MIN THICKENED EDGE W/ (2) #4 CONT.`} />
        <Note f={f1} at={[-14, -1]} x={nx(0)} y={cell(0).y + 66} text={`FINISH GRADE, SLOPE 6" IN 10'-0" AWAY`} />
        <Note f={f1} at={[0, -12]} x={nx(0)} y={cell(0).y + 72} text={`12" MIN BELOW GRADE OR FROST DEPTH`} />
        <DetailTitle x={cell(0).x + 6} y={ch - 9} n={1} title="Typical footing at exterior wall" scale={`1/2" = 1'-0"`} />
      </g>

      {/* 2. wall section */}
      <g>
        <Shape f={f2} p={[[0, 8], [60, 8], [60, 4], [22, 4], [16, -12], [0, -12]]} fill="#e6e6e6" w={0.3} />
        <Shape f={f2} p={box(0, 8, stud, 8 + wallH)} w={0.3} />
        <Batt f={f2} x0={0} x1={stud} y0={8 + plate} y1={8 + wallH - 2 * plate} />
        <Ln f={f2} p={[[0, 8 + wallH - plate], [stud, 8 + wallH - plate]]} w={0.15} />
        <Ln f={f2} p={[[0, 8 + wallH - 2 * plate], [stud, 8 + wallH - 2 * plate]]} w={0.15} />
        <Ln f={f2} p={[[-1, 6], [-1, 8 + wallH]]} w={0.2} />
        <Ln f={f2} p={[[stud + 0.5, 8], [stud + 0.5, 8 + wallH]]} w={0.2} />
        <Shape f={f2} p={box(0, 8 + wallH, 70, 8 + wallH + 5.5)} w={0.25} />
        <Ln f={f2} p={[[stud, 8 + wallH - 0.5], [70, 8 + wallH - 0.5]]} w={0.2} />
        {/* cabio 6:12 con alero de 18" */}
        <Shape f={f2} p={[[-18, 8 + wallH + 5.5 - 9], [70, 8 + wallH + 5.5 + 35], [70, 8 + wallH + 5.5 + 42], [-18, 8 + wallH + 5.5 - 2]]} w={0.3} />
        <Ln f={f2} p={[[-18, 8 + wallH - 2], [-18, 8 + wallH + 5.5 - 2]]} w={0.3} />
        <Ln f={f2} p={[[-18, 8 + wallH - 2], [-1, 8 + wallH - 2]]} w={0.2} />
        {Array.from({ length: 6 }, (_, i) => <Ln key={i} f={f2} p={[[stud + 4 + i * 10, 8 + wallH + 6], [stud + 9 + i * 10, 8 + wallH + 14], [stud + 14 + i * 10, 8 + wallH + 6]]} w={0.15} />)}
        <Ln f={f2} p={[[-30, -2], [-1, 0]]} w={0.3} />
        <Note f={f2} at={[40, 8 + wallH + 31]} x={nx(1)} y={cell(1).y + 14} text={`ASPHALT SHINGLES OVER UNDERLAYMENT OVER 7/16" OSB`} />
        <Note f={f2} at={[20, 8 + wallH + 22]} x={nx(1)} y={cell(1).y + 21} text={`RAFTERS PER S-104 W/ HURRICANE TIE TO PLATE`} />
        <Note f={f2} at={[stud + 20, 8 + wallH + 10]} x={nx(1)} y={cell(1).y + 28} text={`R-30 MIN ATTIC INSULATION`} />
        <Note f={f2} at={[40, 8 + wallH + 2.7]} x={nx(1)} y={cell(1).y + 34} text={`CEILING JOISTS PER S-102, 1/2" GYP. BD.`} />
        <Note f={f2} at={[-18, 8 + wallH]} x={nx(1)} y={cell(1).y + 41} text={`VENTED SOFFIT AND FASCIA`} />
        <Note f={f2} at={[stud / 2, 8 + wallH - 2]} x={nx(1)} y={cell(1).y + 47} text={`DOUBLE 2x6 TOP PLATE`} />
        <Note f={f2} at={[stud / 2, 60]} x={nx(1)} y={cell(1).y + 54} text={`2x6 STUDS @ 16" O.C., R-20 BATT, 1/2" GYP. BD. INSIDE, 7/16" OSB + WRB + SIDING OUTSIDE`} />
        <Note f={f2} at={[40, 6]} x={nx(1)} y={cell(1).y + 66} text={`4" CONC. SLAB ON GRADE, SEE DETAIL 1`} />
        <DetailTitle x={cell(1).x + 6} y={ch - 9} n={2} title="Typical wall section" scale={`1/4" = 1'-0"`} />
      </g>

      {/* 3. header */}
      <g>
        {(() => {
          const w = 36, top = 0, hh = 9.25;
          const jl = -plate, kl = -2 * plate, jr = w, kr = w + plate;
          return <>
            <Shape f={f3} p={box(kl, top, kr + plate, top + plate)} fill="#f2f2f2" />
            <Shape f={f3} p={box(kl, top + plate, kr + plate, top + 2 * plate)} fill="#f2f2f2" />
            <Shape f={f3} p={box(jl, top - hh, jr + plate, top)} fill="#d9d9d9" w={0.35} />
            <Ln f={f3} p={[[jl, top - hh / 2], [jr + plate, top - hh / 2]]} w={0.15} />
            <Shape f={f3} p={box(kl, top - 46, kl + plate, top)} />
            <Shape f={f3} p={box(kr, top - 46, kr + plate, top)} />
            <Shape f={f3} p={box(jl, top - 46, jl + plate, top - hh)} />
            <Shape f={f3} p={box(jr, top - 46, jr + plate, top - hh)} />
            <Ln f={f3} p={[[jl + plate, top - 46], [jr, top - 46]]} w={0.15} dash="1.5 0.8" />
            <Note f={f3} at={[w / 2, top + plate]} x={nx(2)} y={cell(2).y + 16} text={`DOUBLE 2x6 TOP PLATE`} />
            <Note f={f3} at={[w / 2 + 6, top - hh / 2]} x={nx(2)} y={cell(2).y + 23} text={`HEADER PER SCHEDULE ON S-103, (2) 2x MEMBERS W/ 1/2" PLYWOOD SPACER, OR LVL`} />
            <Note f={f3} at={[jr + plate / 2, top - 25]} x={nx(2)} y={cell(2).y + 33} text={`(1) JACK STUD MIN EACH SIDE (2 FOR OPENINGS OVER 6'-0")`} />
            <Note f={f3} at={[kr + plate / 2, top - 35]} x={nx(2)} y={cell(2).y + 42} text={`(1) KING STUD EACH SIDE, FULL HEIGHT`} />
            <Note f={f3} at={[w / 2, top - 46]} x={nx(2)} y={cell(2).y + 50} text={`ROUGH OPENING PER WINDOW / DOOR SCHEDULE`} />
          </>;
        })()}
        <DetailTitle x={cell(2).x + 6} y={b.h - 9} n={3} title="Typical header at opening" scale={`1/2" = 1'-0"`} />
      </g>

      {/* 4. eave: cabio 6:12 apoyado en la doble solera, alero de 14" */}
      <g>
        <Shape f={f4} p={box(0, -16, stud, 0)} />
        <Shape f={f4} p={box(0, 0, stud, plate)} fill="#f2f2f2" />
        <Shape f={f4} p={box(0, plate, stud, 2 * plate)} fill="#f2f2f2" />
        <Ln f={f4} p={[[-0.44, -16], [-0.44, 2 * plate]]} w={0.3} />
        <Shape f={f4} p={[[-14, -6.75], [12, 6.25], [12, 14.35], [-14, 1.35]]} w={0.35} />
        <Shape f={f4} p={box(-15.5, -7.75, -14, 2.35)} fill="#f2f2f2" />
        <Ln f={f4} p={[[-14, -6.75], [-0.44, -6.75]]} w={0.25} />
        <Ln f={f4} p={[[-15.6, 2.6], [12, 16.4]]} w={0.4} />
        <Ln f={f4} p={[[-20.5, 1], [-20.5, -3], [-15.5, -3], [-15.5, 1]]} w={0.3} />
        <Ln f={f4} p={[[4, 0.3], [4, 4.6], [6.5, 5.6]]} w={0.35} />
        <Ln f={f4} p={[[stud, 2 * plate], [12, 2 * plate]]} w={0.25} />
        <Ln f={f4} p={[[-9, -6.75], [-6, -6.75]]} w={0.8} />
        <Note f={f4} at={[6, 13.4]} x={nx(3)} y={cell(3).y + 14} text={`SHINGLES OVER UNDERLAYMENT, DRIP EDGE AT EAVE`} />
        <Note f={f4} at={[2, 7]} x={nx(3)} y={cell(3).y + 21} text={`RAFTER PER S-104, BIRDSMOUTH ON PLATE`} />
        <Note f={f4} at={[4, 3.5]} x={nx(3)} y={cell(3).y + 27} text={`HURRICANE TIE (SIMPSON H2.5A OR EQ.) EA. RAFTER`} />
        <Note f={f4} at={[-14.7, -3]} x={nx(3)} y={cell(3).y + 35} text={`2x8 FASCIA`} />
        <Note f={f4} at={[-18, -3]} x={nx(3)} y={cell(3).y + 41} text={`GUTTER AND DOWNSPOUT`} />
        <Note f={f4} at={[-7.5, -6.75]} x={nx(3)} y={cell(3).y + 47} text={`CONTINUOUS SOFFIT VENT`} />
        <Note f={f4} at={[stud / 2, 1.5]} x={nx(3)} y={cell(3).y + 53} text={`DOUBLE 2x6 TOP PLATE`} />
        <Note f={f4} at={[-0.44, -12]} x={nx(3)} y={cell(3).y + 59} text={`7/16" OSB WALL SHEATHING, WRB, SIDING`} />
        <DetailTitle x={cell(3).x + 6} y={b.h - 9} n={4} title="Typical eave" scale={`1" = 1'-0"`} />
      </g>

      <defs>
        <pattern id="gravel" width="2" height="2" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.25" fill="#555" /><circle cx="1.5" cy="1.4" r="0.2" fill="#555" />
        </pattern>
      </defs>
    </svg>
  );
}

