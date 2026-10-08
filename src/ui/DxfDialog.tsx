import { useEffect, useMemo, useRef, useState } from "react";
import { toDxf } from "../core/dxf";
import type { Editor } from "../editor/Editor";

export function DxfDialog({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const text = useMemo(() => toDxf(ed.model, ed.rooms), [ed]);
  const count = (text.match(/\n0\n(LINE|ARC|TEXT)/g) ?? []).length;
  const [info, setInfo] = useState(`${count} entidades · unidades: metros`);

  useEffect(() => { ref.current?.showModal(); }, []);

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/dxf" }));
    const a = document.createElement("a");
    a.href = url; a.download = "planta.dxf"; a.click();
    URL.revokeObjectURL(url);
    setInfo("Descargado como planta.dxf.");
  };

  return (
    <dialog ref={ref} onClose={onClose}>
      <h3>Exportar a DXF</h3>
      <p className="hint">Se abre en AutoCAD, BricsCAD o LibreCAD, y puede vincularse en Revit. Cada categoría va en su propia capa.</p>
      <textarea readOnly value={text} />
      <div className="acts">
        <span>{info}</span>
        <button className="btn" onClick={() => ref.current?.close()}>Cerrar</button>
        <button className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => setInfo("Copiado al portapapeles."), () => setInfo("No se pudo copiar."))}>Copiar</button>
        <button className="btn primary" onClick={download}>Descargar</button>
      </div>
    </dialog>
  );
}
