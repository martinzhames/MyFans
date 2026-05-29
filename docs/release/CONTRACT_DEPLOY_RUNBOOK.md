# Contract Deploy Runbook

Step-by-step guide for deploying MyFans smart contracts to futurenet, testnet, or mainnet.
Follow this runbook alongside the [Contract Release Checklist](./contract-release-checklist.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Build & Validate](#3-build--validate)
4. [Dry-Run Validation](#4-dry-run-validation)
5. [Deploy to Futurenet / Testnet](#5-deploy-to-futurenet--testnet)
6. [Deploy to Mainnet](#6-deploy-to-mainnet)
7. [Post-Deploy Verification](#7-post-deploy-verification)
8. [Update Backend & Frontend Config](#8-update-backend--frontend-config)
9. [Rollback Procedure](#9-rollback-procedure)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Required Tools

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Rust | 1.74 | `rustup update stable` |
| `wasm32-unknown-unknown` target | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI (`stellar`) | latest | `cargo install --locked stellar-cli` |
| `jq` | any | `apt install jq` / `brew install jq` |

Verify all tools are available:

```bash
rustc --version
cargo --version
stellar --version
jq --version
```

### Required Credentials

- A funded Stellar identity for the target network (see [Secret Management](../SECRET_MANAGEMENT.md)).
- For **mainnet**: the deployer identity must be pre-funded with real XLM. Auto-funding is disabled.

### Required Permissions

- Write access to the repository (to commit `deployed.json` and `.env.deployed`).
- Approval from contract, backend, and frontend owners (see [Release Checklist](./contract-release-checklist.md)).

---

## 2. Environment Setup

### 2.1 Clone and enter the contract directory

```bash
git clone git@github.com:MyFanss/MyFans.git
cd MyFans/contract
```

### 2.2 Configure the Stellar identity

**Futurenet / Testnet** (auto-funded):

```bash
stellar keys generate myfans-deployer \
  --network testnet \
  --rpc-url https://rpc-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"
```

**Mainnet** (manual funding required):

```bash
stellar keys generate myfans-deployer
# Fund the account externally, then verify:
stellar keys public-key myfans-deployer
```

### 2.3 Verify the identity is funded

```bash
stellar keys public-key myfans-deployer
# Use the public key to check balance on the Stellar explorer or via:
stellar account show <PUBLIC_KEY> --network testnet
```

---

## 3. Build & Validate

Run all checks before any deploy attempt. These are the same checks CI runs.

```bash
# From the contract/ directory
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
cargo build --release --target wasm32-unknown-unknown
```

Verify WASM artifacts were produced:

```bash
find target/wasm32-unknown-unknown/release -maxdepth 1 -name '*.wasm' \
  -exec bash -c 'echo "$(basename {}) — $(du -sh {} | cut -f1)"' \;
```

Expected output (one line per contract):

```
myfans_token.wasm — <size>
creator_registry.wasm — <size>
subscription.wasm — <size>
content_access.wasm — <size>
earnings.wasm — <size>
```

### ABI Snapshot Check

```bash
./scripts/snapshot-abi.sh --check
```

If snapshots are stale, regenerate and commit them before deploying:

```bash
./scripts/snapshot-abi.sh
git add abi-snapshots/
git commit -m "chore(contract): refresh ABI snapshots"
```

---

## 4. Dry-Run Validation

Always run a dry-run first. This validates the build and config without submitting any transactions.

```bash
./scripts/deploy.sh --network testnet --dry-run
```

Expected output:

```
[deploy] *** DRY-RUN MODE — no transactions will be submitted ***
[deploy] network=testnet
[deploy] rpc=https://rpc-testnet.stellar.org:443
[deploy] building contracts
[deploy] validating WASM artifacts
[deploy] found: target/wasm32-unknown-unknown/release/myfans_token.wasm
[deploy] found: target/wasm32-unknown-unknown/release/creator_registry.wasm
[deploy] found: target/wasm32-unknown-unknown/release/subscription.wasm
[deploy] found: target/wasm32-unknown-unknown/release/content_access.wasm
[deploy] found: target/wasm32-unknown-unknown/release/earnings.wasm
[deploy] dry-run passed — build and config are valid
```

If the dry-run fails, resolve the error before proceeding.

---

## 5. Deploy to Futurenet / Testnet

```bash
./scripts/deploy.sh --network testnet --source myfans-deployer
```

The script will:

1. Add the network profile to the Stellar CLI config (if not already present).
2. Fund the deployer identity from the testnet faucet.
3. Build all contract packages.
4. Deploy each contract in dependency order:
   - `myfans-token`
   - `creator-registry`
   - `subscription` (depends on token)
   - `content-access` (depends on token)
   - `earnings`
5. Initialize each contract with the deployer as admin.
6. Run post-deploy smoke tests.
7. Write `deployed.json` and `.env.deployed` to `contract/`.

### Expected Output (abbreviated)

```
[deploy] network=testnet
[deploy] source=G...
[deploy] building contracts
[deploy] deploying myfans-token
[deploy] deploying creator-registry
[deploy] deploying subscription
[deploy] deploying content-access
[deploy] deploying earnings
[deploy] initializing myfans-token
[deploy] initializing creator-registry
[deploy] initializing subscription (depends on token)
[deploy] initializing content-access (depends on token)
[deploy] initializing earnings
[deploy] running post-deploy smoke tests
[deploy] smoke ok: token.admin
[deploy] smoke ok: subscription.is-paused
[deploy] smoke ok: content-access.has-access
[deploy] smoke ok: earnings.admin
[deploy] wrote contract/deployed.json
[deploy] wrote contract/.env.deployed
[deploy] verification passed
```

### Capture the Contract IDs

```bash
cat contract/deployed.json | jq '.contracts'
```

---

## 6. Deploy to Mainnet

> ⚠️ **Mainnet deploys are irreversible.** Complete all testnet verification and obtain all sign-offs from the [Release Checklist](./contract-release-checklist.md) before proceeding.

```bash
./scripts/deploy.sh \
  --network mainnet \
  --source myfans-deployer \
  --no-fund
```

The `--no-fund` flag is required for mainnet (auto-funding is disabled). Ensure the deployer account has sufficient XLM before running.

### Mainnet Checklist (before running)

- [ ] Testnet deploy verified and smoke tests passed
- [ ] All sign-offs obtained (contract, backend, frontend, security)
- [ ] Deployer account funded with real XLM
- [ ] Rollback plan prepared (see [Section 9](#9-rollback-procedure))
- [ ] Maintenance window communicated to stakeholders

---

## 7. Post-Deploy Verification

### 7.1 Inspect the deploy output

```bash
cat contract/deployed.json | jq .
```

Verify:
- `schemaVersion` is `"1.0.0"`
- `network` matches the target network
- All five contract IDs are present and non-empty
- `verification` block shows expected values (admin address, `false` for `subscriptionsPaused`, etc.)

### 7.2 Manual smoke tests

```bash
# Verify token admin
stellar contract invoke \
  --id <TOKEN_CONTRACT_ID> \
  --network testnet \
  --source myfans-deployer \
  --send no \
  -- admin

# Verify subscription is not paused
stellar contract invoke \
  --id <SUBSCRIPTION_CONTRACT_ID> \
  --network testnet \
  --source myfans-deployer \
  --send no \
  -- is-paused

# Verify content-access has-access returns false for a new address
stellar contract invoke \
  --id <CONTENT_ACCESS_CONTRACT_ID> \
  --network testnet \
  --source myfans-deployer \
  --send no \
  -- has-access \
  --buyer <DEPLOYER_PUBLIC_KEY> \
  --creator <DEPLOYER_PUBLIC_KEY> \
  --content-id 1
```

### 7.3 Run the release check script

```bash
./scripts/release-check.sh
```

---

## 8. Update Backend & Frontend Config

### 8.1 Copy the env file

```bash
# Copy the generated env file to the backend
cp contract/.env.deployed backend/.env.deployed
```

### 8.2 Update backend `.env`

Copy the canonical contract IDs from `contract/.env.deployed` into `backend/.env`:

```bash
# Example — replace with actual values from deployed.json
CONTRACT_ID_MYFANS_TOKEN=C...
CONTRACT_ID_CREATOR_REGISTRY=C...
CONTRACT_ID_SUBSCRIPTION=C...
CONTRACT_ID_CONTENT_ACCESS=C...
CONTRACT_ID_EARNINGS=C...
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://rpc-testnet.stellar.org:443
```

See [`contract/docs/DEPLOYED_ENV.md`](../../contract/docs/DEPLOYED_ENV.md) for the full variable reference and legacy alias mapping.

### 8.3 Update frontend `.env.local`

```bash
NEXT_PUBLIC_SUBSCRIPTION_CONTRACT_ID=C...
NEXT_PUBLIC_MYFANS_TOKEN_CONTRACT_ID=C...
NEXT_PUBLIC_CREATOR_REGISTRY_CONTRACT_ID=C...
NEXT_PUBLIC_CONTENT_ACCESS_CONTRACT_ID=C...
NEXT_PUBLIC_EARNINGS_CONTRACT_ID=C...
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

### 8.4 Commit the deploy output

```bash
git add contract/deployed.json
git commit -m "chore(contract): record testnet deploy output [YYYY-MM-DD]"
```

> `.env.deployed` is gitignored — do not commit it. It may contain the deployer secret key path.

### 8.5 Log the upgrade

Add an entry to [`docs/upgrade-log.md`](../upgrade-log.md) with:
- Date
- Network
- Contract IDs
- Summary of changes
- Deployer identity (public key only)

---

## 9. Rollback Procedure

Smart contracts on Stellar are **not upgradeable by default**. A "rollback" means redeploying the previous WASM and updating all config to point to the new contract IDs.

### 9.1 Identify the previous WASM

```bash
# Check out the previous release tag
git checkout <previous-release-tag>
cd contract
cargo build --release --target wasm32-unknown-unknown
```

### 9.2 Redeploy the previous version

```bash
./scripts/deploy.sh --network testnet --source myfans-deployer
```

### 9.3 Update config

Repeat [Section 8](#8-update-backend--frontend-config) with the new (rolled-back) contract IDs.

### 9.4 Use the rollback template

Fill in [`docs/release/ROLLBACK_TEMPLATE.md`](./ROLLBACK_TEMPLATE.md) and notify stakeholders.

---

## 10. Troubleshooting

### `stellar CLI is required`

Install the Stellar CLI:

```bash
cargo install --locked stellar-cli
```

### `Source account not found`

The deployer identity does not exist locally. Generate it:

```bash
stellar keys generate myfans-deployer --network testnet
```

### `Unable to locate wasm for package`

The WASM build failed or the target directory is missing. Rebuild:

```bash
cargo build --release --target wasm32-unknown-unknown
```

### `SMOKE FAIL: ...`

A post-deploy smoke test failed. The contract may not have initialized correctly. Check:
1. The deploy log for initialization errors.
2. That the correct WASM was deployed (check `deployed.json`).
3. That the deployer account had sufficient XLM for all transactions.

### `ABI snapshot missing or empty`

Run the snapshot script and commit the results:

```bash
./scripts/snapshot-abi.sh
git add abi-snapshots/
git commit -m "chore(contract): refresh ABI snapshots"
```

### Deploy fails mid-way

If the deploy script fails after some contracts are deployed but before others:
1. Note which contracts were successfully deployed (check the terminal output).
2. Do **not** re-run the full deploy script — it will deploy duplicate contracts.
3. Manually deploy the remaining contracts using `stellar contract deploy` and `stellar contract invoke`.
4. Update `deployed.json` manually with all contract IDs.
5. Run smoke tests manually (see [Section 7.2](#72-manual-smoke-tests)).

---

## Related Documents

- [Contract Release Checklist](./contract-release-checklist.md)
- [Rollback Template](./ROLLBACK_TEMPLATE.md)
- [Smoke Test Matrix](./SMOKE_TEST_MATRIX.md)
- [Contract Upgrade Governance](../CONTRACT_UPGRADE_GOVERNANCE.md)
- [Deployed Env Variable Reference](../../contract/docs/DEPLOYED_ENV.md)
- [Secret Management](../SECRET_MANAGEMENT.md)
- [Upgrade Log](../upgrade-log.md)
