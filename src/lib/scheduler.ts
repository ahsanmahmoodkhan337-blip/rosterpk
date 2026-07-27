import { addHours, differenceInHours, parseISO, getDay, setHours, setMinutes } from 'date-fns';
import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export type ShiftTypeEnum = 'MORNING' | 'EVENING' | 'NIGHT' | 'CALL_30HR';

interface UserRecord {
  id: string;
  name: string;
  phone: string;
  role: string;
  rank?: string | null;
  maxHoursLimit?: number | null;
  departmentId: string;
}

interface ShiftTemplateRecord {
  id: string;
  name: string;
  durationHours: number;
  shiftType?: ShiftTypeEnum | null;
  startTime?: string | null;      // "08:00"
  endTime?: string | null;        // "14:00" or "14:00+1"
  requiredSeniorsCount: number;
  requiredJuniorsCount: number;
  departmentId: string;
}

export interface RosterDraftEntry {
  date: Date;
  userId: string;
  shiftName: string;
  shiftType: ShiftTypeEnum | null;
  startTime: Date;
  endTime: Date;
}

export interface Conflict {
  type:
    | 'OVERLAP'
    | 'CONSECUTIVE_30HR'
    | 'UNDERSTAFFED'
    | 'REST_VIOLATION'
    | 'HOUR_LIMIT_NEAR';
  message: string;
  entries: RosterDraftEntry[];
  severity: 'error' | 'warning';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SENIOR_RANKS = new Set([
  'REGISTRAR',
  'SENIOR_REGISTRAR',
  'PGT_Y4',
  'PGT_Y3',
]);

const JUNIOR_RANKS = new Set([
  'PGT_Y2',
  'PGT_Y1',
  'HO_BATCH_A',
  'HO_BATCH_B',
]);

function isSenior(user: UserRecord): boolean {
  return SENIOR_RANKS.has(user.rank ?? '');
}

function isJunior(user: UserRecord): boolean {
  return JUNIOR_RANKS.has(user.rank ?? '');
}

/** Parse "HH:MM" or "HH:MM+1" into hours and minutes, plus nextDay flag */
function parseTimeStr(timeStr: string): { hours: number; minutes: number; nextDay: boolean } {
  let nextDay = false;
  let cleaned = timeStr;
  if (cleaned.endsWith('+1')) {
    nextDay = true;
    cleaned = cleaned.slice(0, -2);
  }
  const [h, m] = cleaned.split(':').map(Number);
  return { hours: h, minutes: m, nextDay };
}

/** Given a day start (00:00) and a shift template, compute actual start/end Date */
function computeShiftTimes(
  dayStart: Date,
  template: ShiftTemplateRecord,
): { startTime: Date; endTime: Date; durationHours: number } {
  if (template.startTime && template.endTime) {
    const start = parseTimeStr(template.startTime);
    const end = parseTimeStr(template.endTime);

    const s = new Date(dayStart);
    s.setHours(start.hours, start.minutes, 0, 0);

    const e = new Date(dayStart);
    if (end.nextDay) {
      e.setDate(e.getDate() + 1);
    }
    e.setHours(end.hours, end.minutes, 0, 0);

    const durH = differenceInHours(e, s);
    return { startTime: s, endTime: e, durationHours: durH };
  }

  // Fallback: use durationHours from 8 AM
  const s = new Date(dayStart);
  s.setHours(8, 0, 0, 0);
  const e = addHours(s, template.durationHours);
  return { startTime: s, endTime: e, durationHours: template.durationHours };
}

/** Rest hours required after a given shift type */
function requiredRestHours(shiftType: ShiftTypeEnum | null | undefined): number {
  switch (shiftType) {
    case 'CALL_30HR':
      return 24;
    case 'NIGHT':
      return 12;
    case 'MORNING':
    case 'EVENING':
    default:
      return 8;
  }
}

/** Check if a date falls on a Pakistani weekend day (Fri/Sat/Sun) */
function isWeekend(date: Date): boolean {
  const day = getDay(date); // 0=Sun, 5=Fri, 6=Sat
  return day === 0 || day === 5 || day === 6;
}

/** Group users into seniors and juniors */
function partitionUsers(users: UserRecord[]): { seniors: UserRecord[]; juniors: UserRecord[] } {
  const seniors: UserRecord[] = [];
  const juniors: UserRecord[] = [];
  for (const u of users) {
    if (isSenior(u)) seniors.push(u);
    else if (isJunior(u)) juniors.push(u);
    // Users with no recognized rank are skipped for assignment
  }
  return { seniors, juniors };
}

// ── Scheduler Engine v2 ──────────────────────────────────────────────────────

export async function generateDraftRoster(
  departmentId: string,
  startDate: Date,
  days: number,
): Promise<RosterDraftEntry[]> {
  // 1. Fetch all users in department (include ADMIN since they may also be doctors)
  const { data: users, error: usersErr } = await supabase
    .from('User')
    .select('*')
    .eq('departmentId', departmentId)
    .in('role', ['HO', 'PGT', 'ADMIN']);

  if (usersErr) throw usersErr;

  // 2. Fetch all shift templates
  const { data: templates, error: tmplErr } = await supabase
    .from('ShiftTemplate')
    .select('*')
    .eq('departmentId', departmentId);

  if (tmplErr) throw tmplErr;

  if (!users || users.length === 0 || !templates || templates.length === 0) {
    throw new Error('No users or templates found for department');
  }

  const typedUsers = users as UserRecord[];
  const typedTemplates = templates as ShiftTemplateRecord[];

  // Partition users
  const { seniors: allSeniors, juniors: allJuniors } = partitionUsers(typedUsers);

  // ── Tracking structures ──
  // When each user's last shift ended
  const userLastShiftEnd: Record<string, Date> = {};
  // How many weekend shifts each user has
  const userWeekendCount: Record<string, number> = {};
  // How many night shifts each user has
  const userNightCount: Record<string, number> = {};
  // How many 30hr calls each user has
  const userCall30Count: Record<string, number> = {};
  // Total hours assigned to each user
  const userTotalHours: Record<string, number> = {};

  for (const u of typedUsers) {
    userLastShiftEnd[u.id] = new Date(0);
    userWeekendCount[u.id] = 0;
    userNightCount[u.id] = 0;
    userCall30Count[u.id] = 0;
    userTotalHours[u.id] = 0;
  }

  // Sort seniors/juniors into rotating queues
  const seniorQueue = [...allSeniors];
  const juniorQueue = [...allJuniors];

  const rosterDraft: RosterDraftEntry[] = [];

  // 2. Sort templates by priority — 30hr calls first, then night, then day shifts
  const sortedTemplates = [...typedTemplates].sort((a, b) => {
    const prio = (t: ShiftTemplateRecord) =>
      t.shiftType === 'CALL_30HR' ? 0 : t.shiftType === 'NIGHT' ? 1 : 2;
    return prio(a) - prio(b);
  });

  for (let day = 0; day < days; day++) {
    const dayStart = new Date(startDate);
    dayStart.setDate(dayStart.getDate() + day);
    dayStart.setHours(0, 0, 0, 0);

    for (const template of sortedTemplates) {
      const { startTime, endTime, durationHours } = computeShiftTimes(dayStart, template);
      const shiftType = template.shiftType as ShiftTypeEnum | null;
      const restNeeded = requiredRestHours(shiftType);

      // How many seniors/juniors do we need?
      const needSeniors = template.requiredSeniorsCount || 1;
      const needJuniors = template.requiredJuniorsCount || 1;

      // ── Pick eligible seniors ──
      const pickEligible = (
        pool: UserRecord[],
        count: number,
        preferFewerOfType: (uid: string) => number,
      ): UserRecord[] => {
        const eligible = pool.filter((u) => {
          const maxH = u.maxHoursLimit ?? 80;
          if (userTotalHours[u.id] + durationHours > maxH) return false;
          const hoursRested = differenceInHours(startTime, userLastShiftEnd[u.id]);
          return hoursRested >= restNeeded;
        });

        // Sort: prefer those with fewer tracked shifts of this type, then by total hours
        eligible.sort((a, b) => {
          const diff = preferFewerOfType(a.id) - preferFewerOfType(b.id);
          if (diff !== 0) return diff;
          return userTotalHours[a.id] - userTotalHours[b.id];
        });

        return eligible.slice(0, Math.min(count, eligible.length));
      };

      // Determine which tracking function to use
      const getTypeTrackFn = (): ((uid: string) => number) => {
        if (shiftType === 'NIGHT') return (uid: string) => userNightCount[uid];
        if (shiftType === 'CALL_30HR') return (uid: string) => userCall30Count[uid];
        return (uid: string) => userWeekendCount[uid];
      };

      const trackFn = getTypeTrackFn();

      const pickedSeniors = pickEligible(seniorQueue, needSeniors, trackFn);
      const pickedJuniors = pickEligible(juniorQueue, needJuniors, trackFn);

      // ── Assign picked doctors ──
      const assignedUsers: UserRecord[] = [];

      for (const user of pickedSeniors) {
        assignedUsers.push(user);
        assignShift(user, template, startTime, endTime, durationHours, shiftType);
      }

      for (const user of pickedJuniors) {
        assignedUsers.push(user);
        assignShift(user, template, startTime, endTime, durationHours, shiftType);
      }

      if (pickedSeniors.length < needSeniors) {
        console.warn(
          `⚠️ Understaffed seniors: ${template.name} on ${startTime.toISOString().slice(0, 10)} ` +
          `(needed ${needSeniors}, got ${pickedSeniors.length})`,
        );
      }
      if (pickedJuniors.length < needJuniors) {
        console.warn(
          `⚠️ Understaffed juniors: ${template.name} on ${startTime.toISOString().slice(0, 10)} ` +
          `(needed ${needJuniors}, got ${pickedJuniors.length})`,
        );
      }

      // Rotate assigned users to the back of their respective queues for fairness
      rotateAssigned(seniorQueue, pickedSeniors);
      rotateAssigned(juniorQueue, pickedJuniors);
    }
  }

  // ── Persist to DB ──
  const { error: insertErr } = await supabase.from('RosterEntry').insert(
    rosterDraft.map((entry) => ({
      date: entry.date.toISOString(),
      userId: entry.userId,
      shiftName: entry.shiftName,
      startTime: entry.startTime.toISOString(),
      endTime: entry.endTime.toISOString(),
    })),
  );

  if (insertErr) throw insertErr;

  return rosterDraft;

  // ── Inner helper ──
  function assignShift(
    user: UserRecord,
    template: ShiftTemplateRecord,
    startTime: Date,
    endTime: Date,
    durationHours: number,
    shiftType: ShiftTypeEnum | null,
  ) {
    rosterDraft.push({
      date: new Date(startTime),
      userId: user.id,
      shiftName: template.name,
      shiftType,
      startTime,
      endTime,
    });

    userLastShiftEnd[user.id] = endTime;
    userTotalHours[user.id] += durationHours;

    if (isWeekend(startTime)) {
      userWeekendCount[user.id]++;
    }
    if (shiftType === 'NIGHT') {
      userNightCount[user.id]++;
    }
    if (shiftType === 'CALL_30HR') {
      userCall30Count[user.id]++;
    }
  }

  function rotateAssigned(queue: UserRecord[], assigned: UserRecord[]) {
    for (const u of assigned) {
      const idx = queue.findIndex((q) => q.id === u.id);
      if (idx !== -1) {
        queue.splice(idx, 1);
        queue.push(u);
      }
    }
  }
}

// ── Conflict Detection Engine ────────────────────────────────────────────────

/**
 * Detect scheduling conflicts in a set of roster entries.
 * @param entries  The roster entries to check (must have startTime, endTime, userId, shiftType)
 * @param users    User records with rank info for determining senior/junior
 * @param templates Shift templates for understaffing checks
 * @returns Array of Conflict objects
 */
export function detectConflicts(
  entries: RosterDraftEntry[],
  users: UserRecord[],
  templates?: ShiftTemplateRecord[],
): Conflict[] {
  const conflicts: Conflict[] = [];

  if (entries.length === 0) return conflicts;

  // Build a user lookup
  const userMap = new Map<string, UserRecord>();
  for (const u of users) userMap.set(u.id, u);

  // Group entries by user
  const byUser = new Map<string, RosterDraftEntry[]>();
  for (const e of entries) {
    const list = byUser.get(e.userId) || [];
    list.push(e);
    byUser.set(e.userId, list);
  }

  // Group entries by date+shiftName for understaffing
  const byShiftKey = new Map<string, RosterDraftEntry[]>();
  for (const e of entries) {
    const key = `${e.date.toISOString().slice(0, 10)}|${e.shiftName}`;
    const list = byShiftKey.get(key) || [];
    list.push(e);
    byShiftKey.set(key, list);
  }

  // ── Per-user checks ──
  for (const [userId, userEntries] of byUser) {
    const user = userMap.get(userId);
    // Sort by start time
    const sorted = [...userEntries].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    for (let i = 0; i < sorted.length; i++) {
      const entryI = sorted[i];

      for (let j = i + 1; j < sorted.length; j++) {
        const a = entryI;
        const b = sorted[j];

        // 1. Overlapping shifts (a.end > b.start)
        if (a.endTime.getTime() > b.startTime.getTime()) {
          conflicts.push({
            type: 'OVERLAP',
            message: `${user?.name ?? 'Unknown'} has overlapping shifts: ${a.shiftName} (${fmtTime(a.startTime)}–${fmtTime(a.endTime)}) and ${b.shiftName} (${fmtTime(b.startTime)}–${fmtTime(b.endTime)})`,
            entries: [a, b],
            severity: 'error',
          });
        }

        // 2. Rest violation: gap between a.end and b.start
        const gapHours = differenceInHours(b.startTime, a.endTime);
        const required = requiredRestHours(a.shiftType);
        if (gapHours >= 0 && gapHours < required) {
          conflicts.push({
            type: 'REST_VIOLATION',
            message: `${user?.name ?? 'Unknown'}: Only ${gapHours}h rest between ${a.shiftName} (ends ${fmtTime(a.endTime)}) and ${b.shiftName} (starts ${fmtTime(b.startTime)}). Required: ${required}h`,
            entries: [a, b],
            severity: 'error',
          });
        }

        // 3. Consecutive 30hr calls within 48 hours
        if (
          a.shiftType === 'CALL_30HR' &&
          b.shiftType === 'CALL_30HR' &&
          differenceInHours(b.startTime, a.startTime) < 48
        ) {
          conflicts.push({
            type: 'CONSECUTIVE_30HR',
            message: `${user?.name ?? 'Unknown'}: Two 30hr calls within 48h — ${fmtTime(a.startTime)} and ${fmtTime(b.startTime)}`,
            entries: [a, b],
            severity: 'error',
          });
        }
      }

      // 4. Hour limit near — per-entry check
      if (user) {
        const maxH = user.maxHoursLimit ?? 80;
        const weekStart = getWeekStart(entryI.date);
        const weekHours = sorted
          .filter(
            (e) =>
              e.startTime >= weekStart &&
              e.startTime < addHours(weekStart, 7 * 24),
          )
          .reduce((sum, e) => sum + differenceInHours(e.endTime, e.startTime), 0);

        if (weekHours >= maxH * 0.85 && weekHours < maxH) {
          // Only flag once per user
          const alreadyFlagged = conflicts.some(
            (c) =>
              c.type === 'HOUR_LIMIT_NEAR' &&
              c.entries[0]?.userId === userId,
          );
          if (!alreadyFlagged) {
            conflicts.push({
              type: 'HOUR_LIMIT_NEAR',
              message: `${user.name}: ${weekHours}/${maxH} hours this week (≥85% of limit)`,
              entries: [entryI],
              severity: 'warning',
            });
          }
        }
      }
    }
  }

  // ── Understaffing checks ──
  if (templates && templates.length > 0) {
    // Build template lookup by name
    const templateMap = new Map<string, ShiftTemplateRecord>();
    for (const t of templates) templateMap.set(t.name, t);

    for (const [key, shiftEntries] of byShiftKey) {
      const [, shiftName] = key.split('|', 2);
      const template = templateMap.get(shiftName);
      if (!template) continue;

      const seniorsAssigned = shiftEntries.filter((e) => {
        const u = userMap.get(e.userId);
        return u && isSenior(u);
      }).length;

      const juniorsAssigned = shiftEntries.filter((e) => {
        const u = userMap.get(e.userId);
        return u && isJunior(u);
      }).length;

      if (seniorsAssigned < template.requiredSeniorsCount) {
        conflicts.push({
          type: 'UNDERSTAFFED',
          message: `${shiftName} on ${key.split('|')[0]}: Only ${seniorsAssigned}/${template.requiredSeniorsCount} seniors assigned`,
          entries: shiftEntries,
          severity: 'warning',
        });
      }

      if (juniorsAssigned < template.requiredJuniorsCount) {
        conflicts.push({
          type: 'UNDERSTAFFED',
          message: `${shiftName} on ${key.split('|')[0]}: Only ${juniorsAssigned}/${template.requiredJuniorsCount} juniors assigned`,
          entries: shiftEntries,
          severity: 'warning',
        });
      }
    }
  }

  return conflicts;
}

// ── Helpers ──

function fmtTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
