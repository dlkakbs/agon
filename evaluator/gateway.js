/**
 * Agon — Evaluator Gateway
 *
 * x402-protected HTTP endpoint. Worker agent pays $0.001 USDC per evaluation.
 * Receives task data, evaluates with GPT-4o, calls approveResult / rejectResult on-chain.
 *
 * Usage: node gateway.js
 */

require("dotenv").config({ path: "../.env" });

const express = require("express");
const { createGatewayMiddleware } = require("@circle-fin/x402-batching/server");
const OpenAI = require("openai").default;
const { createWalletClient, createPublicClient, http, parseAbi } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

// ── Config ────────────────────────────────────────────────────────────────────

const PORT              = parseInt(process.env.GATEWAY_PORT || "4242");
const RPC_URL           = process.env.RPC_URL;
const BOUNTY_REGISTRY   = process.env.BOUNTY_REGISTRY;
const EVALUATOR_KEY     = process.env.EVALUATOR_PRIVATE_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const EVALUATION_PRICE  = "0.001"; // USDC per evaluation

// Arc Testnet chain definition
const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

// ── Clients ───────────────────────────────────────────────────────────────────

const account = privateKeyToAccount(EVALUATOR_KEY);

const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC_URL),
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const REGISTRY_ABI = parseAbi([
  "function approveResult(uint256 id) external",
  "function rejectResult(uint256 id) external",
]);

// ── GPT-4o evaluation ─────────────────────────────────────────────────────────

async function evaluate(task) {
  const prompt = `You are a neutral AI evaluator for an on-chain task marketplace.

Task title: ${task.title}
Task description: ${task.description}
Submitted result: ${task.resultText}

Score the result from 0-100 and decide APPROVED or REJECTED.
Respond ONLY with JSON: {"verdict":"APPROVED"|"REJECTED","score":number,"reason":"one sentence"}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  return JSON.parse(res.choices[0].message.content);
}

// ── On-chain approve / reject ──────────────────────────────────────────────────

async function sendVerdict(taskId, approved) {
  const fn = approved ? "approveResult" : "rejectResult";
  const hash = await walletClient.writeContract({
    address: BOUNTY_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: fn,
    args: [BigInt(taskId)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ── Express + x402 ────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// x402 middleware — charges EVALUATION_PRICE USDC per request to /evaluate
app.use(
  "/evaluate",
  createGatewayMiddleware({
    sellerAddress: account.address,
    price: EVALUATION_PRICE,
    network: "arcTestnet",
  })
);

app.post("/evaluate", async (req, res) => {
  const { taskId, title, description, resultText } = req.body;

  if (!taskId || !resultText) {
    return res.status(400).json({ error: "taskId and resultText required" });
  }

  console.log(`[gateway] Task #${taskId} — evaluating...`);

  let verdict;
  try {
    verdict = await evaluate({ title: title || "", description: description || "", resultText });
  } catch (err) {
    console.error("[gateway] GPT-4o error:", err.message);
    return res.status(500).json({ error: "evaluation failed" });
  }

  console.log(`[gateway] Task #${taskId} verdict: ${verdict.verdict} (score=${verdict.score})`);

  let txHash;
  try {
    txHash = await sendVerdict(taskId, verdict.verdict === "APPROVED");
    console.log(`[gateway] Task #${taskId} on-chain tx: ${txHash}`);
  } catch (err) {
    console.error("[gateway] on-chain error:", err.message);
    return res.status(500).json({ error: "on-chain tx failed", verdict });
  }

  return res.json({ ...verdict, txHash });
});

app.get("/health", (_req, res) => res.json({ status: "ok", address: account.address }));

app.listen(PORT, () => {
  console.log(`[gateway] Evaluator gateway running on :${PORT}`);
  console.log(`[gateway] Evaluator address: ${account.address}`);
  console.log(`[gateway] Price per evaluation: $${EVALUATION_PRICE} USDC`);
});
