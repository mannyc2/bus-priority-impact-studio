import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/d1/schema.ts",
  out: "./migrations-drizzle/d1",
  dialect: "sqlite",
});
