'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

const MAX_PIN_LENGTH = 6;

export default function LoginPage() {
  const router = useRouter();
  const { user: currentUser, login } = useAuth();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [deptName, setDeptName] = useState('');
  const [hospitalName, setHospitalName] = useState('');

  // Step 2 state
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');

  // Step 3 state
  const [pin, setPin] = useState('');
  const [pinLength, setPinLength] = useState(4); // min pin length to enable submit

  // Department info from join API
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedDeptName, setSelectedDeptName] = useState('');
  const [isNewDepartment, setIsNewDepartment] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingDept, setFetchingDept] = useState(false);

  const deptInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      redirectBasedOnRole(currentUser.role);
    }
  }, [currentUser]);

  useEffect(() => {
    setTimeout(() => deptInputRef.current?.focus(), 300);
  }, []);

  function redirectBasedOnRole(role: string) {
    if (role === 'ADMIN') {
      router.push('/admin');
    } else {
      router.push('/');
    }
  }

  // ── Step 1: Department ──────────────────────────────────
  async function handleDeptSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = deptName.trim();
    if (!name || name.length < 2) {
      setError('Please enter a valid department name');
      return;
    }
    setError('');
    setFetchingDept(true);

    try {
      const deptRes = await fetch('/api/departments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentName: name,
          hospitalName: hospitalName.trim() || undefined,
        }),
      });

      const deptData = await deptRes.json();
      if (!deptRes.ok) {
        setError(deptData.error || 'Failed to find department');
        setFetchingDept(false);
        return;
      }

      setSelectedDeptId(deptData.id);
      setSelectedDeptName(deptData.name);

      // Check if department is new (201 = created)
      const isNew = deptRes.status === 201;
      setIsNewDepartment(isNew);

      setStep(2);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setFetchingDept(false);
    }
  }

  // ── Step 2: Name & Designation ──────────────────────────
  function handleInfoSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = fullName.trim();
    if (!name || name.length < 2) {
      setError('Please enter your full name');
      return;
    }
    setError('');
    setStep(3);
    setTimeout(() => pinInputRef.current?.focus(), 150);
  }

  // ── Step 3: PIN ─────────────────────────────────────────
  function handlePinChange(value: string) {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > MAX_PIN_LENGTH) return;
    setPin(cleaned);

    // Auto-submit when pin reaches MAX_PIN_LENGTH
    if (cleaned.length === MAX_PIN_LENGTH) {
      // Give a small delay for UX
      setTimeout(() => {
        if (cleaned.length >= pinLength) {
          submitRegistration(cleaned);
        }
      }, 300);
    }
  }

  async function handlePinSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (pin.length < pinLength || loading) return;
    await submitRegistration(pin);
  }

  async function submitRegistration(pinCode: string) {
    if (pinCode.length < pinLength || loading) return;

    setLoading(true);
    setError('');

    try {
      // Create user via the new POST /api/users endpoint
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          phone: phone.trim() ? `+92${phone.trim().replace(/^\+92/, '')}` : '',
          role: designation.trim() || 'House Officer',
          departmentId: selectedDeptId,
          pinCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to register');
        setPin('');
        pinInputRef.current?.focus();
        setLoading(false);
        return;
      }

      // Login with the newly created user
      login({
        id: data.id,
        name: data.name,
        role: data.role,
        rank: data.rank ?? null,
        departmentId: data.departmentId,
        departmentName: data.departmentName,
      });

      redirectBasedOnRole(data.role);
    } catch {
      setError('Network error. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setError('');
    setPin('');
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  }

  return (
    <div className="min-h-screen bg-clinical-navy flex flex-col font-sans relative overflow-hidden">
      {/* Hospital-themed background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 left-10 w-40 h-40 border-4 border-white rounded-full" />
        <div className="absolute top-20 right-20 w-24 h-24 border-4 border-white rounded-full" />
        <div className="absolute bottom-20 left-1/4 w-32 h-32 border-4 border-white rounded-full" />
        <div className="absolute top-1/3 right-1/3 w-20 h-20 border-4 border-white rounded" />
        <div className="absolute bottom-1/4 right-10 w-28 h-28 border-4 border-white rounded" />
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
              <img src="/logo.png" alt="RosterDoc" className="h-12 w-auto" />
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
            <span>Your Info</span>
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
            {/* ── Step 1: Enter Department Name ── */}
            {step === 1 && (
              <form onSubmit={handleDeptSubmit}>
                <label className="block text-sm font-semibold text-clinical-dark mb-2">
                  Department Name
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Type your department name (e.g. &ldquo;Surgery&rdquo;, &ldquo;Paediatrics&rdquo;).
                  If it doesn&apos;t exist, a new one will be created.
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
                  placeholder="Hospital Name (optional)"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3.5 text-sm bg-white focus:ring-2 focus:ring-clinical-cyan focus:border-transparent mt-2"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={fetchingDept || deptName.trim().length < 2}
                  className="w-full mt-3 bg-clinical-cyan text-white font-bold py-3 rounded-xl hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {fetchingDept ? 'Looking up...' : 'Continue'}
                </button>
              </form>
            )}

            {/* ── Step 2: Name & Designation ── */}
            {step === 2 && (
              <form onSubmit={handleInfoSubmit}>
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={goBack} className="text-gray-400 hover:text-gray-600 p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-gray-500 font-medium">
                    {selectedDeptName}
                    {isNewDepartment && (
                      <span className="ml-1 text-xs text-clinical-emerald font-semibold">(new)</span>
                    )}
                  </span>
                </div>

                <label className="block text-sm font-semibold text-clinical-dark mb-3">
                  Your Information
                </label>

                {/* Full Name */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Ayesha Khan"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-clinical-cyan focus:border-transparent"
                    autoComplete="off"
                  />
                </div>

                {/* Designation */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Designation</label>
                  <select
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-clinical-cyan focus:border-transparent"
                  >
                    <option value="">Select designation...</option>
                    <option value="House Officer">House Officer</option>
                    <option value="PGT">PGT</option>
                    <option value="Registrar">Registrar</option>
                    <option value="Consultant">Consultant</option>
                    <option value="Medical Officer">Medical Officer</option>
                    <option value="Senior Registrar">Senior Registrar</option>
                  </select>
                </div>

                {/* Phone Number */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone Number</label>
                  <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-clinical-cyan focus-within:border-transparent">
                    <span className="bg-gray-100 text-gray-600 text-sm px-3 py-3 font-medium border-r border-gray-300">
                      +92
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="300 1234567"
                      className="flex-1 px-4 py-3 text-sm bg-white focus:outline-none"
                      autoComplete="off"
                      maxLength={10}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={fullName.trim().length < 2}
                  className="w-full bg-clinical-cyan text-white font-bold py-3 rounded-xl hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Continue
                </button>
              </form>
            )}

            {/* ── Step 3: PIN ── */}
            {step === 3 && (
              <form onSubmit={handlePinSubmit}>
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={goBack} className="text-gray-400 hover:text-gray-600 p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-gray-500">
                    Registering as{' '}
                    <span className="font-semibold text-clinical-dark">{fullName.trim()}</span>
                  </span>
                </div>

                {isNewDepartment ? (
                  <>
                    <label className="block text-sm font-semibold text-clinical-dark mb-2 text-center">
                      Set Your Workspace PIN
                    </label>
                    <p className="text-xs text-gray-400 mb-4 text-center">
                      You&apos;re the first person in <strong>{selectedDeptName}</strong>.
                      Set a 4-6 digit PIN that others will use to join.
                    </p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-semibold text-clinical-dark mb-2 text-center">
                      Enter Department PIN
                    </label>
                    <p className="text-xs text-gray-400 mb-4 text-center">
                      Enter the PIN set by the admin of <strong>{selectedDeptName}</strong>.
                    </p>
                  </>
                )}

                <div className="mb-4">
                  <input
                    ref={pinInputRef}
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => handlePinChange(e.target.value)}
                    placeholder="Enter 4-6 digit PIN"
                    maxLength={MAX_PIN_LENGTH}
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-3.5 text-center text-xl font-bold tracking-widest focus:border-clinical-cyan focus:ring-2 focus:ring-clinical-cyan focus:ring-opacity-30 outline-none transition-all text-clinical-dark"
                    disabled={loading}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400 text-center mt-2">
                    {pin.length}/{MAX_PIN_LENGTH} digits &bull; {pinLength}+ required
                  </p>
                </div>

                {loading && (
                  <div className="flex items-center justify-center gap-2 text-clinical-cyan text-sm mb-3">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-clinical-cyan border-t-transparent" />
                    {isNewDepartment ? 'Creating workspace...' : 'Joining department...'}
                  </div>
                )}

                {!loading && pin.length >= pinLength && (
                  <button
                    type="submit"
                    className="w-full bg-clinical-cyan text-white font-bold py-3.5 rounded-xl hover:bg-cyan-700 transition-colors shadow-lg shadow-cyan-500/25"
                  >
                    {isNewDepartment ? 'Create Workspace' : 'Join Department'}
                  </button>
                )}
              </form>
            )}
          </div>

          {/* Footer hint */}
          {step === 3 && !isNewDepartment && (
            <p className="text-xs text-white/40 text-center mt-4">
              Don&apos;t know the PIN? Ask your department admin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
