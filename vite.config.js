import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
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
        "add-store": resolve(__dirname, "add-store.html"),
        login: resolve(__dirname, "login.html"),
        "legal-view": resolve(__dirname, "legal-view.html"),
        office: resolve(__dirname, "office.html"),
        gallery: resolve(__dirname, "gallery.html"),
        docs: resolve(__dirname, "docs.html"),
        documentation: resolve(__dirname, "documentation.html"),
        orders: resolve(__dirname, "orders.html"),
        "add-product": resolve(__dirname, "add-product.html")
      }
    }
  },
  publicDir: "public"
});

