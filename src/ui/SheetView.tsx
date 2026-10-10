import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usedFinishes } from "../core/finishes";
import { openingStyle, styleName } from "../core/openingStyles";
import { allSections, elevation, FACADES, section, type Elevation, type Facade } from "../core/elevation";
import { sheetBounds } from "../core/geometry";
import { mepDef, type Discipline } from "../core/mep";
import type { LayerId, Model } from "../core/model";
import { computeRooms } from "../core/rooms";
import { circuitSchedule, levelMarks, mepSchedule, openingSchedule, roomSchedule, runSchedule, sanitarySchedule, wallSchedule } from "../core/schedules";
import type { Editor } from "../editor/Editor";
import { drawElevation } from "../editor/elevationRenderer";
import { drawPlan, type PlanColors } from "../editor/planRenderer";
import { areaNum, areaUnit, fmtDim, fmtElev, FT, imperial, lenUnit, scaleLabel, scalesFor } from "../core/units";
import { drawPermitOverlay, type PermitPlan } from "../editor/permitRenderer";
import { site } from "../core/permit";
import { FoundationDetails, StairDetails } from "./PermitDetails";
import { CoverBody, DetailsBody, isDetails, NotesBody, PERMIT_KINDS, PermitSide, SheetNotes, SHEET_TITLES, TEXT_SHEETS, type PermitKind } from "./PermitSheets";
import { SymbolIcon, SystemIcon } from "./MepIcons";
import { MX_KINDS, MX_TITLES, MxFoundationDetails, MxNotes, MxSide, MxStructDetails, type MxKind } from "./MxSheets";
import { MX_EXTRA_SIDE, MxArchDetails, MxCoverBody, MxExtraSide, MxInstDetails, MxNotesBody, MxStructDetails2 } from "./MxExtra";
import { drawMxOverlay } from "../editor/mxRenderer";
import { FinishSym, mepEn, NorthArrow, SheetLegend } from "./SheetLegend";

/** Lámina apaisada, en milímetros: A3, o en EE.UU. Tabloid (ANSI B, 11" × 17"). */
const sheetSize = () => (imperial() ? { w: 431.8, h: 279.4 } : { w: 420, h: 297 });
const FRAME = 10;
const SIDE = 112;
/** Zona del dibujo dentro del marco, dejando sitio al rótulo de la vista. */
const planBox = () => { const S = sheetSize(); return { x: FRAME, y: FRAME, w: S.w - 2 * FRAME - SIDE, h: S.h - 2 * FRAME - 16 }; };
const PX_MM = 96 / 25.4;
const OVERSAMPLE = 3;

/** El papel siempre es blanco, aunque la interfaz esté en modo oscuro. */
const PAPER: PlanColors = {
  "plan-bg": "#ffffff", grid: "#ffffff", "grid-major": "#ffffff", wall: "#1a1a1a", door: "#1a1a1a", window: "#1a1a1a",
  dim: "#1a1a1a", anno: "#555555", accent: "#7d7d7d", fg: "#111111", muted: "#6b6b6b", danger: "#111111", panel: "#ffffff",
};

/** Base muy clara para las láminas de estructura: los muros apenas se ven bajo el entramado. */
const LIGHT: PlanColors = { ...PAPER, wall: "#b4b4b4", door: "#c4c4c4", window: "#c4c4c4", anno: "#c4c4c4", accent: "#cccccc", fg: "#555555", muted: "#aaaaaa", dim: "#666666" };

/** Base de arquitectura a medio tono para los planos de instalaciones. */
const HALF: PlanColors = { ...PAPER, wall: "#8f8f8f", door: "#a3a3a3", window: "#a3a3a3", anno: "#a8a8a8", accent: "#b5b5b5", fg: "#3a3a3a", muted: "#9a9a9a" };

/** Escala normalizada más grande en la que cabe la planta. */
export function fitScale(m: Model) {
  const b = sheetBounds(m), wm = b.x1 - b.x0, hm = b.y1 - b.y0;
  return scalesFor().find((d) => (wm * 1000) / d <= planBox().w - 8 && (hm * 1000) / d <= planBox().h - 8) ?? 1000;
}

const n2 = (v: number) => fmtDim(v);

/** Rejilla de vistas: hasta cuatro, en 1×1, 2×1 o 2×2; las fachadas van una encima de otra. */
export const grid = (n: number, stacked = false) => (stacked ? { cols: 1, rows: n } : { cols: n > 1 ? 2 : 1, rows: n > 2 ? 2 : 1 });
/** Cada vista ocupa su celda; a la derecha quedan unos 22 mm para las cotas de nivel y a la izquierda sitio para las de altura. */
const cell = (n: number, stacked = false) => { const g = grid(n, stacked); return { w: planBox().w / g.cols - (stacked ? 34 : 22), h: planBox().h / g.rows - 16 }; };
export function fitElevScale(els: Elevation[], stacked = false) {
  const c = cell(els.length, stacked);
  return scalesFor().find((d) => els.every((e) => ((e.u1 - e.u0) * 1000) / d <= c.w && ((e.z1 - e.z0) * 1000) / d <= c.h)) ?? 1000;
}

/** plan, elec y plum son plantas de un nivel; fach son dos fachadas (part 0: sur y norte, 1: este y oeste). */
export type Content = "plan" | "elec" | "plum" | "elev" | "fach" | "sec" | PermitKind | MxKind;
const PERMIT_PLANS: Content[] = ["site", "found", "floorfr", "wallfr", "rooffr", "hvac"];
const MX_PLANS: Content[] = ["mxcim", "mxest", "hid", "san"];
const isPlan = (c: Content) => c === "plan" || c === "elec" || c === "plum" || PERMIT_PLANS.includes(c) || MX_PLANS.includes(c);
/** Láminas que van siempre con la planta baja. */
const groundOnly = (c: Content) => c === "site" || c === "found" || c === "mxcim";
const isText = (c: Content) => TEXT_SHEETS.includes(c);
const FACH_PARTS: Facade[][] = [["S", "N"], ["E", "O"]];
const FACADE_EN: Record<Facade, string> = { S: "South", E: "East", N: "North", O: "West" };
/** En pies y pulgadas las láminas van en inglés, como las pide el departamento de construcción. */
const t = (es: string, en: string) => (imperial() ? en : es);
const facadeLabel = (f: Facade) => imperial() ? `${FACADE_EN[f]} Elevation` : FACADES.find((x) => x.id === f)!.label.replace("Alzado", "Fachada");

function ScaleBar({ den }: { den: number }) {
  // tramos de 1 m (o 5 m en escalas pequeñas) hasta unos 50 mm de largo; en pies, de 1', 5', 10' o 20'
  const ft = imperial(), step = ft ? (den <= 24 ? 1 : den <= 64 ? 5 : den <= 128 ? 10 : 20) : den >= 250 ? 5 : 1;
  const mm = (step * (ft ? FT : 1) * 1000) / den, k = Math.max(1, Math.min(5, Math.floor(50 / mm)));
  return (
    <svg className="scalebar" width={`${k * mm + 12}mm`} height="7mm" viewBox={`0 0 ${k * mm + 12} 7`}>
      {Array.from({ length: k }, (_, i) => (
        <rect key={i} x={i * mm + 1} y={1} width={mm} height={1.6} fill={i % 2 ? "#fff" : "#111"} stroke="#111" strokeWidth={0.2} />
      ))}
      {Array.from({ length: k + 1 }, (_, i) => (
        <text key={i} x={i * mm + 1} y={5.6} fontSize={2.2} textAnchor="middle">{i * step}</text>
      ))}
      <text x={k * mm + 3} y={5.6} fontSize={2.2}>{ft ? "ft" : "m"}</text>
    </svg>
  );
}

type View = { label: string; el: Elevation };

/** Vistas que lleva una lámina de alzados, fachadas o secciones. */
function viewsOf(ed: Editor, content: Content, part = 0): View[] {
  if (content === "fach") return FACH_PARTS[part].map((f) => ({ label: facadeLabel(f), el: elevation(ed.project, f) }));
  if (content === "elev") return FACADES.map((f) => ({ label: imperial() ? facadeLabel(f.id) : f.label, el: elevation(ed.project, f.id) }));
  if (content === "sec") return allSections(ed.project).slice(0, 4).map((s) => ({ label: `${t("Sección", "Section")} ${s.name}-${s.name}'`, el: section(ed.project, s) }));
  return [];
}

/** Escala automática de una lámina. */
function autoScaleOf(ed: Editor, content: Content, level: number) {
  if (isText(content)) return imperial() ? 48 : 50;
  if (content === "site") {
    // la parcela entera más sitio para las cotas y el nombre de la calle
    const st = site(ed.project.levels[0]), b = planBox(), w = st.w + 12 * FT, d = st.d + 16 * FT;
    return scalesFor().find((den) => (w * 1000) / den <= b.w - 8 && (d * 1000) / den <= b.h - 8) ?? 1000;
  }
  // las láminas estructurales dejan sitio alrededor para los ejes
  if (MX_PLANS.includes(content) || content === "plan" && !imperial()) {
    const b = sheetBounds(ed.project.levels[level]), pb = planBox(), m = 2.4;
    return scalesFor().find((den) => ((b.x1 - b.x0 + m) * 1000) / den <= pb.w - 8 && ((b.y1 - b.y0 + m) * 1000) / den <= pb.h - 8) ?? 1000;
  }
  if (isPlan(content)) return fitScale(ed.project.levels[level]);
  // las dos láminas de fachadas van a la misma escala
  if (content === "fach") return Math.max(...FACH_PARTS.map((_, i) => fitElevScale(viewsOf(ed, "fach", i).map((v) => v.el), true)));
  return fitElevScale(viewsOf(ed, content).map((v) => v.el));
}

/** Base de las láminas de estructura e instalaciones: solo muros. */
const ONLY_WALLS: Partial<Record<LayerId, boolean>> = {
  puertas: false, ventanas: false, cotas: false, anot: false, hab: false, losas: false, cubiertas: false, escaleras: false,
  mobiliario: false, secciones: false, electricidad: false, plomeria: false, calcos: false, sombreados: false,
};

/** Capas que se ven en cada plano: la arquitectura no lleva instalaciones y cada instalación solo la suya. */
const PLAN_LAYERS: Partial<Record<Content, Partial<Record<LayerId, boolean>>>> = {
  plan: { electricidad: false, plomeria: false },
  elec: { plomeria: false, electricidad: true, cotas: false, mobiliario: false, losas: false, cubiertas: false, secciones: false },
  plum: { electricidad: false, plomeria: true, cotas: false, losas: false, cubiertas: false, secciones: false },
  site: { ...ONLY_WALLS, cubiertas: true },
  found: { ...ONLY_WALLS, cotas: true },
  floorfr: { ...ONLY_WALLS, puertas: true, ventanas: true },
  wallfr: { ...ONLY_WALLS, puertas: true, ventanas: true },
  rooffr: ONLY_WALLS,
  hvac: { ...ONLY_WALLS, puertas: true, ventanas: true, hab: true },
  mxcim: ONLY_WALLS,
  mxest: { ...ONLY_WALLS, escaleras: true },
  hid: { electricidad: false, plomeria: true, cotas: false, losas: false, cubiertas: false, secciones: false },
  san: { electricidad: false, plomeria: true, cotas: false, losas: false, cubiertas: false, secciones: false },
};

function withVis(ed: Editor, patch: Partial<Record<LayerId, boolean>> | undefined, fn: () => void) {
  const saved = { ...ed.vis };
  Object.assign(ed.vis, patch ?? {});
  try { fn(); } finally { ed.vis = saved; }
}

/** ¿Tiene el nivel algo de esa instalación? */
const hasDisc = (m: Model, d: Discipline) => m.fixtures.some((f) => mepDef(f.kind).disc === d) || m.runs.some((r) => (r.system === "elec") === (d === "elec"));

/** Número de lámina: A arquitectura, E electricidad, P plomería. */
export function sheetNumber(nLevels: number, content: Content, level: number, set?: PermitEntry[]) {
  const hit = set?.find((x) => x.content === content && (x.level === level || TEXT_SHEETS.includes(content) || content === "site"));
  if (hit) return hit.no;
  const k = content === "elec" ? "E" : content === "plum" ? "P" : "A";
  const n = content === "elev" ? nLevels + 1 : content === "fach" ? nLevels + 1 + level : content === "sec" ? nLevels + 3 : level + 1;
  return `${k}-${String(n).padStart(2, "0")}`;
}

/**
 * Dibuja con el editor puesto un momento en otro nivel (y con otra vista), para poder sacar
 * la planta de cualquier nivel sin tocar lo que el usuario tiene en pantalla.
 */
function withLevel(ed: Editor, level: number, fn: () => void) {
  const saved = { active: ed.active, rooms: ed.rooms, hover: ed.hover, view: { ...ed.view } };
  ed.active = level; ed.hover = null;
  if (level !== saved.active) ed.rooms = computeRooms(ed.model);
  try { fn(); } finally { ed.active = saved.active; ed.rooms = saved.rooms; ed.hover = saved.hover; Object.assign(ed.view, saved.view); }
}

/** Una lámina A3 completa: dibujo, tablas y cajetín. */
function Sheet({ ed, content, level, scale, zoom = 1, set }: { ed: Editor; content: Content; level: number; scale: number; zoom?: number; set?: PermitEntry[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const p = ed.project, info = p.info, lv = p.levels[level];
  const views = viewsOf(ed, content, level), secs = allSections(p), stacked = content === "fach";
  const doors = openingSchedule(p, "door").types, windows = openingSchedule(p, "window").types, rooms = roomSchedule(p), walls = wallSchedule(p);
  const sheetNo = sheetNumber(p.levels.length, content, level, set);
  const en = imperial(), permit = (PERMIT_KINDS as string[]).includes(content);
  const planName = en || permit ? (SHEET_TITLES[content]?.en ?? "") : content === "plum" ? "Fontanería y saneamiento" : (MX_TITLES[content] ?? "");
  const finishes = content === "fach" ? [...new Map(views.flatMap((v) => v.el.faces.filter((f) => f.mat && !f.cut).map((f) => [f.mat!.name, f.mat!.finish] as const))).entries()] : [];

  // dibujo a escala; la planta usa la vista del editor cambiada solo mientras se dibuja
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const W = planBox().w * PX_MM, H = planBox().h * PX_MM;
    cv.width = Math.round(W * OVERSAMPLE); cv.height = Math.round(H * OVERSAMPLE);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(OVERSAMPLE, 0, 0, OVERSAMPLE, 0, 0);
    if (isText(content)) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      if (content !== "cover" && content !== "mxport") return;
      // portada: la fachada sur en la mitad de arriba
      const el = elevation(p, "S"), top = H * 0.48, ew = el.u1 - el.u0, eh = el.z1 - el.z0;
      if (!(ew > 0 && eh > 0)) return;
      const s = Math.min((W * 0.8) / ew, (top - 30) / eh);
      drawElevation(ctx, el, (W - ew * s) / 2, (top + eh * s) / 2 + 4, s, "");
      return;
    }
    if (!isPlan(content)) {
      const s = (1000 / scale) * PX_MM, g = grid(views.length, stacked), cw = W / g.cols, ch = H / g.rows;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      if (!views.length) {
        ctx.fillStyle = "#6b6b6b"; ctx.font = "14px 'IBM Plex Sans', sans-serif"; ctx.textAlign = "center";
        ctx.fillText("No hay secciones. Dibuja una línea de corte en la planta con la herramienta Sección (SE).", W / 2, H / 2);
        return;
      }
      views.forEach((e, i) => {
        // cada dibujo centrado en su celda
        const cx = (i % g.cols) * cw, cy = Math.floor(i / g.cols) * ch;
        const w = (e.el.u1 - e.el.u0) * s, h = (e.el.z1 - e.el.z0) * s;
        const ox = cx + (cw - 22 * PX_MM - w) / 2 + (stacked ? 10 : 6) * PX_MM, oy = cy + (ch - 16 * PX_MM + h) / 2 + 4 * PX_MM;
        drawElevation(ctx, e.el, ox, oy, s, e.label, { tags: stacked, heights: stacked });
      });
      return;
    }
    withLevel(ed, level, () => withVis(ed, PLAN_LAYERS[content], () => {
      const b = content === "site" ? (() => { const l = site(lv).lot; return { x0: l[0].x, y0: l[0].y - 2 * FT, x1: l[2].x, y1: l[2].y + 6 * FT }; })() : sheetBounds(lv);
      const s = (1000 / scale) * PX_MM;
      ed.view.scale = s;
      ed.view.ox = W / 2 - ((b.x0 + b.x1) / 2) * s;
      ed.view.oy = H / 2 - ((b.y0 + b.y1) / 2) * s;
      if (content === "plan") drawPlan(ctx, ed, PAPER, W, H, { print: true, marks: levelMarks(p, level) });
      else if (content === "mxcim" || content === "mxest") {
        drawPlan(ctx, ed, LIGHT, W, H, { print: true, roomLabelDy: 0.9 });
        drawMxOverlay(ctx, ed, content);
      } else if (content === "hid" || content === "san") {
        // solo la red de la lámina: agua fría y caliente, o drenaje
        const m = ed.model, keep = content === "hid" ? ["af", "ac"] : ["san"], saved = { runs: m.runs, fx: m.fixtures };
        m.runs = m.runs.filter((r) => keep.includes(r.system));
        m.fixtures = m.fixtures.filter((f) => keep.includes(mepDef(f.kind).sys));
        try { drawPlan(ctx, ed, HALF, W, H, { print: true, roomLabelDy: 0.55 }); } finally { m.runs = saved.runs; m.fixtures = saved.fx; }
      }
      else if (content === "elec" || content === "plum") drawPlan(ctx, ed, HALF, W, H, { print: true, circuits: content === "elec", roomLabelDy: 0.55 });
      else {
        drawPlan(ctx, ed, content === "hvac" ? HALF : LIGHT, W, H, { print: true, roomLabelDy: 0.9 });
        drawPermitOverlay(ctx, ed, content as PermitPlan, W);
      }
    }));
  });

  return (
    <article className="sheet" style={{ transform: `scale(${zoom})`, width: `${sheetSize().w}mm`, height: `${sheetSize().h}mm` }} aria-label={`Lámina ${sheetNo}`}>
      <canvas ref={canvas} className="sheetplan" style={{ left: `${planBox().x}mm`, top: `${planBox().y}mm`, width: `${planBox().w}mm`, height: `${planBox().h}mm` }} />
      {content === "cover" && <CoverBody ed={ed} box={planBox()} />}
      {content === "notes" && <NotesBody box={planBox()} />}
      {content === "details" && <DetailsBody box={planBox()} />}
      {content === "details2" && <FoundationDetails box={planBox()} />}
      {content === "details3" && <StairDetails box={planBox()} />}
      {content === "mxdet1" && <MxFoundationDetails box={planBox()} p={p} sheet={sheetNo} />}
      {content === "mxdet2" && <MxStructDetails box={planBox()} p={p} sheet={sheetNo} />}
      {content === "mxdet3" && <MxStructDetails2 box={planBox()} p={p} sheet={sheetNo} />}
      {content === "mxarq" && <MxArchDetails box={planBox()} sheet={sheetNo} />}
      {content === "mxinst" && <MxInstDetails box={planBox()} sheet={sheetNo} />}
      {content === "mxport" && <MxCoverBody ed={ed} box={planBox()} />}
      {content === "mxnotas" && <MxNotesBody box={planBox()} />}
      <div className="viewtitle" style={{ left: `${planBox().x + 6}mm`, top: `${planBox().y + planBox().h + 1}mm` }}>
        <span className="vt-n">{isText(content) ? planName.toUpperCase() : content === "elev" ? t("ALZADOS", "EXTERIOR ELEVATIONS") : content === "fach" ? views.map((v) => v.label).join(t(" y ", " & ")).toUpperCase() : content === "sec" ? t("SECCIONES", "BUILDING SECTIONS") : content === "site" ? planName.toUpperCase() : planName ? `${lv.name} · ${planName}`.toUpperCase() : lv.name.toUpperCase()}</span>
        {!isText(content) && <>
          <span className="vt-s">{t("E ", "SCALE: ")}{scaleLabel(scale)}{isPlan(content) && content !== "site" && ` · ${t("cota", "F.F.")} ${fmtElev(lv.elev)}`}</span>
          <ScaleBar den={scale} />
        </>}
      </div>
      <div className="sheetnorth" style={{ left: `${planBox().x + planBox().w - 26}mm`, top: `${planBox().y + planBox().h - 9}mm` }}><NorthArrow /></div>
      <aside className="sheetside" style={{ left: `${sheetSize().w - FRAME - SIDE}mm`, top: `${FRAME}mm`, width: `${SIDE}mm`, height: `${sheetSize().h - 2 * FRAME}mm` }}>
        {permit ? <PermitSide ed={ed} content={content} level={level} set={set} /> : MX_EXTRA_SIDE.includes(content) ? <MxExtraSide ed={ed} content={content} set={set ?? mxSet(ed)} /> : !en && ((MX_KINDS as string[]).includes(content) || content === "elec") ? <MxSide ed={ed} content={content} level={level} /> : content === "elec" || content === "plum" ? <MepTables p={p} disc={content} level={level} notes={en} /> : <div className="tables">
          {content === "fach" && <>
            <h4>{t("Acabados de fachada", "Exterior finishes")}</h4>
            {finishes.length ? <table><tbody>{finishes.map(([name, f]) => <tr key={name}>{f ? <><td className="sw"><FinishSym f={f} /></td><td>{name}</td></> : <td colSpan={2}>{name}</td>}</tr>)}</tbody></table> : <p className="empty">{t("Muros sin tipo asignado.", "No wall types assigned.")}</p>}
          </>}
          <h4>{t("Puertas", "Door schedule")}</h4>
          <ScheduleTable rows={doors} kind="door" />
          <h4>{t("Ventanas", "Window schedule")}</h4>
          <ScheduleTable rows={windows} kind="window" />
          {!en && <h4>Muros</h4>}
          {en ? null : walls.length ? (
            <table>
              <thead><tr><th>Tipo</th><th className="r">Long. {lenUnit()}</th><th className="r">Sup. {areaUnit()}</th></tr></thead>
              <tbody>{walls.map((r) => <tr key={r.type}><td>{r.type}</td><td className="r">{n2(r.length)}</td><td className="r">{areaNum(r.area)}</td></tr>)}</tbody>
            </table>
          ) : <p className="empty">Sin muros.</p>}
          <h4>{t("Superficies útiles", "Room areas")}</h4>
          {rooms.length ? (
            <table>
              <thead><tr><th>{t("Nivel", "Level")}</th><th>{t("Espacio", "Space")}</th><th className="r">{areaUnit()}</th></tr></thead>
              <tbody>
                {rooms.map((r, i) => <tr key={i}><td>{r.level}</td><td>{r.name}</td><td className="r">{areaNum(r.area)}</td></tr>)}
                <tr className="tot"><td colSpan={2}>Total</td><td className="r">{areaNum(rooms.reduce((s, r) => s + r.area, 0))}</td></tr>
              </tbody>
            </table>
          ) : <p className="empty">{t("Sin habitaciones definidas.", "No rooms defined.")}</p>}
          <SheetLegend content={content} finishes={content === "fach" ? [] : usedFinishes(p.levels)} />
          {en ? <SheetNotes content={content} levels={p.levels} /> : <MxNotes content={content} />}
        </div>}
        <div className="cajetin">
          <div className="c-proj"><small>{t("Proyecto", "Project")}</small>{info.name || "—"}</div>
          <div className="c-row">
            <div><small>{t("Plano", "Sheet title")}</small>{en && !permit && !isPlan(content) ? (SHEET_TITLES[content]?.en ?? "") : content === "elev" ? "Alzados norte, sur, este y oeste" : content === "fach" ? views.map((v) => v.label).join(" y ") : content === "sec" ? (views.length ? `Secciones ${secs.slice(0, 4).map((x) => `${x.name}-${x.name}'`).join(", ")}` : "Secciones") : isText(content) || content === "site" ? planName : planName ? `${planName} · ${lv.name}` : lv.name}</div>
          </div>
          <div className="c-row">
            <div><small>{t("Autor", "Designer")}</small>{info.author || "—"}</div>
            <div><small>{t("Cliente", "Owner")}</small>{info.client || "—"}</div>
          </div>
          <div className="c-row">
            <div><small>{t("Escala", "Scale")}</small>{isText(content) ? t("Indicada", isDetails(content) ? "As noted" : "N.T.S.") : scaleLabel(scale)}</div>
            <div><small>{t("Fecha", "Date")}</small>{info.date}</div>
            <div className="c-no"><small>{t("Lámina", "Sheet")}</small>{sheetNo}</div>
          </div>
        </div>
      </aside>
      <div className="frame" />
    </article>
  );
}

export interface PermitEntry { content: Content; level: number; scale: number; no: string; title: string }

/**
 * Juego para permiso de construcción en EE.UU., en el orden habitual y con su numeración por disciplina:
 * G general, C sitio, S estructura, A arquitectura, E electricidad, P plomería, M mecánica (HVAC).
 */
export function permitSet(ed: Editor): PermitEntry[] {
  const lvs = ed.project.levels, out: PermitEntry[] = [], count: Record<string, number> = {};
  const planScale = Math.max(...lvs.map((_, i) => autoScaleOf(ed, "plan", i)));
  const many = lvs.length > 1;
  const add = (content: Content, level: number, prefix: string, base: number, scale = planScale, title = SHEET_TITLES[content].en) => {
    const n = (count[`${prefix}${base}`] = (count[`${prefix}${base}`] ?? -1) + 1);
    out.push({ content, level, scale, no: `${prefix}-${String(base + n).padStart(3, "0")}`, title });
  };
  const lvTitle = (c: Content, i: number) => (many ? `${SHEET_TITLES[c].en} · ${lvs[i].name}` : SHEET_TITLES[c].en);
  add("cover", 0, "G", 1); add("notes", 0, "G", 1);
  add("site", 0, "C", 101, autoScaleOf(ed, "site", 0));
  add("found", 0, "S", 101);
  lvs.forEach((_, i) => add("floorfr", i, "S", 101, planScale, lvTitle("floorfr", i)));
  lvs.forEach((_, i) => add("wallfr", i, "S", 101, planScale, lvTitle("wallfr", i)));
  const roofLv = lvs.map((l, i) => (l.roofs.length ? i : -1)).filter((i) => i >= 0);
  for (const i of roofLv.length ? roofLv : [lvs.length - 1]) add("rooffr", i, "S", 101, planScale, roofLv.length > 1 ? lvTitle("rooffr", i) : SHEET_TITLES.rooffr.en);
  lvs.forEach((_, i) => add("plan", i, "A", 101, planScale, lvTitle("plan", i)));
  const fs = autoScaleOf(ed, "fach", 0);
  add("fach", 0, "A", 201, fs); add("fach", 1, "A", 201, fs);
  if (allSections(ed.project).length) add("sec", 0, "A", 301, autoScaleOf(ed, "sec", 0));
  add("details", 0, "A", 501); add("details2", 0, "A", 501); add("details3", 0, "A", 501);
  lvs.forEach((_, i) => add("elec", i, "E", 101, planScale, lvTitle("elec", i)));
  lvs.forEach((_, i) => add("plum", i, "P", 101, planScale, lvTitle("plum", i)));
  lvs.forEach((_, i) => add("hvac", i, "M", 101, planScale, lvTitle("hvac", i)));
  return out;
}

/**
 * Juego ejecutivo en metros (México), numerado por disciplina: ARQ arquitectónicos, EST estructurales,
 * IE instalación eléctrica, IH hidráulica (plomería) e IS sanitaria (hidrosanitario).
 */
export function mxSet(ed: Editor): PermitEntry[] {
  const lvs = ed.project.levels, out: PermitEntry[] = [], count: Record<string, number> = {};
  const planScale = Math.max(...lvs.map((_, i) => autoScaleOf(ed, "mxest", i)));
  const many = lvs.length > 1;
  const add = (content: Content, level: number, prefix: string, scale = planScale, title = MX_TITLES[content]) => {
    const n = (count[prefix] = (count[prefix] ?? 0) + 1);
    out.push({ content, level, scale, no: `${prefix}-${String(n).padStart(2, "0")}`, title });
  };
  const lvTitle = (c: Content, i: number) => (many ? `${MX_TITLES[c]} · ${lvs[i].name}` : MX_TITLES[c]);
  add("mxport", 0, "G", 50); add("mxnotas", 0, "G", 50);
  lvs.forEach((_, i) => add("plan", i, "ARQ", planScale, lvTitle("plan", i)));
  const fs = autoScaleOf(ed, "fach", 0);
  add("fach", 0, "ARQ", fs, "Fachadas sur y norte"); add("fach", 1, "ARQ", fs, "Fachadas este y oeste");
  if (allSections(ed.project).length) add("sec", 0, "ARQ", autoScaleOf(ed, "sec", 0));
  add("elev", 0, "ARQ", autoScaleOf(ed, "elev", 0));
  add("mxarq", 0, "ARQ", 10);
  add("mxcim", 0, "EST");
  lvs.forEach((_, i) => add("mxest", i, "EST", planScale, lvTitle("mxest", i)));
  add("mxdet1", 0, "EST", 25); add("mxdet2", 0, "EST", 25); add("mxdet3", 0, "EST", 25);
  lvs.forEach((_, i) => add("elec", i, "IE", planScale, lvTitle("elec", i)));
  lvs.forEach((_, i) => add("hid", i, "IH", planScale, lvTitle("hid", i)));
  lvs.forEach((_, i) => add("san", i, "IS", planScale, lvTitle("san", i)));
  add("mxinst", 0, "DI", 20);
  return out;
}

/**
 * Láminas del juego completo: la planta de cada nivel (todas a la misma escala), las dos de fachadas,
 * las secciones y, por cada nivel que las tenga, la de electricidad y la de plomería.
 */
export function sheetSet(ed: Editor): { content: Content; level: number; scale: number }[] {
  const lvs = ed.project.levels, planScale = Math.max(...lvs.map((_, i) => autoScaleOf(ed, "plan", i)));
  const set: { content: Content; level: number; scale: number }[] = lvs.map((_, i) => ({ content: "plan", level: i, scale: planScale }));
  const fs = autoScaleOf(ed, "fach", 0);
  set.push({ content: "fach", level: 0, scale: fs }, { content: "fach", level: 1, scale: fs });
  if (allSections(ed.project).length) set.push({ content: "sec", level: 0, scale: autoScaleOf(ed, "sec", 0) });
  for (const d of ["elec", "plum"] as const) lvs.forEach((l, i) => { if (hasDisc(l, d)) set.push({ content: d, level: i, scale: planScale }); });
  return set;
}

/** Título corto de una lámina del juego, para el navegador. */
function entryTitle(ed: Editor, c: Content, level: number) {
  const lvs = ed.project.levels, lv = lvs.length > 1 ? ` · ${lvs[level]?.name ?? ""}` : "";
  switch (c) {
    case "plan": return `Planta${lv}`;
    case "elec": return `${imperial() ? "Electricidad" : "Instalación eléctrica"}${lv}`;
    case "plum": return `Plomería${lv}`;
    case "fach": return level ? "Fachadas este y oeste" : "Fachadas sur y norte";
    case "elev": return "Alzados";
    case "sec": return "Secciones";
    default: return MX_TITLES[c] ? `${MX_TITLES[c]}${groundOnly(c) || TEXT_SHEETS.includes(c) ? "" : lv}` : SHEET_TITLES[c].es;
  }
}

const ZMIN = 0.1, ZMAX = 4;

export function SheetView({ ed }: { ed: Editor }) {
  const host = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  // zoom del usuario; null = ajustar la lámina al hueco
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const zoom = userZoom ?? fitZoom;
  const [den, setDen] = useState<number | null>(null);
  const [content, setContent] = useState<Content>("plan");
  const [part, setPart] = useState(0);
  const [lvl, setLvl] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [info_, setInfo] = useState(false);
  const [printSet, setPrintSet] = useState(false);
  const secs = allSections(ed.project);
  const levelFor = (c: Content) => (c === "fach" ? part : TEXT_SHEETS.includes(c) || groundOnly(c) ? 0 : Math.min(lvl ?? ed.active, ed.project.levels.length - 1));
  const autoScale = autoScaleOf(ed, content, levelFor(content));
  const scale = den ?? autoScale;
  const info = ed.project.info;
  // punto (en coordenadas del contenido) que debe quedar bajo el cursor después de un zoom
  const anchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // juego completo: se montan todas las láminas fuera de la app, se imprime y se desmontan al terminar
  useEffect(() => {
    if (!printSet) return;
    const root = document.documentElement, done = () => { root.classList.remove("print-set"); setPrintSet(false); };
    root.classList.add("print-set");
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); root.classList.remove("print-set"); };
  }, [printSet]);

  // la lámina se encaja en el hueco disponible
  useLayoutEffect(() => {
    const el = host.current!;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setFitZoom(Math.max(ZMIN, Math.min((r.width - 32) / (sheetSize().w * PX_MM), (r.height - 32) / (sheetSize().h * PX_MM))));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  /** Cambia el zoom manteniendo fijo el punto (cx, cy) del hueco, en px relativos a él. */
  const zoomAt = (z: number, cx?: number, cy?: number) => {
    const el = host.current!, old = zoomRef.current;
    z = Math.max(ZMIN, Math.min(ZMAX, z));
    if (Math.abs(z - old) < 1e-4) return;
    cx ??= el.clientWidth / 2; cy ??= el.clientHeight / 2;
    anchor.current = { fx: (el.scrollLeft + cx) / old, fy: (el.scrollTop + cy) / old, cx, cy };
    setUserZoom(z);
  };
  useLayoutEffect(() => {
    const a = anchor.current, el = host.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollLeft = a.fx * zoom - a.cx;
    el.scrollTop = a.fy * zoom - a.cy;
  }, [zoom]);

  // Ctrl/⌘ + rueda (o pellizco del trackpad) amplía; dos dedos en pantalla táctil, igual;
  // arrastrar con el ratón (o con la rueda pulsada) desplaza la lámina
  useEffect(() => {
    const el = host.current!;
    const rel = (x: number, y: number) => { const r = el.getBoundingClientRect(); return [x - r.left, y - r.top] as const; };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const [x, y] = rel(e.clientX, e.clientY);
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * (e.deltaMode ? 0.04 : 0.0015)), x, y);
    };
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const tstart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = { d: dist(e.touches), z: zoomRef.current }; };
    const tmove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [x, y] = rel((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      zoomAt(pinch.z * dist(e.touches) / pinch.d, x, y);
    };
    const tend = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    let drag: { x: number; y: number; sl: number; st: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || (e.button !== 0 && e.button !== 1)) return;
      if ((e.target as HTMLElement).closest("input,select,button,a")) return;
      if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
      drag = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
      el.setPointerCapture(e.pointerId); el.classList.add("panning"); e.preventDefault();
    };
    const move = (e: PointerEvent) => { if (drag) { el.scrollLeft = drag.sl - (e.clientX - drag.x); el.scrollTop = drag.st - (e.clientY - drag.y); } };
    const up = () => { drag = null; el.classList.remove("panning"); };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", tstart, { passive: true });
    el.addEventListener("touchmove", tmove, { passive: false });
    el.addEventListener("touchend", tend);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("wheel", wheel); el.removeEventListener("touchstart", tstart); el.removeEventListener("touchmove", tmove);
      el.removeEventListener("touchend", tend); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    };
  }, []);

  const field = (k: "name" | "author" | "client" | "date", label: string, type = "text") => (
    <label key={`${k}-${info[k]}`}>{label}
      <input type={type} defaultValue={info[k]}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== info[k]) ed.setInfo({ [k]: v }); }} />
    </label>
  );
  const en = imperial(), permits = en ? permitSet(ed) : mxSet(ed);
  const set = printSet ? (permits ?? sheetSet(ed)) : [];
  const nLv = ed.project.levels.length;
  // todas las láminas del juego, numeradas, para el navegador y la vista «Todas»
  const entries = (permits ?? sheetSet(ed)).map((x) => ({ ...x, no: sheetNumber(nLv, x.content, x.level, permits), label: en ? entryTitle(ed, x.content, x.level) : (x as PermitEntry).title ?? entryTitle(ed, x.content, x.level) }));
  const curLevel = levelFor(content);
  const cur = entries.findIndex((x) => x.content === content && x.level === curLevel);
  const go = (i: number) => {
    const x = entries[i];
    if (!x) return;
    if (all) { host.current?.querySelector(`[data-sheet="${i}"]`)?.scrollIntoView({ block: "start" }); return; }
    setContent(x.content);
    if (x.content === "fach") setPart(x.level); else if (!TEXT_SHEETS.includes(x.content) && !groundOnly(x.content)) setLvl(x.level);
    setDen(null);
    if (host.current) host.current.scrollTop = 0;
  };
  const pct = Math.round((zoom / fitZoom) * 100);

  return (
    <div className="sheetpane">
      <div className="sheetbar">
        <button className="btn infobtn" aria-expanded={info_} onClick={() => setInfo(!info_)}>Datos del proyecto</button>
        <div className={`sheetinfo${info_ ? " open" : ""}`}>
          {field("name", "Proyecto")}
          {field("author", "Autor")}
          {field("client", "Cliente")}
          {field("date", "Fecha", "date")}
        </div>
        <label>Contenido
          <select value={content === "fach" ? `fach${part}` : content} onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("fach")) { setContent("fach"); setPart(Number(v.slice(4))); } else setContent(v as Content);
            setDen(null); setLvl(null); setAll(false);
          }}>
            <option value="plan">Planta del nivel activo</option>
            <option value="elec">Electricidad del nivel activo</option>
            <option value="plum">Plomería del nivel activo</option>
            <option value="fach0">Fachadas sur y norte</option>
            <option value="fach1">Fachadas este y oeste</option>
            <option value="elev">Alzados (4 en una lámina)</option>
            <option value="sec">Secciones ({secs.length > 4 ? "las 4 primeras" : secs.length})</option>
            <optgroup label="Juego ejecutivo en metros (México)">
              {MX_KINDS.map((k) => <option key={k} value={k}>{MX_TITLES[k]}</option>)}
            </optgroup>
            <optgroup label="Juego de permiso EE.UU. (en inglés)">
              {PERMIT_KINDS.map((k) => <option key={k} value={k}>{SHEET_TITLES[k].es}</option>)}
            </optgroup>
          </select>
        </label>
        <label>Escala
          <select value={den ?? "auto"} onChange={(e) => setDen(e.target.value === "auto" ? null : Number(e.target.value))} disabled={all}>
            <option value="auto">Ajustar ({scaleLabel(autoScale)})</option>
            {scalesFor().map((d) => <option key={d} value={d}>{scaleLabel(d)}</option>)}
          </select>
        </label>
        <div className="zoombar" role="group" aria-label="Zoom de la lámina">
          <button className="btn" onClick={() => zoomAt(zoom / 1.25)} title="Alejar (Ctrl + rueda)" aria-label="Alejar">−</button>
          <button className="btn zpct" onClick={() => setUserZoom(null)} title="Ajustar la lámina a la ventana">{pct}%</button>
          <button className="btn" onClick={() => zoomAt(zoom * 1.25)} title="Acercar (Ctrl + rueda)" aria-label="Acercar">+</button>
        </div>
        <button className="btn primary" onClick={() => (all ? setPrintSet(true) : window.print())} title={`En el diálogo de impresión elige ${imperial() ? "Tabloid (11 × 17)" : "A3"} horizontal o Guardar como PDF`}>{all ? "Imprimir todas" : "Imprimir / PDF"}</button>
        <button className="btn" onClick={() => setPrintSet(true)} disabled={printSet}
          title={en ? "Juego de permiso de EE.UU. completo (cover, notas, site, estructura, arquitectura, detalles, eléctrico, plomería y HVAC) en un solo PDF" : "Juego ejecutivo completo: arquitectónicos, estructurales con detalles, eléctrico, hidráulico y sanitario, en un solo PDF"}>{en ? "Juego para permiso" : "Juego completo"}</button>
      </div>
      {/* papel Tabloid en EE.UU.; el CSS fijo es para A3 */}
      {imperial() && <style>{"@page{size:17in 11in;margin:0}@media print{html,body{width:431.8mm!important;height:279.4mm!important}}"}</style>}
      <div className="sheetbody">
        <nav className="sheetnav" aria-label="Láminas del juego">
          <div className="sn-head">
            <span>{en ? "Juego de permiso" : "Juego de láminas"} · {entries.length}</span>
            <button className={`btn${all ? " primary" : ""}`} onClick={() => { setAll(!all); setUserZoom(null); }} title="Ver todas las láminas una debajo de otra">{all ? "Una" : "Todas"}</button>
          </div>
          <div className="sn-arrows">
            <button className="btn" disabled={all || cur <= 0} onClick={() => go(cur - 1)} aria-label="Lámina anterior">‹</button>
            <button className="btn" disabled={all || cur >= entries.length - 1} onClick={() => go(cur < 0 ? 0 : cur + 1)} aria-label="Lámina siguiente">›</button>
          </div>
          <ol>
            {entries.map((x, i) => (
              <li key={`${x.content}-${x.level}`}>
                <button className={!all && i === cur ? "on" : ""} onClick={() => go(i)}><b>{x.no}</b><span>{x.label}</span></button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="sheethost" ref={host}>
          <div className={`sheetstack${all ? " all" : ""}`}>
            {all ? entries.map((x, i) => (
              <div key={`${x.content}-${x.level}`} data-sheet={i} className="sheetfit" style={{ width: `${sheetSize().w * PX_MM * zoom}px`, height: `${sheetSize().h * PX_MM * zoom}px` }}>
                <Sheet ed={ed} content={x.content} level={x.level} scale={x.scale} zoom={zoom} set={permits} />
              </div>
            )) : (
              <div className="sheetfit" style={{ width: `${sheetSize().w * PX_MM * zoom}px`, height: `${sheetSize().h * PX_MM * zoom}px` }}>
                <Sheet ed={ed} content={content} level={curLevel} scale={scale} zoom={zoom} set={permits} />
              </div>
            )}
          </div>
        </div>
      </div>
      {printSet && createPortal(
        <div className="printset">{set.map((s) => <Sheet key={`${s.content}-${s.level}`} ed={ed} content={s.content} level={s.level} scale={s.scale} set={permits} />)}</div>,
        document.body,
      )}
    </div>
  );
}

function ScheduleTable({ rows, kind }: { rows: ReturnType<typeof openingSchedule>["types"]; kind: "door" | "window" }) {
  if (!rows.length) return <p className="empty">{kind === "door" ? t("Sin puertas.", "No doors.") : t("Sin ventanas.", "No windows.")}</p>;
  return (
    <table>
      <thead>
        <tr><th>{t("Marca", "Mark")}</th><th>{t("Tipo", "Type")}</th><th className="r">{t("Ancho", "Width")}</th><th className="r">{t("Alto", "Height")}</th>{kind === "window" && <th className="r">{t("Antep.", "Sill")}</th>}<th className="r">{t("Ud.", "Qty")}</th></tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.mark}>
            <td><b>{t.mark}</b></td><td>{styleName(openingStyle(t))}</td><td className="r">{n2(t.width)}</td><td className="r">{n2(t.height)}</td>
            {kind === "window" && <td className="r">{n2(t.sill)}</td>}<td className="r">{t.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tablas laterales de un plano de instalaciones: leyenda con símbolos y mediciones. */
function MepTables({ p, disc, level, notes }: { p: Editor["project"]; disc: Discipline; level: number; notes?: boolean }) {
  const legend = mepSchedule(p, disc, level), runs = runSchedule(p, disc, level);
  return (
    <div className="tables">
      <h4>{t("Leyenda", "Legend & symbols")}</h4>
      {legend.length ? (
        <table className="legend">
          <thead><tr><th>{t("Símbolo", "Symbol")}</th><th>{t("Elemento", "Description")}</th><th className="r">{t("Ud.", "Qty")}</th></tr></thead>
          <tbody>{legend.map((r) => <tr key={r.kind}><td><SymbolIcon kind={r.kind} size={16} /></td><td>{mepEn.fixture(r.kind, r.label)}</td><td className="r">{r.count}</td></tr>)}</tbody>
        </table>
      ) : <p className="empty">{disc === "elec" ? t("Sin mecanismos en este nivel.", "No devices on this level.") : t("Sin puntos de agua en este nivel.", "No plumbing outlets on this level.")}</p>}
      {disc === "elec" ? <>
        <h4>{t("Circuitos", "Panel schedule")}</h4>
        {(() => {
          const cs = circuitSchedule(p, level);
          return cs.length ? (
            <table>
              <thead><tr><th>{t("Circ.", "Ckt")}</th><th>{t("Uso", "Load")}</th><th className="r">{t("Puntos", "Points")}</th><th className="r">{lenUnit()}</th></tr></thead>
              <tbody>{cs.map((c) => <tr key={c.circuit}><td><b>{c.circuit}</b></td><td>{mepEn.circuit(c.circuit, c.name)}</td><td className="r">{c.points}</td><td className="r">{c.length ? fmtDim(c.length) : "—"}</td></tr>)}</tbody>
            </table>
          ) : <p className="empty">{t("Sin circuitos asignados.", "No circuits assigned.")}</p>;
        })()}
      </> : <>
        <h4>{t("Aparatos sanitarios", "Plumbing fixtures")}</h4>
        {(() => {
          const ss = sanitarySchedule(p, level);
          return ss.length ? (
            <table><tbody>{ss.map((r) => <tr key={r.label}><td>{mepEn.sanitary(r.label)}</td><td className="r">{r.count}</td></tr>)}</tbody></table>
          ) : <p className="empty">{t("Sin aparatos sanitarios.", "No plumbing fixtures.")}</p>;
        })()}
      </>}
      <h4>{disc === "elec" ? t("Canalizaciones", "Wiring") : t("Tuberías", "Piping")}</h4>
      {runs.length ? (
        <table className="legend">
          <thead><tr><th>{t("Trazo", "Line")}</th><th>{t("Red", "System")}</th><th className="r">{lenUnit()}</th></tr></thead>
          <tbody>{runs.map((r) => <tr key={r.system}><td><SystemIcon sys={r.system} w={26} /></td><td>{mepEn.system(r.system, r.label)}</td><td className="r">{n2(r.length)}</td></tr>)}</tbody>
        </table>
      ) : <p className="empty">{t("Sin recorridos dibujados.", "No runs drawn.")}</p>}
      <p className="note">{disc === "elec" ? t("Esquema de principio: los recorridos indican la conexión de cada circuito, no el trazado exacto.", "Diagrammatic: wiring shows circuiting only, not exact routing.") : t("Esquema de principio. Agua fría y caliente por falso techo o tabiquería; saneamiento con pendiente mínima del 1,5 %.", "Diagrammatic. CW/HW in walls or ceiling; DWV at 1/4\" per ft min slope.")}</p>
      {notes && <SheetNotes content={disc} />}
    </div>
  );
}
