/**
 * Копирует руководства из libiss-platform/docs в public/documentation для Vite.
 * Запуск из каталога pos.libiss.com_site: npm run sync-user-docs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(siteRoot, "..");
const outDir = path.join(siteRoot, "public", "documentation");

const pairs = [
  [path.join(repoRoot, "docs", "LIBISS_POS_INSTALL.md"), path.join(outDir, "install.ru.md")],
  [path.join(repoRoot, "docs", "LIBISS_POS_USAGE.md"), path.join(outDir, "usage.ru.md")],
  [path.join(repoRoot, "docs", "en", "LIBISS_POS_INSTALL.md"), path.join(outDir, "install.en.md")],
  [path.join(repoRoot, "docs", "en", "LIBISS_POS_USAGE.md"), path.join(outDir, "usage.en.md")]
];

fs.mkdirSync(outDir, { recursive: true });
for (const [src, dest] of pairs) {
  if (!fs.existsSync(src)) {
    console.warn("skip missing:", src);
    continue;
  }
  fs.copyFileSync(src, dest);
  console.log("ok", path.relative(siteRoot, dest));
}
