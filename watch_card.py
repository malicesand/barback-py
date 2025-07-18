# Work with osascript to create dialog that asks to run barback.py when card reader is detected

import os
import time
import subprocess

# === CONFIG ===
IGNORE_LIST = {'Macintosh HD'}
SCRIPT_PATH = 'rename_files.py'
DCIM_FOLDER_NAME = 'DCIM'
POLL_INTERVAL = 5 # in seconds

def show_dialog(volume_name):
  try:
    script = f'display dialog "Run renaming script for {volume_name}?" buttons {{"Cancel", "Run"}} default button "Run"'
    print(f' 🐻 {volume_name}?')
    result = subprocess.run(
      ['osascript', '-e', script], 
      capture_output=True, 
      text=True
    )

    print(result.stdout)
    print('🫥', result.stderr, '🫥')

    return "button returned:Run" in result.stdout
  except Exception as e:
    print ('🤬 Dialog error:', e)
    return False
  
def run_script(volume_path):
  try: 
    subprocess.run(['python3', SCRIPT_PATH, volume_path])
  except Exception as e:
    print('😨 Failed to run renamer:', e)

def main():
  print(' 🧿 Watching for memory cards with DCIM folders 🧿')
  already_prompted = set()
  while True:
    try: 
      volumes = os.listdir('/Volumes')
      for vol in volumes:
        if vol in IGNORE_LIST or vol in already_prompted:
          continue

        vol_path = os.path.join('/Volumes', vol)
        dcim_path = os.path.join(vol_path, DCIM_FOLDER_NAME)

        if os.path.isdir(dcim_path):
          print(f'\n 👁️‍🗨️ Found DCIM on {vol}')
          if show_dialog(vol):
            run_script(vol_path)
          already_prompted.add(vol)

      # Reset prompted list if volume is unmounted
      already_prompted = {
        vol for vol in already_prompted if os.path.exists(os.path.join('/Volumes', vol))
      }

    except Exception as e:
      print('🫣 Watcher error:', e)

    time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
  main()