import path from "node:path"

import { crx } from "@crxjs/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import pkg from "./package.json"
import manifest from "./src/manifest"

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/popup"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
