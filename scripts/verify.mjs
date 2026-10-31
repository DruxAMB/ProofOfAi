// Verify the implementation contract on Blockscout via standard-json-input.
// Replays deploy.mjs's exact compile (same sources + settings) so the
// submission is byte-identical to what produced the deployed bytecode.
// Usage: node scripts/verify.mjs            verify impl from deployed.json
//        node scripts/verify.mjs --proxy   also verify the ERC1967 proxy
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(readFileSync(resolve(ROOT, "scripts/project.json"), "utf8"));
const deployed = JSON.parse(readFileSync(resolve(ROOT, "deployed.json"), "utf8"));
const EXPLORER = process.env.EXPLORER_API || "https://scan.botchain.ai";
const COMPILER = "v0.8.30+commit.73712a01";

// Same resolution order as deploy.mjs — but records every path solc requests
// so the standard-json input carries the complete source set.
const seen = new Set();
const find = (p) => {
  const cands = [];
  const m = p.match(/^(@openzeppelin\/contracts(-upgradeable)?|openzeppelin-contracts(-upgradeable)?)\/(.+)$/);
  if (m) {
    const repo = m[2] || m[3] ? "openzeppelin-contracts-upgradeable" : "openzeppelin-contracts";
    cands.push(resolve(ROOT, "contracts/lib", repo, "contracts", m[4]));
  }
  cands.push(resolve(ROOT, "contracts", p), resolve(ROOT, "contracts", p.replace(/^\.\//, "")));
  for (const base of cands) {
    if (existsSync(base)) {
      seen.add(p);
      return { contents: readFileSync(base, "utf8") };
    }
  }
  return { error: "not found: " + p };
};

const fileKey = project.file.replace(/^contracts\//, "");
const buildInput = () => ({
  language: "Solidity",
  sources: {
    [fileKey]: { content: readFileSync(resolve(ROOT, project.file), "utf8") },
    "proxy.sol": { content: 'import "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";' },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
  },
});

const input = buildInput();
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: find }));
if (out.errors?.some((e) => e.severity === "error")) {
  for (const e of out.errors.filter((e) => e.severity === "error")) console.error(e.formattedMessage);
  process.exit(1);
}
console.log(`compiled ${project.contract} with ${seen.size} resolved imports`);

// Standard-json verification needs every resolved import keyed by its literal path.
const sources = { ...input.sources };
for (const p of seen) {
  const r = find(p);
  if (!r.error) sources[p] = { content: r.contents };
}
const submit = { ...input, sources };

async function verify(address, contractName) {
  const params = new URLSearchParams({
    module: "contract",
    action: "verifysourcecode",
    contractaddress: address,
    sourceCode: JSON.stringify(submit),
    codeformat: "solidity-standard-json-input",
    contractname: `${fileKey}:${contractName ?? project.contract}`,
    compilerversion: COMPILER,
    optimizationUsed: "1",
    runs: "200",
    licenseType: "1", // MIT
  });
  const res = await fetch(`${EXPLORER}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const body = await res.json().catch(() => ({}));
  console.log(`${address}: ${res.status}`, body.message ?? JSON.stringify(body));
  return res.ok && body.status !== "0";
}

if (!(await verify(deployed.impl))) process.exit(1);

if (process.argv.includes("--proxy")) {
  // Verify the ERC1967 proxy itself: source = proxy.sol stub + lib imports.
  const proxySources = { "proxy.sol": input.sources["proxy.sol"] };
  const walked = new Set();
  const walk = (p) => {
    if (walked.has(p)) return;
    walked.add(p);
    const r = find(p);
    if (r.error) return;
    proxySources[p] = { content: r.contents };
    for (const im of r.contents.matchAll(/^import\s+[^"']*["']([^"']+)["']/gm)) walk(im[1]);
  };
  walk("openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol");
  const proxySubmit = {
    language: "Solidity",
    sources: proxySources,
    settings: { optimizer: { enabled: true, runs: 200 } },
  };
  const params = new URLSearchParams({
    module: "contract",
    action: "verifysourcecode",
    contractaddress: deployed.proxy,
    sourceCode: JSON.stringify(proxySubmit),
    codeformat: "solidity-standard-json-input",
    contractname: "proxy.sol:ERC1967Proxy",
    compilerversion: COMPILER,
    optimizationUsed: "1",
    runs: "200",
    licenseType: "1",
  });
  const res2 = await fetch(`${EXPLORER}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const body2 = await res2.json().catch(() => ({}));
  console.log(`${deployed.proxy} (proxy): ${res2.status}`, body2.message ?? JSON.stringify(body2));
}
