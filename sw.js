// Generado al compilar. Versión: assets/index-DeGBAMZK.js|assets/index-jOB-aT1c.css
const CACHE = "smartarchitect-14mlsg7";
const BASE = "/trazo-bim/";
const PRECACHE = ["","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","assets/index-jOB-aT1c.css","assets/index-DeGBAMZK.js","assets/libredwg-web-CjVcKDS4.js","assets/libredwg-web-W9V4F3lI.js","assets/pdf-DePZ4HI-.js","assets/__vite-browser-external-BIHI7g3E.js"].map((f) => BASE + f);

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
  const same = url.origin === location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!same && !fonts) return;
  // archivos con huella y fuentes: lo guardado primero; lo que falte se guarda al pedirlo
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(same ? CACHE : "smartarchitect-runtime").then((c) => c.put(r, copy)); }
    return res;
  })));
});
