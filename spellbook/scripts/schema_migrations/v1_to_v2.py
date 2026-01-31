"""Schema migration helper: v1 -> v2.

Usage (with active virtual environment):
  python spellbook/scripts/schema_migrations/v1_to_v2.py < input.json > output.json
"""

import json
import sys


def main() -> None:
    payload = json.load(sys.stdin)
    report = {"from_version": 1, "to_version": 2, "notes": []}
    if isinstance(payload, dict):
        payload["schema_version"] = 2
        report["notes"].append("Set schema_version to 2")
    json.dump(payload, sys.stdout, separators=(",", ":"), ensure_ascii=False)
    print(json.dumps(report, separators=(",", ":")), file=sys.stderr)


if __name__ == "__main__":
    main()
