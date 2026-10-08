# Rehearsal script: the 5-minute video

Shot-by-shot script for the rationale video, recorded by hand on the live site. The spoken lines are my own talk-track notes, tightened and set against the demo. A short **[note]** marks each place the wording was changed for accuracy. Beats marked **[lands tonight]** depend on changes not yet on `main` as this was written; check each one in rehearsal and use its fallback line if it isn't live.

The brief asks the video to cover five things. Where each one is spoken:

| Brief's point                         | Beat                 |
| ------------------------------------- | -------------------- |
| 1. Why this theme and approach        | 1                    |
| 2. What's interesting or non-obvious  | 2, and 5 (the tutor) |
| 3. Key design decisions and tradeoffs | 3, 4, 7              |
| 4. How I'd extend it with more time   | 8                    |
| 5. Roughly how long I spent           | 9                    |

Songs: **When the Saints Go Marching In** (F major, ends on home) for the 1·2·3 spine, **St. James Infirmary** (E minor, swung) for the tutor, and a short phrase I record myself. No lyrics are spoken anywhere in the video.

## Pre-flight (do all of it before the 20-minute rehearsal, then again before the take)

- [ ] **Live site is up and live:** https://hearhear.up.railway.app loads, and `/api/health` reports live mode. Tonight's merges have deployed (the first screen shows only the song list and "You can record your own once you get the hang of it.").
- [ ] **Fresh session, so onboarding shows:** close every tab of the site, then open a new window (not a reload: a reload reopens the last song from sessionStorage).
- [ ] **Passphrase, off camera:** before recording starts, open the site with the `#code=` link from the submission (the app reads it into the tab's sessionStorage and strips it from the address bar) or type it into the tutor panel. Confirm the address bar no longer shows it. Never say it or show it on camera.
- [ ] **Audio unlocked:** click once on the first screen so the browser lets sound play, and check the level in the recording software with a Play of any song. Mac output volume at a level that doesn't clip.
- [ ] **Browser zoom:** 100% (or 110% if the staff reads small in the capture). Window at 1440 x 900 or the capture's native size. Light theme, unless the dark staff reads better on camera.
- [ ] **Close other tabs** and quit Slack, mail, and anything that notifies. Do Not Disturb on. Hide the bookmarks bar.
- [ ] **Beginner tips:** they're on by default for a first visit. Decide in rehearsal whether to let them show (good for the "no expertise needed" point) or dismiss each with ×.
- [ ] **Tutor tab, set up off camera:** the review needs chords on the whole tune, and placing them all on camera would eat the minute. In a second tab, open the site with the `#code=<passphrase>` link (sessionStorage is per tab, so this tab needs it too), load St. James Infirmary, pick E minor, and place my own chords under every bar. Leave that tab open; beat 5 switches to it. Don't press "Review my chords" in it yet.
- [ ] **Tutor warm-up:** in rehearsal, use a third tab set up the same way, press "Review my chords" once, and note how long the first text takes. If it's over about 8 seconds, plan to talk through the wait (line below). Note which spots it picks and which cards it offers, so I know where to click on camera.
- [ ] **Print check:** in rehearsal, open More → Print once so the browser's print dialog isn't a surprise in beat 6. Cancel it on camera; don't wait for a printer.
- [ ] **Eval numbers:** copy tonight's live headline numbers from `evals/results/README.md` into the brackets in beat 7 before recording.
- [ ] **Backup take:** in rehearsal, screen-record one good review (beat 5), from the button press through auditioning one card. If the live tutor fails during the real take and I'm editing, splice it in.

## The script (5:00)

| #   | Time      | Beat                                   | Brief's point      | Song                      |
| --- | --------- | -------------------------------------- | ------------------ | ------------------------- |
| 1   | 0:00–0:35 | Why I built it; pick a song            | 1                  | first screen, then Saints |
| 2   | 0:35–1:10 | Find home, with hints                  | 2                  | Saints                    |
| 3   | 1:10–1:55 | Place a chord, audition it two ways    | 3                  | Saints                    |
| 4   | 1:55–2:20 | Relationships: Nashville and transpose | 3 (the North Star) | Saints                    |
| 5   | 2:20–3:20 | The live tutor reviews my chords       | 2                  | St. James                 |
| 6   | 3:20–3:50 | Record your own; a lead sheet for free | 3                  | my phrase                 |
| 7   | 3:50–4:15 | Evals: what I chose to measure         | 3                  | eval results page         |
| 8   | 4:15–4:40 | What I'd build next                    | 4                  | the app, idle             |
| 9   | 4:40–5:00 | Time spent, and close                  | 5                  | first screen              |

### 1. Why I built it (0:00–0:35) [lands tonight]

**On screen:** the first screen: the song list and "You can record your own once you get the hang of it." Don't click yet.

> I've been using Claude for ear training as a chatbot, and it isn't the best way to do it. I describe what I'm playing and where I think the chords go, then ask Claude to draw the lead sheet and talk me through the theory. Music wants to be seen and heard, not described. So I built Hear Hear: the same lessons, but visual and playable.

**Click:** When the Saints Go Marching In. The 1·2·3 spine appears. Press Play; let a phrase sound, then Pause.

> Three steps: pick a song, find home, place a chord.

### 2. Find home (0:35–1:10) [lands tonight]

**Click:** "Give me a hint" once (where the tune comes to rest), then again (the notes with their sharps and flats; the drone keys light on the piano).

> The thing I find non-obvious is that you can learn this at the piano as a curious student. The point is to develop my own ear. I do the interesting work, the listening, and Claude speeds up the most painful parts. If I'm stuck I get one clue at a time: where it comes to rest, then the notes it uses. I can hold home underneath and hear if the melody settles.

**Click:** F major. Labels, numbers and colors fill in.

> I'll say F. Now everything is numbered from home.

**Fallback (hints aren't live):** use "Not sure? Help me find it" and the drone comparison. _"If I'm stuck, I can hear the tune over three candidate homes and choose the one that settles."_

### 3. Place a chord (1:10–1:55) [lands tonight]

**Click:** the G in bar 14, beat 3 (the second-to-last note). Open the dropdown and hover two options so each plays under the bar. Flip the Voice leading switch in the Chords panel and hover one again.

> A main design decision was that this should be fun and pleasant to use. Before I thought about the stack, I thought about how I wanted people to feel: invited, engaged, colorful, playful, in a New Orleans palette, with the chord colors following Bauhaus shapes. And it supports doing the hard work with your own ear instead of being fed answers. I experiment, hear what sounds better, and audition it different ways, here with and without voice leading.

**Click:** choose V. Point at the relationship it describes (the melody note is this chord's 5th; V is tension that wants to come home).

> It doesn't give me a verdict. It tells me the relationship, and one thing to try next.

**Click:** the F in bar 15, choose I. Let the V-I landing play.

[note] Two palettes: the interface uses the Mardi Gras trio (violet for what you do, green for what you hear, gold for the melody sounding now), and chord functions use the Bauhaus pairing (blue circle home, yellow triangle moving away, red square tension).

**Fallback (relationship text isn't live):** _"Each option shows what the melody note is over that chord, its root, 3rd or 5th, so I learn why, not just what."_

### 4. Relationships, not pitches (1:55–2:20)

**Click:** label style to Nashville. Then "Play it in another key" in the key box, choose G. Play bars 14–15.

> A second goal is thinking in relationships instead of notes and keys, the way jazz, classical and Nashville Number System players do. 5 goes to 1 in any key. I can move a song up or down and rearrange it in my head. For me that's the fun of music.

### 5. The live tutor reviews my chords (2:20–3:20) [lands tonight]

**Click:** switch to the tutor tab (set up in pre-flight): St. James Infirmary, E minor, my own chords already under every bar. Play the first four bars, then Pause.

> I've put my own chords under the whole tune. Now Claude is the expert piano tutor who fills the gaps. I love New Orleans jazz, and there's cultural history behind why certain chord patterns get used. Claude is great at that.

**Click:** "Review my chords". Let it stream; don't read it all. Point at the opening (the structural finding: what repeats, and where a repeat comes back changed), then at the paragraph naming what the harmony is doing.

> It reviews my chart like a teacher: first the shape, what repeats and what comes back changed. Then the theory and culture behind my chords, and spots worth another listen.

**Click:** one of the spots it names. Open the chord menu: its alternatives are cards A, B and C. Hover A, then B (each card rings its note on the staff); press "Hear it" on one, then "Compare" against my own chord.

> Every chord it suggests is a card I can play against mine. It never does the ear work for me; it hands me things to hear and compare. Claude's sometimes confidently wrong about music, so my ear decides.

**Point at:** the numbered listening tests at the end of the review, and the question box below it.

> And I can still ask about one bar.

[note] "Confidently wrong" comes from the rationale notes, not this talk-track. It's the reason the suggestions are playable; cut it if it doesn't feel like yours.

[note] The old take asked a question and opened "From the tutor" in the dropdown. The tutor now reviews the whole chart instead: the most interesting structural finding first, the harmony with named theory and tradition, up to three spots worth another listen, alternatives as playable cards, and up to three numbered listening tests. No line says the tutor holds answers back or nudges one hint at a time (that mode is gone); the framing is that it never does the ear work: it reviews _my_ chart and hands me things to hear and compare.

**Fallback (slow, nothing after about 8 seconds):** _"It streams the review as it writes. It reads my whole chart, so it starts with the shape of the tune before it gets to single chords."_

**Fallback (error, busy, or out of budget):** _"The live tutor's having a moment, which is why the app doesn't depend on it. The chord menu works without Claude, and the review's suggestions land in that same place."_ Open the menu at bar 3 and audition two options. (If editing, splice in the backup take.)

### 6. Record your own; a free lead sheet (3:20–3:50) [lands tonight]

**Click:** back to the song list, "Record your own". Feel: Straight. "Record next phrase", then tap `3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3 2 2` (Ode to Joy's opening, public domain) on the number row. Stop. If the rhythm guess is off, "Redo that phrase".

> I can bring my own tune, a phrase at a time, on the number row, where 1 is always home. Straight or swing. And a bonus: at the end I get a lead sheet for free.

**Click:** More → Print. Show the print preview, then cancel.

> Saving my sessions is next on the list.

[note] Your notes said "or save it to the server", but nothing is saved to a server. A recording lives in the browser tab and is gone when the tab closes, and sign-in to save is in the backlog. So the line is "saving my sessions is next on the list".

**Fallback (record isn't live):** do Print from St. James instead, and add the time to beat 5.

### 7. Evals: what I chose to measure (3:50–4:15) [lands tonight]

**On screen:** `evals/results/README.md` on GitHub (or the trust panel in the app), the headline row visible.

> Measuring it was a tradeoff too. I could score the tutor against a hymnal's chords, but ear training is improvisational, and there's rarely one right chord. So the headline is: does each spot the review flags give me at least two alternatives I can play? [N of M]. And does every chord named in the text have a card I can hear? [N of M]. Agreement with the hymnal is a secondary number.

**Fallback (the reframed results aren't merged):** show the eval README's metric table. _"The headline I'm moving to is playable alternatives at every spot, because there's rarely one right chord."_

### 8. What I'd build next (4:15–4:40)

**On screen:** the app, idle on St. James.

> The hardest tradeoffs were everything I didn't build in v1. I cut MIDI keyboard input and singing or humming input. Both are achievable soon. Time signatures didn't get as far as I hoped. They're one of the most interesting and confusing parts of ear training, and I want better support there. Plus sign-in to save sessions, and general polish.

### 9. Time spent, and close (4:40–5:00)

**On screen:** back to the first screen.

> It's been a busy couple of weeks at work. I'm at Anthropic. I noodled on the idea with Claude over brunch, spent about an hour on a thorough product brief, handed it to Claude Code, then about seven hours of iterating, and half an hour on this video and the write-up. I'm proud of where it landed.

[note] The first draft described the build process here (workstreams, Fable reviews, the decision log). I took it out because 20 seconds can't hold both that and the time breakdown. The decision log is in the repo if you want one line on it.

## The 60-second cut-down

| Time      | Beat                                            | Line                                                                                                                                            |
| --------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:12 | First screen                                    | "I've been doing ear training with Claude as a chatbot. Music wants to be seen and heard, so I built Hear Hear."                                |
| 0:12–0:25 | Saints: hint, pick F                            | "I do the listening myself. If I'm stuck, I get one clue at a time."                                                                            |
| 0:25–0:38 | Saints: V then I; flip to Nashville             | "I audition chords and hear what sounds better. 5 goes to 1 in any key: relationships, not pitches."                                            |
| 0:38–0:52 | St. James: "Review my chords", then A/B/C cards | "After the hard work, Claude reviews my chords, with the theory and the culture behind them, and hands me alternatives I can play and compare." |
| 0:52–1:00 | Close                                           | "Next: MIDI and humming input, and better time signatures. About eight hours, and I'm proud of it."                                             |

## Timing notes

- About 655 spoken words over 5:00; beat 5 is the densest minute, so press "Review my chords" right after the four bars and talk over the stream. Don't talk over a V-I landing or a chord audition; let each one sound.
- If I'm long at 2:20, cut beat 4 to the transpose and its last two sentences. If I'm still long at 3:50, drop the hover on B in beat 5 (keep one "Hear it" and one "Compare") and the question-box line and shorten beat 7 to its first two sentences.
- Say bar numbers, never note names, before picking the key, so the narration doesn't give the key away.
