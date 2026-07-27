-- RosterDoc Database Schema
-- Run this in the Supabase SQL Editor to create all tables.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Departments table
CREATE TABLE IF NOT EXISTS "Department" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  "hospitalName" TEXT NOT NULL
);

-- Users table
DO $func$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('ADMIN', 'PGT', 'HO');
  END IF;
END $func$;

CREATE TABLE IF NOT EXISTS "User" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role "Role" NOT NULL,
  "departmentId" UUID NOT NULL REFERENCES "Department"(id) ON DELETE CASCADE
);

-- Shift templates table
CREATE TABLE IF NOT EXISTS "ShiftTemplate" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  "durationHours" INTEGER NOT NULL,
  "departmentId" UUID NOT NULL REFERENCES "Department"(id) ON DELETE CASCADE
);

-- Roster entries table
CREATE TABLE IF NOT EXISTS "RosterEntry" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date TIMESTAMPTZ NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "shiftName" TEXT NOT NULL,
  "startTime" TIMESTAMPTZ NOT NULL,
  "endTime" TIMESTAMPTZ NOT NULL,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_user_department ON "User"("departmentId");
CREATE INDEX IF NOT EXISTS idx_user_role ON "User"(role);
CREATE INDEX IF NOT EXISTS idx_user_phone ON "User"(phone);
CREATE INDEX IF NOT EXISTS idx_roster_user ON "RosterEntry"("userId");
CREATE INDEX IF NOT EXISTS idx_roster_start ON "RosterEntry"("startTime");
CREATE INDEX IF NOT EXISTS idx_shift_department ON "ShiftTemplate"("departmentId");

-- ================================================================
-- MIGRATION: Add new columns for RosterDoc v2 feature set
-- ================================================================

-- 1. Department: add accessCode (6-char auto-generated code for staff join)
ALTER TABLE "Department"
ADD COLUMN IF NOT EXISTS "accessCode" TEXT;

-- Add unique constraint on accessCode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Department_accessCode_key'
  ) THEN
    ALTER TABLE "Department" ADD CONSTRAINT "Department_accessCode_key" UNIQUE ("accessCode");
  END IF;
END $$;

-- Generate access codes for existing departments (6 random uppercase alphanumeric chars)
UPDATE "Department" SET "accessCode" = upper(substring(md5(random()::text || id::text) from 1 for 6))
WHERE "accessCode" IS NULL;

-- 2. User: add email, pinCode, rank, maxHoursLimit
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "email" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "pinCode" TEXT;

-- Add unique constraint on email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_email_key'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");
  END IF;
END $$;

-- Create Rank enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Rank') THEN
    CREATE TYPE "Rank" AS ENUM (
      'HO_BATCH_A', 'HO_BATCH_B',
      'PGT_Y1', 'PGT_Y2', 'PGT_Y3', 'PGT_Y4',
      'REGISTRAR', 'SENIOR_REGISTRAR'
    );
  END IF;
END $$;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "rank" "Rank";

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "maxHoursLimit" INTEGER NOT NULL DEFAULT 80;

-- 3. ShiftTemplate: add shiftType, startTime, endTime, requiredSeniorsCount, requiredJuniorsCount
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShiftType') THEN
    CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'EVENING', 'NIGHT', 'CALL_30HR');
  END IF;
END $$;

ALTER TABLE "ShiftTemplate"
ADD COLUMN IF NOT EXISTS "shiftType" "ShiftType";

ALTER TABLE "ShiftTemplate"
ADD COLUMN IF NOT EXISTS "startTime" TEXT;

ALTER TABLE "ShiftTemplate"
ADD COLUMN IF NOT EXISTS "endTime" TEXT;

ALTER TABLE "ShiftTemplate"
ADD COLUMN IF NOT EXISTS "requiredSeniorsCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ShiftTemplate"
ADD COLUMN IF NOT EXISTS "requiredJuniorsCount" INTEGER NOT NULL DEFAULT 1;

-- 4. RosterEntry: add status column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RosterStatus') THEN
    CREATE TYPE "RosterStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'SWAPPED');
  END IF;
END $$;

ALTER TABLE "RosterEntry"
ADD COLUMN IF NOT EXISTS "status" "RosterStatus" NOT NULL DEFAULT 'ASSIGNED';

-- 5. Create SwapRequest table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SwapStatus') THEN
    CREATE TYPE "SwapStatus" AS ENUM ('PENDING_PEER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SwapRequest" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "requesterId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "recipientId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "rosterEntryId" UUID NOT NULL REFERENCES "RosterEntry"(id) ON DELETE CASCADE,
  status "SwapStatus" NOT NULL DEFAULT 'PENDING_PEER',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for SwapRequest
CREATE INDEX IF NOT EXISTS idx_swap_requester ON "SwapRequest"("requesterId");
CREATE INDEX IF NOT EXISTS idx_swap_recipient ON "SwapRequest"("recipientId");
CREATE INDEX IF NOT EXISTS idx_swap_roster ON "SwapRequest"("rosterEntryId");
CREATE INDEX IF NOT EXISTS idx_swap_status ON "SwapRequest"(status);
