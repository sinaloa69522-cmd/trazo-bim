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

    // pan: rueda pulsada, espacio + arrastre, botón derecho o arrastrar con el dedo.
    // Con el ratón, arrastrar sobre el vacío dibuja una ventana de selección.
    // Con dos dedos se acerca y se desplaza; con una herramienta de dibujo el dedo coloca el punto al soltar,
    // así arrastrar o pellizcar no deja puntos sueltos.
    let pan: { x: number; y: number; moved: boolean; right: boolean; pick?: Selection | null; tap?: boolean } | null = null;
    let box: { sx: number; sy: number; moved: boolean; additive: boolean; pick?: Selection | null } | null = null;
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; cx: number; cy: number } | null = null, pinched = false;
    const local = (e: { clientX: number; clientY: number }) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pinchState = () => {
      const [a, b] = [...touches.values()], c = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: c.x, cy: c.y };
    };
    const onMove = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && touches.size >= 2) {
          const n = pinchState();
          ed.pan(n.cx - pinch.cx, n.cy - pinch.cy);
          ed.zoomAt(n.cx, n.cy, n.d / pinch.d);
          pinch = n;
          return;
        }
        if (pinched) return;
      }
      if (pan) {
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (Math.abs(dx) + Math.abs(dy) > (pan.tap ? 8 : 3)) pan.moved = true;
        pan.x = e.clientX; pan.y = e.clientY;
        if (pan.moved) ed.pan(dx, dy);
        return;
      }
      const p = local(e);
      if (box) {
        if (Math.hypot(p.x - box.sx, p.y - box.sy) > 4) box.moved = true;
        if (box.moved) { ed.box = { a: ed.toW(box.sx, box.sy), b: ed.toW(p.x, p.y) }; ed.emit(); return; }
      }
      ed.pointerMove(p.x, p.y);
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          // el segundo dedo convierte el gesto en zoom: se olvida lo que empezó el primero
          pan = null; box = null; ed.box = null; ed.pointerUp();
          pinch = pinchState(); pinched = true;
          return;
        }
        if (touches.size > 2) return;
        if (ed.tool !== "select") {
          const p = local(e);
          ed.pointerMove(p.x, p.y);
          pan = { x: e.clientX, y: e.clientY, moved: false, right: false, tap: true };
          return;
        }
      }
      if (e.button === 1 || (e.button === 0 && spaceDown.current)) { pan = { x: e.clientX, y: e.clientY, moved: true, right: false }; return; }
      if (e.button === 2) { pan = { x: e.clientX, y: e.clientY, moved: false, right: true }; return; }
      const p = local(e), additive = e.shiftKey || e.ctrlKey || e.metaKey, r = ed.pointerDown(p.x, p.y, additive);
      if (!r.box) return;
      if (e.pointerType === "touch") pan = { x: e.clientX, y: e.clientY, moved: false, right: false, pick: r.pick };
      else box = { sx: p.x, sy: p.y, moved: false, additive, pick: r.pick };
    };
    const onUp = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) {
        touches.delete(e.pointerId);
        if (touches.size < 2) pinch = null;
        if (pinched) { if (!touches.size) { pinched = false; ed.pointerUp(); } return; }
      }
      if (pan && !pan.moved) {
        if (pan.right) ed.escape();
        else if (pan.tap) { const p = local(e); ed.pointerMove(p.x, p.y); ed.pointerDown(p.x, p.y); }
        else if (ed.tool === "select") ed.select(pan.pick ?? null);
      }
      if (box) {
        const p = local(e);
        if (box.moved) ed.selectBox(ed.toW(box.sx, box.sy), ed.toW(p.x, p.y), box.additive);
        else if (box.pick && box.additive) ed.toggleSelect(box.pick);
        else if (!box.additive) ed.select(box.pick ?? null);
      }
      pan = null; box = null;
      ed.pointerUp();
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const p = local(e); ed.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); };
    const noMenu = (e: Event) => e.preventDefault();
    const onLeave = () => ed.pointerLeave();
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("contextmenu", noMenu);
    return () => {
      unsub(); ro.disconnect(); mo.disconnect(); mq.removeEventListener("change", retheme);
      cancelAnimationFrame(frame); ed.fitRequest = null;
      cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointerup", onUp); cv.removeEventListener("pointercancel", onUp); cv.removeEventListener("pointerleave", onLeave);
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
