import os
import csv
import sys
import subprocess
from pathlib import Path
from utils.photo_utils import get_first_and_last_data
from utils.prefix_utils import load_prefix_map
from utils.json_utils import load_schedule
from utils.match import match_photo_to_event
# from watch_card import IGNORE_LIST


VOLUMES_ROOT = "/Volumes/"

# Trigger with electron button <Run Rename>
def main():
  # When called from electron, base directory = the card
  base_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd() 
  dcim_path = base_dir / 'DCIM'
  prefix_map = load_prefix_map("data/prefix.tsv")  #prefix_utils.py

  # so I think we can just run this one!
  process_dcim(dcim_path, prefix_map)
  subprocess.run(["open", dcim_path])


# Read children in DCIM
# Extract metadata from the first and last photo in child
def process_dcim(dcim_path, prefix_map):
  
  schedule_cache = {}
  for folder in os.listdir(dcim_path):
    print(f"\t 🤔 Processing: {folder} ")
    dir_path = os.path.join(dcim_path, folder)
    if not os.path.isdir(dir_path):
      continue

    photo_data = get_first_and_last_data(dir_path, prefix_map) # photo_utils.py ---> metadata
    if not photo_data:
      continue
    photographer, start_time, end_time, = photo_data # photog initials & capture times 

    if photographer not in schedule_cache:
      schedule_cache[photographer] = load_schedule(photographer) #schedule_loader.py --> schedule_initials.json
    schedule = schedule_cache[photographer] 

    # Search schedule: {'MEID': ['start_time', 'end_time']}
    match = match_photo_to_event(schedule, start_time, end_time) # match.py ---> MEID 
    if match: 
      new_path = os.path.join(os.path.dirname(dir_path), match) 
      if not os.path.exists(new_path):
        try: 
          os.rename(dir_path, new_path) # --> /MEID
          write_log_row(folder, match, photographer, start_time, end_time, status='matched') 
          print(f"\t Folder renamed to {match} ")
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
          print(f"\t Moved files and deleted original folder: {dir_path}")

        except Exception as e:
          print(f"\t  ❌ Error while merging folders: {e}")
    else:
      # print("\n No matching entry in the Photographer's Schedule")
      # Rename folder to add "_UNMATCHED"
      unmatched_name = f"{folder}_UNMATCHED"
      new_path = os.path.join(os.path.dirname(dir_path), unmatched_name)

      try: 
        os.rename(dir_path, new_path)
        write_log_row(folder, photographer, start_time, end_time, status='unmatched') 
        # print(f"\t Renamed unmatched folder to {unmatched_name}")
      except Exception as e:
        print(f"\t ❌ Failed to rename unmatched folder: {e}")
  
  print(f"\n✅ Done! Opening folder in Finder: {dcim_path}")   #? Photo mechanic integration
  # subprocess.run(["open", dcim_path]) 
  
'''
Log Rename Process
Input:
  ** folder: Old folder name 
  *** prefix: Photographer's Initials
  ** Metadata from photo files in folder:
    *** start: capture time of first file
    *** end: capture time of last photo
  ** status: matched or unmatched
Return: ("old folder name", "photographer initials", "start", "end", "matched or unmatched" )
'''

LOG_PATH = 'run_log.csv' 
def write_log_row(folder, prefix, start, end, status): 
    log_exists = os.path.exists(LOG_PATH)
    with open(LOG_PATH, 'a', newline='') as f:
        writer = csv.writer(f)
        if not log_exists:
            writer.writerow(['folder', 'prefix', 'start', 'end', 'result', 'status'])  # header
        writer.writerow([folder, prefix, start, end, status])

if __name__ == "__main__":
  main()
      
  '''
  Revision TODO List
  
  #! run_log 
    # refactor function, function calls, and tsv headings (folder,prefix,start,end,result,status) to match
    # make time be time ran not start end
    # Write to it no matter what (even if no matching prefix por ejemplo)
  #? Photo mechanic integration / finder opens
    # Or open finder from actions
  #? prefix, photographer, and initials discrepancies
    - Might be ok
  '''