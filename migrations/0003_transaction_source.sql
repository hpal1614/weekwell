-- Where each spending entry came from ('manual' or 'up'), and Up's id so a purchase is never added twice.
ALTER TABLE weekwell_transactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE weekwell_transactions ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS weekwell_transactions_external_id ON weekwell_transactions (external_id) WHERE external_id IS NOT NULL;
