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

## Where things are

- `docs/PRD.md`: the build prompt.
- `DECISIONS.md`: every decision and the alternatives rejected.
- `contracts/`: the interfaces the parallel workstreams build against.
- `src/theory`: pure music theory, shared by the app and the eval harness.
- `src/store`: the one song model.
- `server/`: the FastAPI tutor proxy.

## License

MIT. Jost is under the SIL Open Font License (`public/fonts/jost/OFL.txt`).
