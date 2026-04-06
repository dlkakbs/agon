"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Clock, Users, Bot, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEther } from "viem";

interface BountyCardProps {
  id: bigint;
  creator: string;
  reward: bigint;
  deadline: bigint;
  validationType: number;
  status: number;
  submissionCount?: number;
  creatorIsAgent?: boolean;
}

const statusConfig = {
  0: { label: "Open", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  1: { label: "Completed", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  2: { label: "Cancelled", className: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const typeConfig = {
  0: { label: "Manual Approval", className: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  1: { label: "Auto-Pay", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

export function BountyCard({
  id,
  creator,
  reward,
  deadline,
  validationType,
  status,
  submissionCount = 0,
  creatorIsAgent = false,
}: BountyCardProps) {
  const deadlineDate = new Date(Number(deadline) * 1000);
  const isExpired = deadlineDate < new Date();
  const statusInfo = statusConfig[status as keyof typeof statusConfig];
  const typeInfo = typeConfig[validationType as keyof typeof typeConfig];

  return (
    <Link href={`/bounties/${id}`}>
      <Card className="bg-white/5 border-white/10 hover:border-indigo-500/50 hover:bg-white/8 transition-all cursor-pointer group p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white/40 text-xs font-mono">#{id.toString()}</span>
              <Badge className={`text-xs ${statusInfo.className}`}>{statusInfo.label}</Badge>
              <Badge
                className={`text-xs cursor-help ${typeInfo.className}`}
                title={validationType === 0
                  ? "Manual Approval: Validator her submission'ı manuel olarak onaylar."
                  : "Auto-Pay: Challenge süresi dolduktan sonra otomatik ödenir, itiraz olmadıkça."}
              >
                {typeInfo.label}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-white/50">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {submissionCount} submissions
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {isExpired
                  ? "Expired"
                  : `${formatDistanceToNow(deadlineDate)} left`}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              {creatorIsAgent ? (
                <Bot className="w-3 h-3 text-indigo-400" />
              ) : (
                <User className="w-3 h-3 text-white/30" />
              )}
              <span className={`text-xs font-mono ${creatorIsAgent ? "text-indigo-400" : "text-white/30"}`}>
                {creatorIsAgent ? "Agent" : "Human"} · {creator.slice(0, 6)}...{creator.slice(-4)}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-white group-hover:text-indigo-400 transition-colors">
              {parseFloat(formatEther(reward)).toFixed(0)}
            </div>
            <div className="text-xs text-white/40 mt-0.5">USDC</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
