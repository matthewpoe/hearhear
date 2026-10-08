/**
 * The guided path's hold on the tutor: the recorded lesson its current step
 * names, so a question the viewer asks then replays that lesson.
 */

import { createReadable } from "../lib/readable.js";

/**
 * The recorded lesson the guided path's current step names ("lesson:<id>"),
 * or "" when it names none or the walkthrough isn't running. A question the
 * viewer asks meanwhile replays it: the step answers anyone, at no cost, so
 * the panel doesn't ask for the passphrase up front then.
 */
export const stepLesson = createReadable("");
