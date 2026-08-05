import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { validateAndParseAddress } from "starknet";
import { z } from "zod";
import { buildMigrationPlan } from "@/lib/bridge-plan";
import { DEMO_EVM_ADDRESS, DEMO_STARKNET_ADDRESS } from "@/lib/constants";
import { saveMigrationPlan, usingPersistentDatabase } from "@/lib/persistence";

export const runtime = "nodejs";

function isStarknetAddress(value: string) {
  try {
    validateAndParseAddress(value);
    return true;
  } catch {
    return false;
  }
}

const planSchema = z.object({
  evmAddress: z.string().refine(isAddress, "Invalid Ethereum address"),
  starknetAddress: z.string().refine(isStarknetAddress, "Invalid Starknet address"),
  selections: z
    .array(
      z.object({
        assetId: z.string().min(1).max(96),
        balance: z.string().regex(/^\d+$/),
        usdValue: z.number().finite().nonnegative().nullable(),
      }),
    )
    .min(1)
    .max(200)
    .refine(
      (selections) => new Set(selections.map((selection) => selection.assetId)).size === selections.length,
      "Duplicate asset selections are not allowed",
    ),
  demo: z.boolean().optional().default(false),
});

function demoAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_MODE === "true";
}

export async function POST(request: Request) {
  try {
    const parsed = planSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid migration selection", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.demo && !demoAllowed()) {
      return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 });
    }

    const evmAddress = parsed.data.demo
      ? DEMO_EVM_ADDRESS
      : getAddress(parsed.data.evmAddress);
    const starknetAddress = parsed.data.demo
      ? DEMO_STARKNET_ADDRESS
      : parsed.data.starknetAddress;
    const plan = await buildMigrationPlan({
      evmAddress,
      starknetAddress,
      selections: parsed.data.selections,
      demo: parsed.data.demo,
    });
    await saveMigrationPlan(plan);

    return NextResponse.json({
      plan,
      persistence: usingPersistentDatabase() ? "postgres" : "memory",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build migration plan";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
