import os
import subprocess
from photo_utils import get_first_and_last_data
from tsv_utils import match_tsv_row

MEDIA_ROOT = '/Volumes/'
TSV_PATH = "/data/metadata.tsv"

def main():
  # Access DCIM in Removable Media
  for drive in os.listdir(MEDIA_ROOT):
    drive_path = os.path.join(MEDIA_ROOT, drive)
    dcim_path = os.path.join(drive_path, 'DCIM')

    if not os.path.isdir(dcim_path):
      continue #skip if no DCIM folder

  # Loop through each subfolder in the removable media
  for folder in os.listdir(dcim_path):
    dir_path = os.path.join(dcim_path, folder)
    if not os.path.isdir(dir_path):
      continue

    print(f"\n Checking folder: {dir_path}")
    photo_data = get_first_and_last_data(dir_path)

    if not photo_data:
      print("Could not extract photo metadata")
      continue

    prefix, start_time, end_time, = photo_data
    print(f"Photographer: {prefix}")
    print(f"Range: {start_time} -> {end_time}")

    # Match the folder's metadata to a row in the TSV
    match = match_tsv_row(TSV_PATH, prefix, start_time, end_time)
    if match: 
      print(f"Matched MEID: {match}")
      # new_path = os.path.join(MEDIA_ROOT, match)
      new_path = os.path.join(os.path.dirname(dir_path), match)
      try: 
        os.rename(dir_path, new_path)
        print(f"Renamed folder to {match} ")
      except Exception as e:
        print(f"Failed to rename folder: {e}")
    else:
      print("No matching entry in the TSV")

      # Rename folder to add "_UNMATCHED"
      unmatched_index = 1
      unmatched_name = f"{folder}_UNMATCHED_{unmatched_index}"
      while os.path.exists(os.path.join(os.path.dirname(dir_path), unmatched_name)):
        unmatched_index += 1
        unmatched_name = f"{folder}_UNMATCHED_{unmatched_index}"

      new_path = os.path.join(os.path.dirname(dir_path), unmatched_name)

      try: 
        os.rename(dir_path, new_path)
        print(f"Renamed unmatched folder to {unmatched_name}")
      except Exception as e:
        print(f"Failed to rename unmatched folder: {e}")
  
    # End of your loop, after everything is done
    print(f"\n✅ Done! Opening folder in Finder: {MEDIA_ROOT}")
    subprocess.run(["open", MEDIA_ROOT])

  if __name__ == "__main__":
    main()
    

  
  """
  code for early bail
  # If first unmatched found, stop checking further
stop_on_first_unmatched = True

...

if match:
    ...
else:
    ...
    if stop_on_first_unmatched:
        break
  """

      