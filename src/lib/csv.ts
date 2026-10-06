import Papa from "papaparse";
import { z } from "zod";
import { transaction, AppError } from "./db";
import { Actor, ingest, leadSchema } from "./crm";
export const csvSchema = z.object({
  csv: z.string().min(1).max(60000),
  mapping: z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    instagram: z.string().optional(),
    company: z.string().optional(),
    source: z.string().optional(),
    campaign: z.string().optional(),
  }),
});
export async function importCsv(input: unknown, actor: Actor) {
  if (actor.role !== "admin") throw new AppError(403, "Somente administrador");
  const v = csvSchema.parse(input);
  const parsed = Papa.parse<Record<string, string>>(v.csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length)
    throw new AppError(400, "CSV inválido: " + parsed.errors[0].message);
  if (parsed.data.length > 500)
    throw new AppError(400, "Máximo de 500 linhas por importação");
  const rows = parsed.data.map((row, i) => {
    const result = leadSchema.safeParse(
      Object.fromEntries(
        Object.entries(v.mapping).map(([field, column]) => [
          field,
          column ? row[column]?.trim() || undefined : undefined,
        ]),
      ),
    );
    if (!result.success)
      throw new AppError(
        400,
        `Linha ${i + 2}: ${result.error.issues.map((e) => e.message).join("; ")}`,
      );
    return result.data;
  });
  return transaction(async (c) => {
    const result = { created: 0, duplicates: 0 };
    for (const row of rows) {
      const l = await ingest(c, row, actor);
      if (l.duplicate) result.duplicates++;
      else result.created++;
    }
    return result;
  });
}
export function safeCsvCell(value: unknown) {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
