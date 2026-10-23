import React, { useState } from 'react';
import { AlarmLog, DeviceData } from '../types';
import { generateAlarmReportPDF } from '../utils/pdfGenerator';
import { FileText, Download, Calendar, Cpu, ShieldCheck, Eye, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

interface AlarmReportViewProps {
  alarms: AlarmLog[];
  devices: DeviceData[];
  generatedBy?: string;
}

const getTodayISO = () => new Date().toISOString().split('T')[0];

const clampToToday = (isoDate: string) => (isoDate > getTodayISO() ? getTodayISO() : isoDate);

const dayBoundsMs = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
    end: new Date(y, m - 1, d, 23, 59, 59, 999).getTime(),
  };
};

const dateTimeMs = (isoDate: string, hhmm: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
};

const formatDateDisplay = (isoDate: string) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const PreviewTable: React.FC<{ list: AlarmLog[]; emptyMsg: string }> = ({ list, emptyMsg }) => (
  <div className="border border-gray-700 rounded bg-[#0d0e15] max-h-64 overflow-y-auto">
    <table className="w-full text-left font-mono text-[11px] border-collapse">
      <thead className="sticky top-0 bg-[#181a26]">
        <tr className="text-gray-300 border-b border-gray-700 uppercase tracking-wider text-[10px]">
          <th className="p-2.5">Alarm</th>
          <th className="p-2.5">Device</th>
          <th className="p-2.5">Value</th>
          <th className="p-2.5">Time & Date</th>
          <th className="p-2.5 text-center">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {list.length === 0 ? (
          <tr>
            <td colSpan={5} className="p-6 text-center text-gray-500 italic text-xs">
              {emptyMsg}
            </td>
          </tr>
        ) : (
          list.map((a) => (
            <tr key={a.id} className="hover:bg-[#191b28] transition-colors">
              <td className="p-2.5 flex items-center gap-2">
                {a.category === 'PAST' ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : a.acknowledged ? (
                  <CheckCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                <span className="text-gray-200 font-bold text-[11px]">{a.alarmName}</span>
              </td>
              <td className="p-2.5 text-blue-300 font-bold">{a.device}</td>
              <td className="p-2.5 text-amber-300">{a.value}</td>
              <td className="p-2.5 text-gray-400">{a.timeDate}</td>
              <td className="p-2.5 text-center">
                {a.category === 'PAST' ? (
                  <span className="text-emerald-400 font-bold text-[10px]">RESOLVED</span>
                ) : a.acknowledged ? (
                  <span className="text-cyan-400 font-bold text-[10px]">ACKED</span>
                ) : (
                  <span className="text-red-400 font-bold text-[10px]">ACTIVE</span>
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
  const [singleDevice, setSingleDevice] = useState<string>(devices[0]?.id || 'Device 1');
  const [singleDate, setSingleDate] = useState<string>(getTodayISO());
  const [singleTimeFrom, setSingleTimeFrom] = useState<string>('00:00');
  const [singleTimeTo, setSingleTimeTo] = useState<string>('23:59');

  const [allDateFrom, setAllDateFrom] = useState<string>(getTodayISO());
  const [allDateTo, setAllDateTo] = useState<string>(getTodayISO());

  const applyCategory = (list: AlarmLog[]) => {
    if (alarmCategory === 'REALTIME') return list.filter((a) => a.category === 'REALTIME');
    if (alarmCategory === 'PAST') return list.filter((a) => a.category === 'PAST');
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
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#060b1a] p-4 md:p-8 text-white font-sans select-none">
      {/* Page Title Header */}
      <div className="mb-6 border-b border-blue-900/40 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-gray-200 font-sans flex items-center gap-3">
            <FileText className="w-7 h-7 text-blue-400" />
            <span>ALARM REPORT GENERATOR</span>
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Official PDF telemetry alarm reports
          </p>
        </div>

        <div className="bg-[#0f111a] border border-amber-900/80 px-3 py-2 rounded flex items-center gap-2 text-xs font-mono">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span className="text-amber-300 font-bold">1-Year Storage Retention Policy</span>
        </div>
      </div>

      {/* Control Bar — matches the sub-tab style of AlarmView */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 bg-[#12131c] p-2 rounded border border-gray-700 font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-xs font-black text-emerald-300 uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            Quick Reports:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleQuickReport('DAY')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1b28] hover:bg-[#222435] text-emerald-300 border border-emerald-700/50 rounded text-xs font-bold uppercase cursor-pointer transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Daily</span>
            </button>
            <button
              onClick={() => handleQuickReport('WEEK')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1b28] hover:bg-[#222435] text-emerald-300 border border-emerald-700/50 rounded text-xs font-bold uppercase cursor-pointer transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Weekly</span>
            </button>
            <button
              onClick={() => handleQuickReport('MONTH')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1b28] hover:bg-[#222435] text-emerald-300 border border-emerald-700/50 rounded text-xs font-bold uppercase cursor-pointer transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Monthly</span>
            </button>
          </div>

          <div className="w-px h-6 bg-gray-700 mx-1" />

          <span className="text-xs font-black text-blue-300 uppercase tracking-wider">
            Scope:
          </span>
          <div className="flex gap-1.5">
            {[
              { id: 'ALL', label: 'ALL ALARMS (1YR)' },
              { id: 'REALTIME', label: 'ACTIVE' },
              { id: 'PAST', label: 'RESOLVED' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setAlarmCategory(cat.id as any)}
                className={`px-3 py-1.5 rounded text-xs font-extrabold uppercase cursor-pointer transition-all ${
                  alarmCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30 border border-blue-400'
                    : 'bg-[#1a1b28] text-gray-400 hover:text-white hover:bg-[#222435] border border-transparent'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Two-column layout — fills the width */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
        {/* SINGLE DEVICE */}
        <div className="bg-[#0f111a] border border-blue-900/40 p-5 rounded shadow-xl">
          <h2 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-4 flex items-center gap-2 border-b border-blue-900/40 pb-2">
            <Cpu className="w-4 h-4" />
            <span>SINGLE DEVICE REPORT</span>
          </h2>

          <div className="space-y-4">
            {/* Device */}
            <div>
              <label className="block text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                Device
              </label>
              <select
                value={singleDevice}
                onChange={(e) => setSingleDevice(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-blue-700/40 text-gray-200 font-bold text-xs px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} ({d.roomName})
                  </option>
                ))}
              </select>
            </div>

            {/* Date + Time on one row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={singleDate}
                  max={getTodayISO()}
                  onChange={(e) => setSingleDate(clampToToday(e.target.value))}
                  className="w-full bg-[#0a0e1a] border border-blue-700/40 text-gray-200 font-bold text-xs px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                  From
                </label>
                <input
                  type="time"
                  value={singleTimeFrom}
                  onChange={(e) => setSingleTimeFrom(e.target.value)}
                  className="w-full bg-[#0a0e1a] border border-blue-700/40 text-gray-200 font-bold text-xs px-2 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                  To
                </label>
                <input
                  type="time"
                  value={singleTimeTo}
                  onChange={(e) => setSingleTimeTo(e.target.value)}
                  className="w-full bg-[#0a0e1a] border border-blue-700/40 text-gray-200 font-bold text-xs px-2 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                Preview ({singleFiltered.length})
              </label>
              <PreviewTable list={singleFiltered} emptyMsg="No matching records for the current filters." />
            </div>

            <button
              onClick={handleDownloadSingleReport}
              id="download-single-alarm-pdf-btn"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black tracking-widest uppercase rounded shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>DOWNLOAD PDF</span>
            </button>
          </div>
        </div>

        {/* ALL DEVICES */}
        <div className="bg-[#0f111a] border border-blue-900/40 p-5 rounded shadow-xl">
          <h2 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-4 flex items-center gap-2 border-b border-blue-900/40 pb-2">
            <Calendar className="w-4 h-4" />
            <span>ALL DEVICES REPORT</span>
          </h2>

          <div className="space-y-4">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                  From
                </label>
                <input
                  type="date"
                  value={allDateFrom}
                  max={getTodayISO()}
                  onChange={(e) => setAllDateFrom(clampToToday(e.target.value))}
                  className="w-full bg-[#0a0e1a] border border-blue-700/40 text-gray-200 font-bold text-xs px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                  To
                </label>
                <input
                  type="date"
                  value={allDateTo}
                  max={getTodayISO()}
                  onChange={(e) => setAllDateTo(clampToToday(e.target.value))}
                  className="w-full bg-[#0a0e1a] border border-blue-700/40 text-gray-200 font-bold text-xs px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="text-[10px] text-blue-400/60 font-mono">
              Range: {formatDateDisplay(allDateFrom)} → {formatDateDisplay(allDateTo)}
            </div>

            {/* Preview */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-blue-300 uppercase mb-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                Preview ({allFiltered.length})
              </label>
              <PreviewTable list={allFiltered} emptyMsg="No matching records for the current filters." />
            </div>

            <button
              onClick={handleDownloadAllReport}
              id="download-all-alarm-pdf-btn"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black tracking-widest uppercase rounded shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>DOWNLOAD PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};