-- CreateTable
CREATE TABLE "DepositWallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "transparentAddr" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "accountIndex" INTEGER NOT NULL DEFAULT 0,
    "addressIndex" INTEGER NOT NULL DEFAULT 0,
    "cachedBalance" REAL NOT NULL DEFAULT 0,
    "balanceUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepositWallet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeedCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockTimestamp" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "usedByGameId" TEXT,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BlackjackGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "mainBet" REAL NOT NULL,
    "perfectPairsBet" REAL NOT NULL DEFAULT 0,
    "insuranceBet" REAL NOT NULL DEFAULT 0,
    "initialState" TEXT NOT NULL,
    "finalState" TEXT,
    "actionHistory" TEXT NOT NULL DEFAULT '[]',
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "commitmentTxHash" TEXT,
    "commitmentBlock" INTEGER,
    "commitmentTimestamp" DATETIME,
    "verifiedOnChain" BOOLEAN NOT NULL DEFAULT false,
    "verificationTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "outcome" TEXT,
    "payout" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "BlackjackGame_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BlackjackGame" ("clientSeed", "completedAt", "createdAt", "finalState", "id", "initialState", "insuranceBet", "mainBet", "nonce", "outcome", "payout", "perfectPairsBet", "serverSeed", "serverSeedHash", "sessionId", "status") SELECT "clientSeed", "completedAt", "createdAt", "finalState", "id", "initialState", "insuranceBet", "mainBet", "nonce", "outcome", "payout", "perfectPairsBet", "serverSeed", "serverSeedHash", "sessionId", "status" FROM "BlackjackGame";
DROP TABLE "BlackjackGame";
ALTER TABLE "new_BlackjackGame" RENAME TO "BlackjackGame";
CREATE INDEX "BlackjackGame_sessionId_idx" ON "BlackjackGame"("sessionId");
CREATE INDEX "BlackjackGame_serverSeedHash_idx" ON "BlackjackGame"("serverSeedHash");
CREATE INDEX "BlackjackGame_status_idx" ON "BlackjackGame"("status");
CREATE INDEX "BlackjackGame_commitmentTxHash_idx" ON "BlackjackGame"("commitmentTxHash");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "withdrawalAddress" TEXT,
    "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
    "authTxHash" TEXT,
    "authConfirmedAt" DATETIME,
    "balance" REAL NOT NULL DEFAULT 0,
    "totalDeposited" REAL NOT NULL DEFAULT 0,
    "totalWithdrawn" REAL NOT NULL DEFAULT 0,
    "totalWagered" REAL NOT NULL DEFAULT 0,
    "totalWon" REAL NOT NULL DEFAULT 0,
    "depositLimit" REAL,
    "lossLimit" REAL,
    "sessionLimit" INTEGER,
    "excludedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Session" ("balance", "createdAt", "depositLimit", "excludedUntil", "id", "lastActiveAt", "lossLimit", "sessionLimit", "totalDeposited", "totalWagered", "totalWithdrawn", "totalWon", "updatedAt", "walletAddress") SELECT "balance", "createdAt", "depositLimit", "excludedUntil", "id", "lastActiveAt", "lossLimit", "sessionLimit", "totalDeposited", "totalWagered", "totalWithdrawn", "totalWon", "updatedAt", "walletAddress" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_walletAddress_key" ON "Session"("walletAddress");
CREATE INDEX "Session_walletAddress_idx" ON "Session"("walletAddress");
CREATE INDEX "Session_withdrawalAddress_idx" ON "Session"("withdrawalAddress");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "fee" REAL NOT NULL DEFAULT 0,
    "txHash" TEXT,
    "address" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "isShielded" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "operationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "Transaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("address", "amount", "confirmations", "confirmedAt", "createdAt", "fee", "id", "sessionId", "status", "txHash", "type") SELECT "address", "amount", "confirmations", "confirmedAt", "createdAt", "fee", "id", "sessionId", "status", "txHash", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_sessionId_idx" ON "Transaction"("sessionId");
CREATE INDEX "Transaction_txHash_idx" ON "Transaction"("txHash");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_operationId_idx" ON "Transaction"("operationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DepositWallet_sessionId_key" ON "DepositWallet"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositWallet_transparentAddr_key" ON "DepositWallet"("transparentAddr");

-- CreateIndex
CREATE INDEX "DepositWallet_transparentAddr_idx" ON "DepositWallet"("transparentAddr");

-- CreateIndex
CREATE UNIQUE INDEX "SeedCommitment_serverSeed_key" ON "SeedCommitment"("serverSeed");

-- CreateIndex
CREATE UNIQUE INDEX "SeedCommitment_serverSeedHash_key" ON "SeedCommitment"("serverSeedHash");

-- CreateIndex
CREATE UNIQUE INDEX "SeedCommitment_txHash_key" ON "SeedCommitment"("txHash");

-- CreateIndex
CREATE INDEX "SeedCommitment_status_idx" ON "SeedCommitment"("status");

-- CreateIndex
CREATE INDEX "SeedCommitment_txHash_idx" ON "SeedCommitment"("txHash");

-- CreateIndex
CREATE INDEX "SeedCommitment_expiresAt_idx" ON "SeedCommitment"("expiresAt");
