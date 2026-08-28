export const JOURNEY_VERSION = 1;

// The six-step dataset-discovery journey. `target` is the id of the section a
// completed or current step scrolls to. Steps 4 and 5 live inside the question
// section, so they target elements within it.
export const JOURNEY_STEPS = [
  { id: "choose-data", label: "Choose data", target: "discover" },
  { id: "understand", label: "Understand the dataset", target: "dataset-section" },
  { id: "choose-question", label: "Choose a question", target: "question-section" },
  { id: "analyze", label: "Analyze the data", target: "query-output" },
  { id: "review", label: "Review and refine", target: "result-explanation" },
  { id: "connect", label: "Connect related data", target: "join-section" },
];

export function createJourney(container, { steps = JOURNEY_STEPS } = {}) {
  let current = 1;
  let furthest = 1;
  const list = container ? document.createElement("ol") : null;
  if (container && list) {
    list.className = "journey-list";
    container.replaceChildren(list);
  }

  function render() {
    if (!list) return;
    list.replaceChildren();
    steps.forEach((step, index) => {
      const position = index + 1;
      const item = document.createElement("li");
      item.className = "journey-step";
      item.dataset.step = String(position);
      const reachable = position <= furthest;
      const complete = position < current && reachable;
      if (complete) item.dataset.state = "complete";
      else if (position === current) item.dataset.state = "current";
      else item.dataset.state = reachable ? "available" : "upcoming";

      // The step number is drawn by a CSS counter on `.journey-step` (see the
      // `.journey-step-link::before` badge in style.css). Emitting it here as
      // text too would double the number in the ordered-list semantics and in
      // any "copy as text" export, so the DOM carries the label only.
      const text = document.createElement("span");
      text.className = "journey-step-label";
      text.textContent = step.label;

      if (reachable) {
        const link = document.createElement("a");
        link.href = `#${step.target}`;
        link.className = "journey-step-link";
        if (position === current) link.setAttribute("aria-current", "step");
        const state = complete ? "Completed" : position === current ? "Current step" : "Available";
        const status = document.createElement("span");
        status.className = "visually-hidden";
        status.textContent = ` (${state})`;
        link.append(text, status);
        item.append(link);
      } else {
        const label = document.createElement("span");
        label.className = "journey-step-link is-upcoming";
        label.setAttribute("aria-disabled", "true");
        const status = document.createElement("span");
        status.className = "visually-hidden";
        status.textContent = " (Not available yet: finish the earlier steps to unlock this step)";
        label.append(text, status);
        item.append(label);
      }
      list.append(item);
    });
  }

  render();

  return {
    steps,
    get current() { return current; },
    get furthest() { return furthest; },
    reach(step) {
      const target = Math.min(Math.max(step, 1), steps.length);
      if (target > furthest) furthest = target;
      current = target;
      render();
    },
    reset() {
      current = 1;
      furthest = 1;
      render();
    },
  };
}
