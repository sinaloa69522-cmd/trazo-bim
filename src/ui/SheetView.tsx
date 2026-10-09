import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { allSections, elevation, FACADES, section, type Elevation, type Facade } from "../core/elevation";
import { bounds } from "../core/geometry";
import { mepDef, type Discipline } from "../core/mep";
import type { LayerId, Model } from "../core/model";
import { computeRooms } from "../core/rooms";
import { circuitSchedule, levelMarks, mepSchedule, openingSchedule, roomSchedule, runSchedule, sanitarySchedule, wallSchedule } from "../core/schedules";
import type { Editor } from "../editor/Editor";
import { drawElevation } from "../editor/elevationRenderer";
import { drawPlan, type PlanColors } from "../editor/planRenderer";
import { SymbolIcon, SystemIcon } from "./MepIcons";

/** Lámina A3 apaisada, en milímetros. */
const SHEET = { w: 420, h: 297 };
const FRAME = 10;
const SIDE = 112;
/** Zona del dibujo dentro del marco, dejando sitio al rótulo de la vista. */
const PLAN = { x: FRAME, y: FRAME, w: SHEET.w - 2 * FRAME - SIDE, h: SHEET.h - 2 * FRAME - 16 };
const PX_MM = 96 / 25.4;
const OVERSAMPLE = 3;
export const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

/** El papel siempre es blanco, aunque la interfaz esté en modo oscuro. */
const PAPER: PlanColors = {
  "plan-bg": "#ffffff", grid: "#ffffff", "grid-major": "#ffffff", wall: "#1a1a1a", door: "#1a1a1a", window: "#1a1a1a",
  dim: "#1a1a1a", anno: "#555555", accent: "#7d7d7d", fg: "#111111", muted: "#6b6b6b", danger: "#111111", panel: "#ffffff",
};

/** Base de arquitectura a medio tono para los planos de instalaciones. */
const HALF: PlanColors = { ...PAPER, wall: "#8f8f8f", door: "#a3a3a3", window: "#a3a3a3", anno: "#a8a8a8", accent: "#b5b5b5", fg: "#3a3a3a", muted: "#9a9a9a" };

/** Escala normalizada más grande en la que cabe la planta. */
export function fitScale(m: Model) {
  const b = bounds(m), wm = b.x1 - b.x0, hm = b.y1 - b.y0;
  return SCALES.find((d) => (wm * 1000) / d <= PLAN.w - 8 && (hm * 1000) / d <= PLAN.h - 8) ?? 1000;
}

const n2 = (v: number) => v.toFixed(2);

/** Rejilla de vistas: hasta cuatro, en 1×1, 2×1 o 2×2; las fachadas van una encima de otra. */
export const grid = (n: number, stacked = false) => (stacked ? { cols: 1, rows: n } : { cols: n > 1 ? 2 : 1, rows: n > 2 ? 2 : 1 });
/** Cada vista ocupa su celda; a la derecha quedan unos 22 mm para las cotas de nivel y a la izquierda sitio para las de altura. */
const cell = (n: number, stacked = false) => { const g = grid(n, stacked); return { w: PLAN.w / g.cols - (stacked ? 34 : 22), h: PLAN.h / g.rows - 16 }; };
export function fitElevScale(els: Elevation[], stacked = false) {
  const c = cell(els.length, stacked);
  return SCALES.find((d) => els.every((e) => ((e.u1 - e.u0) * 1000) / d <= c.w && ((e.z1 - e.z0) * 1000) / d <= c.h)) ?? 1000;
}

/** plan, elec y plum son plantas de un nivel; fach son dos fachadas (part 0: sur y norte, 1: este y oeste). */
export type Content = "plan" | "elec" | "plum" | "elev" | "fach" | "sec";
const isPlan = (c: Content) => c === "plan" || c === "elec" || c === "plum";
const FACH_PARTS: Facade[][] = [["S", "N"], ["E", "O"]];
const facadeLabel = (f: Facade) => FACADES.find((x) => x.id === f)!.label.replace("Alzado", "Fachada");

function ScaleBar({ den }: { den: number }) {
  // tramos de 1 m (o 5 m en escalas pequeñas) hasta unos 50 mm de largo
  const step = den >= 250 ? 5 : 1, mm = (step * 1000) / den, k = Math.max(1, Math.min(5, Math.floor(50 / mm)));
  return (
    <svg className="scalebar" width={`${k * mm + 12}mm`} height="7mm" viewBox={`0 0 ${k * mm + 12} 7`}>
      {Array.from({ length: k }, (_, i) => (
        <rect key={i} x={i * mm + 1} y={1} width={mm} height={1.6} fill={i % 2 ? "#fff" : "#111"} stroke="#111" strokeWidth={0.2} />
      ))}
      {Array.from({ length: k + 1 }, (_, i) => (
        <text key={i} x={i * mm + 1} y={5.6} fontSize={2.2} textAnchor="middle">{i * step}</text>
      ))}
      <text x={k * mm + 3} y={5.6} fontSize={2.2}>m</text>
    </svg>
  );
}

type View = { label: string; el: Elevation };

/** Vistas que lleva una lámina de alzados, fachadas o secciones. */
function viewsOf(ed: Editor, content: Content, part = 0): View[] {
  if (content === "fach") return FACH_PARTS[part].map((f) => ({ label: facadeLabel(f), el: elevation(ed.project, f) }));
  if (content === "elev") return FACADES.map((f) => ({ label: f.label, el: elevation(ed.project, f.id) }));
  if (content === "sec") return allSections(ed.project).slice(0, 4).map((s) => ({ label: `Sección ${s.name}-${s.name}'`, el: section(ed.project, s) }));
  return [];
}

/** Escala automática de una lámina. */
function autoScaleOf(ed: Editor, content: Content, level: number) {
  if (isPlan(content)) return fitScale(ed.project.levels[level]);
  // las dos láminas de fachadas van a la misma escala
  if (content === "fach") return Math.max(...FACH_PARTS.map((_, i) => fitElevScale(viewsOf(ed, "fach", i).map((v) => v.el), true)));
  return fitElevScale(viewsOf(ed, content).map((v) => v.el));
}

/** Capas que se ven en cada plano: la arquitectura no lleva instalaciones y cada instalación solo la suya. */
const PLAN_LAYERS: Partial<Record<Content, Partial<Record<LayerId, boolean>>>> = {
  plan: { electricidad: false, plomeria: false },
  elec: { plomeria: false, electricidad: true, cotas: false, mobiliario: false, losas: false, cubiertas: false, secciones: false },
  plum: { electricidad: false, plomeria: true, cotas: false, losas: false, cubiertas: false, secciones: false },
};

function withVis(ed: Editor, patch: Partial<Record<LayerId, boolean>> | undefined, fn: () => void) {
  const saved = { ...ed.vis };
  Object.assign(ed.vis, patch ?? {});
  try { fn(); } finally { ed.vis = saved; }
}

/** ¿Tiene el nivel algo de esa instalación? */
const hasDisc = (m: Model, d: Discipline) => m.fixtures.some((f) => mepDef(f.kind).disc === d) || m.runs.some((r) => (r.system === "elec") === (d === "elec"));

/** Número de lámina: A arquitectura, E electricidad, P plomería. */
export function sheetNumber(nLevels: number, content: Content, level: number) {
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
function Sheet({ ed, content, level, scale, zoom = 1 }: { ed: Editor; content: Content; level: number; scale: number; zoom?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const p = ed.project, info = p.info, lv = p.levels[level];
  const views = viewsOf(ed, content, level), secs = allSections(p), stacked = content === "fach";
  const doors = openingSchedule(p, "door").types, windows = openingSchedule(p, "window").types, rooms = roomSchedule(p), walls = wallSchedule(p);
  const sheetNo = sheetNumber(p.levels.length, content, level);
  const planName = content === "elec" ? "Instalación eléctrica" : content === "plum" ? "Fontanería y saneamiento" : "";
  const finishes = content === "fach" ? [...new Set(views.flatMap((v) => v.el.faces.filter((f) => f.mat && !f.cut).map((f) => f.mat!.name)))] : [];

  // dibujo a escala; la planta usa la vista del editor cambiada solo mientras se dibuja
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const W = PLAN.w * PX_MM, H = PLAN.h * PX_MM;
    cv.width = Math.round(W * OVERSAMPLE); cv.height = Math.round(H * OVERSAMPLE);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(OVERSAMPLE, 0, 0, OVERSAMPLE, 0, 0);
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
      const b = bounds(lv), s = (1000 / scale) * PX_MM;
      ed.view.scale = s;
      ed.view.ox = W / 2 - ((b.x0 + b.x1) / 2) * s;
      ed.view.oy = H / 2 - ((b.y0 + b.y1) / 2) * s;
      if (content === "plan") drawPlan(ctx, ed, PAPER, W, H, { print: true, marks: levelMarks(p, level) });
      else drawPlan(ctx, ed, HALF, W, H, { print: true, circuits: content === "elec", roomLabelDy: 0.55 });
    }));
  });

  return (
    <article className="sheet" style={{ transform: `scale(${zoom})` }} aria-label={`Lámina ${sheetNo}`}>
      <canvas ref={canvas} className="sheetplan" style={{ left: `${PLAN.x}mm`, top: `${PLAN.y}mm`, width: `${PLAN.w}mm`, height: `${PLAN.h}mm` }} />
      <div className="viewtitle" style={{ left: `${PLAN.x + 6}mm`, top: `${PLAN.y + PLAN.h + 1}mm` }}>
        <span className="vt-n">{content === "elev" ? "ALZADOS" : content === "fach" ? views.map((v) => v.label).join(" y ").toUpperCase() : content === "sec" ? "SECCIONES" : planName ? `${lv.name} · ${planName}`.toUpperCase() : lv.name.toUpperCase()}</span>
        <span className="vt-s">E 1:{scale}{isPlan(content) && ` · cota ${lv.elev >= 0 ? "+" : ""}${n2(lv.elev)}`}</span>
        <ScaleBar den={scale} />
      </div>
      <aside className="sheetside" style={{ left: `${SHEET.w - FRAME - SIDE}mm`, top: `${FRAME}mm`, width: `${SIDE}mm`, height: `${SHEET.h - 2 * FRAME}mm` }}>
        {content === "elec" || content === "plum" ? <MepTables p={p} disc={content} level={level} /> : <div className="tables">
          {content === "fach" && <>
            <h4>Acabados de fachada</h4>
            {finishes.length ? <table><tbody>{finishes.map((f) => <tr key={f}><td>{f}</td></tr>)}</tbody></table> : <p className="empty">Muros sin tipo asignado.</p>}
          </>}
          <h4>Puertas</h4>
          <ScheduleTable rows={doors} kind="door" />
          <h4>Ventanas</h4>
          <ScheduleTable rows={windows} kind="window" />
          <h4>Muros</h4>
          {walls.length ? (
            <table>
              <thead><tr><th>Tipo</th><th className="r">Long. m</th><th className="r">Sup. m²</th></tr></thead>
              <tbody>{walls.map((r) => <tr key={r.type}><td>{r.type}</td><td className="r">{n2(r.length)}</td><td className="r">{n2(r.area)}</td></tr>)}</tbody>
            </table>
          ) : <p className="empty">Sin muros.</p>}
          <h4>Superficies útiles</h4>
          {rooms.length ? (
            <table>
              <thead><tr><th>Nivel</th><th>Espacio</th><th className="r">m²</th></tr></thead>
              <tbody>
                {rooms.map((r, i) => <tr key={i}><td>{r.level}</td><td>{r.name}</td><td className="r">{n2(r.area)}</td></tr>)}
                <tr className="tot"><td colSpan={2}>Total</td><td className="r">{n2(rooms.reduce((s, r) => s + r.area, 0))}</td></tr>
              </tbody>
            </table>
          ) : <p className="empty">Sin habitaciones definidas.</p>}
        </div>}
        <div className="cajetin">
          <div className="c-proj"><small>Proyecto</small>{info.name || "—"}</div>
          <div className="c-row">
            <div><small>Plano</small>{content === "elev" ? "Alzados norte, sur, este y oeste" : content === "fach" ? views.map((v) => v.label).join(" y ") : content === "sec" ? (views.length ? `Secciones ${secs.slice(0, 4).map((x) => `${x.name}-${x.name}'`).join(", ")}` : "Secciones") : planName ? `${planName} · ${lv.name}` : lv.name}</div>
          </div>
          <div className="c-row">
            <div><small>Autor</small>{info.author || "—"}</div>
            <div><small>Cliente</small>{info.client || "—"}</div>
          </div>
          <div className="c-row">
            <div><small>Escala</small>1:{scale}</div>
            <div><small>Fecha</small>{info.date}</div>
            <div className="c-no"><small>Lámina</small>{sheetNo}</div>
          </div>
        </div>
      </aside>
      <div className="frame" />
    </article>
  );
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

export function SheetView({ ed }: { ed: Editor }) {
  const host = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [den, setDen] = useState<number | null>(null);
  const [content, setContent] = useState<Content>("plan");
  const [part, setPart] = useState(0);
  const [printSet, setPrintSet] = useState(false);
  const secs = allSections(ed.project);
  const autoScale = autoScaleOf(ed, content, ed.active);
  const scale = den ?? autoScale;
  const info = ed.project.info;

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
      setZoom(Math.max(0.1, Math.min((r.width - 32) / (SHEET.w * PX_MM), (r.height - 32) / (SHEET.h * PX_MM))));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  const field = (k: "name" | "author" | "client" | "date", label: string, type = "text") => (
    <label key={`${k}-${info[k]}`}>{label}
      <input type={type} defaultValue={info[k]}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== info[k]) ed.setInfo({ [k]: v }); }} />
    </label>
  );
  const set = printSet ? sheetSet(ed) : [];

  return (
    <div className="sheetpane">
      <div className="sheetbar">
        {field("name", "Proyecto")}
        {field("author", "Autor")}
        {field("client", "Cliente")}
        {field("date", "Fecha", "date")}
        <label>Contenido
          <select value={content === "fach" ? `fach${part}` : content} onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("fach")) { setContent("fach"); setPart(Number(v.slice(4))); } else setContent(v as Content);
            setDen(null);
          }}>
            <option value="plan">Planta del nivel activo</option>
            <option value="elec">Electricidad del nivel activo</option>
            <option value="plum">Plomería del nivel activo</option>
            <option value="fach0">Fachadas sur y norte</option>
            <option value="fach1">Fachadas este y oeste</option>
            <option value="elev">Alzados (4 en una lámina)</option>
            <option value="sec">Secciones ({secs.length > 4 ? "las 4 primeras" : secs.length})</option>
          </select>
        </label>
        <label>Escala
          <select value={den ?? "auto"} onChange={(e) => setDen(e.target.value === "auto" ? null : Number(e.target.value))}>
            <option value="auto">Ajustar (1:{autoScale})</option>
            {SCALES.map((d) => <option key={d} value={d}>1:{d}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={() => window.print()} title="En el diálogo de impresión elige A3 horizontal o Guardar como PDF">Imprimir / PDF</button>
        <button className="btn" onClick={() => setPrintSet(true)} disabled={printSet}
          title="Plantas, fachadas, secciones, electricidad y plomería en un solo PDF, una lámina por página">Juego completo</button>
      </div>
      <div className="sheethost" ref={host}>
        <div className="sheetfit" style={{ width: `${SHEET.w * PX_MM * zoom}px`, height: `${SHEET.h * PX_MM * zoom}px` }}>
          <Sheet ed={ed} content={content} level={content === "fach" ? part : ed.active} scale={scale} zoom={zoom} />
        </div>
      </div>
      {printSet && createPortal(
        <div className="printset">{set.map((s) => <Sheet key={`${s.content}-${s.level}`} ed={ed} content={s.content} level={s.level} scale={s.scale} />)}</div>,
        document.body,
      )}
    </div>
  );
}

function ScheduleTable({ rows, kind }: { rows: ReturnType<typeof openingSchedule>["types"]; kind: "door" | "window" }) {
  if (!rows.length) return <p className="empty">{kind === "door" ? "Sin puertas." : "Sin ventanas."}</p>;
  return (
    <table>
      <thead>
        <tr><th>Marca</th><th className="r">Ancho</th><th className="r">Alto</th>{kind === "window" && <th className="r">Antep.</th>}<th className="r">Ud.</th></tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.mark}>
            <td><b>{t.mark}</b></td><td className="r">{n2(t.width)}</td><td className="r">{n2(t.height)}</td>
            {kind === "window" && <td className="r">{n2(t.sill)}</td>}<td className="r">{t.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tablas laterales de un plano de instalaciones: leyenda con símbolos y mediciones. */
function MepTables({ p, disc, level }: { p: Editor["project"]; disc: Discipline; level: number }) {
  const legend = mepSchedule(p, disc, level), runs = runSchedule(p, disc, level);
  return (
    <div className="tables">
      <h4>Leyenda</h4>
      {legend.length ? (
        <table className="legend">
          <thead><tr><th>Símbolo</th><th>Elemento</th><th className="r">Ud.</th></tr></thead>
          <tbody>{legend.map((r) => <tr key={r.kind}><td><SymbolIcon kind={r.kind} size={16} /></td><td>{r.label}</td><td className="r">{r.count}</td></tr>)}</tbody>
        </table>
      ) : <p className="empty">Sin {disc === "elec" ? "mecanismos" : "puntos de agua"} en este nivel.</p>}
      {disc === "elec" ? <>
        <h4>Circuitos</h4>
        {(() => {
          const cs = circuitSchedule(p, level);
          return cs.length ? (
            <table>
              <thead><tr><th>Circ.</th><th>Uso</th><th className="r">Puntos</th><th className="r">m</th></tr></thead>
              <tbody>{cs.map((c) => <tr key={c.circuit}><td><b>{c.circuit}</b></td><td>{c.name}</td><td className="r">{c.points}</td><td className="r">{c.length ? c.length.toFixed(1) : "—"}</td></tr>)}</tbody>
            </table>
          ) : <p className="empty">Sin circuitos asignados.</p>;
        })()}
      </> : <>
        <h4>Aparatos sanitarios</h4>
        {(() => {
          const ss = sanitarySchedule(p, level);
          return ss.length ? (
            <table><tbody>{ss.map((r) => <tr key={r.label}><td>{r.label}</td><td className="r">{r.count}</td></tr>)}</tbody></table>
          ) : <p className="empty">Sin aparatos sanitarios.</p>;
        })()}
      </>}
      <h4>{disc === "elec" ? "Canalizaciones" : "Tuberías"}</h4>
      {runs.length ? (
        <table className="legend">
          <thead><tr><th>Trazo</th><th>Red</th><th className="r">m</th></tr></thead>
          <tbody>{runs.map((r) => <tr key={r.system}><td><SystemIcon sys={r.system} w={26} /></td><td>{r.label}</td><td className="r">{n2(r.length)}</td></tr>)}</tbody>
        </table>
      ) : <p className="empty">Sin recorridos dibujados.</p>}
      <p className="note">{disc === "elec" ? "Esquema de principio: los recorridos indican la conexión de cada circuito, no el trazado exacto." : "Esquema de principio. Agua fría y caliente por falso techo o tabiquería; saneamiento con pendiente mínima del 1,5 %."}</p>
    </div>
  );
}
