import React, { useState } from 'react';
import { AuditLogEntry, UserRole } from '../types';
import { ClipboardList, Search, User, Filter, ShieldAlert } from 'lucide-react';

interface AuditLogViewProps {
  auditLogs: AuditLogEntry[];
  userRole?: UserRole;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ auditLogs, userRole = 'OPERATOR' }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const isAdmin = userRole === 'ADMIN';

  const actionCategories = ['ALL', 'Device', 'Relay', 'Valve', 'Rule', 'User', 'Alarm'];

  const filtered = auditLogs.filter((log) => {
    if (actionFilter !== 'ALL' && !log.action.toLowerCase().includes(actionFilter.toLowerCase()) && !log.target.toLowerCase().includes(actionFilter.toLowerCase())) {
      // fall back to a loose match against action text for the category buttons
      if (actionFilter === 'Relay' && !/relay|ahu power|dhu/i.test(log.action)) return false;
      if (actionFilter === 'Valve' && !/valve|auto-pid|manual override/i.test(log.action)) return false;
      if (actionFilter === 'Device' && !/device|hostname|renamed|room/i.test(log.action)) return false;
      if (actionFilter === 'Rule' && !/rule/i.test(log.action)) return false;
      if (actionFilter === 'User' && !/user|account|password|role/i.test(log.action)) return false;
      if (actionFilter === 'Alarm' && !/alarm/i.test(log.action)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.user.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.target.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (!isAdmin) {
    return (
      <div className="w-full min-h-[calc(100vh-60px)] bg-[#181a22] p-4 md:p-8 text-white font-sans flex flex-col items-center justify-center gap-3">
        <ShieldAlert className="w-10 h-10 text-amber-500" />
        <span className="text-sm font-black uppercase tracking-wider text-gray-300">Admin Permission Required</span>
        <span className="text-xs text-gray-500 font-mono">Audit logs are only visible to Admin accounts.</span>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#181a22] p-4 md:p-8 text-white font-sans select-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-gray-200 font-sans flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-blue-400" />
            <span>AUDIT LOG</span>
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Every action, who performed it, and when — devices, relays, valves, rules, users, alarms.
          </p>
        </div>
        <div className="bg-[#12131b] border border-gray-700 px-3 py-1.5 rounded text-xs font-mono">
          <span className="text-gray-400">Total Records: </span>
          <span className="text-blue-400 font-bold">{auditLogs.length}</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-[#0a0b12] p-2.5 rounded border border-gray-800 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-gray-300 uppercase font-bold">Category:</span>
          <div className="flex flex-wrap gap-1">
            {actionCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActionFilter(cat)}
                className={`px-2.5 py-1 rounded font-bold uppercase cursor-pointer ${
                  actionFilter === cat ? 'bg-blue-600 text-white shadow' : 'bg-[#1d1e28] text-gray-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#090a10] px-3 py-1.5 rounded border border-gray-700 w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search user, device, action..."
            className="bg-transparent text-xs text-white focus:outline-none w-full font-mono placeholder-gray-500"
          />
        </div>
      </div>

      <div className="w-full overflow-x-auto border border-gray-700 bg-[#0d0e15] shadow-2xl rounded-sm">
        <table className="w-full text-left font-mono border-collapse text-xs">
          <thead>
            <tr className="bg-[#181a26] text-gray-300 border-b border-gray-700 uppercase tracking-wider">
              <th className="p-3 w-1/6">User</th>
              <th className="p-3 w-1/6">Action</th>
              <th className="p-3 w-1/6">Target</th>
              <th className="p-3 w-1/3">Details</th>
              <th className="p-3 w-1/6">Time & Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                  No audit records match.
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.id} className="hover:bg-[#191b28] transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-white font-bold">{log.user}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase">{log.role}</span>
                  </td>
                  <td className="p-3 text-blue-300 font-bold">{log.action}</td>
                  <td className="p-3 text-gray-300">{log.target}</td>
                  <td className="p-3 text-gray-400">{log.details}</td>
                  <td className="p-3 text-gray-500">{log.dateTime}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-gray-500 font-mono">
        Showing {filtered.length} of {auditLogs.length} records. Retained up to the last 5,000 entries.
      </div>
    </div>
  );
};
