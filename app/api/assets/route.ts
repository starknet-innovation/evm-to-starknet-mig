import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getEthereumAssets } from "@/lib/alchemy";
import { demoAssets } from "@/lib/demo";

export const runtime = "nodejs";

function demoAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_MODE === "true";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const demo = url.searchParams.get("demo") === "1";
  const address = url.searchParams.get("address");

  if (demo) {
    if (!demoAllowed()) {
      return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 });
    }
    return NextResponse.json({ assets: demoAssets, source: "demo" });
  }

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid Ethereum address is required" }, { status: 400 });
  }

  try {
    const assets = await getEthereumAssets(getAddress(address));
    return NextResponse.json({ assets, source: "alchemy" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to index wallet assets";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
