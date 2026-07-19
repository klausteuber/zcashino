-- Zallet identifies newly-created wallet accounts by UUID instead of the
-- legacy numeric ZIP-32 account index returned by zcashd.
ALTER TABLE "DepositWallet" ADD COLUMN "accountUuid" TEXT;

CREATE UNIQUE INDEX "DepositWallet_accountUuid_key" ON "DepositWallet"("accountUuid");
