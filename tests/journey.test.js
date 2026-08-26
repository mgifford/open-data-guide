import { beforeEach, describe, expect, it } from "vitest";
import { JOURNEY_STEPS, JOURNEY_VERSION, createJourney } from "../src/ui/journey.js";

describe("dataset-discovery journey", () => {
  beforeEach(() => {});

  it("defines the six ordered steps and a version", () => {
    expect(JOURNEY_VERSION).toBe(1);
    expect(JOURNEY_STEPS.map((step) => step.label)).toEqual([
      "Choose data",
      "Understand the dataset",
      "Choose a question",
      "Analyze the data",
      "Review and refine",
      "Connect related data",
    ]);
    expect(JOURNEY_STEPS).toHaveLength(6);
  });

  it("starts on step one", () => {
    const journey = createJourney(null);
    expect(journey.current).toBe(1);
    expect(journey.furthest).toBe(1);
  });

  it("advances the current step and tracks the furthest reached", () => {
    const journey = createJourney(null);
    journey.reach(3);
    expect(journey.current).toBe(3);
    expect(journey.furthest).toBe(3);
  });

  it("keeps completed steps reachable when revisiting an earlier step", () => {
    const journey = createJourney(null);
    journey.reach(5);
    journey.reach(2);
    expect(journey.current).toBe(2);
    expect(journey.furthest).toBe(5);
  });

  it("clamps out-of-range steps", () => {
    const journey = createJourney(null);
    journey.reach(99);
    expect(journey.current).toBe(6);
    journey.reach(-4);
    expect(journey.current).toBe(1);
    expect(journey.furthest).toBe(6);
  });

  it("resets to step one", () => {
    const journey = createJourney(null);
    journey.reach(4);
    journey.reset();
    expect(journey.current).toBe(1);
    expect(journey.furthest).toBe(1);
  });
});
