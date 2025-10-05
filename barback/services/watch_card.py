# Works with Electron to display cards

import os
import sys
import json
import time
import subprocess
from pathlib import Path
from threading import Thread

# === CONFIG ===
IGNORE_LIST = {'macintosh hd', 'totc24 Backup', 'totc 2025 raid', 'totc25 temp', "avclub's mac studio (7), 'totc edit"} #! update with Josh
SESSION_IGNORES = set()
SCRIPT_PATH = 'rename_files.py'
DCIM_FOLDER_NAME = 'DCIM'
POLL_INTERVAL = 5 # in seconds

def send_event(type_, **payload):
    #Send an event as a single JSON line to stdout (flush immediately)
    msg = {"type": type_, **payload}
    print(json.dumps(msg), flush=True)

  
def run_script(volume_path):
    try:
        send_event("rename_started", volume_path=volume_path)
        # Call your existing renamer
        subprocess.run(['python3', SCRIPT_PATH, volume_path], check=True)
        # Marker file so we don't re-run
        Path(os.path.join(volume_path, '.renamed')).touch()
        send_event("rename_finished", volume_path=volume_path, ok=True)
    except subprocess.CalledProcessError as e:
        send_event("rename_finished", volume_path=volume_path, ok=False, error=str(e))
    except Exception as e:
        send_event("rename_finished", volume_path=volume_path, ok=False, error=str(e))

def list_volumes_state():
   snapshot = []
   for vol in os.listdir('/Volumes'):
        vol_lower = vol.lower()
        vol_path = os.path.join('/Volumes', vol)
        dcim_path = os.path.join(vol_path, DCIM_FOLDER_NAME)
        renamed_marker = os.path.join(vol_path, '.renamed')
        snapshot.append({
            "name": vol,
            "path": vol_path,
            "ignored": (vol_lower in IGNORE_LIST) or (vol_lower in SESSION_IGNORES),
            "has_dcim": os.path.isdir(dcim_path),
            "renamed": os.path.exists(renamed_marker),
        })
   return snapshot

def stdin_command_loop():
   """
    Read newline-delimited JSON commands from stdin.
    Expected shapes:
      {'cmd':'run_rename', 'volume_path': '...'}
      {'cmd':'mark_ignored', 'volume_name': '...'}   # session-only ignore
      {'cmd':'unignore', 'volume_name': '...'}       # session-only unignore
      {'cmd':'list_volumes'}
    """
   while True:
    line = sys.stdin.readline()
    if not line:
       #stdin closed; exit loop so process ends
       break
    line = line.strip()
    if not line:
       continue
    try:
       data = json.loads(line)
       cmd = data.get('cmd')
       if cmd == 'run-rename':
          vp = data.get('volume_path')
          if vp and os.path.isdir(vp):
             run_script(vp)
          else:
             send_event('error', message='Invalid or missing volume_path'),
       elif cmd == 'mark_ignored':
          name = (data.get('volume_name') or '').lower()
          if name:
             SESSION_IGNORES.add(name)
             send_event('ignored', volume_name = name)
       elif cmd == 'unignore':
          name = (data.get('volume_name') or '').lower()
          if name and name in SESSION_IGNORES:
             SESSION_IGNORES.remove(name)
             send_event('unignored', volume_name=name)
       elif cmd == 'list_volumes':
          send_event('volumes', snapshot=list_volumes_state())
       else:
          send_event('error', message='Unknown command', payload=data)
    except Exception as e:
       send_event('error', message='Command parsing failed', detail=str(e))


def main():
  send_event('ready', message='Watching for memory cards with DCIM folders')
  already_prompted = set()

  #Start stdin command reader in a background thread
  while True:
    try: 
      volumes = os.listdir('/Volumes')
      for vol in volumes:
        vol_lower = vol.lower()
        vol_path = os.path.join('/Volumes', vol)
        dcim_path = os.path.join(vol_path, DCIM_FOLDER_NAME)
        renamed_marker = os.path.join(vol_path, '.renamed')

        if (vol_lower in IGNORE_LIST) or (vol_lower in SESSION_IGNORES):
          # print(f'Skipping {vol} (in IGNORE_LIST)')
          continue

        if os.path.exists(renamed_marker):
          continue
        
        if os.path.isdir(dcim_path) and vol not in already_prompted:
           # Tell the UI a DCIM card has appeared; UI will decide to run or cancel
          send_event(
             'dcim_found',
             volume_name=vol,
             volume_path=vol_path,
             dcim_path=dcim_path,
          )
          already_prompted.add(vol)

      # Drop from prompted set when a volume disappears
        still_mounted = set(os.listdir('/Volumes'))
        already_prompted = {v for v in already_prompted if v in still_mounted}

    except Exception as e:
      print('🫣 Watcher error:', e)

    time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
  main()