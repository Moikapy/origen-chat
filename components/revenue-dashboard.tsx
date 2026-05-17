"use client";

import { useState, useEffect, useCallback } from "react";

interface TokenInfo {
  token_address: string;
  token_name: string;
  token_symbol: string;
  launched_at: number;
  creator_revenue_bps: number;
  protocol_fee_bps: number;
  claimableEth?: string;
  claimableWei?: string;
}

interface ClaimState {
  claiming: boolean;
  converting: boolean;
  result: { ok: boolean; error?: string; creditsGranted?: number; amountEth?: string } | null;
}

interface RevenueDashboardProps {
  walletConnected: boolean;
  walletAddress?: string;
}

export function RevenueDashboard({ walletConnected, walletAddress }: RevenueDashboardProps) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalClaimableEth, setTotalClaimableEth] = useState("0");
  const [revenueManagerAddress, setRevenueManagerAddress] = useState<string | null>(null);
  const [claimState, setClaimState] = useState<ClaimState>({ claiming: false, converting: false, result: null });
  const [ethPrice, setEthPrice] = useState<number>(0);

  // Fetch tokens + claimable balances
  const fetchBalances = useCallback(async () => {
    if (!walletConnected) { setLoading(false); return; }
    try {
      const resp = await fetch("/api/token/claim");
      if (!resp.ok) throw new Error("Failed to fetch");
      const data = await resp.json() as { tokens: TokenInfo[]; totalClaimableEth: string; revenueManagerAddress?: string };
      setTokens(data.tokens || []);
      setTotalClaimableEth(data.totalClaimableEth || "0");
      if (data.revenueManagerAddress) setRevenueManagerAddress(data.revenueManagerAddress);
    } catch {
      // Fallback: basic token list without balances
      try {
        const resp = await fetch("/api/token/revenue");
        const data = await resp.json() as { tokens: TokenInfo[] };
        setTokens(data.tokens || []);
      } catch { /* empty */ }
    } finally {
      setLoading(false);
    }
  }, [walletConnected]);

  // Fetch ETH price for credit conversion preview
  useEffect(() => {
    if (!walletConnected) return;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then(r => r.json() as any)
      .then(d => d?.ethereum?.usd && setEthPrice(d.ethereum.usd))
      .catch(() => {});
  }, [walletConnected]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // Claim revenue on-chain via MetaMask
  const handleClaim = useCallback(async (convertToCredits: boolean) => {
    if (!window.ethereum || !walletAddress || !revenueManagerAddress) {
      setClaimState(s => ({ ...s, result: { ok: false, error: "Wallet not connected or RevenueManager not configured" } }));
      return;
    }

    setClaimState(s => ({ ...s, claiming: true, result: null }));
    try {
      const { createPublicClient, createWalletClient, http, custom } = await import("viem");
      const { base } = await import("viem/chains");

      const publicClient = createPublicClient({ chain: base, transport: http() });
      const walletClient = createWalletClient({ account: walletAddress as `0x${string}`, chain: base, transport: custom(window.ethereum!) });

      // RevenueManager.claim() — no args needed, claims all available
      const claimData = "0x4e7268ca"; // claim() selector

      const txHash = await walletClient.sendTransaction({
        to: revenueManagerAddress as `0x${string}`,
        data: claimData as `0x${string}`,
        value: 0n,
      } as any);

      // Wait for confirmation
      const receipt = await (publicClient as any).waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        setClaimState(s => ({ ...s, claiming: false, result: { ok: false, error: "Claim transaction reverted" } }));
        return;
      }

      // Calculate claimed amount from the total we fetched
      const claimedEth = parseFloat(totalClaimableEth);

      // Record the claim server-side + convert to credits if requested
      if (convertToCredits && claimedEth > 0) {
        setClaimState(s => ({ ...s, converting: true }));
        const resp = await fetch("/api/token/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash,
            amountWei: tokens.reduce((sum, t) => sum + BigInt(t.claimableWei || "0"), 0n).toString(),
            convertToCredits: true,
          }),
        });
        const data = await resp.json() as { ok: boolean; error?: string; creditsGranted?: number; amountEth?: string };
        setClaimState({
          claiming: false,
          converting: false,
          result: { ok: data.ok, error: data.error, creditsGranted: data.creditsGranted, amountEth: data.amountEth },
        });
      } else {
        setClaimState({
          claiming: false,
          converting: false,
          result: { ok: true, amountEth: totalClaimableEth },
        });
      }

      // Refresh balances
      setTimeout(() => fetchBalances(), 2000);
    } catch (err: any) {
      const msg = err?.message || "Claim failed";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setClaimState({ claiming: false, converting: false, result: { ok: false, error: "Transaction rejected" } });
      } else {
        setClaimState({ claiming: false, converting: false, result: { ok: false, error: msg } });
      }
    }
  }, [walletAddress, revenueManagerAddress, totalClaimableEth, tokens, fetchBalances]);

  // Credit conversion preview
  const creditPreview = ethPrice > 0 && parseFloat(totalClaimableEth) > 0
    ? Math.floor(parseFloat(totalClaimableEth) * ethPrice * 100 * (1 - 0.03)) // 3% spread
    : 0;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    );
  }

  if (!walletConnected) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="font-medium">Token Revenue</p>
        <p className="text-sm text-muted-foreground">Connect your wallet to view and claim token revenue.</p>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="font-medium">Token Revenue</p>
        <p className="text-sm text-muted-foreground">No tokens launched yet. Launch a token to start earning ETH from trading fees.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Token Revenue</h3>

      {/* Total claimable balance */}
      {parseFloat(totalClaimableEth) > 0 && (
        <div className="bg-card border border-emerald-500/30 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Claimable Revenue</p>
              <p className="text-2xl font-bold text-emerald-400">{parseFloat(totalClaimableEth).toFixed(6)} ETH</p>
              {ethPrice > 0 && (
                <p className="text-sm text-muted-foreground">≈ ${(parseFloat(totalClaimableEth) * ethPrice).toFixed(2)} USD</p>
              )}
            </div>
            <div className="text-right">
              {creditPreview > 0 && (
                <p className="text-xs text-muted-foreground">→ {creditPreview} credits</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleClaim(true)}
              disabled={claimState.claiming || claimState.converting}
              className="flex-1 text-sm px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-medium disabled:opacity-50"
            >
              {claimState.converting ? "Converting..." : claimState.claiming ? "Claiming..." : "Claim → Credits"}
            </button>
            <button
              onClick={() => handleClaim(false)}
              disabled={claimState.claiming}
              className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              {claimState.claiming ? "Claiming..." : "Claim ETH"}
            </button>
          </div>

          {claimState.result && (
            <div className={`p-3 rounded-lg text-sm ${
              claimState.result.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            }`}>
              {claimState.result.ok ? (
                <>
                  ✅ Claimed {claimState.result.amountEth} ETH
                  {claimState.result.creditsGranted
                    ? ` → ${claimState.result.creditsGranted} credits added to your account`
                    : " to your wallet"}
                </>
              ) : (
                claimState.result.error
              )}
            </div>
          )}
        </div>
      )}

      {/* Token list */}
      {tokens.map((token) => (
        <div key={token.token_address} className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{token.token_name}</p>
              <p className="text-sm text-muted-foreground">${token.token_symbol}</p>
            </div>
            <div className="text-right">
              {token.claimableEth && parseFloat(token.claimableEth) > 0 ? (
                <p className="text-sm text-emerald-400 font-medium">{parseFloat(token.claimableEth).toFixed(6)} ETH</p>
              ) : (
                <p className="text-xs text-muted-foreground">No revenue yet</p>
              )}
              <p className="text-xs text-muted-foreground">
                Creator: {token.creator_revenue_bps / 100}% · Origen: {token.protocol_fee_bps / 100}%
              </p>
            </div>
          </div>
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <a
              href={`https://basescan.org/address/${token.token_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              {token.token_address.slice(0, 10)}...{token.token_address.slice(-8)}
            </a>
            <span className="text-xs text-muted-foreground">
              {new Date(token.launched_at * 1000).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}