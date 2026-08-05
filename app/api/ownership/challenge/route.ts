import { NextResponse } from "next/server";
import { z } from "zod";
import { createOwnershipChallenge } from "@/lib/ownership";
import {
  getMigrationPlan,
  saveOwnershipChallenge,
} from "@/lib/persistence";

export const runtime = "nodejs";

const challengeSchema = z.object({ planId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = challengeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid migration plan is required" }, { status: 400 });
  }

  const plan = await getMigrationPlan(parsed.data.planId);
  if (!plan) return NextResponse.json({ error: "Migration not found" }, { status: 404 });
  if (plan.ownershipVerifiedAt) {
    return NextResponse.json({ error: "Ownership is already verified" }, { status: 409 });
  }

  const challenge = createOwnershipChallenge({
    evmAddress: plan.evmAddress,
    starknetAddress: plan.starknetAddress,
    planId: plan.id,
    planHash: plan.planHash,
  });
  await saveOwnershipChallenge(challenge);

  return NextResponse.json({
    challenge: {
      id: challenge.id,
      typedData: challenge.typedData,
      expiresAt: challenge.expiresAt,
    },
  });
}
