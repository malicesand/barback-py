# Read the TSV file
# for each row: 
#   if the photographer matches:
#   convert the photo start/end and row start/end into datetime objects
#   check if photo_start >= row_start AND photo_end <= row_end
#   if true, return the MEID
#   if no match, return none

import csv
from typing import Optional
from datetime import datetime

def match_tsv_row(tsv_path: str, photographer: str, photo_start: str, photo_end: str) -> Optional[str]:
  """
  Match photo metadata to an event row in the TSV
  Returns the MEID if a match is found.
  """
  with open (tsv_path, newline='') as file:
    reader = csv.DictReader(file, delimiter='\t')
    for row in reader:
      row_photog = row['AssignedPhotographer'].strip()
      if row_photog != photographer:
        continue

      # Parse all times as datetime objects
      try: 
        row_start = datetime.strptime(row['start.dateTime'].strip(), "%Y-%m-%d %H:%M:%S")
        row_end = datetime.strptime(row['end.dateTime'].strip(), "%Y-%m-%d %H:%M:%S")
        photo_start_dt = datetime.strptime(photo_start.strip(), "%Y:%m:%d %H:%M:%S")
        photo_end_dt = datetime.strptime(photo_end.strip(), "%Y:%m:%d %H:%M:%S")
      except Exception as e:
        print(f"⏰ Time parsing error: {e}")
        continue

      # Check if photo range falls withing row range
      if row_start <= photo_start_dt and photo_end_dt <= row_end:
        return row['MEID']
      
  return None

