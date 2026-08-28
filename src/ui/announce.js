// Throttle rapid download-progress updates to milestone steps so a polite live
// region announces "10%, 20%, 30%…" instead of every single percent, which
// floods screen-reader users. (Pattern borrowed from whisper-web, which
// announces at intervals rather than continuously.) 100% always reports so the
// finish is announced.
export function progressMilestone(percent, step = 10) {
  if (!Number.isFinite(percent)) return null;
  if (percent >= 100) return 100;
  if (percent <= 0) return 0;
  return Math.floor(percent / step) * step;
}

// Returns a function that, given a percent, yields the milestone to announce
// only when it changes, or null to stay quiet. Non-progress messages should be
// written directly (and announced immediately); this is only for the noisy
// percent stream.
export function createMilestoneAnnouncer(step = 10) {
  let last = null;
  return (percent) => {
    const milestone = progressMilestone(percent, step);
    if (milestone === null || milestone === last) return null;
    last = milestone;
    return milestone;
  };
}
