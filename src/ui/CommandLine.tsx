import type { RefObject } from "react";
import type { Editor } from "../editor/Editor";

export function CommandLine({ ed, inputRef, onExport }: { ed: Editor; inputRef: RefObject<HTMLInputElement>; onExport: () => void }) {
  const p = ed.snap ?? ed.mouse;
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
              if (v.trim().toUpperCase() === "DXF") onExport(); else ed.runCommand(v);
            } else if (e.key === "Escape") { el.value = ""; ed.escape(); }
            else if ((e.key === "Delete" || e.key === "Backspace") && !el.value && ed.sel) { e.preventDefault(); ed.deleteSel(); }
          }} />
      </div>
      <div className="status">
        <button className="pill" aria-pressed={ed.ortho} title="F8" onClick={() => ed.toggleOrtho()}>ORTO</button>
        <button className="pill" aria-pressed={ed.osnap} title="F3" onClick={() => ed.toggleOsnap()}>REFENT</button>
        <span className="coords">X {p.x.toFixed(2)}  Y {(-p.y).toFixed(2)}</span>
      </div>
    </footer>
  );
}
