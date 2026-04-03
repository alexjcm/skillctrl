import { FLOW_BACK, FLOW_CANCELLED, FLOW_COMPLETED } from "./constants/flow-tokens.ts"

export type FlowResult = typeof FLOW_COMPLETED | typeof FLOW_CANCELLED | typeof FLOW_BACK
