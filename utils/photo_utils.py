# Import Python tools
import subprocess # to run exiftool
import os # to work with file paths
from typing import Optional, Tuple, List # type hints
import time #for exiftool throttling

# Functions: Get all image files in a directory
def get_image_files(dir_path: str) -> List[str]:
  # For loop through the folder
  # Return a list of files ending in (.NEF, .CR2, .ARW, .RAF, .jpg, .png)
  return [
    f for f in os.listdir(dir_path)
    if f.endswith(('.NEF', '.CR2', '.ARW', '.RAF', '.jpg', '.png', '.CR3'))
  ]

# Function: Read date + photographer from ONE image file
def get_metadata(filepath: str) -> Optional[str]:

  try:
    # Run exiftool to get DateTimeOriginal fields
    result = subprocess.run(
      ['exiftool', '-DateTimeOriginal', filepath],
      capture_output=True, text=True
    )
     # 50ms delay between calls
    time.sleep(0.05)
    
    # Split the output to match Date/Time Original : 2023:07:16 18:32:12
    lines = result.stdout.strip().split('\n')

    # Loop through each line and extract values
    for line in lines:
      if 'Date/Time Original' in line:
        date = line.split(':', 1)[1].strip()
        return date
      
    return None # if no date found
    
  except Exception as e:
    # If exiftool failed or something went wrong print error
    print(f"❌ Error reading {filepath}: {e}")
    return None

# Extract prefix from filename using longest match
def extract_known_prefix(filename: str, prefix_map: dict) -> Optional[str]:
  prefix_candidate = filename.upper()[:3]
  if prefix_candidate in prefix_map:
    return prefix_candidate
# for prefix in sorted(prefix_map, key=len, reverse=True):
#   if filename.upper().startswith(prefix):
#     return prefix
  return None

# Get the metadata from the first and last image
def get_first_and_last_data(dir_path: str, prefix_map: dict) -> Optional[Tuple[str, str, str]]:
  # Get list of image files in the folder
  image_files = get_image_files(dir_path)
  # If there are no image files, stop early
  if not image_files:
    return None

  # Sort image files so first and last match capture order
  image_files.sort()

  first_file = os.path.join(dir_path, image_files[0])
  last_file = os.path.join(dir_path, image_files[-1])

  # Get timestamps from EXIF data
  first_metadata = get_metadata(first_file)
  last_metadata = get_metadata(last_file)

  if not first_metadata or not last_metadata:
    return None

  start_time = first_metadata
  end_time  = last_metadata

  # Assign photographer based on prefix
  prefix = extract_known_prefix(image_files[0], prefix_map)
  if not prefix:
    print(f"⚠️  No matching prefix found for {image_files[0]}")
    return None
  photographer = prefix_map.get(prefix)
  if not photographer:
    print(f"⚠️  No matching photographer found for prefix {prefix}")
    return None


  # All matched: return the references
  return photographer, start_time, end_time
      
    