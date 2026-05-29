# API Quickstart for New Contributors

Everything you need to get the MyFans backend API running locally, make your first request, and understand the key conventions before writing code.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Setup](#2-local-setup)
3. [Environment Variables](#3-environment-variables)
4. [Start the Server](#4-start-the-server)
5. [Interactive API Docs (Swagger)](#5-interactive-api-docs-swagger)
6. [Authentication Flow](#6-authentication-flow)
7. [Making Your First Request](#7-making-your-first-request)
8. [Key API Conventions](#8-key-api-conventions)
9. [Running Tests](#9-running-tests)
10. [Common Errors & Fixes](#10-common-errors--fixes)
11. [Where to Go Next](#11-where-to-go-next)

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | `node --version` |
| npm | 9+ | bundled with Node.js |
| PostgreSQL | 14+ | or Docker (see below) |
| Git | any | — |

You do **not** need Rust, the Stellar CLI, or a Freighter wallet to run the backend API locally.

---

## 2. Local Setup

```bash
# Clone the repo (if you haven't already)
git clone git@github.com:MyFanss/MyFans.git
cd MyFans/backend

# Install dependencies
npm install
```

### Start PostgreSQL

**Option A — Docker (recommended for contributors):**

```bash
docker run -d \
  --name myfans-postgres \
  -p 5432:5432 \
  -e POSTGRES_USER=myfans \
  -e POSTGRES_PASSWORD=myfans \
  -e POSTGRES_DB=myfans \
  postgres:16-alpine
```

**Option B — Local PostgreSQL:**

```bash
createuser -s myfans
createdb -O myfans myfans
psql -c "ALTER USER myfans WITH PASSWORD 'myfans';"
```

---

## 3. Environment Variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

Minimum `.env` for local development:

```dotenv
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=myfans
DB_PASSWORD=myfans
DB_NAME=myfans

# Auth — generate a random secret:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=replace-with-a-random-64-char-hex-string

# Stellar (testnet is fine for local dev)
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Startup probes — degraded mode skips hard failures on missing RPC/contract
STARTUP_MODE=degraded
```

> All required variables are documented in `.env.example`. The app will refuse to start if any `REQUIRED` variable is missing.

---

## 4. Start the Server

```bash
npm run start:dev
```

The server starts on `http://localhost:3000` (or the `PORT` you set).

You should see output like:

```
[Nest] LOG [NestApplication] Nest application successfully started
```

### Health Check

```bash
curl http://localhost:3000/v1/health
# {"status":"ok"}
```

---

## 5. Interactive API Docs (Swagger)

Once the server is running, open:

```
http://localhost:3000/api-docs
```

Swagger UI lists every endpoint, shows request/response schemas, and lets you make live requests directly from the browser. This is the fastest way to explore the API.

---

## 6. Authentication Flow

The API uses **JWT bearer tokens**. Most endpoints require authentication.

### Step 1 — Get a CSRF token

```bash
curl -c cookies.txt http://localhost:3000/v1/csrf/token
# {"csrfToken":"<token>"}
```

### Step 2 — Register or log in

The backend uses wallet-based authentication (Stellar public key + signed challenge). For local development without a wallet, use the test endpoints if available, or seed a user directly in the database.

**Wallet auth flow:**

```bash
# 1. Request a challenge for your wallet address
curl -X POST http://localhost:3000/v1/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"address": "<YOUR_STELLAR_PUBLIC_KEY>"}'
# {"challenge": "<nonce>"}

# 2. Sign the challenge with your wallet (Freighter or stellar-sdk)
# 3. Submit the signed challenge
curl -X POST http://localhost:3000/v1/auth/verify \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -H "X-CSRF-Token: <csrfToken>" \
  -d '{"address": "<PUBLIC_KEY>", "signature": "<SIGNATURE>", "challenge": "<NONCE>"}'
# {"access_token": "<JWT>"}
```

### Step 3 — Use the token

```bash
export TOKEN="<JWT from step 2>"
curl http://localhost:3000/v1/creators \
  -H "Authorization: Bearer $TOKEN"
```

---

## 7. Making Your First Request

### List creators (public endpoint)

```bash
curl http://localhost:3000/v1/creators
```

### Get your profile (authenticated)

```bash
curl http://localhost:3000/v1/creators/me \
  -H "Authorization: Bearer $TOKEN"
```

### Create a subscription plan (authenticated, idempotent)

```bash
curl -X POST http://localhost:3000/v1/creators/plans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrfToken>" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name": "Basic", "price": 5, "interval": "monthly"}'
```

> **Idempotency-Key** is required on all `POST` and `PUT` requests to state-mutating endpoints. Use a UUID. See [`IDEMPOTENCY.md`](./IDEMPOTENCY.md) for details.

---

## 8. Key API Conventions

### Versioning

All routes are prefixed with `/v1/`. The version is set via URI versioning in NestJS.

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization: Bearer <token>` | Most endpoints | JWT from auth flow |
| `Content-Type: application/json` | POST/PUT/PATCH | Always set for JSON bodies |
| `X-CSRF-Token: <token>` | State-mutating requests | Double-submit CSRF protection |
| `Idempotency-Key: <uuid>` | POST/PUT on listed routes | Prevents duplicate operations |

### Response Shape

Successful responses return the resource directly (no wrapper envelope):

```json
{ "id": "...", "name": "...", ... }
```

Error responses follow NestJS defaults:

```json
{
  "statusCode": 400,
  "message": ["name must not be empty"],
  "error": "Bad Request"
}
```

### Rate Limiting

| Tier | Limit | Window |
|------|-------|--------|
| Auth endpoints | 5 req | 60 s |
| Short | 10 req | 60 s |
| Medium | 50 req | 60 s |
| Long (default) | 100 req | 60 s |

When rate-limited you receive `429 Too Many Requests` with a `Retry-After` header.
See [`RATE_LIMITING.md`](./RATE_LIMITING.md) for full details.

### Security Headers

Every response includes security headers (CSP, HSTS in production, X-Frame-Options, etc.).
See [`CORS_AND_SECURITY_HEADERS.md`](./CORS_AND_SECURITY_HEADERS.md) for the full list.

### Correlation IDs

Every request gets a `X-Correlation-ID` header in the response. Include it in bug reports — it links the request to backend logs.

---

## 9. Running Tests

```bash
# Unit tests (fast, no DB required)
npm test

# Unit tests with coverage
npm run test:cov

# Migration integration tests (requires PostgreSQL)
npm run test:migrations

# E2E tests (requires PostgreSQL)
npm run test:e2e

# Lint
npm run lint
```

Tests live alongside source files as `*.spec.ts`. E2E tests are in `test/`.

---

## 10. Common Errors & Fixes

### `Error: Missing required environment variable: JWT_SECRET`

Set `JWT_SECRET` in your `.env` file. Generate a value with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### `ECONNREFUSED 127.0.0.1:5432`

PostgreSQL is not running. Start it with Docker:

```bash
docker start myfans-postgres
# or, if not created yet:
docker run -d --name myfans-postgres -p 5432:5432 \
  -e POSTGRES_USER=myfans -e POSTGRES_PASSWORD=myfans -e POSTGRES_DB=myfans \
  postgres:16-alpine
```

### `403 Forbidden` on POST/PUT/DELETE

You are missing the CSRF token. Fetch it first:

```bash
curl -c cookies.txt http://localhost:3000/v1/csrf/token
```

Then include `-b cookies.txt -H "X-CSRF-Token: <token>"` in your request.

### `429 Too Many Requests`

You have exceeded the rate limit. Wait for the `Retry-After` period or reduce request frequency.

### `401 Unauthorized`

Your JWT has expired or is missing. Re-authenticate to get a fresh token.

### TypeORM migration errors on startup

Run migrations manually:

```bash
npm run migration:run
```

---

## 11. Where to Go Next

| Topic | Document |
|-------|----------|
| Full environment variable reference | [`../.env.example`](../.env.example) |
| CORS and security headers | [`CORS_AND_SECURITY_HEADERS.md`](./CORS_AND_SECURITY_HEADERS.md) |
| Rate limiting | [`RATE_LIMITING.md`](./RATE_LIMITING.md) |
| Idempotency | [`IDEMPOTENCY.md`](./IDEMPOTENCY.md) |
| Secret management | [`SECRET_MANAGEMENT.md`](./SECRET_MANAGEMENT.md) |
| SLA metrics | [`SLA_METRICS.md`](./SLA_METRICS.md) |
| Contract deploy | [`../../docs/release/CONTRACT_DEPLOY_RUNBOOK.md`](../../docs/release/CONTRACT_DEPLOY_RUNBOOK.md) |
| Full quickstart (frontend + contracts) | [`../../QUICKSTART.md`](../../QUICKSTART.md) |
| Contributing guide | [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) |
