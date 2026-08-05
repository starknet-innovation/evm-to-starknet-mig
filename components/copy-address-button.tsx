"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyAddressButton({
  address,
  label,
}: {
  address: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      const input = document.createElement("textarea");
      input.value = address;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <button
      className="copy-address-button"
      onClick={copyAddress}
      aria-label={`Copy full token address for ${label}`}
      title={`Copy ${address}`}
      type="button"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
