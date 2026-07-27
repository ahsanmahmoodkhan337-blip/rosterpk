'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, parseISO, differenceInHours } from 'date-fns';
import Header from '../components/Header';
import AuthGuard from '../components/AuthGuard';

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
  rank?: string;
}

interface ShiftTemplate {
  id: string;
  name: string;
  durationHours: number;
  shiftType?: string;
  startTime?: string;
  endTime?: string;
  requiredSeniorsCount?: number;
  requiredJuniorsCount?: number;
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

/** Server-provided conflict from the generate API */
interface ServerConflict {
  type: 'OVERLAP' | 'CONSECUTIVE_30HR' | 'UNDERSTAFFED' | 'REST_VIOLATION' | 'HOUR_LIMIT_NEAR';
  message: string;
  severity: 'error' | 'warning';
  entryIds: string[];
}

/** Client-side computed conflict (fallback) */
interface ClientConflict {
  type: 'REST_VIOLATION' | 'OVERLAP_CLIENT';
  message: string;
  severity: 'error' | 'warning';
  entryIds: string[];
}

type DisplayConflict = ServerConflict | ClientConflict;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Helpers ──

/** Compute rest hours needed after a shift (inferred from shift name) */
function requiredRestForShift(shiftName: string): number {
  const n = shiftName.toUpperCase();
  if (n.includes('30') || n.includes('CALL_30') || n.includes('30HR')) return 24;
  if (n.includes('NIGHT')) return 12;
  return 8;
}

export default function AdminRosterBuilder() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [users, setUsers] = useState<User[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [openCell, setOpenCell] = useState<{ dayIndex: number; shiftName: string } | null>(null);
  const [conflicts, setConflicts] = useState<DisplayConflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inchargeName, setInchargeName] = useState('');
  const [fromDate, setFromDate] = useState<string>(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );
  const [toDate, setToDate] = useState<string>(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );
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

  // ── Client-side conflict detection (runs on any roster data, not just generated) ──
  useEffect(() => {
    runClientConflictDetection();
  }, [rosterEntries]);

  function runClientConflictDetection() {
    const found: ClientConflict[] = [];
    const byUser: Record<string, RosterEntry[]> = {};
    for (const entry of rosterEntries) {
      if (!byUser[entry.userId]) byUser[entry.userId] = [];
      byUser[entry.userId].push(entry);
    }
    for (const userId of Object.keys(byUser)) {
      const userEntries = byUser[userId].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
      for (let i = 0; i < userEntries.length; i++) {
        for (let j = i + 1; j < userEntries.length; j++) {
          const a = userEntries[i];
          const b = userEntries[j];
          const endA = new Date(a.endTime);
          const startB = new Date(b.startTime);

          // Overlap check
          if (endA.getTime() > startB.getTime()) {
            found.push({
              type: 'OVERLAP_CLIENT',
              message: `${a.userName}: Overlapping ${a.shiftName} and ${b.shiftName}`,
              severity: 'error',
              entryIds: [a.id, b.id],
            });
          }

          // Rest violation check (gap check)
          const gapHours = differenceInHours(startB, endA);
          const required = requiredRestForShift(a.shiftName);
          if (gapHours >= 0 && gapHours < required) {
            found.push({
              type: 'REST_VIOLATION',
              message: `${a.userName}: Only ${gapHours}h rest between ${a.shiftName} (ends ${fmtTimeStr(a.endTime)}) and ${b.shiftName} (starts ${fmtTimeStr(b.startTime)}). Required: ${required}h`,
              severity: 'error',
              entryIds: [a.id, b.id],
            });
          }
        }
      }
    }

    // Merge with server conflicts, prioritizing server ones for same entry
    const merged = mergeConflicts(conflicts.filter(isServerConflict) as ServerConflict[], found);
    setConflicts(merged);
  }

  function isServerConflict(c: DisplayConflict): c is ServerConflict {
    return !('OVERLAP_CLIENT' === (c as ClientConflict).type || (c as ClientConflict).type === 'OVERLAP_CLIENT');
  }

  function mergeConflicts(server: ServerConflict[], client: ClientConflict[]): DisplayConflict[] {
    // Keep all server conflicts. Add client conflicts whose entry pairs aren't already covered.
    const serverEntryPairs = new Set<string>();
    for (const c of server) {
      const ids = [...c.entryIds].sort();
      if (ids.length >= 2) serverEntryPairs.add(ids[0] + '::' + ids[1]);
    }

    const merged: DisplayConflict[] = [...server];
    for (const c of client) {
      const ids = [...c.entryIds].sort();
      const key = ids.length >= 2 ? ids[0] + '::' + ids[1] : c.entryIds[0] ?? '';
      if (!serverEntryPairs.has(key)) {
        merged.push(c);
        if (ids.length >= 2) serverEntryPairs.add(key);
      }
    }
    return merged;
  }

  // Build conflict entry ID sets by severity
  const errorEntryIds = new Set<string>();
  const warningEntryIds = new Set<string>();
  for (const c of conflicts) {
    const set = c.severity === 'error' ? errorEntryIds : warningEntryIds;
    for (const eid of c.entryIds) set.add(eid);
  }
  const allConflictEntryIds = new Set([...errorEntryIds, ...warningEntryIds]);

  const prevWeek = () => {
    setWeekStart((w) => {
      const d = subWeeks(w, 1);
      setFromDate(format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setToDate(format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      return d;
    });
  };
  const nextWeek = () => {
    setWeekStart((w) => {
      const d = addWeeks(w, 1);
      setFromDate(format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setToDate(format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      return d;
    });
  };

  function getDateForDay(dayIndex: number): Date {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  function findEntry(dayIndex: number, shiftName: string): RosterEntry | undefined {
    const dateStr = format(getDateForDay(dayIndex), 'yyyy-MM-dd');
    return rosterEntries.find((e) => e.date.startsWith(dateStr) && e.shiftName === shiftName);
  }

  async function assignDoctor(dayIndex: number, shiftName: string, userId: string | null) {
    setOpenCell(null);
    if (!userId) return;

    const date = getDateForDay(dayIndex);
    const template = shiftTemplates.find((t) => t.name === shiftName);
    if (!template) return;

    // Use template startTime/endTime if available, otherwise fall back to 8 AM + durationHours
    let startTime: Date;
    let endTime: Date;
    if (template.startTime && template.endTime) {
      const [sh, sm] = (template.startTime || '08:00').split(':').map(Number);
      const [eh, em] = (template.endTime || '14:00').replace('+1', '').split(':').map(Number);
      const nextDay = (template.endTime || '').endsWith('+1');
      startTime = new Date(date);
      startTime.setHours(sh, sm, 0, 0);
      endTime = new Date(date);
      if (nextDay) endTime.setDate(endTime.getDate() + 1);
      endTime.setHours(eh, em, 0, 0);
    } else {
      startTime = new Date(date);
      startTime.setHours(8, 0, 0, 0);
      endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + template.durationHours);
    }

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
      (e) => !(e.date.startsWith(format(getDateForDay(dayIndex), 'yyyy-MM-dd')) && e.shiftName === shiftName),
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

  async function exportPdf() {
    if (!selectedDeptId) return;
    setExportingPdf(true);
    setError(null);

    try {
      const res = await fetch('/api/roster/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: selectedDeptId,
          startDate: fromDate,
          endDate: toDate,
          inchargeName,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'PDF export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-${selectedDept?.name ?? 'roster'}-${fromDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError('PDF export failed: ' + e.message);
    } finally {
      setExportingPdf(false);
    }
  }

  async function generateDraft() {
    if (!selectedDeptId) return;
    const confirmed = confirm(
      'This will clear all existing roster entries for this department in the selected week and generate a new draft. Continue?',
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

      // Capture server-provided conflicts
      if (data.conflicts && Array.isArray(data.conflicts)) {
        setConflicts(data.conflicts as ServerConflict[]);
      }
    } catch (e: any) {
      setError('Generation failed: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  // Include ADMIN doctors too (they may have REGISTRAR rank)
  const doctors = users.filter((u) => u.role === 'HO' || u.role === 'PGT' || u.role === 'ADMIN');
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

  // Group conflicts by severity
  const errorConflicts = conflicts.filter((c) => c.severity === 'error');
  const warningConflicts = conflicts.filter((c) => c.severity === 'warning');

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header
          title="Roster Builder"
          subtitle={selectedDept ? `${selectedDept.name} — ${selectedDept.hospitalName}` : 'Select a department'}
        />

        <div className="p-4 max-w-7xl mx-auto">
          {/* ── Conflict Banner ── */}
          {conflicts.length > 0 && (
            <div className="border rounded-lg p-3 mb-4 bg-white shadow-sm">
              <p className="font-semibold text-sm mb-2">
                ⚠️ {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} detected
                {errorConflicts.length > 0 && (
                  <span className="text-red-600 ml-2">
                    ({errorConflicts.length} error{errorConflicts.length > 1 ? 's' : ''})
                  </span>
                )}
                {warningConflicts.length > 0 && (
                  <span className="text-amber-600 ml-2">
                    ({warningConflicts.length} warning{warningConflicts.length > 1 ? 's' : ''})
                  </span>
                )}
              </p>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {errorConflicts.map((c, i) => (
                  <li key={`err-${i}`} className="flex items-start gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" />
                    <span className="text-red-700">{c.message}</span>
                  </li>
                ))}
                {warningConflicts.map((c, i) => (
                  <li key={`warn-${i}`} className="flex items-start gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                    <span className="text-amber-700">{c.message}</span>
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

          <div className="flex flex-wrap items-center gap-3 mb-3">
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

            <button
              onClick={exportPdf}
              disabled={!selectedDeptId || exportingPdf}
              className="bg-[#fad23b] text-black font-bold px-4 py-2 rounded-lg hover:bg-[#ffe066] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {exportingPdf ? '⏳ Exporting...' : '📄 Export PDF'}
            </button>

            {selectedDeptId && (
              <>
                <a
                  href={`/api/calendar?departmentId=${selectedDeptId}`}
                  className="bg-[#0072B2] text-white font-bold px-4 py-2 rounded-lg hover:bg-[#005c8f] transition-colors text-sm inline-flex items-center gap-1"
                >
                  📅 Export All Schedules
                </a>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">From:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setWeekStart(startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 }));
                }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e5cd4] focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">To:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setWeekStart(startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 }));
                }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e5cd4] focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Assigned By:</label>
              <input
                type="text"
                value={inchargeName}
                onChange={(e) => setInchargeName(e.target.value)}
                placeholder="Enter your name"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-48 focus:ring-2 focus:ring-[#1e5cd4] focus:border-transparent"
              />
            </div>
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
                      <th
                        key={day}
                        className="p-3 text-center text-sm font-semibold border-r border-blue-400 min-w-[140px]"
                      >
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
                          {template.shiftType && (
                            <span className="ml-1 text-[10px] uppercase">{template.shiftType}</span>
                          )}
                        </span>
                      </td>
                      {DAYS.map((_, dayIndex) => {
                        const entry = findEntry(dayIndex, template.name);
                        const isError = entry && errorEntryIds.has(entry.id);
                        const isWarning = entry && !isError && warningEntryIds.has(entry.id);
                        const isOpen =
                          openCell?.dayIndex === dayIndex && openCell?.shiftName === template.name;

                        return (
                          <td
                            key={dayIndex}
                            className={`p-1 text-center border-r border-gray-200 relative ${
                              isError ? 'bg-red-50' : isWarning ? 'bg-amber-50' : ''
                            }`}
                          >
                            <button
                              onClick={() =>
                                setOpenCell(isOpen ? null : { dayIndex, shiftName: template.name })
                              }
                              className={`w-full min-h-[48px] rounded-lg px-2 py-1 text-sm transition-colors ${
                                entry
                                  ? isError
                                    ? 'bg-red-100 border-2 border-red-400 text-red-800 hover:bg-red-200'
                                    : isWarning
                                      ? 'bg-amber-100 border-2 border-amber-400 text-amber-800 hover:bg-amber-200'
                                      : 'bg-green-50 border border-green-200 text-green-800 hover:bg-green-100'
                                  : 'bg-gray-50 border border-dashed border-gray-300 text-red-400 hover:bg-gray-100'
                              }`}
                            >
                              {entry ? (
                                <div className="flex items-center justify-center gap-1">
                                  {isError && (
                                    <span title="Error" className="text-xs">
                                      🔴
                                    </span>
                                  )}
                                  {isWarning && (
                                    <span title="Warning" className="text-xs">
                                      🟡
                                    </span>
                                  )}
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
                                    <span className="text-xs text-gray-400 ml-1">
                                      ({doc.role}{doc.rank ? ` / ${doc.rank}` : ''})
                                    </span>
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
    </AuthGuard>
  );
}

function fmtTimeStr(iso: string): string {
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return iso.slice(11, 16);
  }
}
