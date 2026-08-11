-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "questionId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'ASK',
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "error" TEXT,
    "promptSummary" TEXT NOT NULL DEFAULT '',
    "answerSummary" TEXT NOT NULL DEFAULT '',
    "toolCallsJson" TEXT NOT NULL DEFAULT '[]',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_runs_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "agent_runs_questionId_createdAt_idx" ON "agent_runs"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_workspaceId_createdAt_idx" ON "agent_runs"("workspaceId", "createdAt");
