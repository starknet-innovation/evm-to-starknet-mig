import { randomBytes, randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";
import {
  CHALLENGE_TTL_SECONDS,
  PRODUCT_NAME,
  STARKNET_CHAIN_ID,
} from "@/lib/constants";
import type { PersistedChallenge } from "@/lib/types";

export function createOwnershipChallenge(input: {
  evmAddress: Address;
  starknetAddress: string;
  planId: string;
  planHash: Hex;
}): PersistedChallenge {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAtSeconds = issuedAt + CHALLENGE_TTL_SECONDS;
  const nonce = `0x${randomBytes(30).toString("hex")}`;
  const id = randomUUID();

  const typedData = {
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      MigrationOwnership: [
        { name: "statement", type: "string" },
        { name: "evm_address", type: "felt" },
        { name: "starknet_address", type: "ContractAddress" },
        { name: "plan_hash", type: "string" },
        { name: "nonce", type: "felt" },
        { name: "issued_at", type: "timestamp" },
        { name: "expires_at", type: "timestamp" },
      ],
    },
    primaryType: "MigrationOwnership",
    domain: {
      name: PRODUCT_NAME,
      version: "1",
      chainId: STARKNET_CHAIN_ID,
      revision: "1",
    },
    message: {
      statement: "I control this Starknet account and approve it as my migration destination.",
      evm_address: input.evmAddress,
      starknet_address: input.starknetAddress,
      plan_hash: input.planHash,
      nonce,
      issued_at: issuedAt,
      expires_at: expiresAtSeconds,
    },
  };

  return {
    id,
    typedData,
    expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
    evmAddress: input.evmAddress,
    starknetAddress: input.starknetAddress,
    planId: input.planId,
    planHash: input.planHash,
    usedAt: null,
  };
}
