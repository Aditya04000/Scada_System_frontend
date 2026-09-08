import React, { useState } from 'react';
import { DeviceData } from '../types';
import { Power, Fan, Search, Cpu } from 'lucide-react';

interface DhuControlViewProps {
  devices: DeviceData[];
  onToggleRelay: (deviceId: string, relay: 'AHU' | 'DHU1' | 'DHU2') => void;
}

const RelaySwitch: React.FC<{
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, on, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded border text-xs font-mono w-full cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      on ? 'bg-emerald-950/60 border-emerald-700' : 'bg-[#1b1c28] border-gray-700'
    }`}
  >
    <span className={`font-bold uppercase tracking-wider ${on ? 'text-emerald-300' : 'text-gray-400'}`}>
      {label}
    </span>
    <span
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
        on ? 'bg-emerald-700 border-emerald-500' : 'bg-gray-700 border-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          on ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </span>
  </button>
);

export const DhuControlView: React.FC<DhuControlViewProps> = ({ devices, onToggleRelay }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDevices = devices.filter(
    (d) =>
      d.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.roomName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#181a22] p-4 md:p-8 text-white font-sans select-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-gray-200 font-sans flex items-center gap-3">
            {/* <Fan className="w-7 h-7 text-cyan-400" /> */}
            <span>SYSTEM CONTROL PANEL</span>
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Relay control  
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#12131b] border border-gray-700 px-3 py-2 rounded">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search device / room..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none font-mono w-48"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDevices.map((dev) => (
          <div key={dev.id} className="bg-[#12131d] border border-gray-700 p-4 rounded shadow-xl">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wider text-white">
                    {dev.name || dev.id}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">{dev.roomName}</div>
                </div>
              </div>
              <span
                className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${
                  dev.isOnline
                    ? 'text-emerald-400 border-emerald-800 bg-emerald-950/50'
                    : 'text-red-400 border-red-900 bg-red-950/50'
                }`}
              >
                {dev.isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <RelaySwitch
                label="AHU"
                on={dev.ahuPowerOn}
                onClick={() => onToggleRelay(dev.id, 'AHU')}
              />
              <RelaySwitch
                label="DHU1"
                on={dev.dhu1On}
                onClick={() => onToggleRelay(dev.id, 'DHU1')}
              />
              <RelaySwitch
                label="DHU2"
                on={dev.dhu2On}
                onClick={() => onToggleRelay(dev.id, 'DHU2')}
              />
            </div>
          </div>
        ))}

        {filteredDevices.length === 0 && (
          <div className="col-span-full text-center text-gray-500 font-mono text-sm py-10">
            <Power className="w-6 h-6 mx-auto mb-2 opacity-50" />
            No devices match "{searchTerm}"
          </div>
        )}
      </div>
    </div>
  );
};
