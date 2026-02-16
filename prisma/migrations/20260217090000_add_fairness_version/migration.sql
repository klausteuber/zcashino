-- Add explicit fairness versioning for historical replay compatibility
ALTER TABLE "BlackjackGame" ADD COLUMN "fairnessVersion" TEXT NOT NULL DEFAULT 'legacy_mulberry_v1';
ALTER TABLE "VideoPokerGame" ADD COLUMN "fairnessVersion" TEXT NOT NULL DEFAULT 'legacy_mulberry_v1';
