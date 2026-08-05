import { getAddress, isAddress, type Address } from "viem";
import {
  STARKGATE_ETH_BRIDGE,
  STARKGATE_ETH_TOKEN,
  STARKGATE_MULTI_BRIDGE,
  STARKGATE_TOKEN_LIST_URL,
} from "@/lib/constants";
import type { BridgeRoute } from "@/lib/types";

interface StarkGateTokenEntry {
  id?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  l1_token_address?: string;
  l1_bridge_address?: string;
  l2_bridge_address?: string;
  l2_token_address?: string;
  comment?: string;
}

export interface StarkGateToken {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  l1TokenAddress: Address;
  route: BridgeRoute;
}

const fallbackTokens: StarkGateTokenEntry[] = [
  {
    id: "eth",
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
    l1_token_address: STARKGATE_ETH_TOKEN,
    l1_bridge_address: STARKGATE_ETH_BRIDGE,
    l2_bridge_address:
      "0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82",
    l2_token_address:
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  },
  {
    id: "strk",
    name: "Starknet Token",
    symbol: "STRK",
    decimals: 18,
    l1_token_address: "0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766",
    l1_bridge_address: "0xcE5485Cfb26914C5dcE00B9BAF0580364daFC7a4",
    l2_bridge_address:
      "0x0594c1582459ea03f77deaf9eb7e3917d6994a03c13405ba42867f83d85f085d",
    l2_token_address:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    l1_token_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    l1_bridge_address: "0xF6080D9fbEEbcd44D89aFfBFd42F098cbFf92816",
    l2_bridge_address:
      "0x05cd48fccbfd8aa2773fe22c217e808319ffcc1c5a6a463f7d8fa2da48218196",
    l2_token_address:
      "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  },
  {
    id: "usdt",
    name: "Tether USD",
    symbol: "USDT",
    decimals: 6,
    l1_token_address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    l1_bridge_address: "0xbb3400F107804DFB482565FF1Ec8D8aE66747605",
    l2_bridge_address:
      "0x074761a8d48ce002963002becc6d9c3dd8a2a05b1075d55e5967f42296f16bd0",
    l2_token_address:
      "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  },
  {
    id: "weth",
    name: "Wrapped Ether",
    symbol: "WETH",
    decimals: 18,
    l1_token_address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    l1_bridge_address: STARKGATE_MULTI_BRIDGE,
    l2_bridge_address:
      "0x0616757a151c21f9be8775098d591c2807316d992bbc3bb1a5c1821630589256",
    l2_token_address:
      "0x0059907104adaad5ab2cee1151028af1311ecd527063da87bdf9089025b7fd4e",
  },
];

function normalizeEntry(entry: StarkGateTokenEntry): StarkGateToken | null {
  const {
    l1_token_address: token,
    l1_bridge_address: bridge,
    l2_bridge_address: l2Bridge,
    l2_token_address: l2Token,
  } = entry;

  if (!token || !bridge || !l2Bridge || !l2Token) return null;
  if (!isAddress(token) || !isAddress(bridge)) return null;
  if (entry.comment?.toLowerCase().includes("deposit blocked")) return null;

  const l1TokenAddress = getAddress(token);
  const l1BridgeAddress = getAddress(bridge);
  const isEth = l1TokenAddress.toLowerCase() === STARKGATE_ETH_TOKEN.toLowerCase();
  const isMulti = l1BridgeAddress.toLowerCase() === STARKGATE_MULTI_BRIDGE.toLowerCase();

  return {
    id: entry.id ?? l1TokenAddress.toLowerCase(),
    name: entry.name ?? entry.symbol ?? "Unknown token",
    symbol: entry.symbol ?? "TOKEN",
    decimals: entry.decimals ?? 18,
    l1TokenAddress,
    route: {
      kind: isEth ? "eth" : isMulti ? "multi-erc20" : "legacy-erc20",
      l1BridgeAddress,
      l2BridgeAddress: l2Bridge,
      l2TokenAddress: l2Token,
    },
  };
}

let tokenCache: { expiresAt: number; tokens: StarkGateToken[] } | null = null;

export async function getStarkGateTokens(): Promise<StarkGateToken[]> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.tokens;

  let entries: StarkGateTokenEntry[];
  try {
    const response = await fetch(STARKGATE_TOKEN_LIST_URL, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`StarkGate registry returned ${response.status}`);
    entries = (await response.json()) as StarkGateTokenEntry[];
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("StarkGate registry returned no routes");
    }
  } catch (error) {
    const fallbackAllowed =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_STARKGATE_REGISTRY_FALLBACK === "true";
    if (!fallbackAllowed) {
      throw new Error(
        `The live StarkGate registry is unavailable; route planning failed closed. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }
    entries = fallbackTokens;
  }

  const deduplicated = new Map<string, StarkGateToken>();
  for (const entry of entries) {
    const token = normalizeEntry(entry);
    if (!token) continue;
    const key = token.l1TokenAddress.toLowerCase();
    if (!deduplicated.has(key)) deduplicated.set(key, token);
  }

  const tokens = [...deduplicated.values()];
  tokenCache = { expiresAt: Date.now() + 60 * 60 * 1_000, tokens };
  return tokens;
}

export function tokenRouteMap(tokens: StarkGateToken[]) {
  return new Map(tokens.map((token) => [token.l1TokenAddress.toLowerCase(), token]));
}
