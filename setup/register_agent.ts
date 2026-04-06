/**
 * Circle wallet'ları Arc IdentityRegistry'e kayıt eder.
 *
 * Kullanım:
 *   node --env-file=../.env --import=tsx register_agent.ts
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const METADATA_URI      = "ipfs://QmAgentBountyProtocol";

async function registerWallet(
  client: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  walletId: string,
  label: string,
) {
  console.log(`\n${label} kayıt ediliyor... (wallet: ${walletId})`);

  const resp = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: IDENTITY_REGISTRY,
    abiFunctionSignature: "register(string)",
    abiParameters: [METADATA_URI],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txId = (resp.data as any)?.id ?? (resp as any)?.data?.id;
  if (!txId) {
    console.error("TX ID alınamadı:", JSON.stringify(resp.data));
    return;
  }
  console.log("TX ID:", txId);

  // Tamamlanana kadar bekle
  const terminal = new Set(["COMPLETE", "FAILED", "CANCELLED", "DENIED"]);
  let state = (resp.data as any)?.state as string | undefined;

  while (!state || !terminal.has(state)) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await client.getTransaction({ id: txId });
    state = (poll.data?.transaction as any)?.state;
    console.log("  Durum:", state);
  }

  if (state === "COMPLETE") {
    console.log(`${label} kayıt edildi ✓`);
  } else {
    console.error(`${label} TX başarısız: ${state}`);
  }
}

async function main() {
  const apiKey        = process.env.CIRCLE_API_KEY;
  const entitySecret  = process.env.CIRCLE_ENTITY_SECRET;
  const agentId       = process.env.CIRCLE_WALLET_ID;
  const evaluatorId   = process.env.CIRCLE_EVALUATOR_WALLET_ID;

  if (!apiKey || !entitySecret) throw new Error("CIRCLE_API_KEY veya CIRCLE_ENTITY_SECRET eksik");
  if (!agentId || !evaluatorId) throw new Error("CIRCLE_WALLET_ID veya CIRCLE_EVALUATOR_WALLET_ID eksik");

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  await registerWallet(client, agentId, "Agent");
  await registerWallet(client, evaluatorId, "Evaluator");

  console.log("\nHer iki wallet kayıt edildi. Artık task alabilirler.");
}

main().catch((err) => {
  console.error("Hata:", err.message || err);
  process.exit(1);
});
