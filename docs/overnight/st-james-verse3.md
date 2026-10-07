# St. James Infirmary: verse 3 under the notes

**Status: pending Matthew's ear check.**

Source: "St. James Infirmary" by "Joe Primrose" (Irving Mills), Gotham Music Service, © 1930, the "Mournfully" section on page 4 (provenance in `content/songs/SOURCES.md`). The demo encodes its first eight bars plus the pickup, in `content/songs/st-james-infirmary.json`.

## What the edition prints

The edition prints all three verses under one melody line, stacked. Verse 3's words for these bars:

> I went down to Saint James Infirmary,
> Saw my baby there,
> Stretched on a long white table,
> So sweet, so cold, so bare.

In these eight bars, verse 3 lines up with the printed notes exactly as verse 1 does, one syllable per note. Verse 3 never needs a note split or merged here. Where the verses do differ ("Let 'er go, let 'er go" against "I tried to keep from cryin'"), the edition prints small extra notes, but that's after bar 8, outside the demo.

## The one change: "In-fir-ma-ry"

The edition prints bar 2 as G eighth, E eighth, then a curve to an E dotted half, with "mary" set as a single word under the E's. Before this change, the demo read the curve as a tie and played one E for 3½ beats, so "ma-ry" got only one attack. Sung as four syllables, the word wants the E struck twice: "ma" on the eighth, "ry" on the dotted half. The demo now splits it. That gives "fir" the downbeat and "ry" beat 2, the stress the word has when spoken.

This is a judgment call. If you hear the word as three syllables ("In-firm'ry"), going back is one edit: merge `n9` and `n1c` into a single E of 42 ticks.

## Syllable by syllable

The edition's cut time is written as 4/4 with the same rhythm, so beats below are quarter notes. Bar 0 is the pickup. "&" is the second eighth of a beat.

| Bar.beat | Note | Duration                                         | Syllable  |
| -------- | ---- | ------------------------------------------------ | --------- |
| 0.4      | B4   | quarter                                          | I         |
| 1.1      | B4   | quarter                                          | went      |
| 1.2      | B4   | eighth                                           | down      |
| 1.2&     | B4   | eighth                                           | to        |
| 1.3      | A4   | quarter                                          | Saint     |
| 1.4      | B4   | eighth                                           | James     |
| 1.4&     | B4   | eighth                                           | In-       |
| 2.1      | G4   | eighth                                           | -fir-     |
| 2.1&     | E4   | eighth                                           | -ma-      |
| 2.2      | E4   | dotted half                                      | -ry,      |
| 3.1      | B4   | quarter                                          | Saw       |
| 3.2      | B4   | quarter                                          | my        |
| 3.3      | E5   | dotted quarter                                   | ba-       |
| 3.4&     | C5   | eighth                                           | -by       |
| 4.1      | B4   | whole                                            | there,    |
| 5.1      | B4   | quarter                                          | Stretched |
| 5.2      | B4   | eighth                                           | on        |
| 5.2&     | B4   | eighth                                           | a         |
| 5.3      | A4   | quarter                                          | long      |
| 5.4      | B4   | quarter                                          | white     |
| 6.1      | G4   | eighth                                           | ta-       |
| 6.1&     | E4   | eighth tied to half tied to eighth (three beats) | -ble,     |
| 6.4&     | E4   | eighth                                           | So        |
| 7.1      | G4   | dotted quarter                                   | sweet,    |
| 7.2&     | G4   | eighth                                           | so        |
| 7.3      | G4   | quarter                                          | cold,     |
| 7.4      | F#4  | quarter                                          | so        |
| 8.1      | E4   | dotted half                                      | bare.     |
