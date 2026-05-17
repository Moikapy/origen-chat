"use client";

import { useState } from "react";

export interface TokenLaunchParams {
  name: string;
  symbol: string;
  description: string;
  initialMarketCapUSD: number;
  creatorFeeAllocationPercent: number;
  fairLaunchPercent: number;
  fairLaunchDuration: number;
  websiteUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
}

interface TokenLaunchFormProps {
  onSubmit: (params: TokenLaunchParams) => void;
  loading?: boolean;
}

export function TokenLaunchForm({ onSubmit, loading }: TokenLaunchFormProps) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [initialMarketCap, setInitialMarketCap] = useState(10000);
  const [creatorFee, setCreatorFee] = useState(80);
  const [fairLaunchPercent, setFairLaunchPercent] = useState(0);
  const [fairLaunchDuration, setFairLaunchDuration] = useState(30);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const isValid = name.trim().length >= 2 && symbol.trim().length >= 2 && description.trim().length >= 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      description: description.trim(),
      initialMarketCapUSD: initialMarketCap,
      creatorFeeAllocationPercent: creatorFee,
      fairLaunchPercent,
      fairLaunchDuration: fairLaunchDuration * 60,
      websiteUrl: websiteUrl.trim() || undefined,
      twitterUrl: twitterUrl.trim() || undefined,
      telegramUrl: telegramUrl.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Token Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium" htmlFor="name">Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring mt-1" maxLength={32} required />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="symbol">Symbol</label>
            <input id="symbol" type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="MTKN"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring mt-1 font-mono" maxLength={8} required />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="description">Description</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is your token about?"
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring mt-1 min-h-[80px]" maxLength={500} required />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="image">Token Image</label>
          <input id="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleImageChange}
            className="w-full text-sm text-muted-foreground file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-primary file:text-primary-foreground file:font-medium mt-1" />
          {imagePreview && (
            <div className="mt-2 w-16 h-16 rounded-full overflow-hidden border border-border">
              <img src={imagePreview} alt="Token preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Economics</h3>
        <div>
          <label className="text-sm font-medium" htmlFor="marketCap">Initial Market Cap (USD)</label>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">$</span>
            <input id="marketCap" type="number" value={initialMarketCap} onChange={(e) => setInitialMarketCap(Number(e.target.value))}
              className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" min={1000} step={1000} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Launches below $10k don&apos;t incur protocol fees</p>
        </div>
        <div>
          <label className="text-sm font-medium">Creator Revenue: {creatorFee}% · Community: {100 - creatorFee}%</label>
          <input type="range" value={creatorFee} onChange={(e) => setCreatorFee(Number(e.target.value))} className="w-full mt-1" min={0} max={100} step={1} />
          <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>0% creator</span><span>100% creator</span></div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Fair Launch (Optional)</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Supply (%)</label>
            <input type="number" value={fairLaunchPercent} onChange={(e) => setFairLaunchPercent(Number(e.target.value))}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring mt-1" min={0} max={100} />
          </div>
          <div>
            <label className="text-sm font-medium">Duration (min)</label>
            <input type="number" value={fairLaunchDuration} onChange={(e) => setFairLaunchDuration(Number(e.target.value))}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring mt-1" min={0} />
          </div>
        </div>
      </div>

      <details className="group">
        <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Add social links (optional)</summary>
        <div className="mt-2 space-y-2">
          <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring" />
          <input type="url" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/handle" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring" />
          <input type="url" value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} placeholder="https://t.me/group" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </details>

      <button type="submit" disabled={loading || !isValid}
        className="w-full text-sm px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium disabled:opacity-50">
        {loading ? "Launching on Base..." : "🚀 Launch Token on Base"}
      </button>
      <p className="text-xs text-muted-foreground text-center">Gas on Base is ~$0.01. Origen takes a 2.5% protocol fee from trading revenue.</p>
    </form>
  );
}