"use client";

import { useEffect, useRef, useState } from "react";
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
    <main id="studio" className="mx-auto max-w-4xl px-5 pb-24">
      {!DEPLOYED && (
        <p className="mt-6 rounded-lg border border-warning/40 bg-card px-4 py-3 text-xs text-warning">
          contract not deployed yet — run <code>npm run deploy</code> after funding the deployer
        </p>
      )}

      {/* HERO — full-bleed twilight sky, italic display line, boarding-pass card */}
      <section className="sky-hero -mx-5 -mt-0 mb-14 px-5 pb-24 pt-16 sm:pt-24">
        <div className="grid items-center gap-10 sm:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="stamp text-[11px] text-secondary">content authenticity · BOT Chain</p>
            <h1 className="mt-8 font-display text-6xl leading-[0.92] tracking-tight text-foreground sm:text-8xl">
              Stamp it,
              <br />
              <span className="font-sans text-5xl font-light not-italic sm:text-6xl">
                and it exists.
              </span>
            </h1>
            <p className="mt-8 max-w-md text-lg font-light leading-relaxed text-secondary">
              keccak256 your file or text in the browser — only the hash is
              written on-chain, timestamped to your wallet.
            </p>
            <p className="mt-10 font-mono text-xs tracking-wider text-secondary">
              <span className="text-foreground">{total === null ? "—" : total.toLocaleString()}</span>
              {" "}attestations sealed · forever · no stopovers
            </p>
          </div>

          {/* ATTESTATION PASS — their boarding-pass card, doing our job */}
          <div className="rounded-lg border border-border bg-ghost p-7 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <p className="stamp text-[10px] text-secondary">attestation pass</p>
              <p className="font-mono text-[10px] text-steel">POAI</p>
            </div>
            <div className="mt-6 flex items-end justify-between gap-3 font-mono">
              <div className="min-w-0">
                <p className="stamp text-[9px] text-steel">origin</p>
                <p className="mt-1 text-base text-foreground sm:text-xl">CONTENT</p>
              </div>
              <p className="pb-1 shrink-0 text-lavender">→</p>
              <div className="min-w-0 text-right">
                <p className="stamp text-[9px] text-steel">destination</p>
                <p className="mt-1 text-base text-foreground sm:text-xl">BLOCK&nbsp;677</p>
              </div>
            </div>
            <div className="mt-6 border-t border-dashed border-border-strong pt-5">
              <div className="flex justify-between font-mono text-[10px] text-steel">
                <span>SEAT</span><span>GATE</span><span>VALID</span>
              </div>
              <div className="mt-1 flex justify-between font-mono text-sm text-foreground">
                <span>0x{CONTRACT_ADDRESS.slice(2, 6).toUpperCase()}</span>
                <span>NOW</span>
                <span>FOREVER</span>
              </div>
            </div>
            <div className="barcode mt-6 h-10 opacity-80" aria-hidden />
            <p className="mt-3 truncate text-center font-mono text-[9px] tracking-[0.22em] text-steel">
              {CONTRACT_ADDRESS.slice(2, 34).toUpperCase()}
            </p>
          </div>
        </div>
      </section>

      {/* flight-route connector: two stops, one line, node markers */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong font-mono text-[11px] text-foreground">01</span>
          <p className="stamp text-sm text-foreground sm:text-lg">notarize</p>
        </div>
        <div className="relative h-px flex-1 bg-border-strong" aria-hidden>
          <span className="absolute -top-[3px] left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-lavender" />
        </div>
        <div className="flex items-center gap-3">
          <p className="stamp text-sm text-foreground sm:text-lg">verify</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong font-mono text-[11px] text-foreground">02</span>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* NOTARIZE */}
        <section className="rounded-lg border border-border bg-card p-8 sm:p-10">
          <p className="stamp text-[10px] text-steel">step 01 · notarize</p>
          <div className="mt-5 flex gap-2" role="tablist">
            {(["file", "text"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-5 py-2 text-sm transition-colors ${
                  mode === m
                    ? "bg-elevated text-foreground"
                    : "text-muted-foreground hover:text-secondary"
                }`}
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
              className={`mt-5 flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-3 text-center text-sm transition-colors ${
                dragOn ? "border-lavender text-lavender" : "border-border-strong text-muted-foreground hover:border-secondary hover:text-secondary"
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
              className="mt-5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-steel focus:border-border-strong focus:outline-none"
            />
          )}

          {mode === "text" && textHash && (
            <p className="mt-2 break-all font-mono text-[10px] text-steel">{textHash}</p>
          )}

          <div className="mt-5 flex items-center gap-2">
            <span className="stamp text-[10px] text-steel">kind</span>
            {KINDS.map((k, i) => (
              <button
                key={k}
                onClick={() => setKind(i)}
                aria-pressed={kind === i}
                className={`rounded-sm border px-2.5 py-1 font-mono text-[11px] tracking-wider ${
                  kind === i
                    ? "border-border-strong bg-elevated text-foreground"
                    : "border-border text-muted-foreground hover:text-secondary"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {/* the page's one violet filled action */}
          <button
            onClick={notarize}
            disabled={busy || status !== "ready" || !activeHash}
            className="mt-6 w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {busy ? "submitting…" : "Notarize on-chain"}
          </button>
        </section>

        {/* VERIFY */}
        <section className="rounded-lg border border-border bg-card p-8 sm:p-10">
          <p className="stamp text-[10px] text-steel">step 02 · verify</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Paste a content hash to see who notarized it and when.
          </p>
          <input
            value={vHash}
            onChange={(e) => setVHash(e.target.value)}
            placeholder="0x…"
            aria-label="hash to verify"
            className="mt-5 w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-steel focus:border-border-strong focus:outline-none"
          />
          {/* Filled Action Button: void fill, the white border does the work */}
          <button
            onClick={() => verify(vHash)}
            disabled={verifyBusy || !vHash}
            className="mt-4 w-full rounded-md border border-foreground bg-background px-4 py-3 text-sm text-foreground transition-colors hover:bg-elevated disabled:border-border disabled:text-muted-foreground"
          >
            {verifyBusy ? "checking…" : "Verify"}
          </button>

          {verified && (
            <div
              className={`mt-5 rounded-md border px-4 py-3 text-sm ${
                verified.exists ? "border-success/40" : "border-danger/40"
              }`}
              role="status"
            >
              {verified.exists ? (
                <dl className="space-y-2">
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
                    <dd className="font-mono text-[12px] text-secondary">{fmtDate(verified.timestamp)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-steel">kind</dt>
                    <dd className="font-mono text-[12px] text-secondary">{KINDS[verified.kind]}</dd>
                  </div>
                </dl>
              ) : (
                <span className="text-danger">not found — no on-chain record for this hash</span>
              )}
            </div>
          )}
        </section>
      </div>

      {/* coordinate stamp footer — "postcard from a city" */}
      <footer className="mt-24 border-t border-rule pt-8 pb-6">
        <div className="flex items-center justify-between font-mono text-[12px] tracking-wider text-muted-foreground">
          <span>
            <span aria-hidden className="text-foreground">+</span> Fly Direct · Attestation Registry
          </span>
          <a
            href={`${NET.explorer}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            {short(CONTRACT_ADDRESS)}
          </a>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <p className="stamp text-[10px] text-steel">chain 677 · bot chain mainnet</p>
          <p className="stamp text-[10px] text-steel">[ attested ]</p>
        </div>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <WalletProvider chainId={NET.chainId} chainName={NET.name} rpc={NET.rpc} explorer={NET.explorer}>
      <div className="min-h-screen overflow-x-clip bg-surface font-sans font-light text-foreground">
        {/* frosted nav — blur is the design */}
        <header className="frosted-nav sticky top-0 z-40 border-b border-border">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
            <a href="#" className="text-sm font-medium tracking-tight text-foreground">
              ProofOfAI
            </a>
            <nav className="hidden items-center gap-7 sm:flex">
              <a href="#studio" className="stamp text-[10px] text-muted-foreground transition-colors hover:text-secondary">
                notarize
              </a>
              <a href="#studio" className="stamp text-[10px] text-muted-foreground transition-colors hover:text-secondary">
                verify
              </a>
            </nav>
            <ConnectWalletButton />
          </div>
        </header>
        <Studio />
      </div>
      <Toaster />
    </WalletProvider>
  );
}
