"use client";

import { useState, type ReactNode } from "react";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { GetStarknetProvider } from "@starknet-io/get-starknet-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { mainnet } from "viem/chains";
import { createConfig, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { PRODUCT_NAME } from "@/lib/constants";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const sharedConfig = {
  chains: [mainnet] as const,
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
  },
  ssr: true,
};

// WalletConnect's project id is optional for local/injected-wallet use.
// Once configured, RainbowKit supplies its full WalletConnect connector set.
export const wagmiConfig = walletConnectProjectId
  ? getDefaultConfig({
      appName: PRODUCT_NAME,
      projectId: walletConnectProjectId,
      ...sharedConfig,
    })
  : createConfig({
      ...sharedConfig,
      connectors: [injected()],
    });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <GetStarknetProvider>{children}</GetStarknetProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
