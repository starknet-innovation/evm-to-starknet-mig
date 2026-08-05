import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  isAddress,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import {
  erc20Abi,
  starkGateFeeAbi,
  starkGateLegacyDepositAbi,
  starkGateMultiDepositAbi,
} from "@/lib/abis";
import {
  DEFAULT_ETH_GAS_RESERVE_WEI,
  STARKGATE_ETH_TOKEN,
} from "@/lib/constants";
import { demoAssets } from "@/lib/demo";
import { formatTokenBalance } from "@/lib/format";
import { getStarkGateTokens, tokenRouteMap } from "@/lib/starkgate";
import type {
  AssetSelection,
  BridgeRoute,
  MigrationAction,
  MigrationPlan,
  PlannedAsset,
} from "@/lib/types";

interface PlanInput {
  evmAddress: Address;
  starknetAddress: string;
  selections: AssetSelection[];
  demo?: boolean;
}

interface ResolvedAsset {
  id: string;
  symbol: string;
  name: string;
  tokenAddress: Address | null;
  amount: bigint;
  fullBalance: bigint;
  decimals: number;
  usdValue: number | null;
  route: BridgeRoute;
  allowance: bigint;
}

function rpcUrl() {
  if (process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL) {
    return process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL;
  }
  if (process.env.ALCHEMY_API_KEY) {
    return `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  }
  throw new Error("An Ethereum RPC URL or Alchemy API key is required");
}

function gasReserve() {
  const configured = process.env.ETH_GAS_RESERVE_WEI;
  if (!configured) return DEFAULT_ETH_GAS_RESERVE_WEI;
  try {
    return BigInt(configured);
  } catch {
    return DEFAULT_ETH_GAS_RESERVE_WEI;
  }
}

function demoResolvedAssets(selections: AssetSelection[]): ResolvedAsset[] {
  const selected = new Map(selections.map((selection) => [selection.assetId, selection]));
  return demoAssets
    .filter((asset) => selected.has(asset.id) && asset.eligible && asset.route)
    .map((asset) => ({
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      tokenAddress: asset.tokenAddress,
      amount: BigInt(asset.balance),
      fullBalance: BigInt(asset.balance),
      decimals: asset.decimals,
      usdValue: selected.get(asset.id)?.usdValue ?? asset.usdValue,
      route: asset.route!,
      allowance: 0n,
    }));
}

async function resolveMainnetAssets(input: PlanInput): Promise<ResolvedAsset[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl(), { timeout: 12_000, retryCount: 2 }),
  });
  const registry = await getStarkGateTokens();
  const registryMap = tokenRouteMap(registry);
  const selections = new Map(input.selections.map((selection) => [selection.assetId, selection]));
  const resolved: ResolvedAsset[] = [];

  for (const selection of input.selections) {
    if (selection.assetId === "native-eth") {
      const token = registry.find(
        (entry) => entry.l1TokenAddress.toLowerCase() === STARKGATE_ETH_TOKEN.toLowerCase(),
      );
      if (!token) throw new Error("The StarkGate ETH route is unavailable");
      const balance = await client.getBalance({ address: input.evmAddress });
      resolved.push({
        id: selection.assetId,
        symbol: "ETH",
        name: "Ether",
        tokenAddress: null,
        amount: balance,
        fullBalance: balance,
        decimals: 18,
        usdValue: selection.usdValue,
        route: token.route,
        allowance: 0n,
      });
      continue;
    }

    const tokenText = selection.assetId.replace(/^erc20-/, "");
    if (!isAddress(tokenText)) continue;
    const tokenAddress = getAddress(tokenText);
    const token = registryMap.get(tokenAddress.toLowerCase());
    if (!token) continue;

    const [balance, allowance] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [input.evmAddress],
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [input.evmAddress, token.route.l1BridgeAddress],
      }),
    ]);
    if (balance === 0n) continue;

    resolved.push({
      id: selection.assetId,
      symbol: token.symbol,
      name: token.name,
      tokenAddress,
      amount: balance,
      fullBalance: balance,
      decimals: token.decimals,
      usdValue: selections.get(selection.assetId)?.usdValue ?? null,
      route: token.route,
      allowance,
    });
  }

  return resolved;
}

function approvalActions(asset: ResolvedAsset): MigrationAction[] {
  if (!asset.tokenAddress || asset.allowance >= asset.amount) return [];
  const actions: MigrationAction[] = [];

  if (asset.allowance > 0n) {
    actions.push({
      id: randomUUID(),
      assetId: asset.id,
      assetSymbol: asset.symbol,
      type: "approval",
      label: `Reset ${asset.symbol} approval`,
      to: asset.tokenAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [asset.route.l1BridgeAddress, 0n],
      }),
      value: "0",
      status: "ready",
    });
  }

  actions.push({
    id: randomUUID(),
    assetId: asset.id,
    assetSymbol: asset.symbol,
    type: "approval",
    label: `Approve exact ${asset.symbol} balance`,
    to: asset.tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [asset.route.l1BridgeAddress, asset.amount],
    }),
    value: "0",
    status: "ready",
  });

  return actions;
}

function depositAction(
  asset: ResolvedAsset,
  starknetAddress: string,
  fee: bigint,
): MigrationAction {
  const recipient = BigInt(starknetAddress);
  const isMulti = asset.route.kind === "multi-erc20";
  const data = isMulti
    ? encodeFunctionData({
        abi: starkGateMultiDepositAbi,
        functionName: "deposit",
        args: [asset.tokenAddress!, asset.amount, recipient],
      })
    : encodeFunctionData({
        abi: starkGateLegacyDepositAbi,
        functionName: "deposit",
        args: [asset.amount, recipient],
      });

  return {
    id: randomUUID(),
    assetId: asset.id,
    assetSymbol: asset.symbol,
    type: "deposit",
    label: `Deposit ${asset.symbol} to Starknet`,
    to: asset.route.l1BridgeAddress,
    data,
    value: (asset.route.kind === "eth" ? asset.amount + fee : fee).toString(),
    status: "ready",
  };
}

export async function buildMigrationPlan(input: PlanInput): Promise<MigrationPlan> {
  const resolved = input.demo
    ? demoResolvedAssets(input.selections)
    : await resolveMainnetAssets(input);

  if (resolved.length === 0) {
    throw new Error("No selected asset has an active StarkGate route and a non-zero balance");
  }

  const ordered = [...resolved].sort((left, right) => {
    if (left.route.kind === "eth") return 1;
    if (right.route.kind === "eth") return -1;
    return (right.usdValue ?? 0) - (left.usdValue ?? 0);
  });
  const reserve = gasReserve();
  const feeByBridge = new Map<string, bigint>();

  if (input.demo) {
    for (const asset of ordered) {
      feeByBridge.set(asset.route.l1BridgeAddress.toLowerCase(), 250_000_000_000_000n);
    }
  } else {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl(), { timeout: 12_000, retryCount: 2 }),
    });
    await Promise.all(
      [...new Set(ordered.map((asset) => asset.route.l1BridgeAddress.toLowerCase()))].map(
        async (bridge) => {
          const fee = await client.readContract({
            address: getAddress(bridge),
            abi: starkGateFeeAbi,
            functionName: "estimateDepositFeeWei",
          });
          feeByBridge.set(bridge, fee);
        },
      ),
    );
  }

  const messagingFees = ordered.reduce(
    (sum, asset) => sum + (feeByBridge.get(asset.route.l1BridgeAddress.toLowerCase()) ?? 0n),
    0n,
  );
  const native = ordered.find((asset) => asset.route.kind === "eth");
  const requiredEth = messagingFees + reserve;
  const availableEth = native?.fullBalance ??
    (input.demo
      ? BigInt(demoAssets.find((asset) => asset.kind === "native")?.balance ?? "0")
      : await createPublicClient({ chain: mainnet, transport: http(rpcUrl()) }).getBalance({
          address: input.evmAddress,
        }));

  if (availableEth <= requiredEth) {
    throw new Error(
      `Not enough ETH for StarkGate messaging fees and the gas reserve. Keep at least ${formatUnits(requiredEth, 18)} ETH available.`,
    );
  }

  if (native) native.amount = native.fullBalance - requiredEth;

  const actions: MigrationAction[] = [];
  const plannedAssets: PlannedAsset[] = [];
  let totalUsd = 0;

  for (const asset of ordered) {
    if (asset.amount <= 0n) continue;
    actions.push(...approvalActions(asset));
    const fee = feeByBridge.get(asset.route.l1BridgeAddress.toLowerCase()) ?? 0n;
    actions.push(depositAction(asset, input.starknetAddress, fee));

    const adjustedUsd =
      asset.usdValue === null
        ? null
        : asset.usdValue * Number(asset.amount) / Number(asset.fullBalance);
    if (adjustedUsd !== null && Number.isFinite(adjustedUsd)) totalUsd += adjustedUsd;
    plannedAssets.push({
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      tokenAddress: asset.tokenAddress,
      amount: asset.amount.toString(),
      decimals: asset.decimals,
      formattedAmount: formatTokenBalance(asset.amount, asset.decimals),
      usdValue: adjustedUsd,
      route: asset.route,
    });
  }

  const planHash = keccak256(
    toHex(
      JSON.stringify({
        version: 1,
        evmAddress: input.evmAddress.toLowerCase(),
        starknetAddress: input.starknetAddress.toLowerCase(),
        actions: actions.map(({ to, data, value }) => ({
          to: to.toLowerCase(),
          data,
          value,
        })),
      }),
    ),
  ) as Hex;
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    evmAddress: input.evmAddress,
    starknetAddress: input.starknetAddress,
    assets: plannedAssets,
    actions,
    planHash,
    totalUsd,
    messagingFeesWei: messagingFees.toString(),
    gasReserveWei: reserve.toString(),
    status: "ownership-pending",
    ownershipVerifiedAt: null,
    executionMode: null,
    batchId: null,
    createdAt: now,
    updatedAt: now,
    demo: Boolean(input.demo),
  };
}
