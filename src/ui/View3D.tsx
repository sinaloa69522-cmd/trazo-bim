import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent as RMouse, type PointerEvent as RPointer } from "react";
import type { Editor } from "../editor/Editor";
import { Viewer3D } from "../editor/Viewer3D";

export interface View3DHandle { fit(): void; snapshot(width?: number): Blob | null; walk(): void }

export const View3D = forwardRef<View3DHandle, { ed: Editor; realistic: boolean }>(function View3D({ ed, realistic }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer3D | null>(null);
  const [failed, setFailed] = useState(false);
  const [walking, setWalking] = useState(false);

  useImperativeHandle(ref, () => ({ fit: () => viewer.current?.fit(), snapshot: (w?: number) => viewer.current?.snapshot(w) ?? null, walk: () => viewer.current?.startWalk() }), []);

  useEffect(() => {
    try {
      const bg = () => getComputedStyle(document.documentElement).getPropertyValue("--view-bg").trim();
      viewer.current = new Viewer3D(host.current!, ed, bg);
      viewer.current.setRealistic(realistic);
      viewer.current.onWalk = setWalking;
    } catch {
      setFailed(true);
    }
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, [ed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => viewer.current?.setRealistic(realistic), [realistic]);

  return (
    <div id="view3d" ref={host}>
      {walking && <WalkPad v={viewer.current} />}
      {failed && <div className="msg3d">Este navegador no pudo iniciar WebGL. La planta sigue funcionando.</div>}
    </div>
  );
});

/** Ayuda y botones del recorrido: mantener pulsado para caminar o girar (sirve en táctil). */
function WalkPad({ v }: { v: Viewer3D | null }) {
  const hold = (f: number, s: number, t: number) => ({
    onPointerDown: (e: RPointer) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); v?.walkHold(f, s, t); },
    onPointerUp: () => v?.walkHold(0, 0, 0),
    onPointerCancel: () => v?.walkHold(0, 0, 0),
    onContextMenu: (e: RMouse) => e.preventDefault(),
  });
  return (
    <>
      <div className="walkhelp">Recorrido · <b>W A S D</b> o flechas para caminar · arrastra para mirar · <b>Mayús</b> corre · <b>Esc</b> sale</div>
      <div className="walkpad" aria-label="Caminar">
        <button className="btn" title="Girar a la izquierda" {...hold(0, 0, -1)}>⟲</button>
        <button className="btn" title="Avanzar" {...hold(1, 0, 0)}>▲</button>
        <button className="btn" title="Girar a la derecha" {...hold(0, 0, 1)}>⟳</button>
        <button className="btn" title="Paso a la izquierda" {...hold(0, -1, 0)}>◀</button>
        <button className="btn" title="Retroceder" {...hold(-1, 0, 0)}>▼</button>
        <button className="btn" title="Paso a la derecha" {...hold(0, 1, 0)}>▶</button>
      </div>
      <button className="btn walkexit" onClick={() => v?.stopWalk()}>Salir del recorrido</button>
    </>
  );
}
