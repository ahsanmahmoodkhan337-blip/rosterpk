'use client';

import { useState, useRef, useEffect } from 'react';
import { useNotifications, AppNotification } from './NotificationProvider';
import { formatDistanceToNow } from 'date-fns';

const typeIcons: Record<string, string> = {
  SWAP_REQUEST: '🔁',
  SWAP_ACCEPTED: '✅',
  SWAP_DECLINED: '❌',
  SWAP_APPROVED: '✅',
  SWAP_REJECTED: '❌',
  PRE_SHIFT: '⏰',
  ROSTER_UPDATE: '📋',
};

const typeColors: Record<string, string> = {
  SWAP_REQUEST: 'border-l-amber-400',
  SWAP_ACCEPTED: 'border-l-emerald-400',
  SWAP_DECLINED: 'border-l-red-400',
  SWAP_APPROVED: 'border-l-emerald-400',
  SWAP_REJECTED: 'border-l-red-400',
  PRE_SHIFT: 'border-l-cyan-400',
  ROSTER_UPDATE: 'border-l-blue-400',
};

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const recentNotifications = notifications.slice(0, 20);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V5a1 1 0 00-2 0v.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
          />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-clinical-coral text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-[70vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200">
            <h3 className="font-semibold text-sm text-clinical-dark">Notifications</h3>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-clinical-cyan hover:underline px-2 py-1"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1">
            {recentNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-400 text-lg">🔔</p>
                <p className="text-sm text-gray-400 mt-2">No notifications yet</p>
              </div>
            ) : (
              recentNotifications.map((notif) => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  onRead={markAsRead}
                  onClose={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onRead,
  onClose,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onClose: () => void;
}) {
  const color = typeColors[notification.type] || 'border-l-gray-300';
  const icon = typeIcons[notification.type] || '📌';
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });

  const handleClick = () => {
    onRead(notification.id);
    onClose();
  };

  return (
    <div
      className={`border-l-4 ${color} px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
        !notification.read ? 'bg-cyan-50/30' : ''
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{notification.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
          <p className="text-[10px] text-gray-400 mt-1">{timeAgo}</p>
        </div>
        {!notification.read && (
          <span className="w-2 h-2 rounded-full bg-clinical-cyan shrink-0 mt-1.5" />
        )}
      </div>
    </div>
  );
}
