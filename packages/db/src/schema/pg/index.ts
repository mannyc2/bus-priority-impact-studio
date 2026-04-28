import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const source = pgTable("source", {
  sourceId: text("source_id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  sourceKind: text("source_kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const route = pgTable("route", {
  routeId: text("route_id").primaryKey(),
  routeShortName: text("route_short_name").notNull(),
  routeLongName: text("route_long_name"),
});

export const artifact = pgTable("artifact", {
  artifactId: text("artifact_id").primaryKey(),
  artifactKey: text("artifact_key").notNull(),
  artifactKind: text("artifact_kind").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
