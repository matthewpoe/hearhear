"""The tutor request's song bounds match contracts/song.schema.json, the song's
own contract, so a song the app accepts is a snapshot the server accepts."""

import json
import re
from typing import Any

import pytest
from helpers import REPO_ROOT, SNAPSHOT
from pydantic import ValidationError

from hearhear.models import Snapshot, TutorRequest
from hearhear.prompt import user_message

SONG_SCHEMA = json.loads((REPO_ROOT / "contracts" / "song.schema.json").read_text())
SONG = SONG_SCHEMA["properties"]


def _bounds(field: str) -> dict[str, Any]:
    """The bounds Pydantic puts on a Snapshot field, as JSON Schema names them."""
    schema = Snapshot.model_json_schema()["properties"][field]
    # An optional field is anyOf [the bounded type, null].
    rule = next((r for r in schema.get("anyOf", [schema]) if r.get("type") != "null"), schema)
    return {k: rule[k] for k in ("minimum", "maximum", "minLength", "maxLength") if k in rule}


def test_swing_range_matches_the_song_schema() -> None:
    assert _bounds("swing") == {
        "minimum": SONG["swing"]["minimum"],
        "maximum": SONG["swing"]["maximum"],
    }


@pytest.mark.parametrize("swing", [1, 2, 2.5, 3])
def test_swing_is_accepted_within_its_range(swing: float) -> None:
    request = TutorRequest.model_validate({"snapshot": {**SNAPSHOT, "swing": swing}})
    assert request.snapshot.swing == swing


def test_swing_is_optional() -> None:
    assert TutorRequest.model_validate({"snapshot": SNAPSHOT}).snapshot.swing is None


@pytest.mark.parametrize("swing", [0, 0.99, 3.01, 10, "fast"])
def test_swing_outside_its_range_is_refused(swing: Any) -> None:
    with pytest.raises(ValidationError):
        TutorRequest.model_validate({"snapshot": {**SNAPSHOT, "swing": swing}})


def _snapshot_data(snapshot: dict[str, Any]) -> Any:
    text = user_message(TutorRequest.model_validate({"snapshot": snapshot}))
    (body,) = re.findall(r"<snapshot>(.*?)</snapshot>", text, flags=re.S)
    return json.loads(body)


def test_swing_goes_as_data_when_sent_and_is_absent_otherwise() -> None:
    assert "swing" not in _snapshot_data(SNAPSHOT)
    assert _snapshot_data({**SNAPSHOT, "swing": 2})["swing"] == 2
