-- Forward-only repair for schema additions missing from the historical chain.
-- Preserve installations that already created these tables and indexes.
-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'analyst',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "lastLoginIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ZecPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "priceUsd" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'coingecko',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "config" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PromotionRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promotionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "bonusAmount" REAL NOT NULL,
    "wagered" REAL NOT NULL DEFAULT 0,
    "wagerTarget" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminUser_username_idx" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminUser_role_idx" ON "AdminUser"("role");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ZecPriceSnapshot_date_key" ON "ZecPriceSnapshot"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ZecPriceSnapshot_date_idx" ON "ZecPriceSnapshot"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Promotion_status_idx" ON "Promotion"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Promotion_type_idx" ON "Promotion"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRedemption_promotionId_idx" ON "PromotionRedemption"("promotionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRedemption_sessionId_idx" ON "PromotionRedemption"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRedemption_status_idx" ON "PromotionRedemption"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_type_status_idx" ON "Transaction"("type", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_type_createdAt_idx" ON "Transaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoPokerGame_completedAt_idx" ON "VideoPokerGame"("completedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoPokerGame_handRank_idx" ON "VideoPokerGame"("handRank");


CREATE INDEX IF NOT EXISTS "BlackjackGame_sessionId_idx" ON "BlackjackGame"("sessionId");
CREATE INDEX IF NOT EXISTS "BlackjackGame_serverSeedHash_idx" ON "BlackjackGame"("serverSeedHash");
CREATE INDEX IF NOT EXISTS "BlackjackGame_status_idx" ON "BlackjackGame"("status");
CREATE INDEX IF NOT EXISTS "BlackjackGame_commitmentTxHash_idx" ON "BlackjackGame"("commitmentTxHash");
CREATE INDEX IF NOT EXISTS "BlackjackGame_fairnessSeedId_idx" ON "BlackjackGame"("fairnessSeedId");
CREATE INDEX IF NOT EXISTS "BlackjackGame_fairnessMode_idx" ON "BlackjackGame"("fairnessMode");
CREATE INDEX IF NOT EXISTS "BlackjackGame_completedAt_idx" ON "BlackjackGame"("completedAt");
CREATE INDEX IF NOT EXISTS "BlackjackGame_outcome_idx" ON "BlackjackGame"("outcome");
CREATE INDEX IF NOT EXISTS "BlackjackGame_payout_idx" ON "BlackjackGame"("payout");
