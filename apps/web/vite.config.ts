import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const env = process.env as NodeJS.ProcessEnv & {
  CLOUDFLARE_REMOTE_BINDINGS?: string;
};

// Recharts v3 default-imports CJS-only `es-toolkit/compat/*` subpath stubs,
// which Vite's dep optimizer mis-wraps ("require_isUnsafeProperty is not a
// function"). The `es-toolkit/compat` barrel is clean ESM, so we alias each
// subpath recharts uses to a one-line shim that re-exports the named function
// from the barrel as default. Tree-shaken in production builds.
const esToolkitCompatShims = Object.fromEntries(
  [
    "get",
    "isPlainObject",
    "last",
    "maxBy",
    "minBy",
    "omit",
    "range",
    "sortBy",
    "sumBy",
    "throttle",
    "uniqBy",
  ].map((name) => [
    `es-toolkit/compat/${name}`,
    fileURLToPath(new URL(`./vendor/es-toolkit-compat/${name}.mjs`, import.meta.url)),
  ]),
);

function copyMapLibreVendor() {
  return {
    name: "bp-copy-maplibre-vendor",
    apply: "build" as const,
    closeBundle() {
      const source = fileURLToPath(
        new URL("./node_modules/maplibre-gl/dist/maplibre-gl.js", import.meta.url),
      );
      const destination = fileURLToPath(
        new URL("./dist/client/vendor/maplibre-gl.js", import.meta.url),
      );
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    },
  };
}

export default defineConfig({
  plugins: [
    copyMapLibreVendor(),
    react(),
    tailwindcss(),
    cloudflare({
      remoteBindings: env.CLOUDFLARE_REMOTE_BINDINGS === "1",
    }),
  ],
  resolve: {
    alias: {
      ...esToolkitCompatShims,
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  // The shims above re-export from the `es-toolkit/compat` barrel, so the
  // optimized recharts bundle imports it — pre-bundle it too or that import
  // 404s at runtime.
  optimizeDeps: {
    include: ["es-toolkit/compat"],
  },
});
