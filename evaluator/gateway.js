/**
 * Agon — Evaluator Gateway v2
 *
 * Worker agent pays $0.002 USDC via x402 to trigger evaluation.
 * Two evaluators (GPT-4o + Claude) vote concurrently.
 * If they disagree, TiebreakerCalled event fires on-chain →
 * gateway automatically triggers the 3rd evaluator (Gemini).
 *
 * Usage: node gateway.js
 */

require("dotenv").config({ path: process.env.ENV_PATH || "../.env" });

const express = require("express");
const { createGatewayMiddleware } = require("@circle-fin/x402-batching/server");
const OpenAI = require("openai").default;
const { createPublicClient, http, parseAbiItem } = require("viem");

// ── Config ────────────────────────────────────────────────────────────────────

const PORT             = parseInt(process.env.GATEWAY_PORT || "4242");
const RPC_URL          = process.env.RPC_URL;
const BOUNTY_REGISTRY  = process.env.BOUNTY_REGISTRY;
const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const EVALUATION_PRICE = "0.002"; // $0.002 covers 2 evaluators

if (!RPC_URL || !BOUNTY_REGISTRY) {
  console.error("[gateway] ERROR: RPC_URL and BOUNTY_REGISTRY are required");
  process.exit(1);
}

const sellerAddress = process.env.CIRCLE_EVALUATOR_SELLER_ADDRESS;
if (!sellerAddress) {
  console.error("[gateway] ERROR: Set CIRCLE_EVALUATOR_SELLER_ADDRESS");
  process.exit(1);
}

// ── Arc Testnet chain ─────────────────────────────────────────────────────────

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

// ── LLM clients ───────────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const EVAL_PROMPT = ({ title, description, resultText }) =>
  `You are a neutral AI evaluator for an on-chain task marketplace.

Task title: ${title}
Task description: ${description}
Submitted result: ${resultText}

Score the result from 0-100 and decide APPROVED or REJECTED.
Respond ONLY with JSON: {"verdict":"APPROVED"|"REJECTED","score":number,"reason":"one sentence"}`;

async function evalGPT4o(task) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: EVAL_PROMPT(task) }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  return JSON.parse(res.choices[0].message.content);
}

async function evalClaude(task) {
  const res = await openrouter.chat.completions.create({
    model: "anthropic/claude-opus-4",
    messages: [{ role: "user", content: EVAL_PROMPT(task) }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  return JSON.parse(res.choices[0].message.content);
}

async function evalGemini(task) {
  const res = await openrouter.chat.completions.create({
    model: "google/gemini-2.0-flash-001",
    messages: [{ role: "user", content: EVAL_PROMPT(task) }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  return JSON.parse(res.choices[0].message.content);
}

// ── Circle DCW vote ───────────────────────────────────────────────────────────

let circleClient;
async function getCircleClient() {
  if (!circleClient) {
    const { initiateDeveloperControlledWalletsClient } = require("@circle-fin/developer-controlled-wallets");
    circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });
  }
  return circleClient;
}

async function voteOnChain(walletId, taskId, approve) {
  const cc = await getCircleClient();
  const { data } = await cc.createContractExecutionTransaction({
    walletId,
    contractAddress: BOUNTY_REGISTRY,
    abiFunctionSignature: "vote(uint256,bool)",
    abiParameters: [taskId.toString(), approve],
    feeLevel: "MEDIUM",
  });
  const txId = data.id;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: tx } = await cc.getTransaction({ id: txId });
    if (tx.state === "COMPLETE") return tx.txHash;
    if (["FAILED", "DENIED", "CANCELLED"].includes(tx.state)) {
      throw new Error(`Circle tx ${txId} ended with state ${tx.state}`);
    }
  }
  throw new Error(`Circle tx ${txId} timed out`);
}

// ── Evaluator configs ─────────────────────────────────────────────────────────

const EVALUATORS = [
  { name: "GPT-4o",  walletId: process.env.CIRCLE_EVALUATOR_WALLET_ID,  fn: evalGPT4o },
  { name: "Claude",  walletId: process.env.CIRCLE_EVALUATOR2_WALLET_ID, fn: evalClaude },
];

const TIEBREAKER_EVAL = {
  name: "Gemini",
  walletId: process.env.CIRCLE_EVALUATOR3_WALLET_ID,
  fn: evalGemini,
};

// Task data cache — needed so tiebreaker can evaluate without worker re-sending
const taskCache = new Map(); // taskId → { title, description, resultText }

async function runEvaluator(evaluator, taskId, task) {
  console.log(`[${evaluator.name}] Task #${taskId} — evaluating...`);
  const verdict = await evaluator.fn(task);
  console.log(`[${evaluator.name}] Task #${taskId}: ${verdict.verdict} (score=${verdict.score})`);
  const txHash = await voteOnChain(evaluator.walletId, taskId, verdict.verdict === "APPROVED");
  console.log(`[${evaluator.name}] Task #${taskId} voted on-chain: ${txHash}`);
}

// ── Express + x402 ────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// x402 middleware — charges $0.002 USDC per /evaluate request
app.use(
  "/evaluate",
  createGatewayMiddleware({
    sellerAddress,
    price: EVALUATION_PRICE,
    network: "arcTestnet",
  })
);

app.post("/evaluate", async (req, res) => {
  const { taskId, title, description, resultText } = req.body;

  if (!taskId || !resultText) {
    return res.status(400).json({ error: "taskId and resultText required" });
  }

  // Cache task data for tiebreaker
  const task = { title: title || "", description: description || "", resultText };
  taskCache.set(String(taskId), task);

  // Return immediately — don't block worker
  res.json({ status: "evaluation started", taskId });

  // Fire evaluator 1 + evaluator 2 concurrently
  Promise.allSettled([
    runEvaluator(EVALUATORS[0], taskId, task),
    runEvaluator(EVALUATORS[1], taskId, task),
  ]).then((results) => {
    results.forEach(({ status, reason }) => {
      if (status === "rejected") {
        console.error("[gateway] Evaluator error:", reason?.message);
      }
    });
  });
});

app.get("/health", (_req, res) =>
  res.json({ status: "ok", address: sellerAddress, price: EVALUATION_PRICE })
);

// ── TiebreakerCalled event watcher ────────────────────────────────────────────

async function watchTiebreaker() {
  console.log("[gateway] Watching for TiebreakerCalled events...");

  publicClient.watchEvent({
    address: BOUNTY_REGISTRY,
    event: parseAbiItem("event TiebreakerCalled(uint256 indexed id, address indexed tiebreaker)"),
    onLogs: async (logs) => {
      for (const log of logs) {
        const taskId = log.args.id.toString();
        console.log(`[gateway] TiebreakerCalled — task #${taskId}`);

        const task = taskCache.get(taskId);
        if (!task) {
          console.warn(`[gateway] No cached task data for #${taskId}, skipping tiebreaker`);
          continue;
        }

        runEvaluator(TIEBREAKER_EVAL, taskId, task).catch((err) => {
          console.error(`[gateway] Tiebreaker error for #${taskId}:`, err.message);
        });
      }
    },
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[gateway] Running on :${PORT}`);
  console.log(`[gateway] Seller address : ${sellerAddress}`);
  console.log(`[gateway] Price          : $${EVALUATION_PRICE} USDC (2 evaluators)`);
  console.log(`[gateway] Evaluators     : GPT-4o + Claude + Gemini (tiebreaker)`);
  watchTiebreaker();
});
