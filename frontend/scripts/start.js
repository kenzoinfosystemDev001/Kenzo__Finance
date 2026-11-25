'use strict';

const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const portText = process.env.PORT || '3000';

if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  console.error(`Invalid PORT "${portText}". Set PORT to a number between 1 and 65535.`);
  process.exit(1);
}

const port = Number(portText);

function getWindowsProcess(pid) {
  const command = [
    `$processInfo = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction SilentlyContinue`,
    'if ($processInfo) { [pscustomobject]@{ name = $processInfo.Name; commandLine = $processInfo.CommandLine } | ConvertTo-Json -Compress }',
  ].join('; ');

  try {
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return result ? JSON.parse(result) : null;
  } catch (error) {
    return { lookupError: error.message };
  }
}

function getPortOwners() {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const owners = [];
    const lines = output.split(/\r?\n/);

    for (const line of lines) {
      const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+:\d+\s+LISTENING\s+(\d+)\s*$/i);
      if (match && Number(match[1]) === port && !owners.some((owner) => owner.pid === Number(match[2]))) {
        owners.push({ pid: Number(match[2]), process: getWindowsProcess(Number(match[2])) });
      }
    }

    return owners;
  } catch (error) {
    return [{ lookupError: error.message }];
  }
}

function reportPortConflict(error) {
  console.error(`Cannot start the Kenzo Finance web server: port ${port} is already in use.`);

  const owners = getPortOwners();
  if (owners.length === 0) {
    console.error('Could not determine the owning process. Check the port before stopping anything.');
  }

  for (const owner of owners) {
    if (owner.lookupError) {
      console.error(`Could not identify the process using port ${port}: ${owner.lookupError}`);
      continue;
    }

    const commandLine = (owner.process && owner.process.commandLine || '')
      .toLowerCase()
      .replace(/\//g, '\\');
    const normalizedRoot = path.resolve(__dirname, '..', '..').toLowerCase();
    const isNextServer = commandLine.includes('start-server.js')
      || /node_modules\\next\\dist\\bin\\next(?:\.js)?\s+start(?:\s|$)/.test(commandLine);
    const isKenzoWebServer = owner.process && commandLine.includes(normalizedRoot) && isNextServer;

    if (isKenzoWebServer) {
      console.error(`A Kenzo Finance Next.js server is already running on port ${port} (PID ${owner.pid}). Not starting a duplicate.`);
    } else {
      const name = owner.process && owner.process.name ? owner.process.name : 'unknown process';
      console.error(`Port ${port} is owned by PID ${owner.pid} (${name}). It was not stopped.`);
      console.error(`To use another port in PowerShell: $env:PORT = '3001'; npm run start --workspace @kenzo-erp/web`);
    }
  }

  if (!owners.length || owners.some((owner) => !owner.process && !owner.lookupError)) {
    console.error(`Port probe failed: ${error.message}`);
  }

  process.exit(1);
}

const probe = net.createServer();
probe.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    reportPortConflict(error);
  } else {
    console.error(`Unable to check port ${port}: ${error.message}`);
    process.exit(1);
  }
});

probe.listen({ port, host: '::', exclusive: true }, () => {
  probe.close((error) => {
    if (error) {
      console.error(`Unable to release startup check on port ${port}: ${error.message}`);
      process.exit(1);
    }

    startNext();
  });
});

function startNext() {
  let nextBin;
  try {
    nextBin = require.resolve('next/dist/bin/next');
  } catch (error) {
    console.error(`Unable to resolve the Next.js CLI: ${error.message}`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.once('error', (error) => {
    console.error(`Unable to start Next.js: ${error.message}`);
    process.exitCode = 1;
  });

  child.once('exit', (code, signal) => {
    process.exitCode = code === null ? 1 : code;
    if (signal && signal !== 'SIGINT' && signal !== 'SIGTERM') {
      console.error(`Next.js exited after receiving ${signal}.`);
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      if (child.exitCode === null && !child.killed) {
        child.kill(signal);
      }
    });
  }
}
