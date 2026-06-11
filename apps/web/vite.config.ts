import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
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

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      quoteStyle: "double",
    }),
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
