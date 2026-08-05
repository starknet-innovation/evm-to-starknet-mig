"use client";

import { useMemo, useState } from "react";
import { useWalletClient } from "wagmi";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { formatUnits } from "viem";
import { actionProgress, executeMigration } from "@/lib/client-execution";
import { CopyAddressButton } from "@/components/copy-address-button";
import { formatUsd, shortenAddress } from "@/lib/format";
import type { MigrationAction, MigrationPlan } from "@/lib/types";

function ActionIcon({ action }: { action: MigrationAction }) {
  if (action.status === "confirmed") return <Check size={13} />;
  if (action.status === "awaiting-wallet" || action.status === "submitted") {
    return <LoaderCircle className="spin" size={13} />;
  }
  if (action.status === "failed") return <TriangleAlert size={13} />;
  return <Circle size={11} />;
}

export function ReviewStep({
  plan,
  onPlanChange,
  onBack,
}: {
  plan: MigrationPlan;
  onPlanChange: (plan: MigrationPlan) => void;
  onBack: () => void;
}) {
  const { data: walletClient } = useWalletClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const progress = actionProgress(plan.actions);
  const uniqueApprovals = plan.actions.filter((action) => action.type === "approval").length;
  const complete = plan.status === "completed";
  const submitted = plan.status === "submitted";
  const executionEnabled = plan.demo || process.env.NEXT_PUBLIC_ENABLE_MAINNET_EXECUTION === "true";
  const totalFeesEth = useMemo(
    () => Number(formatUnits(BigInt(plan.messagingFeesWei), 18)),
    [plan.messagingFeesWei],
  );

  async function execute() {
    setError(null);
    setBusy(true);
    try {
      await executeMigration(plan, walletClient, { onPlan: onPlanChange });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Migration submission failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyHash() {
    await navigator.clipboard.writeText(plan.planHash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  if (complete || submitted) {
    return (
      <section className="flow-panel result-panel">
        <div className="result-mark">{complete ? <CheckCircle2 size={34} /> : <Clock3 size={32} />}</div>
        <div className="section-eyebrow"><span>03</span> Migration submitted</div>
        <h1>{plan.demo ? "Demo migration complete." : complete ? "Your migration is on its way." : "Your wallet accepted the migration."}</h1>
        <p>
          {plan.demo
            ? "This preview simulated every wallet action and progress checkpoint. No transaction was sent."
            : <>{plan.executionMode === "batch"
                ? "The wallet is processing the call bundle. "
                : "The Ethereum deposits are confirmed. "}StarkGate begins L1→L2 delivery after Ethereum confirmation; timing varies with network conditions.</>}
        </p>
        <div className="result-route">
          <div><small>From Ethereum</small><strong>{shortenAddress(plan.evmAddress, 8, 6)}</strong></div>
          <ArrowRight size={18} />
          <div><small>To Starknet</small><strong>{shortenAddress(plan.starknetAddress, 10, 8)}</strong></div>
        </div>
        <div className="result-stats">
          <div><small>Assets</small><strong>{plan.assets.length}</strong></div>
          <div><small>Estimated value</small><strong>{formatUsd(plan.totalUsd)}</strong></div>
          <div><small>Execution</small><strong>{plan.executionMode === "batch" ? "Wallet batch" : "Sequential"}</strong></div>
        </div>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="result-actions">
          {submitted && plan.executionMode === "batch" && (
            <button className="button button-primary" onClick={execute} disabled={busy} type="button">
              {busy ? <><LoaderCircle className="spin" size={15} /> Checking wallet…</> : <>Refresh batch status</>}
            </button>
          )}
          <a className="button button-secondary" href="https://starkgate.starknet.io/bridge/activity" target="_blank" rel="noreferrer">
            Open StarkGate activity <ExternalLink size={15} />
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="flow-panel review-panel">
      <div className="section-eyebrow"><span>03</span> Final review</div>
      <div className="review-heading">
        <div><h1>Review every move.</h1><p>Your wallet will show these exact approvals and StarkGate deposits before anything leaves Ethereum.</p></div>
        <span className="security-seal"><ShieldCheck size={17} /> Destination verified</span>
      </div>

      <div className="account-route">
        <div><span className="chain-orb eth-orb">Ξ</span><span><small>From Ethereum</small><strong>{shortenAddress(plan.evmAddress, 9, 6)}</strong></span></div>
        <span className="route-line"><ArrowRight size={17} /></span>
        <div><span className="chain-orb starknet-orb">S</span><span><small>To Starknet</small><strong>{shortenAddress(plan.starknetAddress, 11, 7)}</strong></span></div>
      </div>

      <div className="review-layout">
        <div className="review-main">
          <div className="review-block">
            <div className="review-block-title"><span>Assets to migrate</span><span>{plan.assets.length} selected</span></div>
            {plan.assets.map((asset) => (
              <div className="review-asset" key={asset.id}>
                <span className={`asset-icon asset-fallback asset-${asset.symbol.toLowerCase()}`}>{asset.symbol.slice(0, 1)}</span>
                <span>
                  <strong>{asset.formattedAmount} {asset.symbol}</strong>
                  <small>{asset.name}</small>
                  {asset.tokenAddress ? (
                    <span className="token-address" title={asset.tokenAddress}>
                      <code>{asset.tokenAddress}</code>
                      <CopyAddressButton address={asset.tokenAddress} label={asset.symbol} />
                    </span>
                  ) : <small className="native-asset-label">Native Ethereum asset</small>}
                </span>
                <strong>{formatUsd(asset.usdValue)}</strong>
              </div>
            ))}
            <div className="review-total"><span>Estimated migration value</span><strong>{formatUsd(plan.totalUsd)}</strong></div>
          </div>

          <div className="review-block">
            <div className="review-block-title"><span>Wallet actions</span><span>{progress.complete} of {progress.total} confirmed</span></div>
            <div className="action-list">
              {plan.actions.map((action, index) => (
                <div className={`action-row status-${action.status}`} key={action.id}>
                  <span className="action-index"><ActionIcon action={action} /></span>
                  <span><strong>{action.label}</strong><small>{action.type === "approval" ? "Exact amount only" : "Official StarkGate contract"}</small></span>
                  <small>{index + 1}/{plan.actions.length}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="review-sidebar">
          <div className="cost-card">
            <h2>Cost & safeguards</h2>
            <dl>
              <div><dt>Starknet message fees</dt><dd>~{totalFeesEth.toFixed(5)} ETH</dd></div>
              <div><dt>Ethereum gas reserve</dt><dd>{Number(formatUnits(BigInt(plan.gasReserveWei), 18)).toFixed(3)} ETH</dd></div>
              <div><dt>Token approvals</dt><dd>{uniqueApprovals} exact</dd></div>
              <div><dt>Bridge</dt><dd>StarkGate</dd></div>
            </dl>
            <p><LockKeyhole size={14} /> The reserve remains in your Ethereum wallet and is never transferred to us.</p>
          </div>
          <div className="proof-summary">
            <FileCheck2 size={18} />
            <div><strong>Ownership proof valid</strong><small>Bound to plan {shortenAddress(plan.planHash, 8, 6)}</small></div>
            <button onClick={copyHash} aria-label="Copy migration plan hash" type="button">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          </div>
          {!executionEnabled && !plan.demo && (
            <div className="execution-lock"><TriangleAlert size={16} /><span><strong>Mainnet writes are locked.</strong> Enable them only after staging verification.</span></div>
          )}
        </aside>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="panel-actions review-actions">
        <button className="button button-quiet" onClick={onBack} disabled={busy} type="button">Back</button>
        <div><small>{plan.demo ? "Safe interactive preview" : "Your wallet decides whether calls can be batched"}</small><button className="button button-primary button-large" onClick={execute} disabled={busy || !executionEnabled} type="button">{busy ? <><LoaderCircle className="spin" size={17} /> Follow your wallet…</> : <>Start migration <ArrowRight size={17} /></>}</button></div>
      </div>
    </section>
  );
}
