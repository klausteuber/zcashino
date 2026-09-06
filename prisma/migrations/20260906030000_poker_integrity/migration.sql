-- CreateTable
CREATE TABLE "PokerIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "nickname" TEXT,
    "recoverySavedAt" DATETIME,
    "nonce" TEXT NOT NULL,
    "humanVerifiedAt" DATETIME,
    "humanVerifiedUntil" DATETIME,
    "entryVerifiedUntil" DATETIME,
    "verifiedHands" INTEGER NOT NULL DEFAULT 0,
    "recheckRequired" BOOLEAN NOT NULL DEFAULT false,
    "lastRecheckAt" DATETIME,
    "restrictedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PokerIdentity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PokerHumanToken" (
    "digest" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PokerObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identityId" TEXT NOT NULL,
    "browserKey" TEXT NOT NULL,
    "networkKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PokerHand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "handNumber" INTEGER NOT NULL,
    "variant" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "bigBlind" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "analyzedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PokerHandPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "startStack" REAL NOT NULL,
    "wagered" REAL NOT NULL DEFAULT 0,
    "returned" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "PokerHandPlayer_handId_fkey" FOREIGN KEY ("handId") REFERENCES "PokerHand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PokerDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "elapsedMs" REAL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "PokerDecision_handId_fkey" FOREIGN KEY ("handId") REFERENCES "PokerHand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PokerIntegritySignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "otherId" TEXT,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PokerIdentity_sessionId_key" ON "PokerIdentity"("sessionId");

-- CreateIndex
CREATE INDEX "PokerHumanToken_expiresAt_idx" ON "PokerHumanToken"("expiresAt");

-- CreateIndex
CREATE INDEX "PokerObservation_identityId_createdAt_idx" ON "PokerObservation"("identityId", "createdAt");

-- CreateIndex
CREATE INDEX "PokerObservation_browserKey_createdAt_idx" ON "PokerObservation"("browserKey", "createdAt");

-- CreateIndex
CREATE INDEX "PokerObservation_networkKey_createdAt_idx" ON "PokerObservation"("networkKey", "createdAt");

-- CreateIndex
CREATE INDEX "PokerObservation_expiresAt_idx" ON "PokerObservation"("expiresAt");

-- CreateIndex
CREATE INDEX "PokerHand_completedAt_analyzedAt_idx" ON "PokerHand"("completedAt", "analyzedAt");

-- CreateIndex
CREATE INDEX "PokerHand_expiresAt_idx" ON "PokerHand"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PokerHand_tableId_handNumber_key" ON "PokerHand"("tableId", "handNumber");

-- CreateIndex
CREATE INDEX "PokerHandPlayer_identityId_handId_idx" ON "PokerHandPlayer"("identityId", "handId");

-- CreateIndex
CREATE UNIQUE INDEX "PokerHandPlayer_handId_identityId_key" ON "PokerHandPlayer"("handId", "identityId");

-- CreateIndex
CREATE INDEX "PokerDecision_identityId_createdAt_idx" ON "PokerDecision"("identityId", "createdAt");

-- CreateIndex
CREATE INDEX "PokerDecision_handId_createdAt_idx" ON "PokerDecision"("handId", "createdAt");

-- CreateIndex
CREATE INDEX "PokerIntegritySignal_identityId_createdAt_idx" ON "PokerIntegritySignal"("identityId", "createdAt");

-- CreateIndex
CREATE INDEX "PokerIntegritySignal_expiresAt_idx" ON "PokerIntegritySignal"("expiresAt");
