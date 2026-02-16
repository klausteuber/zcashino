-- Add idempotency key for withdrawal deduplication
ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT;

-- Dedupe legacy rows so unique index creation is safe
DELETE FROM "Transaction"
WHERE "txHash" IS NOT NULL
  AND rowid NOT IN (
    SELECT MIN(rowid)
    FROM "Transaction"
    WHERE "txHash" IS NOT NULL
    GROUP BY "sessionId", "type", "txHash"
  );

-- Uniqueness guardrails
CREATE UNIQUE INDEX "Transaction_sessionId_type_txHash_key"
  ON "Transaction"("sessionId", "type", "txHash");

CREATE UNIQUE INDEX "Transaction_sessionId_type_idempotencyKey_key"
  ON "Transaction"("sessionId", "type", "idempotencyKey");
