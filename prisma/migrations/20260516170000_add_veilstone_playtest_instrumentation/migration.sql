CREATE TABLE "VeilstonePlaytestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "sessionId" TEXT,
    "seatIndex" INTEGER,
    "eventName" TEXT NOT NULL,
    "phase" TEXT,
    "stateVersion" BIGINT,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VeilstonePlaytestEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "VeilstoneMatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VeilstonePlaytestFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seatIndex" INTEGER,
    "understoodGoal" INTEGER NOT NULL,
    "decisionsMattered" INTEGER NOT NULL,
    "understoodOutcome" INTEGER NOT NULL,
    "shieldedFeltFair" INTEGER NOT NULL,
    "trustPrestigeMattered" INTEGER NOT NULL,
    "feltSkillful" INTEGER NOT NULL,
    "wouldPlayAgain" INTEGER NOT NULL,
    "mostExcitingMoment" TEXT,
    "mostConfusingMoment" TEXT,
    "oneThingToChange" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VeilstonePlaytestFeedback_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "VeilstoneMatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "VeilstonePlaytestEvent_matchId_occurredAt_idx" ON "VeilstonePlaytestEvent"("matchId", "occurredAt");
CREATE INDEX "VeilstonePlaytestEvent_sessionId_idx" ON "VeilstonePlaytestEvent"("sessionId");
CREATE INDEX "VeilstonePlaytestEvent_eventName_idx" ON "VeilstonePlaytestEvent"("eventName");
CREATE UNIQUE INDEX "VeilstonePlaytestFeedback_matchId_sessionId_key" ON "VeilstonePlaytestFeedback"("matchId", "sessionId");
CREATE INDEX "VeilstonePlaytestFeedback_matchId_idx" ON "VeilstonePlaytestFeedback"("matchId");
CREATE INDEX "VeilstonePlaytestFeedback_sessionId_idx" ON "VeilstonePlaytestFeedback"("sessionId");
