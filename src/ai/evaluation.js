import { deterministicProvider } from "./providers.js";

export async function evaluatePlanningCases(cases, fields) {
  const results = [];
  for (const testCase of cases) {
    try {
      const plan = await deterministicProvider.plan({ question: testCase.question, fields });
      results.push({ ...testCase, actual: plan.status, passed: testCase.kind === plan.status || (testCase.kind === "ready" && plan.status === "ready") || (testCase.kind === "clarification" && plan.status === "needs-clarification") });
    } catch (error) {
      results.push({ ...testCase, actual: "rejection", reason: error.message, passed: testCase.kind === "rejection" });
    }
  }
  return results;
}