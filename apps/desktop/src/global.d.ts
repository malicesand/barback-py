// Global Types

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
  }
}
export {};
