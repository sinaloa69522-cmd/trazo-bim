import { Fragment, useMemo } from "react";
import { insumoGroups, insumos, type Insumo } from "../core/insumos";
import { xlsx, type Cell } from "../core/xlsx";
import type { Editor } from "../editor/Editor";

const qty = (v: number, us = false) => v.toLocaleString(us ? "en-US" : "es-MX", { maximumFractionDigits: 2 });

/** Explosión de insumos en Excel: material, unidad, cantidad y de dónde sale, por grupo. */
export function insumosXlsx(list: Insumo[], title: string, groups: string[], us = false): Uint8Array {
  const rows: Cell[][] = [[{ v: title, s: 7 }], [us ? "Quantities include waste; pieces, bags and pails rounded up." : "Cantidades con desperdicio; piezas, bultos y cubetas redondeados hacia arriba."], [],
    (us ? ["Group", "Material", "Unit", "Qty", "Notes"] : ["Grupo", "Material", "Unidad", "Cantidad", "Para"]).map((v) => ({ v, s: 2 as const }))];
  for (const g of groups) {
    const its = list.filter((x) => x.group === g);
    if (!its.length) continue;
    rows.push([{ v: g, s: 1 }]);
    for (const x of its) rows.push(["", x.name, x.unit, x.qty, x.note]);
  }
  return xlsx([{ name: us ? "Takeoff" : "Insumos", rows, widths: [22, 52, 9, 12, 70], freeze: 4 }]);
}

export function InsumosDoc({ ed }: { ed: Editor }) {
  const list = useMemo(() => insumos(ed.project), [ed.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = ed.project.info, us = ed.project.units === "imperial", L = (es: string, en: string) => (us ? en : es);
  return (
    <article className="budgetdoc">
      <header>
        <div>
          <small>{L("Explosión de insumos", "Material takeoff")}</small>
          <h1>{info.name || "Proyecto"}</h1>
          <p>{[info.client && `${L("Cliente", "Owner")}: ${info.client}`, info.date].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="tot-head"><small>{L("Materiales", "Materials")}</small><b>{list.length}</b></div>
      </header>
      {list.length ? <table>
        <thead><tr><th>Material</th><th>{L("Ud.", "Unit")}</th><th className="r">{L("Cantidad", "Qty")}</th><th>{L("Para", "Notes")}</th></tr></thead>
        <tbody>
          {insumoGroups(ed.project).map((g) => {
            const its = list.filter((x) => x.group === g);
            return its.length ? <Fragment key={g}>
              <tr className="chap"><td colSpan={4}>{g}</td></tr>
              {its.map((x) => <tr key={x.name + x.unit}><td>{x.name}</td><td>{x.unit}</td><td className="r">{qty(x.qty, us)}</td><td className="ins-note">{x.note}</td></tr>)}
            </Fragment> : null;
          })}
        </tbody>
      </table> : <p className="empty">{L("Dibuja muros, losas y cubiertas para calcular los materiales.", "Draw walls, slabs and roofs to take off the materials.")}</p>}
      {us ? <p className="note">
        Typical contractor allowances with waste: ready-mix concrete with 5 % waste, studs counted from the framing model plus 10 %, other lumber
        in 16' pieces, OSB and drywall by sheet, 3 bundles of shingles per square, 8¼" lap siding at 7" exposure, paint at 350 sq ft per gallon
        per coat. Use it to order and to check bids; confirm with your builder and lumber yard.
      </p> : <p className="note">
        Consumos habituales en México por unidad de obra, con desperdicio: concreto hecho en obra f'c 200 (7 bultos de cemento, 0.5 m³ de arena
        y 0.66 m³ de grava por m³) y f'c 250 (8.2 bultos), mortero 1:4, block 12.5 piezas/m², tabique 55 piezas/m² en muros de 14 cm, losa con 7.5 kg/m²
        de varilla, teja 18 piezas/m², pintura 10 m²/l por mano. Es una estimación para comprar; ajústala con el constructor.
      </p>}
    </article>
  );
}
