// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {BountyRegistry} from "../src/BountyRegistry.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";

// ── Mocks ───────────────────────────────────────────────────────────────────

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(address => uint256) private _bal;

    function register(address a) external { _bal[a] = 1; }
    function register(string calldata) external returns (uint256) { _bal[msg.sender] = 1; return 1; }
    function balanceOf(address a) external view returns (uint256) { return _bal[a]; }
    function ownerOf(uint256) external pure returns (address) { return address(0); }
}

contract MockReputationRegistry is IReputationRegistry {
    event Feedback(address agent, bool positive);
    function giveFeedback(address a, bool p) external { emit Feedback(a, p); }
}

// ── Tests ───────────────────────────────────────────────────────────────────

contract BountyRegistryTest is Test {
    BountyRegistry         registry;
    MockIdentityRegistry   idReg;
    MockReputationRegistry repReg;

    address creator    = makeAddr("creator");
    address agent      = makeAddr("agent");
    address eval1      = makeAddr("eval1");
    address eval2      = makeAddr("eval2");
    address tiebreaker = makeAddr("tiebreaker");
    address stranger   = makeAddr("stranger");

    uint256 constant REWARD = 5e18;    // 5 USDC
    uint256 constant STAKE  = 1.5e18;  // 1.5 USDC (>= 30% of 5)

    function setUp() public {
        idReg    = new MockIdentityRegistry();
        repReg   = new MockReputationRegistry();
        registry = new BountyRegistry(address(idReg), address(repReg));

        idReg.register(agent);

        vm.deal(creator, 100e18);
        vm.deal(agent,   10e18);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    function _createTask() internal returns (uint256 id) {
        vm.prank(creator);
        id = registry.createTask{value: REWARD}(
            "Analyze wallet",
            "Check risk score of target wallet",
            bytes32(uint256(uint160(makeAddr("target")))),
            STAKE,
            block.timestamp + 1 days,
            [eval1, eval2],
            tiebreaker
        );
    }

    function _createAndLock() internal returns (uint256 id) {
        id = _createTask();
        vm.prank(agent);
        registry.takeTask{value: STAKE}(id);
    }

    function _createLockSubmit() internal returns (uint256 id) {
        id = _createAndLock();
        vm.prank(agent);
        registry.submitResult(id, keccak256("result"), "result text");
    }

    // ── createTask ───────────────────────────────────────────────────────────

    function test_createTask_success() public {
        uint256 id = _createTask();
        BountyRegistry.Task memory t = registry.getTask(id);

        assertEq(t.creator, creator);
        assertEq(t.reward, REWARD);
        assertEq(t.stakeRequired, STAKE);
        assertEq(t.evaluators[0], eval1);
        assertEq(t.evaluators[1], eval2);
        assertEq(t.tiebreaker, tiebreaker);
        assertEq(uint8(t.status), uint8(BountyRegistry.TaskStatus.OPEN));
    }

    function test_createTask_zeroReward_reverts() public {
        vm.prank(creator);
        vm.expectRevert(BountyRegistry.ZeroReward.selector);
        registry.createTask{value: 0}(
            "T", "D", bytes32(0), 0, block.timestamp + 1 days, [eval1, eval2], tiebreaker
        );
    }

    function test_createTask_stakeTooLow_reverts() public {
        vm.prank(creator);
        vm.expectRevert(BountyRegistry.StakeTooLow.selector);
        // stake = 0, reward = 5 USDC → 0 < 1.5 USDC
        registry.createTask{value: REWARD}(
            "T", "D", bytes32(0), 0, block.timestamp + 1 days, [eval1, eval2], tiebreaker
        );
    }

    function test_createTask_pastDeadline_reverts() public {
        vm.prank(creator);
        vm.expectRevert(BountyRegistry.InvalidDeadline.selector);
        registry.createTask{value: REWARD}(
            "T", "D", bytes32(0), STAKE, block.timestamp - 1, [eval1, eval2], tiebreaker
        );
    }

    function test_createTask_sameEvaluators_reverts() public {
        vm.prank(creator);
        vm.expectRevert(BountyRegistry.InvalidEvaluators.selector);
        registry.createTask{value: REWARD}(
            "T", "D", bytes32(0), STAKE, block.timestamp + 1 days, [eval1, eval1], tiebreaker
        );
    }

    // ── cancelTask ───────────────────────────────────────────────────────────

    function test_cancelTask_refunds() public {
        uint256 id = _createTask();
        uint256 before = creator.balance;

        vm.prank(creator);
        registry.cancelTask(id);

        assertEq(creator.balance, before + REWARD);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.CANCELLED));
    }

    function test_cancelTask_notCreator_reverts() public {
        uint256 id = _createTask();
        vm.prank(stranger);
        vm.expectRevert(BountyRegistry.NotCreator.selector);
        registry.cancelTask(id);
    }

    // ── takeTask ─────────────────────────────────────────────────────────────

    function test_takeTask_success() public {
        uint256 id = _createAndLock();
        BountyRegistry.Task memory t = registry.getTask(id);
        assertEq(uint8(t.status), uint8(BountyRegistry.TaskStatus.LOCKED));
        assertEq(t.agent, agent);
        assertEq(t.agentStake, STAKE);
    }

    function test_takeTask_insufficientStake_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent);
        vm.expectRevert(BountyRegistry.InsufficientStake.selector);
        registry.takeTask{value: STAKE - 1}(id);
    }

    // ── submitResult ─────────────────────────────────────────────────────────

    function test_submitResult_success() public {
        uint256 id = _createLockSubmit();
        BountyRegistry.Task memory t = registry.getTask(id);
        assertEq(t.resultHash, keccak256("result"));
    }

    function test_submitResult_wrongAgent_reverts() public {
        uint256 id = _createAndLock();
        address agent2 = makeAddr("agent2");
        idReg.register(agent2);
        vm.prank(agent2);
        vm.expectRevert(BountyRegistry.NotAgent.selector);
        registry.submitResult(id, keccak256("x"), "x");
    }

    // ── voting: 2/2 approve ───────────────────────────────────────────────────

    function test_vote_twoApprovals_paysAgent() public {
        uint256 id = _createLockSubmit();
        uint256 before = agent.balance;

        vm.prank(eval1); registry.vote(id, true);
        vm.prank(eval2); registry.vote(id, true);

        assertEq(agent.balance, before + REWARD + STAKE);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.COMPLETED));
    }

    // ── voting: 2/2 reject ────────────────────────────────────────────────────

    function test_vote_twoRejections_slashesStake() public {
        uint256 id = _createLockSubmit();
        uint256 creatorBefore = creator.balance;

        vm.prank(eval1); registry.vote(id, false);
        vm.prank(eval2); registry.vote(id, false);

        assertEq(creator.balance, creatorBefore + STAKE);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.OPEN));
    }

    // ── voting: tiebreaker ────────────────────────────────────────────────────

    function test_vote_tie_callsTiebreaker() public {
        uint256 id = _createLockSubmit();

        vm.prank(eval1); registry.vote(id, true);

        vm.expectEmit(true, true, false, false);
        emit BountyRegistry.TiebreakerCalled(id, tiebreaker);
        vm.prank(eval2); registry.vote(id, false);

        assertTrue(registry.getTask(id).tiebreakerCalled);
    }

    function test_vote_tiebreaker_approve_paysAgent() public {
        uint256 id = _createLockSubmit();
        uint256 before = agent.balance;

        vm.prank(eval1); registry.vote(id, true);
        vm.prank(eval2); registry.vote(id, false); // tie → tiebreaker çağrılır

        vm.prank(tiebreaker); registry.vote(id, true); // 2/3 approve

        assertEq(agent.balance, before + REWARD + STAKE);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.COMPLETED));
    }

    function test_vote_tiebreaker_reject_slashes() public {
        uint256 id = _createLockSubmit();
        uint256 creatorBefore = creator.balance;

        vm.prank(eval1); registry.vote(id, true);
        vm.prank(eval2); registry.vote(id, false);
        vm.prank(tiebreaker); registry.vote(id, false); // 2/3 reject

        assertEq(creator.balance, creatorBefore + STAKE);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.OPEN));
    }

    function test_vote_tiebreakerNotCalled_reverts() public {
        uint256 id = _createLockSubmit();
        vm.prank(tiebreaker);
        vm.expectRevert(BountyRegistry.NotEvaluator.selector);
        registry.vote(id, true);
    }

    function test_vote_alreadyVoted_reverts() public {
        uint256 id = _createLockSubmit();
        vm.prank(eval1); registry.vote(id, true);
        vm.prank(eval1);
        vm.expectRevert(BountyRegistry.AlreadyVoted.selector);
        registry.vote(id, true);
    }

    function test_vote_stranger_reverts() public {
        uint256 id = _createLockSubmit();
        vm.prank(stranger);
        vm.expectRevert(BountyRegistry.NotEvaluator.selector);
        registry.vote(id, true);
    }

    // ── slashTimeout ─────────────────────────────────────────────────────────

    function test_slashTimeout_afterDeadline() public {
        uint256 id = _createAndLock();
        vm.warp(block.timestamp + 2 days);

        uint256 creatorBefore = creator.balance;
        registry.slashTimeout(id);

        assertEq(creator.balance, creatorBefore + STAKE);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.OPEN));
    }

    function test_slashTimeout_beforeDeadline_reverts() public {
        uint256 id = _createAndLock();
        vm.expectRevert(BountyRegistry.DeadlineNotPassed.selector);
        registry.slashTimeout(id);
    }

    // ── evaluatorTimeout ──────────────────────────────────────────────────────

    function test_evaluatorTimeout_refundsBoth() public {
        uint256 id = _createLockSubmit();
        vm.warp(block.timestamp + 2 days);

        uint256 agentBefore   = agent.balance;
        uint256 creatorBefore = creator.balance;

        registry.evaluatorTimeout(id);

        assertEq(agent.balance, agentBefore + STAKE);
        assertEq(creator.balance, creatorBefore + REWARD);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.CANCELLED));
    }

    function test_evaluatorTimeout_beforeDeadline_reverts() public {
        uint256 id = _createLockSubmit();
        vm.expectRevert(BountyRegistry.DeadlineNotPassed.selector);
        registry.evaluatorTimeout(id);
    }

    function test_evaluatorTimeout_noSubmission_reverts() public {
        uint256 id = _createAndLock();
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(BountyRegistry.NoResultSubmitted.selector);
        registry.evaluatorTimeout(id);
    }

    // ── successRate ──────────────────────────────────────────────────────────

    function test_successRate() public {
        // Task 1: approve
        uint256 id1 = _createLockSubmit();
        vm.prank(eval1); registry.vote(id1, true);
        vm.prank(eval2); registry.vote(id1, true);

        // Task 2: reject — yeni task oluştur
        vm.prank(creator);
        uint256 id2 = registry.createTask{value: REWARD}(
            "Task 2", "D", bytes32(uint256(1)), STAKE, block.timestamp + 1 days,
            [eval1, eval2], tiebreaker
        );
        vm.prank(agent); registry.takeTask{value: STAKE}(id2);
        vm.prank(agent); registry.submitResult(id2, keccak256("r2"), "r2");
        vm.prank(eval1); registry.vote(id2, false);
        vm.prank(eval2); registry.vote(id2, false);

        // 1/2 = 50% = 5000 bps
        assertEq(registry.successRate(agent), 5_000);
    }
}
