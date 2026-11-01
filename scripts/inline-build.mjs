import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const indexPath = path.join(dist, "index.html");
let html = fs.readFileSync(indexPath, "utf8");

const assetPath = (url) => {
  const clean = url.replace(/^\.?\//, "").replace(/^assets\//, "");
  return path.join(dist, "assets", clean);
};

html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (match, href) => {
    const cssPath = assetPath(href);
    let css = fs.readFileSync(cssPath, "utf8");
    css = css.replace(/url\(([^)]+?\.woff2)\)/g, (fontMatch, fontUrl) => {
      const cleanFont = fontUrl.replace(/^["']|["']$/g, "");
      const fontPath = path.isAbsolute(cleanFont)
        ? path.join(dist, cleanFont.replace(/^\//, ""))
        : path.join(path.dirname(cssPath), cleanFont);
      const data = fs.readFileSync(fontPath).toString("base64");
      return `url(data:font/woff2;base64,${data})`;
    });
    return `<style>${css}</style>`;
  },
);

html = html.replace(
  /<script[^>]+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (match, src) => {
    const scriptPath = assetPath(src);
    const js = fs.readFileSync(scriptPath, "utf8");
    return `<script type="module">${js}</script>`;
  },
);

html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, "");

// Inline binary assets referenced from the bundled JavaScript (the skull GLB).
const binaryDir = path.join(dist, "assets");
const mimeTypes = {
  ".glb": "model/gltf-binary",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
for (const file of fs.readdirSync(binaryDir)) {
  const ext = path.extname(file).toLowerCase();
  const mime = mimeTypes[ext];
  if (!mime) continue;
  const data = fs.readFileSync(path.join(binaryDir, file)).toString("base64");
  const dataUri = `data:${mime};base64,${data}`;
  for (const token of [file, `./assets/${file}`, `assets/${file}`, `/assets/${file}`]) {
    html = html.split(token).join(dataUri);
  }
}

fs.writeFileSync(indexPath, html);
const size = fs.statSync(indexPath).size;
console.log(`Inlined assets into dist/index.html (${(size / 1024 / 1024).toFixed(2)} MB)`);
