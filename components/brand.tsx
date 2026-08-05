import { ArrowUpRight } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/constants";

export function Brand() {
  return (
    <div className="brand" aria-label={PRODUCT_NAME}>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{PRODUCT_NAME}</span>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Brand />
      <div className="header-meta">
        <span className="network-pill"><i /> Mainnet</span>
        <a href="https://docs.starknet.io/learn/protocol/starkgate" target="_blank" rel="noreferrer">
          How it works <ArrowUpRight size={14} />
        </a>
      </div>
    </header>
  );
}
