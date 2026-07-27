import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Manually load .env to avoid dotenv dependency
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found — env vars must be set externally
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateAccessCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function seed() {
  console.log('🌱 Seeding RosterDoc database...');

  // 1. Create/update Department
  const accessCode = generateAccessCode();

  // Try with accessCode first, fallback without
  const { data: dept, error: deptErr } = await supabase
    .from('Department')
    .insert({
      name: 'Surgery',
      hospitalName: 'Aga Khan University Hospital',
      accessCode,
    })
    .select()
    .single();

  let departmentId: string;
  let hasAccessCode = false;

  if (deptErr) {
    // Try without accessCode (old schema)
    const { data: dept2, error: deptErr2 } = await supabase
      .from('Department')
      .insert({
        name: 'Surgery',
        hospitalName: 'Aga Khan University Hospital',
      })
      .select()
      .single();

    if (deptErr2) {
      // Department already exists — fetch it
      const { data: existingDept } = await supabase
        .from('Department')
        .select('*')
        .eq('name', 'Surgery')
        .single();
      if (existingDept) {
        console.log('  Using existing department:', existingDept.id);
        departmentId = existingDept.id;
        hasAccessCode = !!existingDept.accessCode;
        // Try to update access code if not set
        if (!hasAccessCode) {
          const { error: updateErr } = await supabase
            .from('Department')
            .update({ accessCode: generateAccessCode() })
            .eq('id', existingDept.id);
          if (!updateErr) {
            console.log('  Updated accessCode for existing department');
            hasAccessCode = true;
          } else if (updateErr.message?.includes('accessCode')) {
            console.log('  ⚠️ accessCode column not yet added — run migration first');
          }
        }
      } else {
        throw deptErr2;
      }
    } else {
      console.log('✅ Department created (without accessCode):', dept2.id);
      departmentId = dept2.id;
      console.log('  ⚠️ accessCode column not yet added — run migration first');
    }
  } else {
    console.log('✅ Department created:', dept.id, 'accessCode:', dept.accessCode);
    departmentId = dept.id;
    hasAccessCode = true;
  }

  // 2. Create Users — try with new fields, fall back to old
  const usersV2 = [
    { name: 'Dr. Ahmed Khan', phone: '+923001234567', role: 'ADMIN', rank: 'REGISTRAR', email: 'ahmed.khan@hospital.pk', pinCode: '1234', maxHoursLimit: 80, departmentId },
    { name: 'Dr. Fatima Ali', phone: '+923001234568', role: 'PGT', rank: 'PGT_Y4', email: 'fatima.ali@hospital.pk', pinCode: '2345', maxHoursLimit: 80, departmentId },
    { name: 'Dr. Bilal Hussain', phone: '+923001234569', role: 'PGT', rank: 'PGT_Y3', email: 'bilal.hussain@hospital.pk', pinCode: '3456', maxHoursLimit: 80, departmentId },
    { name: 'Dr. Zainab Riaz', phone: '+923001234572', role: 'PGT', rank: 'PGT_Y2', email: 'zainab.riaz@hospital.pk', pinCode: '6789', maxHoursLimit: 80, departmentId },
    { name: 'Dr. Sara Ahmed', phone: '+923001234570', role: 'HO', rank: 'HO_BATCH_A', email: 'sara.ahmed@hospital.pk', pinCode: '4567', maxHoursLimit: 80, departmentId },
    { name: 'Dr. Omar Farooq', phone: '+923001234571', role: 'HO', rank: 'HO_BATCH_B', email: 'omar.farooq@hospital.pk', pinCode: '5678', maxHoursLimit: 80, departmentId },
    { name: 'Dr. Hamza Tariq', phone: '+923001234573', role: 'HO', rank: 'HO_BATCH_A', email: 'hamza.tariq@hospital.pk', pinCode: '7890', maxHoursLimit: 80, departmentId },
  ];

  let useV2Fields = true;
  for (const user of usersV2) {
    const { data: u, error: userErr } = await supabase
      .from('User')
      .upsert(user, { onConflict: 'phone' })
      .select()
      .single();

    if (userErr && useV2Fields) {
      // New fields not found — fall back to old schema
      useV2Fields = false;
      console.log('  ⚠️ New User columns (email/pinCode/rank) not yet added — falling back to old schema');
    }

    if (!useV2Fields) {
      // Retry with old fields only
      const { error: retryErr } = await supabase
        .from('User')
        .upsert({
          name: user.name,
          phone: user.phone,
          role: user.role,
          departmentId: user.departmentId,
        }, { onConflict: 'phone' })
        .select()
        .single();

      if (retryErr) {
        console.error(`  Error creating user ${user.name}:`, retryErr.message);
      } else {
        console.log(`✅ User upserted (old schema): ${user.name} (${user.role})`);
      }
    } else {
      if (userErr) {
        console.error(`  Error creating user ${user.name}:`, userErr.message);
      } else {
        console.log(`✅ User upserted: ${user.name} (${user.role} / ${(user as any).rank || 'N/A'})`);
      }
    }
  }

  // 3. Create 4 Shift Templates (v2)
  // First, delete old templates so we have a clean slate
  await supabase
    .from('ShiftTemplate')
    .delete()
    .eq('departmentId', departmentId);

  const templatesV2 = [
    {
      name: 'Morning',
      durationHours: 6,
      shiftType: 'MORNING',
      startTime: '08:00',
      endTime: '14:00',
      requiredSeniorsCount: 1,
      requiredJuniorsCount: 2,
      departmentId,
    },
    {
      name: 'Evening',
      durationHours: 6,
      shiftType: 'EVENING',
      startTime: '14:00',
      endTime: '20:00',
      requiredSeniorsCount: 1,
      requiredJuniorsCount: 1,
      departmentId,
    },
    {
      name: 'Night',
      durationHours: 12,
      shiftType: 'NIGHT',
      startTime: '20:00',
      endTime: '08:00+1',
      requiredSeniorsCount: 1,
      requiredJuniorsCount: 2,
      departmentId,
    },
    {
      name: '30hr Call',
      durationHours: 30,
      shiftType: 'CALL_30HR',
      startTime: '08:00',
      endTime: '14:00+1',
      requiredSeniorsCount: 2,
      requiredJuniorsCount: 2,
      departmentId,
    },
  ];

  let useV2Templates = true;
  for (const template of templatesV2) {
    const { error: upsertErr } = await supabase
      .from('ShiftTemplate')
      .upsert(template, { onConflict: 'name,departmentId', ignoreDuplicates: false })
      .select()
      .single();

    if (upsertErr && useV2Templates) {
      useV2Templates = false;
      console.log('  ⚠️ New ShiftTemplate columns not yet added — falling back to old schema');
    }

    if (!useV2Templates) {
      // Old schema — use simple insert (we already deleted old templates)
      const { error: insertErr } = await supabase
        .from('ShiftTemplate')
        .insert({
          name: template.name,
          durationHours: template.durationHours,
          departmentId: template.departmentId,
        });

      if (insertErr) {
        console.error(`  Error creating shift ${template.name}:`, insertErr.message);
      } else {
        console.log(`✅ Shift template inserted (old schema): ${template.name} (${template.durationHours}h)`);
      }
    } else {
      if (upsertErr) {
        console.error(`  Error creating shift ${template.name}:`, upsertErr.message);
      } else {
        console.log(`✅ Shift template upserted: ${template.name} (${template.shiftType}, ${template.durationHours}h, S${template.requiredSeniorsCount}/J${template.requiredJuniorsCount})`);
      }
    }
  }

  // 4. Try creating sample roster entries with status=ASSIGNED
  await seedSampleRoster(departmentId);

  console.log('🎉 Seeding complete!');
  console.log('\n📋 If you see ⚠️ warnings above, run the SQL migration first:');
  console.log('   1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/szcseiylppfhcbmutjdw/sql/new');
  console.log('   2. Paste the contents of scripts/schema.sql');
  console.log('   3. Run, then re-run: npx tsx scripts/seed.ts');
}

async function seedSampleRoster(departmentId: string) {
  const { data: users } = await supabase
    .from('User')
    .select('id, name')
    .eq('departmentId', departmentId);

  const { data: templates } = await supabase
    .from('ShiftTemplate')
    .select('id, name')
    .eq('departmentId', departmentId);

  if (!users?.length || !templates?.length) {
    console.log('  ⚠️ No users or templates found — skipping sample roster');
    return;
  }

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);
  monday.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from('RosterEntry')
    .select('id')
    .gte('date', monday.toISOString())
    .lte('date', new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());

  if (existing && existing.length > 0) {
    console.log('  ⚠️ Roster entries already exist for this week — skipping sample roster');
    return;
  }

  const entries: any[] = [];
  for (let day = 0; day < 5; day++) {
    for (const template of templates) {
      const userIndex = (day + templates.indexOf(template)) % users.length;
      const date = new Date(monday);
      date.setDate(date.getDate() + day);
      date.setHours(8, 0, 0, 0);

      // Determine actual hours based on shift name
      let hours: number;
      const n = template.name;
      if (n.includes('30hr') || n.includes('30')) hours = 30;
      else if (n.includes('Night')) hours = 12;
      else if (n.includes('Evening')) hours = 6;
      else hours = 6; // Morning

      const endDate = new Date(date);
      endDate.setHours(endDate.getHours() + hours);

      const entry: any = {
        date: date.toISOString(),
        userId: users[userIndex].id,
        shiftName: template.name,
        startTime: date.toISOString(),
        endTime: endDate.toISOString(),
        status: 'ASSIGNED',
      };

      entries.push(entry);
    }
  }

  // Try inserting with status first
  const { error: insertErr } = await supabase
    .from('RosterEntry')
    .insert(entries);

  if (insertErr?.message?.includes('status')) {
    // status column doesn't exist yet — remove it and retry
    const entriesWithoutStatus = entries.map(({ status, ...rest }: any) => rest);
    const { error: retryErr } = await supabase
      .from('RosterEntry')
      .insert(entriesWithoutStatus);

    if (retryErr) {
      console.error('  Error creating sample roster:', retryErr.message);
    } else {
      console.log(`✅ Sample roster created: ${entriesWithoutStatus.length} entries (without status field)`);
    }
  } else if (insertErr) {
    console.error('  Error creating sample roster:', insertErr.message);
  } else {
    console.log(`✅ Sample roster created: ${entries.length} entries with status=ASSIGNED`);
  }
}

seed().catch(console.error);
