# Eval dataset

Four public-domain hymn tunes, each with reference chords read from a published public-domain harmonization. **Every tune is pending Matthew's ear check.**

## How the reference chords are made

No chord here was written from memory. `sources/` holds each tune's four-voice setting as the [Open Hymnal Project](http://openhymnal.org/) engraved it (ABC files, marked public domain, each naming the printed hymnal it follows). `derive.js` reads them:

- The soprano line becomes the melody, encoded in the song schema in `songs/`.
- A **change point** is the tune's first note or any beat where the melody starts a note, when the four voices there spell a chord different from the previous change point's. Beats where they don't spell a chord in the song schema's vocabulary (a passing or suspended tone on the beat, or a bare third) are skipped.
- The **reference chord** is the chord the four voices sound at that instant. A seventh chord may omit its fifth; when a sonority reads two ways (C6 or Am7), the reading with its root in the bass wins.

`node evals/dataset/derive.js` rewrites `songs/`; a test fails if the committed songs drift from what it derives. Each song is an excerpt (the first phrase or two), with key and meter confirmed, not provisional.

A reference chord is what one hymnal printed, not the only right answer. Hymnals harmonize densely (a chord on almost every beat), so a tutor suggesting a slower, equally good progression will miss some.

## Tunes

| Song file            | Tune and setting                                                                                                                                                                                            | Excerpt                       | Hard case                                                                | Reference chords (bar.beat)                                                                                               | Status                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `amazing-grace.json` | New Britain (1831). Setting: E. O. Excell, 1900, as printed in _Joy to the World_ (1915), hymn 209. [Source](http://openhymnal.org/Abc/Amazing_Grace-New_Britain.abc)                                       | G major, 3/4, pickup + 8 bars | Waltz time                                                               | 0.3 G; 2.3 D7; 3.1 Em; 3.3 C; 4.1 G; 6.3 D7; 7.1 G                                                                        | Pending Matthew's ear check |
| `joyful-joyful.json` | Hymn to Joy (Beethoven, adapted by Edward Hodges). Setting: _The Methodist Hymnal_ (1905), hymn 160. [Source](http://openhymnal.org/Abc/Joyful_Joyful_We_Adore_Thee-Ode_To_Joy.abc)                         | G major, 4/4, 4 bars          | None: the demo tune's melody, the easy case                              | 1.1 G; 2.4 D7; 3.1 G; 3.3 F#°; 3.4 G; 4.3 D                                                                               | Pending Matthew's ear check |
| `veni-emmanuel.json` | Veni Emmanuel (15th-century French processional). Setting: _Common Service Book_ (ULCA, 1917), hymn 1. [Source](http://openhymnal.org/Abc/O_Come_O_Come_Emmanuel-Veni_Emmanuel.abc)                         | E minor, 4/4, pickup + 5 bars | Relative-key ambiguity: an E minor melody whose setting leans on G major | 1.1 Em; 1.2 Bm; 1.3 G; 2.1 C6; 2.2 Am7; 2.3 G; 2.4 D7; 3.1 G; 3.4 D; 4.1 G; 4.3 C; 4.4 G; 5.1 Am; 5.2 F#°; 5.3 Em; 5.4 Bm | Pending Matthew's ear check |
| `god-rest-ye.json`   | God Rest Ye Merry, Gentlemen (traditional English). Setting: _Carols Old and Carols New_ (1918), carol 722. [Source](http://openhymnal.org/Abc/God_Rest_Ye_Merry_Gentlemen-God_Rest_Ye_Merry_Gentlemen.abc) | E minor, 4/4, pickup + 4 bars | Minor key with a raised leading tone (D#) in the half cadence            | 1.2 Em; 1.3 B; 1.4 B7; 2.1 Em; 2.2 Bm; 2.3 C; 2.4 G; 3.1 C; 3.2 B; 3.3 Em; 3.4 Am; 4.1 B                                  | Pending Matthew's ear check |

Bar 0 is the pickup. Veni Emmanuel has 16 of the 41 change points, so it weighs most in the totals.

## Considered and dropped

- **What Child Is This (Greensleeves).** Open Hymnal transcribed it from _Lutheran Worship_ (1982), noting "very tiny changes" from the 1871 hymnal it credits, so the printed source isn't clearly public domain.
- **Blue notes** (a PRD hard case): hymnals don't harmonize them, and no citable public-domain blues harmonization was looked for in this pass. Listed as a gap rather than written from memory. Secondary dominants appear once: Veni Emmanuel's D7 at 2.4 is V7 of III, the relative major.
