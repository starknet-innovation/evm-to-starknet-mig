import type { Address } from "viem";

export const ETHEREUM_CHAIN_ID = 1;
export const ETHEREUM_CHAIN_ID_HEX = "0x1";
export const STARKNET_CHAIN_ID = "SN_MAIN";

export const STARKGATE_MULTI_BRIDGE =
  "0xF5b6Ee2CAEb6769659f6C091D209DfdCaF3F69Eb" as Address;
export const STARKGATE_ETH_BRIDGE =
  "0xae0Ee0A63A2cE6BaeEFFE56e7714FB4EFE48D419" as Address;
export const STARKGATE_ETH_TOKEN =
  "0x0000000000000000000000000000000000455448" as Address;

export const STARKGATE_TOKEN_LIST_URL =
  "https://raw.githubusercontent.com/starknet-io/starknet-addresses/master/bridged_tokens/mainnet.json";

export const DEFAULT_ETH_GAS_RESERVE_WEI = 15_000_000_000_000_000n;
export const CHALLENGE_TTL_SECONDS = 10 * 60;

export const DEMO_EVM_ADDRESS =
  "0x7e57a8d989a1cec61f7b2e48ef45dcd4b61f6c92" as Address;
export const DEMO_STARKNET_ADDRESS =
  "0x04d4f0a44d2a5bd6d7cae11a7e7f4824f0b515891f611e1b80c2d01d85b9e57a";

export const PRODUCT_NAME = "Stark Crossing";
