# Wallet & Economy Service

A durable, exactly-once wallet/economy backend: earn currency, spend it in a
shop, claim a one-time reward. Built for correctness under crashes and
concurrent/duplicate requests — see DESIGN.md for the reasoning.

## Stack

Node.js (Express) + PostgreSQL. See DESIGN.md for why.

## Run it

Requires Docker Desktop running.

```bash
docker compose up --build
```

This starts Postgres and the API together. On first run, apply the schema:

```bash
docker compose exec -T db psql -U wallet -d wallet_db < migrations/001_init.sql
```

(On Windows PowerShell, use: `Get-Content migrations/001_init.sql | docker compose exec -T db psql -U wallet -d wallet_db`)

The API is now available at `http://localhost:3000`.

## API

All mutating endpoints require an `Idempotency-Key` header. Sending the same
request with the same key twice produces one effect and returns the same
response both times.

### Credit (simulate a battle payout)

```bash
curl -X POST http://localhost:3000/v1/wallets/player1/credit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-1" \
  -d '{"amount": 100, "reason": "battle_win"}'
```

### Purchase

```bash
curl -X POST http://localhost:3000/v1/wallets/player1/purchase \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-2" \
  -d '{"itemId": "sword", "price": 50}'
```

Returns `409` with `{"error": "insufficient_funds"}` if the balance can't
cover the price — no partial effect occurs.

### Claim a reward (once per player)

```bash
curl -X POST http://localhost:3000/v1/rewards/daily1/claim \
  -H "Content-Type: application/json" \
  -d '{"playerId": "player1"}'
```

### Read wallet state

```bash
curl http://localhost:3000/v1/wallets/player1
```

Returns:
```json
{ "balance": "50", "inventory": ["sword"], "claimedRewards": ["daily1"] }
```

Note: `balance` is a string — see DESIGN.md for why (BIGINT precision).

## Running tests

Tests run against a separate database (`wallet_test_db`) so they never touch
manually-tested data in `wallet_db`.

```bash
docker compose exec db psql -U wallet -d wallet_db -c "CREATE DATABASE wallet_test_db;"
docker compose exec -T db psql -U wallet -d wallet_test_db < migrations/001_init.sql
npm install
npm test
```

Test suites:
- `tests/idempotency.test.js` — duplicate requests produce a single effect
- `tests/concurrency.test.js` — concurrent purchases against a limited
  balance never overspend
- `tests/crash-recovery.test.js` — hard-kills the process mid-transaction
  and asserts no partial effect after restart

## Documentation

- `DESIGN.md` — architecture, datastore rationale, idempotency/atomicity/
  durability strategy, API contract details
- `RESILIENCE.md` — distributed-transaction design if inventory becomes a
  separate service, and a bug-detection/correction approach
- `AI_DISCLOSURE.md` — AI tool usage disclosure