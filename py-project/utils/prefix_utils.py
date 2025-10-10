import csv 
# import os
# Reads prefix.tsv
# Returns new directory (dict) of every photographer's prefix
tsv_path = 'data/prefix.tsv'
# tsv_path = os.path.join(os.path.dirname(__file__), 'data/prefix.tsv')

def load_prefix_map(tsv_path: str) -> dict: 
  prefix_map = {} # Empty dictionary
  with open(tsv_path, newline='') as tsvfile:
    reader = csv.DictReader(tsvfile, delimiter='\t')
    for row in reader:
      # Remove leading and trailing characters and convert to upper
      photographer = row['photographer'].strip()
      prefix_map[row['prefix'].strip()] = photographer
  return prefix_map