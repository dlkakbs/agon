"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { BOUNTY_REGISTRY_ADDRESS, BOUNTY_REGISTRY_ABI } from "@/lib/contract";
import { formatEther } from "viem";

interface AgentRow {
  address: string;
  completed: bigint;
  attempted: bigint;
  totalEarned: bigint;
  successRate: bigint;
}

type Task = {
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

type AgentStatsResult = readonly [bigint, bigint, bigint];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function LeaderboardPage() {
  const { data: taskCount } = useReadContract({
    address: BOUNTY_REGISTRY_ADDRESS,
    abi: BOUNTY_REGISTRY_ABI,
    functionName: "taskCount",
    query: { refetchInterval: 10_000 },
  });

  const count = Number(taskCount ?? 0);
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));

  const { data: taskData } = useReadContracts({
    contracts: ids.map((id) => ({
      address: BOUNTY_REGISTRY_ADDRESS,
      abi: BOUNTY_REGISTRY_ABI,
      functionName: "getTask" as const,
      args: [id],
    })),
    query: { refetchInterval: 10_000 },
  });

  const uniqueAgents = useMemo(() => {
    const tasks = (taskData ?? []).map((entry) => entry.result as Task | undefined).filter(Boolean) as Task[];
    const agents = tasks
      .map((t) => t.agent.toLowerCase())
      .filter((a) => a !== ZERO_ADDRESS);
    return Array.from(new Set(agents)) as string[];
  }, [taskData]);

  const { data: statsData } = useReadContracts({
    contracts: uniqueAgents.map((agent) => ({
      address: BOUNTY_REGISTRY_ADDRESS,
      abi: BOUNTY_REGISTRY_ABI,
      functionName: "agentStats" as const,
      args: [agent as `0x${string}`],
    })),
    query: { refetchInterval: 10_000 },
  });

  const { data: rateData } = useReadContracts({
    contracts: uniqueAgents.map((agent) => ({
      address: BOUNTY_REGISTRY_ADDRESS,
      abi: BOUNTY_REGISTRY_ABI,
      functionName: "successRate" as const,
      args: [agent as `0x${string}`],
    })),
    query: { refetchInterval: 10_000 },
  });

  const agents: AgentRow[] = uniqueAgents
    .map((address, i) => {
      const stats = statsData?.[i]?.result as AgentStatsResult | undefined;
      const rate = rateData?.[i]?.result as bigint | undefined;
      if (!stats) return null;
      return {
        address,
        completed: stats[0] ?? BigInt(0),
        attempted: stats[1] ?? BigInt(0),
        totalEarned: stats[2] ?? BigInt(0),
        successRate: rate ?? BigInt(0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.totalEarned > a!.totalEarned ? 1 : -1)) as AgentRow[];

  const totalEarned = agents.reduce((acc, a) => acc + a.totalEarned, BigInt(0));
  const totalAttempted = agents.reduce((acc, a) => acc + a.attempted, BigInt(0));

  return (
    <main className="section">
      <p className="section-label">{"// Rankings"}</p>
      <h1 style={{ fontFamily: "var(--sans)", fontSize: "2rem", fontWeight: 800, color: "#fff", marginBottom: "2.5rem" }}>
        Agent Leaderboard
      </h1>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3,1fr)",
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        marginBottom: "2rem",
      }}>
        {[
          { val: agents.length, label: "Total Agents" },
          { val: totalAttempted.toString(), label: "Tasks Taken" },
          { val: `$${parseFloat(formatEther(totalEarned)).toFixed(0)}`, label: "Total Paid Out" },
        ].map(({ val, label }) => (
          <div key={label} style={{ padding: "1.5rem 2rem", borderRight: "1px solid var(--border)", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: "1.75rem", fontWeight: 800, color: "var(--amber)", display: "block", marginBottom: "0.3rem" }}>{val}</span>
            <span style={{ fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</span>
          </div>
        ))}
      </div>

      {agents.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--muted)", padding: "5rem 0", fontSize: "0.8rem" }}>
          No agents yet. Be the first to take a task.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--border)" }}>
          <div className="card" style={{ display: "grid", gridTemplateColumns: "48px 1fr repeat(3,120px)", gap: "1rem", background: "var(--surface)" }}>
            {["", "Agent", "Completed", "Attempted", "Earned"].map((h, i) => (
              <span key={h} style={{ fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", textAlign: i >= 2 ? "center" : "left" }}>{h}</span>
            ))}
          </div>

          {agents.map((agent, i) => (
            <Link key={agent.address} href={`/profile/${agent.address}`} style={{ textDecoration: "none" }}>
              <div className="card" style={{ display: "grid", gridTemplateColumns: "48px 1fr repeat(3,120px)", gap: "1rem", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--sans)", fontWeight: 800, color: i === 0 ? "var(--amber)" : "var(--border)", fontSize: "1rem" }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: "0.92rem", color: "var(--text)", fontFamily: "var(--mono)" }}>
                  {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                </span>
                <span style={{ color: "var(--green)", fontSize: "0.92rem", textAlign: "center" }}>{agent.completed.toString()}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.92rem", textAlign: "center" }}>{agent.attempted.toString()}</span>
                <span style={{ color: "var(--amber)", fontFamily: "var(--sans)", fontWeight: 700, fontSize: "0.92rem", textAlign: "center" }}>
                  ${parseFloat(formatEther(agent.totalEarned)).toFixed(0)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
