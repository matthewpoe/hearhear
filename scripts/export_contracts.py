"""Write the tutor JSON Schemas from the Pydantic models, or check them for drift.

Usage: uv run python scripts/export_contracts.py [--check]
"""

import json
import sys
from pathlib import Path

from pydantic import BaseModel

from hearhear.models import TutorReply, TutorRequest

CONTRACTS = Path(__file__).resolve().parents[1] / "contracts"
TARGETS: dict[str, type[BaseModel]] = {
    "tutor-tool.schema.json": TutorReply,
    "tutor-request.schema.json": TutorRequest,
}


def render(model: type[BaseModel]) -> str:
    return json.dumps(model.model_json_schema(), indent=2, ensure_ascii=False) + "\n"


def main(check: bool) -> int:
    stale = []
    for name, model in TARGETS.items():
        path = CONTRACTS / name
        expected = render(model)
        if check:
            if not path.exists() or path.read_text() != expected:
                stale.append(name)
        else:
            path.write_text(expected)
    if stale:
        print(f"Stale contracts: {', '.join(stale)}. Run `make contracts`.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(check="--check" in sys.argv))
