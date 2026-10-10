import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Editor } from "../editor/Editor";
import { Viewer3D } from "../editor/Viewer3D";

export interface View3DHandle { fit(): void }

export const View3D = forwardRef<View3DHandle, { ed: Editor; realistic: boolean }>(function View3D({ ed, realistic }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer3D | null>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({ fit: () => viewer.current?.fit() }), []);

  useEffect(() => {
    try {
      const bg = () => getComputedStyle(document.documentElement).getPropertyValue("--view-bg").trim();
      viewer.current = new Viewer3D(host.current!, ed, bg);
      viewer.current.setRealistic(realistic);
    } catch {
      setFailed(true);
    }
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, [ed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => viewer.current?.setRealistic(realistic), [realistic]);

  return (
    <div id="view3d" ref={host}>
      {failed && <div className="msg3d">Este navegador no pudo iniciar WebGL. La planta sigue funcionando.</div>}
    </div>
  );
});
