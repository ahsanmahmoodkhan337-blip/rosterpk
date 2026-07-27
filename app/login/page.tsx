'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

interface Department {
  id: string;
  name: string;
  hospitalName: string;
}

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

  // Steps: 1 = select department, 2 = select name, 3 = enter PIN
  const [step, setStep] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [pin, setPin] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(false);

  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      redirectBasedOnRole(currentUser.role);
    }
  }, [currentUser]);

  // Fetch departments on mount
  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError('Failed to load departments');
        } else {
          setDepartments(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => setError('Failed to load departments'));
  }, []);

  function redirectBasedOnRole(role: string) {
    if (role === 'ADMIN') {
      router.push('/admin');
    } else {
      router.push('/');
    }
  }

  function handleDeptSelect(deptId: string) {
    setSelectedDeptId(deptId);
    setError('');

    if (!deptId) return;

    setFetchingUsers(true);
    fetch(`/api/users?departmentId=${deptId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setUsers([]);
        } else {
          setUsers(Array.isArray(data) ? data : []);
          setStep(2);
        }
      })
      .catch(() => setError('Failed to load staff list'))
      .finally(() => setFetchingUsers(false));
  }

  function handleUserSelect(userId: string) {
    setSelectedUserId(userId);
    setError('');
    if (userId) {
      setStep(3);
      // Focus first PIN input after a short delay
      setTimeout(() => pinInputRefs.current[0]?.focus(), 150);
    }
  }

  function handlePinChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return; // digits only
    if (value.length > 1) return; // single character

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Auto-advance to next input
    if (value && index < PIN_LENGTH - 1) {
      pinInputRefs.current[index + 1]?.focus();
    }

    // If this is the last digit and it's filled, auto-submit
    if (value && index === PIN_LENGTH - 1) {
      const fullPin = [...newPin];
      fullPin[PIN_LENGTH - 1] = value;
      submitPin(fullPin.join(''));
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      // Move back and clear previous
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

      // Login successful — store in context
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

  const selectedDept = departments.find((d) => d.id === selectedDeptId);
  const selectedUser = users.find((u) => u.id === selectedUserId);
  const pinString = pin.join('');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Gold accent top bar */}
      <div className="h-1 bg-[#fad23b]" />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo and branding */}
          <div className="text-center mb-8">
            <img
              src="/logo.png"
              alt="RosterDoc"
              className="h-16 w-auto mx-auto mb-3"
            />
            <h1 className="text-2xl font-bold text-[#1e5cd4]">RosterDoc</h1>
            <p className="text-sm text-gray-500 mt-1">Smart Hospital Scheduling</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    s < step
                      ? 'bg-green-500 text-white'
                      : s === step
                      ? 'bg-[#1e5cd4] text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {s < step ? '✓' : s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-8 h-0.5 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-6 px-4">
            <span>Department</span>
            <span>Name</span>
            <span>PIN</span>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          {/* Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            {/* Step 1: Select Department */}
            {step === 1 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Select Your Department
                </label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => handleDeptSelect(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-[#1e5cd4] focus:border-transparent appearance-none"
                  disabled={departments.length === 0}
                >
                  <option value="">Choose your department...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.hospitalName} — {d.name}
                    </option>
                  ))}
                </select>
                {departments.length === 0 && !error && (
                  <p className="text-sm text-gray-400 mt-2">Loading departments...</p>
                )}
                {fetchingUsers && (
                  <div className="flex items-center gap-2 mt-3 text-[#1e5cd4] text-sm">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-[#1e5cd4] border-t-transparent" />
                    Loading staff list...
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Select Name */}
            {step === 2 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
                    ←
                  </button>
                  <span className="text-sm text-gray-500">
                    {selectedDept?.hospitalName} — {selectedDept?.name}
                  </span>
                </div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Who are you?
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleUserSelect(u.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        selectedUserId === u.id
                          ? 'border-[#1e5cd4] bg-blue-50 text-[#1e5cd4]'
                          : 'border-gray-200 hover:border-[#1e5cd4] hover:bg-blue-50'
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
                  <p className="text-sm text-gray-400">No staff found in this department.</p>
                )}
              </div>
            )}

            {/* Step 3: Enter PIN */}
            {step === 3 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
                    ←
                  </button>
                  <span className="text-sm text-gray-500">
                    Logging in as{' '}
                    <span className="font-semibold text-gray-700">{selectedUser?.name}</span>
                  </span>
                </div>
                <label className="block text-sm font-semibold text-gray-700 mb-4 text-center">
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
                      className="w-14 h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-[#1e5cd4] focus:ring-2 focus:ring-[#1e5cd4] focus:ring-opacity-30 outline-none transition-colors"
                      disabled={loading}
                      autoComplete="off"
                    />
                  ))}
                </div>
                {loading && (
                  <div className="flex items-center justify-center gap-2 text-[#1e5cd4] text-sm">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-[#1e5cd4] border-t-transparent" />
                    Verifying...
                  </div>
                )}
                {!loading && pinString.length === PIN_LENGTH && (
                  <button
                    onClick={() => submitPin(pinString)}
                    className="w-full bg-[#1e5cd4] text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Login
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Setup mode hint */}
          {step === 3 && (
            <p className="text-xs text-gray-400 text-center mt-4">
              First time? Just enter any 4-digit PIN — it'll be saved as your login PIN.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
