'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format, addWeeks, subWeeks, startOfWeek, parseISO, differenceInHours } from 'date-fns';
import Header from '../components/Header';

interface Department {
  id: string;
  name: string;
  hospitalName: string;
}

interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
}

interface ShiftTemplate {
  id: string;
  name: string;
  durationHours: number;
  departmentId: string;
}

interface RosterEntry {
  id: string;
  date: string;
  userId: string;
  userName: string;
  userRole: string;
  shiftName: string;
  startTime: string;
  endTime: string;
}

interface Conflict {
  doctorName: string;
  entry1: RosterEntry;
  entry2: RosterEntry;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AdminRosterBuilder() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [users, setUsers] = useState<User[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [openCell, setOpenCell] = useState<{ dayIndex: number; shiftName: string } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then(setDepartments)
      .catch(() => setError('Failed to load departments'));
  }, []);

  useEffect(() => {
    if (!selectedDeptId) return;
    setLoading(true);
    setError(null);

    const weekStr = format(weekStart, "yyyy-MM-dd'T'00:00:00");

    Promise.all([
      fetch(`/api/users?departmentId=${selectedDeptId}`).then((r) => r.json()),
      fetch(`/api/shifts?departmentId=${selectedDeptId}`).then((r) => r.json()),
      fetch(`/api/roster?departmentId=${selectedDeptId}&weekStart=${weekStr}`).then((r) => r.json()),
    ])
      .then(([usersData, shiftsData, rosterData]) => {
        if (usersData.error) throw new Error(usersData.error);
        if (shiftsData.error) throw new Error(shiftsData.error);
        if (rosterData.error) throw new Error(rosterData.error);
        setUsers(Array.isArray(usersData) ? usersData : []);
        setShiftTemplates(Array.isArray(shiftsData) ? shiftsData : []);
        setRosterEntries(Array.isArray(rosterData) ? rosterData : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDeptId, weekStart]);

  useEffect(() => {
    detectConflicts();
  }, [rosterEntries]);

  function detectConflicts() {
    const found: Conflict[] = [];
    const byUser: Record<string, RosterEntry[]> = {};
    for (const entry of rosterEntries) {
      if (!byUser[entry.userId]) byUser[entry.userId] = [];
      byUser[entry.userId].push(entry);
    }
    for (const userId of Object.keys(byUser)) {
      const userEntries = byUser[userId].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      for (let i = 0; i < userEntries.length - 1; i++) {
        for (let j = i + 1; j < userEntries.length; j++) {
          const endA = new Date(userEntries[i].endTime);
          const startB = new Date(userEntries[j].startTime);
          const hoursBetween = Math.abs(differenceInHours(startB, endA));
          if (hoursBetween < 12) {
            found.push({
              doctorName: userEntries[i].userName,
              entry1: userEntries[i],
              entry2: userEntries[j],
            });
          }
        }
      }
    }
    setConflicts(found);
  }

  const conflictEntryIds = new Set<string>();
  for (const c of conflicts) {
    conflictEntryIds.add(c.entry1.id);
    conflictEntryIds.add(c.entry2.id);
  }

  const prevWeek = () => setWeekStart((w) => subWeeks(w, 1));
  const nextWeek = () => setWeekStart((w) => addWeeks(w, 1));

  function getDateForDay(dayIndex: number): Date {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  function findEntry(dayIndex: number, shiftName: string): RosterEntry | undefined {
    const dateStr = format(getDateForDay(dayIndex), 'yyyy-MM-dd');
    return rosterEntries.find(
      (e) => e.date.startsWith(dateStr) && e.shiftName === shiftName
    );
  }

  async function assignDoctor(dayIndex: number, shiftName: string, userId: string | null) {
    setOpenCell(null);
    if (!userId) return;

    const date = getDateForDay(dayIndex);
    const template = shiftTemplates.find((t) => t.name === shiftName);
    if (!template) return;

    const startTime = new Date(date);
    startTime.setHours(8, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + template.durationHours);

    const userName = users.find((u) => u.id === userId)?.name ?? 'Unknown';
    const userRole = users.find((u) => u.id === userId)?.role ?? 'Unknown';

    const optimisticEntry: RosterEntry = {
      id: 'temp-' + Math.random(),
      date: format(startTime, "yyyy-MM-dd'T'HH:mm:ss"),
      userId,
      userName,
      userRole,
      shiftName,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };

    let updated = rosterEntries.filter(
      (e) => !(e.date.startsWith(format(getDateForDay(dayIndex), 'yyyy-MM-dd')) && e.shiftName === shiftName)
    );
    updated.push(optimisticEntry);
    setRosterEntries(updated);

    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          date: format(startTime, "yyyy-MM-dd'T'HH:mm:ss"),
          shiftName,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Failed to assign');
      const created = await res.json();
      setRosterEntries((prev) => {
        const filtered = prev.filter((e) => e.id !== optimisticEntry.id);
        return [...filtered, { ...optimisticEntry, id: created.id, date: created.date }];
      });
    } catch (e: any) {
      setError('Assignment failed: ' + e.message);
      const weekStr = format(weekStart, "yyyy-MM-dd'T'00:00:00");
      fetch(`/api/roster?departmentId=${selectedDeptId}&weekStart=${weekStr}`)
        .then((r) => r.json())
        .then((data) => setRosterEntries(Array.isArray(data) ? data : []));
    }
  }

  async function generateDraft() {
    if (!selectedDeptId) return;
    const confirmed = confirm(
      'This will clear all existing roster entries for this department in the selected week and generate a new draft. Continue?'
    );
    if (!confirmed) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/roster/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: selectedDeptId,
          startDate: format(weekStart, "yyyy-MM-dd'T'00:00:00"),
          days: 7,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }
      const data = await res.json();
      setRosterEntries(data.entries ?? []);
    } catch (e: any) {
      setError('Generation failed: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  const doctors = users.filter((u) => u.role === 'HO' || u.role === 'PGT');
  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenCell(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Roster Builder"
        subtitle={selectedDept ? `${selectedDept.name} — ${selectedDept.hospitalName}` : 'Select a department'}
      />

      <div className="p-4 max-w-7xl mx-auto">
        {conflicts.length > 0 && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
            <p className="text-red-800 font-semibold text-sm">
              ⚠️ {conflicts.length} rest period violation{conflicts.length > 1 ? 's' : ''} detected
            </p>
            <ul className="text-xs text-red-600 mt-1 space-y-1">
              {conflicts.map((c, i) => (
                <li key={i}>
                  Dr. {c.doctorName}: Less than 12h between {c.entry1.shiftName} and{' '}
                  {c.entry2.shiftName}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#1e5cd4] focus:border-transparent"
          >
            <option value="">Select a department...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.hospitalName})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={prevWeek}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100"
            >
              ← Prev
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">
              Week of {format(weekStart, 'MMM dd, yyyy')}
            </span>
            <button
              onClick={nextWeek}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100"
            >
              Next →
            </button>
          </div>

          <button
            onClick={generateDraft}
            disabled={!selectedDeptId || generating}
            className="bg-[#fad23b] text-black font-bold px-4 py-2 rounded-lg hover:bg-[#ffe066] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {generating ? 'Generating...' : 'Generate Draft Roster'}
          </button>
        </div>

        {!selectedDeptId && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">Select a department to begin</p>
          </div>
        )}

        {selectedDeptId && loading && (
          <div className="text-center py-16 text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#1e5cd4] border-t-transparent"></div>
            <p className="mt-2">Loading roster...</p>
          </div>
        )}

        {selectedDeptId && !loading && shiftTemplates.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No shift templates defined for this department</p>
          </div>
        )}

        {selectedDeptId && !loading && doctors.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg">No doctors assigned to this department</p>
          </div>
        )}

        {selectedDeptId && !loading && shiftTemplates.length > 0 && (
          <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1e5cd4] text-white">
                  <th className="p-3 text-left text-sm font-semibold border-r border-blue-400 w-32">
                    Shift
                  </th>
                  {DAYS.map((day, i) => (
                    <th key={day} className="p-3 text-center text-sm font-semibold border-r border-blue-400 min-w-[140px]">
                      {day}
                      <br />
                      <span className="text-xs font-normal text-blue-200">
                        {format(getDateForDay(i), 'MMM dd')}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftTemplates.map((template) => (
                  <tr key={template.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-3 text-sm font-semibold text-gray-700 border-r border-gray-200 bg-gray-50">
                      {template.name}
                      <br />
                      <span className="text-xs text-gray-400 font-normal">
                        {template.durationHours}h
                      </span>
                    </td>
                    {DAYS.map((_, dayIndex) => {
                      const entry = findEntry(dayIndex, template.name);
                      const isConflict = entry && conflictEntryIds.has(entry.id);
                      const isOpen =
                        openCell?.dayIndex === dayIndex &&
                        openCell?.shiftName === template.name;

                      return (
                        <td
                          key={dayIndex}
                          className={`p-1 text-center border-r border-gray-200 relative ${isConflict ? 'bg-red-50' : ''}`}
                        >
                          <button
                            onClick={() =>
                              setOpenCell(isOpen ? null : { dayIndex, shiftName: template.name })
                            }
                            className={`w-full min-h-[48px] rounded-lg px-2 py-1 text-sm transition-colors ${
                              entry
                                ? isConflict
                                  ? 'bg-red-100 border-2 border-red-400 text-red-800 hover:bg-red-200'
                                  : 'bg-green-50 border border-green-200 text-green-800 hover:bg-green-100'
                                : 'bg-gray-50 border border-dashed border-gray-300 text-red-400 hover:bg-gray-100'
                            }`}
                          >
                            {entry ? (
                              <div className="flex items-center justify-center gap-1">
                                {isConflict && <span title="Rest period violation" className="text-xs">⚠️</span>}
                                <span className="font-medium">{entry.userName}</span>
                              </div>
                            ) : (
                              'Unassigned'
                            )}
                          </button>

                          {isOpen && (
                            <div
                              ref={popoverRef}
                              className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-2 w-56"
                            >
                              <p className="text-xs text-gray-500 mb-2 font-semibold">
                                Assign doctor for {template.name}
                              </p>
                              <button
                                onClick={() => assignDoctor(dayIndex, template.name, '')}
                                className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded"
                              >
                                Unassign
                              </button>
                              {doctors.map((doc) => (
                                <button
                                  key={doc.id}
                                  onClick={() => assignDoctor(dayIndex, template.name, doc.id)}
                                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 rounded ${
                                    entry?.userId === doc.id ? 'bg-blue-100 font-semibold' : ''
                                  }`}
                                >
                                  {doc.name}
                                  <span className="text-xs text-gray-400 ml-1">({doc.role})</span>
                                </button>
                              ))}
                              {doctors.length === 0 && (
                                <p className="text-xs text-gray-400 px-3 py-1">No doctors available</p>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
