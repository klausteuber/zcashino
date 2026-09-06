ALTER TABLE "Session" ADD COLUMN "pokerLockedZats" BIGINT NOT NULL DEFAULT 0;
CREATE TABLE "PokerTable" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('real', 'practice')),
  "version" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL,
  "escrowZats" BIGINT NOT NULL DEFAULT 0 CHECK ("escrowZats" >= 0),
  "nextTickAt" DATETIME,
  "closed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "PokerSeat" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tableId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "seatIndex" INTEGER NOT NULL CHECK ("seatIndex" BETWEEN 0 AND 5),
  CONSTRAINT "PokerSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "PokerEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tableId" TEXT NOT NULL,
  "sessionId" TEXT,
  "requestId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amountZats" BIGINT NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL,
  "details" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PokerEvent_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PokerTable_closed_mode_updatedAt_idx" ON "PokerTable"("closed", "mode", "updatedAt");
CREATE INDEX "PokerTable_nextTickAt_idx" ON "PokerTable"("nextTickAt");
CREATE UNIQUE INDEX "PokerSeat_sessionId_key" ON "PokerSeat"("sessionId");
CREATE UNIQUE INDEX "PokerSeat_tableId_seatIndex_key" ON "PokerSeat"("tableId", "seatIndex");
CREATE UNIQUE INDEX "PokerEvent_requestId_key" ON "PokerEvent"("requestId");
CREATE INDEX "PokerEvent_tableId_createdAt_idx" ON "PokerEvent"("tableId", "createdAt");
CREATE INDEX "PokerEvent_sessionId_createdAt_idx" ON "PokerEvent"("sessionId", "createdAt");
