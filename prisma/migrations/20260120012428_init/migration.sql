-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "BlackjackGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "mainBet" REAL NOT NULL,
    "perfectPairsBet" REAL NOT NULL DEFAULT 0,
    "insuranceBet" REAL NOT NULL DEFAULT 0,
    "initialState" TEXT NOT NULL,
    "finalState" TEXT,
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "outcome" TEXT,
    "payout" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "BlackjackGame_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "fee" REAL NOT NULL DEFAULT 0,
    "txHash" TEXT,
    "address" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "Transaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeoCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ipAddress" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_walletAddress_key" ON "Session"("walletAddress");

-- CreateIndex
CREATE INDEX "Session_walletAddress_idx" ON "Session"("walletAddress");

-- CreateIndex
CREATE INDEX "BlackjackGame_sessionId_idx" ON "BlackjackGame"("sessionId");

-- CreateIndex
CREATE INDEX "BlackjackGame_serverSeedHash_idx" ON "BlackjackGame"("serverSeedHash");

-- CreateIndex
CREATE INDEX "BlackjackGame_status_idx" ON "BlackjackGame"("status");

-- CreateIndex
CREATE INDEX "Transaction_sessionId_idx" ON "Transaction"("sessionId");

-- CreateIndex
CREATE INDEX "Transaction_txHash_idx" ON "Transaction"("txHash");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "GeoCheck_ipAddress_idx" ON "GeoCheck"("ipAddress");

-- CreateIndex
CREATE INDEX "GeoCheck_createdAt_idx" ON "GeoCheck"("createdAt");
