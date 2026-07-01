-- migrations/001_init.sql

CREATE TABLE wallets (
  player_id   TEXT PRIMARY KEY,
  balance     BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger (
  id          BIGSERIAL PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES wallets(player_id),
  delta       BIGINT NOT NULL,           -- positive = credit, negative = debit
  reason      TEXT NOT NULL,             -- 'earn', 'purchase:<itemId>', 'refund', etc
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory (
  id          BIGSERIAL PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES wallets(player_id),
  item_id     TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claimed_rewards (
  player_id   TEXT NOT NULL,
  reward_id   TEXT NOT NULL,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, reward_id)     -- enforces claim-once at the DB level
);

CREATE TABLE idempotency_keys (
  player_id       TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash    TEXT NOT NULL,         -- hash of the request body, to detect key reuse w/ different payload
  response_status INT NOT NULL,
  response_body   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, idempotency_key)
);