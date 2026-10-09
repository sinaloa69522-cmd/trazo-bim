import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { allSections, elevation, FACADES, section, type Elevation } from "../core/elevation";
import { bounds } from "../core/geometry";
import { levelMarks, openingSchedule, roomSchedule } from "../core/schedules";
import type { Editor } from "../editor/Editor";
import { drawElevation } from "../editor/elevationRenderer";
import { drawPlan, type PlanColors } from "../editor/planRenderer";

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

/** Escala normalizada más grande en la que cabe la planta. */
export function fitScale(ed: Editor) {
  const b = bounds(ed.model), wm = b.x1 - b.x0, hm = b.y1 - b.y0;
  return SCALES.find((d) => (wm * 1000) / d <= PLAN.w - 8 && (hm * 1000) / d <= PLAN.h - 8) ?? 1000;
}

const n2 = (v: number) => v.toFixed(2);

/** Rejilla de vistas: hasta cuatro, en 1×1, 2×1 o 2×2. */
export const grid = (n: number) => ({ cols: n > 1 ? 2 : 1, rows: n > 2 ? 2 : 1 });
/** Cada vista ocupa su celda; a la derecha quedan unos 16 mm para las cotas de nivel. */
const cell = (n: number) => { const g = grid(n); return { w: PLAN.w / g.cols - 22, h: PLAN.h / g.rows - 16 }; };
export function fitElevScale(els: Elevation[]) {
  const c = cell(els.length);
  return SCALES.find((d) => els.every((e) => ((e.u1 - e.u0) * 1000) / d <= c.w && ((e.z1 - e.z0) * 1000) / d <= c.h)) ?? 1000;
}

type Content = "plan" | "elev" | "sec";

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

export function SheetView({ ed }: { ed: Editor }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [den, setDen] = useState<number | null>(null);
  const [content, setContent] = useState<Content>("plan");
  const secs = allSections(ed.project);
  const views = content === "elev" ? FACADES.map((f) => ({ label: f.label, el: elevation(ed.project, f.id) }))
    : content === "sec" ? secs.slice(0, 4).map((s) => ({ label: `Sección ${s.name}-${s.name}'`, el: section(ed.project, s) })) : [];
  const autoScale = content === "plan" ? fitScale(ed) : fitElevScale(views.map((e) => e.el));
  const scale = den ?? autoScale;
  const p = ed.project, info = p.info, lv = ed.model;
  const doors = openingSchedule(p, "door").types, windows = openingSchedule(p, "window").types, rooms = roomSchedule(p);
  const sheetNo = `A-${String(content === "elev" ? p.levels.length + 1 : content === "sec" ? p.levels.length + 2 : ed.active + 1).padStart(2, "0")}`;

  // dibujo de la planta a escala, con la vista del editor cambiada solo mientras se dibuja
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const W = PLAN.w * PX_MM, H = PLAN.h * PX_MM;
    cv.width = Math.round(W * OVERSAMPLE); cv.height = Math.round(H * OVERSAMPLE);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(OVERSAMPLE, 0, 0, OVERSAMPLE, 0, 0);
    if (content !== "plan") {
      const s = (1000 / scale) * PX_MM, g = grid(views.length), cw = W / g.cols, ch = H / g.rows;
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
        const ox = cx + (cw - 22 * PX_MM - w) / 2 + 6 * PX_MM, oy = cy + (ch - 16 * PX_MM + h) / 2 + 4 * PX_MM;
        drawElevation(ctx, e.el, ox, oy, s, e.label);
      });
      return;
    }
    const b = bounds(lv), s = (1000 / scale) * PX_MM, saved = { ...ed.view };
    ed.view.scale = s;
    ed.view.ox = W / 2 - ((b.x0 + b.x1) / 2) * s;
    ed.view.oy = H / 2 - ((b.y0 + b.y1) / 2) * s;
    try { drawPlan(ctx, ed, PAPER, W, H, { print: true, marks: levelMarks(p, ed.active) }); }
    finally { Object.assign(ed.view, saved); }
  });

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

  return (
    <div className="sheetpane">
      <div className="sheetbar">
        {field("name", "Proyecto")}
        {field("author", "Autor")}
        {field("client", "Cliente")}
        {field("date", "Fecha", "date")}
        <label>Contenido
          <select value={content} onChange={(e) => { setContent(e.target.value as Content); setDen(null); }}>
            <option value="plan">Planta del nivel activo</option>
            <option value="elev">Alzados (4 fachadas)</option>
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
      </div>
      <div className="sheethost" ref={host}>
        <div className="sheetfit" style={{ width: `${SHEET.w * PX_MM * zoom}px`, height: `${SHEET.h * PX_MM * zoom}px` }}>
          <article className="sheet" style={{ transform: `scale(${zoom})` }} aria-label={`Lámina ${sheetNo}`}>
            <canvas ref={canvas} className="sheetplan" style={{ left: `${PLAN.x}mm`, top: `${PLAN.y}mm`, width: `${PLAN.w}mm`, height: `${PLAN.h}mm` }} />
            <div className="viewtitle" style={{ left: `${PLAN.x + 6}mm`, top: `${PLAN.y + PLAN.h + 1}mm` }}>
              <span className="vt-n">{content === "elev" ? "ALZADOS" : content === "sec" ? "SECCIONES" : lv.name.toUpperCase()}</span>
              <span className="vt-s">E 1:{scale}{content === "plan" && ` · cota ${lv.elev >= 0 ? "+" : ""}${n2(lv.elev)}`}</span>
              <ScaleBar den={scale} />
            </div>
            <aside className="sheetside" style={{ left: `${SHEET.w - FRAME - SIDE}mm`, top: `${FRAME}mm`, width: `${SIDE}mm`, height: `${SHEET.h - 2 * FRAME}mm` }}>
              <div className="tables">
                <h4>Puertas</h4>
                <ScheduleTable rows={doors} kind="door" />
                <h4>Ventanas</h4>
                <ScheduleTable rows={windows} kind="window" />
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
              </div>
              <div className="cajetin">
                <div className="c-proj"><small>Proyecto</small>{info.name || "—"}</div>
                <div className="c-row">
                  <div><small>Plano</small>{content === "elev" ? "Alzados norte, sur, este y oeste" : content === "sec" ? (views.length ? `Secciones ${secs.slice(0, 4).map((x) => `${x.name}-${x.name}'`).join(", ")}` : "Secciones") : lv.name}</div>
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
        </div>
      </div>
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
