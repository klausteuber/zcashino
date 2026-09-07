-- Cosmetic identity preference. Existing players retain a deterministic default avatar.
ALTER TABLE "PokerIdentity" ADD COLUMN "avatar" TEXT;
