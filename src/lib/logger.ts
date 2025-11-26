import { writable } from 'svelte/store';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

function createLogger() {
  const { subscribe, update } = writable<LogEntry[]>([]);

  function addLog(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level,
      message,
      data
    };
    update((logs) => [...logs, entry]);

    // Also log to console
    const consoleMethod = level === 'info' ? 'log' : level;
    if (data) {
      console[consoleMethod](`[${level.toUpperCase()}] ${message}`, data);
    } else {
      console[consoleMethod](`[${level.toUpperCase()}] ${message}`);
    }
  }

  return {
    subscribe,
    info: (message: string, data?: any) => addLog('info', message, data),
    warn: (message: string, data?: any) => addLog('warn', message, data),
    error: (message: string, data?: any) => addLog('error', message, data),
    clear: () => update(() => [])
  };
}

export const logger = createLogger();
