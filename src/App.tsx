import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavTab, DeviceData, AlarmLog, AutomationLog, AutomationRule, UserRole, AuditLogEntry, HistoryDataPoint } from './types';
import { MAX_DEVICES } from './data/initialData';
import { signOut } from './data/userCredentials';

import { 
  pollAllDevices, 
  sendServoCommand, 
  sendAutoAdjustMode, 
  sendRelayCommand,
  resolveDeviceTarget
} from './services/esp32Api';

import {
  alarmsApi,
  auditApi,
  devicesApi,
  rulesApi,
  settingsApi,
  errorMessage,
  fireAndForget,
  onAuthExpired,
  type AutomationLogInput,
  type DevicePatch,
  type HistorySample,
  type RaiseAlarmInput,
} from './services/api';

import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { RealTimeDataView } from './components/RealTimeDataView';
import { AutomationView } from './components/AutomationView';
import { AlarmView } from './components/AlarmView';
import { GraphView } from './components/GraphView';
import { AlarmReportView } from './components/AlarmReportView';
import { Esp32ConfigView } from './components/Esp32ConfigView';
import { DhuControlView } from './components/DhuControlView';
import { AuditLogView } from './components/AuditLogView';
import { ServoVisualizerModal } from './components/ServoVisualizerModal';

const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;
const HISTORY_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;  
const TELEMETRY_POLL_INTERVAL_MS = 4000; 
const ALARM_PERSIST_DELAY_MS = 60_000;

const SESSION_STORAGE_KEY = 'ctrl_hvac_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type ThresholdKey = 'tempHigh' | 'tempLow' | 'humHigh' | 'humLow';
const THRESHOLD_KEYS: ThresholdKey[] = ['tempHigh', 'tempLow', 'humHigh', 'humLow'];

type PersistedSession = { email: string; role: UserRole; name: string; loginTime: number; };

function readPersistedSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (!parsed?.email || !parsed?.loginTime) return null;
    if (Date.now() - parsed.loginTime > SESSION_MAX_AGE_MS) return null;
    return { email: parsed.email, role: (parsed.role as UserRole) || 'OPERATOR', name: parsed.name || parsed.email, loginTime: parsed.loginTime };
  } catch { return null; }
}

function writePersistedSession(session: PersistedSession) {
  try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session)); } catch {}
}

function clearPersistedSession() {
  try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
}

function mergeFleet(previous: DeviceData[], fresh: DeviceData[]): DeviceData[] {
  if (previous.length === 0) return fresh;
  const byId = new Map(previous.map((d) => [d.id, d]));
  return fresh.map((d) => {
    const local = byId.get(d.id);
    if (!local) return d;
    return { ...d, tempReal: local.tempReal, humidityReal: local.humidityReal, isOnline: local.isOnline };
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('LOGIN');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('OPERATOR');

  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [alarms, setAlarms] = useState<AlarmLog[]>([]);
  const [deviceHistory, setDeviceHistory] = useState<Record<string, HistoryDataPoint[]>>({});
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);

  const [isLiveUpdating, setIsLiveUpdating] = useState<boolean>(true);
  const [selectedServoDevice, setSelectedServoDevice] = useState<DeviceData | null>(null);

  const devicesRef = useRef<DeviceData[]>(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const loadAll = useCallback(async () => {
    try {
      const fleet = await devicesApi.list();
      setDevices(fleet);
      const rules = await rulesApi.list();
      setAutomationRules(rules);
      const { alarms: list } = await alarmsApi.list();
      setAlarms(list);
    } catch (err) {
      console.error('Failed to load initial data', err);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    void loadAll();
  }, [isLoggedIn, loadAll]);

  useEffect(() => {
    const persisted = readPersistedSession();
    if (!persisted) { setIsLoggedIn(false); setActiveTab('LOGIN'); return; }
    setCurrentUserEmail(persisted.email); setCurrentUserName(persisted.name);
    setCurrentUserRole(persisted.role); setIsLoggedIn(true); setActiveTab('REAL TIME DATA');
  }, []);

  const handleLoginSuccess = (email: string, role: UserRole, name: string) => {
    writePersistedSession({ email, role, name, loginTime: Date.now() });
    setIsLoggedIn(true); setCurrentUserEmail(email); setCurrentUserName(name);
    setCurrentUserRole(role); setActiveTab('REAL TIME DATA');
  };

  const handleLogout = () => {
    fireAndForget(signOut(), 'sign out');
    clearPersistedSession(); setIsLoggedIn(false); setActiveTab('LOGIN'); setDevices([]);
  };

  // ---------------------------------------------------------
  // TELEMETRY POLLING (Fetches from Render)
  // ---------------------------------------------------------
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    if (!isLiveUpdating || !isLoggedIn) return;
    let cancelled = false;

    const pollHardware = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const currentDevices = devicesRef.current;
        if (currentDevices.length === 0) return;

        const merged = await pollAllDevices(currentDevices);
        if (cancelled) return;

        const patches: Record<string, Partial<DeviceData>> = {};
        
        currentDevices.forEach((prevDev) => {
          const fresh = merged.find((m) => m.id === prevDev.id);
          if (!fresh || !fresh.isOnline) {
            patches[prevDev.id] = { isOnline: false, tempReal: null, humidityReal: null };
          } else {
            patches[prevDev.id] = { 
              isOnline: true, 
              tempReal: fresh.tempReal, 
              humidityReal: fresh.humidityReal,
              ahuPowerOn: fresh.ahuPowerOn,
              dhu1On: fresh.dhu1On,
              dhu2On: fresh.dhu2On,
            };
          }
        });

        if (cancelled) return;
        setDevices((prev) => prev.map((pd) => (patches[pd.id] ? { ...pd, ...patches[pd.id] } : pd)));

      } finally {
        pollInFlightRef.current = false;
      }
    };

    void pollHardware();
    const interval = setInterval(() => { void pollHardware(); }, TELEMETRY_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isLiveUpdating, isLoggedIn]);

  // ---------------------------------------------------------
  // COMMANDS (Sends to Render)
  // ---------------------------------------------------------
  const handleToggleRelay = async (deviceId: string, relay: 'AHU' | 'DHU1' | 'DHU2') => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    const field = relay === 'AHU' ? 'ahuPowerOn' : relay === 'DHU1' ? 'dhu1On' : 'dhu2On';
    const nextOn = !device[field];

    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, [field]: nextOn } : d)));
    
    await sendRelayCommand(resolveDeviceTarget(device), relay, nextOn, device.id);
  };

  const handleUpdateServoValve = async (deviceId: string, type: 'hot' | 'cold', percent: any) => {
    const angle = (percent / 100) * 180;
    setDevices((prev) => prev.map((d) => {
      if (d.id === deviceId) {
        const updated = { ...d };
        if (type === 'hot') { updated.hotValvePercent = percent; updated.hotValveAngle = angle; }
        else { updated.coldValvePercent = percent; updated.coldValveAngle = angle; }
        return updated;
      }
      return d;
    }));

    const device = devices.find((d) => d.id === deviceId);
    if (device) await sendServoCommand(resolveDeviceTarget(device), type, percent, device.id);
  };

  const handleToggleAutoAdjust = async (deviceId: string, enabled: boolean) => {
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, autoAdjustEnabled: enabled } : d)));
    const device = devices.find((d) => d.id === deviceId);
    if (device) await sendAutoAdjustMode(resolveDeviceTarget(device), enabled, device.id);
  };

  const unackAlarmCount = alarms.filter((a) => !a.acknowledged && a.category === 'REALTIME').length;

  return (
    <div className="min-h-screen w-full bg-[#12131a] flex flex-col font-sans">
      <Header
        activeTab={activeTab} setActiveTab={setActiveTab} isLoggedIn={isLoggedIn} onLogout={handleLogout}
        alarmCount={unackAlarmCount} isLiveUpdating={isLiveUpdating} setIsLiveUpdating={setIsLiveUpdating}
        currentUserEmail={currentUserEmail} currentUserName={currentUserName}
      />
      <main className="flex-1 w-full overflow-y-auto">
        {!isLoggedIn || activeTab === 'LOGIN' ? (
          <LoginView onLoginSuccess={handleLoginSuccess} setActiveTab={setActiveTab} isLoggedIn={isLoggedIn} currentUserEmail={currentUserEmail} onLogout={handleLogout} />
        ) : (
          <>
            {activeTab === 'REAL TIME DATA' && <RealTimeDataView devices={devices} userRole={currentUserRole} onUpdateDeviceName={() => {}} onUpdateDeviceRoom={() => {}} onUpdateDeviceThresholds={() => {}} onToggleDeviceOnline={() => {}} />}
            {activeTab === 'ESP32 CONFIG' && <Esp32ConfigView devices={devices} userRole={currentUserRole} onUpdateDeviceIp={() => {}} onToggleAutoAdjust={handleToggleAutoAdjust} onToggleDeviceOnline={() => {}} onScanNetwork={async () => ({ found: 0, assigned: 0, updated: 0, messages: [] })} />}
            {activeTab === 'DHU CONTROL' && <DhuControlView devices={devices} onToggleRelay={handleToggleRelay} />}
            {activeTab === 'AUDIT LOG' && <AuditLogView auditLogs={[]} userRole={currentUserRole} />}
            {activeTab === 'AUTOMATION' && <AutomationView devices={devices} userRole={currentUserRole} onUpdateServoValve={handleUpdateServoValve} onOpenServoModal={(dev) => setSelectedServoDevice(dev)} automationRules={automationRules} onAddRule={() => {}} onDeleteRule={() => {}} onToggleRule={() => {}} onToggleAutoAdjust={handleToggleAutoAdjust} />}
            {activeTab === 'ALARM' && <AlarmView alarms={alarms} onAcknowledgeAlarm={() => {}} onAcknowledgeAll={() => {}} onDeleteAlarm={() => {}} onNavigateToReport={() => setActiveTab('ALARM REPORT')} />}
            {activeTab === 'GRAPH' && <GraphView devices={devices} deviceHistory={deviceHistory} />}
            {activeTab === 'ALARM REPORT' && <AlarmReportView alarms={alarms} devices={devices} generatedBy={currentUserName || currentUserEmail} />}
          </>
        )}
      </main>
      {selectedServoDevice && (
        <ServoVisualizerModal device={selectedServoDevice} onClose={() => setSelectedServoDevice(null)} onUpdateServoValve={handleUpdateServoValve} onToggleAutoAdjust={handleToggleAutoAdjust} />
      )}
    </div>
  );
}