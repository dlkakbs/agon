/**
 * Recovery file kullanarak entity secret'ı reset eder.
 * Usage: node --env-file=../.env reset-secret.mjs
 */

import { readFileSync } from "fs";
import pkg from "@circle-fin/developer-controlled-wallets";
const { initiateDeveloperControlledWalletsClient } = pkg;

const apiKey       = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
// Recovery file path: register-secret.mjs tarafından ./output/ altına yazılır.
// En son oluşturulan dosyayı otomatik bul.
import { readdirSync } from "fs";
import { join } from "path";

const outputDir = "../setup/output";
const files = readdirSync(outputDir)
  .filter((f) => f.startsWith("recovery_file_") && f.endsWith(".dat"))
  .sort()
  .reverse();

if (files.length === 0) {
  console.error("Hata: setup/output/ içinde recovery_file_*.dat bulunamadı.");
  console.error("Önce node evaluator/register-secret.mjs çalıştırın.");
  process.exit(1);
}

const recoveryFilePath = join(outputDir, files[0]);
console.log(`Recovery file: ${recoveryFilePath}`);

if (!apiKey || !entitySecret) {
  console.error("CIRCLE_API_KEY ve CIRCLE_ENTITY_SECRET gerekli");
  process.exit(1);
}

// Recovery file içeriğini oku
const recoveryFileContent = readFileSync(recoveryFilePath, "utf-8");

// Circle public key al ve yeni ciphertext oluştur
import crypto from "crypto";
const { publicEncrypt, constants } = crypto;

// 1. Public key al
const pubKeyResp = await fetch("https://api.circle.com/v1/w3s/config/entity/publicKey", {
  headers: { Authorization: `Bearer ${apiKey}` }
});
const { data: { publicKey } } = await pubKeyResp.json();
console.log("Public key alındı ✓");

// 2. Yeni entity secret'ı RSA-OAEP ile şifrele
const encrypted = publicEncrypt(
  { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
  Buffer.from(entitySecret, "hex")
);
const ciphertext = encrypted.toString("base64");
console.log("Ciphertext oluşturuldu ✓");

// 3. Reset isteği gönder
console.log("Entity Secret reset ediliyor...");
const resetResp = await fetch("https://api.circle.com/v1/w3s/config/entity/secret", {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    currentEntitySecretCiphertext: recoveryFileContent.trim(),
    newEntitySecretCiphertext: ciphertext,
  }),
});

const result = await resetResp.json();
console.log("Response:", JSON.stringify(result, null, 2));

if (resetResp.ok) {
  console.log("\nBaşarılı! Entity Secret reset edildi.");
} else {
  console.error("\nHata:", result);
}
