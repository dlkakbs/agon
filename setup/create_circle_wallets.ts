/**
 * Agon — Circle Developer-Controlled Wallet Kurulumu
 *
 * 1. Entity Secret oluşturur ve Circle'a kayıt eder
 * 2. Agent + Evaluator wallet oluşturur (Arc Testnet)
 * 3. Agon .env'e gerekli değerleri yazar
 *
 * Kullanım:
 *   CIRCLE_API_KEY=TEST_API_KEY:...:... node --import=tsx create_circle_wallets.ts
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerEntitySecretCiphertext,
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV   = path.join(__dirname, "..", ".env");
const OUTPUT_DIR = path.join(__dirname, "output");

function appendEnv(key: string, value: string) {
  const content = fs.existsSync(ROOT_ENV) ? fs.readFileSync(ROOT_ENV, "utf-8") : "";
  if (content.includes(`${key}=`)) {
    // Güncelle
    fs.writeFileSync(ROOT_ENV, content.replace(new RegExp(`${key}=.*`), `${key}=${value}`));
  } else {
    fs.appendFileSync(ROOT_ENV, `\n${key}=${value}`);
  }
}

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("CIRCLE_API_KEY eksik");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── 1. Entity Secret ──────────────────────────────────────────────────────
  console.log("Entity Secret oluşturuluyor ve kayıt ediliyor...");
  const entitySecret = crypto.randomBytes(32).toString("hex");

  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: OUTPUT_DIR,
  });

  appendEnv("CIRCLE_ENTITY_SECRET", entitySecret);
  appendEnv("CIRCLE_BLOCKCHAIN", "ARC-TESTNET");
  console.log("Entity Secret kayıt edildi ✓");
  console.log(`⚠️  Kurtarma dosyası: ${OUTPUT_DIR}/`);

  // ── 2. SDK client ─────────────────────────────────────────────────────────
  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  // ── 3. Wallet Set ─────────────────────────────────────────────────────────
  console.log("\nWallet Set oluşturuluyor...");
  const walletSet = (await client.createWalletSet({ name: "Agon-WalletSet" })).data?.walletSet;
  if (!walletSet?.id) throw new Error("Wallet Set oluşturulamadı");
  console.log("Wallet Set ID:", walletSet.id);

  // ── 4. Agent + Evaluator wallet ───────────────────────────────────────────
  console.log("\nAgent ve Evaluator wallet oluşturuluyor (Arc Testnet)...");
  const wallets = (await client.createWallets({
    walletSetId: walletSet.id,
    blockchains: ["ARC-TESTNET"],
    count: 2,
    accountType: "EOA",
    metadata: [
      { name: "agon-agent",     refId: "agon-agent"     },
      { name: "agon-evaluator", refId: "agon-evaluator" },
    ],
  })).data?.wallets;

  if (!wallets || wallets.length < 2) throw new Error("Wallet oluşturulamadı");

  const agentWallet     = wallets[0];
  const evaluatorWallet = wallets[1];

  appendEnv("CIRCLE_WALLET_ID",           agentWallet.id);
  appendEnv("CIRCLE_EVALUATOR_WALLET_ID", evaluatorWallet.id);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "agon-wallets.json"),
    JSON.stringify({ agent: agentWallet, evaluator: evaluatorWallet }, null, 2),
  );

  // ── 5. Özet ──────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(55));
  console.log("Kurulum tamamlandı!\n");
  console.log("Agent wallet:");
  console.log("  ID     :", agentWallet.id);
  console.log("  Adres  :", agentWallet.address);
  console.log("\nEvaluator wallet:");
  console.log("  ID     :", evaluatorWallet.id);
  console.log("  Adres  :", evaluatorWallet.address);
  console.log("\n.env güncellendi ✓");
  console.log("=".repeat(55));
  console.log("\nSonraki adımlar:");
  console.log("1. Her iki adrese Arc Testnet faucet'ten USDC gönder:");
  console.log("   https://faucet.circle.com → Arc Testnet");
  console.log(`   Agent    : ${agentWallet.address}`);
  console.log(`   Evaluator: ${evaluatorWallet.address}`);
  console.log("\n2. Agent adresini IdentityRegistry'e kayıt et:");
  console.log(`   cast send 0x8004A818BFB912233c491871b3d84c89A494BD9e \\`);
  console.log(`     "register(string)(uint256)" "ipfs://QmAgentBountyProtocol" \\`);
  console.log(`     --from ${agentWallet.address} --rpc-url https://rpc.testnet.arc.network`);
}

main().catch((err) => {
  console.error("Hata:", err.message || err);
  process.exit(1);
});
