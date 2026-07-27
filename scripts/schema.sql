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
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PGT', 'HO');

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
