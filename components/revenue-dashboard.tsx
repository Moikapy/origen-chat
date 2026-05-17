"use client";

import { useState, useEffect } from "react";

interface TokenInfo {
  token_address: string;
  token_name: string;
  token_symbol: string;
  launched_at: number;
  creator_revenue_bps: number;
  protocol_fee_bps: number;
}

interface RevenueDashboardProps {
  walletConnected: boolean;
}

export function RevenueDashboard({ walletConnected }: RevenueDashboardProps) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletConnected) { setLoading(false); return; }
    fetch("/api/token/revenue")
      .then((r) => r.json() as Promise<{ tokens: TokenInfo[] }>)
      .then((data) => setTokens(data.tokens || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [walletConnected]);

  if (loading) {
    return <div className="bg-card border border-border rounded-lg p-6 animate-pulse"><div className="h-4 bg-muted rounded w-1/3 mb-4" /><div className="h-3 bg-muted rounded w-2/3" /></div>;
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
      <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Your Tokens</h3>
      {tokens.map((token) => (
        <div key={token.token_address} className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{token.token_name}</p>
              <p className="text-sm text-muted-foreground">${token.token_symbol}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Creator: {token.creator_revenue_bps / 100}% · Origen: {token.protocol_fee_bps / 100}%</p>
              <p className="text-xs text-muted-foreground">Launched {new Date(token.launched_at * 1000).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <a href={`https://basescan.org/address/${token.token_address}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline">{token.token_address.slice(0, 10)}...{token.token_address.slice(-8)}</a>
          </div>
        </div>
      ))}
    </div>
  );
}