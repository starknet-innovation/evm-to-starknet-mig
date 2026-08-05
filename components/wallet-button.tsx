"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, Wallet } from "lucide-react";
import { shortenAddress } from "@/lib/format";

export function EvmWalletButton({ compact = false }: { compact?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <button className={compact ? "wallet-chip" : "button button-primary"} onClick={openConnectModal} type="button">
              <Wallet size={compact ? 15 : 17} />
              Connect Ethereum wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button className="button button-danger" onClick={openChainModal} type="button">
              Switch to Ethereum
            </button>
          );
        }

        return (
          <button className="wallet-chip" onClick={openAccountModal} type="button">
            <span className="wallet-identicon">{account.displayName.slice(0, 1)}</span>
            <span>{compact ? shortenAddress(account.address) : account.displayName}</span>
            <ChevronDown size={14} />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
