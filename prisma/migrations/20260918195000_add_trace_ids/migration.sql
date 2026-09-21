ALTER TABLE "ExecutionRun" ADD COLUMN "traceId" TEXT;
ALTER TABLE "ExecutionStep" ADD COLUMN "traceId" TEXT;
ALTER TABLE "ExecutionEvent" ADD COLUMN "traceId" TEXT;

CREATE INDEX "ExecutionRun_traceId_idx" ON "ExecutionRun"("traceId");
CREATE INDEX "ExecutionStep_traceId_idx" ON "ExecutionStep"("traceId");
CREATE INDEX "ExecutionEvent_traceId_createdAt_idx" ON "ExecutionEvent"("traceId", "createdAt");
