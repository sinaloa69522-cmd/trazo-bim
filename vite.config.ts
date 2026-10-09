import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { noEvalEmbind } from "./build/noEvalEmbind";

export default defineConfig({
  plugins: [react(), noEvalEmbind()],
  test: { globals: true, environment: "node", server: { deps: { inline: ["@mlightcad/libredwg-web"] } } },
});
