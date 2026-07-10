CREATE TABLE "VeilstoneTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "mode" TEXT NOT NULL DEFAULT 'play_zec_mvp_zero',
    "buyInZats" BIGINT NOT NULL DEFAULT 100000000,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "VeilstoneSeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'seated',
    "houseId" TEXT,
    "displayName" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "publicStartZats" BIGINT,
    "shieldedStartZats" BIGINT,
    "readyAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VeilstoneSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "VeilstoneTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VeilstoneMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "phase" TEXT NOT NULL DEFAULT 'EPOCH_1_FORECAST',
    "stateVersion" BIGINT NOT NULL DEFAULT 0,
    "stateJson" TEXT NOT NULL,
    "publicHash" TEXT,
    "finalHash" TEXT,
    "engineVersion" TEXT NOT NULL DEFAULT 'veilstone_mvp_zero_v1',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VeilstoneMatch_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "VeilstoneTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VeilstoneEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "stateVersion" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "actorSessionId" TEXT,
    "clientActionId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "prevEventHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VeilstoneEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "VeilstoneMatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VeilstoneAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'system',
    "accountType" TEXT NOT NULL,
    "balanceZats" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VeilstoneAccount_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "VeilstoneMatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VeilstoneLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "amountZats" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "VeilstoneOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "playerSessionId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceZats" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VeilstoneOrder_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "VeilstoneMatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VeilstoneContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "requirementsJson" TEXT NOT NULL,
    "payoutRuleJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "VeilstoneContract_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "VeilstoneMatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VeilstoneCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "playerSessionId" TEXT NOT NULL,
    "contractId" TEXT,
    "commitmentHash" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'committed',
    "publicAmountZats" BIGINT,
    "revealJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" DATETIME,
    CONSTRAINT "VeilstoneCommitment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "VeilstoneMatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "VeilstoneTable_status_idx" ON "VeilstoneTable"("status");
CREATE INDEX "VeilstoneTable_createdAt_idx" ON "VeilstoneTable"("createdAt");
CREATE INDEX "VeilstoneTable_createdById_idx" ON "VeilstoneTable"("createdById");

CREATE UNIQUE INDEX "VeilstoneSeat_tableId_seatIndex_key" ON "VeilstoneSeat"("tableId", "seatIndex");
CREATE UNIQUE INDEX "VeilstoneSeat_tableId_sessionId_key" ON "VeilstoneSeat"("tableId", "sessionId");
CREATE INDEX "VeilstoneSeat_sessionId_idx" ON "VeilstoneSeat"("sessionId");
CREATE INDEX "VeilstoneSeat_status_idx" ON "VeilstoneSeat"("status");

CREATE UNIQUE INDEX "VeilstoneMatch_tableId_key" ON "VeilstoneMatch"("tableId");
CREATE INDEX "VeilstoneMatch_status_idx" ON "VeilstoneMatch"("status");
CREATE INDEX "VeilstoneMatch_phase_idx" ON "VeilstoneMatch"("phase");
CREATE INDEX "VeilstoneMatch_updatedAt_idx" ON "VeilstoneMatch"("updatedAt");

CREATE UNIQUE INDEX "VeilstoneEvent_matchId_sequence_key" ON "VeilstoneEvent"("matchId", "sequence");
CREATE UNIQUE INDEX "VeilstoneEvent_matchId_clientActionId_key" ON "VeilstoneEvent"("matchId", "clientActionId");
CREATE INDEX "VeilstoneEvent_matchId_stateVersion_idx" ON "VeilstoneEvent"("matchId", "stateVersion");
CREATE INDEX "VeilstoneEvent_matchId_createdAt_idx" ON "VeilstoneEvent"("matchId", "createdAt");
CREATE INDEX "VeilstoneEvent_actorSessionId_idx" ON "VeilstoneEvent"("actorSessionId");

CREATE UNIQUE INDEX "VeilstoneAccount_matchId_ownerType_ownerId_accountType_key" ON "VeilstoneAccount"("matchId", "ownerType", "ownerId", "accountType");
CREATE INDEX "VeilstoneAccount_matchId_idx" ON "VeilstoneAccount"("matchId");
CREATE INDEX "VeilstoneAccount_ownerId_idx" ON "VeilstoneAccount"("ownerId");

CREATE INDEX "VeilstoneLedgerEntry_matchId_idx" ON "VeilstoneLedgerEntry"("matchId");
CREATE INDEX "VeilstoneLedgerEntry_eventId_idx" ON "VeilstoneLedgerEntry"("eventId");
CREATE INDEX "VeilstoneLedgerEntry_debitAccountId_idx" ON "VeilstoneLedgerEntry"("debitAccountId");
CREATE INDEX "VeilstoneLedgerEntry_creditAccountId_idx" ON "VeilstoneLedgerEntry"("creditAccountId");

CREATE INDEX "VeilstoneOrder_matchId_idx" ON "VeilstoneOrder"("matchId");
CREATE INDEX "VeilstoneOrder_playerSessionId_idx" ON "VeilstoneOrder"("playerSessionId");
CREATE INDEX "VeilstoneOrder_status_idx" ON "VeilstoneOrder"("status");

CREATE INDEX "VeilstoneContract_matchId_idx" ON "VeilstoneContract"("matchId");
CREATE INDEX "VeilstoneContract_status_idx" ON "VeilstoneContract"("status");

CREATE INDEX "VeilstoneCommitment_matchId_idx" ON "VeilstoneCommitment"("matchId");
CREATE INDEX "VeilstoneCommitment_playerSessionId_idx" ON "VeilstoneCommitment"("playerSessionId");
CREATE INDEX "VeilstoneCommitment_commitmentHash_idx" ON "VeilstoneCommitment"("commitmentHash");
CREATE INDEX "VeilstoneCommitment_status_idx" ON "VeilstoneCommitment"("status");
