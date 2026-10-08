import { useEffect, useRef, type MutableRefObject } from "react";
import type { Editor, Selection } from "../editor/Editor";
import { drawPlan, type PlanColors } from "../editor/planRenderer";

const COLOR_KEYS: (keyof PlanColors)[] = ["plan-bg", "grid", "grid-major", "wall", "door", "window", "dim", "anno", "accent", "fg", "muted", "danger", "panel"];

function readColors(): PlanColors {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(COLOR_KEYS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()])) as PlanColors;
}

/** Lienzo de la planta: dibuja el editor y le pasa los eventos de puntero. */
export function PlanView({ ed, spaceDown }: { ed: Editor; spaceDown: MutableRefObject<boolean> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!;
    let colors = readColors(), frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const dpr = devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPlan(ctx, ed, colors, cv.width / dpr, cv.height / dpr);
      });
    };
    const resize = () => {
      const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      cv.width = Math.max(1, r.width * dpr);
      cv.height = Math.max(1, r.height * dpr);
      draw();
    };
    const fit = () => { const r = cv.getBoundingClientRect(); ed.fit(r.width, r.height); };
    ed.fitRequest = fit;
    const unsub = ed.subscribe(draw);
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    fit();

    const retheme = () => { colors = readColors(); draw(); };
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.fonts?.ready.then(draw);

    let pan: { x: number; y: number; moved: boolean; pick?: Selection | null } | null = null;
    const local = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onMove = (e: PointerEvent) => {
      if (pan) {
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
        pan.x = e.clientX; pan.y = e.clientY;
        ed.pan(dx, dy);
        return;
      }
      const p = local(e);
      ed.pointerMove(p.x, p.y);
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      if (e.button === 1 || (e.button === 0 && spaceDown.current)) { pan = { x: e.clientX, y: e.clientY, moved: true }; return; }
      if (e.button === 2) { ed.escape(); return; }
      const p = local(e), r = ed.pointerDown(p.x, p.y);
      if (r.pan) pan = { x: e.clientX, y: e.clientY, moved: false, pick: r.pick };
    };
    const onUp = () => {
      if (pan && !pan.moved && ed.tool === "select") ed.select(pan.pick ?? null);
      pan = null;
      ed.pointerUp();
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const p = local(e); ed.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); };
    const noMenu = (e: Event) => e.preventDefault();
    const onLeave = () => ed.pointerLeave();
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("contextmenu", noMenu);
    return () => {
      unsub(); ro.disconnect(); mo.disconnect(); mq.removeEventListener("change", retheme);
      cancelAnimationFrame(frame); ed.fitRequest = null;
      cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointerup", onUp); cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("wheel", onWheel); cv.removeEventListener("contextmenu", noMenu);
    };
  }, [ed, spaceDown]);

  return (
    <>
      <canvas id="plan" ref={ref} className={ed.tool === "select" ? "sel" : ""} aria-label="Planta 2D" />
      <div className="paneover"><button className="btn" onClick={() => ed.fitRequest?.()}>Encuadrar</button></div>
    </>
  );
}
