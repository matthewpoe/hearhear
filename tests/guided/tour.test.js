import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  STEP_COUNT,
  finishTour,
  goTo,
  releaseHold,
  restartTour,
  startTour,
  stepBack,
  stepNext,
  tour,
} from "../../src/guided/tour.js";

// No storage in Node: progress and dismissal are per-viewer conveniences, so
// the tour runs without them.
describe("moving through the lesson", () => {
  beforeEach(() => {
    startTour();
    goTo(4);
  });

  it("goes back a step, held there so a done step doesn't skip forward again", () => {
    stepBack();
    assert.equal(tour.get().index, 3);
    assert.equal(tour.get().held, true);
  });

  it("goes on a step without doing this one, held there too", () => {
    stepNext();
    assert.equal(tour.get().index, 5);
    assert.equal(tour.get().held, true);
  });

  it("moves on naturally without a hold", () => {
    stepBack();
    goTo(4);
    assert.equal(tour.get().held, false);
  });

  it("lets go of a hold", () => {
    stepBack();
    releaseHold();
    assert.equal(tour.get().held, false);
    assert.equal(tour.get().index, 3);
  });

  it("stays inside the path at either end", () => {
    goTo(0);
    stepBack();
    assert.equal(tour.get().index, 0);
    goTo(STEP_COUNT - 1);
    stepNext();
    assert.equal(tour.get().index, STEP_COUNT - 1);
  });

  it("restarts at step 1, unheld so a done step 1 moves on, still running", () => {
    stepBack();
    restartTour();
    assert.deepEqual(
      { index: tour.get().index, held: tour.get().held, running: tour.get().running },
      { index: 0, held: false, running: true },
    );
  });

  it("resumes without a hold, so a step done meanwhile is skipped", () => {
    stepBack();
    finishTour();
    goTo(3, { held: true });
    startTour();
    assert.equal(tour.get().held, false);
  });
});
