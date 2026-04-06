// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title BountyRegistry — Agon v2
/// @notice Arc Testnet'te native USDC ile agentic task marketplace.
///
/// Flow:
///   1. Creator → createTask() + USDC reward escrow'a kilitlenir
///   2. Agent   → takeTask()  + USDC stake kilitlenir, task LOCKED
///   3. Agent   → submitResult()
///   4. Evaluator 1 + 2 → vote()
///      - 2/2 aynı → karar kesin
///      - Çelişti  → TiebreakerCalled event → Evaluator 3 vote() çağırır → 2/3 majority
///   5. evaluatorTimeout() → deadline geçti, evaluator karar vermedi → herkes parasını alır
///   6. slashTimeout()     → deadline geçti, agent submit etmedi → stake yanar
///
/// Stake kuralı: stakeRequired >= reward * 30 / 100
contract BountyRegistry {

    // ── Types ──────────────────────────────────────────────────────────────

    enum TaskStatus { OPEN, LOCKED, COMPLETED, CANCELLED }

    struct Task {
        address creator;
        string  title;
        string  description;
        bytes32 taskHash;
        uint256 reward;
        uint256 stakeRequired;
        uint256 deadline;
        address[2] evaluators;   // Evaluator 1 ve 2
        address tiebreaker;      // Evaluator 3 — sadece çelişince devreye girer
        TaskStatus status;
        // LOCKED durumunda dolan alanlar
        address agent;
        uint256 agentStake;
        uint256 takenAt;
        // submit sonrası dolan alanlar
        bytes32 resultHash;
        string  resultText;
        // voting
        uint8   approveCount;
        uint8   rejectCount;
        bool    tiebreakerCalled;
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
    mapping(uint256 => mapping(address => uint8)) public taskVotes; // 0=none 1=approve 2=reject
    mapping(address => AgentStats) private _agentStats;

    // ── Events ─────────────────────────────────────────────────────────────

    event TaskCreated(uint256 indexed id, address indexed creator, uint256 reward, uint256 stakeRequired);
    event TaskTaken(uint256 indexed id, address indexed agent, uint256 stake);
    event ResultSubmitted(uint256 indexed id, address indexed agent, bytes32 resultHash, string resultText);
    event Voted(uint256 indexed id, address indexed evaluator, bool approve);
    event TiebreakerCalled(uint256 indexed id, address indexed tiebreaker);
    event ResultApproved(uint256 indexed id, address indexed agent, uint256 reward);
    event ResultRejected(uint256 indexed id, address indexed agent, uint256 slashed);
    event StakeSlashed(uint256 indexed id, address indexed agent, uint256 slashed);
    event TaskCancelled(uint256 indexed id);

    // ── Errors ─────────────────────────────────────────────────────────────

    error ZeroReward();
    error StakeTooLow();
    error InvalidDeadline();
    error InvalidEvaluators();
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
    error AlreadyVoted();
    error TiebreakerNotCalled();

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _identityRegistry, address _reputationRegistry) {
        identityRegistry   = IIdentityRegistry(_identityRegistry);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
    }

    // ── Creator ────────────────────────────────────────────────────────────

    /// @notice Task oluştur ve reward'ı escrow'a kilitle.
    /// @param stakeRequired Agent'ın yatırması gereken USDC — min reward*30/100.
    /// @param evaluators     İki bağımsız evaluator adresi.
    /// @param tiebreaker     Çelişme durumunda devreye girecek 3. evaluator.
    function createTask(
        string  calldata title,
        string  calldata description,
        bytes32 taskHash,
        uint256 stakeRequired,
        uint256 deadline,
        address[2] calldata evaluators,
        address tiebreaker
    ) external payable returns (uint256 id) {
        if (msg.value == 0)                          revert ZeroReward();
        if (stakeRequired < msg.value * 30 / 100)   revert StakeTooLow();
        if (deadline <= block.timestamp)             revert InvalidDeadline();
        if (evaluators[0] == address(0) ||
            evaluators[1] == address(0) ||
            tiebreaker    == address(0) ||
            evaluators[0] == evaluators[1] ||
            evaluators[0] == tiebreaker    ||
            evaluators[1] == tiebreaker)             revert InvalidEvaluators();

        id = ++taskCount;
        tasks[id] = Task({
            creator:          msg.sender,
            title:            title,
            description:      description,
            taskHash:         taskHash,
            reward:           msg.value,
            stakeRequired:    stakeRequired,
            deadline:         deadline,
            evaluators:       evaluators,
            tiebreaker:       tiebreaker,
            status:           TaskStatus.OPEN,
            agent:            address(0),
            agentStake:       0,
            takenAt:          0,
            resultHash:       bytes32(0),
            resultText:       "",
            approveCount:     0,
            rejectCount:      0,
            tiebreakerCalled: false
        });

        emit TaskCreated(id, msg.sender, msg.value, stakeRequired);
    }

    /// @notice Henüz agent almamışsa task'ı iptal et, reward iade edilir.
    function cancelTask(uint256 id) external {
        Task storage t = tasks[id];
        if (t.creator != msg.sender)          revert NotCreator();
        if (t.status != TaskStatus.OPEN)      revert NotOpen();

        t.status = TaskStatus.CANCELLED;

        (bool ok,) = payable(msg.sender).call{value: t.reward}("");
        require(ok, "transfer failed");

        emit TaskCancelled(id);
    }

    // ── Agent ──────────────────────────────────────────────────────────────

    /// @notice Task'ı al ve stake kilitle.
    function takeTask(uint256 id) external payable {
        if (identityRegistry.balanceOf(msg.sender) == 0) revert NotRegisteredAgent();

        Task storage t = tasks[id];
        if (t.status != TaskStatus.OPEN)     revert NotOpen();
        if (block.timestamp >= t.deadline)   revert DeadlinePassed();
        if (msg.value < t.stakeRequired)     revert InsufficientStake();

        t.status     = TaskStatus.LOCKED;
        t.agent      = msg.sender;
        t.agentStake = msg.value;
        t.takenAt    = block.timestamp;

        _agentStats[msg.sender].attempted++;

        emit TaskTaken(id, msg.sender, msg.value);
    }

    /// @notice Sonucu gönder.
    function submitResult(
        uint256 id,
        bytes32 resultHash,
        string  calldata resultText
    ) external {
        Task storage t = tasks[id];
        if (t.status    != TaskStatus.LOCKED) revert NotLocked();
        if (t.agent     != msg.sender)        revert NotAgent();
        if (block.timestamp >= t.deadline)    revert DeadlinePassed();
        if (t.resultHash != bytes32(0))       revert ResultAlreadySubmitted();

        t.resultHash = resultHash;
        t.resultText = resultText;

        emit ResultSubmitted(id, msg.sender, resultHash, resultText);
    }

    // ── Evaluator voting ───────────────────────────────────────────────────

    /// @notice Evaluator oy kullanır. Tiebreaker sadece TiebreakerCalled sonrası oy kullanabilir.
    function vote(uint256 id, bool approve) external {
        Task storage t = tasks[id];
        if (t.status    != TaskStatus.LOCKED) revert NotLocked();
        if (t.resultHash == bytes32(0))       revert NoResultSubmitted();

        bool isMainEvaluator = msg.sender == t.evaluators[0] || msg.sender == t.evaluators[1];
        bool isTiebreaker    = msg.sender == t.tiebreaker && t.tiebreakerCalled;

        if (!isMainEvaluator && !isTiebreaker) revert NotEvaluator();
        if (taskVotes[id][msg.sender] != 0)    revert AlreadyVoted();

        taskVotes[id][msg.sender] = approve ? 1 : 2;

        if (approve) t.approveCount++; else t.rejectCount++;

        emit Voted(id, msg.sender, approve);

        uint8 total = t.approveCount + t.rejectCount;

        if (!t.tiebreakerCalled && total == 2) {
            if (t.approveCount == 2) {
                _finalizeApprove(id);
            } else if (t.rejectCount == 2) {
                _finalizeReject(id);
            } else {
                // 1-1 çelişti → tiebreaker devreye giriyor
                t.tiebreakerCalled = true;
                emit TiebreakerCalled(id, t.tiebreaker);
            }
        } else if (t.tiebreakerCalled && total == 3) {
            // 2/3 majority
            if (t.approveCount >= 2) {
                _finalizeApprove(id);
            } else {
                _finalizeReject(id);
            }
        }
    }

    // ── Timeout fonksiyonları ──────────────────────────────────────────────

    /// @notice Deadline geçti, agent submit etmedi → stake yanar, task OPEN'a döner.
    function slashTimeout(uint256 id) external {
        Task storage t = tasks[id];
        if (t.status    != TaskStatus.LOCKED)  revert NotLocked();
        if (block.timestamp < t.deadline)       revert DeadlineNotPassed();
        if (t.resultHash != bytes32(0))         revert ResultAlreadySubmitted();

        address agent   = t.agent;
        address creator = t.creator;
        uint256 slashed = t.agentStake;

        _resetToOpen(id);

        try reputationRegistry.giveFeedback(agent, false) {} catch {}

        (bool ok,) = payable(creator).call{value: slashed}("");
        require(ok, "transfer failed");

        emit StakeSlashed(id, agent, slashed);
    }

    /// @notice Deadline geçti, agent submit etti ama evaluator karar vermedi →
    ///         agent stake'ini, creator reward'ını geri alır. Task CANCELLED olur.
    function evaluatorTimeout(uint256 id) external {
        Task storage t = tasks[id];
        if (t.status    != TaskStatus.LOCKED) revert NotLocked();
        if (block.timestamp < t.deadline)     revert DeadlineNotPassed();
        if (t.resultHash == bytes32(0))       revert NoResultSubmitted();

        address agent   = t.agent;
        address creator = t.creator;
        uint256 stake   = t.agentStake;
        uint256 reward  = t.reward;

        t.status = TaskStatus.CANCELLED;

        (bool ok1,) = payable(agent).call{value: stake}("");
        require(ok1, "agent transfer failed");
        (bool ok2,) = payable(creator).call{value: reward}("");
        require(ok2, "creator transfer failed");

        emit TaskCancelled(id);
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function getTask(uint256 id) external view returns (Task memory) {
        return tasks[id];
    }

    function getVote(uint256 id, address evaluator) external view returns (uint8) {
        return taskVotes[id][evaluator];
    }

    function agentStats(address agent) external view returns (
        uint256 completed,
        uint256 attempted,
        uint256 totalEarned
    ) {
        AgentStats memory s = _agentStats[agent];
        return (s.completed, s.attempted, s.totalEarned);
    }

    function successRate(address agent) external view returns (uint256) {
        AgentStats memory s = _agentStats[agent];
        if (s.attempted == 0) return 0;
        return (s.completed * 10_000) / s.attempted;
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _finalizeApprove(uint256 id) internal {
        Task storage t = tasks[id];
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

    function _finalizeReject(uint256 id) internal {
        Task storage t   = tasks[id];
        address agent    = t.agent;
        address creator  = t.creator;
        uint256 slashed  = t.agentStake;

        _resetToOpen(id);

        try reputationRegistry.giveFeedback(agent, false) {} catch {}

        (bool ok,) = payable(creator).call{value: slashed}("");
        require(ok, "transfer failed");

        emit ResultRejected(id, agent, slashed);
    }

    function _resetToOpen(uint256 id) internal {
        Task storage t = tasks[id];

        // taskVotes temizle — aynı evaluator'lar sonraki turda tekrar oy kullanabilsin
        taskVotes[id][t.evaluators[0]] = 0;
        taskVotes[id][t.evaluators[1]] = 0;
        taskVotes[id][t.tiebreaker]    = 0;

        t.status          = TaskStatus.OPEN;
        t.agent           = address(0);
        t.agentStake      = 0;
        t.takenAt         = 0;
        t.resultHash      = bytes32(0);
        t.resultText      = "";
        t.approveCount    = 0;
        t.rejectCount     = 0;
        t.tiebreakerCalled = false;
    }
}
