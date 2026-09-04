import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const bundles = [
  // Content script: classic IIFE - MV3 content scripts cannot be ES modules.
  { entry: "src/content/index.js", out: `${outdir}/content.js`, format: "iife" },
  // Service worker: declared as "type": "module" in the manifest.
  { entry: "src/background/index.js", out: `${outdir}/background.js`, format: "esm" },
  { entry: "src/options/options.js", out: `${outdir}/options.js`, format: "iife" },
];

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp("src/manifest.json", `${outdir}/manifest.json`);
await cp("src/options/options.html", `${outdir}/options.html`);

const optionsFor = ({ entry, out, format }) => ({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format,
  target: "chrome120",
  platform: "browser",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});

if (watch) {
  const ctxs = await Promise.all(bundles.map((b) => context(optionsFor(b))));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(bundles.map((b) => build(optionsFor(b))));
}
