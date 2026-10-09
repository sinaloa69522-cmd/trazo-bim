import { useEffect, useRef, useState } from "react";
import { metersPerPoint, PDF_SCALES } from "../core/pdfImport";
import type { Editor } from "../editor/Editor";
import { openPdf, pdfImage, pdfLines, type PdfPage } from "../editor/fileImport";

type Mode = "lines" | "underlay";

/** Importar un PDF: elegir página, escala del plano y si se pasa a líneas (PDF de CAD) o se pone de calco (escaneado). */
export function ImportPdfDialog({ ed, file, onClose }: { ed: Editor; file: File; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pdf, setPdf] = useState<Awaited<ReturnType<typeof openPdf>> | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(100);
  const [mode, setMode] = useState<Mode>("lines");
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    let live = true;
    file.arrayBuffer().then(openPdf).then((r) => { if (live) setPdf(r); }, (e: Error) => { if (live) setError(`No se pudo abrir el PDF: ${e.message}`); });
    return () => { live = false; };
  }, [file]);

  const pg: PdfPage | undefined = pdf?.pages.find((p) => p.index === page);
  const size = pg ? `${(pg.w * metersPerPoint(scale)).toFixed(2)} × ${(pg.h * metersPerPoint(scale)).toFixed(2)} m` : "";

  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    try {
      if (mode === "lines") {
        const { result, note } = await pdfLines(pdf.doc, page, scale);
        ed.importSegments(result, `${file.name} (pág. ${page})`, note);
      } else {
        const img = await pdfImage(pdf.doc, page);
        ed.addUnderlay(img.url, `${file.name} · pág. ${page}`, { w: img.w, h: img.h }, img.pageW * metersPerPoint(scale));
      }
      ref.current?.close();
    } catch (e) {
      setError(`No se pudo importar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} onClose={onClose} className="impdlg">
      <h3>Importar PDF</h3>
      <p className="hint">{file.name}{pdf ? ` · ${pdf.doc.numPages} página${pdf.doc.numPages > 1 ? "s" : ""}` : " · abriendo…"}</p>
      {error && <p className="err">{error}</p>}
      {pdf && (
        <>
          <div className="pages" role="listbox" aria-label="Página">
            {pdf.pages.map((p) => (
              <button key={p.index} role="option" aria-selected={p.index === page} className="pg" onClick={() => setPage(p.index)}>
                <img src={p.thumb} alt={`Página ${p.index}`} /><span>{p.index}</span>
              </button>
            ))}
          </div>
          <div className="opts">
            <label>Escala del plano
              <select value={scale} onChange={(e) => setScale(+e.target.value)}>
                {PDF_SCALES.map((n) => <option key={n} value={n}>1:{n}</option>)}
              </select>
            </label>
            <fieldset>
              <label><input type="radio" name="pdfmode" checked={mode === "lines"} onChange={() => setMode("lines")} /> Líneas <small>PDF exportado de AutoCAD, Revit…: se pueden convertir en muros</small></label>
              <label><input type="radio" name="pdfmode" checked={mode === "underlay"} onChange={() => setMode("underlay")} /> Calco <small>Plano escaneado o foto: imagen de fondo para dibujar encima</small></label>
            </fieldset>
          </div>
          <p className="hint">La página mide {size} a esa escala y se coloca con su esquina superior izquierda en el origen. Si la escala no cuadra, corrígela después con Calibrar (CAL) sobre una medida conocida.</p>
        </>
      )}
      <div className="acts">
        <span>{busy ? "Importando…" : ""}</span>
        <button className="btn" onClick={() => ref.current?.close()}>Cancelar</button>
        <button className="btn primary" disabled={!pdf || busy} onClick={run}>Importar</button>
      </div>
    </dialog>
  );
}
