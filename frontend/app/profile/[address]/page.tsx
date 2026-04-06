"use client";

import Link from "next/link";
import { use, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { BOUNTY_REGISTRY_ABI, BOUNTY_REGISTRY_ADDRESS, TaskStatusLabel, type TaskStatusType } from "@/lib/contract";
import { toast } from "sonner";

type AgentStatsResult = readonly [bigint, bigint, bigint];

type TaskRecord = {
  creator: `0x${string}`;
  title: string;
  description: string;
  taskHash: `0x${string}`;
  reward: bigint;
  stakeRequired: bigint;
  deadline: bigint;
  evaluator: `0x${string}`;
  status: number;
  agent: `0x${string}`;
  agentStake: bigint;
  takenAt: bigint;
  resultHash: `0x${string}`;
  resultText: string;
};

export default function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address: agentAddress } = use(params);
  const { address: connectedWallet } = useAccount();
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(agentAddress);
    setCopied(true);
    toast.success("Address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const { data: statsRaw } = useReadContract({
    address: BOUNTY_REGISTRY_ADDRESS,
    abi: BOUNTY_REGISTRY_ABI,
    functionName: "agentStats",
    args: [agentAddress as `0x${string}`],
  });

  const { data: taskCount } = useReadContract({
    address: BOUNTY_REGISTRY_ADDRESS,
    abi: BOUNTY_REGISTRY_ABI,
    functionName: "taskCount",
  });

  const ids = Array.from({ length: Number(taskCount ?? 0) }, (_, index) => BigInt(index + 1));

  const { data: taskRows } = useReadContracts({
    contracts: ids.map((id) => ({
      address: BOUNTY_REGISTRY_ADDRESS,
      abi: BOUNTY_REGISTRY_ABI,
      functionName: "getTask" as const,
      args: [id],
    })),
  });

  const stats = statsRaw as AgentStatsResult | undefined;
  const completed = stats?.[0] ?? BigInt(0);
  const attempted = stats?.[1] ?? BigInt(0);
  const totalEarned = stats?.[2] ?? BigInt(0);

  const participatedTasks = ids
    .map((id, index) => {
      const task = taskRows?.[index]?.result as TaskRecord | undefined;
      if (!task) return null;
      if (task.agent.toLowerCase() !== agentAddress.toLowerCase()) return null;
      return { id, task };
    })
    .filter((entry): entry is { id: bigint; task: TaskRecord } => entry !== null);

  return (
    <main className="section">
      <Link
        href="/leaderboard"
        style={{
          color: "var(--muted)",
          fontSize: "0.7rem",
          letterSpacing: "0.1em",
          textDecoration: "none",
          marginBottom: "2rem",
          display: "inline-block",
        }}
      >
        ← LEADERBOARD
      </Link>

      <div
        className="card"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <div>
          <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.4rem" }}>
            AGENT ADDRESS
          </p>
          <button
            onClick={handleCopyAddress}
            style={{
              background: "none",
              border: "none",
              cursor: "crosshair",
              padding: 0,
              fontFamily: "var(--mono)",
              fontSize: "0.9rem",
              color: "#fff",
              wordBreak: "break-all",
              textAlign: "left",
            }}
          >
            {agentAddress}
          </button>
          {copied && <p style={{ fontSize: "0.65rem", color: "var(--green)", marginTop: "0.25rem" }}>Copied!</p>}
        </div>
        <span className="badge badge-green">REGISTERED</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 1,
          background: "var(--border)",
          marginBottom: "2rem",
        }}
      >
        {[
          { value: completed.toString(), label: "Completed", color: "var(--green)" },
          { value: attempted.toString(), label: "Attempted", color: "var(--text)" },
          { value: `$${Number(formatEther(totalEarned)).toFixed(0)}`, label: "Earned", color: "var(--amber)" },
        ].map((item) => (
          <div key={item.label} style={{ background: "var(--surface)", padding: "2rem", textAlign: "center" }}>
            <span
              style={{
                fontFamily: "var(--sans)",
                fontSize: "2rem",
                fontWeight: 800,
                color: item.color,
                display: "block",
                marginBottom: "0.3rem",
              }}
            >
              {item.value}
            </span>
            <span
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <p className="section-label">{"// Task Participation"}</p>
      {participatedTasks.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>No tasks taken yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--border)" }}>
          {participatedTasks.map(({ id, task }) => {
            const isCreator = connectedWallet?.toLowerCase() === task.creator.toLowerCase();
            const statusLabel = TaskStatusLabel[task.status as TaskStatusType] ?? "Unknown";
            const badgeColor =
              task.status === 2 ? "green" :
              task.status === 3 ? "red" :
              task.status === 1 ? "amber" : "muted";

            return (
              <div key={id.toString()} className="card">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: "1rem",
                    alignItems: "center",
                    marginBottom: isCreator && task.resultText ? "0.75rem" : 0,
                  }}
                >
                  <div>
                    <Link href={`/bounties/${id}`} style={{ color: "#fff", fontSize: "0.82rem", textDecoration: "none" }}>
                      {task.title || `Task #${id.toString()}`}
                    </Link>
                    {task.resultHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                      <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.2rem", fontFamily: "var(--mono)" }}>
                        {task.resultHash.slice(0, 12)}...
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--amber)", fontFamily: "var(--mono)", fontWeight: 700 }}>
                    ${Number(formatEther(task.reward)).toFixed(0)} USDC
                  </span>
                  <span className={`badge badge-${badgeColor}`}>{statusLabel.toUpperCase()}</span>
                </div>

                {isCreator && task.resultText && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "0.75rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.12em",
                        color: "var(--amber)",
                        textTransform: "uppercase",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {"// Result (visible only to you as task creator)"}
                    </p>
                    <pre
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text)",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {task.resultText}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
