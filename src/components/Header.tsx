import React from 'react';
import { NavTab } from '../types';
import { Cpu, Lock } from 'lucide-react';

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isLoggedIn: boolean;
  onLogout: () => void;
  alarmCount: number;
  isLiveUpdating: boolean;
  setIsLiveUpdating: React.Dispatch<React.SetStateAction<boolean>>;
  currentUserEmail?: string;
  currentUserName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isLoggedIn,
  onLogout,
  alarmCount,
  isLiveUpdating,
  setIsLiveUpdating,
  currentUserEmail,
  currentUserName,
}) => {
  // Define tabs visible based on authentication state
  const tabs: NavTab[] = isLoggedIn
    ? [
        'REAL TIME DATA',
        'ALARM',
        'AUTOMATION',
        'GRAPH',
        'ESP32 CONFIG',
        'DHU CONTROL',
        'AUDIT LOG',
        'ALARM REPORT',
        'LOGOUT',
      ]
    : ['LOGIN'];

  const handleTabClick = (tab: NavTab) => {
    if (tab === 'LOGOUT') {
      if (window.confirm('Log out of BECS HVAC?')) {
        onLogout();
        setActiveTab('LOGIN');
      }
      return;
    }

    if (!isLoggedIn && tab !== 'LOGIN') {
      setActiveTab('LOGIN');
      return;
    }

    setActiveTab(tab);
  };

  return (
    <header className="w-full bg-[#05060b] border-b border-gray-800 px-3 py-2 select-none shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Navigation Tabs Bar */}
        <nav className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            const isLogout = tab === 'LOGOUT';

            if (isLogout && !isLoggedIn) return null;

            const isLockedTab = !isLoggedIn && tab !== 'LOGIN';

            return (
              <button
                key={tab}
                id={`nav-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => handleTabClick(tab)}
                disabled={isLockedTab}
                title={isLockedTab ? 'Login with Email required to view data' : ''}
                className={`relative px-3.5 py-2 text-xs md:text-sm font-black tracking-wider uppercase transition-all duration-200 border border-black/40 rounded-sm cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-slate-700 text-white border-blue-400 font-extrabold'
                    : isLockedTab
                    ? 'bg-[#151620] text-gray-500 border-gray-800 opacity-60 cursor-not-allowed'
                    : 'bg-[#0f1018] text-gray-300 hover:text-white hover:bg-[#1a1b2a] hover:border-gray-600'
                }`}
              >
                {isLockedTab && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                {tab === 'ALARM' && alarmCount > 0 && isLoggedIn && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] text-white font-bold">
                    {alarmCount}
                  </span>
                )}
                <span>{tab}</span>
              </button>
            );
          })}
        </nav>

        {/* System Controls & BECS Logo */}
        <div className="flex items-center gap-3">
          {/* Live Telemetry Toggle */}
          <button
            onClick={() => setIsLiveUpdating(!isLiveUpdating)}
            id="toggle-live-simulation-btn"
            title="Toggle Live Temperature & Humidity Telemetry Updates"
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded border transition-colors cursor-pointer ${
              isLiveUpdating
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600/60 hover:bg-emerald-900'
                : 'bg-amber-950/80 text-amber-400 border-amber-600/60 hover:bg-amber-900'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${isLiveUpdating ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}
            />
            <span>{isLiveUpdating ? 'LIVE TELEMETRY' : 'PAUSED'}</span>
          </button>

          {/* User Status */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#121320] border border-gray-800 rounded text-xs font-mono">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            {isLoggedIn ? (
              <div className="flex items-center gap-2">
                <span className="text-amber-300 font-bold max-w-[140px] truncate" title={currentUserEmail}>
                  {currentUserName || currentUserEmail}
                </span>
                <span className="text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50">
                  ACTIVE
                </span>
              </div>
            ) : (
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>UNAUTHENTICATED</span>
              </span>
            )}
          </div>

          {/* BECS Logo Badge */}
          <div className="flex items-center gap-1 bg-[#131525] border border-blue-900/60 px-2.5 py-1 rounded shadow-inner">
            <span className="text-sm font-black tracking-tighter text-gray-200 font-mono">BECS</span>
            <div className="flex flex-col gap-0.5 ml-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="System Normal"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Servo Active"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500" title="RS485 Modbus Connected"></div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
