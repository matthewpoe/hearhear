# Deferred findings

Review findings Matthew and Claude decided not to act on yet, with the reason, so each can be revisited. Anything a fixer couldn't apply well also lands here. Remove an entry when it's resolved, and note how in `DECISIONS.md`.

| Source              | Severity | Finding                                                                                      | Why deferred                                                                                         | Revisit                                    |
| ------------------- | -------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Fable, contracts v2 | low      | No test checks that the contract modules export exactly what `contracts/README.md` lists.    | The README table is hand-maintained and the drift risk is low while streams are actively reading it. | Before the final review                    |
| Fable, contracts v2 | low      | `.claude/workflows/fix-round.js` hardcodes the session model in the commit attribution line. | It's accurate for the model that runs the workflow; parameterizing it adds a knob nobody turns.      | Only if the workflow runs on another model |
| Fable, contracts v2 | low      | The `.playwright-mcp/` ignore lines are unrelated to the contracts.                          | Deliberate: an agent's browser tool wrote output there and broke the lint step.                      | None needed                                |
| Triage, Stream C    | low      | Triplets render as abcjs approximations, not true tuplets.                                   | Neither demo tune has triplets; scheduled for wave 2.                                                | Wave 2                                     |
