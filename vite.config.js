import { defineConfig } from "vite";

export default defineConfig({
  base: "/agc/",
  server: { host: "0.0.0.0", strictPort: true },
  preview: { host: "0.0.0.0", strictPort: true },
});
