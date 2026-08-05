import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetList } from "@/components/asset-list";
import { demoAssets } from "@/lib/demo";

describe("AssetList", () => {
  it("deselects eligible holdings worth less than one dollar or without a price", () => {
    const onSelectedChange = vi.fn();
    const unpriced = {
      ...demoAssets.find((asset) => asset.symbol === "USDT")!,
      id: "erc20-unpriced",
      symbol: "UNPRICED",
      usdPrice: null,
      usdValue: null,
    };
    const assets = [...demoAssets, unpriced];
    const selected = new Set(
      assets.filter((asset) => asset.selectedByDefault).map((asset) => asset.id),
    );
    render(
      <AssetList
        assets={assets}
        selected={selected}
        onSelectedChange={onSelectedChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /deselect under \$1 \+ unpriced/i }));

    const next = onSelectedChange.mock.calls[0][0] as Set<string>;
    expect(next.has("erc20-usdt-dust")).toBe(false);
    expect(next.has("erc20-unpriced")).toBe(false);
    expect(next.has("native-eth")).toBe(true);
  });

  it("shows and copies the full ERC-20 address", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const usdc = demoAssets.find((asset) => asset.symbol === "USDC")!;

    render(
      <AssetList
        assets={demoAssets}
        selected={new Set()}
        onSelectedChange={() => undefined}
      />,
    );

    expect(screen.getByTitle(usdc.tokenAddress!)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy full token address for USDC" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(usdc.tokenAddress));
  });

  it("keeps unsupported and suspicious holdings visible but excluded", () => {
    render(
      <AssetList
        assets={demoAssets}
        selected={new Set()}
        onSelectedChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /1 excluded asset/i }));
    expect(screen.getByText("PEPEF")).toBeInTheDocument();
    expect(screen.getByText("Not supported by StarkGate")).toBeInTheDocument();
  });
});
