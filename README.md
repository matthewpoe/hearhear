# Hear Hear

An ear-training tutor for working out piano music by ear. **Think in relationships, not pitches:** the number row is the instrument (1 is always home), chords are numbers, and Claude is a tutor whose every suggestion comes back as something you can _play_, so your ear is the verifier.

> Status: Phase 0 (foundation and contracts). The guided 90-second demo link lands here when it exists.

## Run it

Requires Node 26 (`.nvmrc`), [uv](https://docs.astral.sh/uv/), and Python 3.13 (uv installs it).

```sh
git clone https://github.com/matthewpoe/hearhear && cd hearhear
make install
make dev        # app on http://localhost:5173, API on :8000
```

The tutor runs in fixture mode by default, so no API key is needed. `make check` runs everything CI runs.

## Environment

The tutor proxy reads these from the environment (Railway variables in production). `.env.example` lists them with their defaults. Nothing loads `.env` automatically, so export them in the shell that runs `make dev`.

| Variable                   | Default             | What                                                                                      |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `TUTOR_MODE`               | `fixture`           | `fixture` replays recorded shapes with no key; `live` calls Claude.                       |
| `TUTOR_MODEL`              | `claude-opus-5-5`   | The model live mode asks for.                                                             |
| `ANTHROPIC_API_KEY`        | (none)              | Required when `TUTOR_MODE=live`; the server refuses to start without it. Never logged.    |
| `TUTOR_DAILY_TOKEN_BUDGET` | `500000`            | Input plus output tokens per UTC day, in memory. The hard cap is the Console spend limit. |
| `TUTOR_RATE_LIMIT`         | `10/minute;100/day` | Per-client-IP limit on `/api/tutor`, in slowapi syntax. The eval harness raises it.       |

## Where things are

- `docs/PRD.md`: the build prompt.
- `DECISIONS.md`: every decision and the alternatives rejected.
- `contracts/`: the interfaces the parallel workstreams build against.
- `src/theory`: pure music theory, shared by the app and the eval harness.
- `src/store`: the one song model.
- `server/`: the FastAPI tutor proxy.

## License

MIT. Jost is under the SIL Open Font License (`public/fonts/jost/OFL.txt`).
