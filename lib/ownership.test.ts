import { describe, expect, it } from "vitest";
import { typedData, type TypedData } from "starknet";
import { createOwnershipChallenge } from "@/lib/ownership";
import { DEMO_EVM_ADDRESS, DEMO_STARKNET_ADDRESS } from "@/lib/constants";

const planHash = `0x${"12".repeat(32)}` as const;

describe("createOwnershipChallenge", () => {
  it("creates a valid, destination-bound SNIP-12 message", () => {
    const challenge = createOwnershipChallenge({
      evmAddress: DEMO_EVM_ADDRESS,
      starknetAddress: DEMO_STARKNET_ADDRESS,
      planId: "plan-1",
      planHash,
    });
    const message = challenge.typedData.message as Record<string, unknown>;

    expect(challenge.typedData.primaryType).toBe("MigrationOwnership");
    expect(message.evm_address).toBe(DEMO_EVM_ADDRESS);
    expect(message.starknet_address).toBe(DEMO_STARKNET_ADDRESS);
    expect(message.plan_hash).toBe(planHash);
    expect(Number(message.expires_at) - Number(message.issued_at)).toBe(600);
    expect(() => typedData.getMessageHash(
      challenge.typedData as unknown as TypedData,
      DEMO_STARKNET_ADDRESS,
    )).not.toThrow();
  });

  it("uses a fresh nonce for every proof", () => {
    const input = {
      evmAddress: DEMO_EVM_ADDRESS,
      starknetAddress: DEMO_STARKNET_ADDRESS,
      planId: "plan-1",
      planHash,
    };
    const first = createOwnershipChallenge(input);
    const second = createOwnershipChallenge(input);

    expect((first.typedData.message as Record<string, unknown>).nonce)
      .not.toBe((second.typedData.message as Record<string, unknown>).nonce);
  });
});
