import {
  handlePlan098ServingReleaseRequest,
  type Plan098OperatorEnv,
} from "./operations/plan098-serving-release.js";

export default {
  fetch: handlePlan098ServingReleaseRequest,
} satisfies ExportedHandler<Plan098OperatorEnv>;
