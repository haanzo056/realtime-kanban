-- CreateIndex
CREATE UNIQUE INDEX "BoardEvent_boardId_opId_key" ON "BoardEvent"("boardId", "opId");
