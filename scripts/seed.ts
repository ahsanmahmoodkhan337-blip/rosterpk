import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  console.log('🌱 Seeding RosterDoc database...');

  // 1. Create Department
  const { data: dept, error: deptErr } = await supabase
    .from('Department')
    .insert({ name: 'Surgery', hospitalName: 'Aga Khan University Hospital' })
    .select()
    .single();

  if (deptErr) {
    console.error('Error creating department:', deptErr.message);
    // Try to fetch existing department
    const { data: existingDept } = await supabase
      .from('Department')
      .select('*')
      .eq('name', 'Surgery')
      .single();
    if (existingDept) {
      console.log('  Using existing department:', existingDept.id);
    } else {
      throw deptErr;
    }
  } else {
    console.log('✅ Department created:', dept.id);
  }

  const departmentId = dept?.id || (await supabase.from('Department').select('*').eq('name', 'Surgery').single()).data?.id;
  if (!departmentId) throw new Error('No department found');

  // 2. Create Users
  const users = [
    { name: 'Dr. Ahmed Khan', phone: '+923001234567', role: 'ADMIN', departmentId },
    { name: 'Dr. Fatima Ali', phone: '+923001234568', role: 'PGT', departmentId },
    { name: 'Dr. Bilal Hussain', phone: '+923001234569', role: 'PGT', departmentId },
    { name: 'Dr. Sara Ahmed', phone: '+923001234570', role: 'HO', departmentId },
    { name: 'Dr. Omar Farooq', phone: '+923001234571', role: 'HO', departmentId },
  ];

  for (const user of users) {
    const { data: u, error: userErr } = await supabase
      .from('User')
      .upsert(user, { onConflict: 'phone' })
      .select()
      .single();

    if (userErr) {
      console.error(`  Error creating user ${user.name}:`, userErr.message);
    } else {
      console.log(`✅ User created: ${user.name} (${user.role})`);
    }
  }

  // 3. Create Shift Templates
  const templates = [
    { name: 'Morning', durationHours: 8, departmentId },
    { name: 'Night Call', durationHours: 12, departmentId },
  ];

  for (const template of templates) {
    const { data: t, error: tmplErr } = await supabase
      .from('ShiftTemplate')
      .upsert(template, { onConflict: 'name,departmentId', ignoreDuplicates: false })
      .select()
      .single();

    if (tmplErr) {
      // Try insert without upsert
      const { error: insertErr } = await supabase
        .from('ShiftTemplate')
        .insert(template);

      if (insertErr) {
        console.error(`  Error creating shift ${template.name}:`, insertErr.message);
      } else {
        console.log(`✅ Shift template created: ${template.name} (${template.durationHours}h)`);
      }
    } else {
      console.log(`✅ Shift template created: ${template.name} (${template.durationHours}h)`);
    }
  }

  console.log('🎉 Seeding complete!');
}

seed().catch(console.error);
