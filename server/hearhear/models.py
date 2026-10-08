"""Tutor request and reply models: the single source for the tutor contracts.

`scripts/export_contracts.py` writes these to `contracts/tutor-*.schema.json`;
CI fails if the committed files drift. The proxy sends `TutorReply`'s schema to
Claude as a structured output (`output_config.format`), so every reply is
schema-shaped JSON. The API does not enforce numeric or length bounds in that
schema, so the proxy validates the full reply with these models regardless.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_NOTES = 400
MAX_HISTORY_TURNS = 12
MAX_MESSAGE_CHARS = 1000
MAX_TITLE_CHARS = 120
MAX_BODY_BYTES = 128 * 1024

# "review": read the whole chart (a question is optional). "question": answer
# the student's question about it.
Mode = Literal["review", "question"]
LabelStyle = Literal["roman", "nashville", "letters", "roman+letters"]

# Spelled pitch with octave, e.g. "F#4". Octaves 0-8 bound the piano range
# without sending MIDI numbers to Claude.
Pitch = Annotated[str, Field(pattern=r"^[A-G](##|bb|#|b)?[0-8]$")]
# Scale degree relative to the key hypothesis, e.g. "3", "b7", "#4".
Degree = Annotated[str, Field(pattern=r"^(##|bb|#|b)?[1-7]$")]
# Chord symbols only: no spaces or punctuation that could carry instructions into the prompt.
ChordLabel = Annotated[str, Field(pattern=r"^[A-Za-z0-9#°ø+/()?]{1,24}$")]
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
    beats: Annotated[float, Field(gt=0, le=96)]


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
    bars: Annotated[list[SnapshotBar], Field(max_length=400)]
    # Context for cultural grounding in the live app. The eval leaves it out,
    # so the model judges the melody rather than recalling a hymnal.
    title: (
        Annotated[
            str,
            Field(
                min_length=1,
                max_length=MAX_TITLE_CHARS,
                description="The song's title, for context. Optional; the eval omits it.",
            ),
        ]
        | None
    ) = None
    swing: (
        Annotated[
            float,
            Field(
                ge=1,
                le=3,
                description="The song's swing feel: the long:short ratio of an eighth-note "
                "pair (2 is triplet swing). Optional; absent plays straight.",
            ),
        ]
        | None
    ) = None
    # True while the app hides key labels (a demo before the student's guess).
    # The tutor must not name or hint at the key, and the server withholds
    # every suggestion, since a letter-name chord gives the key away.
    key_hidden: Annotated[
        bool,
        Field(
            description="True while key labels are hidden (a demo before the guess). "
            "The proxy then withholds every suggestion.",
        ),
    ] = False

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
    mode: Annotated[
        Mode,
        Field(
            description="review: read the whole chart (the question is optional). "
            "question: answer the student's question about the chart.",
        ),
    ]
    question: Annotated[str, Field(max_length=MAX_MESSAGE_CHARS)] | None = None
    history: Annotated[list[Turn], Field(max_length=MAX_HISTORY_TURNS)] = []

    @model_validator(mode="after")
    def _question_has_text(self) -> "TutorRequest":
        if self.mode == "question" and not (self.question or "").strip():
            raise ValueError("a question needs its text")
        return self


# --- Reply (the structured output Claude returns) --------------------------------


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
    """What Claude returns, constrained by structured outputs."""

    message: Annotated[
        str,
        Field(
            max_length=4000,
            description="What the tutor says, in the student's chord-label style.",
        ),
    ]
    suggestions: Annotated[list[Suggestion], Field(max_length=8)]
