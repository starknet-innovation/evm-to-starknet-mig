"use client";

import { getPublicClient } from "@wagmi/core";
import { mainnet } from "viem/chains";
import { keccak256, toHex, type Hex, type WalletClient } from "viem";
import { wagmiConfig } from "@/app/providers";
import type {
  MigrationAction,
  MigrationActionStatus,
  MigrationPlan,
  MigrationStatus,
} from "@/lib/types";

type WalletRpc = (request: { method: string; params?: readonly unknown[] }) => Promise<unknown>;

interface ExecutionCallbacks {
  onPlan: (plan: MigrationPlan) => void;
}

async function patchPlan(
  plan: MigrationPlan,
  update: {
    status?: MigrationStatus;
    executionMode?: "batch" | "sequential" | null;
    batchId?: string | null;
    actions?: Array<{
      id: string;
      status: MigrationActionStatus;
      transactionHash?: string;
    }>;
  },
) {
  const response = await fetch(`/api/migrations/${plan.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  const payload = (await response.json()) as { plan?: MigrationPlan; error?: string };
  if (!response.ok || !payload.plan) throw new Error(payload.error ?? "Unable to save migration progress");
  return payload.plan;
}

function withActionStatus(
  plan: MigrationPlan,
  actionId: string,
  status: MigrationActionStatus,
  transactionHash?: `0x${string}`,
) {
  return {
    ...plan,
    actions: plan.actions.map((action) =>
      action.id === actionId
        ? { ...action, status, ...(transactionHash ? { transactionHash } : {}) }
        : action,
    ),
  };
}

async function runDemo(plan: MigrationPlan, callbacks: ExecutionCallbacks) {
  let current = await patchPlan(plan, { status: "submitting", executionMode: "batch" });
  callbacks.onPlan(current);

  for (const action of current.actions) {
    current = withActionStatus(current, action.id, "awaiting-wallet");
    callbacks.onPlan(current);
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    const fakeHash = `0x${action.id.replaceAll("-", "").padEnd(64, "0").slice(0, 64)}` as `0x${string}`;
    current = withActionStatus(current, action.id, "confirmed", fakeHash);
    callbacks.onPlan(current);
  }

  current = await patchPlan(current, {
    status: "completed",
    executionMode: "batch",
    batchId: `demo-${current.id}`,
    actions: current.actions.map((action) => ({
      id: action.id,
      status: "confirmed",
      transactionHash: action.transactionHash,
    })),
  });
  callbacks.onPlan(current);
  return current;
}

function capabilityForMainnet(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  for (const chainCapabilities of [record["0x1"], record["0x01"], record["0x0"]]) {
    if (!chainCapabilities || typeof chainCapabilities !== "object") continue;
    const atomic = (chainCapabilities as Record<string, unknown>).atomic;
    if (!atomic || typeof atomic !== "object") continue;
    const status = (atomic as Record<string, unknown>).status;
    if (status === "supported" || status === "ready" || status === "unsupported") {
      return chainCapabilities;
    }
  }
  return null;
}

interface CallsStatus {
  status: number;
  receipts?: Array<{
    status: Hex;
    transactionHash: Hex;
  }>;
}

function batchRequestId(plan: MigrationPlan) {
  return keccak256(toHex(`lattice:${plan.id}`));
}

async function getCallsStatus(request: WalletRpc, batchId: string) {
  try {
    const result = await request({ method: "wallet_getCallsStatus", params: [batchId] });
    if (!result || typeof result !== "object" || !("status" in result)) return null;
    return result as CallsStatus;
  } catch (error) {
    if ((error as { code?: number })?.code === 5730) return null;
    throw error;
  }
}

async function persistFinalBatchStatus(
  plan: MigrationPlan,
  status: CallsStatus,
  callbacks: ExecutionCallbacks,
) {
  if (status.status >= 200 && status.status < 300) {
    const receipts = status.receipts ?? [];
    const actions = plan.actions.map((action, index) => ({
      id: action.id,
      status: "confirmed" as const,
      transactionHash: receipts[index]?.transactionHash ?? receipts[0]?.transactionHash,
    }));
    const complete = await patchPlan(plan, { status: "completed", actions });
    callbacks.onPlan(complete);
    return complete;
  }

  if (status.status >= 400) {
    const receipts = status.receipts ?? [];
    const actions = plan.actions.map((action, index) => ({
      id: action.id,
      status: receipts[index]?.status === "0x1" ? "confirmed" as const : "failed" as const,
      transactionHash: receipts[index]?.transactionHash,
    }));
    const failed = await patchPlan(plan, { status: "partially-failed", actions });
    callbacks.onPlan(failed);
    throw new Error(
      status.status === 600
        ? "The wallet reports a partially reverted batch. Confirmed calls were saved; retry only the failed calls."
        : "The wallet reports that the call batch failed.",
    );
  }

  return plan;
}

async function waitForBatch(
  plan: MigrationPlan,
  request: WalletRpc,
  callbacks: ExecutionCallbacks,
) {
  if (!plan.batchId) return plan;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const status = await getCallsStatus(request, plan.batchId);
    if (!status || status.status === 100) {
      if (attempt < 14) await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      continue;
    }
    return persistFinalBatchStatus(plan, status, callbacks);
  }
  return plan;
}

async function tryBatch(
  plan: MigrationPlan,
  walletClient: WalletClient,
  callbacks: ExecutionCallbacks,
) {
  if (plan.actions.some((action) => action.status !== "ready")) return null;
  const request = walletClient.request as unknown as WalletRpc;
  let capabilities: unknown;
  try {
    capabilities = await request({
      method: "wallet_getCapabilities",
      params: [plan.evmAddress, ["0x1"]],
    });
  } catch {
    return null;
  }
  if (!capabilityForMainnet(capabilities)) return null;

  const requestId = batchRequestId(plan);
  const existing = await getCallsStatus(request, requestId);
  if (existing) {
    const recovered = await patchPlan(plan, {
      status: "submitted",
      executionMode: "batch",
      batchId: requestId,
      actions: plan.actions.map((action) => ({ id: action.id, status: "submitted" })),
    });
    callbacks.onPlan(recovered);
    return waitForBatch(recovered, request, callbacks);
  }

  try {
    const result = await request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          id: requestId,
          from: plan.evmAddress,
          chainId: "0x1",
          atomicRequired: false,
          calls: plan.actions.map((action) => ({
            to: action.to,
            data: action.data,
            value: `0x${BigInt(action.value).toString(16)}`,
          })),
        },
      ],
    });
    const batchId =
      typeof result === "string"
        ? result
        : result && typeof result === "object" && "id" in result
          ? String((result as { id: unknown }).id)
          : null;
    if (!batchId) return null;

    const updated = await patchPlan(plan, {
      status: "submitted",
      executionMode: "batch",
      batchId,
      actions: plan.actions.map((action) => ({ id: action.id, status: "submitted" })),
    });
    callbacks.onPlan(updated);
    return waitForBatch(updated, request, callbacks);
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 4001) throw error;
    return null;
  }
}

async function runSequential(
  plan: MigrationPlan,
  walletClient: WalletClient,
  callbacks: ExecutionCallbacks,
) {
  const publicClient = getPublicClient(wagmiConfig, { chainId: mainnet.id });
  if (!publicClient) throw new Error("Ethereum public client is unavailable");
  let current = await patchPlan(plan, { status: "submitting", executionMode: "sequential" });
  callbacks.onPlan(current);

  for (const action of current.actions) {
    if (action.status === "confirmed") continue;
    if (action.status === "submitted" && action.transactionHash) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: action.transactionHash });
      if (receipt.status !== "success") {
        current = await patchPlan(current, {
          status: "partially-failed",
          executionMode: "sequential",
          actions: [{ id: action.id, status: "failed", transactionHash: action.transactionHash }],
        });
        callbacks.onPlan(current);
        throw new Error(`${action.label} reverted. Its failure was saved; retry to continue safely.`);
      }
      current = await patchPlan(current, {
        status: "submitting",
        executionMode: "sequential",
        actions: [{ id: action.id, status: "confirmed", transactionHash: action.transactionHash }],
      });
      callbacks.onPlan(current);
      continue;
    }
    current = withActionStatus(current, action.id, "awaiting-wallet");
    callbacks.onPlan(current);
    try {
      const transactionHash = await walletClient.sendTransaction({
        account: current.evmAddress,
        chain: mainnet,
        to: action.to,
        data: action.data,
        value: BigInt(action.value),
      });
      current = withActionStatus(current, action.id, "submitted", transactionHash);
      callbacks.onPlan(current);
      await patchPlan(current, {
        status: "submitting",
        executionMode: "sequential",
        actions: [{ id: action.id, status: "submitted", transactionHash }],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      if (receipt.status !== "success") throw new Error(`${action.label} reverted`);
      current = withActionStatus(current, action.id, "confirmed", transactionHash);
      callbacks.onPlan(current);
      await patchPlan(current, {
        status: "submitting",
        executionMode: "sequential",
        actions: [{ id: action.id, status: "confirmed", transactionHash }],
      });
    } catch (error) {
      current = withActionStatus(current, action.id, "failed");
      current = await patchPlan(current, {
        status: "partially-failed",
        executionMode: "sequential",
        actions: [{ id: action.id, status: "failed" }],
      });
      callbacks.onPlan(current);
      throw error;
    }
  }

  current = await patchPlan(current, { status: "completed", executionMode: "sequential" });
  callbacks.onPlan(current);
  return current;
}

export async function executeMigration(
  plan: MigrationPlan,
  walletClient: WalletClient | undefined,
  callbacks: ExecutionCallbacks,
) {
  if (plan.demo) return runDemo(plan, callbacks);
  if (process.env.NEXT_PUBLIC_ENABLE_MAINNET_EXECUTION !== "true") {
    throw new Error("Mainnet execution is disabled. Set NEXT_PUBLIC_ENABLE_MAINNET_EXECUTION=true after staging verification.");
  }
  if (!walletClient) throw new Error("Reconnect the Ethereum wallet to continue");
  if (walletClient.account?.address.toLowerCase() !== plan.evmAddress.toLowerCase()) {
    throw new Error("The connected Ethereum account does not match this migration plan");
  }

  if (
    plan.executionMode === "batch" &&
    plan.batchId &&
    (plan.status === "submitted" || plan.status === "submitting")
  ) {
    return waitForBatch(
      plan,
      walletClient.request as unknown as WalletRpc,
      callbacks,
    );
  }

  const batched = await tryBatch(plan, walletClient, callbacks);
  if (batched) return batched;
  return runSequential(plan, walletClient, callbacks);
}

export function actionProgress(actions: MigrationAction[]) {
  const complete = actions.filter((action) => action.status === "confirmed").length;
  return { complete, total: actions.length };
}
