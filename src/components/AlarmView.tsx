import React, { useState } from 'react';
import { AlarmLog } from '../types';
import {
  AlertTriangle,
  CheckCircle,
  Bell,
  Filter,
  Plus,
  CheckCheck,
  History,
  Activity,
  Search,
  FileText,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

interface AlarmViewProps {
  alarms: AlarmLog[];
  onAcknowledgeAlarm: (id: string) => void;
  onAcknowledgeAll: () => void;
  onSimulateAlarm?: () => void;
  onDeleteAlarm?: (id: string) => void;
  onNavigateToReport?: () => void;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const AlarmView: React.FC<AlarmViewProps> = ({
  alarms,
  onAcknowledgeAlarm,
  onAcknowledgeAll,
  onSimulateAlarm,
  onNavigateToReport,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'REALTIME' | 'PAST'>('REALTIME');
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [pastTimeRange, setPastTimeRange] = useState<number>(365);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const nowMs = Date.now();

  // Enforce 1-Year Retention Filter (backend also purges; this is a UI guard)
  const validRetainedAlarms = alarms.filter((a) => {
    if (!a.timestamp) return true;
    return nowMs - a.timestamp <= ONE_YEAR_MS;
  });

  const expiredCount = alarms.length - validRetainedAlarms.length;

  // REALTIME = still active. PAST = resolved (moved here by backend)
  const realtimeAlarms = validRetainedAlarms.filter((a) => a.category === 'REALTIME');
  const pastAlarms = validRetainedAlarms.filter((a) => a.category === 'PAST');

  const filteredRealtimeAlarms = realtimeAlarms.filter((a) => {
    if (filterSeverity === 'UNACKNOWLEDGED') return !a.acknowledged;
    if (filterSeverity === 'HIGH') return a.lowHigh === 'High' || a.lowHigh === 'Critical';
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        a.alarmName.toLowerCase().includes(q) ||
        a.device.toLowerCase().includes(q) ||
        a.parameter.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredPastAlarms = pastAlarms.filter((a) => {
    if (a.timestamp) {
      const daysOld = (nowMs - a.timestamp) / (1000 * 60 * 60 * 24);
      if (daysOld > pastTimeRange) return false;
    }
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        a.alarmName.toLowerCase().includes(q) ||
        a.device.toLowerCase().includes(q) ||
        a.parameter.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const unackCount = realtimeAlarms.filter((a) => !a.acknowledged).length;

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-gradient-to-r from-[#030408] via-[#10121d] to-[#1e1e28] p-4 md:p-8 text-white font-sans select-none">
      {/* Top Main Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-gray-200 font-sans flex items-center gap-3">
            <Bell className="w-7 h-7 text-red-500 animate-bounce" />
            <span>ALARM MANAGEMENT SYSTEM</span>
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Active realtime breaches clear automatically when readings return to range.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono">
          <button
            onClick={onAcknowledgeAll}
            disabled={unackCount === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-bold uppercase rounded border border-blue-400 cursor-pointer shadow transition-all"
          >
            <CheckCheck className="w-4 h-4" />
            <span>ACK ALL ({unackCount})</span>
          </button>

          {onSimulateAlarm && (
            <button
              onClick={onSimulateAlarm}
              id="simulate-alarm-btn"
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-red-700 to-rose-600 hover:from-red-600 hover:to-rose-500 text-white text-xs font-bold uppercase rounded border border-red-400 cursor-pointer shadow transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>TRIGGER TEST ALARM</span>
            </button>
          )}
        </div>
      </div>

      {/* Retention Policy Banner */}
      <div className="mb-6 bg-[#0f111a] border border-amber-900/80 p-4 rounded flex flex-wrap items-center justify-between gap-4 shadow-lg font-mono">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-950/80 border border-amber-600 rounded text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-amber-300 uppercase tracking-wider">
              <span>AUTOMATIC DATA RETENTION</span>
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-600 rounded text-[10px]">
                AUTO-PURGE ENGINE RUNNING
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Alarm records are stored securely.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="bg-[#181a26] px-3 py-1.5 rounded border border-gray-700 text-center">
            <span className="block text-[10px] text-gray-400 uppercase">REALTIME ACTIVE</span>
            <span className="text-sm font-black text-red-400">{realtimeAlarms.length}</span>
          </div>
          <div className="bg-[#181a26] px-3 py-1.5 rounded border border-gray-700 text-center">
            <span className="block text-[10px] text-gray-400 uppercase">PAST ALARMS (1YR)</span>
            <span className="text-sm font-black text-cyan-400">{pastAlarms.length}</span>
          </div>
          <div className="bg-[#181a26] px-3 py-1.5 rounded border border-gray-700 text-center">
            <span className="block text-[10px] text-gray-400 uppercase">AUTO-PURGED</span>
            <span className="text-sm font-black text-gray-500">{expiredCount}</span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Switcher */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 bg-[#12131c] p-2 rounded border border-gray-700 font-mono">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('REALTIME')}
            className={`flex items-center gap-2 px-4 py-2 rounded font-extrabold text-xs uppercase cursor-pointer transition-all ${
              activeSubTab === 'REALTIME'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg border border-red-400'
                : 'bg-[#1a1b28] text-gray-400 hover:text-white hover:bg-[#222435]'
            }`}
          >
            <Activity className="w-4 h-4 text-red-300" />
            <span>REALTIME ALARMS ({realtimeAlarms.length})</span>
            {unackCount > 0 && (
              <span className="px-1.5 py-0.2 bg-white text-red-900 rounded-full font-black text-[10px]">
                {unackCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('PAST')}
            className={`flex items-center gap-2 px-4 py-2 rounded font-extrabold text-xs uppercase cursor-pointer transition-all ${
              activeSubTab === 'PAST'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg border border-cyan-400'
                : 'bg-[#1a1b28] text-gray-400 hover:text-white hover:bg-[#222435]'
            }`}
          >
            <History className="w-4 h-4 text-cyan-300" />
            <span>PAST ALARMS ({pastAlarms.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 bg-[#090a10] px-3 py-1.5 rounded border border-gray-700 w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alarm, device, param..."
            className="bg-transparent text-xs text-white focus:outline-none w-full font-mono placeholder-gray-500"
          />
        </div>
      </div>

      {/* --- SUB-TAB 1: REALTIME ALARMS --- */}
      {activeSubTab === 'REALTIME' && (
        <div>
          <div className="mb-4 flex items-center gap-2 bg-[#0a0b12] p-2.5 rounded border border-gray-800 text-xs font-mono">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-gray-300 uppercase font-bold">Severity Filter:</span>
            <div className="flex gap-1">
              {['ALL', 'UNACKNOWLEDGED', 'HIGH'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterSeverity(f)}
                  className={`px-2.5 py-1 rounded font-bold uppercase cursor-pointer ${
                    filterSeverity === f
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-[#1d1e28] text-gray-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full overflow-x-auto border border-gray-700 bg-[#0d0e15] shadow-2xl rounded-sm">
            <table className="w-full text-left font-mono border-collapse">
              <thead>
                <tr className="bg-[#181a26] text-gray-300 border-b border-gray-700 uppercase text-xs tracking-wider">
                  <th className="p-3 w-1/4">Realtime Alarm</th>
                  <th className="p-3 w-1/6">Device</th>
                  <th className="p-3 w-1/5">Parameter</th>
                  <th className="p-3 w-1/6">Severity</th>
                  <th className="p-3 w-1/5">Trigger Time & Date</th>
                  <th className="p-3 w-24 text-center">Status / ACK</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-800 text-xs">
                {filteredRealtimeAlarms.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 italic">
                      No active realtime alarms. All readings are within range😉.
                    </td>
                  </tr>
                ) : (
                  filteredRealtimeAlarms.map((alm) => {
                    const isHigh = alm.lowHigh === 'High' || alm.lowHigh === 'Critical';

                    return (
                      <tr
                        key={alm.id}
                        className={`transition-colors ${
                          !alm.acknowledged
                            ? 'bg-red-950/40 text-red-200 hover:bg-red-900/50'
                            : 'bg-[#11121b] text-gray-300 hover:bg-[#191b28]'
                        }`}
                      >
                        <td className="p-3 font-bold flex items-center gap-2">
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 ${
                              !alm.acknowledged ? 'text-red-400 animate-pulse' : 'text-amber-500'
                            }`}
                          />
                          <div>
                            <span className="block text-white text-sm font-black">{alm.alarmName}</span>
                            <span className="text-[10px] text-gray-400 flex items-center gap-2">
                              <span>{alm.id}</span>
                              <span className="px-1.5 py-0.2 bg-red-950 text-red-300 border border-red-800 rounded text-[9px] uppercase">
                                REALTIME
                              </span>
                            </span>
                          </div>
                        </td>

                        <td className="p-3 font-extrabold text-blue-300">{alm.device}</td>

                        <td className="p-3">
                          <span className="block text-gray-200">{alm.parameter}</span>
                          <span className="text-xs text-amber-300 font-bold">{alm.value}</span>
                        </td>

                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block ${
                              alm.lowHigh === 'Critical'
                                ? 'bg-red-600 text-white'
                                : isHigh
                                ? 'bg-rose-900 text-rose-200 border border-rose-500'
                                : 'bg-amber-900 text-amber-200'
                            }`}
                          >
                            {alm.lowHigh}
                          </span>
                        </td>

                        <td className="p-3 text-gray-400">{alm.timeDate}</td>

                        <td className="p-3 text-center">
                          {!alm.acknowledged ? (
                            <button
                              onClick={() => onAcknowledgeAlarm(alm.id)}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold uppercase rounded border border-red-300 cursor-pointer shadow transition-all"
                            >
                              ACK
                            </button>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-emerald-400 text-[11px] font-bold">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>ACKED</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- SUB-TAB 2: PAST ALARMS --- */}
      {activeSubTab === 'PAST' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 bg-[#0a0b12] p-3 rounded border border-gray-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span className="text-gray-300 uppercase font-bold">Retention History Window:</span>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'LAST 24 HOURS', days: 1 },
                  { label: 'LAST 7 DAYS', days: 7 },
                  { label: 'LAST 30 DAYS', days: 30 },
                  { label: 'LAST 90 DAYS', days: 90 },
                  { label: 'FULL 1 YEAR', days: 365 },
                ].map((range) => (
                  <button
                    key={range.days}
                    onClick={() => setPastTimeRange(range.days)}
                    className={`px-2.5 py-1 rounded font-bold uppercase cursor-pointer ${
                      pastTimeRange === range.days
                        ? 'bg-cyan-600 text-white shadow'
                        : 'bg-[#1d1e28] text-gray-400 hover:text-white'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {onNavigateToReport && (
              <button
                onClick={onNavigateToReport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-500 rounded text-xs font-bold uppercase cursor-pointer transition-all"
              >
                <FileText className="w-4 h-4" />
                <span>EXPORT PAST ALARMS PDF</span>
              </button>
            )}
          </div>

          <div className="w-full overflow-x-auto border border-gray-700 bg-[#0d0e15] shadow-2xl rounded-sm">
            <table className="w-full text-left font-mono border-collapse">
              <thead>
                <tr className="bg-[#141724] text-gray-300 border-b border-gray-700 uppercase text-xs tracking-wider">
                  <th className="p-3 w-1/4">Past Alarm Title</th>
                  <th className="p-3 w-1/6">Device</th>
                  <th className="p-3 w-1/5">Parameter & Peak Value</th>
                  <th className="p-3 w-1/4">Trigger Time / Cleared</th>
                  <th className="p-3 w-20 text-center">Archive Log</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-800 text-xs">
                {filteredPastAlarms.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                      No resolved alarm history for the selected time window ({pastTimeRange} days).
                    </td>
                  </tr>
                ) : (
                  filteredPastAlarms.map((alm) => (
                    <tr key={alm.id} className="bg-[#11121b] text-gray-300 hover:bg-[#191b28] transition-colors">
                      <td className="p-3 font-bold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="block text-gray-100 text-sm font-black">{alm.alarmName}</span>
                          <span className="text-[10px] text-gray-400 flex items-center gap-2">
                            <span>{alm.id}</span>
                            <span className="px-1.5 py-0.2 bg-blue-950 text-cyan-300 border border-cyan-800 rounded text-[9px] uppercase">
                              RESOLVED
                            </span>
                          </span>
                        </div>
                      </td>

                      <td className="p-3 font-extrabold text-cyan-300">{alm.device}</td>

                      <td className="p-3">
                        <span className="block text-gray-300">{alm.parameter}</span>
                        <span className="text-xs text-amber-300 font-bold">{alm.value}</span>
                      </td>

                      <td className="p-3">
                        <div className="text-gray-300 font-bold">{alm.timeDate}</div>
                        {alm.clearedAt && (
                          <div className="text-[10px] text-emerald-400">
                            Resolved: {alm.clearedAt}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 bg-gray-800 text-gray-300 border border-gray-600 rounded text-[10px] font-bold uppercase inline-block">
                          STORED (1YR)
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};