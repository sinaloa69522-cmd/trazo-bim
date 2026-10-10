import { saveFile } from "./saveFile";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { budget, budgetCsv, CURRENCIES } from "../core/budget";

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
  // se recalcula con cada versión del modelo
  const b = useMemo(() => budget(ed.project, s), [ed.version, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const own = Object.keys(s.prices).length;
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const root = document.documentElement, done = () => { root.classList.remove("print-budget"); setPrinting(false); };
    root.classList.add("print-budget");
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); root.classList.remove("print-budget"); };
  }, [printing]);

  const download = () => {
    const blob = new Blob([budgetCsv(b, s, `Presupuesto · ${info.name}`)], { type: "text/csv;charset=utf-8" });
    void saveFile(`presupuesto-${(info.name || "proyecto").toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, "-")}.csv`, blob);
    ed.log("Presupuesto exportado en CSV: ábrelo con Excel o Google Sheets.");
  };

  return (
    <div className="budgetpane">
      <div className="sheetbar">
        <label>Moneda
          <select value={s.currency} onChange={(e) => ed.setBudget({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Pct label="Indirectos y utilidad %" value={s.indirect} onCommit={(v) => ed.setBudget({ indirect: v })} />
        <Pct label="IVA %" value={s.tax} onCommit={(v) => ed.setBudget({ tax: v })} />
        <button className="btn primary" onClick={download} title="Separado por punto y coma, con coma decimal, para Excel en español">Exportar a Excel (CSV)</button>
        <button className="btn" onClick={() => setPrinting(true)} disabled={printing}>Imprimir / PDF</button>
        {own > 0 && <button className="btn" onClick={() => ed.setBudget({ prices: {} })}>Volver a precios de referencia ({own})</button>}
      </div>
      <div className="budgethost">
        <BudgetDoc ed={ed} editable />
      </div>
      {printing && createPortal(<div className="printbudget"><BudgetDoc ed={ed} editable={false} /></div>, document.body)}
    </div>
  );
}

/** El documento del presupuesto; en la copia para imprimir los precios son texto. */
function BudgetDoc({ ed, editable }: { ed: Editor; editable: boolean }) {
  const s = ed.project.budget, info = ed.project.info;
  const b = useMemo(() => budget(ed.project, s), [ed.version, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = useMemo(() => {
    const f = new Intl.NumberFormat("es-MX", { style: "currency", currency: s.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v: number) => f.format(v);
  }, [s.currency]);
  return (
    <article className="budgetdoc">
      <header>
        <div>
          <small>Presupuesto de obra</small>
          <h1>{info.name || "Proyecto"}</h1>
          <p>{[info.client && `Cliente: ${info.client}`, info.author && `Autor: ${info.author}`, info.date].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="tot-head"><small>Total con IVA</small><b>{money(b.total)}</b></div>
      </header>
      {b.chapters.length ? (
        <table>
          <thead>
            <tr><th>Código</th><th>Descripción</th><th>Ud.</th><th className="r">Cantidad</th><th className="r">Precio</th><th className="r">Importe</th></tr>
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
            <tr><td colSpan={5}>Costo directo</td><td className="r">{money(b.direct)}</td></tr>
            <tr><td colSpan={5}>Indirectos y utilidad ({s.indirect} %)</td><td className="r">{money(b.indirect)}</td></tr>
            <tr><td colSpan={5}>Subtotal</td><td className="r">{money(b.subtotal)}</td></tr>
            <tr><td colSpan={5}>IVA ({s.tax} %)</td><td className="r">{money(b.tax)}</td></tr>
            <tr className="grand"><td colSpan={5}>Total</td><td className="r">{money(b.total)}</td></tr>
          </tfoot>
        </table>
      ) : <p className="empty">Dibuja muros, losas o instalaciones para generar las partidas.</p>}
      <p className="note">
        Las cantidades salen del modelo y se actualizan solas. Los precios de referencia son orientativos, en pesos mexicanos y sin
        regionalizar{s.currency !== "MXN" && ` (al cambiar a ${s.currency} no se convierten)`}: cámbialos por los tuyos haciendo clic en cada
        precio. Los propios se marcan en azul y se guardan con el proyecto.
      </p>
    </article>
  );
}
