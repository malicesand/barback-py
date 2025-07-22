import os
import csv
import sys
import subprocess
from pathlib import Path
from utils.photo_utils import get_first_and_last_data
from utils.prefix_utils import load_prefix_map
from utils.json_utils import load_schedule
from utils.match import match_photo_to_event
from watch_card import IGNORE_LIST

# schedule = load_schedule()

VOLUMES_ROOT = "/Volumes/"
# TSV_PATH = os.path.join(os.path.dirname(__file__), "data/metadata.tsv")
LOG_PATH = 'run_log.csv'

# Helper function for logging progress and status to csv
def write_log_row(folder, prefix, start, end, result, status):
    log_exists = os.path.exists(LOG_PATH)
    with open(LOG_PATH, 'a', newline='') as f:
        writer = csv.writer(f)
        if not log_exists:
            writer.writerow(['folder', 'prefix', 'start', 'end', 'result', 'status'])  # header
        writer.writerow([folder, prefix, start, end, result, status])

def main():
  # Log check
  # print("📂 All volumes:")
  # for d in os.listdir(VOLUMES_ROOT):
  #   print(f"  - {d}")

  # Language for dialog box
  base_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
  dcim_path = base_dir / 'DCIM'
  print(f'Renaming files in {dcim_path}')

  # load prefix map
  prefix_map = load_prefix_map("data/prefix.tsv")  
  # Access DCIM in Removable Media
  for drive in os.listdir(VOLUMES_ROOT):
    drive_path = os.path.join(VOLUMES_ROOT, drive)
    marker_path = os.path.join(drive_path, '.renamed')

    # Skip system volume 
    if drive.lower() in IGNORE_LIST or not os.path.isdir(drive_path):
      print(f'Skipping ignored volume: {drive}')
      continue

    if os.path.exists(marker_path):
      print(f'Skipping {drive} (already has .renamed marker)')
      
    # Go one level deeper  
    dcim_path = os.path.join(drive_path, 'DCIM')

    if not os.path.exists(dcim_path):
      print(f'👾 Skipping {drive_path} - no DCIM folder found')
      continue #skip if no DCIM folder

    print(f'\n🧿 Found DCIM at {dcim_path}')

    # Process dcim_path as media root
    process_dcim(dcim_path, prefix_map)

    print(f"\n✅ Done! Processed: {drive_path}") 
    subprocess.run(["open", dcim_path])
  # End of your loop, after everything is done
  # print(f"\n✅ Done! Opening folder in Finder: {VOLUMES_ROOT}") 
  # subprocess.run(["open", VOLUMES_ROOT])
  
def process_dcim(dcim_path, prefix_map):
  # Loop through each subfolder in the removable media
  schedule_cache = {}

  for folder in os.listdir(dcim_path):
    dir_path = os.path.join(dcim_path, folder)
    if not os.path.isdir(dir_path):
      continue

    print(f"\n👀 Checking folder: {dir_path}")
    photo_data = get_first_and_last_data(dir_path, prefix_map)

    if not photo_data:
      print("\t❌ Could not extract photo metadata")
      continue

    photographer, start_time, end_time, = photo_data
    print(f"\tPhotographer: {photographer}")
    print(f"\tRange: {start_time} -> {end_time}")

    if photographer not in schedule_cache:
      schedule_cache[photographer] = load_schedule(photographer)

    schedule = schedule_cache[photographer]  

    # Match the folder's metadata to a row in the TSV
    match = match_photo_to_event(schedule, start_time, end_time)
    if match: 
      print(f"\t👾 Matched MEID: {match}")
      # new_path = os.path.join(MEDIA_ROOT, match)
      new_path = os.path.join(os.path.dirname(dir_path), match)
      if not os.path.exists(new_path):
        try: 
          os.rename(dir_path, new_path)
          write_log_row(folder, match, photographer, start_time, end_time, status='matched')
          print(f"\t💾 Renamed folder to {match} ")
        except Exception as e:
          write_log_row(folder, None, photographer, start_time, end_time, status=f'error: {e}')
          print(f"\t❌ Failed to rename folder: {e}")
      else:
        # Folder already exists — move contents into it
        print(f"\t📂 {match} already exists. Moving files into it...")

        try: 
          for file in os.listdir(dir_path):
            src_file = os.path.join(dir_path, file)
            dest_file = os.path.join(new_path, file)

            # Rename if duplicate photo filename exists
            if os.path.exists(dest_file):
              base, ext = os.path.splittext(file)
              i = 1
              while os.path.exists(dest_file):
                new_name = f"{base}_{i}{ext}"
                dest_file = os.path.join(new_path, new_name)
                i += 1

            os.rename(src_file, dest_file)

          # Remove the now-empty folder
          os.rmdir(dir_path)
          print(f"\t  🗃️ Moved files and deleted original folder: {dir_path}")

        except Exception as e:
          print(f"\t  ❌ Error while merging folders: {e}")
    else:
      print("\t🙈 No matching entry in the Photographer's Schedule")
      # Rename folder to add "_UNMATCHED"
      unmatched_name = f"{folder}_UNMATCHED"
      new_path = os.path.join(os.path.dirname(dir_path), unmatched_name)

      try: 
        os.rename(dir_path, new_path)
        write_log_row(folder, None, photographer, start_time, end_time, status='unmatched')
        print(f"\t   👻 Renamed unmatched folder to {unmatched_name}")
      except Exception as e:
        print(f"\t   ❌ Failed to rename unmatched folder: {e}")
  
  # print(f"\n✅ Done! Opening folder in Finder: {dcim_path}")    
  # subprocess.run(["open", dcim_path])   

if __name__ == "__main__":
  main()
      