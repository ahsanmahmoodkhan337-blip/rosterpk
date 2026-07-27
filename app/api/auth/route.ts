import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, pinCode } = body;

    if (!userId || !pinCode) {
      return NextResponse.json(
        { success: false, error: 'userId and pinCode are required' },
        { status: 400 }
      );
    }

    if (typeof pinCode !== 'string' || pinCode.length !== 4 || !/^\d{4}$/.test(pinCode)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be exactly 4 digits' },
        { status: 400 }
      );
    }

    // Try to fetch user with pinCode column (new schema)
    let userData: any = null;
    let columnError = false;

    try {
      const { data, error } = await supabase
        .from('User')
        .select('id, name, role, rank, pinCode, departmentId, department:Department(id, name, hospitalName)')
        .eq('id', userId)
        .single();

      if (error) {
        // Check if the error is about missing columns (migration not yet run)
        if (
          error.message?.includes('pinCode') ||
          error.message?.includes('rank') ||
          error.message?.includes('schema cache')
        ) {
          columnError = true;
        } else {
          return NextResponse.json(
            { success: false, error: 'User not found' },
            { status: 404 }
          );
        }
      } else {
        userData = data;
      }
    } catch {
      columnError = true;
    }

    // If new columns don't exist, fall back to basic user lookup
    if (columnError || !userData) {
      const { data: basicUser, error: basicError } = await supabase
        .from('User')
        .select('id, name, role, departmentId, department:Department(id, name, hospitalName)')
        .eq('id', userId)
        .single();

      if (basicError || !basicUser) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }

      // No pinCode column — accept any 4-digit PIN (first-time setup mode)
      // Store the PIN in localStorage only; server can't persist it without the column
      const dept = (basicUser as any).department;
      return NextResponse.json({
        success: true,
        user: {
          id: basicUser.id,
          name: basicUser.name,
          role: basicUser.role,
          rank: null,
          departmentId: basicUser.departmentId,
          departmentName: dept?.name ?? 'Unknown',
        },
        setupMode: true,
      });
    }

    // New schema path: validate stored PIN or accept first-time PIN
    const storedPin = userData.pinCode;

    if (storedPin === null || storedPin === undefined || storedPin === '') {
      // No PIN set yet — accept this as first-time PIN and store it
      const { error: updateErr } = await supabase
        .from('User')
        .update({ pinCode })
        .eq('id', userId);

      if (updateErr) {
        // If we can't update, still allow login (graceful fallback)
        console.warn('Could not store first-time PIN:', updateErr.message);
      }
    } else if (storedPin !== pinCode) {
      return NextResponse.json(
        { success: false, error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    const dept = userData.department;
    return NextResponse.json({
      success: true,
      user: {
        id: userData.id,
        name: userData.name,
        role: userData.role,
        rank: userData.rank ?? null,
        departmentId: userData.departmentId,
        departmentName: dept?.name ?? 'Unknown',
      },
    });
  } catch (err: any) {
    console.error('Auth error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
