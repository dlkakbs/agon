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

    address creator   = makeAddr("creator");
    address agent     = makeAddr("agent");
    address evaluator = makeAddr("evaluator");
    address stranger  = makeAddr("stranger");

    uint256 constant REWARD = 5e18;   // 5 USDC
    uint256 constant STAKE  = 0.5e18; // 0.5 USDC

    function setUp() public {
        idReg   = new MockIdentityRegistry();
        repReg  = new MockReputationRegistry();
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
            evaluator
        );
    }

    // ── createTask ───────────────────────────────────────────────────────────

    function test_createTask_success() public {
        uint256 id = _createTask();
        BountyRegistry.Task memory t = registry.getTask(id);

        assertEq(t.creator, creator);
        assertEq(t.reward, REWARD);
        assertEq(t.stakeRequired, STAKE);
        assertEq(t.evaluator, evaluator);
        assertEq(uint8(t.status), uint8(BountyRegistry.TaskStatus.OPEN));
    }

    function test_createTask_zeroReward_reverts() public {
        vm.prank(creator);
        vm.expectRevert(BountyRegistry.ZeroReward.selector);
        registry.createTask{value: 0}("T", "D", bytes32(0), 0, block.timestamp + 1 days, evaluator);
    }

    function test_createTask_pastDeadline_reverts() public {
        vm.prank(creator);
        vm.expectRevert(BountyRegistry.InvalidDeadline.selector);
        registry.createTask{value: REWARD}("T", "D", bytes32(0), 0, block.timestamp - 1, evaluator);
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

    function test_cancelTask_lockedTask_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent);
        registry.takeTask{value: STAKE}(id);

        vm.prank(creator);
        vm.expectRevert(BountyRegistry.NotOpen.selector);
        registry.cancelTask(id);
    }

    // ── takeTask ─────────────────────────────────────────────────────────────

    function test_takeTask_success() public {
        uint256 id = _createTask();

        vm.prank(agent);
        registry.takeTask{value: STAKE}(id);

        BountyRegistry.Task memory t = registry.getTask(id);
        assertEq(uint8(t.status), uint8(BountyRegistry.TaskStatus.LOCKED));
        assertEq(t.agent, agent);
        assertEq(t.agentStake, STAKE);
    }

    function test_takeTask_notRegistered_reverts() public {
        uint256 id = _createTask();
        vm.deal(stranger, 10e18);
        // stranger Arc Identity NFT'sine sahip değil → revert beklenir
        bool reverted;
        try registry.takeTask{value: STAKE}(id) {
            // prank olmadan msg.sender = address(this), identity yok
        } catch {
            reverted = true;
        }
        assertTrue(reverted);
    }

    function test_takeTask_insufficientStake_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent);
        vm.expectRevert(BountyRegistry.InsufficientStake.selector);
        registry.takeTask{value: STAKE - 1}(id);
    }

    function test_takeTask_alreadyLocked_reverts() public {
        uint256 id = _createTask();

        address agent2 = makeAddr("agent2");
        idReg.register(agent2);
        vm.deal(agent2, 10e18);

        vm.prank(agent);
        registry.takeTask{value: STAKE}(id);

        vm.prank(agent2);
        vm.expectRevert(BountyRegistry.NotOpen.selector);
        registry.takeTask{value: STAKE}(id);
    }

    function test_takeTask_afterDeadline_reverts() public {
        uint256 id = _createTask();
        vm.warp(block.timestamp + 2 days);

        vm.prank(agent);
        vm.expectRevert(BountyRegistry.DeadlinePassed.selector);
        registry.takeTask{value: STAKE}(id);
    }

    // ── submitResult ─────────────────────────────────────────────────────────

    function test_submitResult_success() public {
        uint256 id = _createTask();
        vm.prank(agent);
        registry.takeTask{value: STAKE}(id);

        bytes32 hash = keccak256("result");
        vm.prank(agent);
        registry.submitResult(id, hash, "risk: LOW, balance: 5 USDC");

        BountyRegistry.Task memory t = registry.getTask(id);
        assertEq(t.resultHash, hash);
    }

    function test_submitResult_wrongAgent_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent);
        registry.takeTask{value: STAKE}(id);

        address agent2 = makeAddr("agent2");
        idReg.register(agent2);
        vm.prank(agent2);
        vm.expectRevert(BountyRegistry.NotAgent.selector);
        registry.submitResult(id, keccak256("x"), "x");
    }

    function test_submitResult_afterDeadline_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent);
        registry.takeTask{value: STAKE}(id);

        vm.warp(block.timestamp + 2 days);
        vm.prank(agent);
        vm.expectRevert(BountyRegistry.DeadlinePassed.selector);
        registry.submitResult(id, keccak256("x"), "x");
    }

    // ── approveResult ────────────────────────────────────────────────────────

    function test_approveResult_paysAgent() public {
        uint256 id = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id);
        vm.prank(agent); registry.submitResult(id, keccak256("r"), "result");

        uint256 before = agent.balance;

        vm.prank(evaluator);
        registry.approveResult(id);

        // agent: reward + stake geri
        assertEq(agent.balance, before + REWARD + STAKE);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.COMPLETED));

        (uint256 completed, uint256 attempted, uint256 earned) = registry.agentStats(agent);
        assertEq(completed, 1);
        assertEq(attempted, 1);
        assertEq(earned, REWARD);
    }

    function test_approveResult_notEvaluator_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id);
        vm.prank(agent); registry.submitResult(id, keccak256("r"), "result");

        vm.prank(stranger);
        vm.expectRevert(BountyRegistry.NotEvaluator.selector);
        registry.approveResult(id);
    }

    function test_approveResult_noSubmission_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id);

        vm.prank(evaluator);
        vm.expectRevert(BountyRegistry.NoResultSubmitted.selector);
        registry.approveResult(id);
    }

    // ── rejectResult ─────────────────────────────────────────────────────────

    function test_rejectResult_slashesStake_resetsToOpen() public {
        uint256 id = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id);
        vm.prank(agent); registry.submitResult(id, keccak256("r"), "result");

        uint256 creatorBefore = creator.balance;

        vm.prank(evaluator);
        registry.rejectResult(id);

        // stake creator'a gitti
        assertEq(creator.balance, creatorBefore + STAKE);

        // task OPEN'a döndü
        BountyRegistry.Task memory t = registry.getTask(id);
        assertEq(uint8(t.status), uint8(BountyRegistry.TaskStatus.OPEN));
        assertEq(t.agent, address(0));
        assertEq(t.agentStake, 0);
    }

    function test_rejectResult_taskReopenedForNewAgent() public {
        uint256 id = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id);
        vm.prank(agent); registry.submitResult(id, keccak256("r"), "result");

        vm.prank(evaluator);
        registry.rejectResult(id);

        // Yeni agent task'ı alabilir
        address agent2 = makeAddr("agent2");
        idReg.register(agent2);
        vm.deal(agent2, 10e18);

        vm.prank(agent2);
        registry.takeTask{value: STAKE}(id);

        assertEq(registry.getTask(id).agent, agent2);
    }

    // ── slashTimeout ─────────────────────────────────────────────────────────

    function test_slashTimeout_afterDeadline() public {
        uint256 id = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id);

        // deadline'ı geç
        vm.warp(block.timestamp + 2 days);

        uint256 creatorBefore = creator.balance;

        registry.slashTimeout(id); // herhangi biri çağırabilir

        assertEq(creator.balance, creatorBefore + STAKE);
        assertEq(uint8(registry.getTask(id).status), uint8(BountyRegistry.TaskStatus.OPEN));
    }

    function test_slashTimeout_beforeDeadline_reverts() public {
        uint256 id = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id);

        vm.expectRevert(BountyRegistry.DeadlineNotPassed.selector);
        registry.slashTimeout(id);
    }

    // ── successRate ──────────────────────────────────────────────────────────

    function test_successRate() public {
        // Task 1: approve
        uint256 id1 = _createTask();
        vm.prank(agent); registry.takeTask{value: STAKE}(id1);
        vm.prank(agent); registry.submitResult(id1, keccak256("r1"), "r1");
        vm.prank(evaluator); registry.approveResult(id1);

        // Task 2: reject
        vm.prank(creator);
        uint256 id2 = registry.createTask{value: REWARD}(
            "Task 2", "D", bytes32(uint256(1)), STAKE, block.timestamp + 1 days, evaluator
        );
        vm.prank(agent); registry.takeTask{value: STAKE}(id2);
        vm.prank(agent); registry.submitResult(id2, keccak256("r2"), "r2");
        vm.prank(evaluator); registry.rejectResult(id2);

        // 1/2 = 50% = 5000 bps
        assertEq(registry.successRate(agent), 5_000);
    }
}
