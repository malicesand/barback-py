# Point of entry for loading schedule in any format

def load_schedule(prefix: str, format: str = 'json') -> dict:
  if format == 'json':
    from .json_utils import load_schedule as load_json
    return load_json(prefix)
  elif format == 'tsv':
    raise NotImplementedError("TSV loader is deprecated and not supported via schedule_loader.")
  else: 
    raise ValueError(f'Unsupported format: {format}')