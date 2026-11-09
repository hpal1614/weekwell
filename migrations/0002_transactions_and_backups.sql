-- 0001 may have been recorded without running (old runner bug), so repeat it safely.
CREATE TABLE IF NOT EXISTS weekwell_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every spending entry, kept forever so history and averages work.
CREATE TABLE IF NOT EXISTS weekwell_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_on date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  category text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekwell_transactions_occurred_on ON weekwell_transactions (occurred_on);

-- Automatic snapshots taken before anything risky (format upgrade, restore from file).
CREATE TABLE IF NOT EXISTS weekwell_backups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reason text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
