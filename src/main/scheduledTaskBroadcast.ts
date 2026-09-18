import { BrowserWindow } from 'electron';

import { IpcChannel as ScheduledTaskIpc } from '../scheduledTask/constants';
import type { ScheduledTaskRunEvent, ScheduledTaskStatusEvent } from '../scheduledTask/types';

/**
 * The canonical scheduler writes Run and task state to SQLite; the automation
 * page keeps its own snapshot. Every canonical change is pushed so a trigger
 * fired while the page is open (or was never opened) shows up without the user
 * reopening it. Push failures must never affect an already durable Run.
 */
export function broadcastScheduledTaskRun(event: ScheduledTaskRunEvent): void {
  sendToRenderers(ScheduledTaskIpc.RunUpdate, event);
}

export function broadcastScheduledTaskState(event: ScheduledTaskStatusEvent): void {
  sendToRenderers(ScheduledTaskIpc.StatusUpdate, event);
}

function sendToRenderers(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}
