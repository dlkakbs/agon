"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatEther, keccak256, toHex } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Countdown } from "@/components/Countdown";
import {
  BOUNTY_REGISTRY_ABI,
  BOUNTY_REGISTRY_ADDRESS,
  EVALUATORS,
  TIEBREAKER,
  TaskStatus,
  type TaskRecord,
} from "@/lib/contract";
import { toast } from "sonner";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const statusConfig = {
  [TaskStatus.OPEN]: { label: "Open", badge: "badge-green" },
  [TaskStatus.LOCKED]: { label: "Locked", badge: "badge-amber" },
  [TaskStatus.COMPLETED]: { label: "Completed", badge: "badge-blue" },
  [TaskStatus.CANCELLED]: { label: "Cancelled", badge: "badge-muted" },
} as const;

const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const IDENTITY_REGISTRY_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export default function BountyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const taskId = BigInt(id);
  const { address: userAddress } = useAccount();

  const [resultTextInput, setResultTextInput] = useState("");
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  const { data: taskRaw, refetch: refetchTask } = useReadContract({
    address: BOUNTY_REGISTRY_ADDRESS,
    abi: BOUNTY_REGISTRY_ABI,
    functionName: "getTask",
    args: [taskId],
    query: { refetchInterval: 10_000 },
  });

  const { data: agentBalance } = useReadContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!isConfirmed || !txHash) return;
    void refetchTask();
  }, [isConfirmed, txHash, refetchTask]);

  const isRegisteredAgent = Number(agentBalance ?? 0) > 0;
  const isBusy = isPending || isConfirming;

  if (!taskRaw) {
    return (
      <div className="text-center py-20 text-white/30">
        <div className="text-4xl mb-3">⏳</div>
        <p>Loading bounty...</p>
      </div>
    );
  }

  const task = taskRaw as TaskRecord;

  const now = Math.floor(Date.now() / 1000);
  const deadlineSeconds = Number(task.deadline);
  const takenAtSeconds = Number(task.takenAt);
  const isExpired = task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CANCELLED && now > deadlineSeconds;

  const isCreator = userAddress?.toLowerCase() === task.creator.toLowerCase();
  const isMainEvaluator =
    userAddress?.toLowerCase() === EVALUATORS[0].toLowerCase() ||
    userAddress?.toLowerCase() === EVALUATORS[1].toLowerCase();
  const isTiebreaker = userAddress?.toLowerCase() === TIEBREAKER.toLowerCase() && task.tiebreakerCalled;
  const isEvaluator = isMainEvaluator || isTiebreaker;

  const isAssignedAgent = userAddress?.toLowerCase() === task.agent.toLowerCase();
  const hasAgent = task.agent.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const hasSubmittedResult = task.resultHash !== ZERO_HASH || task.resultText.length > 0;

  const canTakeTask =
    Boolean(userAddress) && isRegisteredAgent && task.status === TaskStatus.OPEN && !hasAgent && !isExpired && !isCreator;
  const canSubmitResult =
    Boolean(userAddress) && isAssignedAgent && task.status === TaskStatus.LOCKED && !hasSubmittedResult;
  const canVote =
    Boolean(userAddress) && isEvaluator && task.status === TaskStatus.LOCKED && hasSubmittedResult;
  const canSlashTimeout =
    Boolean(userAddress) && task.status === TaskStatus.LOCKED && now > deadlineSeconds && !hasSubmittedResult;
  const canEvaluatorTimeout =
    Boolean(userAddress) && task.status === TaskStatus.LOCKED && now > deadlineSeconds && hasSubmittedResult;
  const canCancelTask =
    Boolean(userAddress) && isCreator && task.status === TaskStatus.OPEN && !hasAgent;

  const statusInfo = statusConfig[task.status as keyof typeof statusConfig] ?? {
    label: `Unknown (${task.status})`,
    badge: "badge-muted",
  };
  const resultHashPreview = resultTextInput ? keccak256(toHex(resultTextInput)).slice(0, 20) : null;

  const handleTx = (
    functionName: "takeTask" | "submitResult" | "vote" | "slashTimeout" | "evaluatorTimeout" | "cancelTask",
    args: readonly unknown[],
    value: bigint | undefined,
    successMessage: string
  ) => {
    writeContract(
      {
        address: BOUNTY_REGISTRY_ADDRESS,
        abi: BOUNTY_REGISTRY_ABI,
        functionName: functionName as "takeTask",
        args: args as readonly [bigint],
        value,
      },
      {
        onSuccess: () => toast.success(successMessage),
        onError: (error) => toast.error(error.message ?? "Transaction failed"),
      }
    );
  };

  const handleSubmitResult = () => {
    if (!resultTextInput.trim()) {
      toast.error("Please enter a result description");
      return;
    }
    handleTx("submitResult", [taskId, keccak256(toHex(resultTextInput)), resultTextInput], undefined, "Result submitted!");
    setShowSubmitForm(false);
    setResultTextInput("");
  };

  return (
    <main className="section">
      <Link
        href="/dashboard"
        style={{
          color: "var(--muted)",
          fontSize: "0.7rem",
          letterSpacing: "0.1em",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "2rem",
        }}
      >
        ← BACK
      </Link>

      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--sans)", fontSize: "1.75rem", fontWeight: 800, color: "#fff" }}>
            {task.title || `Bounty #${id}`}
          </h1>
          <span className={`badge ${statusInfo.badge}`}>{isExpired ? "Expired" : statusInfo.label}</span>
          <span className="badge badge-amber">{hasAgent ? "Taken" : "Unclaimed"}</span>
        </div>

        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: task.description ? "1.5rem" : 0 }}>
          Created by{" "}
          <Link href={`/profile/${task.creator}`} style={{ color: "var(--amber)" }}>
            {task.creator.slice(0, 6)}...{task.creator.slice(-4)}
          </Link>
        </p>

        {task.description && (
          <div className="card" style={{ marginTop: "1.5rem", marginBottom: 0 }}>
            <p className="section-label" style={{ marginBottom: "1rem" }}>
              {"// TASK DESCRIPTION"}
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {task.description}
            </p>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem 2rem", marginBottom: "1.5rem" }}>
        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            {isExpired ? "DEADLINE PASSED" : "TIME REMAINING"}
          </p>
          {isExpired ? (
            <span style={{ color: "var(--red)", fontFamily: "var(--sans)", fontWeight: 800 }}>Expired</span>
          ) : (
            <Countdown
              target={deadlineSeconds}
              style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}
            />
          )}
          <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.4rem" }}>
            {new Date(deadlineSeconds * 1000).toLocaleString()}
          </p>
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            REWARD
          </p>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: "var(--amber)" }}>
            {Number(formatEther(task.reward)).toFixed(4)} USDC
          </p>
        </div>

        <div className="card">
          <p className="section-label" style={{ marginBottom: "1rem" }}>
            {"// Task Hash"}
          </p>
          <code style={{ fontSize: "0.72rem", color: "var(--green)", wordBreak: "break-all" }}>{task.taskHash}</code>
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            STAKE REQUIRED
          </p>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>
            {Number(formatEther(task.stakeRequired)).toFixed(4)} USDC
          </p>
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            EVALUATORS
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {task.evaluators.map((addr, i) => (
              <span key={addr} style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--amber)" }}>
                {i + 1}. {addr.slice(0, 6)}...{addr.slice(-4)}
              </span>
            ))}
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted)" }}>
              TB: {task.tiebreaker.slice(0, 6)}...{task.tiebreaker.slice(-4)}
            </span>
          </div>
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            VOTES
          </p>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>
            ✓ {task.approveCount} &nbsp; ✗ {task.rejectCount}
            {task.tiebreakerCalled && <span style={{ color: "var(--amber)", fontSize: "0.7rem" }}> (tiebreaker active)</span>}
          </p>
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            STATUS
          </p>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>
            {statusInfo.label}
          </p>
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            AGENT
          </p>
          {hasAgent ? (
            <Link href={`/profile/${task.agent}`} style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--amber)", textDecoration: "none" }}>
              {task.agent.slice(0, 6)}...{task.agent.slice(-4)}
            </Link>
          ) : (
            <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>No agent assigned</p>
          )}
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            AGENT STAKE
          </p>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>
            {hasAgent ? `${Number(formatEther(task.agentStake)).toFixed(4)} USDC` : "Not staked"}
          </p>
        </div>

        <div className="card">
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.5rem" }}>
            TAKEN AT
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text)" }}>
            {takenAtSeconds > 0 ? new Date(takenAtSeconds * 1000).toLocaleString() : "Not yet taken"}
          </p>
        </div>
      </div>

      {userAddress && (
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {canTakeTask && (
            <button
              onClick={() => handleTx("takeTask", [taskId], task.stakeRequired, "Task taken!")}
              disabled={isBusy}
              className="btn-primary"
            >
              {isBusy ? "Processing..." : "Take Task"}
            </button>
          )}

          {canSubmitResult && (
            <button onClick={() => setShowSubmitForm((v) => !v)} disabled={isBusy} className="btn-primary">
              Submit Result
            </button>
          )}

          {canVote && (
            <>
              <button
                onClick={() => handleTx("vote", [taskId, true], undefined, "Approved!")}
                disabled={isBusy}
                className="btn-primary"
              >
                {isBusy ? "Processing..." : "Approve"}
              </button>
              <button
                onClick={() => handleTx("vote", [taskId, false], undefined, "Rejected!")}
                disabled={isBusy}
                className="btn-ghost"
              >
                {isBusy ? "Processing..." : "Reject"}
              </button>
            </>
          )}

          {canSlashTimeout && (
            <button
              onClick={() => handleTx("slashTimeout", [taskId], undefined, "Slashed!")}
              disabled={isBusy}
              className="btn-ghost"
            >
              {isBusy ? "Processing..." : "Slash Timeout"}
            </button>
          )}

          {canEvaluatorTimeout && (
            <button
              onClick={() => handleTx("evaluatorTimeout", [taskId], undefined, "Evaluator timeout triggered!")}
              disabled={isBusy}
              className="btn-ghost"
            >
              {isBusy ? "Processing..." : "Evaluator Timeout"}
            </button>
          )}

          {canCancelTask && (
            <button
              onClick={() => handleTx("cancelTask", [taskId], undefined, "Cancelled!")}
              disabled={isBusy}
              className="btn-ghost"
            >
              {isBusy ? "Processing..." : "Cancel Task"}
            </button>
          )}
        </div>
      )}

      {showSubmitForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <p className="section-label" style={{ marginBottom: "1rem" }}>{"// Submit Result"}</p>
          <textarea
            className="input-field"
            rows={4}
            value={resultTextInput}
            onChange={(e) => setResultTextInput(e.target.value)}
            placeholder="Describe your result..."
            style={{ resize: "vertical", marginBottom: "0.75rem" }}
          />
          {resultHashPreview && (
            <p style={{ fontSize: "0.68rem", color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: "0.75rem" }}>
              Hash: {resultHashPreview}...
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={handleSubmitResult} disabled={isBusy || !resultTextInput.trim()} className="btn-primary">
              {isBusy ? "Submitting..." : "Submit"}
            </button>
            <button onClick={() => setShowSubmitForm(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {txHash && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1.5rem",
            fontSize: "0.72rem",
            fontFamily: "var(--mono)",
            wordBreak: "break-all",
            background: isConfirmed ? "rgba(0,229,160,0.08)" : "var(--surface)",
            border: `1px solid ${isConfirmed ? "var(--green)" : "var(--border)"}`,
            color: isConfirmed ? "var(--green)" : "var(--muted)",
          }}
        >
          {isConfirmed ? "✓ Confirmed: " : "⏳ Pending: "}
          {txHash}
        </div>
      )}

      <p className="section-label">{"// Result"}</p>
      {!hasSubmittedResult ? (
        <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>No result submitted yet.</p>
      ) : (
        <div className="card">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div>
              <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.3rem" }}>Agent</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text)" }}>
                {task.agent.slice(0, 6)}...{task.agent.slice(-4)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.3rem" }}>Result Hash</p>
              <code style={{ fontSize: "0.7rem", color: "var(--text)", wordBreak: "break-all" }}>{task.resultHash}</code>
            </div>
            <div>
              <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.3rem" }}>Result Text</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {task.resultText || "No result text provided."}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
