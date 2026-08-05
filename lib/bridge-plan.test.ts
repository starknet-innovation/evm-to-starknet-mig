import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMigrationPlan } from "@/lib/bridge-plan";
import { DEMO_EVM_ADDRESS, DEMO_STARKNET_ADDRESS } from "@/lib/constants";
import { demoAssets } from "@/lib/demo";

function demoSelections() {
  return demoAssets
    .filter((asset) => asset.selectedByDefault)
    .map((asset) => ({
      assetId: asset.id,
      balance: asset.balance,
      usdValue: asset.usdValue,
    }));
}

describe("buildMigrationPlan", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates exact approvals, deposits, fees, and an ETH reserve", async () => {
    vi.stubEnv("ETH_GAS_RESERVE_WEI", "15000000000000000");

    const plan = await buildMigrationPlan({
      evmAddress: DEMO_EVM_ADDRESS,
      starknetAddress: DEMO_STARKNET_ADDRESS,
      selections: demoSelections(),
      demo: true,
    });

    expect(plan.status).toBe("ownership-pending");
    expect(plan.assets).toHaveLength(5);
    expect(plan.actions.filter((action) => action.type === "approval")).toHaveLength(4);
    expect(plan.actions.at(-1)).toMatchObject({
      assetId: "native-eth",
      type: "deposit",
    });
    expect(plan.messagingFeesWei).toBe("1250000000000000");
    expect(plan.gasReserveWei).toBe("15000000000000000");
    expect(plan.assets.find((asset) => asset.id === "native-eth")?.amount)
      .toBe("1825750000000000000");
    expect(plan.actions.filter((action) => action.type === "approval").every(
      (action) => action.label.toLowerCase().includes("exact"),
    )).toBe(true);
  });

  it("hashes the exact route deterministically", async () => {
    const input = {
      evmAddress: DEMO_EVM_ADDRESS,
      starknetAddress: DEMO_STARKNET_ADDRESS,
      selections: demoSelections(),
      demo: true,
    } as const;

    const [first, second] = await Promise.all([
      buildMigrationPlan(input),
      buildMigrationPlan(input),
    ]);

    expect(first.id).not.toBe(second.id);
    expect(first.planHash).toBe(second.planHash);
  });
});
