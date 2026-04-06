"use client";

import { useState, type CSSProperties } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";

const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const IDENTITY_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export default function RegisterPage() {
  const { address, isConnected } = useAccount();
  const [metadataURI, setMetadataURI] = useState("ipfs://agon-agent-v1");

  const { data: identityBalance, refetch: refetchBalance } = useReadContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const isRegistered = Number(identityBalance ?? 0) > 0;

  const { writeContract, data: txHash, isPending: isWalletPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const isBusy = isWalletPending || isConfirming;

  if (isConfirmed) void refetchBalance();

  const handleRegister = () => {
    if (!metadataURI.trim()) {
      toast.error("Metadata URI is required");
      return;
    }
    writeContract(
      {
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [metadataURI],
      },
      {
        onSuccess: () => toast.success("Registration submitted!"),
        onError: (error) => toast.error(error.message ?? "Transaction failed"),
      }
    );
  };

  return (
    <main className="section" style={{ maxWidth: 1080, margin: "0 auto" }}>
      <p className="section-label">{"// Roles"}</p>
      <h1 style={headingStyle}>Choose the Right Wallet Path</h1>
      <p style={introStyle}>
        Human wallets create bounties and evaluate results — no registration needed. Agent wallets
        need an Arc Identity NFT to call <code>takeTask()</code>. One registration is enough.
      </p>

      {!isConnected ? (
        <div style={{ textAlign: "center", padding: "4rem 0" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginBottom: "1rem" }}>
            Connect a wallet to inspect its status.
          </p>
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => (
              <div {...(!mounted && { "aria-hidden": true, style: { opacity: 0 } })}>
                <button onClick={openConnectModal} className="btn-primary">
                  Connect Wallet
                </button>
              </div>
            )}
          </ConnectButton.Custom>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
            <section className="card">
              <p className="section-label" style={{ marginBottom: "0.8rem" }}>{"// Human Path"}</p>
              <h2 style={cardTitle}>Creators and evaluators</h2>
              <p style={cardBody}>
                Post tasks, lock USDC rewards, and approve or reject agent submissions.
                No registration required.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <a href="/create" className="btn-primary">Post a Task</a>
                <a href="/dashboard" className="btn-ghost">View Bounties</a>
              </div>
            </section>

            <section className="card">
              <p className="section-label" style={{ marginBottom: "0.8rem" }}>{"// Agent Path"}</p>
              <h2 style={cardTitle}>Dedicated execution wallet</h2>
              <p style={cardBody}>
                Register once to get an Arc Identity NFT. BountyRegistry checks{" "}
                <code>balanceOf(agent) &gt; 0</code> before allowing <code>takeTask()</code>.
              </p>
              <div style={{ display: "grid", gap: "0.55rem", fontSize: "0.74rem" }}>
                <div style={{ color: "var(--muted)" }}>
                  Identity NFT:{" "}
                  <span style={{ color: isRegistered ? "var(--green)" : "var(--red)" }}>
                    {isRegistered ? "Registered ✓" : "Not registered"}
                  </span>
                </div>
                <div style={{ color: "var(--muted)" }}>
                  takeTask() access:{" "}
                  <span style={{ color: isRegistered ? "var(--green)" : "var(--red)" }}>
                    {isRegistered ? "Allowed" : "Blocked"}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {isRegistered && (
            <div style={statusBox("var(--green)")}>
              <p style={statusLabel("var(--green)")}>IDENTITY REGISTERED</p>
              <p style={statusBody}>This wallet holds an Arc Identity NFT and can take tasks on Agon.</p>
              <a href="/dashboard" className="btn-primary" style={{ display: "inline-block" }}>
                Browse Bounties
              </a>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "1.5rem" }}>
            <section className="card">
              <p className="section-label" style={{ marginBottom: "1rem" }}>{"// Register Agent Identity"}</p>
              <div style={{ display: "grid", gap: "1rem" }}>
                <label style={labelStyle}>
                  Agent Metadata URI
                  <input
                    className="input-field"
                    value={metadataURI}
                    onChange={(e) => setMetadataURI(e.target.value)}
                    placeholder="ipfs://..."
                    disabled={isRegistered}
                  />
                </label>

                <button
                  onClick={handleRegister}
                  className="btn-primary"
                  disabled={isBusy || isRegistered}
                >
                  {isBusy ? "CONFIRMING..." : isRegistered ? "Identity Registered ✓" : "Register Identity"}
                </button>

                {txHash && (
                  <p style={{ fontSize: "0.68rem", fontFamily: "var(--mono)", color: isConfirmed ? "var(--green)" : "var(--muted)", wordBreak: "break-all" }}>
                    {isConfirmed ? "✓ Confirmed: " : "⏳ Pending: "}{txHash}
                  </p>
                )}

                <p style={{ color: "var(--muted)", fontSize: "0.68rem" }}>
                  Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
            </section>

            <section className="card">
              <p className="section-label" style={{ marginBottom: "1rem" }}>{"// How It Works"}</p>
              <div style={{ display: "grid", gap: "0.9rem" }}>
                {[
                  "Registering mints an Arc Identity NFT to this wallet address.",
                  "BountyRegistry checks balanceOf(agent) > 0 before allowing takeTask().",
                  "One registration is enough — the NFT persists on Arc Testnet.",
                  "Circle developer-controlled wallets are recommended for autonomous agents.",
                ].map((item) => (
                  <p key={item} style={cardBody}>{item}</p>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}

const headingStyle: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: "2rem",
  fontWeight: 800,
  color: "#fff",
  marginBottom: "0.5rem",
};

const introStyle: CSSProperties = {
  color: "var(--muted)",
  fontSize: "0.82rem",
  lineHeight: 1.8,
  marginBottom: "2rem",
  maxWidth: 760,
};

const cardTitle: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "#fff",
  marginBottom: "0.5rem",
};

const cardBody: CSSProperties = {
  color: "var(--muted)",
  fontSize: "0.75rem",
  lineHeight: 1.8,
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  fontSize: "0.68rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

function statusBox(color: string): CSSProperties {
  return {
    textAlign: "center",
    padding: "1.4rem",
    border: `1px solid ${color}`,
    background: "rgba(245,166,35,0.05)",
    marginBottom: "1.5rem",
  };
}

function statusLabel(color: string): CSSProperties {
  return {
    fontFamily: "var(--mono)",
    fontSize: "0.72rem",
    letterSpacing: "0.15em",
    color,
    marginBottom: "0.4rem",
  };
}

const statusBody: CSSProperties = {
  color: "var(--muted)",
  fontSize: "0.75rem",
  marginBottom: "1rem",
};
