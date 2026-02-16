-- Add session-scoped fairness stream tables and support columns.

PRAGMA foreign_keys=OFF;

-- Rebuild BlackjackGame so serverSeed can be nullable and new fairness metadata is available.
CREATE TABLE "new_BlackjackGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "mainBet" REAL NOT NULL,
    "perfectPairsBet" REAL NOT NULL DEFAULT 0,
    "insuranceBet" REAL NOT NULL DEFAULT 0,
    "initialState" TEXT NOT NULL,
    "finalState" TEXT,
    "actionHistory" TEXT NOT NULL DEFAULT '[]',
    "serverSeed" TEXT,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "fairnessVersion" TEXT NOT NULL DEFAULT 'legacy_mulberry_v1',
    "fairnessSeedId" TEXT,
    "fairnessMode" TEXT,
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

INSERT INTO "new_BlackjackGame" (
    "id",
    "sessionId",
    "mainBet",
    "perfectPairsBet",
    "insuranceBet",
    "initialState",
    "finalState",
    "actionHistory",
    "serverSeed",
    "serverSeedHash",
    "clientSeed",
    "nonce",
    "fairnessVersion",
    "commitmentTxHash",
    "commitmentBlock",
    "commitmentTimestamp",
    "verifiedOnChain",
    "verificationTxHash",
    "status",
    "outcome",
    "payout",
    "createdAt",
    "completedAt"
)
SELECT
    "id",
    "sessionId",
    "mainBet",
    "perfectPairsBet",
    "insuranceBet",
    "initialState",
    "finalState",
    "actionHistory",
    "serverSeed",
    "serverSeedHash",
    "clientSeed",
    "nonce",
    "fairnessVersion",
    "commitmentTxHash",
    "commitmentBlock",
    "commitmentTimestamp",
    "verifiedOnChain",
    "verificationTxHash",
    "status",
    "outcome",
    "payout",
    "createdAt",
    "completedAt"
FROM "BlackjackGame";

DROP TABLE "BlackjackGame";
ALTER TABLE "new_BlackjackGame" RENAME TO "BlackjackGame";

CREATE INDEX "BlackjackGame_sessionId_idx" ON "BlackjackGame"("sessionId");
CREATE INDEX "BlackjackGame_serverSeedHash_idx" ON "BlackjackGame"("serverSeedHash");
CREATE INDEX "BlackjackGame_status_idx" ON "BlackjackGame"("status");
CREATE INDEX "BlackjackGame_commitmentTxHash_idx" ON "BlackjackGame"("commitmentTxHash");
CREATE INDEX "BlackjackGame_fairnessSeedId_idx" ON "BlackjackGame"("fairnessSeedId");
CREATE INDEX "BlackjackGame_fairnessMode_idx" ON "BlackjackGame"("fairnessMode");

-- Rebuild VideoPokerGame so serverSeed can be nullable and new fairness metadata is available.
CREATE TABLE "new_VideoPokerGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'jacks_or_better',
    "baseBet" REAL NOT NULL,
    "betMultiplier" INTEGER NOT NULL DEFAULT 1,
    "totalBet" REAL NOT NULL,
    "initialState" TEXT NOT NULL,
    "finalState" TEXT,
    "actionHistory" TEXT NOT NULL DEFAULT '[]',
    "serverSeed" TEXT,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "fairnessVersion" TEXT NOT NULL DEFAULT 'legacy_mulberry_v1',
    "fairnessSeedId" TEXT,
    "fairnessMode" TEXT,
    "commitmentTxHash" TEXT,
    "commitmentBlock" INTEGER,
    "commitmentTimestamp" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "handRank" TEXT,
    "multiplier" REAL,
    "payout" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "VideoPokerGame_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_VideoPokerGame" (
    "id",
    "sessionId",
    "variant",
    "baseBet",
    "betMultiplier",
    "totalBet",
    "initialState",
    "finalState",
    "actionHistory",
    "serverSeed",
    "serverSeedHash",
    "clientSeed",
    "nonce",
    "fairnessVersion",
    "commitmentTxHash",
    "commitmentBlock",
    "commitmentTimestamp",
    "status",
    "handRank",
    "multiplier",
    "payout",
    "createdAt",
    "completedAt"
)
SELECT
    "id",
    "sessionId",
    "variant",
    "baseBet",
    "betMultiplier",
    "totalBet",
    "initialState",
    "finalState",
    "actionHistory",
    "serverSeed",
    "serverSeedHash",
    "clientSeed",
    "nonce",
    "fairnessVersion",
    "commitmentTxHash",
    "commitmentBlock",
    "commitmentTimestamp",
    "status",
    "handRank",
    "multiplier",
    "payout",
    "createdAt",
    "completedAt"
FROM "VideoPokerGame";

DROP TABLE "VideoPokerGame";
ALTER TABLE "new_VideoPokerGame" RENAME TO "VideoPokerGame";

CREATE INDEX "VideoPokerGame_sessionId_idx" ON "VideoPokerGame"("sessionId");
CREATE INDEX "VideoPokerGame_status_idx" ON "VideoPokerGame"("status");
CREATE INDEX "VideoPokerGame_serverSeedHash_idx" ON "VideoPokerGame"("serverSeedHash");
CREATE INDEX "VideoPokerGame_commitmentTxHash_idx" ON "VideoPokerGame"("commitmentTxHash");
CREATE INDEX "VideoPokerGame_fairnessSeedId_idx" ON "VideoPokerGame"("fairnessSeedId");
CREATE INDEX "VideoPokerGame_fairnessMode_idx" ON "VideoPokerGame"("fairnessMode");

PRAGMA foreign_keys=ON;

CREATE TABLE "FairnessSeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seed" TEXT NOT NULL,
    "seedHash" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockHeight" INTEGER,
    "blockTimestamp" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'available',
    "assignedAt" DATETIME,
    "revealedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "FairnessSeed_seedHash_key" ON "FairnessSeed"("seedHash");
CREATE UNIQUE INDEX "FairnessSeed_txHash_key" ON "FairnessSeed"("txHash");
CREATE INDEX "FairnessSeed_status_createdAt_idx" ON "FairnessSeed"("status", "createdAt");
CREATE INDEX "FairnessSeed_seedHash_idx" ON "FairnessSeed"("seedHash");
CREATE INDEX "FairnessSeed_txHash_idx" ON "FairnessSeed"("txHash");

CREATE TABLE "SessionFairnessState" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "seedId" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nextNonce" INTEGER NOT NULL DEFAULT 0,
    "fairnessVersion" TEXT NOT NULL DEFAULT 'hmac_sha256_v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionFairnessState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SessionFairnessState_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "FairnessSeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SessionFairnessState_seedId_key" ON "SessionFairnessState"("seedId");
CREATE INDEX "SessionFairnessState_seedId_idx" ON "SessionFairnessState"("seedId");
