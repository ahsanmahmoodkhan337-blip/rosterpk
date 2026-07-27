import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('Department')
    .select('id, name, hospitalName, accessCode');

  if (error) {
    // Try without accessCode (old schema)
    const { data: fallback, error: fallbackErr } = await supabase
      .from('Department')
      .select('id, name, hospitalName');

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
    const { name, hospitalName } = body;

    if (!name || !hospitalName) {
      return NextResponse.json(
        { error: 'name and hospitalName are required' },
        { status: 400 }
      );
    }

    // Generate a random 6-character alphanumeric access code (uppercase)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let accessCode = '';
    for (let i = 0; i < 6; i++) {
      accessCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Try inserting with accessCode (new schema), fall back without
    let department;
    const { data: withCode, error: withCodeErr } = await supabase
      .from('Department')
      .insert({ name, hospitalName, accessCode })
      .select('id, name, hospitalName, accessCode')
      .single();

    if (withCodeErr) {
      // Fall back to old schema (no accessCode column)
      const { data: withoutCode, error: withoutCodeErr } = await supabase
        .from('Department')
        .insert({ name, hospitalName })
        .select('id, name, hospitalName')
        .single();

      if (withoutCodeErr) {
        return NextResponse.json({ error: withoutCodeErr.message }, { status: 500 });
      }

      department = withoutCode;
    } else {
      department = withCode;
    }

    return NextResponse.json(department, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
