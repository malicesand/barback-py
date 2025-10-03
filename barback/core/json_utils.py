#
# Loads json files

import json
from pathlib import Path
from datetime import datetime

def load_schedule(prefix: str, folder: str = 'data') -> dict:
  """
  Loads a schedule JSON file for the given prefix from the specified folder.

  Args: 
    prefix (str): the prefix that identifies the file.
    folder (str): The folder where the JSON file is stored.

  Returns:
    dict: A dictionary with MEIDs as keys and [start, end] strings as values
  """

  filename = f'{folder}/schedule_{prefix}.json'
  path = Path(filename)

  if not path.exists():
    raise FileNotFoundError(f'Schedule file not found: {filename}')
  
  with open(path, 'r', encoding='utf-8') as f:
    raw_schedule = json.load(f)
  return parse_schedule(raw_schedule)
  
  
def parse_schedule(schedule: dict) -> dict:
  '''
  Converts start and end times in schedule from strings to datetime objects

  Returns: 
    dict: same as input but with datetime values
  '''

  return {
    meid: (
      datetime.fromisoformat(start),
      datetime.fromisoformat(end)
    )
    for meid, (start, end) in schedule.items()
  }
  
