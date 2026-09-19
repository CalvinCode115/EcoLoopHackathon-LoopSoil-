-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MANAGER', 'TAKER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TakerType" AS ENUM ('INDIVIDUAL', 'BULK');

-- CreateEnum
CREATE TYPE "TakerCategory" AS ENUM ('NPARKS', 'TOWN_COUNCIL', 'SCHOOL', 'COMMUNITY_GARDEN', 'INDEPENDENT_FARMER', 'OTHER');

-- CreateEnum
CREATE TYPE "TakerStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COLLECTED');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('INSUFFICIENT_SUPPLY', 'HIGHER_PRIORITY', 'SLOT_UNAVAILABLE', 'INELIGIBLE_TAKER', 'OTHER');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('WRONG_AMOUNT', 'SOURCED_ELSEWHERE', 'CANNOT_MAKE_PICKUP', 'NO_LONGER_NEEDED', 'OTHER');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'COLLECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'COLLECTED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'TAKER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Taker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TakerType" NOT NULL,
    "category" "TakerCategory",
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "intendedUse" TEXT,
    "monthlyKgTarget" DOUBLE PRECISION,
    "status" "TakerStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Taker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "harvestDate" TIMESTAMP(3) NOT NULL,
    "totalKg" DOUBLE PRECISION NOT NULL,
    "schoolReserveKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bagSizeKg" DOUBLE PRECISION,
    "phReading" DOUBLE PRECISION,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "pickupLocation" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "takerId" TEXT NOT NULL,
    "allocatedKg" DOUBLE PRECISION NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'PLANNED',
    "collectedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "takerId" TEXT NOT NULL,
    "requestedKg" DOUBLE PRECISION NOT NULL,
    "approvedKg" DOUBLE PRECISION,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" "RejectionReason",
    "cancellationReason" "CancellationReason",
    "reasonNote" TEXT,
    "managerNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupSlot" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "claimId" TEXT,
    "allocationId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "collectionDeadline" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT,
    "actualKg" DOUBLE PRECISION NOT NULL,
    "photoUrl" TEXT,
    "handedOverById" TEXT NOT NULL,
    "handedOverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Taker_userId_key" ON "Taker"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_reference_key" ON "Batch"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_reference_key" ON "Allocation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_reference_key" ON "Claim"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_claimId_key" ON "Booking"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_allocationId_key" ON "Booking"("allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "Handover_reference_key" ON "Handover"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Handover_bookingId_key" ON "Handover"("bookingId");

-- AddForeignKey
ALTER TABLE "Taker" ADD CONSTRAINT "Taker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taker" ADD CONSTRAINT "Taker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_takerId_fkey" FOREIGN KEY ("takerId") REFERENCES "Taker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_takerId_fkey" FOREIGN KEY ("takerId") REFERENCES "Taker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "PickupSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
