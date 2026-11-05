"""Local operator commands: python -m backend.content.cli --help."""
import argparse
import json
from pathlib import Path

from backend.content.store import export_content, import_pilot
from backend.database import make_engine
from backend.settings import Settings


def main():
    parser = argparse.ArgumentParser(description="Import pilot or back up lesson content (no auth secrets)")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("import-pilot", help="Insert missing pilot/draft only; requires migrated database")
    export = commands.add_parser("export", help="Read-only consistent snapshot of all lesson content")
    export.add_argument("--output", type=Path, required=True, help="New private backup file; refuses overwrite")
    args = parser.parse_args()
    engine = make_engine(Settings.from_env().database_url)
    try:
        if args.command == "import-pilot":
            import_pilot(engine)
            print("Pilot import complete (existing content preserved).")
        else:
            # Serialize before opening the exclusive destination; a failed database
            # read cannot leave a partial backup masquerading as a complete one.
            data = json.dumps(export_content(engine), ensure_ascii=False, indent=2) + "\n"
            with args.output.open("x", encoding="utf-8", newline="\n") as stream:
                stream.write(data)
            print("Content backup complete. Keep the file private: it includes drafts.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
