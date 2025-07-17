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
def get_metadata(filepath: str) -> Optional[Tuple[str, str]]:
  try:
    # Run exiftool to get DateTimeOriginal and Artist fields
    result = subprocess.run(
      ['exiftool', '-DateTimeOriginal', 'Artist', filepath],
      capture_output=True, text=True
    )

    # Split the output into lines like
    # Date/Time Original : 2023:07:16 18:32:12
    # Artist             : Josh 
    lines = result.stdout.strip().split('\n')

    # Prepare placeholders
    date = artist = None

    # Loop through each line and extract values
    for line in lines:
      if 'Date/Time Original' in line:
        date = line.split(':', 1)[1].strip()
      elif 'Artist' in line:
        artist = line.split(':', 1)[1].strip()

      # If both values are found, return them
      if date and artist:
        return date, artist
      else:
        return None
    
  except Exception as e:
    # If exiftool failed or something went wrong print error
    print(f"Error reading {filepath}: {e}")
    return None
  
  # Get the metadata from the first and last image
  def get_first_and_last_data(dir_path: str) -> Optional[Tuple[str, str, str]]:
    # Get list of image files in the folder
    image_files = get_image_files(dir_path)
    length = len(image_files)

    # If there are no image files, stop early
    if not image_files:
      return None
    
    # Pick the first photo as the reference
    first_reference = get_metadata(os.path.join(dir_path, image_files[0]))
    if not first_reference:
      return None
    # Pick the last photo as the reference
    last_reference = get_metadata(os.path.join(dir_path, image_files[length - 1]))
    if not last_reference:
      return None
    
    start_time, artist = first_reference
    end_time, _ = last_reference
    # All matched: return the references
    return artist, start_time, end_time
      
    # if last_reference
    # # Loop through the rest of the list and compare
    # for fname in image_files[1:]:
    #   current = get_metadata(os.path.join(dir_path, fname))
    #   if current != reference:
    #   # If one photo is different, stope and return None
    #     return None