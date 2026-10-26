# ProofOfAI — Content Authenticity on BOT Chain

Creators hash a text, image or file in the browser before posting. The
keccak256 hash + timestamp + kind go on-chain; anyone can later verify the
content existed at that time. The file is never uploaded.

## Contract

`contracts/ProofOfAI.sol` — UUPS-upgradeable (ERC1967 proxy, stable address).

- `notarize(bytes32 contentHash, uint8 kind)` — kind: 0 text, 1 image, 2 other;
  duplicate hashes revert (`already notarized`) → `Notarized` event
- `verify(bytes32)` → `exists, author, timestamp, kind`
- `totalNotarized()`

## Contract deps

`contracts/lib/` vendors OpenZeppelin + forge-std (gitignored — copy from
`bot-oracle/contracts/lib` or `forge install` if Foundry is available).

## Deploy

```bash
npm install
cp .env.example .env           # fill DEPLOYER_KEY + OWNER_ADDRESS
npm run deploy
```

## App

```bash
cd app && npm install && npm run dev
```

Notarize panel (drag-and-drop file or paste text, kind auto-detected, overridable)
and a Verify panel showing author, timestamp and kind.
