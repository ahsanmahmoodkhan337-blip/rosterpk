import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('departmentId');

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId query param is required' }, { status: 400 });
  }

  // Try with new schema fields first (rank), fall back to old schema
  let { data, error } = await supabase
    .from('User')
    .select('id, name, phone, role, rank')
    .eq('departmentId', departmentId);

  if (error) {
    // Fall back to old schema (no rank column)
    const { data: fallback, error: fallbackErr } = await supabase
      .from('User')
      .select('id, name, phone, role')
      .eq('departmentId', departmentId);

    if (fallbackErr) {
      return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
    }

    return NextResponse.json(fallback ?? []);
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, role, departmentId, pinCode } = body;

    if (!name || !departmentId || !pinCode) {
      return NextResponse.json(
        { error: 'name, departmentId, and pinCode are required' },
        { status: 400 },
      );
    }

    const trimmedName = name.trim();
    const trimmedPhone = (phone || '').trim();
    const trimmedRole = (role || 'HO').trim();
    const trimmedPin = String(pinCode).trim();

    if (trimmedName.length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
    }

    if (trimmedPin.length < 4 || trimmedPin.length > 6 || !/^\d+$/.test(trimmedPin)) {
      return NextResponse.json(
        { error: 'PIN must be 4-6 digits' },
        { status: 400 },
      );
    }

    // Check how many users already exist in this department
    const { count, error: countErr } = await supabase
      .from('User')
      .select('*', { count: 'exact', head: true })
      .eq('departmentId', departmentId);

    if (countErr) {
      return NextResponse.json({ error: 'Failed to check department: ' + countErr.message }, { status: 500 });
    }

    const isFirstUser = count === 0;

    if (!isFirstUser) {
      // Verify PIN matches an existing admin's PIN in this department
      const { data: adminUser, error: adminErr } = await supabase
        .from('User')
        .select('pinCode')
        .eq('departmentId', departmentId)
        .eq('role', 'ADMIN')
        .maybeSingle();

      if (adminErr) {
        // Try without pinCode column
        const { data: adminFallback, error: fallbackErr } = await supabase
          .from('User')
          .select('id')
          .eq('departmentId', departmentId)
          .eq('role', 'ADMIN')
          .maybeSingle();

        if (fallbackErr || !adminFallback) {
          return NextResponse.json(
            { error: 'No admin found for this department. Contact your administrator.' },
            { status: 400 },
          );
        }
        // Fallback: accept any PIN when pinCode column doesn't exist
      } else if (adminUser) {
        const storedPin = (adminUser as any).pinCode;
        if (storedPin && storedPin !== trimmedPin) {
          return NextResponse.json(
            { error: 'Invalid department PIN. Please check with your admin.' },
            { status: 401 },
          );
        }
      }
    }

    // Determine role: first user is ADMIN, others are HO
    const userRole = isFirstUser ? 'ADMIN' : trimmedRole;

    // Create user
    const insertPayload: Record<string, any> = {
      name: trimmedName,
      phone: trimmedPhone,
      role: userRole,
      departmentId,
    };

    // Try to include pinCode and rank if the column exists
    try {
      insertPayload.pinCode = trimmedPin;
    } catch {
      // Column doesn't exist, skip
    }

    if (trimmedRole && trimmedRole !== 'HO' && trimmedRole !== 'ADMIN') {
      try {
        insertPayload.rank = trimmedRole.toUpperCase().replace(/ /g, '_');
        insertPayload.role = 'HO';
      } catch {
        // rank column may not exist
      }
    }

    const { data: newUser, error: insertErr } = await supabase
      .from('User')
      .insert(insertPayload)
      .select('id, name, role, rank, departmentId, department:Department(id, name, hospitalName)')
      .single();

    if (insertErr) {
      // Try without pinCode and rank
      const fallbackPayload: Record<string, any> = {
        name: trimmedName,
        phone: trimmedPhone,
        role: userRole,
        departmentId,
      };

      const { data: fallbackUser, error: fallbackErr } = await supabase
        .from('User')
        .insert(fallbackPayload)
        .select('id, name, role, departmentId, department:Department(id, name, hospitalName)')
        .single();

      if (fallbackErr) {
        return NextResponse.json(
          { error: 'Failed to create user: ' + fallbackErr.message },
          { status: 500 },
        );
      }

      const dept = (fallbackUser as any).department;
      return NextResponse.json(
        {
          id: fallbackUser.id,
          name: fallbackUser.name,
          role: fallbackUser.role,
          rank: null,
          departmentId: fallbackUser.departmentId,
          departmentName: dept?.name ?? 'Unknown',
        },
        { status: 201 },
      );
    }

    const dept = (newUser as any).department;
    return NextResponse.json(
      {
        id: newUser.id,
        name: newUser.name,
        role: newUser.role,
        rank: (newUser as any).rank ?? null,
        departmentId: newUser.departmentId,
        departmentName: dept?.name ?? 'Unknown',
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error('User creation error:', err);
    return NextResponse.json(
      { error: 'Failed to create user: ' + (err.message || 'Unknown error') },
      { status: 500 },
    );
  }
}
