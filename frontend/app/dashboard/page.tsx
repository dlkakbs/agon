"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { useReadContracts, useReadContract } from "wagmi";
import { BOUNTY_REGISTRY_ABI, BOUNTY_REGISTRY_ADDRESS, TaskStatus } from "@/lib/contract";

type TaskRecord = {
  creator: `0x${string}`;
  title: string;
  description: string;
  taskHash: `0x${string}`;
  reward: bigint;
  stakeRequired: bigint;
  deadline: bigint;
  evaluators: readonly [`0x${string}`, `0x${string}`];
  tiebreaker: `0x${string}`;
  status: number;
  agent: `0x${string}`;
  agentStake: bigint;
  takenAt: bigint;
  resultHash: `0x${string}`;
  resultText: string;
  approveCount: number;
  rejectCount: number;
  tiebreakerCalled: boolean;
};

type DashboardFilter = "all" | "active" | "expired" | "completed" | "cancelled";
type EffectiveStatus = "active" | "expired" | "completed" | "cancelled";

const PAGE_SIZE = 6;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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

const FILTERS: { id: DashboardFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_STYLE: Record<EffectiveStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "badge-green" },
  expired: { label: "Expired", className: "badge-red" },
  completed: { label: "Completed", className: "badge-blue" },
  cancelled: { label: "Cancelled", className: "badge-muted" },
};

export default function Dashboard() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<DashboardFilter>("all");

  const { data: taskCount } = useReadContract({
    address: BOUNTY_REGISTRY_ADDRESS,
    abi: BOUNTY_REGISTRY_ABI,
    functionName: "taskCount",
    query: { refetchInterval: 10_000 },
  });

  const ids = Array.from({ length: Number(taskCount ?? 0) }, (_, index) => BigInt(index + 1));

  const { data: taskRows } = useReadContracts({
    contracts: ids.map((id) => ({
      address: BOUNTY_REGISTRY_ADDRESS,
      abi: BOUNTY_REGISTRY_ABI,
      functionName: "getTask" as const,
      args: [id],
    })),
    query: { refetchInterval: 10_000 },
  });

  const baseTasks = ids
    .map((id, index) => {
      const task = taskRows?.[index]?.result as TaskRecord | undefined;
      if (!task) return null;
      return { id, task };
    })
    .filter((item): item is { id: bigint; task: TaskRecord } => item !== null);

  const uniqueAgentAddrs = Array.from(
    new Set(
      baseTasks
        .map((item) => item.task.agent)
        .filter((address) => address.toLowerCase() !== ZERO_ADDRESS.toLowerCase())
        .map((address) => address.toLowerCase())
    )
  ) as `0x${string}`[];

  const { data: agentIdentityRows } = useReadContracts({
    contracts: uniqueAgentAddrs.map((address) => ({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "balanceOf" as const,
      args: [address],
    })),
    query: { refetchInterval: 10_000 },
  });

  const registeredAgentCount = (agentIdentityRows ?? []).filter((row) => Number(row.result ?? 0) > 0).length;

  const tasks = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);

    return baseTasks.map(({ id, task }) => {
      const status = Number(task.status);
      const deadline = Number(task.deadline);

      let effectiveStatus: EffectiveStatus;
      if (status === TaskStatus.COMPLETED) {
        effectiveStatus = "completed";
      } else if (status === TaskStatus.CANCELLED) {
        effectiveStatus = "cancelled";
      } else if (now > deadline) {
        effectiveStatus = "expired";
      } else {
        effectiveStatus = "active";
      }

      return { id, task, effectiveStatus };
    });
  }, [baseTasks]);

  const activeTasks = tasks.filter((item) => item.effectiveStatus === "active");
  const totalLocked = activeTasks.reduce((acc, item) => acc + item.task.reward, BigInt(0));

  const filteredTasks = tasks.filter((item) => {
    if (filter === "all") return true;
    return item.effectiveStatus === filter;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFilterChange = (nextFilter: DashboardFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <main className="section">
      <p className="section-label">{"// Market"}</p>
      <h1
        style={{
          fontFamily: "var(--sans)",
          fontSize: "2rem",
          fontWeight: 800,
          color: "#fff",
          marginBottom: "2rem",
        }}
      >
        Bounty Market
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 1,
          background: "var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        {[
          { label: "All Bounties", value: tasks.length.toString() },
          { label: "Active", value: activeTasks.length.toString() },
          { label: "Registered Agents", value: registeredAgentCount.toString() },
          { label: "Locked USDC", value: Number(formatEther(totalLocked)).toFixed(0) },
        ].map((item) => (
          <div key={item.label} className="card" style={{ background: "var(--surface)", textAlign: "center" }}>
            <div
              style={{
                fontFamily: "var(--sans)",
                fontSize: "1.75rem",
                fontWeight: 800,
                color: "var(--amber)",
                marginBottom: "0.3rem",
              }}
            >
              {item.value}
            </div>
            <div
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            onClick={() => handleFilterChange(item.id)}
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.45rem 0.8rem",
              background: filter === item.id ? "var(--amber)" : "transparent",
              color: filter === item.id ? "var(--bg)" : "var(--muted)",
              border: `1px solid ${filter === item.id ? "var(--amber)" : "var(--border)"}`,
              cursor: "crosshair",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {paginatedTasks.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No bounties match this filter.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
          {paginatedTasks.map(({ id, task, effectiveStatus }) => {
            const statusStyle = STATUS_STYLE[effectiveStatus];
            const hasSubmission =
              task.agent.toLowerCase() !== ZERO_ADDRESS.toLowerCase() &&
              (task.resultHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" ||
                task.resultText.length > 0);

            return (
              <Link
                key={id.toString()}
                href={`/bounties/${id}`}
                className="card"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
                  <span className={`badge ${statusStyle.className}`}>{statusStyle.label}</span>
                  <span className="badge badge-amber">
                    {task.agent.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? "Unclaimed" : "Taken"}
                  </span>
                </div>

                <h2
                  style={{
                    fontFamily: "var(--sans)",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: "#fff",
                    marginBottom: "0.5rem",
                  }}
                >
                  {task.title || `Bounty #${id.toString()}`}
                </h2>

                <p style={{ color: "var(--muted)", fontSize: "0.73rem", lineHeight: 1.75, marginBottom: "1rem" }}>
                  {task.description || "No description provided."}
                </p>

                <div style={{ display: "grid", gap: "0.45rem", fontSize: "0.68rem", color: "var(--muted)" }}>
                  <div>Creator: {task.creator.slice(0, 6)}...{task.creator.slice(-4)}</div>
                  <div>Evaluators: {task.evaluators[0].slice(0, 6)}...{task.evaluators[0].slice(-4)}</div>
                  <div>Reward: {Number(formatEther(task.reward)).toFixed(2)} USDC</div>
                  <div>Stake Required: {Number(formatEther(task.stakeRequired)).toFixed(2)} USDC</div>
                  <div>Submission: {hasSubmission ? "Submitted" : "Pending"}</div>
                  <div>Deadline: {new Date(Number(task.deadline) * 1000).toLocaleString()}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "2rem" }}>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              onClick={() => setPage(pageNumber)}
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.7rem",
                letterSpacing: "0.1em",
                padding: "0.4rem 0.75rem",
                background: currentPage === pageNumber ? "var(--amber)" : "transparent",
                color: currentPage === pageNumber ? "var(--bg)" : "var(--muted)",
                border: `1px solid ${currentPage === pageNumber ? "var(--amber)" : "var(--border)"}`,
                cursor: "crosshair",
              }}
            >
              {pageNumber}
            </button>
          ))}
        </div>
      )}

    </main>
  );
}
