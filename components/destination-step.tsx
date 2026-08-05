"use client";

import { useState } from "react";
import {
  StarknetWalletApi,
  useConnect,
  WalletConnectModal,
} from "@starknet-io/get-starknet-ui";
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, ShieldCheck, Signature } from "lucide-react";
import type { Address } from "viem";
import { DEMO_STARKNET_ADDRESS } from "@/lib/constants";
import { shortenAddress } from "@/lib/format";
import type { AssetSelection, MigrationPlan, OwnershipChallenge } from "@/lib/types";

type Phase = "idle" | "planning" | "signing" | "verifying";

interface DestinationStepProps {
  evmAddress: Address;
  selections: AssetSelection[];
  demo: boolean;
  onBack: () => void;
  onVerified: (plan: MigrationPlan) => void;
}

interface WalletSignRequest {
  (request: { type: "wallet_signTypedData"; params: Record<string, unknown> }): Promise<string[]>;
}

async function jsonRequest<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

export function DestinationStep({
  evmAddress,
  selections,
  demo,
  onBack,
  onVerified,
}: DestinationStepProps) {
  const { connected } = useConnect();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const starknetAddress = demo ? DEMO_STARKNET_ADDRESS : connected?.accounts[0]?.address;
  const busy = phase !== "idle";

  async function verifyOwnership() {
    if (!starknetAddress) return;
    setError(null);
    try {
      setPhase("planning");
      const { plan } = await jsonRequest<{ plan: MigrationPlan }>("/api/migrations", {
        evmAddress,
        starknetAddress,
        selections,
        demo,
      });
      const { challenge } = await jsonRequest<{ challenge: OwnershipChallenge }>(
        "/api/ownership/challenge",
        { planId: plan.id },
      );

      let signature: string[];
      if (demo) {
        setPhase("signing");
        signature = ["demo-signature"];
      } else {
        if (!connected) throw new Error("Connect a Starknet wallet first");
        setPhase("signing");
        const request = connected.features[StarknetWalletApi].request as unknown as WalletSignRequest;
        signature = await request({
          type: "wallet_signTypedData",
          params: challenge.typedData,
        });
      }

      setPhase("verifying");
      const verified = await jsonRequest<{ verified: boolean; plan: MigrationPlan }>(
        "/api/ownership/verify",
        { challengeId: challenge.id, signature },
      );
      onVerified(verified.plan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to verify this account");
      setPhase("idle");
    }
  }

  const phaseLabel =
    phase === "planning"
      ? "Checking routes and balances…"
      : phase === "signing"
        ? "Confirm in your Starknet wallet…"
        : "Verifying account signature…";

  return (
    <section className="flow-panel destination-panel">
      <div className="section-eyebrow"><span>02</span> Destination</div>
      <div className="destination-heading">
        <div>
          <h1>Where should your assets arrive?</h1>
          <p>Connect the Starknet account you control. You’ll sign a readable message—no transaction or fee—to prove it belongs to you.</p>
        </div>
        <span className="security-seal"><ShieldCheck size={17} /> Ownership required</span>
      </div>

      <div className="destination-grid">
        <div className={`destination-card ${starknetAddress ? "is-connected" : ""}`}>
          <div className="destination-card-top">
            <span className="chain-orb starknet-orb">S</span>
            <span><small>Destination network</small><strong>Starknet Mainnet</strong></span>
            {starknetAddress && <CheckCircle2 className="connected-check" size={20} />}
          </div>

          {demo ? (
            <div className="connected-account"><span className="wallet-identicon starknet-identicon">D</span><span><small>Demo Starknet account</small><strong>{shortenAddress(DEMO_STARKNET_ADDRESS, 10, 8)}</strong></span></div>
          ) : starknetAddress ? (
            <div className="connected-account"><span className="wallet-identicon starknet-identicon">S</span><span><small>Connected account</small><strong>{shortenAddress(starknetAddress, 10, 8)}</strong></span></div>
          ) : (
            <div className="wallet-connect-area">
              <WalletConnectModal buttonClassName="starknet-connect-button" sortAlgorithm="recommended" />
              <small>Ready, Braavos, and compatible Starknet wallets</small>
            </div>
          )}
        </div>

        <div className="proof-card">
          <div className="proof-icon"><Signature size={22} /></div>
          <div>
            <strong>What you’ll sign</strong>
            <p>“I control this Starknet account and approve it as my migration destination.”</p>
          </div>
          <ul>
            <li><CheckCircle2 size={14} /> Bound to this exact migration plan</li>
            <li><CheckCircle2 size={14} /> Expires after 10 minutes</li>
            <li><CheckCircle2 size={14} /> Cannot move funds</li>
          </ul>
        </div>
      </div>

      <div className="trust-note"><LockKeyhole size={16} /><span><strong>Your keys never leave your wallets.</strong> The signature is checked against your deployed Starknet account contract.</span></div>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="panel-actions">
        <button className="button button-quiet" onClick={onBack} disabled={busy} type="button">Back</button>
        <button className="button button-primary button-large" onClick={verifyOwnership} disabled={!starknetAddress || busy} type="button">
          {busy ? <><LoaderCircle className="spin" size={17} /> {phaseLabel}</> : <>Sign ownership proof <ArrowRight size={17} /></>}
        </button>
      </div>
    </section>
  );
}
