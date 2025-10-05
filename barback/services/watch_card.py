# Works with Electron to display cards

import os
import sys
import json
import time
import subprocess
from pathlib import Path
from threading import Thread

# === CONFIG ===
IGNORE_LIST = { #! update with Josh
   'macintosh hd', 
   'totc24 Backup', 
   'totc 2025 raid', 
   'totc25 temp', 
   "avclub's mac studio (7)", 
   'totc edit'
} 
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
    finally:
       # force-refresh dcim list
       send_event("dcim_snapshot", cards=relevant_cards_snapshot())

# Photo Cards
def relevant_cards_snapshot():
   cards = []
   for vol in os.listdir('/Volumes'):
        vol_lower = vol.lower()
        if (vol_lower in IGNORE_LIST) or (vol_lower in SESSION_IGNORES):
            continue
        vol_path = os.path.join('/Volumes', vol)
        dcim_path = os.path.join(vol_path, DCIM_FOLDER_NAME)
        renamed_marker = os.path.join(vol_path, '.renamed')
        if os.path.isdir(dcim_path) and not os.path.exists(renamed_marker):
           cards.append({
              'volume_name': vol,
              'volume_path': vol_path,
              'dcim_path': dcim_path,
           })
   return cards
   
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
       elif cmd == 'list_dcim':
          send_event('dcim_snapshot', cards=relevant_cards_snapshot())
       else:
          send_event('error', message='Unknown command', payload=data)
    except Exception as e:
       send_event('error', message='Command parsing failed', detail=str(e))


def main():
  send_event('ready', message='Watching for memory cards with DCIM folders')
  last_names = set()

  #Start stdin command reader in a background thread
  t = Thread(target=stdin_command_loop, daemon=True)
  t.start()
  
  while True:
    try: 
      cards = relevant_cards_snapshot()
      names = {c['volume_name'] for c in cards}
      if names != last_names:
         send_event('dcim_snapshot', cards=cards)
         last_names = names
    except Exception as e:
      print('🫣 Watcher error:', e)

    time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
  main()