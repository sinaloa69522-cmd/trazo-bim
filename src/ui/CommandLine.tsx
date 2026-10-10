import { fmtDim, imperial } from "../core/units";
import { useState, type RefObject } from "react";
import type { Editor } from "../editor/Editor";
import { POLAR_INCS, SNAP_MODES } from "../editor/snaps";

export function CommandLine({ ed, inputRef, onExport }: { ed: Editor; inputRef: RefObject<HTMLInputElement>; onExport: (f: "dxf" | "ifc") => void }) {
  const p = ed.snap ?? ed.mouse;
  const [aids, setAids] = useState(false);
  return (
    <footer className="cmd">
      <div className="hist">{ed.message}</div>
      <div className="row">
        <span className="prompt">{ed.prompt()}</span>
        <input ref={inputRef} autoComplete="off" spellCheck={false} aria-label="Línea de comandos"
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key === "Enter" || (e.key === " " && !el.value)) {
              e.preventDefault();
              const v = el.value;
              el.value = "";
              const c = v.trim().toUpperCase();
              if (!ed.textAt && (c === "DXF" || c === "IFC")) onExport(c === "DXF" ? "dxf" : "ifc"); else ed.runCommand(v);
            } else if (e.key === "Escape") { el.value = ""; ed.escape(); }
            else if ((e.key === "Delete" || e.key === "Backspace") && !el.value && ed.sels.length) { e.preventDefault(); ed.deleteSel(); }
          }} />
      </div>
      <div className="status">
        <button className="pill opt" aria-pressed={ed.showGrid} title="Rejilla visible (F7)" onClick={() => ed.toggleGrid()}>REJILLA</button>
        <button className="pill opt" aria-pressed={ed.gridSnap} title="Forzcursor: redondea a la rejilla (F9)" onClick={() => ed.toggleGridSnap()}>FORZC</button>
        <button className="pill" aria-pressed={ed.ortho} title="Ortogonal (F8)" onClick={() => ed.toggleOrtho()}>ORTO</button>
        <button className="pill" aria-pressed={ed.polar} title={`Rastreo polar cada ${ed.polarInc}° (F10)`} onClick={() => ed.togglePolar()}>POLAR</button>
        <button className="pill" aria-pressed={ed.osnap} title="Referencia a objetos (F3)" onClick={() => ed.toggleOsnap()}>REFENT</button>
        <button className="pill" aria-pressed={ed.otrack} title="Rastreo de referencias a objetos (F11)" onClick={() => ed.toggleOtrack()}>RASTREO</button>
        <button className="pill" aria-expanded={aids} title="Ajustes de las ayudas de dibujo" onClick={() => setAids(!aids)}>▾</button>
        {aids && (
          <div className="aids" role="dialog" aria-label="Ayudas de dibujo">
            <div className="aids-h">Referencia a objetos</div>
            {SNAP_MODES.map((m) => (
              <label key={m.id}><input type="checkbox" checked={ed.snapModes.has(m.id)} onChange={(e) => ed.setSnapMode(m.id, e.currentTarget.checked)} /> {m.name} <span className="k">{m.cmd[0]}</span></label>
            ))}
            <div className="aids-h">Ángulo polar</div>
            <select value={ed.polarInc} onChange={(e) => ed.setPolarInc(parseFloat(e.currentTarget.value))}>
              {POLAR_INCS.map((a) => <option key={a} value={a}>Cada {a}°</option>)}
            </select>
            <label><input type="checkbox" checked={ed.showGrid} onChange={() => ed.toggleGrid()} /> Rejilla visible <span className="k">F7</span></label>
            <label><input type="checkbox" checked={ed.gridSnap} onChange={() => ed.toggleGridSnap()} /> Forzcursor a {imperial() ? "1\"" : "10 cm"} <span className="k">F9</span></label>
            <p className="aids-tip">Escribe FIN, MED, INT, CEN, PER o CER para una referencia de un solo uso, y 3&lt;45 o @3&lt;45 para coordenadas polares.</p>
          </div>
        )}
        <span className="coords">X {fmtDim(p.x)}  Y {fmtDim(-p.y)}</span>
      </div>
    </footer>
  );
}
