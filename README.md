# Hear Hear

An ear-training tutor for working out piano music by ear. **Think in relationships, not pitches:** the number row is the instrument (1 is always home), chords are numbers, and Claude is a tutor whose every suggestion comes back as something you can _play_, so your ear is the verifier.

**Try it now, nothing to install: [hearhear.up.railway.app](https://hearhear.up.railway.app).** Start with the 90-second guided demo; no musical background needed. The live Claude tutor takes the passphrase from the submission email, and everything else, including the demo's recorded tutor replies, is open.

**Cut for depth over breadth** (the full list is in [docs/backlog.md](docs/backlog.md)):

- Microphone transcription: rhythm is the hard problem, and existing tools already do it well.
- MIDI keyboard and humming input: the number row comes first, because it enters relationships, not pitches.
- Meter finding (a 3-versus-4 click test is designed) and time signatures beyond the current set.
- Saving beyond the browser tab: songs are remembered only until the tab closes; sign-in is next.
- A count-in, so phrase recording handles pickups.

Why it's built this way: [DECISIONS.md](DECISIONS.md) and [docs/rationale-notes.md](docs/rationale-notes.md). The original product brief is [docs/PRD.md](docs/PRD.md).

## Run it locally

Requires Node 26 (`.nvmrc`), [uv](https://docs.astral.sh/uv/), and Python 3.13 (uv installs it).

```sh
git clone https://github.com/matthewpoe/hearhear && cd hearhear
make install
make dev        # app on http://localhost:5173, API on :8000
```

The tutor runs in fixture mode by default, so no API key is needed. `make check` runs everything CI runs. `make eval-live` and `make capture-lessons` call the live tutor (they ask before spending anything); the second records the demo's lessons, as `content/lessons/README.md` describes.

## Environment

The tutor proxy reads these from the environment (Railway variables in production). `.env.example` lists them with their defaults. Nothing loads `.env` automatically, so export them in the shell that runs `make dev`.

| Variable                   | Default             | What                                                                                                                                                    |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TUTOR_MODE`               | `fixture`           | `fixture` replays recorded shapes with no key; `live` calls Claude.                                                                                     |
| `TUTOR_MODEL`              | `claude-opus-5-5`   | The model live mode asks for.                                                                                                                           |
| `ANTHROPIC_API_KEY`        | (none)              | Required when `TUTOR_MODE=live`; the server refuses to start without it. Never logged.                                                                  |
| `TUTOR_ACCESS_CODE`        | (none)              | The live tutor's passphrase, set only in the host's environment. Required when `TUTOR_MODE=live`; the server refuses to start without it. Never logged. |
| `TUTOR_DAILY_TOKEN_BUDGET` | `500000`            | Input plus output tokens per UTC day, in memory. The hard cap is the Console spend limit.                                                               |
| `TUTOR_RATE_LIMIT`         | `10/minute;100/day` | Per-client-IP limit on `/api/tutor`, in slowapi syntax. The eval harness raises it.                                                                     |
| `TUTOR_MAX_CONCURRENT`     | `4`                 | Live streams in flight at once, across every IP. Past it, a request gets `503 busy` at once rather than waiting.                                        |

## Where things are

- `docs/PRD.md`: the build prompt.
- `DECISIONS.md`: every decision and the alternatives rejected.
- `contracts/`: the interfaces the parallel workstreams build against.
- `src/theory`: pure music theory, shared by the app and the eval harness.
- `src/store`: the one song model.
- `server/`: the FastAPI tutor proxy.

## License

Piano samples: Salamander Grand Piano by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) (details in `public/samples/piano/SOURCES.md`).

MIT. Jost is under the SIL Open Font License (`public/fonts/jost/OFL.txt`).
