-- CreateEnum
CREATE TYPE "PickupEase" AS ENUM ('SMOOTH', 'CONFUSING', 'HARD_TO_FIND');

-- CreateEnum
CREATE TYPE "GrowingPlan" AS ENUM ('HERBS', 'VEGETABLES', 'FLOWERS', 'HOUSEPLANTS', 'OTHER');

-- CreateTable
CREATE TABLE "PickupReview" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "takerId" TEXT NOT NULL,
    "compostRating" INTEGER NOT NULL,
    "pickupEase" "PickupEase",
    "growing" "GrowingPlan"[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PickupReview_handoverId_key" ON "PickupReview"("handoverId");

-- CreateIndex
CREATE INDEX "PickupReview_takerId_idx" ON "PickupReview"("takerId");

-- AddForeignKey
ALTER TABLE "PickupReview" ADD CONSTRAINT "PickupReview_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupReview" ADD CONSTRAINT "PickupReview_takerId_fkey" FOREIGN KEY ("takerId") REFERENCES "Taker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deny-all RLS, same as every other table (see 20260919135619_enable_rls): stops the
-- public anon key reading reviews through PostgREST. The backend connects as `postgres`
-- (BYPASSRLS) and is unaffected.
ALTER TABLE "PickupReview" ENABLE ROW LEVEL SECURITY;
