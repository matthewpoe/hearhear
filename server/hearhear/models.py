"""Tutor request and reply models: the single source for the tutor contracts.

`scripts/export_contracts.py` writes these to `contracts/tutor-*.schema.json`;
CI fails if the committed files drift. The proxy sends `TutorReply`'s schema to
Claude as the forced tool's `input_schema` and validates the tool output with it.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_NOTES = 400
MAX_HISTORY_TURNS = 12
MAX_MESSAGE_CHARS = 1000

HintLevel = Literal["nudge", "comparison", "answer"]
LabelStyle = Literal["roman", "nashville", "letters", "roman+letters"]

# Spelled pitch with octave, e.g. "F#4". Octaves 0-8 bound the piano range
# without sending MIDI numbers to Claude.
Pitch = Annotated[str, Field(pattern=r"^[A-G](##|bb|#|b)?[0-8]$")]
# Scale degree relative to the key hypothesis, e.g. "3", "b7", "#4".
Degree = Annotated[str, Field(pattern=r"^(##|bb|#|b)?[1-7]$")]
ChordLabel = Annotated[str, Field(min_length=1, max_length=24)]
Beat = Annotated[float, Field(ge=1, le=13)]
Bar = Annotated[int, Field(ge=0, le=999)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# --- Request -----------------------------------------------------------------


class SnapshotKey(Strict):
    tonic: Annotated[str, Field(pattern=r"^[A-G](#|b)?$")]
    mode: Literal["major", "minor"]
    provisional: bool


class SnapshotMeter(Strict):
    beats_per_bar: Annotated[int, Field(ge=2, le=12)]
    beat_unit: Literal[4, 8]
    pickup_beats: Annotated[float, Field(ge=0, le=12)]
    provisional: bool


class SnapshotNote(Strict):
    beat: Beat
    pitch: Pitch
    degree: Degree
    beats: Annotated[float, Field(gt=0, le=48)]


class SnapshotChord(Strict):
    beat: Beat
    numeral: ChordLabel
    nashville: ChordLabel
    letter: ChordLabel


class SnapshotBar(Strict):
    """Bar 0 is the pickup, when there is one."""

    bar: Bar
    notes: Annotated[list[SnapshotNote], Field(max_length=48)]
    chords: Annotated[list[SnapshotChord], Field(max_length=48)]


class Snapshot(Strict):
    """Readable bar-by-bar view built by `toTutorSnapshot` in src/store/snapshot.js."""

    version: Annotated[int, Field(ge=0)]
    key: SnapshotKey
    meter: SnapshotMeter
    tempo: Annotated[int, Field(ge=30, le=240)]
    label_style: LabelStyle
    bars: Annotated[list[SnapshotBar], Field(max_length=200)]

    @model_validator(mode="after")
    def _bound_total_notes(self) -> "Snapshot":
        total = sum(len(bar.notes) for bar in self.bars)
        if total > MAX_NOTES:
            raise ValueError(f"at most {MAX_NOTES} notes")
        return self


class Turn(Strict):
    role: Literal["student", "tutor"]
    text: Annotated[str, Field(max_length=4000)]


class TutorRequest(Strict):
    snapshot: Snapshot
    hint_level: HintLevel = "nudge"
    question: Annotated[str, Field(max_length=MAX_MESSAGE_CHARS)] | None = None
    history: Annotated[list[Turn], Field(max_length=MAX_HISTORY_TURNS)] = []


# --- Reply (the forced tool's input) ---------------------------------------------


class Suggestion(Strict):
    """One audition-able chord at a position. The client re-derives `letter` from
    `numeral` and the key, and drops the suggestion if they disagree."""

    bar: Bar
    beat: Beat
    numeral: Annotated[
        ChordLabel,
        Field(description="Canonical Roman numeral, e.g. 'V7', 'ii', 'bVII', 'vii°', 'V7/IV'."),
    ]
    letter: Annotated[ChordLabel, Field(description="Letter-name symbol, e.g. 'A7', 'Em'.")]
    confidence: Literal["low", "medium", "high"]
    reason: Annotated[str, Field(max_length=400)]


class TutorReply(Strict):
    """What Claude must return via the forced `tutor_reply` tool."""

    hint_level: HintLevel
    message: Annotated[
        str,
        Field(
            max_length=4000,
            description="What the tutor says, in the student's chord-label style.",
        ),
    ]
    suggestions: Annotated[list[Suggestion], Field(max_length=8)]
