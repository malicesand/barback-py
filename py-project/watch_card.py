# Entry file for Electron Spawn #
# Watch 

import os
import sys
import json
import time # TODO
import subprocess
import threading
from pathlib import Path
from threading import Thread
from threading import Event


# ---------------  Config/ Globals  --------------- #
IGNORE_LIST = {
   'macintosh hd', 
   'pdxcw25_A', 
   'pdxcw25_B', 
} 
SESSION_IGNORES = set()
# SCRIPT_PATH = 'rename_files.py' TODO 
DCIM_FOLDER_NAME = 'DCIM'
POLL_INTERVAL = 5 # in seconds TODO
SESSION_LOCK = threading.Lock() # protect session ignores

# ---------------  ELECTRON RENDERER HANDLERS  --------------- #

# ___ IPC Handlers ___#
def send_event(type_, **payload):
    # Send an event as a single JSON line to stdout (flush immediately)
    msg = {"type": type_, **payload}
    print(json.dumps(msg), flush=True)

def _natural_key(s: str): # natural sort by folder name commonly used by cameras (100MSDCF, 101MSDCF…)
    import re
    return [int(t) if t.isdigit() else t.lower() for t in re.findall(r'\d+|\D+', s)]

def relevant_cards_snapshot():
   cards = []
   for vol in os.listdir('/Volumes'):
        vol_lower = vol.lower()
        with SESSION_LOCK:
         if (vol_lower in IGNORE_LIST) or (vol_lower in SESSION_IGNORES):
               continue
        vol_path = os.path.join('/Volumes', vol)
        dcim_path = os.path.join(vol_path, DCIM_FOLDER_NAME)
        renamed_marker = os.path.join(vol_path, '.renamed')
        if os.path.isdir(dcim_path) and not os.path.exists(renamed_marker):
           try:
            folder_count = sum(1 for e in os.scandir(dcim_path) if e.is_dir())
           except Exception:
             folder_count = None

           cards.append({
              'volume_name': vol,
              'volume_path': vol_path,
              'dcim_path': dcim_path,
              'folder_count': folder_count
           })
   return cards
# Show DCIM Children
def list_dcim_folders(dcim_path: str, include_counts=True, max_entries=500):
    # safety: only allow paths under /Volumes/*/DCIM
    safe_root = os.path.realpath('/Volumes')
    real = os.path.realpath(dcim_path)
    if not real.startswith(safe_root) or not real.endswith('/DCIM'):
        raise ValueError("Refusing to list outside /Volumes/*/DCIM")

    rows = []
    try:
        with os.scandir(real) as it:
            for entry in it:
                if not entry.is_dir(follow_symlinks=False):
                    continue
                info = {
                    'name': entry.name,
                    'path': os.path.join(real, entry.name),
                    'mtime': entry.stat(follow_symlinks=False).st_mtime,
                }
                if include_counts:
                    try:
                        # count files (non-recursive) and bytes (non-recursive)
                        files = 0
                        bytes_ = 0
                        for child in os.scandir(info['path']):
                            if child.is_file(follow_symlinks=False):
                                files += 1
                                try:
                                    bytes_ += child.stat(follow_symlinks=False).st_size
                                except Exception:
                                    pass
                        info['file_count'] = files
                        info['bytes'] = bytes_
                    except Exception:
                        info['file_count'] = None
                        info['bytes'] = None
                rows.append(info)
    except FileNotFoundError:
        rows = []

    rows.sort(key=lambda r: _natural_key(r['name']))
    return rows[:max_entries]

# Tell vite to retain py-project tree
HERE = Path(__file__).resolve().parent
SCRIPT_PATH = HERE / 'rename_files.py'

def run_script(volume_path):
    try:
        send_event("rename_started", message=f'renaming {volume_path}', volume_path=volume_path)
         
        if not SCRIPT_PATH.exists():
           send_event('rename_finished', volume_path=volume_path, ok=False, error=f'rename not found at {SCRIPT_PATH}')
           return
        # import siblings
        env = os.environ.copy()
        env['PYTHONPATH'] = os.pathsep.join([str(HERE), env.get('PYTHONPATH', '')])

        try: 
           subprocess.run(
              [sys.executable, "-u", str(SCRIPT_PATH), volume_path],
              cwd=str(HERE), # anchor working directory
              env=env,
              check=True,
            #   stdout=subprocess.DEVNULL,  # don't pollute JSON stdout
              stdout=sys.stderr,
              stderr=sys.stderr,
              text=True,
           )
           sys.stderr.write(f"[WATCHER] running at={SCRIPT_PATH}\n"); sys.stderr.flush()
           Path(os.path.join(volume_path, '.renamed')).touch()
           send_event("rename_finished", volume_path=volume_path, ok=True)
        except subprocess.CalledProcessError as e:
         send_event("rename_finished", volume_path=volume_path, ok=False, error=str(f'exit {e.returncode}'))
        except Exception as e:
         send_event("rename_finished", volume_path=volume_path, ok=False, error=str(e))
    finally:
       # force-refresh dcim list
       send_event("dcim_snapshot", cards=relevant_cards_snapshot())

# ___ ACTION Handlers ___#

def act_cards_snapshot(data):
   return {'ok': True, 'cards': relevant_cards_snapshot()}

def act_run_rename(data):
   vp = data.get('volume_path')
   if not vp or not os.path.isdir(vp):
      return {'ok': False, 'error': 'Invalid or missing volume_path'}
   run_script(vp)
   return {'ok': True, 'volume_path': vp}

def act_mark_ignored(data):
   name = (data.get('volume_name') or '').lower()
   if not name:
      return {'ok': False, 'error': 'Missing volume_name'}
   with SESSION_LOCK:
      SESSION_IGNORES.add(name)

   return {'ok': True, 'volume_name': name}

def act_unignore(data): 
   name = (data.get('volume_name') or '').lower()
   if not name:
      return {'ok': False, 'error': 'Missing volume_name'}
   with SESSION_LOCK:
      if name in SESSION_IGNORES:
         SESSION_IGNORES.remove(name)
   return {'ok': True, 'volume_name': name}
# Get DCIM Info
def act_cards_list_dcim(data): 
   dcim_path = data.get('dcim_path')
   include_counts = bool(data.get('include_counts', True))
   folders = list_dcim_folders(dcim_path, include_counts=include_counts)
   return {'ok': True, 'dcim_path': dcim_path, 'folders': folders}

ACTIONS = {
   'cards/snapshot': act_cards_snapshot,
   'run-rename': act_run_rename,
   'mark-ignored': act_mark_ignored,
   'unignore': act_unignore,
   'cards/list_dcim': act_cards_list_dcim,
}

ALIASES = {
   'list_dcim': 'cards/snapshot',
   'run_rename': 'run-rename',
   'mark_ignored': 'mark-ignored',
}

def stdin_command_loop(stop_event: Event):
# Read newline-delimited JSON commands from stdin. 
   while not stop_event.is_set():
    line = sys.stdin.readline()
    if not line:
       #stdin closed; exit loop so process ends
       stop_event.set()
       break
    line = line.strip()
    if not line:
       continue
    try:
       data = json.loads(line)
       req_id = data.get('request_id')
       raw_cmd = data.get('cmd') or data.get('type') 
       if not raw_cmd:
          send_event('error', message='Missing cmd/type', request_id=req_id)
          continue
       
       # normalize to kebab case and route
       cmd = ALIASES.get(raw_cmd, raw_cmd)

       handler = ACTIONS.get(cmd)
       if not handler:
          send_event('error', message=f'Unknown command: {cmd}', request_id=req_id, payload=data)
          continue
       
       result = handler(data) or {}
       # ensure pass-through request_id for correlation
       send_event(cmd, request_id=req_id, **result)
       
    except Exception as e:
       send_event('error', message='Command parsing/dispatch failed', detail=str(e))



# ---------------  WATCH CARD  --------------- #
def watch_cards(stop_event: Event):
  send_event('ready', message='Watching for memory cards with DCIM folders')
  last_names = set()
  while not stop_event.is_set():
    try: 
      cards = relevant_cards_snapshot()
      names = {c['volume_name'] for c in cards}
      if names != last_names:
         send_event('dcim_snapshot', cards=cards)
         last_names = names
    except Exception as e:
       send_event('error', message='Watcher error', detail=str(e))
    stop_event.wait(POLL_INTERVAL)
     
def main():
   stop_event = Event()
   t = Thread(target=stdin_command_loop, args=(stop_event,), daemon=True)
   t.start()

   try: 
      watch_cards(stop_event)
   finally:
      stop_event.set()
      t.join(timeout=0.5)

if __name__ == '__main__':
  main()

  '''
  Backlog
   #TODO FRONT END to display renamed and ignored cards
   #TODO FRONT END button to unignore
   #TODO Function show front end shows a special name
   #? Find DCIM path return
   #? What is this data though
  '''