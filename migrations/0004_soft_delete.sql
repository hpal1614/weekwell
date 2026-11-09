-- Deleting a spending entry hides it instead of erasing it, so it can be undone
-- and an Up purchase you deleted is never synced back in.
ALTER TABLE weekwell_transactions ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
