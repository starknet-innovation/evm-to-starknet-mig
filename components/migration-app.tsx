"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ArrowRight, CheckCircle2, Database, LoaderCircle, LockKeyhole, MousePointer2, RefreshCcw, ShieldCheck } from "lucide-react";
import type { Address } from "viem";
import { AssetList } from "@/components/asset-list";
import { SiteHeader } from "@/components/brand";
import { DestinationStep } from "@/components/destination-step";
import { ReviewStep } from "@/components/review-step";
import { Stepper } from "@/components/stepper";
import { EvmWalletButton } from "@/components/wallet-button";
import { DEMO_EVM_ADDRESS } from "@/lib/constants";
import { formatUsd, shortenAddress } from "@/lib/format";
import type { AssetSelection, MigrationPlan, WalletAsset } from "@/lib/types";

type LoadState = "idle" | "loading" | "ready" | "error";
const ACTIVE_PLAN_STORAGE_KEY = "stark-crossing.activePlan";

export function MigrationApp() {
  const { address } = useAccount();
  const [demo, setDemo] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadedForAddress, setLoadedForAddress] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const sourceAddress = demo ? DEMO_EVM_ADDRESS : address;

  useEffect(() => {
    const savedPlanId = window.localStorage.getItem(ACTIVE_PLAN_STORAGE_KEY);
    if (!savedPlanId) return;
    void fetch(`/api/migrations/${savedPlanId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ plan: MigrationPlan }>;
      })
      .then(({ plan: savedPlan }) => {
        if (!savedPlan.ownershipVerifiedAt) return;
        setPlan(savedPlan);
        setDemo(savedPlan.demo);
        setActiveStep(3);
      })
      .catch(() => window.localStorage.removeItem(ACTIVE_PLAN_STORAGE_KEY));
  }, []);

  useEffect(() => {
    if (!sourceAddress || plan) return;
    const controller = new AbortController();
    void fetch(`/api/assets?address=${sourceAddress}&demo=${demo ? "1" : "0"}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as { assets?: WalletAsset[]; error?: string };
        if (!response.ok || !payload.assets) throw new Error(payload.error ?? "Unable to index wallet");
        return payload.assets;
      })
      .then((nextAssets) => {
        setAssets(nextAssets);
        setSelected(new Set(nextAssets.filter((asset) => asset.selectedByDefault).map((asset) => asset.id)));
        setLoadedForAddress(sourceAddress);
        setError(null);
        setLoadState("ready");
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Unable to index wallet");
        setLoadedForAddress(sourceAddress);
        setLoadState("error");
      });
    return () => controller.abort();
  }, [demo, plan, reloadKey, sourceAddress]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selected.has(asset.id)),
    [assets, selected],
  );
  const selectedTotal = selectedAssets.reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0);
  const selections: AssetSelection[] = selectedAssets.map((asset) => ({
    assetId: asset.id,
    balance: asset.balance,
    usdValue: asset.usdValue,
  }));

  function startDemo() {
    setPlan(null);
    setDemo(true);
    setActiveStep(1);
  }

  function exitDemo() {
    setDemo(false);
    setAssets([]);
    setSelected(new Set());
    setLoadState("idle");
    setLoadedForAddress(null);
    setPlan(null);
    setActiveStep(1);
    window.localStorage.removeItem(ACTIVE_PLAN_STORAGE_KEY);
  }

  function handleVerified(nextPlan: MigrationPlan) {
    setPlan(nextPlan);
    setActiveStep(3);
    window.localStorage.setItem(ACTIVE_PLAN_STORAGE_KEY, nextPlan.id);
  }

  const connected = Boolean(sourceAddress);
  const visibleLoadState =
    sourceAddress && loadedForAddress !== sourceAddress ? "loading" : loadState;

  return (
    <main>
      <SiteHeader />
      <div className="app-shell">
        <div className="top-row">
          <Stepper activeStep={activeStep} />
          {connected && (
            <div className="source-account">
              {demo ? <><span className="demo-dot" /><span className="source-label">Demo wallet · {shortenAddress(DEMO_EVM_ADDRESS)}</span></> : <EvmWalletButton compact />}
              {demo && <button onClick={exitDemo} type="button">Exit demo</button>}
            </div>
          )}
        </div>

        {!connected ? (
          <section className="welcome-panel">
            <div className="welcome-copy">
              <span className="hero-kicker"><ShieldCheck size={15} /> Ethereum → Starknet, without shortcuts</span>
              <h1>Move what matters.<br /><em>Keep control.</em></h1>
              <p>See every eligible asset, verify the exact destination, and migrate through the official StarkGate contracts.</p>
              <div className="trust-strip">
                <span><LockKeyhole size={15} /> Self-custodial</span>
                <span><CheckCircle2 size={15} /> Exact approvals</span>
                <span><Database size={15} /> Resume anytime</span>
              </div>
            </div>
            <div className="connect-card">
              <span className="connect-illustration"><span className="chain-orb eth-orb">Ξ</span><i /><span className="chain-orb starknet-orb">S</span></span>
              <small>Step 1 of 3</small>
              <h2>Connect your Ethereum wallet</h2>
              <p>We’ll privately index your mainnet ETH and ERC-20 balances. Connecting never gives us permission to move them.</p>
              <EvmWalletButton />
              <button className="demo-button" onClick={startDemo} type="button"><MousePointer2 size={15} /> Explore with a demo wallet</button>
              <span className="connect-footnote">Rabby and MetaMask work immediately · add WalletConnect via environment config</span>
            </div>
          </section>
        ) : activeStep === 1 ? (
          <section className="flow-panel assets-panel">
            <div className="section-eyebrow"><span>01</span> Ethereum assets</div>
            <div className="assets-heading">
              <div><h1>Choose what makes the move.</h1><p>Every eligible, non-spam asset starts selected. Unsupported assets stay visible but never enter the migration plan.</p></div>
              {visibleLoadState === "ready" && <div className="portfolio-total"><small>Eligible portfolio</small><strong>{formatUsd(assets.filter((asset) => asset.eligible).reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0), true)}</strong></div>}
            </div>

            {(visibleLoadState === "loading" || visibleLoadState === "idle") && (
              <div className="loading-state"><LoaderCircle className="spin" size={24} /><strong>Indexing Ethereum mainnet…</strong><span>Matching balances with active StarkGate routes and current USD prices.</span></div>
            )}
            {visibleLoadState === "error" && (
              <div className="error-state"><strong>We couldn’t load this wallet.</strong><span>{error}</span><button className="button button-secondary" onClick={() => { setLoadedForAddress(null); setReloadKey((value) => value + 1); }} type="button"><RefreshCcw size={15} /> Try again</button></div>
            )}
            {visibleLoadState === "ready" && <AssetList assets={assets} selected={selected} onSelectedChange={setSelected} />}

            {visibleLoadState === "ready" && (
              <div className="selection-footer">
                <div><span className="selection-count"><CheckCircle2 size={17} /> {selectedAssets.length} {selectedAssets.length === 1 ? "asset" : "assets"} selected</span><small>ETH gas reserve is calculated before signing</small></div>
                <div><span><small>Estimated value</small><strong>{formatUsd(selectedTotal)}</strong></span><button className="button button-primary button-large" disabled={selected.size === 0} onClick={() => setActiveStep(2)} type="button">Choose destination <ArrowRight size={17} /></button></div>
              </div>
            )}
          </section>
        ) : activeStep === 2 && sourceAddress ? (
          <DestinationStep evmAddress={sourceAddress as Address} selections={selections} demo={demo} onBack={() => setActiveStep(1)} onVerified={handleVerified} />
        ) : plan ? (
          <ReviewStep plan={plan} onPlanChange={setPlan} onBack={() => setActiveStep(2)} />
        ) : null}

        <footer className="site-footer"><span>Powered by StarkGate</span><span>Non-custodial · Ethereum Mainnet · Starknet Mainnet</span></footer>
      </div>
    </main>
  );
}
