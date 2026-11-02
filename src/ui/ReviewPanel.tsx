import { useEffect, useState } from "react";
import { checkProject, LIMITS, RULES } from "../core/codeCheck";
import type { Editor } from "../editor/Editor";

/**
 * Revisión de reglamento: lista de lo que no cumple, con un globo numerado en la planta.
 * Al pulsar una observación se activa su nivel y la planta se centra en ella.
 */
export function ReviewPanel({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  // se recalcula solo cuando cambia el modelo (no con cada movimiento del ratón) y marca los globos en la planta
  const [res, setRes] = useState(() => checkProject(ed.project));
  useEffect(() => {
    const run = () => { const r = checkProject(ed.project); setRes(r); ed.setReview(r.findings); };
    run();
    let t = 0;
    const off = ed.onModel(() => { clearTimeout(t); t = window.setTimeout(run, 150); });
    return () => { off(); clearTimeout(t); ed.setReview(null); };
  }, [ed]);
  const errors = res.findings.filter((f) => f.sev === "error").length, warns = res.findings.length - errors;
  const multi = ed.project.levels.length > 1;
  return (
    <div className="reviewpanel" role="dialog" aria-label="Revisión de reglamento">
      <div className="rvhead">
        <b>Revisión de reglamento</b>
        <button className="btn" onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      {!res.rooms.length && !res.findings.length
        ? <p className="rvnone">Dibuja muros y nombra los espacios (Recámara, Baño, Cocina…) para revisarlos.</p>
        : <p className={`rvsum ${errors ? "bad" : warns ? "warn" : "good"}`}>
            {errors ? `${errors} no cumple${errors > 1 ? "n" : ""}` : "Todo cumple"}{warns ? ` · ${warns} aviso${warns > 1 ? "s" : ""}` : ""} · {res.checks} revisiones en {res.rooms.length} espacios
          </p>}
      {res.findings.length > 0 && <ol className="rvlist">
        {res.findings.map((f, i) => (
          <li key={i}>
            <button className={f.sev} onClick={() => ed.focusAt(f.level, f.at)} title="Ver en la planta">
              <span className="rvn">{i + 1}</span>
              <span><b>{f.where}{multi ? ` · ${ed.project.levels[f.level].name}` : ""}</b> — {f.topic}: {f.msg}</span>
            </button>
          </li>
        ))}
      </ol>}
      {res.rooms.length > 0 && <details className="rvrooms">
        <summary>Espacios revisados</summary>
        <table>
          <thead><tr><th>Espacio</th><th>Uso</th><th className="r">Área</th><th className="r">Lado</th><th className="r">Vidrio</th><th /></tr></thead>
          <tbody>{res.rooms.map((r, i) => <tr key={i}><td>{r.name}</td><td>{RULES[r.use].label}</td><td className="r">{r.area.toFixed(2)}</td><td className="r">{r.side.toFixed(2)}</td><td className="r">{r.area ? `${Math.round((r.glass / r.area) * 100)} %` : ""}</td><td>{r.ok ? "✓" : "✗"}</td></tr>)}</tbody>
        </table>
      </details>}
      <p className="rvnote">Criterios de las Normas Técnicas Complementarias para el Proyecto Arquitectónico (CDMX): áreas y lados mínimos por espacio, ventanas de {LIMITS.light * 100} % del piso para iluminar y {LIMITS.vent * 100} % para ventilar (se supone que abre la mitad de cada ventana), altura libre de {LIMITS.height.toFixed(2)} m, puertas de {LIMITS.entry.toFixed(2)} m al acceso, 0.75 m a recámaras y 0.60 m a baños y cocinas, escaleras de huella ≥ {LIMITS.tread * 100} cm y peralte ≤ {LIMITS.riser * 100} cm. El uso se toma del nombre del espacio. Confirma con el reglamento de tu municipio.</p>
    </div>
  );
}
