import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { transaction, AppError } from "@/lib/db";
import { audit } from "@/lib/crm";
import { sameOrigin, failure, body } from "@/lib/http";
import { z } from "zod";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(80),
  }),
  z.object({
    action: z.literal("rename"),
    id: z.uuid(),
    name: z.string().trim().min(2).max(80),
  }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
  z.object({
    action: z.literal("reorder"),
    ids: z.array(z.uuid()).min(3).max(50),
  }),
]);
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const actor = await currentActor();
    if (actor.role !== "admin")
      throw new AppError(403, "Somente administrador");
    const v = schema.parse(await body(req));
    await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(904)");
      const stages = (
        await c.query(
          "SELECT * FROM pipeline_stages ORDER BY position FOR UPDATE",
        )
      ).rows;
      if (v.action === "create") {
        if (stages.length >= 50) throw new AppError(400, "Máximo de 50 etapas");
        const s = (
          await c.query(
            "INSERT INTO pipeline_stages(name,position) VALUES($1,$2) RETURNING id",
            [v.name, Math.max(...stages.map((s) => s.position)) + 1],
          )
        ).rows[0];
        await audit(c, actor.id, "pipeline.created", s.id, null, v.name);
      } else if (v.action === "reorder") {
        if (
          v.ids.length !== stages.length ||
          new Set(v.ids).size !== stages.length ||
          v.ids.some((id) => !stages.some((s) => s.id === id))
        )
          throw new AppError(400, "Informe todas as etapas uma vez");
        await c.query("UPDATE pipeline_stages SET position=position+1000");
        for (const [i, id] of v.ids.entries())
          await c.query(
            "UPDATE pipeline_stages SET position=$1,updated_at=now() WHERE id=$2",
            [i, id],
          );
        await audit(
          c,
          actor.id,
          "pipeline.reordered",
          stages[0].id,
          stages.map((s) => s.id),
          v.ids,
        );
      } else {
        const s = stages.find((s) => s.id === v.id);
        if (!s) throw new AppError(404, "Etapa não encontrada");
        if (v.action === "rename") {
          await c.query(
            "UPDATE pipeline_stages SET name=$1,updated_at=now() WHERE id=$2",
            [v.name, v.id],
          );
          await audit(c, actor.id, "pipeline.renamed", s.id, s.name, v.name);
        } else {
          if (
            s.kind !== "open" ||
            stages.filter((s) => s.kind === "open").length <= 1
          )
            throw new AppError(
              400,
              "Mantenha ao menos uma etapa aberta e as etapas de ganho/perda",
            );
          if (
            (
              await c.query(
                "SELECT 1 FROM leads WHERE stage_id=$1 UNION ALL SELECT 1 FROM lead_stage_history WHERE stage_id=$1 OR previous_stage_id=$1 LIMIT 1",
                [s.id],
              )
            ).rowCount
          )
            throw new AppError(
              409,
              "Etapa possui leads ou histórico. Preserve os registros e renomeie a etapa.",
            );
          await c.query("DELETE FROM pipeline_stages WHERE id=$1", [s.id]);
          await audit(c, actor.id, "pipeline.deleted", s.id, s.name, null);
        }
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
