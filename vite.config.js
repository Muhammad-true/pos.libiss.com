import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "create-store": resolve(__dirname, "create-store.html"),
        login: resolve(__dirname, "login.html"),
        office: resolve(__dirname, "office.html"),
        gallery: resolve(__dirname, "gallery.html"),
        docs: resolve(__dirname, "docs.html")
      }
    }
  },
  publicDir: "public"
});

