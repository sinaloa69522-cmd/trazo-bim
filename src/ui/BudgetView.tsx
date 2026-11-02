import { saveFile } from "./saveFile";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { budget, budgetCsv, CURRENCIES } from "../core/budget";
import { program } from "../core/obra";
import { ProgramDoc, programXlsx } from "./ProgramDoc";
import { InsumosDoc, insumosXlsx } from "./InsumosDoc";
import { insumoGroups, insumos } from "../core/insumos";

const qty = (v: number) => v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
import type { Editor } from "../editor/Editor";

/** Precio editable: se confirma al salir del campo o con Intro; vacío vuelve al de referencia. */
function PriceField({ value, base, onCommit }: { value: number; base: number; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input className={`price${value !== base ? " own" : ""}`} type="number" min={0} step="any" aria-label="Precio unitario"
      title={value !== base ? `Precio propio (referencia: ${base})` : "Precio de referencia: escribe el tuyo"}
      value={draft ?? String(value)} onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={(e) => {
        setDraft(null);
        const t = e.target.value.trim();
        if (!t) { onCommit(null); return; }
        const v = parseFloat(t);
        if (v >= 0 && v !== value) onCommit(v === base ? null : v);
      }} />
  );
}

function Pct({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label>{label}
      <input type="number" min={0} max={100} step="any" value={draft ?? String(value)} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { setDraft(null); const v = parseFloat(e.target.value); if (v >= 0 && v <= 100 && v !== value) onCommit(v); }} />
    </label>
  );
}

export function BudgetView({ ed }: { ed: Editor }) {
  const s = ed.project.budget, info = ed.project.info;
  const us = ed.project.units === "imperial";
  // se recalcula con cada versión del modelo
  const b = useMemo(() => budget(ed.project, s), [ed.version, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const own = Object.keys(s.prices).length;
  const [printing, setPrinting] = useState(false);
  const [tab, setTab] = useState<"budget" | "program" | "insumos">("budget");

  useEffect(() => {
    if (!printing) return;
    const root = document.documentElement, done = () => { root.classList.remove("print-budget"); setPrinting(false); };
    root.classList.add("print-budget");
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); root.classList.remove("print-budget"); };
  }, [printing]);

  const download = () => {
    const blob = new Blob([budgetCsv(b, s, `${us ? "Cost estimate" : "Presupuesto"} · ${info.name}`)], { type: "text/csv;charset=utf-8" });
    void saveFile(`${us ? "estimate" : "presupuesto"}-${(info.name || "proyecto").toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, "-")}.csv`, blob);
    ed.log("Presupuesto exportado en CSV: ábrelo con Excel o Google Sheets.");
  };

  const downloadProgram = () => {
    const g = program(ed.project), name = (info.name || "proyecto").toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, "-");
    void saveFile(`${us ? "schedule" : "programa-de-obra"}-${name}.xlsx`, new Blob([programXlsx(g, `${us ? "Construction schedule" : "Programa de obra"} · ${info.name}`, info.date, s.currency, us)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    ed.log("Programa de obra exportado a Excel.");
  };

  const downloadInsumos = () => {
    const name = (info.name || "proyecto").toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, "-");
    void saveFile(`${us ? "takeoff" : "insumos"}-${name}.xlsx`, new Blob([insumosXlsx(insumos(ed.project), `${us ? "Material takeoff" : "Explosión de insumos"} · ${info.name}`, insumoGroups(ed.project), us)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    ed.log("Explosión de insumos exportada a Excel.");
  };

  return (
    <div className="budgetpane">
      <div className="sheetbar">
        <div className="group" role="tablist" aria-label="Documento">
          <button className="tb" role="tab" aria-pressed={tab === "budget"} onClick={() => setTab("budget")}>Presupuesto</button>
          <button className="tb" role="tab" aria-pressed={tab === "program"} onClick={() => setTab("program")}>Programa de obra</button>
          <button className="tb" role="tab" aria-pressed={tab === "insumos"} onClick={() => setTab("insumos")}>Insumos</button>
        </div>
        {tab === "insumos" ? <>
          <button className="btn primary" onClick={downloadInsumos}>Descargar Excel</button>
          <button className="btn" onClick={() => setPrinting(true)} disabled={printing}>Imprimir / PDF</button>
        </> : tab === "program" ? <>
          <button className="btn primary" onClick={downloadProgram}>Descargar Excel</button>
          <button className="btn" onClick={() => setPrinting(true)} disabled={printing}>Imprimir / PDF</button>
        </> : <>
        <label>Moneda
          <select value={s.currency} onChange={(e) => ed.setBudget({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Pct label="Indirectos y utilidad %" value={s.indirect} onCommit={(v) => ed.setBudget({ indirect: v })} />
        <Pct label={us ? "Impuesto %" : "IVA %"} value={s.tax} onCommit={(v) => ed.setBudget({ tax: v })} />
        <button className="btn primary" onClick={download} title="Separado por punto y coma, con coma decimal, para Excel en español">Exportar a Excel (CSV)</button>
        <button className="btn" onClick={() => setPrinting(true)} disabled={printing}>Imprimir / PDF</button>
        {own > 0 && <button className="btn" onClick={() => ed.setBudget({ prices: {} })}>Volver a precios de referencia ({own})</button>}
        </>}
      </div>
      <div className="budgethost">
        {tab === "insumos" ? <InsumosDoc ed={ed} /> : tab === "program" ? <ProgramDoc ed={ed} /> : <BudgetDoc ed={ed} editable />}
      </div>
      {printing && createPortal(<div className={`printbudget${tab === "program" ? " landscape" : ""}`}>{tab === "insumos" ? <InsumosDoc ed={ed} /> : tab === "program" ? <ProgramDoc ed={ed} /> : <BudgetDoc ed={ed} editable={false} />}</div>, document.body)}
    </div>
  );
}

/** El documento del presupuesto; en la copia para imprimir los precios son texto. */
function BudgetDoc({ ed, editable }: { ed: Editor; editable: boolean }) {
  const s = ed.project.budget, info = ed.project.info;
  const us = ed.project.units === "imperial", L = (es: string, en: string) => (us ? en : es);
  const b = useMemo(() => budget(ed.project, s), [ed.version, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = useMemo(() => {
    const f = new Intl.NumberFormat(us ? "en-US" : "es-MX", { style: "currency", currency: s.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v: number) => f.format(v);
  }, [s.currency]);
  return (
    <article className="budgetdoc">
      <header>
        <div>
          <small>{L("Presupuesto de obra", "Construction cost estimate")}</small>
          <h1>{info.name || "Proyecto"}</h1>
          <p>{[info.client && `${L("Cliente", "Owner")}: ${info.client}`, info.author && `${L("Autor", "Prepared by")}: ${info.author}`, info.date].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="tot-head"><small>{us ? "Total" : "Total con IVA"}</small><b>{money(b.total)}</b></div>
      </header>
      {b.chapters.length ? (
        <table>
          <thead>
            <tr><th>{L("Código", "Item")}</th><th>{L("Descripción", "Description")}</th><th>{L("Ud.", "Unit")}</th><th className="r">{L("Cantidad", "Qty")}</th><th className="r">{L("Precio", "Unit cost")}</th><th className="r">{L("Importe", "Amount")}</th></tr>
          </thead>
          <tbody>
            {b.chapters.map((c) => (
              <Fragment key={c.code}>
                <tr className="chap"><td>{c.code}</td><td colSpan={4}>{c.name}</td><td className="r">{money(c.total)}</td></tr>
                {c.items.map((it) => (
                  <tr key={it.code}>
                    <td className="code">{it.code}</td><td>{it.desc}</td><td>{it.unit}</td><td className="r">{qty(it.qty)}</td>
                    <td className="r">{editable ? <PriceField value={it.price} base={it.base} onCommit={(v) => ed.setPrice(it.code, v)} /> : <span className={it.price !== it.base ? "own" : ""}>{qty(it.price)}</span>}</td>
                    <td className="r">{money(it.amount)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={5}>{L("Costo directo", "Direct cost")}</td><td className="r">{money(b.direct)}</td></tr>
            <tr><td colSpan={5}>{L("Indirectos y utilidad", "General conditions, overhead & profit")} ({s.indirect} %)</td><td className="r">{money(b.indirect)}</td></tr>
            <tr><td colSpan={5}>Subtotal</td><td className="r">{money(b.subtotal)}</td></tr>
            <tr><td colSpan={5}>{L("IVA", "Sales tax")} ({s.tax} %)</td><td className="r">{money(b.tax)}</td></tr>
            <tr className="grand"><td colSpan={5}>Total</td><td className="r">{money(b.total)}</td></tr>
          </tfoot>
        </table>
      ) : <p className="empty">{L("Dibuja muros, losas o instalaciones para generar las partidas.", "Draw walls, slabs or MEP to generate the line items.")}</p>}
      <p className="note">
        {us ? <>Quantities are taken from the model. Unit costs are U.S. national-average references in dollars for a general contractor (subcontract direct cost), not adjusted for location: replace them with local bids by clicking each price. Your own prices show in blue and are saved with the project.</> : <>
        Las cantidades salen del modelo y se actualizan solas. Los precios de referencia son orientativos, en pesos mexicanos y sin
        regionalizar{s.currency !== "MXN" && ` (al cambiar a ${s.currency} no se convierten)`}: cámbialos por los tuyos haciendo clic en cada
        precio. Los propios se marcan en azul y se guardan con el proyecto.</>}
      </p>
    </article>
  );
}
