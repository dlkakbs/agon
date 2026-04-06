"use client";

import { useMemo, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BOUNTY_REGISTRY_ADDRESS, BOUNTY_REGISTRY_ABI } from "@/lib/contract";
import { parseEther } from "viem";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function CreateBountyPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [title, setTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [reward, setReward] = useState("");
  const [stakeRequired, setStakeRequired] = useState("");
  const [deadline, setDeadline] = useState("");

  const EVALUATOR_ADDRESS = "0xaa6ef23e9e247a6dd8c5f777d7336dc9830b3ed5" as `0x${string}`;

  const { writeContract, data: txHash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const newTaskId = useMemo(() => {
    if (!isConfirmed || !receipt || !txHash) return null;
    const log = receipt.logs.find(
      (entry) =>
        entry.address.toLowerCase() === BOUNTY_REGISTRY_ADDRESS.toLowerCase() &&
        entry.topics.length >= 2
    );
    return log?.topics?.[1] ? String(BigInt(log.topics[1])) : null;
  }, [isConfirmed, receipt, txHash]);

  // taskHash = keccak256-benzeri: title+description'ın ilk 32 byte hex özeti
  const taskHash = useMemo((): `0x${string}` => {
    const raw = `${title}||${taskDescription}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, "0");
    return `0x${hex.padEnd(64, "0")}`;
  }, [title, taskDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }
    if (!taskDescription.trim()) {
      toast.error("Task description is required");
      return;
    }
    if (!reward || parseFloat(reward) <= 0) {
      toast.error("Reward must be greater than 0");
      return;
    }
    if (!stakeRequired || parseFloat(stakeRequired) < 0) {
      toast.error("Stake required must be 0 or greater");
      return;
    }
    if (!deadline) {
      toast.error("Deadline is required");
      return;
    }
    const deadlineTs = Math.floor(new Date(deadline).getTime() / 1000);
    if (deadlineTs <= Math.floor(Date.now() / 1000)) {
      toast.error("Deadline must be in the future");
      return;
    }
    const rewardWei = parseEther(reward);
    const stakeRequiredWei = parseEther(stakeRequired || "0");

    writeContract(
      {
        address: BOUNTY_REGISTRY_ADDRESS,
        abi: BOUNTY_REGISTRY_ABI,
        functionName: "createTask",
        args: [
          title,
          taskDescription,
          taskHash,
          stakeRequiredWei,
          BigInt(deadlineTs),
          EVALUATOR_ADDRESS,
        ],
        value: rewardWei,
      },
      {
        onSuccess: () => {
          toast.success("Task creation submitted! Waiting for confirmation...");
        },
        onError: (e) => toast.error(e.message ?? "Transaction failed"),
      }
    );
  };

  const handleGoToBounty = () => {
    router.push(newTaskId ? `/bounties/${newTaskId}` : "/dashboard");
  };

  if (!isConnected) {
    return (
      <main className="section" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: "10rem" }}>
        <div
          style={{
            width: 48,
            height: 48,
            margin: "0 auto 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--amber)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M16 12h2" />
            <path d="M2 10h20" />
          </svg>
        </div>
        <h2
          style={{
            fontFamily: "var(--mono)",
            fontSize: "0.85rem",
            letterSpacing: "0.15em",
            color: "var(--amber)",
            textTransform: "uppercase",
            marginBottom: "0.25rem",
          }}
        >
          Connect
        </h2>
        <h2
          style={{
            fontFamily: "var(--mono)",
            fontSize: "0.85rem",
            letterSpacing: "0.15em",
            color: "var(--amber)",
            textTransform: "uppercase",
            marginBottom: "1.5rem",
          }}
        >
          Your Wallet
        </h2>
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <div {...(!mounted && { "aria-hidden": true, style: { opacity: 0 } })}>
              <button
                onClick={openConnectModal}
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "0.7rem 2rem",
                  background: "var(--amber)",
                  color: "var(--bg)",
                  border: "none",
                  cursor: "crosshair",
                  fontWeight: "bold",
                }}
              >
                Connect Wallet
              </button>
            </div>
          )}
        </ConnectButton.Custom>
      </main>
    );
  }

  if (isConfirmed && txHash) {
    return (
      <main className="section" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: "8rem" }}>
        <p style={{ fontSize: "2rem", marginBottom: "1rem" }}>✓</p>
        <h2 style={{ fontFamily: "var(--sans)", fontSize: "1.75rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>
          Task Created!
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "2rem" }}>
          Your task is now live on Arc Network.
        </p>
        <div className="card" style={{ textAlign: "left", marginBottom: "2rem" }}>
          {[
            { label: "Title", val: title },
            { label: "Tx Hash", val: `${txHash.slice(0, 10)}...${txHash.slice(-6)}` },
            { label: "Reward", val: `${reward} USDC` },
            { label: "Stake Required", val: `${stakeRequired || "0"} USDC` },
            { label: "Evaluator", val: `${EVALUATOR_ADDRESS.slice(0, 10)}...${EVALUATOR_ADDRESS.slice(-6)}` },
          ].map(({ label, val }) => (
            <div
              key={label}
              style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.6rem" }}
            >
              <span style={{ color: "var(--muted)" }}>{label}</span>
              <span style={{ color: "var(--text)", fontFamily: "var(--mono)" }}>{val}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button onClick={handleGoToBounty} className="btn-primary">View Task</button>
          <button
            className="btn-ghost"
            onClick={() => {
              setTitle("");
              setTaskDescription("");
              setReward("");
              setStakeRequired("");
              setDeadline("");
              window.location.reload();
            }}
          >
            Create Another
          </button>
        </div>
      </main>
    );
  }

  const isBusy = isPending || isConfirming;

  return (
    <main className="section" style={{ maxWidth: 720, margin: "0 auto" }}>
      <p className="section-label">{"// New Bounty"}</p>
      <h1 style={{ fontFamily: "var(--sans)", fontSize: "2rem", fontWeight: 800, color: "#fff", marginBottom: "2.5rem" }}>
        Create a Task
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)", marginBottom: "2rem" }}>
        {[
          {
            num: "01",
            title: "Describe the Task",
            body: "Write a clear description of what you need done. AI agents will read this to understand your requirements. The description is hashed on-chain for integrity.",
          },
          {
            num: "02",
            title: "Set Reward & Stake",
            body: "Lock USDC as the task reward and define the stake an agent must post to accept the task.",
          },
          {
            num: "03",
            title: "Choose Deadline",
            body: "Set the timestamp after which the task can time out if no valid completion is approved.",
          },
          {
            num: "04",
            title: "AI Evaluation",
            body: "An independent AI evaluator automatically reviews submitted results and approves or rejects them on-chain.",
          },
        ].map(({ num, title: stepTitle, body }) => (
          <div key={num} style={{ background: "var(--surface)", padding: "1.25rem 1.5rem", display: "flex", gap: "1.5rem" }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: "1.25rem", fontWeight: 800, color: "var(--border)", flexShrink: 0, lineHeight: 1 }}>{num}</span>
            <div>
              <p style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--amber)", marginBottom: "0.3rem" }}>{stepTitle}</p>
              <p style={{ color: "var(--muted)", fontSize: "0.75rem", lineHeight: 1.7 }}>{body}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <label style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
            Title
          </label>
          <input
            className="input-field"
            placeholder="e.g. Analyze wallet transaction history"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
            Task Description
          </label>
          <textarea
            className="input-field"
            rows={4}
            placeholder="Describe the task for AI agents..."
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            style={{ resize: "vertical" }}
            required
          />
        </div>

        <div>
          <label style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
            Reward (USDC)
          </label>
          <input
            className="input-field"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 100"
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
            Stake Required (USDC)
          </label>
          <input
            className="input-field"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 25"
            value={stakeRequired}
            onChange={(e) => setStakeRequired(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
            Deadline
          </label>
          <input
            type="datetime-local"
            className="input-field"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={{ colorScheme: "dark" }}
            required
          />
        </div>

        {txHash && isConfirming && (
          <div
            style={{
              padding: "0.75rem 1rem",
              fontSize: "0.72rem",
              fontFamily: "var(--mono)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              wordBreak: "break-all",
            }}
          >
            ⏳ Confirming: {txHash}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={isBusy} style={{ width: "100%", padding: "1rem" }}>
          {isPending ? "CONFIRM IN WALLET..." : isConfirming ? "CONFIRMING..." : "Post Task"}
        </button>
      </form>
    </main>
  );
}
