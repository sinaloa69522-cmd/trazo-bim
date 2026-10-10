// App instalable: registro del service worker, botón «Instalar app» y archivos abiertos desde el sistema.
import { useEffect, useState } from "react";

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: InstallPrompt | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

/** Solo en la versión publicada como app (no en desarrollo ni dentro de claude.ai). */
const isApp = () => import.meta.env.PROD && import.meta.env.BASE_URL !== "./" && "serviceWorker" in navigator;

export function setupPwa() {
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPrompt; notify(); });
  addEventListener("appinstalled", () => { deferred = null; notify(); });
  if (isApp()) addEventListener("load", () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* sin service worker */ }); });
}

export const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Estado del botón de instalar: el aviso del navegador, o las instrucciones en iPhone y iPad. */
export function useInstall(): { show: boolean; install: () => Promise<string | null> } {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const show = !standalone() && (deferred !== null || (isApp() && ios()));
  const install = async () => {
    if (deferred) {
      const d = deferred; deferred = null; notify();
      await d.prompt();
      const r = await d.userChoice;
      return r.outcome === "accepted" ? "Smartarchitect se instaló. Ábrelo desde el escritorio o el menú de aplicaciones." : null;
    }
    return "Para instalar en iPhone o iPad: toca Compartir en Safari y luego «Agregar a pantalla de inicio».";
  };
  return { show, install };
}

interface LaunchParams { files: { getFile(): Promise<File> }[] }

/** Archivos .trazo, DXF o DWG abiertos con doble clic cuando la app está instalada. */
export function useLaunchFiles(open: (f: File) => void) {
  useEffect(() => {
    const lq = (window as { launchQueue?: { setConsumer(fn: (p: LaunchParams) => void): void } }).launchQueue;
    lq?.setConsumer(async (p) => { for (const h of p.files) open(await h.getFile()); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
