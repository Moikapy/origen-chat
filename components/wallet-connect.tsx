"use client";

import { useState, useCallback } from "react";
import { generateSiweNonce, createSiweMessage, CHAINS } from "@/lib/wallet";

interface WalletConnectProps {
  onConnected?: (address: string, chainId: number) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function WalletConnect({ onConnected, onError, className }: WalletConnectProps) {
  const [connecting, setConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);

    try {
      // Check if MetaMask or compatible wallet is available
      if (!window.ethereum) {
        onError?.("No wallet detected. Please install MetaMask.");
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      }) as string[];

      if (!accounts || accounts.length === 0) {
        onError?.("No accounts found in wallet.");
        return;
      }

      const walletAddress = accounts[0];

      // Get chain ID
      const chainIdHex = await window.ethereum.request({
        method: "eth_chainId",
      }) as string;
      const currentChainId = parseInt(chainIdHex, 16);

      // Check if on Base mainnet
      if (currentChainId !== CHAINS.BASE_MAINNET) {
        // Try to switch to Base
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CHAINS.BASE_MAINNET.toString(16)}` }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${CHAINS.BASE_MAINNET.toString(16)}`,
                  chainName: "Base",
                  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://mainnet.base.org"],
                  blockExplorerUrls: ["https://basescan.org"],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }

      // SIWE sign-in
      const nonce = await fetch("/api/auth/wallet/nonce")
        .then((r) => r.json() as Promise<{ nonce: string }>)
        .then((data) => data.nonce);

      const domain = window.location.host;
      const message = createSiweMessage({
        domain,
        address: walletAddress,
        chainId: currentChainId,
        nonce,
      });

      // Sign the message
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      }) as string;

      // Verify with our backend
      const response = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });

      const data = await response.json() as { ok: boolean; userId?: string; walletAddress?: string; error?: string };

      if (!data.ok) {
        onError?.(data.error || "Wallet sign-in failed.");
        return;
      }

      setAddress(data.walletAddress || walletAddress);
      setChainId(currentChainId);
      onConnected?.(data.walletAddress || walletAddress, currentChainId);

      // Reload to update auth state
      window.location.reload();
    } catch (err: any) {
      onError?.(err.message || "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, [onConnected, onError]);

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAddress(null);
      setChainId(null);
      window.location.reload();
    } catch {
      // Silently fail
    }
  }, []);

  if (address) {
    return (
      <div className={`flex items-center gap-3 ${className || ""}`}>
        <span className="text-sm text-muted-foreground">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button
          onClick={disconnect}
          className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className={`text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 ${className || ""}`}
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}

// TypeScript declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, handler: (...args: any[]) => void) => void;
      removeListener: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}