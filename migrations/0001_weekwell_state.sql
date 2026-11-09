CREATE TABLE IF NOT EXISTS weekwell_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

