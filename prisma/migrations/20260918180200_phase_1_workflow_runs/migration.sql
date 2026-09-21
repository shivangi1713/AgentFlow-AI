-- Phase 1 production foundation:
-- immutable workflow versions, durable execution runs, step state, and events.

CREATE TYPE "ExecutionRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'TIMED_OUT'
);

CREATE TYPE "ExecutionStepStatus" AS ENUM (
  'PENDING',
  'READY',
  'RUNNING',
  'RETRYING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED'
);

ALTER TABLE "Workflow" ADD COLUMN "activeVersionId" TEXT;

CREATE TABLE "WorkflowVersion" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "nodes" JSONB NOT NULL,
  "edges" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutionRun" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "ExecutionRunStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT,
  "triggerPayload" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExecutionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutionStep" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "nodeType" TEXT NOT NULL,
  "status" "ExecutionStepStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "inputData" JSONB,
  "outputData" JSONB,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExecutionStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutionEvent" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workflow_activeVersionId_idx" ON "Workflow"("activeVersionId");
CREATE INDEX "WorkflowVersion_workflowId_createdAt_idx" ON "WorkflowVersion"("workflowId", "createdAt");
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_version_key" ON "WorkflowVersion"("workflowId", "version");
CREATE UNIQUE INDEX "ExecutionRun_idempotencyKey_key" ON "ExecutionRun"("idempotencyKey");
CREATE INDEX "ExecutionRun_workflowId_createdAt_idx" ON "ExecutionRun"("workflowId", "createdAt" DESC);
CREATE INDEX "ExecutionRun_workflowVersionId_idx" ON "ExecutionRun"("workflowVersionId");
CREATE INDEX "ExecutionRun_userId_createdAt_idx" ON "ExecutionRun"("userId", "createdAt" DESC);
CREATE INDEX "ExecutionRun_status_createdAt_idx" ON "ExecutionRun"("status", "createdAt");
CREATE INDEX "ExecutionStep_runId_status_idx" ON "ExecutionStep"("runId", "status");
CREATE UNIQUE INDEX "ExecutionStep_runId_nodeId_key" ON "ExecutionStep"("runId", "nodeId");
CREATE INDEX "ExecutionEvent_runId_createdAt_idx" ON "ExecutionEvent"("runId", "createdAt");
CREATE INDEX "ExecutionEvent_stepId_createdAt_idx" ON "ExecutionEvent"("stepId", "createdAt");

ALTER TABLE "WorkflowVersion"
  ADD CONSTRAINT "WorkflowVersion_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutionRun"
  ADD CONSTRAINT "ExecutionRun_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutionRun"
  ADD CONSTRAINT "ExecutionRun_workflowVersionId_fkey"
  FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExecutionStep"
  ADD CONSTRAINT "ExecutionStep_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ExecutionRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutionEvent"
  ADD CONSTRAINT "ExecutionEvent_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ExecutionRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
