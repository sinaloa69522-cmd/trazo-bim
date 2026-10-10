import type { Plugin } from "vite";

/**
 * App instalable: escribe el service worker con la lista de archivos de esta compilación para que
 * Smartarchitect abra sin internet. Los lectores grandes (DWG y PDF) se guardan la primera vez que se usan.
 * En la compilación para claude.ai (base "./") no hay service worker.
 */
export function pwa(): Plugin {
  let base = "/";
  return {
    name: "smartarchitect-pwa",
    apply: "build",
    configResolved(c) { base = c.base; },
    generateBundle(_, bundle) {
      if (base === "./") return;
      const big = /\.wasm$|pdf\.worker/;
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map") && !big.test(f));
      const precache = ["", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", ...files];
      const version = files.filter((f) => f.startsWith("assets/index-")).sort().join("|");
      this.emitFile({ type: "asset", fileName: "sw.js", source: sw(base, precache, version) });
    },
  };
}

const sw = (base: string, precache: string[], version: string) => `// Generado al compilar. Versión: ${version}
const CACHE = "smartarchitect-${hash(version)}";
const BASE = ${JSON.stringify(base)};
const PRECACHE = ${JSON.stringify(precache)}.map((f) => BASE + f);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("smartarchitect-") && k !== CACHE && k !== "smartarchitect-runtime").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  // la página: primero la red (para tener siempre la última versión) y sin internet la guardada
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(BASE, copy)); return res; })
      .catch(() => caches.match(BASE)));
    return;
  }
  const same = url.origin === location.origin, fonts = /fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname);
  if (!same && !fonts) return;
  // archivos con huella y fuentes: lo guardado primero; lo que falte se guarda al pedirlo
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(same ? CACHE : "smartarchitect-runtime").then((c) => c.put(r, copy)); }
    return res;
  })));
});
`;

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
