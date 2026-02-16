-- Add unified deposit address (nullable for legacy transparent-only wallets)
ALTER TABLE "DepositWallet" ADD COLUMN "unifiedAddr" TEXT;

-- Keep uniqueness for any non-null unified address
CREATE UNIQUE INDEX "DepositWallet_unifiedAddr_key" ON "DepositWallet"("unifiedAddr");

-- Query helper index
CREATE INDEX "DepositWallet_unifiedAddr_idx" ON "DepositWallet"("unifiedAddr");
