import {
  formatUnits,
  getAddress,
  isAddress,
  type Address,
} from "viem";
import { formatTokenBalance } from "@/lib/format";
import { getStarkGateTokens, tokenRouteMap } from "@/lib/starkgate";
import type { WalletAsset } from "@/lib/types";

interface AlchemyToken {
  address: string;
  network: string;
  tokenAddress?: string | null;
  tokenBalance: string;
  tokenMetadata?: {
    decimals?: number | null;
    logo?: string | null;
    name?: string | null;
    symbol?: string | null;
  } | null;
  tokenPrices?: Array<{
    currency: string;
    value: string;
    lastUpdatedAt?: string;
  }>;
}

interface AlchemyPortfolioResponse {
  data?: {
    tokens?: AlchemyToken[];
    pageKey?: string;
  };
  error?: { message?: string };
}

function rawBalance(value: string, decimals: number) {
  if (value.startsWith("0x")) return BigInt(value);
  if (/^\d+$/.test(value)) return BigInt(value);
  const [whole = "0", fraction = ""] = value.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(`${whole}${padded}`);
}

function looksSuspicious(name: string, symbol: string, logo: string | null) {
  const combined = `${name} ${symbol}`.toLowerCase();
  return (
    combined.includes("http") ||
    combined.includes("claim") ||
    combined.includes("visit") ||
    combined.includes("airdrop") ||
    (!logo && (!name || !symbol))
  );
}

export async function getEthereumAssets(address: Address): Promise<WalletAsset[]> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) throw new Error("ALCHEMY_API_KEY is not configured");

  const tokens: AlchemyToken[] = [];
  let pageKey: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const response = await fetch(
      `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/by-address`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          addresses: [{ address, networks: ["eth-mainnet"] }],
          withMetadata: true,
          withPrices: true,
          includeNativeTokens: true,
          includeErc20Tokens: true,
          ...(pageKey ? { pageKey } : {}),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );

    const payload = (await response.json()) as AlchemyPortfolioResponse;
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? `Alchemy returned ${response.status}`);
    }

    tokens.push(...(payload.data?.tokens ?? []));
    pageKey = payload.data?.pageKey;
    if (!pageKey) break;
  }

  const bridgeTokens = await getStarkGateTokens();
  const routes = tokenRouteMap(bridgeTokens);
  const ethRoute = bridgeTokens.find((token) => token.id === "eth") ?? bridgeTokens.find(
    (token) => token.symbol.toUpperCase() === "ETH" && token.route.kind === "eth",
  );

  const assets: WalletAsset[] = [];
  for (const token of tokens) {
    const metadata = token.tokenMetadata ?? {};
    const isNative =
      !token.tokenAddress ||
      token.tokenAddress === "0x0000000000000000000000000000000000000000" ||
      (metadata.symbol?.trim().toUpperCase() === "ETH" && token.network === "eth-mainnet");
    const symbol = isNative ? "ETH" : metadata.symbol?.trim() || "TOKEN";
    const name = isNative ? "Ether" : metadata.name?.trim() || symbol;
    const decimals = metadata.decimals ?? (isNative ? 18 : 18);
    let balance: bigint;
    try {
      balance = rawBalance(token.tokenBalance, decimals);
    } catch {
      continue;
    }
    if (balance === 0n) continue;

    const normalizedAddress =
      !isNative && token.tokenAddress && isAddress(token.tokenAddress)
        ? getAddress(token.tokenAddress)
        : null;
    if (!isNative && !normalizedAddress) continue;
    const bridgeToken = isNative
      ? ethRoute
      : normalizedAddress
        ? routes.get(normalizedAddress.toLowerCase())
        : undefined;
    const priceText = token.tokenPrices?.find(
      (price) => price.currency.toLowerCase() === "usd",
    )?.value;
    const usdPrice = priceText && Number.isFinite(Number(priceText)) ? Number(priceText) : null;
    const numericBalance = Number(formatUnits(balance, decimals));
    const computedUsdValue = usdPrice === null ? null : numericBalance * usdPrice;
    const usdValue = computedUsdValue !== null && Number.isFinite(computedUsdValue)
      ? computedUsdValue
      : null;
    const logoUrl = metadata.logo ?? null;
    const suspicious = looksSuspicious(name, symbol, logoUrl);
    const eligible = Boolean(bridgeToken) && !suspicious;

    assets.push({
      id: isNative ? "native-eth" : `erc20-${normalizedAddress?.toLowerCase()}`,
      kind: isNative ? "native" : "erc20",
      name,
      symbol,
      tokenAddress: normalizedAddress,
      decimals,
      balance: balance.toString(),
      formattedBalance: formatTokenBalance(balance, decimals),
      usdPrice,
      usdValue,
      logoUrl,
      eligible,
      selectedByDefault: eligible,
      suspicious,
      eligibilityReason: eligible
        ? null
        : suspicious
          ? "Flagged for manual review"
          : "Not supported by StarkGate",
      route: bridgeToken?.route ?? null,
    });
  }

  return assets.sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (left.usdValue === null && right.usdValue !== null) return 1;
    if (left.usdValue !== null && right.usdValue === null) return -1;
    return (right.usdValue ?? 0) - (left.usdValue ?? 0);
  });
}
