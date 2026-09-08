import React, { useState } from 'react';
import { DeviceData, UserRole } from '../types';
import { AlertTriangle, Thermometer, Edit3, Check, Lock, WifiOff, Edit2 } from 'lucide-react';

interface RealTimeDataViewProps {
  devices: DeviceData[];
  userRole?: UserRole;
  onUpdateDeviceName?: (deviceId: string, newName: string) => void;
  onUpdateDeviceRoom?: (deviceId: string, newRoomName: string) => void;
  onUpdateDeviceThresholds?: (
    deviceId: string,
    field: 'tempMax' | 'tempMin' | 'humidityMax' | 'humidityMin',
    value: number
  ) => void;
  onToggleDeviceOnline?: (deviceId: string) => void;
}

export const RealTimeDataView: React.FC<RealTimeDataViewProps> = ({
  devices,
  userRole = 'OPERATOR',
  onUpdateDeviceName,
  onUpdateDeviceRoom,
  onUpdateDeviceThresholds,
  onToggleDeviceOnline,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [isEditingThresholds, setIsEditingThresholds] = useState<boolean>(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomValue, setEditingRoomValue] = useState<string>('');

  const isAdmin = userRole === 'ADMIN';

  const filteredDevices = devices.filter(
    (d) =>
      d.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.roomName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (isAdmin && d.ipAddress.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const convertTemp = (c: number | null) => {
    if (c === null) return '......';
    if (tempUnit === 'F') return (c * 1.8 + 32).toFixed(1);
    return c.toFixed(1);
  };

  const handleTempChange = (deviceId: string, field: 'tempMax' | 'tempMin', rawVal: string) => {
    if (!onUpdateDeviceThresholds || !isAdmin) return;
    const num = parseFloat(rawVal);
    if (isNaN(num)) return;
    const cValue = tempUnit === 'F' ? (num - 32) / 1.8 : num;
    onUpdateDeviceThresholds(deviceId, field, cValue);
  };

  const handleHumChange = (deviceId: string, field: 'humidityMax' | 'humidityMin', rawVal: string) => {
    if (!onUpdateDeviceThresholds || !isAdmin) return;
    const num = parseFloat(rawVal);
    if (isNaN(num)) return;
    onUpdateDeviceThresholds(deviceId, field, num);
  };

  const startRenameDevice = (device: DeviceData) => {
    if (!isAdmin) return;
    setEditingDeviceId(device.id);
    setEditingNameValue(device.name || device.id);
  };

  const saveRenameDevice = (deviceId: string) => {
    if (onUpdateDeviceName && editingNameValue.trim()) {
      onUpdateDeviceName(deviceId, editingNameValue.trim());
    }
    setEditingDeviceId(null);
  };

  // Room name is editable ONLY by ADMIN
  const startRenameRoom = (device: DeviceData) => {
    if (!isAdmin) return;
    setEditingRoomId(device.id);
    setEditingRoomValue(device.roomName || '');
  };

  const saveRenameRoom = (deviceId: string) => {
    if (onUpdateDeviceRoom && editingRoomValue.trim()) {
      onUpdateDeviceRoom(deviceId, editingRoomValue.trim());
    }
    setEditingRoomId(null);
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#181a22] p-3 md:p-6 text-white font-sans select-none">
      {/* Top Controls Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-[#262836] p-3 rounded border border-gray-700 shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-black tracking-wider uppercase text-blue-400 font-mono">
            <Thermometer className="w-5 h-5" />
            <span>REAL TIME TELEMETRY</span>
          </div>

          <input
            type="text"
            placeholder={isAdmin ? "Search Device / IP / Room..." : "Search Device / Room..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#181922] border border-gray-600 text-xs px-3 py-1.5 text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 font-mono w-48 md:w-64 rounded"
          />

          <span className="text-xs font-mono px-2 py-1 bg-[#181922] border border-gray-700 rounded text-amber-300">
            ROLE: <strong className="uppercase">{userRole}</strong>
            {isAdmin ? ' (Full Edit Access)' : ' '}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Edit Thresholds Mode Button - ADMIN only */}
          {isAdmin ? (
            <button
              onClick={() => setIsEditingThresholds(!isEditingThresholds)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border cursor-pointer transition-all shadow ${
                isEditingThresholds
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-300 ring-2 ring-amber-400/50'
                  : 'bg-[#181922] hover:bg-[#202230] text-amber-300 border-amber-500/60'
              }`}
              title="Edit Alarm Min & Max Thresholds for Devices"
            >
              {isEditingThresholds ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>SAVE THRESHOLDS</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <span>EDIT THRESHOLDS</span>
                </>
              )}
            </button>
          ) : (
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border border-gray-700 bg-[#181922] text-gray-500 cursor-not-allowed"
              title="Admin permission required to edit thresholds"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>THRESHOLDS LOCKED</span>
            </span>
          )}

          {/* Unit Toggle */}
          <div className="flex items-center bg-[#181922] border border-gray-700 rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setTempUnit('C')}
              className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                tempUnit === 'C' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              °C
            </button>
            <button
              onClick={() => setTempUnit('F')}
              className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                tempUnit === 'F' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              °F
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Matrix Table */}
      <div className="w-full overflow-x-auto border border-gray-700 bg-[#14151e] shadow-2xl rounded">
        <table className="w-full border-collapse text-center">
          <thead>
            {/* Top Level Headers */}
            <tr className="bg-[#1b1c26] border-b border-gray-700 text-white">
              <th rowSpan={2} className="border-r border-gray-700 p-3 text-sm md:text-base font-extrabold tracking-wider uppercase w-1/4 font-sans align-middle">
                DEVICE NAME & STATUS
              </th>
              <th colSpan={3} className="border-r border-gray-700 p-2.5 text-sm md:text-base font-extrabold tracking-wider uppercase w-3/8 font-sans">
                TEMPERATURE ({tempUnit === 'C' ? '°C' : '°F'})
              </th>
              <th colSpan={3} className="p-2.5 text-sm md:text-base font-extrabold tracking-wider uppercase w-3/8 font-sans">
                HUMIDITY (% RH)
              </th>
            </tr>

            {/* Sub Level Headers */}
            <tr className="bg-[#212330] border-b border-gray-700 text-gray-200 font-extrabold text-xs">
              <th className="border-r border-gray-700 p-2 bg-[#252838]">
                MAX {isEditingThresholds && isAdmin && <span className="text-amber-400 block text-[10px]">(EDIT)</span>}
              </th>
              <th className="border-r border-gray-700 p-2 bg-[#1b1d2a] text-blue-300">REAL DATA</th>
              <th className="border-r border-gray-700 p-2 bg-[#252838]">
                MIN {isEditingThresholds && isAdmin && <span className="text-amber-400 block text-[10px]">(EDIT)</span>}
              </th>

              <th className="border-r border-gray-700 p-2 bg-[#252838]">
                MAX {isEditingThresholds && isAdmin && <span className="text-amber-400 block text-[10px]">(EDIT)</span>}
              </th>
              <th className="border-r border-gray-700 p-2 bg-[#1b1d2a] text-cyan-300">REAL DATA</th>
              <th className="p-2 bg-[#252838]">
                MIN {isEditingThresholds && isAdmin && <span className="text-amber-400 block text-[10px]">(EDIT)</span>}
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredDevices.map((device, idx) => {
              const isOffline = !device.isOnline || device.tempReal === null || device.humidityReal === null;

              const isTempWarning =
                !isOffline &&
                device.tempReal !== null &&
                (device.tempReal > device.tempMax || device.tempReal < device.tempMin);

              const isHumWarning =
                !isOffline &&
                device.humidityReal !== null &&
                (device.humidityReal > device.humidityMax || device.humidityReal < device.humidityMin);

              return (
                <tr
                  key={device.id}
                  className={`border-b border-gray-800 font-mono transition-colors ${
                    idx % 2 === 0 ? 'bg-[#1a1b24]' : 'bg-[#1e202b]'
                  } hover:bg-[#272938]`}
                >
                  {/* DEVICE NAME Column - Editable for Admin */}
                  <td className="border-r border-gray-700 p-3 text-left font-sans">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        {editingDeviceId === device.id && isAdmin ? (
                          <div className="flex items-center gap-1 w-full">
                            <input
                              type="text"
                              value={editingNameValue}
                              onChange={(e) => setEditingNameValue(e.target.value)}
                              className="bg-[#12131a] border border-amber-500 text-amber-300 text-xs px-2 py-1 rounded w-full font-mono font-bold"
                              autoFocus
                            />
                            <button
                              onClick={() => saveRenameDevice(device.id)}
                              className="px-2 py-1 bg-emerald-600 text-white text-xs font-bold rounded cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-white tracking-wide">
                              {device.name || device.id}
                            </span>
                            {isAdmin ? (
                              <button
                                onClick={() => startRenameDevice(device)}
                                className="text-gray-400 hover:text-amber-300 transition-colors p-0.5 cursor-pointer"
                                title="Admin: Click to rename device"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span title="Admin permission required to rename device">
                                <Lock className="w-3 h-3 text-gray-500" />
                              </span>
                            )}
                          </div>
                        )}

                        {/* Online / Offline Toggle Button for hardware test */}
                        {onToggleDeviceOnline && (
                          <button
                            onClick={() => onToggleDeviceOnline(device.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer border ${
                              device.isOnline
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                                : 'bg-red-950 text-red-300 border-red-700'
                            }`}
                            title="Click to simulate ESP32 Hardware Disconnect / Connect"
                          >
                            {device.isOnline ? 'ONLINE' : 'OFFLINE'}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        {/* Room name - Admin only editing */}
                        {editingRoomId === device.id && isAdmin ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingRoomValue}
                              onChange={(e) => setEditingRoomValue(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveRenameRoom(device.id)}
                              className="bg-[#12131a] border border-amber-500 text-amber-300 text-[11px] px-1.5 py-0.5 rounded font-mono"
                              autoFocus
                            />
                            <button
                              onClick={() => saveRenameRoom(device.id)}
                              className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1">
                            {device.roomName}
                            {isAdmin && (
                              <button
                                onClick={() => startRenameRoom(device)}
                                className="text-gray-500 hover:text-amber-300 transition-colors cursor-pointer"
                                title="Admin: Click to rename room"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        )}
                        {/* IP Address - Only visible to Admin */}
                        {isAdmin && (
                          <span className="font-mono text-[10px] text-gray-400">IP: {device.ipAddress}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* TEMP MAX */}
                  <td className="border-r border-gray-700 p-2 text-sm text-gray-300">
                    {isEditingThresholds && isAdmin ? (
                      <input
                        type="number"
                        step="0.5"
                        value={convertTemp(device.tempMax)}
                        onChange={(e) => handleTempChange(device.id, 'tempMax', e.target.value)}
                        className="w-16 bg-[#12131a] text-amber-300 border border-amber-500 font-bold text-center rounded px-1 py-0.5 text-xs focus:outline-none"
                      />
                    ) : (
                      <span>{convertTemp(device.tempMax)}</span>
                    )}
                  </td>

                  {/* TEMP REAL DATA */}
                  <td
                    className={`border-r border-gray-700 p-3 text-base md:text-lg font-black font-mono transition-all ${
                      isOffline
                        ? 'bg-[#181920] text-gray-500'
                        : isTempWarning
                        ? 'bg-red-950/80 text-red-300 font-extrabold'
                        : 'bg-[#151722] text-emerald-400'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {isOffline ? (
                        <div className="flex items-center gap-1 text-gray-500 font-bold tracking-widest">
                          <WifiOff className="w-3.5 h-3.5 text-gray-500 inline" />
                          <span>......</span>
                        </div>
                      ) : (
                        <>
                          {isTempWarning && <AlertTriangle className="w-4 h-4 text-red-400 inline" />}
                          <span>{convertTemp(device.tempReal)}</span>
                        </>
                      )}
                    </div>
                  </td>

                  {/* TEMP MIN */}
                  <td className="border-r border-gray-700 p-2 text-sm text-gray-300">
                    {isEditingThresholds && isAdmin ? (
                      <input
                        type="number"
                        step="0.5"
                        value={convertTemp(device.tempMin)}
                        onChange={(e) => handleTempChange(device.id, 'tempMin', e.target.value)}
                        className="w-16 bg-[#12131a] text-amber-300 border border-amber-500 font-bold text-center rounded px-1 py-0.5 text-xs focus:outline-none"
                      />
                    ) : (
                      <span>{convertTemp(device.tempMin)}</span>
                    )}
                  </td>

                  {/* HUMIDITY MAX */}
                  <td className="border-r border-gray-700 p-2 text-sm text-gray-300">
                    {isEditingThresholds && isAdmin ? (
                      <input
                        type="number"
                        step="1"
                        value={device.humidityMax}
                        onChange={(e) => handleHumChange(device.id, 'humidityMax', e.target.value)}
                        className="w-14 bg-[#12131a] text-amber-300 border border-amber-500 font-bold text-center rounded px-1 py-0.5 text-xs focus:outline-none"
                      />
                    ) : (
                      <span>{device.humidityMax}%</span>
                    )}
                  </td>

                  {/* HUMIDITY REAL DATA */}
                  <td
                    className={`border-r border-gray-700 p-3 text-base md:text-lg font-black font-mono transition-all ${
                      isOffline
                        ? 'bg-[#181920] text-gray-500'
                        : isHumWarning
                        ? 'bg-amber-950/80 text-amber-300 font-extrabold'
                        : 'bg-[#151722] text-cyan-400'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {isOffline ? (
                        <div className="flex items-center gap-1 text-gray-500 font-bold tracking-widest">
                          <WifiOff className="w-3.5 h-3.5 text-gray-500 inline" />
                          <span>......</span>
                        </div>
                      ) : (
                        <>
                          {isHumWarning && <AlertTriangle className="w-4 h-4 text-amber-400 inline" />}
                          <span>{device.humidityReal}%</span>
                        </>
                      )}
                    </div>
                  </td>

                  {/* HUMIDITY MIN */}
                  <td className="p-2 text-sm text-gray-300">
                    {isEditingThresholds && isAdmin ? (
                      <input
                        type="number"
                        step="1"
                        value={device.humidityMin}
                        onChange={(e) => handleHumChange(device.id, 'humidityMin', e.target.value)}
                        className="w-14 bg-[#12131a] text-amber-300 border border-amber-500 font-bold text-center rounded px-1 py-0.5 text-xs focus:outline-none"
                      />
                    ) : (
                      <span>{device.humidityMin}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-gray-400 font-mono">
        <span>Showing {filteredDevices.length} Hardware Sensor Nodes</span>
        <span className="flex items-center gap-2">
          <span className="text-amber-400 font-bold">Disconnected Hardware displays "......"</span>
        </span>
      </div>
    </div>
  );
};
