import React, { useState } from 'react';
import { DeviceData, HistoryDataPoint } from '../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { LineChart as ChartIcon, Thermometer, Droplets, Flame, Snowflake, WifiOff } from 'lucide-react';

interface GraphViewProps {
  devices: DeviceData[];
  deviceHistory: Record<string, HistoryDataPoint[]>;
}

export const GraphView: React.FC<GraphViewProps> = ({ devices, deviceHistory }) => {
  const [selectedDevice, setSelectedDevice] = useState<string>('Device 1');
  const [showTemp, setShowTemp] = useState<boolean>(true);
  const [showHumidity, setShowHumidity] = useState<boolean>(true);
  const [showHotAngle, setShowHotAngle] = useState<boolean>(true);
  const [showColdAngle, setShowColdAngle] = useState<boolean>(true);

  // Real recorded telemetry only
  const chartData = deviceHistory[selectedDevice] || [];
  const hasRealData = chartData.length > 0;

  // Compute summary stats — all from real recorded points only
  const temps = chartData.map((d) => d.temperature);
  const hums = chartData.map((d) => d.humidity);
  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : '--';
  const maxTemp = temps.length ? Math.max(...temps).toFixed(1) : '--';
  const minTemp = temps.length ? Math.min(...temps).toFixed(1) : '--';
  const avgHum = hums.length ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1) : '--';

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#1e1f29] p-4 md:p-8 text-white font-sans select-none">
      {/* View Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-gray-200 font-sans flex items-center gap-3">
            <ChartIcon className="w-7 h-7 text-blue-400" />
            <span>REALTIME & HISTORICAL GRAPH</span>
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Real telemetry only — recorded live from the device while connected. 24-hour history window.
          </p>
        </div>

        {/* Device Selector */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-2 bg-[#12131b] border border-gray-700 p-2 rounded">
            <label className="text-gray-400 uppercase font-bold">Select Device:</label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="bg-[#2a2b38] border border-gray-600 text-white px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-bold"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id} ({d.roomName}){deviceHistory[d.id]?.length ? '' : ' — no data yet'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!hasRealData ? (
        /* Genuine empty state — no device connected / no real data recorded yet */
        <div className="bg-[#12131d] border border-gray-700 rounded shadow-2xl flex flex-col items-center justify-center py-24 gap-3">
          <WifiOff className="w-10 h-10 text-gray-600" />
          <span className="text-sm font-black uppercase tracking-wider text-gray-400">No Real Data Available</span>
          <span className="text-xs text-gray-500 font-mono max-w-md text-center">
            {selectedDevice} hasn't reported any real telemetry yet. This device needs to actually connect and send
            data before a graph can be shown here — nothing is simulated.
          </span>
        </div>
      ) : (
        <>
          {/* Metrics Checkboxes & Summary Cards */}
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono">
            {/* Metric Toggles */}
            <div className="bg-[#13141f] border border-gray-700 p-3 rounded flex flex-col justify-center gap-2 text-xs">
              <span className="text-gray-400 uppercase font-bold text-[11px]">DISPLAY PARAMETERS:</span>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer text-emerald-400">
                  <input
                    type="checkbox"
                    checked={showTemp}
                    onChange={(e) => setShowTemp(e.target.checked)}
                    className="accent-emerald-500 cursor-pointer"
                  />
                  <span>Temp (°C)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-cyan-400">
                  <input
                    type="checkbox"
                    checked={showHumidity}
                    onChange={(e) => setShowHumidity(e.target.checked)}
                    className="accent-cyan-500 cursor-pointer"
                  />
                  <span>Hum (% RH)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-amber-400">
                  <input
                    type="checkbox"
                    checked={showHotAngle}
                    onChange={(e) => setShowHotAngle(e.target.checked)}
                    className="accent-amber-500 cursor-pointer"
                  />
                  <span>Hot Motor (°)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-blue-400">
                  <input
                    type="checkbox"
                    checked={showColdAngle}
                    onChange={(e) => setShowColdAngle(e.target.checked)}
                    className="accent-blue-500 cursor-pointer"
                  />
                  <span>Cold Motor (°)</span>
                </label>
              </div>
            </div>

            {/* Temp Stat Card */}
            <div className="bg-[#13141f] border border-emerald-900/80 p-3 rounded flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                <span>TEMP SUMMARY</span>
                <Thermometer className="w-4 h-4" />
              </div>
              <div className="my-1">
                <div className="text-2xl font-black text-white">{avgTemp} °C</div>
                <div className="text-[10px] text-gray-400">
                  Max: {maxTemp}°C | Min: {minTemp}°C
                </div>
              </div>
            </div>

            {/* Humidity Stat Card */}
            <div className="bg-[#13141f] border border-cyan-900/80 p-3 rounded flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-cyan-400 font-bold">
                <span>HUMIDITY SUMMARY</span>
                <Droplets className="w-4 h-4" />
              </div>
              <div className="my-1">
                <div className="text-2xl font-black text-white">{avgHum} %</div>
                <div className="text-[10px] text-gray-400">Average Relative Humidity</div>
              </div>
            </div>

            {/* Dual Motor Stat Card */}
            <div className="bg-[#13141f] border border-amber-900/80 p-3 rounded flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold">
                <span>DUAL MOTORS</span>
                <div className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                </div>
              </div>
              <div className="my-1">
                <div className="text-2xl font-black text-white">0° - 180°</div>
                <div className="text-[10px] text-gray-400">Hot & Cold Actuator Angles</div>
              </div>
            </div>
          </div>

          {/* Main Chart Card */}
          <div className="bg-[#12131d] border border-gray-700 p-4 rounded shadow-2xl">
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 15, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2c3d" />
                  <XAxis dataKey="time" stroke="#8888a0" fontSize={11} tickLine={false} />

                  {/* Left Y Axis for Temp & Humidity */}
                  <YAxis yAxisId="left" stroke="#8888a0" fontSize={11} domain={[10, 100]} />

                  {/* Right Y Axis for Motor Angles */}
                  <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" fontSize={11} domain={[0, 180]} />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0d0e17',
                      borderColor: '#3b3e54',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />

                  {showTemp && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="temperature"
                      name="Temperature (°C)"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  )}

                  {showHumidity && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="humidity"
                      name="Humidity (% RH)"
                      stroke="#06b6d4"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  )}

                  {showHotAngle && (
                    <Line
                      yAxisId="right"
                      type="stepAfter"
                      dataKey="hotServoAngle"
                      name="Hot Motor Angle (°)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}

                  {showColdAngle && (
                    <Line
                      yAxisId="right"
                      type="stepAfter"
                      dataKey="coldServoAngle"
                      name="Cold Motor Angle (°)"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};