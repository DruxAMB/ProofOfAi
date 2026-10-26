export const NET = {
  name: "BOT Chain",
  rpc: process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.botchain.ai",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "677"),
  explorer: process.env.NEXT_PUBLIC_EXPLORER ?? "https://scan.botchain.ai",
};
