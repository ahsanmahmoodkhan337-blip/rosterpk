'use client';

import { useEffect, useState } from 'react';

export default function PWAProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [swRegistered, setSwRegistered] = useState(false);

  useEffect(() => {
    // Track online/offline state
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);
          setSwRegistered(true);

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content available — could show a refresh prompt
                  console.log('New content available; refresh to update.');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error('SW registration failed:', err);
        });
    }
  }, []);

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-[#f59e0b] text-white text-center py-2 px-4 text-sm font-semibold shadow-lg transition-all duration-300">
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01"
              />
            </svg>
            You&apos;re offline — schedules from last sync
          </span>
        </div>
      )}

      {/* Push down content when banner is visible */}
      <div className={!isOnline ? 'pt-10' : ''}>{children}</div>
    </>
  );
}
