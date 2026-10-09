// Lo mínimo de "fs" que usan las pruebas (el proyecto no instala los tipos de Node).
declare module "fs" {
  export function readFileSync(path: URL | string): Uint8Array;
}
