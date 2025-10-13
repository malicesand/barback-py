// Global Types
import type { calendar_v3 } from 'googleapis';

export type Card = {
  volume_name: string;
  volume_path: string;
  dcim_path: string;
  folder_count?: number | null; 
};

export type DcimFolder = {
  name: string;
  path: string;
  mtime: number; // epoch time in seconds 
  file_count?: number | null;
  bytes?: number | null;
};

// --- Events coming FROM Python -------------------------------
export type PyEventBase = {
  type: string;
  request_id?: string;
};

export type DcimSnapShotEvent = PyEventBase & {
  type: 'dcim_snapshot' | 'cards/snapshot';
  ok?: boolean;
  cards: Card[];
};

export type CardListDcimEvent = PyEventBase & {
  type: 'cards/list_dcim';
  ok: boolean;
  dcim_path: string;
  folders: DcimFolder[];
};

export type RenameStartedEvent = PyEventBase & {
  type: 'rename_started';
  volume_path: string;
};

export type RenameFinishedEvent = PyEventBase & {
  type: 'rename_finished';
  volume_path: string;
};

export type PythonErrorEvent = PyEventBase & {
  type: 'error';
  message?: string;
  detail?: string;
  payload?: unknown;
};

export type PyEvent = 
  | DcimSnapShotEvent
  | CardListDcimEvent
  | RenameStartedEvent
  | RenameFinishedEvent
  | PythonErrorEvent
  | PyEventBase; // fallback for any other events 

// ---- Commands going TO Python --------------------------------
export type CardsSnapshotCmd = {
  cmd: 'cards/snapshot';
  request_id?: string;
};

export type CardsListDcimCmd = {
  cmd: 'cards/list_dcim';
  dcim_path: string;
  include_counts?: boolean;
  request_id?: string;
};

export type RunRenameCmd = {
  cmd: 'run-rename' | 'run_rename'; // backwards compat alias
  volume_path: string;
  request_id?: string;
};

export type MarkIgnoredCmd = {
  cmd: 'mark-ignored' | 'mark_ignored';
  volume_name: string;
  request_id?: string;
};

export type UnignoreCmd = {
  cmd: 'unignore';
  volume_name: string;
  request_id?: string;
}

export type LegacyListDcimCmd = {
  cmd: 'list_dcim';
  request_id?: string;
};

export type PyCmd =
  | CardsSnapshotCmd
  | CardsListDcimCmd
  | RunRenameCmd
  | MarkIgnoredCmd
  | UnignoreCmd
  | LegacyListDcimCmd;

// src/types/gcal.ts
export type FetchEventsOpts = {
  calendarId?: string;
  /** RFC3339 string, e.g. '2025-07-19T00:00:00-05:00' */
  timeMin?: string;
  /** RFC3339 string, e.g. '2025-07-28T23:59:59-05:00' */
  timeMax?: string;
  maxResults?: number;
};

export type Calendar = {
  id: string;
  summary: string;
  primary?: boolean;
}


declare global {
  interface Window {
    pybridge: {
      // returns true on successful enqueue
      sendToPython: (payload: PyCmd) => Promise<boolean>;
      // simple unsubscribe
      onPythonEvent: (listener: (event: PyEvent) => void) => () => void;
      // stream stderr to a log window / dev console
      onPythonStderr: (cb: (chunk: string) => void) => () => void;
      // passthrough
      ping: () => Promise<string>;
    };

    gcal: {
      googleConnectAndOpenUpload: () => Promise<{ ok: true }>;
      listCalendars: () => Promise<Array<{ id: string; summary: string; primary: boolean }>>;
      fetchEvents: (opts: {
        calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number;
      }) => Promise<calendar_v3.Schema$Events>;
      exportCalendarJson: (opts: {
        calendarId: string; timeMin: string; timeMax: string; suggestedFilename?: string;
      }) => Promise<{ ok: true; filePath: string; calName: string } | { ok: false; error: string }>;
      exportMultipleCalendarsJson: (opts: {
        calendarIds: string[]; timeMin: string; timeMax: string;
      }) => Promise<Array<{ id: string; ok: boolean; filePath?: string; error?: string }>>;
    };

    dbg: {
      listIpc: () => Promise<string[]>;
      /** (optional) quick health check */
      ping?: () => Promise<{ ok: true; pid: number; ts?: number }>;
    };

    data: {
      readSchedules: () => Promise<Array<{ title: string}>>;
    }
  }
}
export {};
