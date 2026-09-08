import React, { useState } from 'react';
import { AlarmLog, DeviceData } from '../types';
import { generateAlarmReportPDF } from '../utils/pdfGenerator';
import { FileText, Download, Calendar, Cpu, ShieldCheck, Eye, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

interface AlarmReportViewProps {
  alarms: AlarmLog[];
  devices: DeviceData[];
  generatedBy?: string;
}

const getTodayFormattedDate = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const getTodayISO = () => {
  const d = new Date();
  return d.toISOString().split('T')[0];
};

// Never allow picking a future date — clamps back to today if one somehow gets through.
const clampToToday = (isoDate: string) => (isoDate > getTodayISO() ? getTodayISO() : isoDate);

// Local-time start/end of the given ISO date (YYYY-MM-DD), as epoch ms.
const dayBoundsMs = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
    end: new Date(y, m - 1, d, 23, 59, 59, 999).getTime(),
  };
};

// Combine an ISO date with an "HH:MM" time into epoch ms, local time.
const dateTimeMs = (isoDate: string, hhmm: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
};

const PreviewTable: React.FC<{ list: AlarmLog[] }> = ({ list }) => (
  <div className="border border-blue-900/40 rounded bg-[#0a0e1a] max-h-56 overflow-y-auto">
    <table className="w-full text-left font-mono text-[11px] border-collapse">
      <thead className="sticky top-0 bg-[#0f1629]">
        <tr className="text-blue-300 border-b border-blue-900/50 uppercase tracking-wider text-[10px]">
          <th className="p-2">Alarm</th>
          <th className="p-2">Device</th>
          <th className="p-2">Value</th>
          <th className="p-2">Time & Date</th>
          <th className="p-2 text-center">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-blue-900/30">
        {list.length === 0 ? (
          <tr>
            <td colSpan={5} className="p-4 text-center text-blue-400/50 italic">
              No matching records for the current filters.
            </td>
          </tr>
        ) : (
          list.map((a) => (
            <tr key={a.id} className="hover:bg-blue-900/20 transition-colors">
              <td className="p-2 flex items-center gap-1.5">
                {a.acknowledged ? (
                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span className="text-gray-200 font-bold">{a.alarmName}</span>
              </td>
              <td className="p-2 text-blue-400 font-bold">{a.device}</td>
              <td className="p-2 text-amber-400">{a.value}</td>
              <td className="p-2 text-gray-400">{a.timeDate}</td>
              <td className="p-2 text-center">
                {a.acknowledged ? (
                  <span className="text-emerald-400 font-bold">ACKED</span>
                ) : (
                  <span className="text-red-400 font-bold">ACTIVE</span>
                )}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const AlarmReportView: React.FC<AlarmReportViewProps> = ({ alarms, devices, generatedBy = 'Unknown Operator' }) => {
  const [alarmCategory, setAlarmCategory] = useState<'REALTIME' | 'PAST' | 'ALL'>('ALL');
  const [singleDevice, setSingleDevice] = useState<string>('Device 1');
  const [singleDate, setSingleDate] = useState<string>(getTodayISO());
  const [singleTimeFrom, setSingleTimeFrom] = useState<string>('00:00');
  const [singleTimeTo, setSingleTimeTo] = useState<string>('23:59');
  
  // All Devices - Date Range (no time)
  const [allDateFrom, setAllDateFrom] = useState<string>(getTodayISO());
  const [allDateTo, setAllDateTo] = useState<string>(getTodayISO());

  // Format date for display
  const formatDateDisplay = (isoDate: string) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const applyCategory = (list: AlarmLog[]) => {
    if (alarmCategory === 'REALTIME') return list.filter((a) => a.category === 'REALTIME' || !a.acknowledged);
    if (alarmCategory === 'PAST') return list.filter((a) => a.category === 'PAST' || a.acknowledged);
    return list;
  };

  const singleFiltered = applyCategory(
    alarms.filter((a) => a.device.toLowerCase() === singleDevice.toLowerCase() || singleDevice === 'ALL')
  ).filter((a) => {
    if (!a.timestamp) return false;
    const from = dateTimeMs(singleDate, singleTimeFrom);
    const to = dateTimeMs(singleDate, singleTimeTo);
    return a.timestamp >= from && a.timestamp <= to;
  });

  const allFiltered = applyCategory(alarms).filter((a) => {
    if (!a.timestamp) return false;
    const from = dayBoundsMs(allDateFrom).start;
    const to = dayBoundsMs(allDateTo).end;
    return a.timestamp >= from && a.timestamp <= to;
  });

  const handleDownloadSingleReport = () => {
    generateAlarmReportPDF(
      singleFiltered,
      singleDevice,
      formatDateDisplay(singleDate),
      singleTimeFrom,
      singleTimeTo,
      false,
      alarmCategory,
      generatedBy
    );
  };

  const handleDownloadAllReport = () => {
    generateAlarmReportPDF(
      allFiltered,
      'ALL',
      `${formatDateDisplay(allDateFrom)} - ${formatDateDisplay(allDateTo)}`,
      '00:00',
      '23:59',
      true,
      alarmCategory,
      generatedBy
    );
  };

  // Automatic Reports: one-click Daily / Weekly / Monthly — computes the
  // date range directly and generates immediately, no manual date picking.
  const handleQuickReport = (period: 'DAY' | 'WEEK' | 'MONTH') => {
    const today = new Date();
    const toIso = getTodayISO();
    let fromIso = toIso;

    if (period === 'WEEK') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      fromIso = d.toISOString().split('T')[0];
    } else if (period === 'MONTH') {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      fromIso = d.toISOString().split('T')[0];
    }

    const from = dayBoundsMs(fromIso).start;
    const to = dayBoundsMs(toIso).end;
    const filtered = applyCategory(alarms).filter((a) => a.timestamp && a.timestamp >= from && a.timestamp <= to);

    setAllDateFrom(fromIso);
    setAllDateTo(toIso);

    const periodLabel = period === 'DAY' ? 'Daily' : period === 'WEEK' ? 'Weekly' : 'Monthly';
    generateAlarmReportPDF(
      filtered,
      'ALL',
      `${formatDateDisplay(fromIso)} - ${formatDateDisplay(toIso)} (${periodLabel})`,
      '00:00',
      '23:59',
      true,
      alarmCategory,
      generatedBy
    );
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#060b1a] p-4 md:p-8 text-gray-200 font-sans select-none">
      {/* Page Title Header */}
      <div className="mb-6 border-b border-blue-900/40 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-gray-200 font-sans flex items-center gap-3">
            <FileText className="w-7 h-7 text-blue-400" />
            <span>ALARM REPORT GENERATOR</span>
          </h1>
          <p className="text-xs text-blue-400/60 font-mono mt-1">
            Official PDF telemetry alarm reports.
          </p>
        </div>

        {/* 1-Year Retention Policy Badge */}
        <div className="bg-[#0a0e1a] border border-amber-700/50 px-3 py-2 rounded flex items-center gap-2 text-xs font-mono">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span className="text-amber-400 font-bold">1-Year Storage Retention Policy Enforced</span>
        </div>
      </div>

      {/* Automatic Reports: one-click Daily / Weekly / Monthly */}
      <div className="mb-6 max-w-5xl bg-[#0a0e1a] border border-emerald-700/40 p-3 rounded flex flex-wrap items-center justify-between gap-3 font-mono">
        <span className="flex items-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
          <Zap className="w-4 h-4" />
          Automatic Reports:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleQuickReport('DAY')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 border border-emerald-600/60 rounded text-xs font-bold uppercase cursor-pointer transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Daily Report</span>
          </button>
          <button
            onClick={() => handleQuickReport('WEEK')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 border border-emerald-600/60 rounded text-xs font-bold uppercase cursor-pointer transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Weekly Report</span>
          </button>
          <button
            onClick={() => handleQuickReport('MONTH')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 border border-emerald-600/60 rounded text-xs font-bold uppercase cursor-pointer transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Monthly Report</span>
          </button>
        </div>
      </div>

      {/* Global Category Switcher */}
      <div className="mb-8 max-w-5xl bg-[#0a0e1a] border border-blue-700/40 p-3 rounded flex items-center justify-between gap-4 font-mono">
        <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">
          Report Category Scope:
        </span>
        <div className="flex gap-2">
          {[
            { id: 'ALL', label: 'ALL ALARMS (FULL 1YR)' },
            { id: 'REALTIME', label: 'REALTIME ACTIVE ALARMS' },
            { id: 'PAST', label: 'PAST HISTORICAL ALARMS' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setAlarmCategory(cat.id as any)}
              className={`px-3 py-1.5 rounded text-xs font-extrabold uppercase cursor-pointer transition-all ${
                alarmCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                  : 'bg-[#0f1629] text-blue-400/60 hover:text-blue-300 hover:bg-[#141d35]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl">
        {/* Left Column: Single Device Alarm Report */}
        <div className="bg-[#0a0e1a] border border-blue-900/40 p-6 rounded shadow-2xl shadow-blue-900/10">
          <h2 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-6 flex items-center gap-2 border-b border-blue-900/40 pb-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span>SINGLE DEVICE ALARM REPORT</span>
          </h2>

          <div className="space-y-6">
            {/* Device No. */}
            <div>
              <label className="block text-xs font-black tracking-widest text-blue-300 uppercase mb-2">
                Device
              </label>
              <select
                value={singleDevice}
                onChange={(e) => setSingleDevice(e.target.value)}
                className="w-full bg-[#0f1629] border border-blue-700/40 text-gray-200 font-extrabold text-sm px-3 py-2.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono uppercase"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} ({d.roomName})
                  </option>
                ))}
              </select>
            </div>

            {/* DATE - with Calendar */}
            <div>
              <label className="block text-xs font-black tracking-widest text-blue-300 uppercase mb-2">
                DATE
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={singleDate}
                  max={getTodayISO()}
                  onChange={(e) => setSingleDate(clampToToday(e.target.value))}
                  className="w-full bg-[#0f1629] border border-blue-700/40 text-gray-200 font-extrabold text-sm px-3 py-2.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono tracking-wider [color-scheme:dark]"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/60 pointer-events-none" />
              </div>
              <span className="text-[10px] text-blue-400/40 mt-1 block">
                Selected: {formatDateDisplay(singleDate)}
              </span>
            </div>

            {/* TIME with time pickers */}
            <div>
              <label className="block text-xs font-black tracking-widest text-blue-300 uppercase mb-2">
                TIME
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] text-blue-400/60 font-mono uppercase mb-1">FROM</span>
                  <input
                    type="time"
                    value={singleTimeFrom}
                    onChange={(e) => setSingleTimeFrom(e.target.value)}
                    className="w-full bg-[#0f1629] border border-blue-700/40 text-gray-200 font-extrabold text-sm px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-center [color-scheme:dark]"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-blue-400/60 font-mono uppercase mb-1">TO</span>
                  <input
                    type="time"
                    value={singleTimeTo}
                    onChange={(e) => setSingleTimeTo(e.target.value)}
                    className="w-full bg-[#0f1629] border border-blue-700/40 text-gray-200 font-extrabold text-sm px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-center [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>

            {/* PREVIEW */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-black tracking-widest text-blue-300 uppercase mb-2">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                Preview ({singleFiltered.length})
              </label>
              <PreviewTable list={singleFiltered} />
            </div>

            {/* DOWNLOAD BUTTON */}
            <div className="pt-4">
              <button
                onClick={handleDownloadSingleReport}
                id="download-single-alarm-pdf-btn"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black tracking-widest uppercase rounded shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>DOWNLOAD REPORT (PDF)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: All Devices Alarm Report - Date Range */}
        <div className="bg-[#0a0e1a] border border-blue-900/40 p-6 rounded shadow-2xl shadow-blue-900/10">
          <h2 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-6 flex items-center gap-2 border-b border-blue-900/40 pb-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>ALL DEVICES ALARM REPORT</span>
          </h2>

          <div className="space-y-6">
            {/* DATE RANGE with Calendars */}
            <div>
              <label className="block text-xs font-black tracking-widest text-blue-300 uppercase mb-2">
                DATE RANGE
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] text-blue-400/60 font-mono uppercase mb-1">FROM</span>
                  <div className="relative">
                    <input
                      type="date"
                      value={allDateFrom}
                      max={getTodayISO()}
                      onChange={(e) => setAllDateFrom(clampToToday(e.target.value))}
                      className="w-full bg-[#0f1629] border border-blue-700/40 text-gray-200 font-extrabold text-sm px-3 py-2.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono tracking-wider [color-scheme:dark]"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/60 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] text-blue-400/60 font-mono uppercase mb-1">TO</span>
                  <div className="relative">
                    <input
                      type="date"
                      value={allDateTo}
                      max={getTodayISO()}
                      onChange={(e) => setAllDateTo(clampToToday(e.target.value))}
                      className="w-full bg-[#0f1629] border border-blue-700/40 text-gray-200 font-extrabold text-sm px-3 py-2.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono tracking-wider [color-scheme:dark]"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/60 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-blue-400/40">
                  From: {formatDateDisplay(allDateFrom)}
                </span>
                <span className="text-[10px] text-blue-400/40">
                  To: {formatDateDisplay(allDateTo)}
                </span>
              </div>
            </div>

            {/* PREVIEW */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-black tracking-widest text-blue-300 uppercase mb-2">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                Preview ({allFiltered.length})
              </label>
              <PreviewTable list={allFiltered} />
            </div>

            {/* DOWNLOAD BUTTON */}
            <div className="pt-4">
              <button
                onClick={handleDownloadAllReport}
                id="download-all-alarm-pdf-btn"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black tracking-widest uppercase rounded shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>DOWNLOAD REPORT (PDF)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};