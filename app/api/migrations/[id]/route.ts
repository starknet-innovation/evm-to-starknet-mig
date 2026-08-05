import { NextResponse } from "next/server";
import { z } from "zod";
import { getMigrationPlan, saveMigrationPlan } from "@/lib/persistence";
import type { MigrationActionStatus, MigrationStatus } from "@/lib/types";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z
    .enum(["draft", "ownership-pending", "ready", "submitting", "submitted", "completed", "partially-failed"])
    .optional(),
  executionMode: z.enum(["batch", "sequential"]).nullable().optional(),
  batchId: z.string().max(4096).nullable().optional(),
  actions: z
    .array(
      z.object({
        id: z.string(),
        status: z.enum(["ready", "awaiting-wallet", "submitted", "confirmed", "failed"]),
        transactionHash: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
      }),
    )
    .max(500)
    .optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const plan = await getMigrationPlan(id);
  if (!plan) return NextResponse.json({ error: "Migration not found" }, { status: 404 });
  return NextResponse.json({ plan });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const plan = await getMigrationPlan(id);
  if (!plan) return NextResponse.json({ error: "Migration not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid migration update" }, { status: 400 });
  }

  const actionUpdates = new Map(parsed.data.actions?.map((action) => [action.id, action]));
  const updated = {
    ...plan,
    status: (parsed.data.status ?? plan.status) as MigrationStatus,
    executionMode:
      parsed.data.executionMode === undefined ? plan.executionMode : parsed.data.executionMode,
    batchId: parsed.data.batchId === undefined ? plan.batchId : parsed.data.batchId,
    actions: plan.actions.map((action) => {
      const update = actionUpdates.get(action.id);
      if (!update) return action;
      return {
        ...action,
        status: update.status as MigrationActionStatus,
        ...(update.transactionHash ? { transactionHash: update.transactionHash as `0x${string}` } : {}),
      };
    }),
    updatedAt: new Date().toISOString(),
  };
  await saveMigrationPlan(updated);
  return NextResponse.json({ plan: updated });
}
