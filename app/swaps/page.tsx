'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import AuthGuard from '../components/AuthGuard';
import { useAuth } from '../components/AuthProvider';

interface SwapItem {
  id: string;
  requesterId?: string;
  recipientId?: string;
  rosterEntryId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  // Incoming fields (requester is the other party)
  requesterName?: string;
  requesterRole?: string;
  requesterRank?: string;
  // Outgoing fields (recipient is the other party)
  recipientName?: string;
  recipientRole?: string;
  recipientRank?: string;
  // Shared
  shiftDate: string;
  shiftName: string;
  shiftStartTime: string;
  shiftEndTime: string;
  reason?: string;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    PENDING_PEER: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending Peer' },
    PENDING_ADMIN: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending Admin' },
    APPROVED: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Approved' },
    REJECTED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
  };
  const c = config[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export default function SwapsPage() {
  return (
    <AuthGuard>
      <SwapsContent />
    </AuthGuard>
  );
}

function SwapsContent() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incoming, setIncoming] = useState<SwapItem[]>([]);
  const [outgoing, setOutgoing] = useState<SwapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSwaps();
  }, [user]);

  async function loadSwaps() {
    setLoading(true);
    setError(null);
    try {
      const [incRes, outRes] = await Promise.all([
        fetch(`/api/swaps/incoming?userId=${user!.id}`),
        fetch(`/api/swaps/outgoing?userId=${user!.id}`),
      ]);
      const incData = await incRes.json();
      const outData = await outRes.json();

      if (incData.error) setError(incData.error);
      else setIncoming(Array.isArray(incData) ? incData : []);

      if (outData.error && !incData.error) setError(outData.error);
      else setOutgoing(Array.isArray(outData) ? outData : []);
    } catch {
      setError('Failed to load swaps. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSwapAction(swapId: string, action: 'accept' | 'decline') {
    setActionLoading(swapId);
    setError(null);
    try {
      const res = await fetch(`/api/swaps/${swapId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to process swap');
      } else {
        // Refresh
        await loadSwaps();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  function formatShiftDate(dateStr: string) {
    try {
      return format(new Date(dateStr), 'EEE, MMM dd, yyyy');
    } catch {
      return dateStr;
    }
  }

  const deptName = user?.departmentName ?? 'No department';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-clinical-navy text-white">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Shift Swaps</h1>
              <p className="text-xs text-blue-200">{deptName}</p>
            </div>
            <Link
              href="/"
              className="text-sm text-blue-200 hover:text-white transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setTab('incoming')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'incoming'
                  ? 'border-clinical-cyan text-white'
                  : 'border-transparent text-blue-200 hover:text-white'
              }`}
            >
              Incoming
              {incoming.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs bg-clinical-cyan text-white rounded-full">
                  {incoming.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('outgoing')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'outgoing'
                  ? 'border-clinical-cyan text-white'
                  : 'border-transparent text-blue-200 hover:text-white'
              }`}
            >
              Outgoing
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4">
        {/* Error banner */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-clinical-cyan border-t-transparent" />
            <p className="mt-2 text-sm">Loading swaps...</p>
          </div>
        )}

        {/* Incoming tab */}
        {!loading && tab === 'incoming' && (
          <div className="space-y-3">
            {incoming.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-500 text-sm">No incoming swap requests</p>
                <p className="text-gray-400 text-xs mt-1">
                  When a colleague wants to swap shifts with you, it&apos;ll appear here.
                </p>
              </div>
            ) : (
              incoming.map((swap) => (
                <div
                  key={swap.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-800">
                          {swap.requesterName ?? 'Unknown'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {swap.requesterRole}
                          {swap.requesterRank ? ` / ${swap.requesterRank.replace(/_/g, ' ')}` : ''}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {swap.shiftName} — {formatShiftDate(swap.shiftDate)}
                      </p>
                      {swap.shiftStartTime && swap.shiftEndTime && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(swap.shiftStartTime), 'h:mm a')} —{' '}
                          {format(new Date(swap.shiftEndTime), 'h:mm a')}
                        </p>
                      )}
                      {swap.reason && (
                        <p className="text-xs text-gray-500 mt-1 italic">
                          &ldquo;{swap.reason}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => handleSwapAction(swap.id, 'accept')}
                      disabled={actionLoading === swap.id}
                      className="flex-1 bg-clinical-emerald text-white font-semibold py-2 px-4 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      {actionLoading === swap.id ? 'Processing...' : '✓ Accept'}
                    </button>
                    <button
                      onClick={() => handleSwapAction(swap.id, 'decline')}
                      disabled={actionLoading === swap.id}
                      className="flex-1 bg-clinical-coral text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      {actionLoading === swap.id ? 'Processing...' : '✗ Decline'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Outgoing tab */}
        {!loading && tab === 'outgoing' && (
          <div className="space-y-3">
            {outgoing.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">📤</div>
                <p className="text-gray-500 text-sm">No outgoing swap requests</p>
                <p className="text-gray-400 text-xs mt-1">
                  Swap requests you&apos;ve sent will appear here.
                </p>
              </div>
            ) : (
              outgoing.map((swap) => (
                <div
                  key={swap.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-gray-500">To:</span>
                        <span className="font-semibold text-gray-800">
                          {swap.recipientName ?? 'Unknown'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {swap.recipientRole}
                          {swap.recipientRank ? ` / ${swap.recipientRank.replace(/_/g, ' ')}` : ''}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {swap.shiftName} — {formatShiftDate(swap.shiftDate)}
                      </p>
                      {swap.shiftStartTime && swap.shiftEndTime && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(swap.shiftStartTime), 'h:mm a')} —{' '}
                          {format(new Date(swap.shiftEndTime), 'h:mm a')}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={swap.status} />
                  </div>
                  {swap.reason && (
                    <p className="text-xs text-gray-500 mt-1 italic">
                      &ldquo;{swap.reason}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Sent {format(new Date(swap.createdAt), 'MMM dd, h:mm a')}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
