# barback/cli.py
import argparse
import sys
from barback import rename_files, thumbs

def main():
    p = argparse.ArgumentParser(prog="barback")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("rename"); r.add_argument("path")
    t = sub.add_parser("thumbs"); t.add_argument("path")

    args = p.parse_args()
    try:
        if args.cmd == "rename":
            rename_files.run(path=args.path)
        elif args.cmd == "thumbs":
            thumbs.build(path=args.path)
    except Exception as e:
        print(f"❌ {e}", file=sys.stderr); sys.exit(1)

if __name__ == "__main__":
    main()
'''
Electron call:
spawn(pythonCmd, ['-m', 'barback.cli', 'rename', volumePath], {stdio:['pipe','pipe','pipe']});

'''