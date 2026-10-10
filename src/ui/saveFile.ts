// Guardar un archivo generado en el navegador. Dentro del visor de Claude las descargas directas
// están bloqueadas: allí se ofrece el archivo con la capacidad «downloads» (el usuario confirma).
// Fuera de Claude (GitHub Pages, app instalada) se usa el enlace de descarga de siempre.

/** Extensiones que admite la capacidad de descargas del visor. */
const CAP_EXT = new Set(["gif", "png", "jpg", "jpeg", "webp", "mp4", "webm", "txt", "json", "md", "docx", "pptx", "epub", "csv", "ttf", "html", "svg", "pdf", "xlsx", "zip"]);

type Downloads = { save(r: { filename: string; data: Blob | string }): Promise<{ status: string }> };
let cap: Promise<Downloads | null> | null = null;

function downloads(): Promise<Downloads | null> {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return Promise.resolve(null);
  cap ??= Promise.race([
    c.use("downloads").then((d) => (d as Downloads | null) ?? null, () => null),
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]);
  return cap;
}

export type SaveOutcome = "saved" | "declined" | "failed";

/** Guarda name con data. Devuelve "declined" si el usuario lo rechazó en el aviso del visor. */
export async function saveFile(name: string, data: Blob | string, type = "application/octet-stream"): Promise<SaveOutcome> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (CAP_EXT.has(ext)) {
    const d = await downloads();
    if (d) {
      try { await d.save({ filename: name, data }); return "saved"; } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "declined") return "declined";
        // otros errores: se prueba el enlace de descarga
      }
    }
  }
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(typeof data === "string" ? new Blob([data], { type }) : data);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "saved";
  } catch { return "failed"; }
}
