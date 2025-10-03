import argparse
import sys

from barback import rename_files  # TODO own logic

def main():
    parser = argparse.ArgumentParser(
        description="Barback: photo ingest & renaming utility"
    )
    parser.add_argument(
        "path", 
        nargs="?", 
        default=".", 
        help="Path to photos folder (default: current directory)"
    )
    parser.add_argument(
        "--log", 
        action="store_true", 
        help="Write a run log"
    )
    args = parser.parse_args()

    # Call into your code
    try:
        rename_files.run(path=args.path, log=args.log)  # TODO adjust to function
        print(f"✅ Successfully processed {args.path}")
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
