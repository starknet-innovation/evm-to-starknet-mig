import type { Address, Hex } from "viem";

export type AssetKind = "native" | "erc20";

export type BridgeKind = "eth" | "legacy-erc20" | "multi-erc20";

export interface BridgeRoute {
  kind: BridgeKind;
  l1BridgeAddress: Address;
  l2BridgeAddress: string;
  l2TokenAddress: string;
}

export interface WalletAsset {
  id: string;
  kind: AssetKind;
  name: string;
  symbol: string;
  tokenAddress: Address | null;
  decimals: number;
  balance: string;
  formattedBalance: string;
  usdPrice: number | null;
  usdValue: number | null;
  logoUrl: string | null;
  eligible: boolean;
  selectedByDefault: boolean;
  suspicious: boolean;
  eligibilityReason: string | null;
  route: BridgeRoute | null;
}

export type MigrationActionType = "approval" | "deposit";
export type MigrationActionStatus =
  | "ready"
  | "awaiting-wallet"
  | "submitted"
  | "confirmed"
  | "failed";

export interface MigrationAction {
  id: string;
  assetId: string;
  assetSymbol: string;
  type: MigrationActionType;
  label: string;
  to: Address;
  data: Hex;
  value: string;
  status: MigrationActionStatus;
  transactionHash?: Hex;
}

export type MigrationStatus =
  | "draft"
  | "ownership-pending"
  | "ready"
  | "submitting"
  | "submitted"
  | "completed"
  | "partially-failed";

export interface PlannedAsset {
  id: string;
  symbol: string;
  name: string;
  tokenAddress: Address | null;
  amount: string;
  decimals: number;
  formattedAmount: string;
  usdValue: number | null;
  route: BridgeRoute;
}

export interface MigrationPlan {
  id: string;
  evmAddress: Address;
  starknetAddress: string;
  assets: PlannedAsset[];
  actions: MigrationAction[];
  planHash: Hex;
  totalUsd: number;
  messagingFeesWei: string;
  gasReserveWei: string;
  status: MigrationStatus;
  ownershipVerifiedAt: string | null;
  executionMode: "batch" | "sequential" | null;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
}

export interface OwnershipChallenge {
  id: string;
  typedData: Record<string, unknown>;
  expiresAt: string;
}

export interface PersistedChallenge extends OwnershipChallenge {
  evmAddress: Address;
  starknetAddress: string;
  planId: string;
  planHash: Hex;
  usedAt: string | null;
}

export interface AssetSelection {
  assetId: string;
  balance: string;
  usdValue: number | null;
}
