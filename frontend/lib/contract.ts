export const BOUNTY_REGISTRY_ADDRESS =
  "0x40a2113858AB46D558f9c1248348e2bBe7DbBd16" as const;

export const BOUNTY_REGISTRY_ABI = [
  // ── Write ──────────────────────────────────────────────────────────────
  {
    name: "createTask",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "taskHash", type: "bytes32" },
      { name: "stakeRequired", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "evaluator", type: "address" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "cancelTask",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "takeTask",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "submitResult",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "resultHash", type: "bytes32" },
      { name: "resultText", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "approveResult",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "rejectResult",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "slashTimeout",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  // ── Read ───────────────────────────────────────────────────────────────
  {
    name: "taskCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getTask",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "taskHash", type: "bytes32" },
          { name: "reward", type: "uint256" },
          { name: "stakeRequired", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "evaluator", type: "address" },
          { name: "status", type: "uint8" },
          { name: "agent", type: "address" },
          { name: "agentStake", type: "uint256" },
          { name: "takenAt", type: "uint256" },
          { name: "resultHash", type: "bytes32" },
          { name: "resultText", type: "string" },
        ],
      },
    ],
  },
  {
    name: "agentStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "completed", type: "uint256" },
      { name: "attempted", type: "uint256" },
      { name: "totalEarned", type: "uint256" },
    ],
  },
  {
    name: "successRate",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  // ── Events ─────────────────────────────────────────────────────────────
  {
    name: "TaskCreated",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
      { name: "stakeRequired", type: "uint256", indexed: false },
    ],
  },
  {
    name: "TaskTaken",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "stake", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ResultSubmitted",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "resultHash", type: "bytes32", indexed: false },
      { name: "resultText", type: "string", indexed: false },
    ],
  },
  {
    name: "ResultApproved",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ResultRejected",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "slashed", type: "uint256", indexed: false },
    ],
  },
  {
    name: "StakeSlashed",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "slashed", type: "uint256", indexed: false },
    ],
  },
  {
    name: "TaskCancelled",
    type: "event",
    inputs: [{ name: "id", type: "uint256", indexed: true }],
  },
] as const;

// Task durumları (contract enum sırası)
export const TaskStatus = {
  OPEN: 0,
  LOCKED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
} as const;

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskStatusLabel: Record<TaskStatusType, string> = {
  [TaskStatus.OPEN]: "Open",
  [TaskStatus.LOCKED]: "Locked",
  [TaskStatus.COMPLETED]: "Completed",
  [TaskStatus.CANCELLED]: "Cancelled",
};
