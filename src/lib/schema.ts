import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  sessionVersion: integer("session_version").notNull(),
  active: boolean("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  company: text("company").notNull(),
  slaMinutes: integer("sla_minutes").notNull(),
});
