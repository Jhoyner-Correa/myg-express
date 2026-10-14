'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const net = require('net');
const readline = require('readline/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');

const exec = promisify(execFile);
const VERSION = '1.3.2';
const SINGLE_INSTANCE_PORT = 41789;
const DEFAULT_API_URL = 'https://app.myg-express.com/api/printing';

const dataDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'MyG Print Connector');
const configPath = path.join(dataDir, 'config.json');
const logPath = path.join(dataDir, 'connector.log');
const helperPath = path.join(dataDir, 'raw-print.ps1');
const dashboardPath = path.join(dataDir, 'dashboard.ps1');
const icoPath = path.join(dataDir, 'app.ico');

const RAW_PRINT_SCRIPT = `param([Parameter(Mandatory=$true)][string]$PrinterName,[Parameter(Mandatory=$true)][string]$FilePath)
$source=@'
using System; using System.Runtime.InteropServices;
public class MyGRawPrinter {
[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
[DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
[DllImport("winspool.drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr h,int l,[In]DOCINFO d);
[DllImport("winspool.drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true)] static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);
public static void Send(string printer,byte[] bytes){IntPtr h;if(!OpenPrinter(printer,out h,IntPtr.Zero))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());IntPtr p=IntPtr.Zero;try{var d=new DOCINFO{pDocName="MyG Etiquetas",pDataType="RAW"};if(StartDocPrinter(h,1,d)==0)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());try{StartPagePrinter(h);p=Marshal.AllocCoTaskMem(bytes.Length);Marshal.Copy(bytes,0,p,bytes.Length);int w;if(!WritePrinter(h,p,bytes.Length,out w)||w!=bytes.Length)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());EndPagePrinter(h);}finally{EndDocPrinter(h);}}finally{if(p!=IntPtr.Zero)Marshal.FreeCoTaskMem(p);ClosePrinter(h);}}
}
'@
Add-Type -TypeDefinition $source
[MyGRawPrinter]::Send($PrinterName,[IO.File]::ReadAllBytes($FilePath))
`;

let config = null;
let currentPrinterName = null;
let stopping = false;
let lastHeartbeat = 0;
let cachedPrinters = [];
let lastPrinterDetect = 0;
let printerOfflineWarned = false;
let networkOfflineWarned = false;

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

// -------------------------------------------------------------
// Panel de control nativo profesional
// -------------------------------------------------------------
function showDashboard(printerName) {
  try {
    const ps = execFile('powershell.exe', [
      '-NoProfile',
      '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass',
      '-File', dashboardPath,
      '-Hostname', os.hostname(),
      '-Printer', printerName || 'Detectando...',
      '-ApiUrl', config?.apiUrl || DEFAULT_API_URL,
      '-Status', 'ACTIVO Y LISTO',
    ], { windowsHide: true }, () => {});
    if (ps && ps.unref) ps.unref();
  } catch {
    showNativeDialog(`🟢 MyG Print Connector está activo.\n\nImpresora térmica: ${printerName || 'Detectando...'}`);
  }
}

// -------------------------------------------------------------
// Cuadro de diálogo de respaldo
// -------------------------------------------------------------
function showNativeDialog(message, title = 'MyG Print Connector') {
  return new Promise((resolve) => {
    try {
      const escaped = message.replace(/'/g, "''").replace(/\r?\n/g, '`n');
      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${escaped}', '${title}', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)`;
      execFile('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', cmd], { windowsHide: true }, () => resolve());
    } catch {
      resolve();
    }
  });
}

// -------------------------------------------------------------
// Auto-registro permanente en el inicio de Windows
// -------------------------------------------------------------
async function ensureAutoStart() {
  try {
    const exe = process.execPath;
    await exec('reg.exe', [
      'add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      '/v', 'MyG Print Connector',
      '/t', 'REG_SZ',
      '/d', `"${exe}" --background`,
      '/f',
    ], { windowsHide: true });
  } catch {}
}

// -------------------------------------------------------------
// Logging con rotación automática (2 MB)
// -------------------------------------------------------------
function log(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > 2 * 1024 * 1024) {
        const oldLog = path.join(dataDir, 'connector.log.old');
        try { fs.unlinkSync(oldLog); } catch {}
        try { fs.renameSync(logPath, oldLog); } catch {}
      }
    }
    fs.appendFileSync(logPath, line + '\n', 'utf8');
  } catch {}
}

// -------------------------------------------------------------
// Mutex de instancia única mediante socket local
// -------------------------------------------------------------
function acquireSingleInstanceLock(isBackground = false) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        log('INFO', 'MyG Print Connector ya está en ejecución en segundo plano.');
        if (!isBackground) {
          const printer = currentPrinterName || 'Detectando...';
          showDashboard(printer);
        }
        process.exit(0);
      }
      resolve(null);
    });
    server.listen(SINGLE_INSTANCE_PORT, '127.0.0.1', () => {
      server.unref();
      resolve(server);
    });
  });
}

// -------------------------------------------------------------
// Detección y normalización de impresoras en Windows
// -------------------------------------------------------------
async function detectPrinters(force = false) {
  const now = Date.now();
  const cacheMaxAge = printerOfflineWarned ? 3000 : 10000;
  if (!force && cachedPrinters.length > 0 && (now - lastPrinterDetect < cacheMaxAge)) {
    return cachedPrinters;
  }
  try {
    const script = "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress";
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      timeout: 15000,
    });
    if (!stdout.trim()) {
      cachedPrinters = [];
    } else {
      const parsed = JSON.parse(stdout.trim());
      cachedPrinters = (Array.isArray(parsed) ? parsed : [parsed]).map(String).filter(Boolean);
    }
  } catch (error) {
    if (!cachedPrinters.length) cachedPrinters = [];
  }
  lastPrinterDetect = now;
  return cachedPrinters;
}

function normalizePrinterName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\((?:copiar?|copy)\s*\d*\)/gi, '')
    .trim();
}

function resolveActivePrinter(targetName, availablePrinters) {
  if (!availablePrinters || !availablePrinters.length) return null;

  if (targetName && availablePrinters.includes(targetName)) {
    return targetName;
  }

  if (targetName) {
    const baseTarget = normalizePrinterName(targetName);
    const match = availablePrinters.find(p => normalizePrinterName(p) === baseTarget);
    if (match) return match;
  }

  const thermalMatch = availablePrinters.find(name =>
    /luxur|pos|zj|58|80|label|thermal|receipt|ticket|xprinter|gprinter|tsc|zebra/i.test(name)
  );
  if (thermalMatch) return thermalMatch;

  const physicalOnly = availablePrinters.filter(name =>
    !/pdf|xps|fax|onenote|anydesk|microsoft|virtual|document|writer/i.test(name)
  );
  if (physicalOnly.length === 1) return physicalOnly[0];

  return null;
}

// -------------------------------------------------------------
// Cliente API HTTP hacia el servidor MyG
// -------------------------------------------------------------
async function api(endpoint, body = {}, auth = true) {
  const url = `${config.apiUrl}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'MyGPrintConnector/1.3.2',
      'accept': 'application/json',
      ...(auth && config.token ? { 'x-print-agent-token': config.token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data.data;
}

// -------------------------------------------------------------
// Instalación de scripts auxiliares y recursos locales
// -------------------------------------------------------------
async function installHelper() {
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.writeFile(helperPath, RAW_PRINT_SCRIPT, 'utf8');

  const candidatesDashboard = [
    path.join(__dirname, 'dashboard.ps1'),
    path.join(process.cwd(), 'dashboard.ps1'),
    path.join(path.dirname(process.execPath), 'dashboard.ps1'),
  ];
  const foundDash = candidatesDashboard.find(p => fs.existsSync(p));
  if (foundDash) {
    try { await fsp.copyFile(foundDash, dashboardPath); } catch {}
  }

  const candidatesIco = [
    path.join(__dirname, 'app.ico'),
    path.join(process.cwd(), 'app.ico'),
    path.join(path.dirname(process.execPath), 'app.ico'),
  ];
  const foundIco = candidatesIco.find(p => fs.existsSync(p));
  if (foundIco) {
    try { await fsp.copyFile(foundIco, icoPath); } catch {}
  }
}

// -------------------------------------------------------------
// Vinculación inicial interactiva o por parámetros
// -------------------------------------------------------------
async function firstSetup() {
  let apiUrl = arg('--api-url') || DEFAULT_API_URL;
  let code = arg('--pair-code');

  if (!code) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n==============================================================');
    console.log('       MyG Express · MyG Print Connector Enterprise           ');
    console.log('                   Vinculación Inicial                        ');
    console.log('==============================================================\n');
    const defaultUrl = process.env.PRINT_API_URL || DEFAULT_API_URL;
    apiUrl = (await rl.question(`Servidor [${defaultUrl}]: `)).trim() || defaultUrl;
    code = (await rl.question('Código de 8 dígitos mostrado en el sistema web: ')).trim();
    rl.close();
  }

  config = { apiUrl: String(apiUrl).replace(/\/+$/, '') };
  const detected = await detectPrinters(true);

  log('INFO', `Enviando solicitud de enlace al servidor ${config.apiUrl}...`);
  const result = await api('/agent/pair', {
    code,
    computer_name: os.hostname(),
    printers: detected,
    version: VERSION,
  }, false);

  config = {
    apiUrl: config.apiUrl,
    token: result.token,
    agentId: result.agentId,
    siteId: result.siteId,
    printerName: result.printerName || null,
  };

  await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  currentPrinterName = result.printerName || null;
  log('INFO', `¡Equipo vinculado exitosamente con Sede #${result.siteId}! La configuración quedó guardada de forma permanente.`);
}

// -------------------------------------------------------------
// Envío directo a impresora térmica en modo RAW
// -------------------------------------------------------------
async function printRaw(payload, id, targetPrinter) {
  const temp = path.join(os.tmpdir(), `myg-print-${id}-${Date.now()}.prn`);
  const bytes = payload.startsWith('BASE64:')
    ? Buffer.from(payload.slice(7), 'base64')
    : Buffer.from(payload, 'ascii');
  await fsp.writeFile(temp, bytes);
  try {
    await exec('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', helperPath,
      '-PrinterName', targetPrinter,
      '-FilePath', temp,
    ], { windowsHide: true, timeout: 30000 });
  } finally {
    await fsp.unlink(temp).catch(() => {});
  }
}

// -------------------------------------------------------------
// Latido periódico de telemetría (Heartbeat)
// -------------------------------------------------------------
async function heartbeat() {
  const now = Date.now();
  if (now - lastHeartbeat < 25000) return;
  const printers = await detectPrinters();
  const data = await api('/agent/heartbeat', {
    printers,
    version: VERSION,
  });
  if (data?.agent?.printerName) {
    const newName = data.agent.printerName;
    if (newName !== currentPrinterName) {
      currentPrinterName = newName;
      if (config) {
        config.printerName = currentPrinterName;
        fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8').catch(() => {});
      }
    }
  }
  lastHeartbeat = now;
}

// -------------------------------------------------------------
// Procesamiento de cola de impresión
// -------------------------------------------------------------
async function processNext() {
  await heartbeat();

  const printers = await detectPrinters();
  const resolved = resolveActivePrinter(currentPrinterName, printers);

  if (!resolved) {
    if (!printerOfflineWarned) {
      log('WARN', `La impresora "${currentPrinterName || 'Sin asignar'}" no está conectada o detectada en Windows. Esperando conexión USB...`);
      printerOfflineWarned = true;
    }
    return;
  }

  if (printerOfflineWarned) {
    log('INFO', `Impresora USB reconectada y lista: "${resolved}".`);
    printerOfflineWarned = false;
  }

  const job = await api('/agent/claim');
  if (!job) return;

  log('INFO', `Procesando trabajo #${job.id} (${job.labelCount || job.labels?.length || 1} etiquetas) para "${resolved}"...`);
  try {
    await printRaw(job.payload, job.id, resolved);
    await api(`/agent/jobs/${job.id}/complete`, { success: true });
    log('INFO', `Trabajo #${job.id} impreso y confirmado con éxito.`);
  } catch (error) {
    const message = error.message || String(error);
    log('ERROR', `Error al imprimir trabajo #${job.id}: ${message}`);
    await api(`/agent/jobs/${job.id}/complete`, { success: false, error: message }).catch(() => {});
  }
}

// -------------------------------------------------------------
// Función principal (Daemon Enterprise)
// -------------------------------------------------------------
async function main() {
  const isBackground = args.includes('--background');

  if (!args.includes('--pair-only')) {
    await acquireSingleInstanceLock(isBackground);
  }

  await installHelper();
  await ensureAutoStart();

  if (fs.existsSync(configPath) && !arg('--pair-code')) {
    try {
      config = JSON.parse(await fsp.readFile(configPath, 'utf8'));
      if (config.printerName) currentPrinterName = config.printerName;
    } catch (e) {
      log('WARN', 'El archivo config.json estaba dañado. Iniciando configuración nueva.');
      await firstSetup();
    }
  } else {
    await firstSetup();
  }

  if (args.includes('--pair-only')) {
    log('INFO', 'Vinculación completada con éxito.');
    return;
  }

  const detectedPrinters = await detectPrinters(true);
  const resolved = resolveActivePrinter(currentPrinterName, detectedPrinters);

  log('INFO', `Servicio de impresión iniciado en ${os.hostname()} (Impresora: ${resolved || currentPrinterName || 'Sin asignar'}).`);

  if (!isBackground) {
    showDashboard(resolved || currentPrinterName);
  }

  while (!stopping) {
    try {
      await processNext();
      if (networkOfflineWarned) {
        log('INFO', 'Conexión con el servidor restablecida.');
        networkOfflineWarned = false;
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        log('WARN', `El servidor devolvió HTTP ${error.status} (autorización pendiente o temporalmente no disponible). Reintentando en 15s...`);
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }
      if (!networkOfflineWarned) {
        log('WARN', `Error de comunicación (${error.message || error}). Reintentando en 5s...`);
        networkOfflineWarned = true;
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
}

process.on('SIGINT', () => { stopping = true; log('INFO', 'Deteniendo servicio por SIGINT...'); });
process.on('SIGTERM', () => { stopping = true; log('INFO', 'Deteniendo servicio por SIGTERM...'); });

main().catch((error) => {
  log('ERROR', `Fallo crítico: ${error.message || error}`);
  process.exitCode = 1;
});
