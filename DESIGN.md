# DESIGN.md — Durable Game Economy Service

## Architecture

Layered Node.js/Express service (Controller → Service → Model) backed by
PostgreSQL. Controllers are thin (parse request, call service, map result to
HTTP response). Services own transaction boundaries and business rules.
Models are pure parameterized SQL, no decisions.

## Datastore choice: PostgreSQL

Chosen over alternatives (SQLite, Redis, a hand-rolled append-only log) for
three reasons specific to this task's requirements:

- **Real ACID transactions with row-level locking**, needed to make a debit +
  grant atomic (requirement: purchase must be all-or-nothing).
- **Write-Ahead Log (WAL) durability** — a committed transaction survives a
  hard process kill by construction; Postgres fsyncs the WAL before
  acknowledging commit. This directly satisfies "state must outlive the
  process."
- **Unique constraints as the correctness primitive**, not application code —
  `claimed_rewards(player_id, reward_id)` PRIMARY KEY and
  `idempotency_keys(player_id, idempotency_key)` PRIMARY KEY make "claim once"
  and "dedupe once" enforceable even under concurrent writers, without
  relying on the application getting locking right.

Postgres is "boring and correct" rather than exotic — appropriate given the
priority stated in the assessment: correctness over cleverness.

## Schema

- `wallets` — current balance (cached/derived value; CHECK balance >= 0)
- `ledger` — append-only log of every balance delta (credit/debit), the
  actual source of truth; `SUM(delta) WHERE player_id = X` should always
  equal `wallets.balance`. This redundancy is deliberate — it's what makes a
  reconciliation/audit job possible (see RESILIENCE.md).
- `inventory` — granted items
- `claimed_rewards` — PK (player_id, reward_id) enforces claim-once at the DB
  level, not in application logic
- `idempotency_keys` — PK (player_id, idempotency_key), stores request hash +
  full response body/status, so a retry returns a byte-identical response

## Idempotency strategy

Every mutating request (`credit`, `purchase`) requires an `Idempotency-Key`
header. `claim` is naturally idempotent via the `claimed_rewards` unique
constraint and doesn't need a separate key.

Flow (all inside one DB transaction):
1. `SELECT ... FOR UPDATE` on `idempotency_keys` for `(player_id, key)`. The
   row lock means a concurrent duplicate request blocks here rather than
   both proceeding — this is what prevents two "simultaneous" retries from
   both re-executing.
2. If found: compare stored `request_hash` (SHA-256 of the body) against the
   incoming body's hash.
   - Match → return the stored `response_status`/`response_body` verbatim.
     No business logic re-runs.
   - Mismatch → reject with 422. Reusing a key with a different payload is
     treated as a client bug, not a legitimate retry — silently replaying
     the old response for a different request would be a worse failure mode
     than an explicit rejection.
3. If not found: execute the operation, then insert the response into
   `idempotency_keys` in the *same* transaction, before commit.

**Retention:** keys are kept indefinitely in this implementation for
simplicity and because the storage cost is small relative to a game
economy's value at stake. In production I'd add a TTL (e.g. 7–30 days,
matching how long a client is realistically expected to retry) and a
background job to prune old rows, since indefinite retention isn't
necessary for correctness — only for the retry window a client actually
needs.

## Atomicity & durability strategy

**What's atomic:** for `purchase`, the debit, the item grant, and the ledger
insert all happen inside one `BEGIN...COMMIT` block, using a single
connection. Nothing is visible to other transactions, and nothing survives a
crash, until `COMMIT` succeeds.

**The debit itself** is a single conditional `UPDATE`:

```sql
UPDATE wallets SET balance = balance - $1
WHERE player_id = $2 AND balance >= $1
RETURNING balance;
```

This is the core concurrency-correctness mechanism. Postgres takes a
row-level lock for the duration of this statement automatically — no
explicit `SELECT ... FOR UPDATE` is needed. Two concurrent purchases against
the same wallet serialize on this UPDATE: the second one's `WHERE balance >=
$1` clause is evaluated against the post-first-debit balance, so it correctly
fails if funds are now insufficient. This guarantees no double-spend, no lost
update, and balance never goes negative (also enforced redundantly by the
`CHECK (balance >= 0)` constraint as a belt-and-suspenders guard).

**What happens on `kill -9` mid-purchase:** the transaction is open but
uncommitted. Postgres discards uncommitted transactions on connection loss —
there is no possible state where the debit is applied but the grant isn't,
because both only become durable at `COMMIT`, atomically, together. On
restart, the wallet is exactly as it was before the purchase attempt began.
A retry of the same request (same idempotency key) then proceeds normally
and succeeds exactly once.

This is verified by an automated test (`tests/crash-recovery.test.js`) using
a deliberate test-only hook: `CRASH_TEST_DELAY_MS`, an environment variable
that — only when explicitly set — inserts an `await sleep()` between the
debit and the grant inside `purchaseService.js`. This has zero effect in
normal operation (the variable is never set outside the test harness) but
lets the test deterministically land a `taskkill /F` inside the
open-transaction window, rather than relying on random timing.

**Isolation level:** default `READ COMMITTED`. This is sufficient here
because the correctness-critical operation (the debit) is a single atomic
statement, not a read-then-write across multiple statements — so there's no
window for a classic read-committed anomaly (e.g. non-repeatable read) to
cause a double-spend. A stricter level like `SERIALIZABLE` would add
overhead (retry-on-conflict handling) without buying additional correctness
for this specific access pattern.

## API contract details

- **Currency unit:** integer, smallest denomination (no floats — avoids
  classic floating-point money bugs). Values stored as Postgres `BIGINT`.
- **`balance` in responses is returned as a string**, not a JS `number`.
  This is `pg`'s default behavior for `BIGINT` and is kept deliberately:
  silently coercing to `Number` risks precision loss above
  `Number.MAX_SAFE_INTEGER` (~9 quadrillion), which would undercut the
  entire premise of this assessment. Clients are expected to parse it as an
  arbitrary-precision value if needed.
- **Status codes:**
  - `200` — successful read, or a replayed idempotent response
  - `201` — new resource effect created (credit... actually credit returns
    200 since no new resource is created; purchase/claim return 201 on
    first success)
  - `409` — insufficient funds
  - `400` — malformed/missing/invalid input, missing Idempotency-Key
  - `422` — idempotency key reused with a different request body
- **Limits:** request bodies capped at 10kb; `amount`/`price` must be
  positive integers ≤ `Number.MAX_SAFE_INTEGER`; string fields
  (`itemId`, `reason`, `playerId`) capped at reasonable lengths (100–200
  chars) to prevent abuse/oversized-payload issues.

## Trade-offs / things I'd do differently in production

- Idempotency key TTL + pruning job (see above).
- `SERIALIZABLE` isolation with retry logic if the access pattern grew more
  complex (e.g. multi-wallet transfers).
- Structured logging/metrics on rejection reasons for operational
  visibility, not just HTTP status codes.

