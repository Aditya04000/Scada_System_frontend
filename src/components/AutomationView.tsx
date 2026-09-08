import React, { useState } from 'react';
import { DeviceData, AutomationRule, UserRole } from '../types';
import { Cpu, Plus, Trash2, Power, Flame, Snowflake, Lock } from 'lucide-react';

interface AutomationViewProps {
  devices: DeviceData[];
  userRole?: UserRole;
  onUpdateServoValve: (
    deviceId: string,
    type: 'hot' | 'cold',
    percent: 0 | 25 | 50 | 75 | 100
  ) => void;
  onOpenServoModal: (device: DeviceData) => void;
  automationRules: AutomationRule[];
  onAddRule: (rule: Omit<AutomationRule, 'id'>) => void;
  onDeleteRule: (id: string) => void;
  onToggleRule: (id: string) => void;
  onToggleAutoAdjust?: (deviceId: string, enabled: boolean) => void;
}

export const AutomationView: React.FC<AutomationViewProps> = ({
  devices,
  userRole = 'OPERATOR',
  onUpdateServoValve,
  onOpenServoModal,
  automationRules,
  onAddRule,
  onDeleteRule,
  onToggleRule,
  onToggleAutoAdjust,
}) => {
  const isAdmin = userRole === 'ADMIN';
  const [activeTabSub, setActiveTabSub] = useState<'MATRIX' | 'RULES'>('MATRIX');

  // Rule creation state
  const [newDevice, setNewDevice] = useState('Device 1');
  const [newParameter, setNewParameter] = useState<'Temperature' | 'Humidity'>('Temperature');
  const [newCondition, setNewCondition] = useState<'GREATER_THAN' | 'LESS_THAN'>('GREATER_THAN');
  const [newThreshold, setNewThreshold] = useState('26.0');
  const [newSupply, setNewSupply] = useState<'HOT' | 'COLD'>('HOT');
  const [newValve, setNewValve] = useState<0 | 25 | 50 | 75 | 100>(75);

  const presets: Array<0 | 25 | 50 | 75 | 100> = [0, 25, 50, 75, 100];

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    onAddRule({
      device: newDevice,
      parameter: newParameter,
      condition: newCondition,
      threshold: parseFloat(newThreshold) || 25,
      targetSupply: newSupply,
      targetValvePercent: newValve,
      enabled: true,
    });
  };

  const handleToggleRuleGuarded = (id: string) => {
    if (!isAdmin) return;
    onToggleRule(id);
  };

  const handleDeleteRuleGuarded = (id: string) => {
    if (!isAdmin) return;
    onDeleteRule(id);
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#181a22] p-3 md:p-6 text-white font-sans select-none">
      {/* View Sub Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-[#1e1e22] p-3 rounded border border-gray-600 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-black tracking-wider uppercase text-blue-400">
            <Cpu className="w-5 h-5" />
            <span>AUTOMATION CONTROLLER</span>
          </div>

          {/* Sub Navigation */}
          <div className="flex bg-[#2a2b32] border border-gray-600 rounded p-0.5">
            <button
              onClick={() => setActiveTabSub('MATRIX')}
              className={`px-3 py-1 text-xs font-bold uppercase rounded cursor-pointer ${
                activeTabSub === 'MATRIX'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              DUAL MOTOR CONTROL MATRIX
            </button>
            <button
              onClick={() => setActiveTabSub('RULES')}
              className={`px-3 py-1 text-xs font-bold uppercase rounded cursor-pointer ${
                activeTabSub === 'RULES'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              AUTOMATION LOGIC RULES ({automationRules.length})
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-300 font-mono">
          <span>2 MOTORS PER DEVICE: </span>
          <span className="text-emerald-400 font-bold">HOT & COLD SUPPLY ACTUATORS</span>
        </div>
      </div>

      {activeTabSub === 'MATRIX' ? (
        /* AUTOMATION DUAL MOTOR MATRIX TABLE */
        <div className="w-full overflow-x-auto border-2 border-white/80 bg-black shadow-2xl">
          <table className="w-full border-collapse text-center">
            <thead>
              {/* Main Top Header */}
              <tr className="bg-[#111218] border-b-2 border-white text-white">
                <th rowSpan={2} className="border-r-2 border-white p-3 text-base md:text-lg font-black tracking-widest uppercase w-1/5 font-sans align-middle">
                  DEVICE
                </th>
                <th colSpan={5} className="border-r-2 border-white p-3 text-base md:text-lg font-black tracking-widest uppercase w-2/5 font-sans bg-amber-950/60 text-amber-300">
                  <div className="flex items-center justify-center gap-2">
                    {/* <Flame className="w-5 h-5 text-amber-400" /> */}
                    <span>[Hot Supply] Actuator Control System</span>
                  </div>
                </th>
                <th colSpan={5} className="p-3 text-base md:text-lg font-black tracking-widest uppercase w-2/5 font-sans bg-blue-950/60 text-blue-300">
                  <div className="flex items-center justify-center gap-2">
                    {/* <Snowflake className="w-5 h-5 text-cyan-400" /> */}
                    <span>[Cold Supply] Actuator Control System</span>
                  </div>
                </th>
              </tr>

              {/* Percentage Subheaders (0%, 25%, 50%, 75%, 100%) */}
              <tr className="bg-[#222430] border-b-2 border-white text-white font-black">
                {/* Hot Supply Motor Percentages */}
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#2a221f] text-amber-300">
                  0%
                </th>
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#332622] text-amber-200">
                  25%
                </th>
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#2a221f] text-amber-200">
                  50%
                </th>
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#332622] text-amber-200">
                  75%
                </th>
                <th className="border-r-2 border-white p-2 text-sm font-extrabold tracking-wider bg-[#2a221f] text-amber-100">
                  100%
                </th>

                {/* Cold Supply Motor Percentages */}
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#1f2330] text-blue-300">
                  0%
                </th>
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#242a3a] text-blue-200">
                  25%
                </th>
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#1f2330] text-blue-200">
                  50%
                </th>
                <th className="border-r border-white/70 p-2 text-sm font-extrabold tracking-wider bg-[#242a3a] text-blue-200">
                  75%
                </th>
                <th className="p-2 text-sm font-extrabold tracking-wider bg-[#1f2330] text-blue-100">
                  100%
                </th>
              </tr>
            </thead>

            <tbody>
              {devices.map((device, idx) => (
                <tr
                  key={device.id}
                  className={`border-b border-white/60 font-mono transition-colors ${
                    idx % 2 === 0 ? 'bg-[#33343c]' : 'bg-[#2b2c34]'
                  } hover:bg-[#444654]`}
                >
                  {/* DEVICE name, IP, auto-PID toggle & servo inspect button */}
                  <td className="border-r-2 border-white p-3 font-extrabold text-sm md:text-base text-left pl-3 font-sans">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="block text-white tracking-wide font-black">{device.id}</span>
                          <span className="text-[10px] font-mono text-emerald-300 font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/50">
                            {device.ipAddress}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-300 block font-normal mt-0.5">
                          Hot: <strong className="text-amber-300">{device.hotValvePercent}% ({device.hotValveAngle}°)</strong> | Cold: <strong className="text-cyan-300">{device.coldValvePercent}% ({device.coldValveAngle}°)</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Auto Servo Control Toggle */}
                        {onToggleAutoAdjust && (
                          <button
                            onClick={() => onToggleAutoAdjust(device.id, !device.autoAdjustEnabled)}
                            className={`px-2 py-1 text-[10px] font-black font-mono rounded border cursor-pointer uppercase transition-colors whitespace-nowrap ${
                              device.autoAdjustEnabled
                                ? 'bg-emerald-900/90 text-emerald-300 border-emerald-400'
                                : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white'
                            }`}
                            title="Toggle ESP32 Auto Dual-Motor PID Control"
                          >
                            {device.autoAdjustEnabled ? 'AUTO-PID' : 'MANUAL'}
                          </button>
                        )}

                        <button
                          onClick={() => onOpenServoModal(device)}
                          className="px-2 py-1 bg-slate-700 text-white text-[11px] font-bold rounded border border-blue-400 cursor-pointer shadow whitespace-nowrap"
                          title="Open Dual Motor Dial & Angular Visualizer"
                        >
                          MOTORS
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Hot Supply Motor Controls (0%, 25%, 50%, 75%, 100%) */}
                  {presets.map((p, pIdx) => {
                    const isSelected = device.hotValvePercent === p;
                    return (
                      <td
                        key={`hot-${device.id}-${p}`}
                        className={`p-1 border-r ${
                          pIdx === 4 ? 'border-r-2 border-white' : 'border-white/60'
                        }`}
                      >
                        <button
                          onClick={() => onUpdateServoValve(device.id, 'hot', p)}
                          id={`servo-hot-${device.id.toLowerCase().replace(/\s+/g, '-')}-${p}`}
                          className={`w-full py-2 text-xs md:text-sm font-black transition-all rounded-none cursor-pointer border ${
                            isSelected
                              ? 'bg-amber-800 text-white border-amber-300 scale-[1.02]'
                              : 'bg-[#22232c] text-gray-300 hover:bg-[#333544] hover:text-white border-transparent'
                          }`}
                        >
                          {p}%
                        </button>
                      </td>
                    );
                  })}

                  {/* Cold Supply Motor Controls (0%, 25%, 50%, 75%, 100%) */}
                  {presets.map((p, pIdx) => {
                    const isSelected = device.coldValvePercent === p;
                    return (
                      <td
                        key={`cold-${device.id}-${p}`}
                        className={`p-1 ${
                          pIdx === 4 ? '' : 'border-r border-white/60'
                        }`}
                      >
                        <button
                          onClick={() => onUpdateServoValve(device.id, 'cold', p)}
                          id={`servo-cold-${device.id.toLowerCase().replace(/\s+/g, '-')}-${p}`}
                          className={`w-full py-2 text-xs md:text-sm font-black transition-all rounded-none cursor-pointer border ${
                            isSelected
                              ? 'bg-slate-600 text-white border-cyan-300 scale-[1.02]'
                              : 'bg-[#22232c] text-gray-300 hover:bg-[#333544] hover:text-white border-transparent'
                          }`}
                        >
                          {p}%
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* AUTOMATION RULES CONFIGURATOR */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add New Rule Form — ADMIN only */}
          <div className="bg-[#24252c] border border-gray-600 p-5 rounded shadow-xl">
            <h3 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-4 flex items-center gap-2 border-b border-gray-600 pb-2">
              <Plus className="w-4 h-4" />
              <span>Create Motor Automation Rule</span>
            </h3>

            {!isAdmin ? (
              <div className="flex flex-col items-center justify-center text-center py-10 text-gray-400 gap-2">
                <Lock className="w-8 h-8 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Admin Permission Required</span>
                <span className="text-[11px] text-gray-500">
                  Automation rules can only be created, enabled/disabled, or deleted by an Admin.
                </span>
              </div>
            ) : (
            <form onSubmit={handleCreateRule} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-gray-300 uppercase mb-1 font-bold">Target Device</label>
                <select
                  value={newDevice}
                  onChange={(e) => setNewDevice(e.target.value)}
                  className="w-full bg-[#16171d] border border-gray-500 text-white p-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} ({d.roomName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 uppercase mb-1 font-bold">Monitored Sensor</label>
                <select
                  value={newParameter}
                  onChange={(e) => setNewParameter(e.target.value as any)}
                  className="w-full bg-[#16171d] border border-gray-500 text-white p-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="Temperature">Room Temperature (°C)</option>
                  <option value="Humidity">Room Humidity (% RH)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 uppercase mb-1 font-bold">Condition</label>
                  <select
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value as any)}
                    className="w-full bg-[#16171d] border border-gray-500 text-white p-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="GREATER_THAN">&gt; Greater Than</option>
                    <option value="LESS_THAN">&lt; Less Than</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 uppercase mb-1 font-bold">Threshold Value</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(e.target.value)}
                    className="w-full bg-[#16171d] border border-gray-500 text-white p-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 uppercase mb-1 font-bold">
                  Target Motor System
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setNewSupply('HOT')}
                    className={`py-2 text-xs font-bold rounded border cursor-pointer flex items-center justify-center gap-1.5 ${
                      newSupply === 'HOT'
                        ? 'bg-amber-600 text-white border-amber-300 font-black'
                        : 'bg-[#16171d] text-gray-300 border-gray-600 hover:bg-[#202128]'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-300" />
                    <span>Hot Supply Motor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSupply('COLD')}
                    className={`py-2 text-xs font-bold rounded border cursor-pointer flex items-center justify-center gap-1.5 ${
                      newSupply === 'COLD'
                        ? 'bg-blue-600 text-white border-blue-300 font-black'
                        : 'bg-[#16171d] text-gray-300 border-gray-600 hover:bg-[#202128]'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Cold Supply Motor</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 uppercase mb-1 font-bold">
                  Action: Adjust Motor Position To
                </label>
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {presets.map((p) => (
                    <button
                      type="button"
                      key={`rule-p-${p}`}
                      onClick={() => setNewValve(p)}
                      className={`py-2 text-xs font-black rounded border cursor-pointer ${
                        newValve === p
                          ? 'bg-blue-600 text-white border-blue-300'
                          : 'bg-[#16171d] text-gray-300 border-gray-600 hover:bg-[#202128]'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-600 text-white font-bold uppercase rounded tracking-wider shadow cursor-pointer transition-all"
              >
                SAVE AUTOMATION RULE
              </button>
            </form>
            )}
          </div>

          {/* Rules List */}
          <div className="lg:col-span-2 bg-[#24252c] border border-gray-600 p-5 rounded shadow-xl">
            <h3 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-4 flex items-center justify-between border-b border-gray-600 pb-2">
              <span>ACTIVE AUTOMATION LOGIC RULES</span>
              <span className="text-xs text-gray-400 font-mono">Modbus Dual Motor Closed-Loop Control</span>
            </h3>

            {automationRules.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs font-mono border border-dashed border-gray-600 rounded">
                No automation rules defined. Create one on the left to automate Hot or Cold supply motor valves based on room temperature or humidity thresholds.
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                {automationRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-3 border rounded flex flex-wrap items-center justify-between gap-3 ${
                      rule.enabled
                        ? 'bg-[#1a1b22] border-blue-500/60 text-white'
                        : 'bg-[#15161a] border-gray-700 text-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleRuleGuarded(rule.id)}
                        disabled={!isAdmin}
                        className={`p-1.5 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                          rule.enabled ? 'text-emerald-400 bg-emerald-950' : 'text-gray-500 bg-gray-900'
                        }`}
                        title={isAdmin ? 'Toggle Rule Enable/Disable' : 'Admin permission required'}
                      >
                        <Power className="w-4 h-4" />
                      </button>

                      <div>
                        <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                          <span>{rule.device} • {rule.parameter}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border uppercase ${
                            rule.targetSupply === 'HOT'
                              ? 'bg-amber-950 text-amber-300 border-amber-600'
                              : 'bg-blue-950 text-cyan-300 border-blue-600'
                          }`}>
                            {rule.targetSupply === 'HOT' ? 'Hot Motor' : 'Cold Motor'}
                          </span>
                        </div>
                        <div className="text-gray-300 text-xs mt-0.5">
                          IF {rule.parameter} {rule.condition === 'GREATER_THAN' ? '>' : '<'} {rule.threshold}
                          {rule.parameter === 'Temperature' ? '°C' : '%'}, THEN SET {rule.targetSupply === 'HOT' ? 'HOT SUPPLY MOTOR' : 'COLD SUPPLY MOTOR'} TO{' '}
                          <span className="text-blue-300 font-bold">{rule.targetValvePercent}%</span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteRuleGuarded(rule.id)}
                        className="p-1.5 bg-red-950/60 hover:bg-red-800 text-red-300 rounded border border-red-700 cursor-pointer transition-colors"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
