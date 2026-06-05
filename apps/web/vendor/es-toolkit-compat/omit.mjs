// Dev shim: recharts default-imports the CJS-only es-toolkit/compat/omit stub,
// which Vite's dep optimizer mis-wraps. Re-export the named function from the
// clean ESM barrel as default. Aliased in vite.config.ts. Tree-shaken in prod.
export { omit as default } from "es-toolkit/compat";
