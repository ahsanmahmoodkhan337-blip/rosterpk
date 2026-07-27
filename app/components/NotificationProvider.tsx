'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { format, addHours, differenceInMilliseconds } from 'date-fns';

export interface AppNotification {
  id: string;
  type: 'SWAP_REQUEST' | 'SWAP_ACCEPTED' | 'SWAP_DECLINED' | 'SWAP_APPROVED' | 'SWAP_REJECTED' | 'PRE_SHIFT' | 'ROSTER_UPDATE';
  title: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO string
  link?: string;
  metadata?: Record<string, any>;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notif: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearAll: () => {},
});

const STORAGE_KEY = 'rosterdoc_notifications';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userRef = useRef(user);

  // Keep user ref updated
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setNotifications(parsed);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // storage full — clear old read notifications
      const trimmed = notifications.filter(n => !n.read).slice(-50);
      setNotifications(trimmed);
    }
  }, [notifications]);

  const addNotification = useCallback((notif: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => {
    const newNotif: AppNotification = {
      ...notif,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      read: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications(prev => [newNotif, ...prev]);

    // Show browser notification if supported and permission granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(notif.title, { body: notif.message, icon: '/logo.png' });
      } catch {}
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Server-side notification polling: check every 30 seconds for swap updates, roster changes
  useEffect(() => {
    if (!user) return;

    let lastPoll = new Date().toISOString();

    const pollServerNotifications = async () => {
      try {
        const res = await fetch(`/api/notifications?userId=${user.id}&since=${encodeURIComponent(lastPoll)}`);
        lastPoll = new Date().toISOString();
        const items = await res.json();
        if (!Array.isArray(items)) return;

        for (const item of items) {
          // Check if we already have this notification
          const exists = notifications.some(n => n.id === item.id);
          if (!exists) {
            addNotification({
              type: item.type,
              title: item.title,
              message: item.message,
              link: item.link,
              metadata: item.metadata,
            });
          }
        }
      } catch {
        // Silently fail — not critical
      }
    };

    // Poll immediately and every 30 seconds
    pollServerNotifications();
    pollingRef.current = setInterval(pollServerNotifications, 30000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [user, addNotification, notifications]);

  // Pre-shift alert polling: check every 60 seconds for shifts starting in ~2 hours
  useEffect(() => {
    if (!user) return;

    const preShiftInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/my-shifts?userId=${user.id}`);
        const shifts = await res.json();
        if (!Array.isArray(shifts)) return;

        const now = new Date();
        for (const shift of shifts) {
          const startTime = new Date(shift.startTime);
          const diffMs = differenceInMilliseconds(startTime, now);
          const diffHours = diffMs / (1000 * 60 * 60);

          // Alert if shift starts between 1.8 and 2.2 hours from now (to avoid duplicates)
          if (diffHours > 1.8 && diffHours < 2.2) {
            const deptName = user.departmentName || 'your department';
            const existingKey = `PRE_SHIFT_${shift.id}_${format(startTime, 'yyyyMMddHH')}`;
            
            // Check if we already notified for this shift-hour combination
            const alreadyNotified = notifications.some(
              n => n.type === 'PRE_SHIFT' && n.metadata?.key === existingKey
            );
            if (!alreadyNotified) {
              addNotification({
                type: 'PRE_SHIFT',
                title: 'Upcoming Shift',
                message: `Your ${shift.shiftName} shift in ${deptName} starts in ~2 hours.`,
                link: '/',
                metadata: { key: existingKey, shiftId: shift.id },
              });
            }
          }
        }
      } catch {
        // Silently fail — not critical
      }
    }, 60000);

    // Run immediately
    preShiftInterval && (async () => {
      try {
        const res = await fetch(`/api/my-shifts?userId=${user.id}`);
        const shifts = await res.json();
        if (!Array.isArray(shifts)) return;
        const now = new Date();
        for (const shift of shifts) {
          const startTime = new Date(shift.startTime);
          const diffMs = differenceInMilliseconds(startTime, now);
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours > 1.8 && diffHours < 2.2) {
            const deptName = user.departmentName || 'your department';
            const existingKey = `PRE_SHIFT_${shift.id}_${format(startTime, 'yyyyMMddHH')}`;
            const alreadyNotified = notifications.some(
              n => n.type === 'PRE_SHIFT' && n.metadata?.key === existingKey
            );
            if (!alreadyNotified) {
              addNotification({
                type: 'PRE_SHIFT',
                title: 'Upcoming Shift',
                message: `Your ${shift.shiftName} shift in ${deptName} starts in ~2 hours.`,
                link: '/',
                metadata: { key: existingKey, shiftId: shift.id },
              });
            }
          }
        }
      } catch {}
    })();

    return () => clearInterval(preShiftInterval);
  }, [user, addNotification, notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
