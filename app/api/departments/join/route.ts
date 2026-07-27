import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessCode } = body;

    if (!accessCode || typeof accessCode !== 'string' || accessCode.length !== 6) {
      return NextResponse.json(
        { error: 'A valid 6-character access code is required' },
        { status: 400 }
      );
    }

    const upperCode = accessCode.toUpperCase();

    // Try with accessCode column
    let { data: dept, error } = await supabase
      .from('Department')
      .select('id, name, hospitalName, accessCode')
      .eq('accessCode', upperCode)
      .single();

    if (error) {
      // If the error is about missing accessCode column
      if (error.message?.includes('accessCode') || error.message?.includes('schema cache')) {
        return NextResponse.json(
          { error: 'Access code lookup is not available. Please ask your department admin for the code.' },
          { status: 503 }
        );
      }
      // No department found with that code
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
  } catch (err: any) {
    console.error('Join error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
