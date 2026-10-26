"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, hexlify, keccak256 } from "ethers";
import { toast } from "sonner";
import { WalletProvider, ConnectWalletButton, useWallet } from "./Wallet";
import Toaster from "./Toaster";
import { NET } from "../lib/chain";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../lib/contract";

const DEPLOYED = CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";
const KINDS = ["text", "image", "other"];
const short = (a: string) => (a.length > 14 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);
const fmtDate = (t: number) => new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";

type Verified = { exists: boolean; author: string; timestamp: number; kind: number };

function readContract() {
  const p = new JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI as unknown as string[], p);
}

function Studio() {
  const { status, provider } = useWallet();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [fileHash, setFileHash] = useState("");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState(0);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  const [vHash, setVHash] = useState("");
  const [verified, setVerified] = useState<Verified | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const drag = useRef(false);
  const [dragOn, setDragOn] = useState(false);

  const textHash = text ? keccak256(new TextEncoder().encode(text)) : "";
  const activeHash = mode === "file" ? fileHash : textHash;

  useEffect(() => {
    if (!DEPLOYED) return;
    readContract()
      .totalNotarized()
      .then((n: bigint) => setTotal(Number(n)))
      .catch(() => setTotal(null));
  }, [busy]);

  const hashFile = async (f: File) => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    setFileHash(keccak256(hexlify(bytes)));
    setFileName(f.name);
    setKind(f.type.startsWith("image/") ? 1 : f.type.startsWith("text/") ? 0 : 2);
  };

  const notarize = async () => {
    if (status !== "ready" || !provider) return toast.warning("connect your wallet first");
    if (!activeHash) return toast.warning(mode === "file" ? "drop a file first" : "type some text first");
    setBusy(true);
    try {
      const signer = await new BrowserProvider(provider as any).getSigner();
      const c = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI as unknown as string[], signer);
      const tx = await c.notarize(activeHash, kind);
      toast.info("notarizing…");
      const r = await tx.wait();
      if (r.status === 1) {
        toast.success("notarized on-chain", {
          description: `hash ${short(activeHash)} · kind ${KINDS[kind]}`,
          action: { label: "view tx", onClick: () => window.open(`${NET.explorer}/tx/${r.hash}`) },
        });
        setVHash(activeHash);
      } else toast.error("transaction reverted");
    } catch (e: any) {
      const m = e?.shortMessage ?? e?.reason ?? e?.message ?? "notarize failed";
      toast.error(m.includes("already notarized") ? "this exact content was already notarized" : m);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (hash: string) => {
    const h = hash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) return toast.warning("enter a 0x…64-hex hash");
    setVerifyBusy(true);
    setVerified(null);
    try {
      const r = await readContract().verify(h);
      setVerified({ exists: r[0], author: r[1], timestamp: Number(r[2]), kind: Number(r[3]) });
      if (!r[0]) toast.warning("no record — this hash was never notarized");
    } catch {
      toast.error("verify failed — RPC hiccup");
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20">
      {!DEPLOYED && (
        <p className="mt-6 rounded border border-warning/40 bg-card px-4 py-3 text-xs text-warning">
          contract not deployed yet — run <code>npm run deploy</code> after funding the deployer
        </p>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Total notarized:{" "}
        <span className="text-foreground">{total === null ? "—" : total}</span> · files never leave
        your browser; only the keccak256 hash is written on-chain.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* NOTARIZE */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Notarize</h2>
          <div className="mt-3 flex gap-1 rounded border border-border p-0.5" role="tablist">
            {(["file", "text"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded px-2 py-1 text-xs ${mode === m ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-secondary"}`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === "file" ? (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!drag.current) setDragOn(true);
                drag.current = true;
              }}
              onDragLeave={() => {
                drag.current = false;
                setDragOn(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drag.current = false;
                setDragOn(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void hashFile(f);
              }}
              className={`mt-3 flex h-28 cursor-pointer flex-col items-center justify-center rounded border border-dashed px-3 text-center text-xs transition-colors ${
                dragOn ? "border-primary text-primary" : "border-border-strong text-muted-foreground hover:border-secondary"
              }`}
            >
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void hashFile(f);
                }}
              />
              {fileHash ? (
                <>
                  <span className="text-foreground">{fileName}</span>
                  <span className="mt-1 break-all font-mono text-[10px] text-steel">{fileHash}</span>
                </>
              ) : (
                "drop a file or click to pick"
              )}
            </label>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="paste the text to timestamp…"
              aria-label="text to notarize"
              className="mt-3 w-full rounded border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-steel focus:border-primary focus:outline-none"
            />
          )}

          {mode === "text" && textHash && (
            <p className="mt-2 break-all font-mono text-[10px] text-steel">{textHash}</p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-steel">kind</span>
            {KINDS.map((k, i) => (
              <button
                key={k}
                onClick={() => setKind(i)}
                aria-pressed={kind === i}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  kind === i
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-secondary"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          <button
            onClick={notarize}
            disabled={busy || status !== "ready" || !activeHash}
            className="mt-3 w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "submitting…" : "Notarize on-chain"}
          </button>
        </section>

        {/* VERIFY */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Verify</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste a content hash to see who notarized it and when.
          </p>
          <input
            value={vHash}
            onChange={(e) => setVHash(e.target.value)}
            placeholder="0x…"
            aria-label="hash to verify"
            className="mt-3 w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-steel focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => verify(vHash)}
            disabled={verifyBusy || !vHash}
            className="mt-3 w-full rounded border border-border px-4 py-2 text-sm text-foreground hover:border-secondary disabled:opacity-50"
          >
            {verifyBusy ? "checking…" : "Verify"}
          </button>

          {verified && (
            <div
              className={`mt-4 rounded border px-3 py-2.5 text-xs ${
                verified.exists ? "border-success/40" : "border-danger/40"
              }`}
              role="status"
            >
              {verified.exists ? (
                <dl className="space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-steel">status</dt>
                    <dd className="text-success">notarized ✓</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-steel">author</dt>
                    <dd>
                      <a
                        className="font-mono text-secondary underline decoration-dotted underline-offset-2 hover:text-foreground"
                        href={`${NET.explorer}/address/${verified.author}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {short(verified.author)}
                      </a>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-steel">recorded</dt>
                    <dd className="text-secondary">{fmtDate(verified.timestamp)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-steel">kind</dt>
                    <dd className="text-primary">{KINDS[verified.kind]}</dd>
                  </div>
                </dl>
              ) : (
                <span className="text-danger">not found — no on-chain record for this hash</span>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <WalletProvider chainId={NET.chainId} chainName={NET.name} rpc={NET.rpc} explorer={NET.explorer}>
      <div className="min-h-screen bg-surface text-foreground font-sans">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-6">
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">
              <span className="text-primary">▮</span> ProofOfAI
            </h1>
            <p className="text-[11px] text-muted-foreground">
              content authenticity · BOT Chain mainnet
            </p>
          </div>
          <ConnectWalletButton />
        </header>
        <Studio />
      </div>
      <Toaster />
    </WalletProvider>
  );
}
