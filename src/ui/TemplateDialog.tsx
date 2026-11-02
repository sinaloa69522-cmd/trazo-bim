import { useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATES } from "../core/templates";
import type { Level } from "../core/model";
import type { Editor } from "../editor/Editor";

/** Croquis de la planta: muros y nombres de los espacios. */
function Thumb({ lv }: { lv: Level }) {
  const xs = lv.walls.flatMap((w) => [w.x1, w.x2]), ys = lv.walls.flatMap((w) => [w.y1, w.y2]);
  const x0 = Math.min(...xs) - 0.5, y0 = Math.min(...ys) - 0.5, w = Math.max(...xs) - x0 + 0.5, h = Math.max(...ys) - y0 + 0.5;
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} width={130} height={130} aria-hidden="true">
      {lv.walls.map((q) => <line key={q.id} x1={q.x1} y1={q.y1} x2={q.x2} y2={q.y2} stroke="currentColor" strokeWidth={q.thick} strokeLinecap="square" />)}
      {lv.rooms.map((r) => <text key={r.id} x={r.x} y={r.y} fontSize={0.55} textAnchor="middle" fill="currentColor" opacity={0.7}>{r.name.split(",")[0].replace("Recámara", "Rec.").replace("principal", "ppal.")}</text>)}
    </svg>
  );
}

/** Elegir una plantilla de casa para empezar; reemplaza el proyecto (se puede deshacer). */
export function TemplateDialog({ ed, onClose, onLoaded }: { ed: Editor; onClose: () => void; onLoaded: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const built = useMemo(() => TEMPLATES.map((t) => ({ t, lv: t.build().levels[0] })), []);
  const [us, setUs] = useState(ed.project.units === "imperial");
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} className="tpldlg">
      <h3>Plantillas de casa</h3>
      <p className="hint">Empieza con una casa ya dibujada: muros, puertas, ventanas, espacios, muebles, losa, techo, cotas e instalaciones básicas. Reemplaza el dibujo actual; Deshacer lo recupera.</p>
      <div className="group" role="tablist" aria-label="País">
        <button className="tb" role="tab" aria-pressed={!us} onClick={() => setUs(false)}>México (metros)</button>
        <button className="tb" role="tab" aria-pressed={us} onClick={() => setUs(true)}>Estados Unidos (pies)</button>
      </div>
      <div className="tpls">
        {built.filter(({ t }) => !!t.us === us).map(({ t, lv }) => (
          <button key={t.id} className="tpl" onClick={() => { ed.loadTemplate(t.id); onLoaded(); ref.current?.close(); }}>
            <Thumb lv={lv} />
            <b>{t.name}</b>
            <small>{t.desc}</small>
          </button>
        ))}
      </div>
      <div className="acts"><span /><button className="btn" onClick={() => ref.current?.close()}>Cancelar</button></div>
    </dialog>
  );
}
