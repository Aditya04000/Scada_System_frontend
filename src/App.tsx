/**
 * App.tsx
 * ---------------------------------------------------------------
 * The dashboard shell.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavTab, DeviceData, AlarmLog, AutomationLog, AutomationRule, UserRole, AuditLogEntry, HistoryDataPoint } from './types';
import { MAX_DEVICES } from './data/initialData';
import { signOut } from './data/userCredentials';
import { pollAllDevices, sendServoCommand, sendAutoAdjustMode, sendRelayCommand, scanSubnetForDevices, resolveDeviceTarget } from './services/esp32Api';
import {
  alarmsApi,
  auditApi,
  devicesApi,
  rulesApi,
  settingsApi,
  errorMessage,
  fireAndForget,
  isApiError,
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

// 24-hour history window in memory
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;
const HISTORY_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;  // Every 5 minutes
const HISTORY_WINDOW_HOURS = 24;
const TELEMETRY_POLL_INTERVAL_MS = 3000;

const AUDIT_PAGE_SIZE = 2000;
const AUTOMATION_LOG_LIMIT = 200;

const DEFAULT_SCAN_SUBNET = '192.168.137';
const SUBNET_SAVE_DEBOUNCE_MS = 600;
const LOAD_RETRY_MS = 15000;

type ThresholdKey = 'tempHigh' | 'tempLow' | 'humHigh' | 'humLow';

const THRESHOLD_KEYS: ThresholdKey[] = ['tempHigh', 'tempLow', 'humHigh', 'humLow'];

function isSavableSubnet(value: string): boolean {
  const raw = value.trim().replace(/\.$/, '');
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw)) return false;
  return raw.split('.').every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
}

function normalizeSubnet(value: string): string {
  return value.trim().replace(/\.$/, '');
}

function mergeServerDevice(fresh: DeviceData, local: DeviceData | undefined): DeviceData {
  if (!local) return fresh;
  return {
    ...fresh,
    tempReal: local.tempReal,
    humidityReal: local.humidityReal,
    isOnline: local.isOnline,
    lastUpdated: local.lastUpdated,
  };
}

function mergeFleet(previous: DeviceData[], fresh: DeviceData[]): DeviceData[] {
  if (previous.length === 0) return fresh;
  const byId = new Map(previous.map((d) => [d.id, d]));
  return fresh.map((d) => mergeServerDevice(d, byId.get(d.id)));
}

function mergeAlarms(previous: AlarmLog[], incoming: AlarmLog[]): AlarmLog[] {
  if (incoming.length === 0) return previous;
  const byId = new Map(incoming.map((a) => [a.id, a]));
  const replaced = previous.map((a) => byId.get(a.id) ?? a);
  for (const a of previous) byId.delete(a.id);
  const additions = incoming.filter((a) => byId.has(a.id));
  return additions.length > 0 ? [...additions, ...replaced] : replaced;
}

function groupHistory(points: HistoryDataPoint[]): Record<string, HistoryDataPoint[]> {
  const grouped: Record<string, HistoryDataPoint[]> = {};
  for (const point of points) {
    const bucket = grouped[point.device];
    if (bucket) bucket.push(point);
    else grouped[point.device] = [point];
  }
  for (const key of Object.keys(grouped)) {
    grouped[key]!.sort((a, b) => a.timestamp - b.timestamp);
  }
  return grouped;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('LOGIN');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('OPERATOR');

  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [isFleetLoaded, setIsFleetLoaded] = useState<boolean>(false);
  const [alarms, setAlarms] = useState<AlarmLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [deviceHistory, setDeviceHistory] = useState<Record<string, HistoryDataPoint[]>>({});
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [scanSubnet, setScanSubnet] = useState<string>(DEFAULT_SCAN_SUBNET);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);

  const lastHistorySampleRef = useRef<Record<string, number>>({});

  const [isLiveUpdating, setIsLiveUpdating] = useState<boolean>(true);
  const [selectedServoDevice, setSelectedServoDevice] = useState<DeviceData | null>(null);

  // CRITICAL: Track which devices are unreachable so we STOP polling them
  const unreachableDevicesRef = useRef<Set<string>>(new Set());

  const devicesRef = useRef<DeviceData[]>(devices);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  const scanSubnetRef = useRef<string>(scanSubnet);
  useEffect(() => {
    scanSubnetRef.current = scanSubnet;
  }, [scanSubnet]);

  const refreshDevices = useCallback(async () => {
    try {
      const fleet = await devicesApi.list();
      setDevices((prev) => mergeFleet(prev, fleet));
      setIsFleetLoaded(true);
    } catch (err) {
      console.error('[API] Could not refresh the device list:', errorMessage(err));
    }
  }, []);

  const refreshAlarms = useCallback(async () => {
    try {
      const { alarms: list } = await alarmsApi.list();
      setAlarms(list);
    } catch (err) {
      console.error('[API] Could not refresh the alarm list:', errorMessage(err));
    }
  }, []);

  const refreshAuditLog = useCallback(async () => {
    try {
      const { entries } = await auditApi.list({ limit: AUDIT_PAGE_SIZE });
      setAuditLogs(entries);
    } catch (err) {
      console.error('[API] Could not refresh the audit log:', errorMessage(err));
    }
  }, []);

  const refreshRules = useCallback(async () => {
    try {
      setAutomationRules(await rulesApi.list());
    } catch (err) {
      console.error('[API] Could not refresh the automation rules:', errorMessage(err));
    }
  }, []);

  const loadAll = useCallback(async (): Promise<boolean> => {
    // Skip audit log for OPERATOR - it's ADMIN only
    const skipAuditLog = currentUserRole === 'OPERATOR';

    const [fleetRes, alarmRes, auditRes, ruleRes, automationRes, historyRes, settingsRes] = await Promise.allSettled([
      devicesApi.list(),
      alarmsApi.list(),
      skipAuditLog ? Promise.resolve({ entries: [], total: 0 }) : auditApi.list({ limit: AUDIT_PAGE_SIZE }),
      rulesApi.list(),
      rulesApi.log({ limit: AUTOMATION_LOG_LIMIT }),
      devicesApi.history({ hours: HISTORY_WINDOW_HOURS }),
      settingsApi.get(),
    ]);

    let everythingLoaded = true;
    const note = (what: string, reason: unknown) => {
      everythingLoaded = false;
      console.error(`[API] Could not load ${what}:`, errorMessage(reason));
    };

    if (fleetRes.status === 'fulfilled') {
      const fleet = fleetRes.value;
      setDevices((prev) => mergeFleet(prev, fleet));
      setIsFleetLoaded(true);
      
      // CRITICAL: Only initialize history if device has REAL data
      const now = Date.now();
      const initialHistory: Record<string, HistoryDataPoint[]> = {};
      
      fleet.forEach((device) => {
        if (device.tempReal !== null && device.humidityReal !== null) {
          initialHistory[device.id] = [
            {
              time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: now,
              device: device.id,
              temperature: device.tempReal,
              humidity: device.humidityReal,
              hotServoAngle: device.hotValveAngle,
              coldServoAngle: device.coldValveAngle,
            },
          ];
        }
      });
      
      setDeviceHistory((prev) => ({
        ...prev,
        ...initialHistory,
      }));
    } else note('the device list', fleetRes.reason);

    if (alarmRes.status === 'fulfilled') setAlarms(alarmRes.value.alarms);
    else note('the alarm history', alarmRes.reason);

    if (auditRes.status === 'fulfilled') setAuditLogs(auditRes.value.entries);
    else note('the audit log', auditRes.reason);

    if (ruleRes.status === 'fulfilled') setAutomationRules(ruleRes.value);
    else note('the automation rules', ruleRes.reason);

    if (automationRes.status === 'fulfilled') setAutomationLogs(automationRes.value);
    else note('the automation history', automationRes.reason);

    if (historyRes.status === 'fulfilled') {
      const history = groupHistory(historyRes.value);
      setDeviceHistory((prev) => ({
        ...prev,
        ...history,
      }));
    } else note('the recorded telemetry', historyRes.reason);

    if (settingsRes.status === 'fulfilled') {
      setScanSubnet(settingsRes.value.scanSubnet);
      scanSubnetRef.current = settingsRes.value.scanSubnet;
      setAutoScanEnabled(settingsRes.value.autoScanEnabled);
    } else note('the installation settings', settingsRes.reason);

    return everythingLoaded;
  }, [currentUserRole]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    let timer: number | null = null;

    const attempt = async () => {
      const loaded = await loadAll();
      if (cancelled || loaded) return;
      timer = window.setTimeout(() => {
        void attempt();
      }, LOAD_RETRY_MS);
    };

    void attempt();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isLoggedIn, loadAll]);

  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'AUDIT LOG') return;
    if (currentUserRole === 'OPERATOR') return;
    void refreshAuditLog();
  }, [isLoggedIn, activeTab, refreshAuditLog, currentUserRole]);

  const clearSessionState = useCallback(() => {
    setIsLoggedIn(false);
    setCurrentUserEmail('');
    setCurrentUserName('');
    setCurrentUserRole('OPERATOR');
    setActiveTab('LOGIN');
    setDevices([]);
    setIsFleetLoaded(false);
    setAlarms([]);
    setAuditLogs([]);
    setAutomationLogs([]);
    setAutomationRules([]);
    setDeviceHistory({});
    setSelectedServoDevice(null);
    openBreachesRef.current = {};
    lastHistorySampleRef.current = {};
    didInitialScanRef.current = false;
    unreachableDevicesRef.current.clear();
  }, []);

  useEffect(() => {
    setIsLoggedIn(false);
    setActiveTab('LOGIN');
  }, []);

  useEffect(() => onAuthExpired(clearSessionState), [clearSessionState]);

  const handleLoginSuccess = (userEmail: string, role: UserRole, userName: string) => {
    setIsLoggedIn(true);
    setCurrentUserEmail(userEmail);
    setCurrentUserName(userName);
    setCurrentUserRole(role);
    setActiveTab('REAL TIME DATA');
  };

  const handleLogout = () => {
    fireAndForget(signOut(), 'sign out');
    clearSessionState();
  };

  const applyServerDevice = useCallback((fresh: DeviceData) => {
    setDevices((prev) => {
      const index = prev.findIndex((d) => d.id === fresh.id);
      if (index === -1) return [...prev, fresh];
      const next = [...prev];
      next[index] = mergeServerDevice(fresh, prev[index]);
      return next;
    });
  }, []);

  const persistDevice = useCallback(
    (deviceId: string, patch: DevicePatch, what: string) => {
      void (async () => {
        try {
          await devicesApi.update(deviceId, patch);
        } catch (err) {
          console.error(`[API] ${what} for ${deviceId} was not saved: ${errorMessage(err)}`);
        }
      })();
    },
    []
  );

  const handleUpdateDeviceName = (deviceId: string, newName: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, name: newName, lastUpdated: new Date().toLocaleTimeString() } : d))
    );
    persistDevice(deviceId, { name: newName }, 'Device name');
  };

  const handleUpdateDeviceRoom = (deviceId: string, newRoomName: string) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId ? { ...d, roomName: newRoomName, lastUpdated: new Date().toLocaleTimeString() } : d
      )
    );
    persistDevice(deviceId, { roomName: newRoomName }, 'Room name');
  };

  const handleUpdateDeviceIp = (deviceId: string, newIp: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, ipAddress: newIp, lastUpdated: new Date().toLocaleTimeString() } : d))
    );
    persistDevice(deviceId, { ipAddress: newIp.trim() || null }, 'IP address');
  };

  const handleUpdateDeviceHostname = (deviceId: string, newHostname: string) => {
    const trimmed = newHostname.trim().replace(/\.local$/, '');
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId ? { ...d, hostname: trimmed || undefined, lastUpdated: new Date().toLocaleTimeString() } : d
      )
    );
    persistDevice(deviceId, { hostname: trimmed || null }, 'Hostname');
  };

  const handleAddDevice = (name: string, roomName: string) => {
    if (currentUserRole !== 'ADMIN') return;
    if (devices.length >= MAX_DEVICES) return;

    void (async () => {
      try {
        const created = await devicesApi.create({
          name: name.trim() || undefined,
          roomName: roomName.trim() || 'Unassigned Room',
        });
        applyServerDevice(created);
      } catch (err) {
        console.error('[API] Could not add a device:', errorMessage(err));
      }
    })();
  };

  const handleRemoveDevice = (deviceId: string) => {
    if (currentUserRole !== 'ADMIN') return;
    const removed = devices.find((d) => d.id === deviceId);
    if (!removed) return;
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    void (async () => {
      try {
        await devicesApi.remove(deviceId);
      } catch (err) {
        console.error(`[API] Could not remove ${deviceId}:`, errorMessage(err));
      }
    })();
  };

  const [lastScanResult, setLastScanResult] = useState<{
    found: number;
    assigned: number;
    updated: number;
    messages: string[];
    timestamp: string;
    automatic: boolean;
  } | null>(null);
  const isScanningRef = useRef(false);
  const didInitialScanRef = useRef(false);

  const handleScanNetwork = useCallback(
    async (
      subnetPrefix: string,
      automatic = false
    ): Promise<{ found: number; assigned: number; updated: number; messages: string[] }> => {
      let found = [];
      try {
        found = await scanSubnetForDevices(subnetPrefix);
      } catch (err) {
        console.error('[SCAN] Error scanning subnet:', err);
        const result = { found: 0, assigned: 0, updated: 0, messages: ['Scan failed. Check the subnet and try again.'] };
        setLastScanResult({ ...result, timestamp: new Date().toLocaleTimeString(), automatic });
        return result;
      }
      
      const messages: string[] = [];
      let assigned = 0;
      let updated = 0;

      for (const scanned of found) {
        const mac = (scanned.telemetry.mac || '').toUpperCase();
        const reportedHostname = scanned.telemetry.hostname && scanned.telemetry.hostname.trim();
        
        if (!mac && !reportedHostname) {
          messages.push(`${scanned.ip} responded but sent no MAC or hostname — skipped.`);
          continue;
        }

        try {
          let deviceToUpdate = null;
          
          if (reportedHostname) {
            const hostnameMatch = devicesRef.current.find(
              (d) => d.hostname?.toLowerCase().replace(/\.local$/, '') === reportedHostname.toLowerCase().replace(/\.local$/, '')
            );
            if (hostnameMatch) {
              deviceToUpdate = hostnameMatch;
              console.log(`[SCAN] Matched by hostname: ${deviceToUpdate.id} → ${reportedHostname}`);
            }
          }
          
          if (!deviceToUpdate && mac) {
            const macMatch = devicesRef.current.find(
              (d) => d.macAddress?.toUpperCase() === mac
            );
            if (macMatch) {
              deviceToUpdate = macMatch;
              console.log(`[SCAN] Matched by MAC: ${deviceToUpdate.id} → ${mac}`);
            }
          }

          if (deviceToUpdate) {
            const patch: DevicePatch = {};
            
            if (!deviceToUpdate.hostname) {
              patch.ipAddress = scanned.ip;
            }
            
            if (scanned.telemetry.firmwareVersion) {
              patch.firmwareVersion = scanned.telemetry.firmwareVersion;
            }
            
            if (Object.keys(patch).length > 0) {
              const updatedDevice = await devicesApi.update(deviceToUpdate.id, patch);
              applyServerDevice(updatedDevice);
            }
            
            unreachableDevicesRef.current.delete(deviceToUpdate.id);
            
            updated++;
            messages.push(
              `${deviceToUpdate.id}: connected to ${reportedHostname ? reportedHostname + '.local' : scanned.ip}`
            );
          } else {
            const { device, claimed } = await devicesApi.bind({
              macAddress: mac,
              ipAddress: scanned.ip,
              hostname: reportedHostname || null,
              firmwareVersion: scanned.telemetry.firmwareVersion ?? null,
              pingMs: null,
            });
            applyServerDevice(device);

            if (claimed) {
              assigned++;
              messages.push(
                `New device ${device.id} found at ${scanned.ip}${reportedHostname ? ` (${reportedHostname}.local)` : ''}`
              );
            } else {
              updated++;
              messages.push(`${device.id}: IP refreshed to ${scanned.ip}`);
            }
          }
        } catch (err) {
          if (isApiError(err) && err.status === 409) {
            messages.push(`${scanned.ip} (MAC ${mac}) found, but no open Device slots left.`);
          } else {
            messages.push(`${scanned.ip} could not be saved: ${errorMessage(err)}`);
          }
        }
      }

      const result = { found: found.length, assigned, updated, messages };
      setLastScanResult({ ...result, timestamp: new Date().toLocaleTimeString(), automatic });

      fireAndForget(
        auditApi.record(
          'NETWORK_SCAN',
          subnetPrefix,
          `${automatic ? 'Automatic' : 'Manual'} scan of ${subnetPrefix}.x: ${found.length} device(s) responded, ${assigned} newly connected, ${updated} address(es) refreshed.`
        ),
        'record network scan'
      );

      return result;
    },
    [applyServerDevice]
  );

  const subnetSaveTimerRef = useRef<number | null>(null);

  const handleScanSubnetChange = useCallback((value: string) => {
    setScanSubnet(value);
    scanSubnetRef.current = value;
    if (subnetSaveTimerRef.current !== null) window.clearTimeout(subnetSaveTimerRef.current);
    if (!isSavableSubnet(value)) return;
    const normalized = normalizeSubnet(value);
    subnetSaveTimerRef.current = window.setTimeout(() => {
      subnetSaveTimerRef.current = null;
      fireAndForget(settingsApi.update({ scanSubnet: normalized }), 'save discovery subnet');
    }, SUBNET_SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (subnetSaveTimerRef.current !== null) window.clearTimeout(subnetSaveTimerRef.current);
    },
    []
  );

  const handleToggleDeviceOnline = (deviceId: string) => {
    let nextState = false;
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id === deviceId) {
          const nextOnline = !d.isOnline;
          nextState = nextOnline;
          return {
            ...d,
            isOnline: nextOnline,
            tempReal: nextOnline ? 24.5 : null,
            humidityReal: nextOnline ? 50.0 : null,
            lastUpdated: new Date().toLocaleTimeString(),
          };
        }
        return d;
      })
    );
    fireAndForget(
      auditApi.record('DEVICE_ONLINE_TOGGLED', deviceId, `Display state set to ${nextState ? 'ONLINE' : 'OFFLINE'}.`),
      'record online toggle'
    );
  };

  const handleUpdateDeviceThresholds = (
    deviceId: string,
    field: 'tempMax' | 'tempMin' | 'humidityMax' | 'humidityMin',
    value: number
  ) => {
    const rounded = Number(value.toFixed(1));
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              [field]: rounded,
              lastUpdated: new Date().toLocaleTimeString(),
            }
          : d
      )
    );
    const patch: DevicePatch =
      field === 'tempMax'
        ? { tempMax: rounded }
        : field === 'tempMin'
          ? { tempMin: rounded }
          : field === 'humidityMax'
            ? { humidityMax: rounded }
            : { humidityMin: rounded };
    persistDevice(deviceId, patch, 'Threshold');
  };

  const handleToggleAutoAdjust = (deviceId: string, enabled: boolean) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id === deviceId) {
          return { ...d, autoAdjustEnabled: enabled, lastUpdated: new Date().toLocaleTimeString() };
        }
        return d;
      })
    );

    if (selectedServoDevice && selectedServoDevice.id === deviceId) {
      setSelectedServoDevice((prev) => (prev ? { ...prev, autoAdjustEnabled: enabled } : null));
    }

    persistDevice(deviceId, { autoAdjustEnabled: enabled }, 'Auto-PID mode');

    const device = devices.find((d) => d.id === deviceId);
    if (device?.ipAddress || device?.hostname) {
      sendAutoAdjustMode(resolveDeviceTarget(device), enabled).catch((err) =>
        console.warn(`[ESP32] Failed to set auto-adjust mode on ${deviceId}:`, err.message)
      );
    }
  };

  const recordAutomation = useCallback(async (input: AutomationLogInput) => {
    try {
      const log = await rulesApi.recordLog(input);
      setAutomationLogs((prev) => [log, ...prev].slice(0, AUTOMATION_LOG_LIMIT));
    } catch (err) {
      console.error(`[API] Could not record the automation event for ${input.device}:`, errorMessage(err));
    }
  }, []);

  const handleToggleRelay = (deviceId: string, relay: 'AHU' | 'DHU1' | 'DHU2') => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    const field = relay === 'AHU' ? 'ahuPowerOn' : relay === 'DHU1' ? 'dhu1On' : 'dhu2On';
    const nextOn = !device[field];

    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId ? { ...d, [field]: nextOn, lastUpdated: new Date().toLocaleTimeString() } : d
      )
    );

    if (selectedServoDevice && selectedServoDevice.id === deviceId) {
      setSelectedServoDevice((prev) => (prev ? { ...prev, [field]: nextOn } : null));
    }

    const relayPatch: DevicePatch =
      relay === 'AHU' ? { ahuPowerOn: nextOn } : relay === 'DHU1' ? { dhu1On: nextOn } : { dhu2On: nextOn };
    persistDevice(deviceId, relayPatch, 'Relay state');

    const relayLabel = relay === 'AHU' ? 'AHU Power' : relay === 'DHU1' ? 'DHU 1' : 'DHU 2';
    const actorName = currentUserName || currentUserEmail || 'Unknown User';
    void recordAutomation({
      device: deviceId,
      parameter: relay === 'AHU' ? 'Device Power' : 'Humidity Control',
      anglePercent: nextOn ? 'ON' : 'OFF',
      triggerReason: `${actorName}: ${relayLabel} ${nextOn ? 'ON' : 'OFF'}`,
      isAutomatic: false,
    });

    if (device.ipAddress || device.hostname) {
      sendRelayCommand(resolveDeviceTarget(device), relay, nextOn).catch((err) =>
        console.warn(`[ESP32] Failed to set ${relay} relay on ${deviceId}:`, err.message)
      );
    }
  };

  const handleUpdateServoValve = (
    deviceId: string,
    type: 'hot' | 'cold',
    percent: 0 | 25 | 50 | 75 | 100
  ) => {
    const angle = (percent / 100) * 180;

    setDevices((prev) =>
      prev.map((d) => {
        if (d.id === deviceId) {
          const updated = { ...d };
          if (type === 'hot') {
            updated.hotValvePercent = percent;
            updated.hotValveAngle = angle;
          } else {
            updated.coldValvePercent = percent;
            updated.coldValveAngle = angle;
          }
          updated.lastUpdated = new Date().toLocaleTimeString();
          return updated;
        }
        return d;
      })
    );

    if (selectedServoDevice && selectedServoDevice.id === deviceId) {
      setSelectedServoDevice((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          hotValvePercent: type === 'hot' ? percent : prev.hotValvePercent,
          hotValveAngle: type === 'hot' ? angle : prev.hotValveAngle,
          coldValvePercent: type === 'cold' ? percent : prev.coldValvePercent,
          coldValveAngle: type === 'cold' ? angle : prev.coldValveAngle,
        };
      });
    }

    persistDevice(
      deviceId,
      type === 'hot'
        ? { hotValvePercent: percent, hotValveAngle: angle }
        : { coldValvePercent: percent, coldValveAngle: angle },
      'Valve position'
    );

    const actorName = currentUserName || currentUserEmail || 'Unknown User';
    void recordAutomation({
      device: deviceId,
      parameter: type === 'hot' ? 'Hot Supply Motor' : 'Cold Supply Motor',
      anglePercent: `${percent}% (${angle}°)`,
      triggerReason: `${actorName}: Manual Adjustment`,
      isAutomatic: false,
    });

    const device = devices.find((d) => d.id === deviceId);
    if (device?.ipAddress || device?.hostname) {
      sendServoCommand(resolveDeviceTarget(device), type, percent).catch((err) =>
        console.warn(`[ESP32] Failed to send servo command to ${deviceId}:`, err.message)
      );
    }
  };

  const handleAddRule = (newRule: Omit<AutomationRule, 'id'>) => {
    if (currentUserRole !== 'ADMIN') return;
    void (async () => {
      try {
        const rule = await rulesApi.create({
          device: newRule.device,
          parameter: newRule.parameter,
          condition: newRule.condition,
          threshold: newRule.threshold,
          targetSupply: newRule.targetSupply,
          targetValvePercent: newRule.targetValvePercent,
          enabled: newRule.enabled,
        });
        setAutomationRules((prev) => [...prev, rule]);
      } catch (err) {
        console.error('[API] Could not create the rule:', errorMessage(err));
      }
    })();
  };

  const handleDeleteRule = (id: string) => {
    if (currentUserRole !== 'ADMIN') return;
    setAutomationRules((prev) => prev.filter((r) => r.id !== id));
    void (async () => {
      try {
        await rulesApi.remove(id);
      } catch (err) {
        console.error(`[API] Could not delete rule ${id}:`, errorMessage(err));
        await refreshRules();
      }
    })();
  };

  const handleToggleRule = (id: string) => {
    if (currentUserRole !== 'ADMIN') return;
    const rule = automationRules.find((r) => r.id === id);
    if (!rule) return;
    const next = !rule.enabled;
    setAutomationRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)));
    void (async () => {
      try {
        await rulesApi.update(id, { enabled: next });
      } catch (err) {
        console.error(`[API] Could not toggle rule ${id}:`, errorMessage(err));
        await refreshRules();
      }
    })();
  };

  const handleAcknowledgeAlarm = (id: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
    void (async () => {
      try {
        const saved = await alarmsApi.acknowledge(id);
        setAlarms((prev) => mergeAlarms(prev, [saved]));
      } catch (err) {
        console.error(`[API] Could not acknowledge alarm ${id}:`, errorMessage(err));
        await refreshAlarms();
      }
    })();
  };

  const handleAcknowledgeAll = () => {
    setAlarms((prev) =>
      prev.map((a) => (a.acknowledged ? a : { ...a, acknowledged: true }))
    );
    void (async () => {
      try {
        const saved = await alarmsApi.acknowledgeAll();
        setAlarms((prev) => mergeAlarms(prev, saved));
      } catch (err) {
        console.error('[API] Could not acknowledge all alarms:', errorMessage(err));
        await refreshAlarms();
      }
    })();
  };

  const handleDeleteAlarm = (id: string) => {
    if (currentUserRole !== 'ADMIN') return;
    setAlarms((prev) => prev.filter((a) => a.id !== id));
    void (async () => {
      try {
        await alarmsApi.remove(id);
      } catch (err) {
        console.error(`[API] Could not delete alarm ${id}:`, errorMessage(err));
        await refreshAlarms();
      }
    })();
  };

  const openBreachesRef = useRef<Record<string, Record<ThresholdKey, boolean>>>({});

  const raiseAlarm = useCallback(async (input: RaiseAlarmInput & { breachKey: ThresholdKey }) => {
    try {
      const existingAlarm = alarms.find(
        (a) => a.device === input.device && 
               a.parameter === input.parameter && 
               a.category === 'REALTIME'
      );
      
      if (existingAlarm) {
        console.log(`[ALARM] Active alarm already exists for ${input.device} ${input.parameter}, skipping duplicate`);
        return;
      }
      
      const { alarm, created } = await alarmsApi.raise(input);
      setAlarms((prev) => mergeAlarms(prev, [alarm]));
    } catch (err) {
      const state = openBreachesRef.current[input.device];
      if (state) state[input.breachKey] = false;
      console.error(`[API] Could not raise ${input.alarmName} for ${input.device}:`, errorMessage(err));
    }
  }, [alarms]);

  const clearAlarms = useCallback(async (device: string, breachKey?: ThresholdKey) => {
    try {
      const closed = await alarmsApi.resolve(device, breachKey);
      setAlarms((prev) => mergeAlarms(prev, closed));
    } catch (err) {
      const state = openBreachesRef.current[device];
      if (state) {
        if (breachKey) state[breachKey] = true;
        else for (const key of THRESHOLD_KEYS) state[key] = true;
      }
      console.error(`[API] Could not clear alarms for ${device}:`, errorMessage(err));
    }
  }, []);

  const pollInFlightRef = useRef(false);

  // SIMPLE SENSOR-ONLY POLLING - NEVER TOUCHES CONTROL FIELDS
  useEffect(() => {
    if (!isLiveUpdating || !isLoggedIn) return;
    let cancelled = false;

    const pollHardware = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const currentDevices = devicesRef.current;
        if (currentDevices.length === 0) return;

        // Only poll devices NOT in unreachable list
        const devicesToPoll = currentDevices.filter(
          (d) => !unreachableDevicesRef.current.has(d.id)
        );

        if (devicesToPoll.length === 0) return;

        const merged = await pollAllDevices(devicesToPoll);
        if (cancelled) return;

        const nowDate = new Date();

        const automationIntents: AutomationLogInput[] = [];
        const raiseIntents: Array<RaiseAlarmInput & { breachKey: ThresholdKey }> = [];
        const clearIntents: Array<{ device: string; breachKey?: ThresholdKey }> = [];
        const historySamples: HistorySample[] = [];
        const valvePatches: Array<{ device: string; patch: DevicePatch }> = [];

        const patches: Record<string, Partial<DeviceData>> = {};
        const newHistoryPoints: Record<string, HistoryDataPoint> = {};

        devicesToPoll.forEach((prevDev) => {
          const fresh = merged.find((m) => m.id === prevDev.id);
          if (!fresh) return;

          const deviceId = prevDev.id;

          if (!fresh.isOnline) {
            unreachableDevicesRef.current.add(deviceId);
            patches[deviceId] = { 
              tempReal: null, 
              humidityReal: null 
            };
          } else {
            unreachableDevicesRef.current.delete(deviceId);
            patches[deviceId] = {
              isOnline: true,
              tempReal: fresh.tempReal,
              humidityReal: fresh.humidityReal,
              macAddress: fresh.macAddress,
              firmwareVersion: fresh.firmwareVersion,
              lastUpdated: fresh.lastUpdated,
              // DO NOT update control fields from polling:
              // hotValvePercent, coldValvePercent, hotValveAngle, coldValveAngle,
              // autoAdjustEnabled, ahuPowerOn, dhu1On, dhu2On
            };
          }

          const currentPatch = patches[deviceId]!;
          const currentTemp = currentPatch.tempReal ?? null;
          const currentHum = currentPatch.humidityReal ?? null;
          const isReporting = fresh.isOnline && currentTemp !== null && currentHum !== null;

          if (!isReporting) {
            return;
          }

          const matchingRules = automationRules.filter((r) => r.enabled && r.device === deviceId);

          matchingRules.forEach((rule) => {
            const sensorVal = rule.parameter === 'Temperature' ? currentTemp! : currentHum!;
            const triggered =
              rule.condition === 'GREATER_THAN' ? sensorVal > rule.threshold : sensorVal < rule.threshold;
            if (!triggered) return;

            const isHot = rule.targetSupply === 'HOT';
            const currentPercent = isHot ? prevDev.hotValvePercent : prevDev.coldValvePercent;
            if (currentPercent === rule.targetValvePercent) return;

            const newAngle = (rule.targetValvePercent / 100) * 180;
            
            if (isHot) {
              patches[deviceId] = {
                ...patches[deviceId],
                hotValvePercent: rule.targetValvePercent,
                hotValveAngle: newAngle,
              };
            } else {
              patches[deviceId] = {
                ...patches[deviceId],
                coldValvePercent: rule.targetValvePercent,
                coldValveAngle: newAngle,
              };
            }

            if (prevDev.ipAddress || prevDev.hostname) {
              sendServoCommand(resolveDeviceTarget(prevDev), isHot ? 'hot' : 'cold', rule.targetValvePercent).catch(
                (err) => console.warn(`[ESP32] Auto-rule command failed for ${deviceId}:`, err.message)
              );
            }

            valvePatches.push({
              device: deviceId,
              patch: isHot
                ? { hotValvePercent: rule.targetValvePercent, hotValveAngle: newAngle }
                : { coldValvePercent: rule.targetValvePercent, coldValveAngle: newAngle },
            });

            automationIntents.push({
              device: deviceId,
              parameter: isHot ? 'Hot Supply Motor' : 'Cold Supply Motor',
              anglePercent: `${rule.targetValvePercent}% (${newAngle}°)`,
              triggerReason: `Auto Rule: ${rule.parameter} ${rule.condition === 'GREATER_THAN' ? '>' : '<'} ${rule.threshold}`,
              isAutomatic: true,
              ruleId: rule.id,
              occurredAt: nowDate.getTime(),
            });
          });

          const breachState: Record<ThresholdKey, boolean> =
            openBreachesRef.current[deviceId] || { tempHigh: false, tempLow: false, humHigh: false, humLow: false };
          openBreachesRef.current[deviceId] = breachState;

          const evaluate = (
            key: ThresholdKey,
            isBreached: boolean,
            alarmName: string,
            parameter: AlarmLog['parameter'],
            lowHigh: AlarmLog['lowHigh'],
            value: string
          ) => {
            if (isBreached && !breachState[key]) {
              breachState[key] = true;
              raiseIntents.push({
                device: deviceId,
                alarmName,
                parameter,
                lowHigh,
                value,
                breachKey: key,
                ipAddress: prevDev.ipAddress || null,
                occurredAt: nowDate.getTime(),
              });
            } else if (!isBreached && breachState[key]) {
              breachState[key] = false;
              clearIntents.push({ device: deviceId, breachKey: key });
            }
          };

          evaluate(
            'tempHigh',
            currentTemp! > prevDev.tempMax,
            'TEMPERATURE HIGH LIMIT EXCEEDED',
            'Temperature',
            'High',
            `${currentTemp} °C (Max ${prevDev.tempMax} °C)`
          );
          evaluate(
            'tempLow',
            currentTemp! < prevDev.tempMin,
            'TEMPERATURE LOW LIMIT EXCEEDED',
            'Temperature',
            'Low',
            `${currentTemp} °C (Min ${prevDev.tempMin} °C)`
          );
          evaluate(
            'humHigh',
            currentHum! > prevDev.humidityMax,
            'HUMIDITY HIGH LIMIT EXCEEDED',
            'Humidity',
            'High',
            `${currentHum} % (Max ${prevDev.humidityMax} %)`
          );
          evaluate(
            'humLow',
            currentHum! < prevDev.humidityMin,
            'HUMIDITY LOW LIMIT EXCEEDED',
            'Humidity',
            'Low',
            `${currentHum} % (Min ${prevDev.humidityMin} %)`
          );

          // CRITICAL: Record history every 5 minutes for proper graph
          const lastSample = lastHistorySampleRef.current[deviceId] || 0;
          if (nowDate.getTime() - lastSample >= HISTORY_SAMPLE_INTERVAL_MS && currentTemp !== null && currentHum !== null) {
            lastHistorySampleRef.current[deviceId] = nowDate.getTime();
            // Use ESP32-reported angles for history (real data)
            // NOT the user-controlled values
            newHistoryPoints[deviceId] = {
              time: nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: nowDate.getTime(),
              device: deviceId,
              temperature: currentTemp,
              humidity: currentHum,
              hotServoAngle: fresh.hotValveAngle,  // REAL ESP32 angle
              coldServoAngle: fresh.coldValveAngle, // REAL ESP32 angle
            };
            historySamples.push({
              device: deviceId,
              temperature: currentTemp,
              humidity: currentHum,
              hotServoAngle: fresh.hotValveAngle,
              coldServoAngle: fresh.coldValveAngle,
              recordedAt: nowDate.getTime(),
            });
          }
        });

        if (cancelled) return;

        setDevices((prev) => prev.map((pd) => (patches[pd.id] ? { ...pd, ...patches[pd.id] } : pd)));

        if (Object.keys(newHistoryPoints).length) {
          const cutoff = nowDate.getTime() - HISTORY_RETENTION_MS;
          setDeviceHistory((prev) => {
            const next: Record<string, HistoryDataPoint[]> = { ...prev };
            Object.entries(newHistoryPoints).forEach(([deviceId, point]) => {
              const existing = (next[deviceId] || []).filter((p) => p.timestamp >= cutoff);
              next[deviceId] = [...existing, point];
            });
            return next;
          });
        }

        await Promise.all([
          ...raiseIntents.map((intent) => raiseAlarm(intent)),
          ...clearIntents.map((intent) => clearAlarms(intent.device, intent.breachKey)),
          ...automationIntents.map((intent) => recordAutomation(intent)),
          ...valvePatches.map(async ({ device, patch }) => {
            try {
              await devicesApi.update(device, patch);
            } catch (err) {
              console.error(`[API] Could not store the auto-rule valve position for ${device}:`, errorMessage(err));
            }
          }),
          historySamples.length > 0
            ? devicesApi.recordHistory(historySamples).catch((err) => {
                console.error('[API] Could not record telemetry history:', errorMessage(err));
              })
            : Promise.resolve(),
        ]);
      } finally {
        pollInFlightRef.current = false;
      }
    };

    void pollHardware();
    const interval = setInterval(() => {
      void pollHardware();
    }, TELEMETRY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveUpdating, isLoggedIn, automationRules]);

  const unackAlarmCount = alarms.filter((a) => !a.acknowledged && a.category === 'REALTIME').length;

  return (
    <div className="min-h-screen w-full bg-[#12131a] flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isLoggedIn={isLoggedIn}
        onLogout={handleLogout}
        alarmCount={unackAlarmCount}
        isLiveUpdating={isLiveUpdating}
        setIsLiveUpdating={setIsLiveUpdating}
        currentUserEmail={currentUserEmail}
        currentUserName={currentUserName}
      />

      <main className="flex-1 w-full overflow-y-auto">
        {!isLoggedIn || activeTab === 'LOGIN' ? (
          <LoginView
            onLoginSuccess={handleLoginSuccess}
            setActiveTab={setActiveTab}
            isLoggedIn={isLoggedIn}
            currentUserEmail={currentUserEmail}
            onLogout={handleLogout}
          />
        ) : (
          <>
            {activeTab === 'REAL TIME DATA' && (
              <RealTimeDataView
                devices={devices}
                userRole={currentUserRole}
                onUpdateDeviceName={handleUpdateDeviceName}
                onUpdateDeviceRoom={handleUpdateDeviceRoom}
                onUpdateDeviceThresholds={handleUpdateDeviceThresholds}
                onToggleDeviceOnline={handleToggleDeviceOnline}
              />
            )}

            {activeTab === 'ESP32 CONFIG' && (
              <Esp32ConfigView
                devices={devices}
                userRole={currentUserRole}
                onUpdateDeviceIp={handleUpdateDeviceIp}
                onUpdateDeviceName={handleUpdateDeviceName}
                onUpdateDeviceHostname={handleUpdateDeviceHostname}
                onToggleAutoAdjust={handleToggleAutoAdjust}
                onToggleDeviceOnline={handleToggleDeviceOnline}
                onScanNetwork={handleScanNetwork}
                lastScanResult={lastScanResult}
                isAutoScanEnabled={autoScanEnabled}
                onAddDevice={handleAddDevice}
                onRemoveDevice={handleRemoveDevice}
                maxDevices={MAX_DEVICES}
                scanSubnet={scanSubnet}
                onScanSubnetChange={handleScanSubnetChange}
              />
            )}

            {activeTab === 'DHU CONTROL' && (
              <DhuControlView devices={devices} onToggleRelay={handleToggleRelay} />
            )}

            {activeTab === 'AUDIT LOG' && (
              <AuditLogView auditLogs={auditLogs} userRole={currentUserRole} />
            )}

            {activeTab === 'AUTOMATION' && (
              <AutomationView
                devices={devices}
                userRole={currentUserRole}
                onUpdateServoValve={handleUpdateServoValve}
                onOpenServoModal={(dev) => setSelectedServoDevice(dev)}
                automationRules={automationRules}
                onAddRule={handleAddRule}
                onDeleteRule={handleDeleteRule}
                onToggleRule={handleToggleRule}
                onToggleAutoAdjust={handleToggleAutoAdjust}
              />
            )}

            {activeTab === 'ALARM' && (
              <AlarmView
                alarms={alarms}
                onAcknowledgeAlarm={handleAcknowledgeAlarm}
                onAcknowledgeAll={handleAcknowledgeAll}
                onDeleteAlarm={handleDeleteAlarm}
                onNavigateToReport={() => setActiveTab('ALARM REPORT')}
              />
            )}

            {activeTab === 'GRAPH' && <GraphView devices={devices} deviceHistory={deviceHistory} />}

            {activeTab === 'ALARM REPORT' && (
              <AlarmReportView alarms={alarms} devices={devices} generatedBy={currentUserName || currentUserEmail} />
            )}
          </>
        )}
      </main>

      {selectedServoDevice && (
        <ServoVisualizerModal
          device={selectedServoDevice}
          onClose={() => setSelectedServoDevice(null)}
          onUpdateServoValve={handleUpdateServoValve}
          onToggleAutoAdjust={handleToggleAutoAdjust}
        />
      )}
    </div>
  );
}