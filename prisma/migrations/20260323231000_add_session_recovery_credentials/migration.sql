ALTER TABLE "Session" ADD COLUMN "playerAuthVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "SessionRecoveryCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "SessionRecoveryCredential_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SessionRecoveryCredential_sessionId_key" ON "SessionRecoveryCredential"("sessionId");
CREATE UNIQUE INDEX "SessionRecoveryCredential_keyHash_key" ON "SessionRecoveryCredential"("keyHash");
CREATE INDEX "SessionRecoveryCredential_keyHash_idx" ON "SessionRecoveryCredential"("keyHash");
