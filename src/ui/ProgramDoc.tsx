import { useMemo } from "react";
import { program, workDate, type Program } from "../core/obra";
import { xlsx, type Cell } from "../core/xlsx";
import type { Editor } from "../editor/Editor";

const dm = (d: Date, us = false) => d.toLocaleDateString(us ? "en-US" : "es-MX", { day: "numeric", month: "short" });

/** Programa de obra en Excel: actividades con barras por semana, importe semanal y avance acumulado. */
export function programXlsx(g: Program, title: string, start: string, currency: string, us = false): Uint8Array {
  const W = g.weeks, WK = g.week, L = (es: string, en: string) => (us ? en : es);
  const head: Cell[] = ["#", L("Actividad", "Activity"), L("Cantidad", "Quantity"), L("Días", "Days"), L("Inicio", "Start"), L("Fin", "Finish"), `${L("Importe", "Amount")} (${currency})`];
  for (let w = 0; w < W; w++) head.push({ v: `${L("S", "W")}${w + 1}`, s: 2 });
  const sub = us ? `Start: ${dm(workDate(start, 0, WK), us)} · ${g.days} working days (Monday to Friday) · ${g.weeks} weeks`
    : `Inicio: ${dm(workDate(start, 0, WK))} · ${g.days} días hábiles (lunes a sábado) · ${g.weeks} semanas`;
  const rows: Cell[][] = [[{ v: title, s: 7 }], [sub], [], head.map((c) => (typeof c === "string" ? { v: c, s: 2 } : c))];
  g.acts.forEach((a, i) => {
    const r: Cell[] = [i + 1, a.name, a.qty, a.days, workDate(start, a.start, WK).toISOString().slice(0, 10), workDate(start, a.start + a.days - 1, WK).toISOString().slice(0, 10), a.cost ? { v: Math.round(a.cost * 100) / 100, s: 9 } : ""];
    for (let w = 0; w < W; w++) {
      const d0 = w * WK, d1 = d0 + WK, on = Math.min(d1, a.start + a.days) - Math.max(d0, a.start);
      r.push(on > 0 ? { v: "", s: on >= WK || on >= a.days ? 5 : 8 } : "");
    }
    rows[rows.length] = r.map((c, k) => (k === 0 ? { v: c as number, s: 0 } : c));
  });
  rows.push([]);
  rows.push(["", { v: L("Importe semanal", "Weekly amount"), s: 1 }, "", "", "", "", { v: Math.round(g.total * 100) / 100, s: 10 }, ...g.weekly.map((v) => ({ v: Math.round(v), s: 3 as const }))]);
  rows.push(["", { v: L("Avance acumulado", "Cumulative progress"), s: 1 }, "", "", "", "", "", ...g.cumulative.map((v) => ({ v: Math.round(v * 1000) / 1000, s: 6 as const }))]);
  return xlsx([{ name: L("Programa de obra", "Schedule"), rows, widths: [4, 46, 16, 6, 11, 11, 15, ...Array(W).fill(5)], freeze: 4 }]);
}

/** Diagrama de barras del programa con el avance financiero. */
export function ProgramDoc({ ed }: { ed: Editor }) {
  const g = useMemo(() => program(ed.project), [ed.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = ed.project.info, s = ed.project.budget, us = ed.project.units === "imperial", L = (es: string, en: string) => (us ? en : es);
  const money = useMemo(() => { const f = new Intl.NumberFormat(us ? "en-US" : "es-MX", { style: "currency", currency: s.currency, maximumFractionDigits: 0 }); return (v: number) => f.format(v); }, [s.currency, us]);
  const W = g.weeks, WK = g.week, day = (n: number) => dm(workDate(info.date, n, WK), us);
  return (
    <article className="budgetdoc progdoc">
      <header>
        <div>
          <small>{L("Programa de obra", "Construction schedule")}</small>
          <h1>{info.name || "Proyecto"}</h1>
          <p>{[info.client && `${L("Cliente", "Owner")}: ${info.client}`, `${L("Inicio", "Start")} ${day(0)}`, `${L("término", "completion")} ${day(g.days - 1)}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="tot-head"><small>{L("Duración", "Duration")}</small><b>{W} {L("semanas", "weeks")}</b></div>
      </header>
      <div className="gantt" style={{ ["--weeks" as string]: W }}>
        <table>
          <thead>
            <tr><th>{L("Actividad", "Activity")}</th><th className="r">{L("Días", "Days")}</th><th className="r">{L("Importe", "Amount")}</th>{Array.from({ length: W }, (_, w) => <th key={w} className="wk" title={day(w * WK)}>{w + 1}</th>)}</tr>
          </thead>
          <tbody>
            {g.acts.map((a) => (
              <tr key={a.id}>
                <td><b>{a.name}</b>{a.qty && <small>{a.qty}</small>}</td>
                <td className="r">{a.days}</td>
                <td className="r">{a.cost ? money(a.cost) : "—"}</td>
                <td colSpan={W} className="bars"><span style={{ left: `${(a.start / (W * WK)) * 100}%`, width: `${(a.days / (W * WK)) * 100}%` }} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>{L("Importe semanal", "Weekly amount")}</td><td /><td className="r">{money(g.total)}</td>{g.weekly.map((v, w) => <td key={w} className="wk">{v ? Math.round(v / 1000) : ""}</td>)}</tr>
            <tr><td>{L("Avance acumulado", "Cumulative %")}</td><td /><td />{g.cumulative.map((v, w) => <td key={w} className="wk">{Math.round(v * 100)}</td>)}</tr>
          </tfoot>
        </table>
      </div>
      {us ? <p className="note">
        Monday-to-Friday weeks from the project date ({info.date}). Durations come from the model quantities with typical subcontractor production:
        framing 200 sq ft of wall per day, drywall 600 sq ft per day (hang, tape and finish), siding 250 sq ft per day, flooring 200 sq ft per day, a
        7-day slab cure, and time for the footing, rough-in, insulation and final inspections. Weekly amounts are in thousands of {s.currency} and include overhead and profit; cumulative progress is in percent.
        Adjust it to your trades and your jurisdiction&apos;s inspection lead times.
      </p> : <p className="note">
        Semanas de lunes a sábado desde la fecha del proyecto ({info.date}). Las duraciones salen de las cantidades del modelo con rendimientos
        de una cuadrilla (oficial y ayudante): zapatas 5 m/día, muros 12 m²/día, losas 15 m²/día, aplanados 20 m²/día, pisos 12 m²/día. El importe
        semanal está en miles de {s.currency} e incluye indirectos; el acumulado, en porcentaje. Ajusta el programa a las cuadrillas reales de la obra.
      </p>}
    </article>
  );
}
