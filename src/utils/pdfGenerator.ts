import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlarmLog, AutomationLog, DeviceData } from '../types';

// ---------------------------------------------------------------
// Shared header/footer — plain black/white/gray only. Industrial
// document style, not a marketing/designer look.
// ---------------------------------------------------------------

const BLACK: [number, number, number] = [0, 0, 0];
const DARK_GRAY: [number, number, number] = [60, 60, 60];
const MID_GRAY: [number, number, number] = [110, 110, 110];
const LINE_GRAY: [number, number, number] = [180, 180, 180];
const ROW_ALT_GRAY: [number, number, number] = [240, 240, 240];

function drawReportHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  docRefPrefix: string,
  generatedBy: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Plain bordered box in place of a logo — no color fill.
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  doc.rect(14, 10, 24, 14);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BECS', 26, 18.5, { align: 'center' });

  // Title + subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 44, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK_GRAY);
  doc.text(subtitle, 44, 21.5);

  // Right-aligned meta block
  const now = new Date();
  const docRef = `${docRefPrefix}-${Math.floor(100000 + Math.random() * 900000)}`;
  doc.setFontSize(7.8);
  doc.setTextColor(...DARK_GRAY);
  doc.text(`Doc Ref: ${docRef}`, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Generated: ${now.toLocaleString()}`, pageWidth - 14, 17, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(`Downloaded By: ${generatedBy}`, pageWidth - 14, 22, { align: 'right' });

  // Full-width rule under the header
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.line(14, 28, pageWidth - 14, 28);

  return 34; // next available Y position on the page
}

function drawReportFooter(doc: jsPDF, generatedBy: string) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE_GRAY);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...MID_GRAY);
    doc.text(`Downloaded by ${generatedBy}  -  BECS HVAC Control System  -  Confidential Document`, 14, pageHeight - 11);

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 11, { align: 'right' });
  }
}

function drawFilterPanel(doc: jsPDF, heading: string, rows: Array<[string, string]>, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const panelHeight = 22;

  doc.setDrawColor(...LINE_GRAY);
  doc.setLineWidth(0.3);
  doc.rect(14, startY, pageWidth - 28, panelHeight);

  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(heading, 19, startY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.setTextColor(...DARK_GRAY);
  const colWidth = (pageWidth - 28 - 10) / rows.length;
  rows.forEach(([label, value], i) => {
    doc.text(`${label}: ${value}`, 19 + i * colWidth, startY + 16);
  });

  return startY + panelHeight + 6;
}

// ---------------------------------------------------------------

export function generateAlarmReportPDF(
  alarms: AlarmLog[],
  filterDevice: string,
  filterDate: string,
  filterTimeFrom: string,
  filterTimeTo: string,
  isAllDevices: boolean,
  alarmCategory: 'REALTIME' | 'PAST' | 'ALL' = 'ALL',
  generatedBy: string = 'Unknown Operator'
) {
  const doc = new jsPDF();

  const startY = drawReportHeader(
    doc,
    `${alarmCategory} ALARM REPORT`,
    'BECS HVAC Control System - Telemetry Alarm Log',
    'ALM-RPT',
    generatedBy
  );

  const deviceLabel = isAllDevices ? 'All Devices' : filterDevice || 'All Devices';
  const dateLabel = filterDate || 'All Dates';
  const timeLabel = filterTimeFrom && filterTimeTo ? `${filterTimeFrom} to ${filterTimeTo}` : 'Full Day';

  const tableStartY = drawFilterPanel(
    doc,
    'Report Filter Scope',
    [
      ['Device', deviceLabel],
      ['Category', alarmCategory],
      ['Date Scope', dateLabel],
      ['Time', timeLabel],
    ],
    startY
  );

  const tableRows = alarms.map((a, index) => [
    (index + 1).toString(),
    a.id,
    a.device,
    a.alarmName,
    a.parameter,
    a.lowHigh,
    a.value,
    a.timeDate,
    a.category || (a.acknowledged ? 'PAST' : 'REALTIME'),
    a.acknowledged ? 'ACK' : 'UNACK',
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['#', 'Alarm ID', 'Device', 'Alarm Title', 'Parameter', 'Severity', 'Trigger Value', 'Time & Date', 'Type', 'Status']],
    body: tableRows,
    theme: 'grid',
    styles: { lineColor: LINE_GRAY, lineWidth: 0.2 },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: BLACK,
      fontStyle: 'bold',
      fontSize: 8.3,
      lineWidth: 0.4,
      lineColor: BLACK,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 30],
    },
    alternateRowStyles: {
      fillColor: ROW_ALT_GRAY,
    },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 18 },
      2: { cellWidth: 18 },
      3: { cellWidth: 35 },
      4: { cellWidth: 23 },
      5: { cellWidth: 16 },
      6: { cellWidth: 20 },
      7: { cellWidth: 24 },
      8: { cellWidth: 15 },
      9: { cellWidth: 12 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.raw && (data.row.raw as string[])[9] === 'UNACK') {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 200;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(`Total Records: ${alarms.length}`, 14, finalY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_GRAY);
  doc.setFontSize(8);
  doc.text('Retention Compliance: 365-Day (1 Year) Auto-Purge Storage Policy Enforced', 14, finalY + 5.5);
  doc.text('System-Certified Log - Every record generated live from a real threshold breach.', 14, finalY + 10.5);

  drawReportFooter(doc, generatedBy);

  const fileName = isAllDevices
    ? `All_Devices_Alarm_Report_${new Date().toISOString().slice(0, 10)}.pdf`
    : `${filterDevice.replace(/\s+/g, '_')}_Alarm_Report.pdf`;

  doc.save(fileName);
}

export function generateAutomationReportPDF(
  automationLogs: AutomationLog[],
  filterDevice: string,
  filterDate: string,
  filterAngle: string,
  filterTimePeriod: string,
  isAllDevices: boolean,
  generatedBy: string = 'Unknown Operator'
) {
  const doc = new jsPDF();

  const startY = drawReportHeader(
    doc,
    'AUTOMATION & SERVO VALVE REPORT',
    'BECS HVAC Control System - Valve Automation Log',
    'AUT-RPT',
    generatedBy
  );

  const devTxt = isAllDevices ? 'All Devices' : filterDevice || 'All Devices';
  const dateTxt = filterDate || 'All Dates';
  const angleTxt = filterAngle ? `${filterAngle}` : 'All Angles (25%-100%)';
  const timeTxt = filterTimePeriod || 'All Time Periods';

  const tableStartY = drawFilterPanel(
    doc,
    'Automation Filter Parameters',
    [
      ['Device', devTxt],
      ['Date', dateTxt],
      ['Angle / Valve', angleTxt],
      ['Time', timeTxt],
    ],
    startY
  );

  const tableRows = automationLogs.map((log, index) => [
    (index + 1).toString(),
    log.id,
    log.device,
    log.parameter,
    log.anglePercent,
    log.timePeriod,
    log.triggerReason,
    log.date,
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['#', 'Log ID', 'Device', 'Valve Control', 'Target Angle / %', 'Time Period', 'Automation Trigger Reason', 'Date']],
    body: tableRows,
    theme: 'grid',
    styles: { lineColor: LINE_GRAY, lineWidth: 0.2 },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: BLACK,
      fontStyle: 'bold',
      fontSize: 8.3,
      lineWidth: 0.4,
      lineColor: BLACK,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 30],
    },
    alternateRowStyles: {
      fillColor: ROW_ALT_GRAY,
    },
  });

  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 200;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(`Total Servo Automation Events Recorded: ${automationLogs.length}`, 14, finalY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_GRAY);
  doc.setFontSize(8);
  doc.text('Automated Servo Motor Position Feedback - System-Confirmed Log', 14, finalY + 5.5);

  drawReportFooter(doc, generatedBy);

  const fileName = isAllDevices
    ? `All_Devices_Automation_Report_${new Date().toISOString().slice(0, 10)}.pdf`
    : `${filterDevice.replace(/\s+/g, '_')}_Automation_Report.pdf`;

  doc.save(fileName);
}

export function generateRealtimeTelemetryPDF(devices: DeviceData[], generatedBy: string = 'Unknown Operator') {
  const doc = new jsPDF();

  const startY = drawReportHeader(
    doc,
    'ESP32 REALTIME TELEMETRY MATRIX',
    'BECS HVAC Control System - Live Hardware Snapshot',
    'TEL-RPT',
    generatedBy
  );

  const tableStartY = drawFilterPanel(
    doc,
    'Snapshot Scope',
    [
      ['Nodes', `${devices.length} Devices`],
      ['Online', `${devices.filter((d) => d.isOnline).length}`],
      ['Offline', `${devices.filter((d) => !d.isOnline).length}`],
    ],
    startY
  );

  const tableRows = devices.map((d) => [
    d.name || d.id,
    d.hostname ? `${d.hostname.replace(/\.local$/, '')}.local` : d.ipAddress || '-',
    d.tempReal !== null ? `${d.tempReal} C` : '......',
    d.humidityReal !== null ? `${d.humidityReal}%` : '......',
    `${d.hotValvePercent}% (${d.hotValveAngle} deg)`,
    `${d.coldValvePercent}% (${d.coldValveAngle} deg)`,
    d.autoAdjustEnabled ? 'AUTO-PID' : 'MANUAL',
    d.isOnline ? 'ONLINE' : 'OFFLINE',
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [
      [
        'Device Name',
        'Address',
        'Temp Real',
        'Humidity Real',
        'Hot Motor Valve',
        'Cold Motor Valve',
        'Auto-Adjust',
        'Status',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    styles: { lineColor: LINE_GRAY, lineWidth: 0.2 },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: BLACK,
      fontStyle: 'bold',
      fontSize: 8.3,
      lineWidth: 0.4,
      lineColor: BLACK,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 30],
    },
    alternateRowStyles: {
      fillColor: ROW_ALT_GRAY,
    },
  });

  drawReportFooter(doc, generatedBy);

  doc.save(`ESP32_Telemetry_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
