import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

const CURRENT_USER_ID = 'sample-user-id';

export default async function TraineeDashboard() {
  const { data: userData } = await supabase
    .from('User')
    .select('*, department:Department(*)')
    .eq('id', CURRENT_USER_ID)
    .single();

  const user = userData;

  const { data: shifts } = await supabase
    .from('RosterEntry')
    .select('*')
    .eq('userId', CURRENT_USER_ID)
    .gte('startTime', new Date().toISOString())
    .order('startTime', { ascending: true })
    .limit(5);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Gold accent top bar */}
      <div className="h-1 bg-[#fad23b]" />

      {/* Header with logo and brand */}
      <header className="bg-[#1e5cd4] p-4 shadow-md">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="RosterDoc" className="h-8 w-auto" />
          <div>
            <h1 className="text-xl font-bold text-white">My Schedule</h1>
            <p className="text-xs text-[#fad23b]">
              {user?.department?.name ?? 'No department assigned'}
            </p>
          </div>
        </div>
      </header>

      <div className="p-4">
        {/* Promo banner */}
        <div className="bg-[#1e5cd4] rounded-lg p-4 mb-6 shadow-md text-white">
          <h3 className="font-bold text-sm">Tired of 30-hour shifts?</h3>
          <p className="text-xs mt-1 text-blue-200">
            Transition your clinical knowledge into flexible, remote US Healthcare
            roles.
          </p>
          <button className="mt-3 bg-[#fad23b] text-black text-xs font-bold py-2 px-4 rounded hover:bg-[#ffe066] transition-colors">
            Explore HealthcareHustlers
          </button>
        </div>

        {/* Upcoming Duties */}
        <div className="space-y-4">
          <h2 className="font-semibold text-[#1e5cd4]">Upcoming Duties</h2>
          {(shifts ?? []).map((shift: any) => (
            <div
              key={shift.id}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center"
            >
              <div>
                <p className="font-bold text-gray-800">{shift.shiftName}</p>
                <p className="text-sm text-gray-500">
                  {format(new Date(shift.startTime), 'MMM dd, h:mm a')}
                </p>
              </div>
              <button className="bg-[#fad23b] text-black px-3 py-1 rounded text-sm hover:bg-[#ffe066] transition-colors">
                Request Swap
              </button>
            </div>
          ))}
          {(!shifts || shifts.length === 0) && (
            <p className="text-gray-500 text-sm">No upcoming shifts assigned.</p>
          )}
        </div>
      </div>
    </div>
  );
}
