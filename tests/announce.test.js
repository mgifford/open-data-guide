import { describe, expect, it } from "vitest";
import { createMilestoneAnnouncer, progressMilestone } from "../src/ui/announce.js";

describe("progress milestone throttling", () => {
  it("rounds down to the step and always reports 0 and 100", () => {
    expect(progressMilestone(0)).toBe(0);
    expect(progressMilestone(7)).toBe(0);
    expect(progressMilestone(23)).toBe(20);
    expect(progressMilestone(99.9)).toBe(90);
    expect(progressMilestone(100)).toBe(100);
    expect(progressMilestone(NaN)).toBe(null);
  });

  it("announces each milestone only once as progress climbs", () => {
    const announce = createMilestoneAnnouncer(10);
    const stream = [3, 6, 9, 12, 15, 21, 55, 58, 100];
    const announced = stream.map(announce).filter((value) => value !== null);
    expect(announced).toEqual([0, 10, 20, 50, 100]);
  });
});
