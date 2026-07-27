import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { departmentName, hospitalName, accessCode } = body;

    // Support both: department name (free-text) AND access code (legacy)
    let deptName = '';
    let hospName = '';

    if (accessCode && typeof accessCode === 'string' && accessCode.length === 6) {
      // Legacy path: lookup by access code
      const upperCode = accessCode.toUpperCase();
      const { data: dept, error } = await supabase
        .from('Department')
        .select('id, name, hospitalName, accessCode')
        .eq('accessCode', upperCode)
        .single();

      if (error) {
        if (error.message?.includes('accessCode') || error.message?.includes('schema cache')) {
          return NextResponse.json(
            { error: 'Access code lookup is not available. Please ask your department admin for the code.' },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: 'Invalid access code. No department found.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: dept.id,
        name: dept.name,
        hospitalName: dept.hospitalName,
      });
    }

    // New path: lookup by department name, or create
    if (departmentName && typeof departmentName === 'string') {
      deptName = departmentName.trim();
      hospName = (typeof hospitalName === 'string' ? hospitalName.trim() : '') || 'Default Hospital';
    } else {
      return NextResponse.json(
        { error: 'Please provide a department name or a valid 6-character access code.' },
        { status: 400 }
      );
    }

    if (deptName.length < 2) {
      return NextResponse.json(
        { error: 'Department name must be at least 2 characters' },
        { status: 400 }
      );
    }

    // Case-insensitive lookup by name
    const { data: existing, error: lookupErr } = await supabase
      .from('Department')
      .select('id, name, hospitalName')
      .ilike('name', deptName)
      .maybeSingle();

    if (lookupErr && !lookupErr.message?.includes('No rows found') && !lookupErr.message?.includes('multiple')) {
      console.error('Department lookup error:', lookupErr);
      return NextResponse.json(
        { error: 'Error looking up department' },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json({
        id: existing.id,
        name: existing.name,
        hospitalName: existing.hospitalName,
      });
    }

    // Department doesn't exist — create it
    // Generate access code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let accessCodeGenerated = '';
    for (let i = 0; i < 6; i++) {
      accessCodeGenerated += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    try {
      const { data: created, error: createErr } = await supabase
        .from('Department')
        .insert({
          name: deptName,
          hospitalName: hospName,
          accessCode: accessCodeGenerated,
        })
        .select('id, name, hospitalName, accessCode')
        .single();

      if (createErr) {
        // Fall back to insert without accessCode
        const { data: fallback, error: fallbackErr } = await supabase
          .from('Department')
          .insert({
            name: deptName,
            hospitalName: hospName,
          })
          .select('id, name, hospitalName')
          .single();

        if (fallbackErr) {
          return NextResponse.json(
            { error: 'Failed to create department: ' + fallbackErr.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          id: fallback.id,
          name: fallback.name,
          hospitalName: fallback.hospitalName,
        }, { status: 201 });
      }

      return NextResponse.json({
        id: created.id,
        name: created.name,
        hospitalName: created.hospitalName,
      }, { status: 201 });
    } catch (createErr: any) {
      return NextResponse.json(
        { error: 'Failed to create department: ' + (createErr.message || 'Unknown error') },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error('Join error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
