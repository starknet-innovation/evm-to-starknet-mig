import { formatUnits } from "viem";

export function formatUsd(value: number | null, compact = false) {
  if (value === null || !Number.isFinite(value)) return "No price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100 ? 0 : value >= 1 ? 2 : 4,
  }).format(value);
}

export function formatTokenBalance(raw: bigint, decimals: number) {
  const numeric = Number(formatUnits(raw, decimals));
  if (!Number.isFinite(numeric)) return formatUnits(raw, decimals);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 1_000 ? 2 : numeric >= 1 ? 4 : 6,
  }).format(numeric);
}

export function shortenAddress(address: string, leading = 6, trailing = 4) {
  if (address.length <= leading + trailing + 3) return address;
  return `${address.slice(0, leading)}…${address.slice(-trailing)}`;
}

export function timeAgoOrDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
