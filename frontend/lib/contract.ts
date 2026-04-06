export const BOUNTY_REGISTRY_ADDRESS =
  "0x21b757B2C1f0a127D2afE859E9ccDB439d0aadC4" as const;

// Sistem evaluator adresleri (sabit — kullanıcı seçemiyor)
export const EVALUATORS: [`0x${string}`, `0x${string}`] = [
  "0xaa6ef23e9e247a6dd8c5f777d7336dc9830b3ed5", // Evaluator 1 (GPT-4o)
  "0x87ce853d5adc436d8c79fce1bbd19dbceb49c774", // Evaluator 2 (Claude)
];
export const TIEBREAKER = "0xe20e3d4d06df616f3e97cd18b3e7b05e5f14f65b" as `0x${string}`; // Evaluator 3 (Gemini)
export const CREATOR_AGENT_ADDRESS = "0x67d9ac12654d247a43ecf939f8fa0c651e16b5f7" as `0x${string}`;

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
      { name: "evaluators", type: "address[2]" },
      { name: "tiebreaker", type: "address" },
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
    name: "vote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "approve", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "slashTimeout",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "evaluatorTimeout",
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
          { name: "evaluators", type: "address[2]" },
          { name: "tiebreaker", type: "address" },
          { name: "status", type: "uint8" },
          { name: "agent", type: "address" },
          { name: "agentStake", type: "uint256" },
          { name: "takenAt", type: "uint256" },
          { name: "resultHash", type: "bytes32" },
          { name: "resultText", type: "string" },
          { name: "approveCount", type: "uint8" },
          { name: "rejectCount", type: "uint8" },
          { name: "tiebreakerCalled", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getVote",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "evaluator", type: "address" },
    ],
    outputs: [{ type: "uint8" }],
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
    name: "Voted",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "evaluator", type: "address", indexed: true },
      { name: "approve", type: "bool", indexed: false },
    ],
  },
  {
    name: "TiebreakerCalled",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "tiebreaker", type: "address", indexed: true },
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

// Shared Task type (yeni contract v2)
export type TaskRecord = {
  creator: `0x${string}`;
  title: string;
  description: string;
  taskHash: `0x${string}`;
  reward: bigint;
  stakeRequired: bigint;
  deadline: bigint;
  evaluators: readonly [`0x${string}`, `0x${string}`];
  tiebreaker: `0x${string}`;
  status: number;
  agent: `0x${string}`;
  agentStake: bigint;
  takenAt: bigint;
  resultHash: `0x${string}`;
  resultText: string;
  approveCount: number;
  rejectCount: number;
  tiebreakerCalled: boolean;
};

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
