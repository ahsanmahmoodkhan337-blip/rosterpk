import { addHours, differenceInHours } from 'date-fns';
import { supabase } from './supabase';

interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
  departmentId: string;
}

interface ShiftTemplate {
  id: string;
  name: string;
  durationHours: number;
  departmentId: string;
}

export async function generateDraftRoster(departmentId: string, startDate: Date, days: number) {
  const { data: users, error: usersErr } = await supabase
    .from('User')
    .select('*')
    .eq('departmentId', departmentId)
    .in('role', ['HO', 'PGT']);

  if (usersErr) throw usersErr;

  const { data: templates, error: tmplErr } = await supabase
    .from('ShiftTemplate')
    .select('*')
    .eq('departmentId', departmentId);

  if (tmplErr) throw tmplErr;

  if (!users || !templates) {
    throw new Error('No users or templates found for department');
  }

  let rosterDraft: Array<{
    date: Date;
    userId: string;
    shiftName: string;
    startTime: Date;
    endTime: Date;
  }> = [];
  let userLastShiftEnd: Record<string, Date> = {};

  // Initialize tracking
  users.forEach((u: User) => (userLastShiftEnd[u.id] = new Date(0)));

  for (let day = 0; day < days; day++) {
    const currentDate = addHours(startDate, day * 24);

    for (const template of templates as ShiftTemplate[]) {
      // Find an available doctor who has had at least 12 hours of rest
      let assignedUser = users.find((user: User) => {
        const lastEnd = userLastShiftEnd[user.id];
        const hoursRested = differenceInHours(currentDate, lastEnd);
        return hoursRested >= 12;
      });

      if (assignedUser) {
        const shiftEnd = addHours(currentDate, template.durationHours);

        rosterDraft.push({
          date: currentDate,
          userId: assignedUser.id,
          shiftName: template.name,
          startTime: currentDate,
          endTime: shiftEnd,
        });

        // Update the doctor's last shift end time
        userLastShiftEnd[assignedUser.id] = shiftEnd;

        // Rotate array to ensure fair distribution (Round Robin)
        users.push(users.shift() as User);
      } else {
        console.warn(`Constraint Violation: Unassigned ${template.name} on ${currentDate}`);
      }
    }
  }

  // Save the draft to the database
  const { error: insertErr } = await supabase
    .from('RosterEntry')
    .insert(
      rosterDraft.map((entry) => ({
        date: entry.date.toISOString(),
        userId: entry.userId,
        shiftName: entry.shiftName,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime.toISOString(),
      }))
    );

  if (insertErr) throw insertErr;

  return rosterDraft;
}
