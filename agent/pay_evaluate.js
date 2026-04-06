/**
 * Agon — Nanopayment Buyer
 *
 * Worker agent, evaluator gateway'e $0.001 USDC nanopayment yaparak
 * task değerlendirmesini tetikler. Python agent tarafından subprocess ile çağrılır.
 *
 * Usage:
 *   node pay_evaluate.js --task-id=1 --title="..." --description="..." --result="..."
 *
 * Stdout: JSON verdict  { verdict, score, reason, txHash }
 * Exit 0: success  |  Exit 1: failure
 */

require("dotenv").config({ path: "../.env" });

const { GatewayClient } = require("@circle-fin/x402-batching/client");

// ── Args ──────────────────────────────────────────────────────────────────────

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const taskId      = arg("task-id");
const title       = arg("title") || "";
const description = arg("description") || "";
const resultText  = arg("result") || "";
const gatewayUrl  = process.env.GATEWAY_URL || "http://localhost:4242";

if (!taskId || !resultText) {
  process.stderr.write("ERROR: --task-id and --result are required\n");
  process.exit(1);
}

// ── GatewayClient ─────────────────────────────────────────────────────────────

async function main() {
  const client = new GatewayClient({
    chain: "arcTestnet",
    privateKey: process.env.PRIVATE_KEY,
  });

  // Deposit if Gateway balance is low (one-time on-chain tx)
  const balances = await client.getBalances();
  const MIN_BALANCE = 100_000n; // 0.0001 USDC in base units (18 dec)

  if (balances.gateway.available < MIN_BALANCE) {
    process.stderr.write(`[nanopay] Low gateway balance (${balances.gateway.formattedAvailable} USDC), depositing 1 USDC...\n`);
    await client.deposit("1");
    process.stderr.write("[nanopay] Deposit complete.\n");
  }

  process.stderr.write(`[nanopay] Paying $0.001 USDC to evaluate task #${taskId}...\n`);

  const { data, status } = await client.pay(`${gatewayUrl}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, title, description, resultText }),
  });

  if (status !== 200) {
    process.stderr.write(`ERROR: Gateway returned status ${status}\n`);
    process.exit(1);
  }

  // Output verdict as JSON to stdout — Python agent reads this
  process.stdout.write(JSON.stringify(data) + "\n");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
});
