// Presentación para el cliente: unas pocas hojas apaisadas con la imagen 3D, las plantas amuebladas a color,
// el cuadro de áreas y el presupuesto resumido, para enseñar el proyecto sin láminas técnicas.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { budget, defaultBudget } from "../core/budget";
import { roomUse, type RoomUse } from "../core/codeCheck";
import { sheetBounds } from "../core/geometry";
import { program } from "../core/obra";
import { officeOf, responsibleLine } from "../core/office";
import { jpegPdf, type PdfPage } from "../core/pdf";
import { projectFileName } from "../core/projectFile";
import { areaTable } from "../core/rooms";
import { fmtArea } from "../core/units";
import type { Editor } from "../editor/Editor";
import { drawPlan } from "../editor/planRenderer";
import { saveFile } from "./saveFile";
import { PAPER, sheetJpeg, withLevel, withVis } from "./SheetView";

/** Hoja A4 apaisada, en mm */
const PAGE = { w: 297, h: 210 };
const PX_MM = 96 / 25.4;

/** Color de cada uso, suave para que se lean muebles y rótulos encima. */
export const USE_COLOR: Record<RoomUse, string> = {
  "recamara-principal": "#cfe0f3", recamara: "#dde9f6", estancia: "#f6e7cf", comedor: "#f3e2c4", "estancia-comedor": "#f6e7cf",
  cocina: "#f8d9c0", bano: "#cdeae5", lavado: "#d9ece6", estudio: "#e4dcf2", circulacion: "#ecebe6", cochera: "#e1e1e1", otro: "#e9f0dc",
};
const USE_NAME: Record<RoomUse, string> = {
  "recamara-principal": "Recámaras", recamara: "Recámaras", estancia: "Estar y comedor", comedor: "Estar y comedor", "estancia-comedor": "Estar y comedor",
  cocina: "Cocina", bano: "Baños", lavado: "Lavado y servicio", estudio: "Estudio", circulacion: "Circulaciones", cochera: "Cochera", otro: "Otros espacios",
};
const roomFill = (name: string) => USE_COLOR[roomUse(name)];

/** Capas que se ven en la planta de presentación: arquitectura y muebles, sin cotas ni instalaciones. */
const PRES_LAYERS = { cotas: false, ejes: false, electricidad: false, plomeria: false, secciones: false, cubiertas: false, losas: false, calcos: false, anot: false, sombreados: false } as const;

/** Colores de la planta: muros en gris oscuro y muebles en gris medio. */
const PRES_COLORS = { ...PAPER, wall: "#2b2b2b", door: "#3a3a3a", window: "#3d6f91", anno: "#7a7a7a", fg: "#1d1d1d", muted: "#555555" };

/** Resumen del proyecto que se muestra en la portada y en la hoja de cifras. */
export function presentationData(p: Editor["project"]) {
  const areas = areaTable(p.levels);
  const all = p.levels.flatMap((l) => l.rooms.map((r) => roomUse(r.name)));
  const beds = all.filter((u) => u === "recamara" || u === "recamara-principal").length, baths = all.filter((u) => u === "bano").length;
  const built = areas.reduce((s, a) => s + a.built, 0), useful = areas.reduce((s, a) => s + a.useful, 0);
  const b = budget(p, p.budget ?? defaultBudget()), k = 1 + (p.budget?.indirect ?? 20) / 100;
  const chapters = b.chapters.filter((c) => c.total > 0).map((c) => ({ name: c.name.replace(/^\d+\s*/, ""), total: c.total * k }));
  const weeks = p.levels.some((l) => l.walls.length) ? program(p).weeks : 0;
  return { areas, beds, baths, built, useful, budget: b, chapters, weeks, perM2: built ? b.total / built : 0 };
}

export function Presentation({ ed, shot, onClose }: { ed: Editor; shot: string | null; onClose: () => void }) {
  const p = ed.project, info = p.info, d = useMemo(() => presentationData(p), [p]), office = officeOf(p);
  const cur = p.budget?.currency ?? "MXN";
  const money = useMemo(() => { const f = new Intl.NumberFormat("es-MX", { style: "currency", currency: cur, maximumFractionDigits: 0 }); return (v: number) => f.format(v); }, [cur]);
  const host = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const levels = p.levels.map((l, i) => ({ l, i })).filter(({ l }) => l.walls.length);

  useLayoutEffect(() => {
    const el = host.current!;
    const fit = () => setZoom(Math.min(1.4, (el.clientWidth - 32) / (PAGE.w * PX_MM)));
    const ro = new ResizeObserver(fit);
    ro.observe(el); fit();
    return () => ro.disconnect();
  }, []);

  const pdf = async () => {
    const nodes = [...(host.current?.querySelectorAll<HTMLElement>(".prespage") ?? [])], pages: PdfPage[] = [];
    try {
      for (const [i, n] of nodes.entries()) { setBusy(`Creando PDF… ${i + 1}/${nodes.length}`); 
        // se captura a tamaño real, sin el zoom de la vista previa
        const t = n.style.transform; n.style.transform = "none";
        try { pages.push(await sheetJpeg(n)); } finally { n.style.transform = t; }
      }
      const pt = 72 / 25.4, bytes = jpegPdf(pages, PAGE.w * pt, PAGE.h * pt, info.name);
      const name = `${projectFileName(info.name).replace(/\.[^.]+$/, "")}-presentacion.pdf`;
      const r = await saveFile(name, new Blob([bytes], { type: "application/pdf" }));
      if (r === "saved") ed.log(`Presentación guardada: ${name} (${pages.length} hojas).`);
    } catch (e) { ed.log(`No se pudo crear el PDF: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const facts: [string, string][] = [
    ["Superficie construida", fmtArea(d.built)],
    ...(d.beds ? [["Recámaras", String(d.beds)] as [string, string]] : []),
    ...(d.baths ? [["Baños", String(d.baths)] as [string, string]] : []),
    ["Niveles", String(p.levels.length)],
  ];
  const Head = ({ title }: { title: string }) => (
    <header className="ph"><span>{info.name || "Proyecto"}</span><b>{title}</b></header>
  );
  const Foot = ({ n }: { n: number }) => (
    <footer className="pf"><span>{[office?.name || info.author, info.date].filter(Boolean).join(" · ")}</span><span>{n}</span></footer>
  );
  const page = (key: string, body: React.ReactNode) => (
    <div key={key} className="preswrap" style={{ width: PAGE.w * PX_MM * zoom, height: PAGE.h * PX_MM * zoom }}>
      <article className="prespage" style={{ width: `${PAGE.w}mm`, height: `${PAGE.h}mm`, transform: `scale(${zoom})` }}>{body}</article>
    </div>
  );

  return (
    <div className="presdlg" role="dialog" aria-label="Presentación para el cliente">
      <div className="presbar">
        <strong>Presentación para el cliente</strong>
        <span className="hint">{shot ? "La imagen de portada es la vista 3D tal como está ahora: encuádrala a tu gusto antes de abrir la presentación." : "Sin imagen 3D: abre la vista 3D o Dividida y vuelve a abrir la presentación."}</span>
        <span style={{ flex: 1 }} />
        <button className="btn primary" disabled={!!busy} onClick={() => void pdf()}>{busy ?? "Descargar PDF"}</button>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
      <div className="presbody" ref={host}>
        {page("cover", <div className="pcover">
          <div className="pc-img">{shot ? <img src={shot} alt="Vista 3D del proyecto" /> : <div className="pc-noimg">Vista 3D</div>}</div>
          <div className="pc-side">
            <p className="pc-kicker">Propuesta arquitectónica</p>
            <h1>{info.name || "Proyecto"}</h1>
            {info.client && <p className="pc-for">Para {info.client}</p>}
            <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <div className="pc-by">
              {office?.logo && <img src={office.logo} alt="" />}
              <div>
                {office?.name && <b>{office.name}</b>}
                <span>{responsibleLine(office, info.author)}</span>
                {office?.contact && <span>{office.contact}</span>}
                <span>{info.date}</span>
              </div>
            </div>
          </div>
        </div>)}
        {levels.map(({ l, i }, k) => page(`lv${i}`, <>
          <Head title={l.name} />
          {/* el pie va antes de la planta: al pasar a imagen, lo que sigue al lienzo pierde sus estilos */}
          <Foot n={k + 2} />
          <div className="pplan">
            <PresPlan ed={ed} level={i} />
            <aside>
              <h3>Espacios</h3>
              <table><tbody>
                {d.areas[i].rooms.map((r, j) => <tr key={j}><td><i style={{ background: roomFill(r.name) }} />{r.name}</td><td className="r">{fmtArea(r.area)}</td></tr>)}
                <tr className="tot"><td>Superficie útil</td><td className="r">{fmtArea(d.areas[i].useful)}</td></tr>
                <tr className="tot"><td>Construida</td><td className="r">{fmtArea(d.areas[i].built)}</td></tr>
              </tbody></table>
              <ul className="plegend">{[...new Set(d.areas[i].rooms.map((r) => roomUse(r.name)))].map((u) => USE_NAME[u]).filter((v, j, a) => a.indexOf(v) === j).map((n) => {
                const u = (Object.keys(USE_NAME) as RoomUse[]).find((x) => USE_NAME[x] === n)!;
                return <li key={n}><i style={{ background: USE_COLOR[u] }} />{n}</li>;
              })}</ul>
            </aside>
          </div>
        </>))}
        {page("num", <>
          <Head title="Áreas y presupuesto" />
          <div className="pnums">
            <section>
              <h3>Cuadro de áreas</h3>
              <table>
                <thead><tr><th>Nivel</th><th className="r">Útil</th><th className="r">Construida</th></tr></thead>
                <tbody>
                  {d.areas.map((a, i) => <tr key={i}><td>{a.level}</td><td className="r">{fmtArea(a.useful)}</td><td className="r">{fmtArea(a.built)}</td></tr>)}
                  <tr className="tot"><td>Total</td><td className="r">{fmtArea(d.useful)}</td><td className="r">{fmtArea(d.built)}</td></tr>
                </tbody>
              </table>
              <div className="pkpi">
                <div><small>Costo estimado</small><b>{money(d.budget.total)}</b></div>
                <div><small>Por m² construido</small><b>{money(d.perM2)}</b></div>
                {d.weeks > 0 && <div><small>Tiempo de obra</small><b>{d.weeks} semanas</b></div>}
              </div>
            </section>
            <section>
              <h3>Presupuesto resumido</h3>
              <table>
                <thead><tr><th>Concepto</th><th className="r">Importe</th><th className="r">%</th></tr></thead>
                <tbody>
                  {d.chapters.map((c) => <tr key={c.name}><td>{c.name}</td><td className="r">{money(c.total)}</td><td className="r">{d.budget.subtotal ? ((c.total / d.budget.subtotal) * 100).toFixed(1) : "0"}</td></tr>)}
                  <tr className="tot"><td>Subtotal</td><td className="r">{money(d.budget.subtotal)}</td><td /></tr>
                  <tr><td>IVA ({p.budget?.tax ?? 16} %)</td><td className="r">{money(d.budget.tax)}</td><td /></tr>
                  <tr className="tot"><td>Total</td><td className="r">{money(d.budget.total)}</td><td /></tr>
                </tbody>
              </table>
              <p className="pnote">Estimación paramétrica con las cantidades del modelo y precios unitarios de referencia, con indirectos y utilidad incluidos en cada concepto. Sirve para decidir; el presupuesto definitivo se cierra con el catálogo de conceptos y las cotizaciones de obra.</p>
            </section>
          </div>
          <Foot n={levels.length + 2} />
        </>)}
      </div>
    </div>
  );
}

/** Planta del nivel a color y amueblada, encajada en su recuadro. */
function PresPlan({ ed, level }: { ed: Editor; level: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const BOX = { w: 205, h: 160 };
  useEffect(() => {
    const c = cv.current!, os = 2.4, W = BOX.w * PX_MM, H = BOX.h * PX_MM;
    c.width = Math.round(W * os); c.height = Math.round(H * os);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(os, 0, 0, os, 0, 0);
    withLevel(ed, level, () => withVis(ed, PRES_LAYERS, () => {
      const b = sheetBounds(ed.model), s = Math.min((W - 20) / (b.x1 - b.x0), (H - 20) / (b.y1 - b.y0));
      ed.view.scale = s;
      ed.view.ox = W / 2 - ((b.x0 + b.x1) / 2) * s;
      ed.view.oy = H / 2 - ((b.y0 + b.y1) / 2) * s;
      drawPlan(ctx, ed, PRES_COLORS, W, H, { print: true, roomFill });
    }));
  });
  return <canvas ref={cv} style={{ width: `${BOX.w}mm`, height: `${BOX.h}mm` }} />;
}
