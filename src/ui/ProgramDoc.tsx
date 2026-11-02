import { useMemo } from "react";
import { program, workDate, WEEK, type Program } from "../core/obra";
import { xlsx, type Cell } from "../core/xlsx";
import type { Editor } from "../editor/Editor";

const dm = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** Programa de obra en Excel: actividades con barras por semana, importe semanal y avance acumulado. */
export function programXlsx(g: Program, title: string, start: string, currency: string): Uint8Array {
  const W = g.weeks, head: Cell[] = ["#", "Actividad", "Cantidad", "Días", "Inicio", "Fin", `Importe (${currency})`];
  for (let w = 0; w < W; w++) head.push({ v: `S${w + 1}`, s: 2 });
  const rows: Cell[][] = [[{ v: title, s: 7 }], [`Inicio: ${dm(workDate(start, 0))} · ${g.days} días hábiles (lunes a sábado) · ${g.weeks} semanas`], [], head.map((c) => (typeof c === "string" ? { v: c, s: 2 } : c))];
  g.acts.forEach((a, i) => {
    const r: Cell[] = [i + 1, a.name, a.qty, a.days, workDate(start, a.start).toISOString().slice(0, 10), workDate(start, a.start + a.days - 1).toISOString().slice(0, 10), a.cost ? { v: Math.round(a.cost * 100) / 100, s: 9 } : ""];
    for (let w = 0; w < W; w++) {
      const d0 = w * WEEK, d1 = d0 + WEEK, on = Math.min(d1, a.start + a.days) - Math.max(d0, a.start);
      r.push(on > 0 ? { v: "", s: on >= WEEK || on >= a.days ? 5 : 8 } : "");
    }
    rows[rows.length] = r.map((c, k) => (k === 0 ? { v: c as number, s: 0 } : c));
  });
  rows.push([]);
  rows.push(["", { v: "Importe semanal", s: 1 }, "", "", "", "", { v: Math.round(g.total * 100) / 100, s: 10 }, ...g.weekly.map((v) => ({ v: Math.round(v), s: 3 as const }))]);
  rows.push(["", { v: "Avance acumulado", s: 1 }, "", "", "", "", "", ...g.cumulative.map((v) => ({ v: Math.round(v * 1000) / 1000, s: 6 as const }))]);
  return xlsx([{ name: "Programa de obra", rows, widths: [4, 46, 16, 6, 11, 11, 15, ...Array(W).fill(5)], freeze: 4 }]);
}

/** Diagrama de barras del programa con el avance financiero. */
export function ProgramDoc({ ed }: { ed: Editor }) {
  const g = useMemo(() => program(ed.project), [ed.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = ed.project.info, s = ed.project.budget;
  const money = useMemo(() => { const f = new Intl.NumberFormat("es-MX", { style: "currency", currency: s.currency, maximumFractionDigits: 0 }); return (v: number) => f.format(v); }, [s.currency]);
  const W = g.weeks;
  return (
    <article className="budgetdoc progdoc">
      <header>
        <div>
          <small>Programa de obra</small>
          <h1>{info.name || "Proyecto"}</h1>
          <p>{[info.client && `Cliente: ${info.client}`, `Inicio ${dm(workDate(info.date, 0))}`, `término ${dm(workDate(info.date, g.days - 1))}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="tot-head"><small>Duración</small><b>{W} semanas</b></div>
      </header>
      <div className="gantt" style={{ ["--weeks" as string]: W }}>
        <table>
          <thead>
            <tr><th>Actividad</th><th className="r">Días</th><th className="r">Importe</th>{Array.from({ length: W }, (_, w) => <th key={w} className="wk" title={dm(workDate(info.date, w * WEEK))}>{w + 1}</th>)}</tr>
          </thead>
          <tbody>
            {g.acts.map((a) => (
              <tr key={a.id}>
                <td><b>{a.name}</b>{a.qty && <small>{a.qty}</small>}</td>
                <td className="r">{a.days}</td>
                <td className="r">{a.cost ? money(a.cost) : "—"}</td>
                <td colSpan={W} className="bars"><span style={{ left: `${(a.start / (W * WEEK)) * 100}%`, width: `${(a.days / (W * WEEK)) * 100}%` }} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Importe semanal</td><td /><td className="r">{money(g.total)}</td>{g.weekly.map((v, w) => <td key={w} className="wk">{v ? Math.round(v / 1000) : ""}</td>)}</tr>
            <tr><td>Avance acumulado</td><td /><td />{g.cumulative.map((v, w) => <td key={w} className="wk">{Math.round(v * 100)}</td>)}</tr>
          </tfoot>
        </table>
      </div>
      <p className="note">
        Semanas de lunes a sábado desde la fecha del proyecto ({info.date}). Las duraciones salen de las cantidades del modelo con rendimientos
        de una cuadrilla (oficial y ayudante): zapatas 5 m/día, muros 12 m²/día, losas 15 m²/día, aplanados 20 m²/día, pisos 12 m²/día. El importe
        semanal está en miles de {s.currency} e incluye indirectos; el acumulado, en porcentaje. Ajusta el programa a las cuadrillas reales de la obra.
      </p>
    </article>
  );
}
