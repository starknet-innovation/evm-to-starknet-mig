"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Search, ShieldCheck, Sparkles } from "lucide-react";
import { CopyAddressButton } from "@/components/copy-address-button";
import { formatUsd } from "@/lib/format";
import type { WalletAsset } from "@/lib/types";

function AssetIcon({ asset }: { asset: WalletAsset }) {
  if (asset.logoUrl) {
    // Alchemy logos are remote and unpredictable, so a plain img avoids a broad Next image allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="asset-icon" src={asset.logoUrl} alt="" />;
  }
  return <span className={`asset-icon asset-fallback asset-${asset.symbol.toLowerCase()}`}>{asset.symbol.slice(0, 1)}</span>;
}

function AssetDetails({ asset }: { asset: WalletAsset }) {
  return (
    <span className="asset-details">
      <strong>{asset.symbol}</strong>
      <small>{asset.name}</small>
      {asset.tokenAddress ? (
        <span className="token-address" title={asset.tokenAddress}>
          <code>{asset.tokenAddress}</code>
          <CopyAddressButton address={asset.tokenAddress} label={asset.symbol} />
        </span>
      ) : (
        <small className="native-asset-label">Native Ethereum asset</small>
      )}
    </span>
  );
}

interface AssetListProps {
  assets: WalletAsset[];
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
}

export function AssetList({ assets, selected, onSelectedChange }: AssetListProps) {
  const [search, setSearch] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  const eligible = useMemo(() => assets.filter((asset) => asset.eligible), [assets]);
  const excluded = useMemo(() => assets.filter((asset) => !asset.eligible), [assets]);
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return eligible;
    return eligible.filter((asset) =>
      `${asset.name} ${asset.symbol} ${asset.tokenAddress ?? ""}`.toLowerCase().includes(query),
    );
  }, [eligible, search]);
  const allSelected = eligible.length > 0 && eligible.every((asset) => selected.has(asset.id));

  function toggle(asset: WalletAsset) {
    const next = new Set(selected);
    if (next.has(asset.id)) next.delete(asset.id);
    else next.add(asset.id);
    onSelectedChange(next);
  }

  function selectAll() {
    onSelectedChange(allSelected ? new Set() : new Set(eligible.map((asset) => asset.id)));
  }

  function deselectDust() {
    const next = new Set(selected);
    eligible.forEach((asset) => {
      if (asset.usdValue === null || asset.usdValue < 1) next.delete(asset.id);
    });
    onSelectedChange(next);
  }

  return (
    <div className="asset-browser">
      <div className="asset-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assets"
            aria-label="Search assets"
          />
        </label>
        <button className="button button-secondary button-small" onClick={deselectDust} type="button">
          <Sparkles size={15} /> Deselect under $1 + unpriced
        </button>
        <button className="button button-quiet button-small" onClick={selectAll} type="button">
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="table-heading" aria-hidden="true">
        <span>Asset</span><span>Balance</span><span>Value</span><span />
      </div>

      <div className="asset-rows">
        {filtered.map((asset) => {
          const checked = selected.has(asset.id);
          return (
            <div
              className={`asset-row ${checked ? "is-selected" : ""}`}
              key={asset.id}
            >
              <span className="asset-main">
                <button
                  className={`checkbox ${checked ? "is-checked" : ""}`}
                  onClick={() => toggle(asset)}
                  type="button"
                  aria-pressed={checked}
                  aria-label={`${checked ? "Deselect" : "Select"} ${asset.symbol}`}
                >
                  {checked && <Check size={13} />}
                </button>
                <AssetIcon asset={asset} />
                <AssetDetails asset={asset} />
              </span>
              <span className="asset-balance">
                <strong>{asset.formattedBalance}</strong>
                <small>{asset.symbol}</small>
              </span>
              <span className="asset-value">
                <strong>{formatUsd(asset.usdValue)}</strong>
                <small>{asset.usdPrice === null ? "Price unavailable" : `${formatUsd(asset.usdPrice)} each`}</small>
              </span>
              <span className="asset-route-cell"><span className="route-badge"><ShieldCheck size={13} /> StarkGate</span></span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-row">No eligible asset matches “{search}”.</div>
        )}
      </div>

      {excluded.length > 0 && (
        <div className="excluded-section">
          <button className="excluded-toggle" onClick={() => setShowExcluded((value) => !value)} type="button">
            <span><AlertTriangle size={15} /> {excluded.length} excluded {excluded.length === 1 ? "asset" : "assets"}</span>
            <span>Not selected <ChevronDown className={showExcluded ? "rotate" : ""} size={16} /></span>
          </button>
          {showExcluded && excluded.map((asset) => (
            <div className="excluded-row" key={asset.id}>
              <span className="asset-main"><AssetIcon asset={asset} /><AssetDetails asset={asset} /></span>
              <span>{formatUsd(asset.usdValue)}</span>
              <small>{asset.eligibilityReason}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
