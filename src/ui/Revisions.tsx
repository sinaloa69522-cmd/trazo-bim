// Tabla de revisiones del juego de planos: se edita aquí y sale en el cajetín de todas las láminas.
import type { Editor } from "../editor/Editor";
import { nextRevNo } from "../core/marks";
import type { Revision } from "../core/model";

/** Cuántas revisiones caben en el cajetín; las más viejas quedan fuera de la lámina pero no se borran. */
export const REV_ROWS = 4;

export function RevisionsEditor({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  const revs = ed.project.info.revisions ?? [];
  const set = (next: Revision[]) => ed.setInfo({ revisions: next });
  const patch = (i: number, k: keyof Revision, v: string) => { if (revs[i][k] !== v) set(revs.map((r, j) => (j === i ? { ...r, [k]: v } : r))); };
  const add = () => {
    const no = nextRevNo(ed.project);
    set([...revs, { no, date: new Date().toISOString().slice(0, 10), desc: "" }]);
    ed.log(`Revisión ${no} agregada. Las nubes que dibujes desde ahora llevan este número.`);
  };
  const clouds = (no: string) => ed.project.levels.reduce((s, l) => s + (l.marks ?? []).filter((m) => m.kind === "nube" && m.label === no).length, 0);
  const cell = (i: number, k: keyof Revision, ph: string, type = "text") => (
    <input key={`${i}-${k}-${revs[i][k]}`} type={type} defaultValue={revs[i][k]} placeholder={ph} aria-label={ph}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={(e) => patch(i, k, e.target.value.trim())} />
  );
  return (
    <div className="siteed reved" role="dialog" aria-label="Revisiones">
      <div className="se-row"><strong>Revisiones del juego</strong><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cerrar</button></div>
      {revs.length ? <table>
        <thead><tr><th>Rev.</th><th>Fecha</th><th>Descripción del cambio</th><th className="r">Nubes</th><th /></tr></thead>
        <tbody>{revs.map((r, i) => <tr key={i}>
          <td className="rv-no">{cell(i, "no", "Rev.")}</td>
          <td className="rv-date">{cell(i, "date", "Fecha", "date")}</td>
          <td>{cell(i, "desc", "Qué cambió")}</td>
          <td className="r">{clouds(r.no)}</td>
          <td><button className="btn" title="Quitar la revisión" aria-label={`Quitar la revisión ${r.no}`} onClick={() => set(revs.filter((_, j) => j !== i))}>×</button></td>
        </tr>)}</tbody>
      </table> : <p className="se-msg">Aún no hay revisiones. La primera emisión es la revisión 0 o 1, según acostumbres.</p>}
      <div className="se-row">
        <button className="btn primary" onClick={add}>Agregar revisión {nextRevNo(ed.project)}</button>
      </div>
      <p className="se-msg">Cada revisión sale en el cajetín de todas las láminas ({revs.length > REV_ROWS ? `las ${REV_ROWS} más recientes` : "fecha y descripción"}). Marca lo que cambió con Símbolos › Nube de revisión (comando NB): la nube toma el número de la última revisión.</p>
    </div>
  );
}

/** Bloque del cajetín con las últimas revisiones, la más reciente abajo. */
export function RevisionBlock({ revs, en }: { revs: Revision[]; en: boolean }) {
  if (!revs.length) return null;
  const rows = revs.slice(-REV_ROWS);
  return (
    <div className="c-rev">
      <table>
        <thead><tr><th>{en ? "Rev" : "Rev."}</th><th>{en ? "Date" : "Fecha"}</th><th>{en ? "Description" : "Descripción"}</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td>{r.no}</td><td>{r.date}</td><td>{r.desc || "—"}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
