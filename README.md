# coffee-journal-api

Sync backend for the [Bloom coffee journal app](../coffee-app). A small
Node/Effect.ts service that syncs a user's beans, grinders, and brews across
their devices using **per-record last-write-wins** over a single delta endpoint.

Design doc: `Sync-Protocol` in the project wiki (Phase 2 Step 2).

## Stack

- **Effect** (`effect`) — runtime, layers, `effect/Schema` wire contracts
- **@effect/platform** + **@effect/platform-node** — HTTP server/router
- **postgres** (porsager) — Postgres access
- **jose** — Keycloak JWKS access-token verification
- Dev shell via `flake.nix` (`nodejs_22` + `postgresql_16`); run everything with
  `nix develop -c <cmd>` (no global Node on this machine).

## Endpoints

- `GET /health` → `ok`
- `POST /sync` (auth required) — push local changes + pull server changes in one
  round trip. Request `{ since, changes[] }`, response
  `{ applied[], rejected[], changes[], cursor }`. See `src/schema.ts`.

Conflict resolution is last-write-wins on each record's `updatedAt`
(client wall-clock ms). `server_seq` (a global Postgres sequence) is the pull
cursor — clients send the highest `cursor` they've seen as the next `since`.
Deletes are tombstones (`deleted: true`). A grinder carries its presets inside
its opaque `payload`, so there's no child-row sync.

## Subscription gate (entitlements)

`POST /sync` requires an entitlement: the app is free/local-only, sync is the
paid feature. The gate reads the local `entitlements` read-model (fail-closed —
no row = 403 `{"error":"subscription_required"}`), which is fed by
`SubscriptionEntitlementChanged` events from the shared Payments.Gateway over
RabbitMQ (exchange `payments-direct`, routing key
`subscription.entitlement.changed`, queue `coffee-journal.entitlements` + DLQ;
PascalCase JSON; deduped on `MessageId`; events for other products are skipped).
Entitled syncs also JIT-upsert a thin `users` row (sub/email/first-seen/last-sync
— ops bookkeeping only). `RABBITMQ_URL` unset = consumer disabled.

**Granting yourself sync before the payments wiring exists** (e.g. for the
login E2E): find your Keycloak `sub` (in `/bff/user` claims), then either
insert directly —

```sh
docker exec coffee-journal-postgres psql -U postgres -d coffee_journal -c \
  "INSERT INTO entitlements (user_id, product_id, has_access, status)
   VALUES ('<your-sub>', 'coffee-journal', true, 'active')
   ON CONFLICT (user_id) DO UPDATE SET has_access = true, status = 'active';"
```

— or publish a real `SubscriptionEntitlementChanged` event to `payments-direct`
(management UI at http://localhost:15672, user/pass from `.env`, defaults
`bloom`/`bloom`).

## Auth

`POST /sync` resolves the user from the `Authorization: Bearer <jwt>` header,
verified against the Keycloak realm JWKS (`KEYCLOAK_JWKS_URL` / `KEYCLOAK_ISSUER`).

When `KEYCLOAK_JWKS_URL` is unset the service runs in **dev mode** and trusts an
`x-dev-user: <id>` header instead — so sync can be exercised before the Keycloak
client is wired up (Step 3). Never deploy without `KEYCLOAK_JWKS_URL` set.

## Full local stack (docker compose)

`docker-compose.yml` runs everything: postgres, redis, this API, the app
(built from the sibling `../coffee-app` checkout), and a `coffee-journal-bff`
instance (the reusable `creativefree/product-feedback-bff` image). Browser
entrypoint: **http://localhost:5224** (the BFF serves the app, handles
Keycloak login at `/bff/*`, and proxies `/api/*` with the Bearer token).

```sh
cp .env.example .env    # set COFFEE_JOURNAL_CLIENT_SECRET
docker compose up -d --build
```

**Stripe webhooks locally:** the happy path (checkout → success page) works
without webhooks — the success page's `billing/sync` call resyncs from Stripe
directly. For the full loop incl. automatic cancellation revoking sync, forward
webhooks with the Stripe CLI:

```sh
stripe listen --forward-to localhost:5224/api/billing/webhook
# then put the whsec_… secret it PRINTS (not a dashboard secret) into .env as
# STRIPE_WEBHOOK_SECRET and restart: docker compose up -d payments-gateway
```

**One-time Keycloak setup (manual):** create a confidential client
`coffee-journal` in the shared `production` realm on the hosted identity
server (same pattern as the `dopamine-kick` client), with redirect URI
`http://localhost:5224/*` for local dev, and put its secret in `.env` as
`COFFEE_JOURNAL_CLIENT_SECRET`. Until then `/bff/login` 500s with a Keycloak
`invalid_request` (the rest of the stack works without it; sync just stays
unauthenticated).

## Local development

```sh
# 1. Postgres (any local instance; example on port 5433)
nix develop -c initdb -D .pgdata -U postgres --auth=trust
nix develop -c pg_ctl -D .pgdata -o "-p 5433" -l pg.log start
nix develop -c createdb -h localhost -p 5433 -U postgres coffee_journal

# 2. install + configure + run
nix develop -c npm install
cp .env.example .env        # optional — edit as needed (gitignored)
nix develop -c npm run dev  # loads .env if present (--env-file-if-exists)

# 3. smoke test (dev auth)
curl -s -X POST localhost:3001/sync -H 'x-dev-user: me' \
  -H 'content-type: application/json' \
  -d '{"since":0,"changes":[{"entity":"bean","id":"b_1","updatedAt":1,"deleted":false,"payload":{"name":"Suke Quto"}}]}'
```

The `sync_records` table + `sync_seq` sequence are created automatically on boot.

## Env

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP listen port |
| `DATABASE_URL` | `postgres://localhost:5432/coffee_journal` | Postgres connection |
| `KEYCLOAK_JWKS_URL` | *(empty → dev mode)* | Realm JWKS endpoint |
| `KEYCLOAK_ISSUER` | *(empty)* | Expected token issuer |
| `S3_FORCE_PATH_STYLE` | `false` | Use path-style S3 addressing for compatible local/test services |

## Scripts

- `npm run dev` — watch-run with tsx
- `npm test` — strict-check and run the Vitest integration suite against a throwaway Postgres 17 Testcontainer (Docker required)
- `npm run test:types` — strict-check production and test TypeScript
- `npm run check` — `tsc --noEmit`
- `npm run build` — compile to `dist/`
- `npm start` — run once

## Integration tests

The integration harness starts disposable Postgres 17, RabbitMQ, and MinIO
containers once for the test run, launches the real API process on an ephemeral
local port, runs the normal startup migrations, and exercises the public HTTP
contract. Keycloak alone uses the existing development-auth seam (`x-dev-user`).
Tests are split by capability under `tests/integration/`; infrastructure lifecycle
is owned once by the small `integration.test.ts` suite composition root.

Current coverage freezes health, authentication, fail-closed entitlement access,
idempotent user registration, both sync route aliases, LWW equal-timestamp
rejection, tombstones, cursors, per-user isolation, the complete photo lifecycle,
and RabbitMQ entitlement projection/filtering/deduplication. Docker must be running:

```sh
nix develop -c npm test
```
