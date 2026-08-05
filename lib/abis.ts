export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

export const starkGateFeeAbi = [
  {
    type: "function",
    name: "estimateDepositFeeWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "fee", type: "uint256" }],
  },
] as const;

export const starkGateLegacyDepositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "l2Recipient", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const starkGateMultiDepositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "l2Recipient", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
