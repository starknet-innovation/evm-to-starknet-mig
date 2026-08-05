import { NextResponse } from "next/server";
import { RpcProvider, type Signature, type TypedData } from "starknet";
import { z } from "zod";
import {
  consumeOwnershipChallenge,
  getMigrationPlan,
  getOwnershipChallenge,
  saveMigrationPlan,
} from "@/lib/persistence";

export const runtime = "nodejs";

const verifySchema = z.object({
  challengeId: z.string().uuid(),
  signature: z.array(z.string().min(1)).min(1).max(32),
});

function demoAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_MODE === "true";
}

export async function POST(request: Request) {
  try {
    const parsed = verifySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ownership proof" }, { status: 400 });
    }

    const challenge = await getOwnershipChallenge(parsed.data.challengeId);
    if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    if (challenge.usedAt) {
      return NextResponse.json({ error: "Challenge has already been used" }, { status: 409 });
    }
    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Challenge has expired" }, { status: 410 });
    }

    const plan = await getMigrationPlan(challenge.planId);
    if (!plan || plan.planHash !== challenge.planHash) {
      return NextResponse.json({ error: "Migration plan no longer matches" }, { status: 409 });
    }

    let valid = false;
    if (plan.demo && demoAllowed()) {
      valid = parsed.data.signature[0] === "demo-signature";
    } else {
      const nodeUrl = process.env.STARKNET_RPC_URL;
      if (!nodeUrl) {
        return NextResponse.json({ error: "STARKNET_RPC_URL is not configured" }, { status: 503 });
      }
      const provider = new RpcProvider({ nodeUrl });
      await provider.getClassHashAt(challenge.starknetAddress);
      valid = await provider.verifyMessageInStarknet(
        challenge.typedData as unknown as TypedData,
        parsed.data.signature as Signature,
        challenge.starknetAddress,
      );
    }

    if (!valid) {
      return NextResponse.json({ error: "The Starknet signature is not valid" }, { status: 401 });
    }

    const consumed = await consumeOwnershipChallenge(challenge.id);
    if (!consumed) {
      return NextResponse.json({ error: "Challenge was consumed concurrently" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const updated = {
      ...plan,
      status: "ready" as const,
      ownershipVerifiedAt: now,
      updatedAt: now,
    };
    await saveMigrationPlan(updated);
    return NextResponse.json({ verified: true, plan: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify ownership";
    const deploymentError = /class hash|contract not found|not found/i.test(message);
    return NextResponse.json(
      {
        error: deploymentError
          ? "This Starknet account is not deployed on mainnet yet"
          : message,
      },
      { status: deploymentError ? 422 : 500 },
    );
  }
}
