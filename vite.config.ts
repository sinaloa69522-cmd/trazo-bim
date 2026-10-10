import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { noEvalEmbind } from "./build/noEvalEmbind";
import { pwa } from "./build/pwa";

export default defineConfig({
  plugins: [react(), noEvalEmbind(), pwa()],
  test: { globals: true, environment: "node", server: { deps: { inline: ["@mlightcad/libredwg-web"] } } },
});
