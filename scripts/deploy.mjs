// Shared deploy pipeline for BOT Chain ecosystem mini-dApps.
// Usage:
//   node scripts/deploy.mjs --check          compile only (no key needed)
//   node scripts/deploy.mjs                  deploy impl + ERC1967 proxy to BOT mainnet
// Env: DEPLOYER_KEY (hex private key), RPC_URL?, plus whatever project.json initArgsEnv names.
import { JsonRpcProvider, Wallet, ContractFactory, Interface } from "ethers";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(readFileSync(resolve(ROOT, "scripts/project.json"), "utf8"));
const RPC = process.env.RPC_URL || "https://rpc.botchain.ai";
const CHAIN_ID = Number(process.env.CHAIN_ID || 677);

const find = (p) => {
  // resolve library namespaces → contracts/lib/<repo>/contracts/... and bare project imports
  const cands = [];
  const m = p.match(/^(@openzeppelin\/contracts(-upgradeable)?|openzeppelin-contracts(-upgradeable)?)\/(.+)$/);
  if (m) {
    const repo = m[2] || m[3] ? "openzeppelin-contracts-upgradeable" : "openzeppelin-contracts";
    cands.push(resolve(ROOT, "contracts/lib", repo, "contracts", m[4]));
  }
  cands.push(
    resolve(ROOT, "contracts", p),
    resolve(ROOT, "contracts", p.replace(/^\.\//, ""))
  );
  for (const base of cands) {
    if (existsSync(base)) return { contents: readFileSync(base, "utf8") };
  }
  return { error: "not found: " + p };
};

const sources = {};
sources[project.file.replace(/^contracts\//, "")] = { content: readFileSync(resolve(ROOT, project.file), "utf8") };
sources["proxy.sol"] = {
  content: 'import "openzeppelin-contracts/proxy/ERC1967/ERC1967Proxy.sol";',
};

const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
      },
    }),
    { import: find }
  )
);

if (out.errors?.some((e) => e.severity === "error")) {
  for (const e of out.errors.filter((e) => e.severity === "error")) console.error(e.formattedMessage);
  process.exit(1);
}
for (const e of out.errors?.filter((e) => e.severity === "warning") ?? []) console.warn(e.formattedMessage);

const fileKey = project.file.replace(/^contracts\//, "");
const C = out.contracts[fileKey]?.[project.contract];
if (!C) {
  console.error(`contract ${project.contract} not in ${fileKey}`, Object.keys(out.contracts[fileKey] ?? {}));
  process.exit(1);
}
let P;
for (const [unit, contracts] of Object.entries(out.contracts)) {
  if (contracts.ERC1967Proxy) P = contracts.ERC1967Proxy;
}
if (!P) { console.error("ERC1967Proxy not compiled"); process.exit(1); }
mkdirSync(resolve(ROOT, "artifacts"), { recursive: true });
writeFileSync(
  resolve(ROOT, "artifacts", `${project.contract}.json`),
  JSON.stringify({ abi: C.abi, bytecode: C.evm.bytecode.object }, null, 2)
);
console.log(`compiled ${project.contract}: ${(C.evm.bytecode.object.length / 2 - 0).toFixed(0)} bytes`);

if (process.argv.includes("--check")) {
  const fn = new Interface(C.abi);
  console.log("abi fns:", fn.fragments.filter((f) => f.type === "function").map((f) => f.name).join(", "));
  console.log("events:", fn.fragments.filter((f) => f.type === "event").map((f) => f.name).join(", "));
  process.exit(0);
}

const key = process.env.DEPLOYER_KEY;
if (!key) { console.error("DEPLOYER_KEY env required"); process.exit(1); }
const provider = new JsonRpcProvider(RPC, CHAIN_ID);
const wallet = new Wallet(key, provider);
const bal = await provider.getBalance(wallet.address);
console.log(`deployer ${wallet.address} balance ${Number(bal) / 1e18} BOT`);
if (bal === 0n) { console.error("unfunded"); process.exit(1); }

const initArgs = project.initArgsEnv.map((v) => process.env[v]);
if (initArgs.some((a) => a === undefined)) {
  console.error("missing init env:", project.initArgsEnv.filter((v) => !process.env[v]).join(", "));
  process.exit(1);
}
const iface = new Interface(C.abi);
const initData = iface.encodeFunctionData(project.initSignature, initArgs);

const impl = await (await new ContractFactory(C.abi, C.evm.bytecode.object, wallet).deploy()).waitForDeployment();
const implAddr = await impl.getAddress();
console.log("implementation:", implAddr);

const proxy = await (
  await new ContractFactory(P.abi, P.evm.bytecode.object, wallet).deploy(implAddr, initData)
).waitForDeployment();
const proxyAddr = await proxy.getAddress();
console.log("proxy (permanent address):", proxyAddr);
console.log(`explorer: https://scan.botchain.ai/address/${proxyAddr}`);

writeFileSync(
  resolve(ROOT, "deployed.json"),
  JSON.stringify({ contract: project.contract, impl: implAddr, proxy: proxyAddr, chainId: CHAIN_ID, deployedAt: new Date().toISOString() }, null, 2)
);

// emit the app's contract config so the UI is deploy-ready
const appLib = resolve(ROOT, "app/src/lib");
mkdirSync(appLib, { recursive: true });
writeFileSync(
  resolve(appLib, "contract.ts"),
  `// generated by scripts/deploy.mjs — ${new Date().toISOString()}\n` +
    `export const CONTRACT_ADDRESS: string = "${proxyAddr}";\n` +
    `export const CONTRACT_ABI = ${JSON.stringify(C.abi, null, 2)} as const;\n`
);
console.log("wrote deployed.json + app/src/lib/contract.ts");
