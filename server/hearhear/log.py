"""Structured logs: one JSON object per line on stdout, which Railway parses.

Callers pass only counts, codes, and ids. Never the student's text, the
snapshot, Claude's reply, or any key.
"""

import json
import logging
import sys
from typing import Any

_logger = logging.getLogger("hearhear")
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(logging.Formatter("%(message)s"))
_logger.addHandler(_handler)
_logger.setLevel(logging.INFO)
_logger.propagate = False


def log_event(event: str, level: int = logging.INFO, **fields: Any) -> None:
    _logger.log(level, json.dumps({"event": event, "level": logging.getLevelName(level), **fields}))
