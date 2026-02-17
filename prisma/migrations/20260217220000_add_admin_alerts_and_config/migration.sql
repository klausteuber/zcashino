-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sessionId" TEXT,
    "gameId" TEXT,
    "metadata" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedBy" TEXT,
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdminConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

-- CreateIndex
CREATE INDEX "AdminAlert_createdAt_idx" ON "AdminAlert"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAlert_dismissed_idx" ON "AdminAlert"("dismissed");

-- CreateIndex
CREATE INDEX "AdminAlert_type_idx" ON "AdminAlert"("type");

-- CreateIndex
CREATE INDEX "AdminAlert_severity_idx" ON "AdminAlert"("severity");
