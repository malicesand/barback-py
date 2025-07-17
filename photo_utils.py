# Import Python tools
import subprocess # to run exiftool
import os # to work with file paths
from typing import Optional, Tuple, List # type hints

# Functions: Get all image files in a directory
def get_image_files(dir_path: str) -> List[str]:
  # For loop through the folder
  # Return a list of files ending in (.NEF, .CR2, .ARW, .RAF)
  return [
    f for f in os.listdir(dir_path)
    if f.endswith(('.NEF', '.CR2', '.ARW', '.RAF'))
  ]

# Function: Read date + photographer from ONE image file
def get_metadata(filepath: str) -> Optional[str]:
  try:
    # Run exiftool to get DateTimeOriginal fields
    result = subprocess.run(
      ['exiftool', '-DateTimeOriginal', filepath],
      capture_output=True, text=True
    )

    # Split the output into lines like
    # Date/Time Original : 2023:07:16 18:32:12
    lines = result.stdout.strip().split('\n')

    # Loop through each line and extract values
    for line in lines:
      if 'Date/Time Original' in line:
        date = line.split(':', 1)[1].strip()
        return date
      
    return None # if no date found
    
  except Exception as e:
    # If exiftool failed or something went wrong print error
    print(f"Error reading {filepath}: {e}")
    return None
  
# Get the metadata from the first and last image
def get_first_and_last_data(dir_path: str) -> Optional[Tuple[str, str, str]]:
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

  # Extract initials from filename
  prefix = image_files[0].split('_')[0].upper()
  # All matched: return the references
  return prefix, start_time, end_time
      
    