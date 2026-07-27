# RosterDoc v2 Database Migration

The new schema adds columns and a `SwapRequest` table. Since this sandbox cannot make direct TCP connections to Supabase, the migration must be run manually.

## Prerequisites
- Access to the Supabase dashboard for project `szcseiylppfhcbmutjdw`

## Step 1: Run SQL Migration

1. Go to the Supabase SQL Editor:
   https://supabase.com/dashboard/project/szcseiylppfhcbmutjdw/sql/new

2. Copy and paste the ENTIRE contents of `scripts/schema.sql`

3. Click **Run**

This will:
- Add `accessCode` to Department tables
- Add `email`, `pinCode`, `rank`, `maxHoursLimit` to User tables
- Add `shiftType`, `startTime`, `endTime`, `requiredSeniorsCount`, `requiredJuniorsCount` to ShiftTemplate
- Add `status` to RosterEntry
- Create the `SwapRequest` table with all indexes
- Generate 6-character access codes for existing departments

## Step 2: Re-run Seed Data

After the migration completes, re-run the seed to populate new fields:

```bash
cd /home/team/shared/rosterdoc-pk
npx tsx scripts/seed.ts
```

## Verification

After migration, verify the new columns exist:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'User' AND column_name IN ('email', 'pinCode', 'rank', 'maxHoursLimit');

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'Department' AND column_name = 'accessCode';

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'ShiftTemplate' AND column_name IN ('shiftType', 'startTime', 'endTime');

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'RosterEntry' AND column_name = 'status';

SELECT table_name FROM information_schema.tables WHERE table_name = 'SwapRequest';
```
