# Matches photo data to json schedule

from datetime import datetime, timezone, timedelta
from typing import Optional

central = timezone(timedelta(hours=-5))

def match_photo_to_event(schedule: dict, photo_start: str, photo_end: str) -> Optional[str]:
  try: 
    photo_start_dt = datetime.strptime(photo_start.strip(), "%Y:%m:%d %H:%M:%S").replace(tzinfo=central)
    photo_end_dt = datetime.strptime(photo_end.strip(), "%Y:%m:%d %H:%M:%S").replace(tzinfo=central)
  except Exception as e: 
    print(f"Photo time parsing error: {e}")
    return None
  
  for meid, (event_start, event_end) in schedule.items():
    if event_start <= photo_start_dt and photo_end_dt <= event_end:
      return meid
    
  return None