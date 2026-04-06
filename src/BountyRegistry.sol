// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title BountyRegistry — Agon
/// @notice Arc Testnet'te native USDC ile agentic task marketplace.
///
/// Flow:
///   1. Creator → createTask() + USDC reward escrow'a kilitlenir
///   2. Agent   → takeTask()  + USDC stake kilitlenir, task LOCKED
///   3. Agent   → submitResult() (sadece task'ı alan agent)
///   4. Evaluator → approveResult() → agent reward + stake alır
///              → rejectResult()  → stake yanar (creator'a), task OPEN'a döner
///   5. Herhangi biri → slashTimeout() → deadline geçtiyse stake yanar
///
/// Arc Testnet: native token = USDC (18 decimals), msg.value = USDC
contract BountyRegistry {

    // ── Types ──────────────────────────────────────────────────────────────

    enum TaskStatus { OPEN, LOCKED, COMPLETED, CANCELLED }

    struct Task {
        address creator;
        string  title;
        string  description;
        bytes32 taskHash;       // görev verisi (örn: hedef wallet adresi)
        uint256 reward;         // creator'ın kilitlediği USDC
        uint256 stakeRequired;  // agent'ın kilitlemesi gereken USDC
        uint256 deadline;       // unix timestamp
        address evaluator;      // LLM evaluator wallet adresi
        TaskStatus status;
        // LOCKED durumunda dolan alanlar
        address agent;          // taskı alan agent
        uint256 agentStake;     // agent'ın kilitlediği USDC
        uint256 takenAt;        // task'ın alındığı zaman
        // submit sonrası dolan alanlar
        bytes32 resultHash;
        string  resultText;
    }

    struct AgentStats {
        uint256 completed;
        uint256 attempted;
        uint256 totalEarned;
    }

    // ── State ──────────────────────────────────────────────────────────────

    IIdentityRegistry   public immutable identityRegistry;
    IReputationRegistry public immutable reputationRegistry;

    uint256 public taskCount;
    mapping(uint256 => Task) public tasks;
    mapping(address => AgentStats) private _agentStats;

    // ── Events ─────────────────────────────────────────────────────────────

    event TaskCreated(uint256 indexed id, address indexed creator, uint256 reward, uint256 stakeRequired);
    event TaskTaken(uint256 indexed id, address indexed agent, uint256 stake);
    event ResultSubmitted(uint256 indexed id, address indexed agent, bytes32 resultHash, string resultText);
    event ResultApproved(uint256 indexed id, address indexed agent, uint256 reward);
    event ResultRejected(uint256 indexed id, address indexed agent, uint256 slashed);
    event StakeSlashed(uint256 indexed id, address indexed agent, uint256 slashed);
    event TaskCancelled(uint256 indexed id);

    // ── Errors ─────────────────────────────────────────────────────────────

    error ZeroReward();
    error InvalidDeadline();
    error NotOpen();
    error NotLocked();
    error NotAgent();
    error NotEvaluator();
    error NotCreator();
    error NotRegisteredAgent();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InsufficientStake();
    error NoResultSubmitted();
    error ResultAlreadySubmitted();

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _identityRegistry, address _reputationRegistry) {
        identityRegistry   = IIdentityRegistry(_identityRegistry);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
    }

    // ── Creator ────────────────────────────────────────────────────────────

    /// @notice Task oluştur ve reward'ı escrow'a kilitle.
    /// @param stakeRequired Agent'ın yatırması gereken USDC miktarı.
    /// @param evaluator Sonucu onaylayacak / reddedecek LLM evaluator adresi.
    function createTask(
        string  calldata title,
        string  calldata description,
        bytes32 taskHash,
        uint256 stakeRequired,
        uint256 deadline,
        address evaluator
    ) external payable returns (uint256 id) {
        if (msg.value == 0)             revert ZeroReward();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        id = ++taskCount;
        tasks[id] = Task({
            creator:       msg.sender,
            title:         title,
            description:   description,
            taskHash:      taskHash,
            reward:        msg.value,
            stakeRequired: stakeRequired,
            deadline:      deadline,
            evaluator:     evaluator,
            status:        TaskStatus.OPEN,
            agent:         address(0),
            agentStake:    0,
            takenAt:       0,
            resultHash:    bytes32(0),
            resultText:    ""
        });

        emit TaskCreated(id, msg.sender, msg.value, stakeRequired);
    }

    /// @notice Henüz agent almamışsa task'ı iptal et, reward iade edilir.
    function cancelTask(uint256 id) external {
        Task storage t = tasks[id];
        if (t.creator != msg.sender) revert NotCreator();
        if (t.status != TaskStatus.OPEN) revert NotOpen();

        t.status = TaskStatus.CANCELLED;

        (bool ok,) = payable(msg.sender).call{value: t.reward}("");
        require(ok, "transfer failed");

        emit TaskCancelled(id);
    }

    // ── Agent ──────────────────────────────────────────────────────────────

    /// @notice Task'ı al ve stake kilitle. Task LOCKED olur.
    function takeTask(uint256 id) external payable {
        if (identityRegistry.balanceOf(msg.sender) == 0) revert NotRegisteredAgent();

        Task storage t = tasks[id];
        if (t.status != TaskStatus.OPEN)     revert NotOpen();
        if (block.timestamp >= t.deadline)   revert DeadlinePassed();
        if (msg.value < t.stakeRequired)     revert InsufficientStake();

        t.status    = TaskStatus.LOCKED;
        t.agent     = msg.sender;
        t.agentStake = msg.value;
        t.takenAt   = block.timestamp;

        _agentStats[msg.sender].attempted++;

        emit TaskTaken(id, msg.sender, msg.value);
    }

    /// @notice Sonucu gönder. Sadece task'ı alan agent çağırabilir.
    function submitResult(
        uint256 id,
        bytes32 resultHash,
        string  calldata resultText
    ) external {
        Task storage t = tasks[id];
        if (t.status     != TaskStatus.LOCKED)  revert NotLocked();
        if (t.agent      != msg.sender)         revert NotAgent();
        if (block.timestamp >= t.deadline)      revert DeadlinePassed();
        if (t.resultHash != bytes32(0))         revert ResultAlreadySubmitted();

        t.resultHash = resultHash;
        t.resultText = resultText;

        emit ResultSubmitted(id, msg.sender, resultHash, resultText);
    }

    // ── Evaluator ──────────────────────────────────────────────────────────

    /// @notice Sonucu onayla → agent reward + stake alır, task COMPLETED.
    function approveResult(uint256 id) external {
        Task storage t = tasks[id];
        if (t.evaluator  != msg.sender)      revert NotEvaluator();
        if (t.status     != TaskStatus.LOCKED) revert NotLocked();
        if (t.resultHash == bytes32(0))       revert NoResultSubmitted();

        address agent  = t.agent;
        uint256 payout = t.reward + t.agentStake;

        t.status = TaskStatus.COMPLETED;

        AgentStats storage s = _agentStats[agent];
        s.completed++;
        s.totalEarned += t.reward;

        try reputationRegistry.giveFeedback(agent, true) {} catch {}

        (bool ok,) = payable(agent).call{value: payout}("");
        require(ok, "transfer failed");

        emit ResultApproved(id, agent, t.reward);
    }

    /// @notice Sonucu reddet → stake yanar (creator'a), task OPEN'a döner.
    function rejectResult(uint256 id) external {
        Task storage t = tasks[id];
        if (t.evaluator != msg.sender)        revert NotEvaluator();
        if (t.status    != TaskStatus.LOCKED)  revert NotLocked();
        if (t.resultHash == bytes32(0))        revert NoResultSubmitted();

        address agent   = t.agent;
        address creator = t.creator;
        uint256 slashed = t.agentStake;

        _resetToOpen(t);

        try reputationRegistry.giveFeedback(agent, false) {} catch {}

        (bool ok,) = payable(creator).call{value: slashed}("");
        require(ok, "transfer failed");

        emit ResultRejected(id, agent, slashed);
    }

    // ── Timeout slash ──────────────────────────────────────────────────────

    /// @notice Deadline geçti ve agent submit etmedi → stake yanar, task OPEN'a döner.
    /// @dev Herhangi biri çağırabilir (creator, evaluator, başkası).
    function slashTimeout(uint256 id) external {
        Task storage t = tasks[id];
        if (t.status   != TaskStatus.LOCKED)       revert NotLocked();
        if (block.timestamp < t.deadline)           revert DeadlineNotPassed();
        if (t.resultHash != bytes32(0))             revert ResultAlreadySubmitted();

        address agent   = t.agent;
        address creator = t.creator;
        uint256 slashed = t.agentStake;

        _resetToOpen(t);

        try reputationRegistry.giveFeedback(agent, false) {} catch {}

        (bool ok,) = payable(creator).call{value: slashed}("");
        require(ok, "transfer failed");

        emit StakeSlashed(id, agent, slashed);
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function getTask(uint256 id) external view returns (Task memory) {
        return tasks[id];
    }

    function agentStats(address agent) external view returns (
        uint256 completed,
        uint256 attempted,
        uint256 totalEarned
    ) {
        AgentStats memory s = _agentStats[agent];
        return (s.completed, s.attempted, s.totalEarned);
    }

    /// @notice Başarı oranı, bps cinsinden (10000 = %100).
    function successRate(address agent) external view returns (uint256) {
        AgentStats memory s = _agentStats[agent];
        if (s.attempted == 0) return 0;
        return (s.completed * 10_000) / s.attempted;
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _resetToOpen(Task storage t) internal {
        t.status     = TaskStatus.OPEN;
        t.agent      = address(0);
        t.agentStake = 0;
        t.takenAt    = 0;
        t.resultHash = bytes32(0);
        t.resultText = "";
    }
}
