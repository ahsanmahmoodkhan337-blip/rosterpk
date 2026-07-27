'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import Header from './components/Header';
import AuthGuard from './components/AuthGuard';
import { useAuth } from './components/AuthProvider';

export default function TraineeDashboard() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function loadShifts() {
      setLoading(true);
      try {
        const res = await fetch(`/api/my-shifts?userId=${user!.id}`);
        const data = await res.json();
        if (data.error) {
          console.error('Failed to load shifts:', data.error);
          setShifts([]);
        } else {
          setShifts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to load shifts:', err);
        setShifts([]);
      }
      setLoading(false);
    }

    loadShifts();
  }, [user]);

  const deptName = user?.departmentName ?? 'No department assigned';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="My Schedule"
        subtitle={deptName}
      />

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

          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-[#1e5cd4] border-t-transparent" />
              Loading shifts...
            </div>
          )}

          {!loading && shifts.map((shift: any) => (
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
          {!loading && shifts.length === 0 && (
            <p className="text-gray-500 text-sm">No upcoming shifts assigned.</p>
          )}
        </div>
      </div>
    </div>
  );
}
