'use client';

import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';
import NotificationBell from './NotificationBell';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <>
      {/* Cyan accent top bar */}
      <div className="h-1 bg-clinical-cyan" />

      {/* Header with navy slate and clinical branding */}
      <header className="bg-clinical-navy p-4 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="RosterDoc" className="h-8 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-white">{title}</h1>
              {subtitle && (
                <p className="text-xs text-cyan-300">{subtitle}</p>
              )}
              {user && (
                <p className="text-xs text-blue-200 mt-0.5">
                  {user.name} · {user.departmentName}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user && <NotificationBell />}
            {user ? (
              <button
                onClick={handleLogout}
                className="text-xs text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="text-xs text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
