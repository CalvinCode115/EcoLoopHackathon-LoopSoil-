/*
  Warnings:

  - You are about to alter the column `allocatedKg` on the `Allocation` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,3)`.
  - You are about to drop the column `bagSizeKg` on the `Batch` table. All the data in the column will be lost.
  - You are about to alter the column `totalKg` on the `Batch` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,3)`.
  - You are about to alter the column `schoolReserveKg` on the `Batch` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,3)`.
  - You are about to alter the column `requestedKg` on the `Claim` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,3)`.
  - You are about to alter the column `approvedKg` on the `Claim` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,3)`.
  - You are about to alter the column `actualKg` on the `Handover` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,3)`.

*/
-- AlterEnum
ALTER TYPE "TakerStatus" ADD VALUE 'REJECTED';

-- DropForeignKey
ALTER TABLE "PickupSlot" DROP CONSTRAINT "PickupSlot_batchId_fkey";

-- AlterTable
ALTER TABLE "Allocation" ALTER COLUMN "allocatedKg" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "bagSizeKg",
ALTER COLUMN "totalKg" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "schoolReserveKg" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "pickupLocation" SET DEFAULT 'Near bin centre / composter';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "bookedById" TEXT,
ADD COLUMN     "cancelNote" TEXT,
ADD COLUMN     "rescheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Claim" ALTER COLUMN "requestedKg" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "approvedKg" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "Handover" ADD COLUMN     "halfKgBags" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "looseKg" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "oneKgBags" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "undoneAt" TIMESTAMP(3),
ALTER COLUMN "actualKg" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "PickupSlot" ADD COLUMN     "seriesId" TEXT,
ALTER COLUMN "batchId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Taker" ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" TEXT,
ADD COLUMN     "statusReason" TEXT;

-- CreateTable
CREATE TABLE "BatchTopUp" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kg" DECIMAL(10,3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReportView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedReportView_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Taker" ADD CONSTRAINT "Taker_statusChangedById_fkey" FOREIGN KEY ("statusChangedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTopUp" ADD CONSTRAINT "BatchTopUp_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTopUp" ADD CONSTRAINT "BatchTopUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReportView" ADD CONSTRAINT "SavedReportView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
