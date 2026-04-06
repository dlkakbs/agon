"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatEther, parseAbiItem } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { BOUNTY_REGISTRY_ABI, BOUNTY_REGISTRY_ADDRESS } from "@/lib/contract";
import { toast } from "sonner";

type AgentStatsResult = readonly [bigint, bigint, bigint];
type BountyRecord = readonly [
  creator: `0x${string}`,
  title: string,
  description: string,
  taskHash: `0x${string}`,
  reward: bigint,
  deadline: bigint,
  challengePeriod: bigint,
  validationType: number,
  validator: `0x${string}`,
  status: number,
  winner: `0x${string}`
];

type SubmissionRecord = {
  agent: `0x${string}`;
  resultHash: `0x${string}`;
  submittedAt: bigint;
  challenged: boolean;
  approved: boolean;
  rejected: boolean;
};

type ResultSubmittedLogArgs = {
  bountyId?: bigint;
  agent?: string;
  result?: string;
};

export default function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address: agentAddress } = use(params);
  const { address: connectedWallet } = useAccount();
  const publicClient = usePublicClient();

  const [copied, setCopied] = useState(false);
  const [resultTexts, setResultTexts] = useState<Record<string, string>>({});

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(agentAddress);
    setCopied(true);
    toast.success("Address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!publicClient) return;

    publicClient
      .getLogs({
        address: BOUNTY_REGISTRY_ADDRESS,
        event: parseAbiItem(
          "event ResultSubmitted(uint256 indexed bountyId, address indexed agent, bytes32 resultHash, string result)"
        ),
        fromBlock: BigInt(0),
      })
      .then((logs) => {
        const map: Record<string, string> = {};

        for (const log of logs) {
          const args = log.args as ResultSubmittedLogArgs;
          if (args.agent?.toLowerCase() !== agentAddress.toLowerCase()) continue;
          if (!args.bountyId || !args.result) continue;
          map[args.bountyId.toString()] = args.result;
        }

        setResultTexts(map);
      })
      .catch(() => {});
  }, [agentAddress, publicClient]);

  const { data: statsRaw } = useReadContract({
    address: BOUNTY_REGISTRY_ADDRESS,
    abi: BOUNTY_REGISTRY_ABI,
    functionName: "agentStats",
    args: [agentAddress as `0x${string}`],
  });

  const { data: bountyCount } = useReadContract({
    address: BOUNTY_REGISTRY_ADDRESS,
    abi: BOUNTY_REGISTRY_ABI,
    functionName: "bountyCount",
  });

  const ids = Array.from({ length: Number(bountyCount ?? 0) }, (_, index) => BigInt(index + 1));

  const { data: bountyRows } = useReadContracts({
    contracts: ids.map((id) => ({
      address: BOUNTY_REGISTRY_ADDRESS,
      abi: BOUNTY_REGISTRY_ABI,
      functionName: "bounties" as const,
      args: [id],
    })),
  });

  const { data: submissionRows } = useReadContracts({
    contracts: ids.map((id) => ({
      address: BOUNTY_REGISTRY_ADDRESS,
      abi: BOUNTY_REGISTRY_ABI,
      functionName: "getSubmissions" as const,
      args: [id],
    })),
  });

  const stats = statsRaw as AgentStatsResult | undefined;
  const completed = stats?.[0] ?? BigInt(0);
  const attempted = stats?.[1] ?? BigInt(0);
  const totalEarned = stats?.[2] ?? BigInt(0);

  const participatedBounties = ids
    .map((id, index) => {
      const bounty = (bountyRows?.[index]?.result as BountyRecord | undefined) ?? null;
      const submissions = (submissionRows?.[index]?.result as SubmissionRecord[] | undefined) ?? [];
      const submission = submissions.find(
        (entry) => entry.agent.toLowerCase() === agentAddress.toLowerCase()
      );

      if (!bounty || !submission) return null;
      return { id, bounty, submission };
    })
    .filter(
      (entry): entry is { id: bigint; bounty: BountyRecord; submission: SubmissionRecord } => entry !== null
    );

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

      <p className="section-label">{"// Bounty Participation"}</p>
      {participatedBounties.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>No submissions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--border)" }}>
          {participatedBounties.map(({ id, bounty, submission }) => {
            const reward = bounty[4];
            const creator = bounty[0];
            const title = bounty[1] || `Bounty #${id.toString()}`;
            const winner = bounty[10];
            const isWinner = winner.toLowerCase() === agentAddress.toLowerCase();
            const isApproved = submission.approved;
            const isRejected = submission.rejected;
            const isChallenged = submission.challenged;
            const isCreator = connectedWallet?.toLowerCase() === creator.toLowerCase();
            const resultText = resultTexts[id.toString()];

            const statusLabel = isWinner || isApproved
              ? "WINNER"
              : isRejected
                ? "REJECTED"
                : isChallenged
                  ? "CHALLENGED"
                  : "PENDING";
            const badgeColor = isWinner || isApproved
              ? "blue"
              : isRejected
                ? "red"
                : isChallenged
                  ? "amber"
                  : "muted";

            return (
              <div key={id.toString()} className="card">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: "1rem",
                    alignItems: "center",
                    marginBottom: isCreator && resultText ? "0.75rem" : 0,
                  }}
                >
                  <div>
                    <Link href={`/bounties/${id}`} style={{ color: "#fff", fontSize: "0.82rem", textDecoration: "none" }}>
                      {title}
                    </Link>
                    <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.2rem", fontFamily: "var(--mono)" }}>
                      {submission.resultHash.slice(0, 12)}...
                    </p>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--amber)", fontFamily: "var(--mono)", fontWeight: 700 }}>
                    ${Number(formatEther(reward)).toFixed(0)} USDC
                  </span>
                  <span className={`badge badge-${badgeColor}`}>{statusLabel}</span>
                </div>

                {isCreator && resultText && (
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
                      {resultText}
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
