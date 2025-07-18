import csv 
# Reads prefix.tsv
# Returns new empty directory (dict) of every photographer's prefix
def load_prefix_map(tsv_path: str) -> dict: 
  prefix_map = {} # Empty dictionary
  with open(tsv.path, newline='') as tsvfile:
    reader = csv.DictReader(tsvfile, delimiter='\t')
    for row in reader:
      # Remove leading and trailing characters and convert to upper
      prefix = row['prefix'].strip().upper() 
      photographer = row['photographer'].strip()
      prefix.map[prefix] = photographer
  return prefix_map