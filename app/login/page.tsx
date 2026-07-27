'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

interface User {
  id: string;
  name: string;
  role: string;
  rank?: string;
}

const PIN_LENGTH = 4;

export default function LoginPage() {
  const router = useRouter();
  const { user: currentUser, login } = useAuth();

  const [step, setStep] = useState(1);
  const [users, setUsers] = useState<User[]>([]);

  const [deptName, setDeptName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedDeptName, setSelectedDeptName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [pin, setPin] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(false);

  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const deptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      redirectBasedOnRole(currentUser.role);
    }
  }, [currentUser]);

  useEffect(() => {
    // Focus department input on mount
    setTimeout(() => deptInputRef.current?.focus(), 300);
  }, []);

  function redirectBasedOnRole(role: string) {
    if (role === 'ADMIN') {
      router.push('/admin');
    } else {
      router.push('/');
    }
  }

  async function handleDeptSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = deptName.trim();
    if (!name || name.length < 2) {
      setError('Please enter a valid department name');
      return;
    }
    setError('');

    // Look up department by name via the join API
    setFetchingUsers(true);
    try {
      const deptRes = await fetch('/api/departments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentName: name, hospitalName: hospitalName.trim() || undefined }),
      });

      const deptData = await deptRes.json();
      if (!deptRes.ok) {
        setError(deptData.error || 'Failed to find department');
        setFetchingUsers(false);
        return;
      }

      setSelectedDeptId(deptData.id);
      setSelectedDeptName(deptData.name);

      // Now fetch users for this department
      const usersRes = await fetch(`/api/users?departmentId=${deptData.id}`);
      const usersData = await usersRes.json();
      if (usersData.error) {
        setError(usersData.error);
        setUsers([]);
      } else {
        setUsers(Array.isArray(usersData) ? usersData : []);
        setStep(2);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setFetchingUsers(false);
    }
  }

  function handleUserSelect(userId: string) {
    setSelectedUserId(userId);
    setError('');
    if (userId) {
      setStep(3);
      setTimeout(() => pinInputRefs.current[0]?.focus(), 150);
    }
  }

  function handlePinChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    if (value.length > 1) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < PIN_LENGTH - 1) {
      pinInputRefs.current[index + 1]?.focus();
    }

    if (value && index === PIN_LENGTH - 1) {
      const fullPin = [...newPin];
      fullPin[PIN_LENGTH - 1] = value;
      submitPin(fullPin.join(''));
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const newPin = [...pin];
      newPin[index - 1] = '';
      setPin(newPin);
      pinInputRefs.current[index - 1]?.focus();
    }
  }

  async function submitPin(pinCode: string) {
    if (pinCode.length !== PIN_LENGTH || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, pinCode }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Invalid PIN');
        setPin(Array(PIN_LENGTH).fill(''));
        pinInputRefs.current[0]?.focus();
        return;
      }

      login(data.user);
      redirectBasedOnRole(data.user.role);
    } catch {
      setError('Network error. Please try again.');
      setPin(Array(PIN_LENGTH).fill(''));
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setError('');
    setPin(Array(PIN_LENGTH).fill(''));
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const pinString = pin.join('');

  return (
    <div className="min-h-screen bg-clinical-navy flex flex-col font-sans relative overflow-hidden">
      {/* Hospital-themed background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 left-10 w-40 h-40 border-4 border-white rounded-full" />
        <div className="absolute top-20 right-20 w-24 h-24 border-4 border-white rounded-full" />
        <div className="absolute bottom-20 left-1/4 w-32 h-32 border-4 border-white rounded-full" />
        <div className="absolute top-1/3 right-1/3 w-20 h-20 border-4 border-white rounded" />
        <div className="absolute bottom-1/4 right-10 w-28 h-28 border-4 border-white rounded" />
        {/* Cross pattern */}
        <div className="absolute top-40 left-1/2 w-6 h-20 bg-white rounded-full opacity-30" />
        <div className="absolute top-[11.5rem] left-[calc(50%-2.5rem)] w-20 h-6 bg-white rounded-full opacity-30" />
      </div>

      {/* Cyan accent top bar */}
      <div className="h-1 bg-clinical-cyan relative z-10" />

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {/* Logo and branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl mb-4">
              <img
                src="/logo.png"
                alt="RosterDoc"
                className="h-12 w-auto"
              />
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">RosterDoc</h1>
            <p className="text-sm text-cyan-200 mt-1">Smart Hospital Scheduling</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    s < step
                      ? 'bg-clinical-emerald text-white'
                      : s === step
                      ? 'bg-clinical-cyan text-white ring-2 ring-clinical-cyan ring-offset-2 ring-offset-clinical-navy'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  {s < step ? '✓' : s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-8 h-0.5 transition-colors duration-300 ${
                      s < step ? 'bg-clinical-emerald' : 'bg-white/10'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-white/50 mb-6 px-4">
            <span>Department</span>
            <span>Name</span>
            <span>PIN</span>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/20 border border-red-400/50 text-red-200 rounded-xl p-3 mb-4 text-sm backdrop-blur-sm">
              {error}
            </div>
          )}

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-6 border border-white/10">
            {/* Step 1: Enter Department Name (free-text) */}
            {step === 1 && (
              <form onSubmit={handleDeptSubmit}>
                <label className="block text-sm font-semibold text-clinical-dark mb-2">
                  Enter Your Department
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Type your department name (e.g. &ldquo;Surgery&rdquo;, &ldquo;Paediatrics&rdquo;). If it doesn&apos;t exist, a new one will be created.
                </p>
                <input
                  ref={deptInputRef}
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Surgery, Medicine, Paediatrics..."
                  className="w-full border border-gray-300 rounded-xl px-4 py-3.5 text-sm bg-white focus:ring-2 focus:ring-clinical-cyan focus:border-transparent"
                  autoComplete="off"
                />
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="Hospital name (optional)"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3.5 text-sm bg-white focus:ring-2 focus:ring-clinical-cyan focus:border-transparent mt-2"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={fetchingUsers || deptName.trim().length < 2}
                  className="w-full mt-3 bg-clinical-cyan text-white font-bold py-3 rounded-xl hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {fetchingUsers ? 'Looking up...' : 'Continue'}
                </button>
              </form>
            )}

            {/* Step 2: Select Name */}
            {step === 2 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={goBack} className="text-gray-400 hover:text-gray-600 p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-gray-500 font-medium">
                    {selectedDeptName}
                  </span>
                </div>
                <label className="block text-sm font-semibold text-clinical-dark mb-2">
                  Who are you?
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleUserSelect(u.id)}
                      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                        selectedUserId === u.id
                          ? 'border-clinical-cyan bg-cyan-50 text-clinical-cyan ring-1 ring-clinical-cyan'
                          : 'border-gray-200 hover:border-clinical-cyan hover:bg-cyan-50/50'
                      }`}
                    >
                      <span className="font-medium text-gray-800">{u.name}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {u.role}
                        {u.rank ? ` — ${u.rank.replace(/_/g, ' ')}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
                {users.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-400">No staff found in this department.</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Ask an admin to add staff, or{' '}
                      <button onClick={goBack} className="text-clinical-cyan underline">
                        try a different department
                      </button>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Enter PIN */}
            {step === 3 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={goBack} className="text-gray-400 hover:text-gray-600 p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-gray-500">
                    Logging in as{' '}
                    <span className="font-semibold text-clinical-dark">{selectedUser?.name}</span>
                  </span>
                </div>
                <label className="block text-sm font-semibold text-clinical-dark mb-5 text-center">
                  Enter Your 4-Digit PIN
                </label>
                <div className="flex justify-center gap-3 mb-4">
                  {pin.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { pinInputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                      className="w-14 h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-clinical-cyan focus:ring-2 focus:ring-clinical-cyan focus:ring-opacity-30 outline-none transition-all text-clinical-dark"
                      disabled={loading}
                      autoComplete="off"
                    />
                  ))}
                </div>
                {loading && (
                  <div className="flex items-center justify-center gap-2 text-clinical-cyan text-sm">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-clinical-cyan border-t-transparent" />
                    Verifying...
                  </div>
                )}
                {!loading && pinString.length === PIN_LENGTH && (
                  <button
                    onClick={() => submitPin(pinString)}
                    className="w-full bg-clinical-cyan text-white font-bold py-3.5 rounded-xl hover:bg-cyan-700 transition-colors shadow-lg shadow-cyan-500/25"
                  >
                    Login
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Setup mode hint */}
          {step === 3 && (
            <p className="text-xs text-white/40 text-center mt-4">
              First time? Just enter any 4-digit PIN — it&apos;ll be saved as your login PIN.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
