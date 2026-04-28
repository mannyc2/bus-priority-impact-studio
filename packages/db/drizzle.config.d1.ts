import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/d1/index.ts",
  out: "./migrations/d1",
  dialect: "sqlite",
});
