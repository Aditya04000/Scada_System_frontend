import React from 'react';
import { DeviceData } from '../types';
import { X, Cpu, Gauge, Zap, Thermometer, Droplets, Flame, Snowflake } from 'lucide-react';

interface ServoVisualizerModalProps {
  device: DeviceData | null;
  onClose: () => void;
  onUpdateServoValve: (
    deviceId: string,
    type: 'hot' | 'cold',
    percent: 0 | 25 | 50 | 75 | 100
  ) => void;
  onToggleAutoAdjust?: (deviceId: string, enabled: boolean) => void;
}

export const ServoVisualizerModal: React.FC<ServoVisualizerModalProps> = ({
  device,
  onClose,
  onUpdateServoValve,
  onToggleAutoAdjust,
}) => {
  if (!device) return null;

  const presets: Array<0 | 25 | 50 | 75 | 100> = [0, 25, 50, 75, 100];
  const isOffline = !device.isOnline || device.tempReal === null || device.humidityReal === null;

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm select-none">
      <div className="bg-[#1a1b26] border-2 border-blue-500/80 w-full max-w-2xl rounded p-6 shadow-2xl text-white font-sans relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-700 pb-3 mb-5">
          <div className="flex items-center gap-2">
            <Cpu className="w-6 h-6 text-blue-400" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wider uppercase text-white font-mono">
                  {device.name || device.id} • DUAL MOTOR ACTUATOR SYSTEM
                </h2>
                <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 font-mono text-xs font-bold rounded border border-emerald-500/50">
                  IP: {device.ipAddress}
                </span>
              </div>
              <span className="text-xs text-gray-400 font-mono">{device.roomName}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Room Telemetry Overview & Auto-PID Mode Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 bg-[#11121c] p-3 rounded border border-gray-800 text-xs font-mono">
          <div className="flex items-center gap-2 text-emerald-400">
            <Thermometer className="w-4 h-4 shrink-0" />
            <div>
              <span className="text-gray-400 block text-[10px]">ROOM TEMP SENSOR</span>
              <span className="font-extrabold text-sm">
                {!isOffline && device.tempReal !== null ? `${device.tempReal} °C` : '......'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-cyan-400">
            <Droplets className="w-4 h-4 shrink-0" />
            <div>
              <span className="text-gray-400 block text-[10px]">ROOM HUMIDITY SENSOR</span>
              <span className="font-extrabold text-sm">
                {!isOffline && device.humidityReal !== null ? `${device.humidityReal} %` : '......'}
              </span>
            </div>
          </div>

          {/* ESP32 Onboard Auto-Adjust PID Mode Button */}
          <div className="flex flex-col justify-center items-end">
            <span className="text-gray-400 text-[10px] mb-0.5">ESP32 DUAL MOTOR AUTO-PID:</span>
            {onToggleAutoAdjust && (
              <button
                onClick={() => onToggleAutoAdjust(device.id, !device.autoAdjustEnabled)}
                className={`px-3 py-1 text-xs font-black rounded border cursor-pointer uppercase tracking-wider ${
                  device.autoAdjustEnabled
                    ? 'bg-emerald-900 text-emerald-300 border-emerald-500 shadow'
                    : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white'
                }`}
              >
                {device.autoAdjustEnabled ? 'AUTO-PID ENABLED' : 'MANUAL OVERRIDE'}
              </button>
            )}
          </div>
        </div>

        {/* Servo Motor Actuator Visualizer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hot Supply Motor Valve */}
          <div className="bg-[#12131d] border border-amber-900/80 p-4 rounded flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-xs font-black tracking-wider uppercase text-amber-400 mb-3 font-mono">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>[HOT SUPPLY] MOTOR VALVE</span>
            </div>

            {/* Dial Graphic */}
            <div className="relative w-36 h-36 flex items-center justify-center my-2 bg-[#0d0e16] rounded-full border-4 border-amber-600/50 shadow-inner">
              <div className="absolute inset-2 rounded-full border border-dashed border-gray-600 pointer-events-none"></div>

              {/* Rotating Arm Needle */}
              <div
                className="absolute w-1.5 h-14 bg-gradient-to-t from-amber-500 to-orange-300 rounded-full origin-bottom bottom-1/2 transition-transform duration-500 ease-out shadow-[0_0_10px_rgba(245,158,11,0.9)]"
                style={{
                  transform: `rotate(${device.hotValveAngle - 90}deg)`,
                }}
              ></div>

              <div className="w-6 h-6 rounded-full bg-amber-500 border-2 border-white z-10 shadow"></div>

              <div className="absolute bottom-2 text-[10px] text-gray-400 font-mono">
                {device.hotValveAngle}° (0°-180°)
              </div>
            </div>

            <div className="text-center font-mono my-2">
              <span className="text-2xl font-black text-white">{device.hotValvePercent}%</span>
              <span className="block text-[10px] text-amber-300 uppercase">HEATING SUPPLY OPENING</span>
            </div>

            {/* Quick Set Percentage Buttons */}
            <div className="grid grid-cols-5 gap-1 w-full mt-2 font-mono">
              {presets.map((p) => (
                <button
                  key={`modal-hot-${p}`}
                  onClick={() => onUpdateServoValve(device.id, 'hot', p)}
                  className={`py-1.5 text-xs font-bold rounded border cursor-pointer ${
                    device.hotValvePercent === p
                      ? 'bg-amber-600 text-white border-amber-300 shadow'
                      : 'bg-[#1b1c28] text-gray-400 border-gray-700 hover:text-white'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {/* Cold Supply Motor Valve */}
          <div className="bg-[#12131d] border border-blue-900/80 p-4 rounded flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-xs font-black tracking-wider uppercase text-cyan-400 mb-3 font-mono">
              <Snowflake className="w-4 h-4 text-cyan-400" />
              <span>[COLD SUPPLY] MOTOR VALVE</span>
            </div>

            {/* Dial Graphic */}
            <div className="relative w-36 h-36 flex items-center justify-center my-2 bg-[#0d0e16] rounded-full border-4 border-blue-600/50 shadow-inner">
              <div className="absolute inset-2 rounded-full border border-dashed border-gray-600 pointer-events-none"></div>

              {/* Rotating Arm Needle */}
              <div
                className="absolute w-1.5 h-14 bg-gradient-to-t from-blue-500 to-cyan-300 rounded-full origin-bottom bottom-1/2 transition-transform duration-500 ease-out shadow-[0_0_10px_rgba(6,182,212,0.9)]"
                style={{
                  transform: `rotate(${device.coldValveAngle - 90}deg)`,
                }}
              ></div>

              <div className="w-6 h-6 rounded-full bg-cyan-500 border-2 border-white z-10 shadow"></div>

              <div className="absolute bottom-2 text-[10px] text-gray-400 font-mono">
                {device.coldValveAngle}° (0°-180°)
              </div>
            </div>

            <div className="text-center font-mono my-2">
              <span className="text-2xl font-black text-white">{device.coldValvePercent}%</span>
              <span className="block text-[10px] text-cyan-300 uppercase">COOLING SUPPLY OPENING</span>
            </div>

            {/* Quick Set Percentage Buttons */}
            <div className="grid grid-cols-5 gap-1 w-full mt-2 font-mono">
              {presets.map((p) => (
                <button
                  key={`modal-cold-${p}`}
                  onClick={() => onUpdateServoValve(device.id, 'cold', p)}
                  className={`py-1.5 text-xs font-bold rounded border cursor-pointer ${
                    device.coldValvePercent === p
                      ? 'bg-blue-600 text-white border-blue-300 shadow'
                      : 'bg-[#1b1c28] text-gray-400 border-gray-700 hover:text-white'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Motor Diagnostics */}
        <div className="mt-5 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400 font-mono">
          <div className="flex items-center gap-1 text-emerald-400">
            <Zap className="w-3.5 h-3.5" />
            <span>Power: 24V PWM Dual Motor Modbus Bus</span>
          </div>

          <div className="flex items-center gap-1 text-amber-400">
            <Gauge className="w-3.5 h-3.5" />
            <span>Torque Load: 1.2 N·m (Hot & Cold Actuators Synchronized)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
