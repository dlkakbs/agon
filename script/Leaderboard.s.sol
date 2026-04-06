// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {BountyRegistry} from "../src/BountyRegistry.sol";

/// @notice On-chain leaderboard ve bounty durumlarını okur.
contract LeaderboardScript is Script {
    address constant BOUNTY_REGISTRY = 0xD52fFD67b1AfC230EDaBAD66B5657aCDA385D645;

    function run() external view {
        BountyRegistry registry = BountyRegistry(payable(BOUNTY_REGISTRY));

        uint256 total = registry.bountyCount();
        console.log("=== Agent Bounty Protocol ===");
        console.log("Total bounties:", total);
        console.log("");

        // Tüm bounty'leri listele
        for (uint256 i = 1; i <= total; i++) {
            (
                address creator,
                ,
                ,
                bytes32 taskHash,
                uint256 reward,
                uint256 deadline,
                uint256 challengePeriod,
                BountyRegistry.ValidationType vType,
                address validator,
                BountyRegistry.BountyStatus status,
                address winner
            ) = registry.bounties(i);

            console.log("--- Bounty #", i, "---");
            console.log("Creator  :", creator);
            console.log("Reward   :", reward / 1e18, "USDC");
            console.log("Deadline (unix):", deadline);
            console.log("Type     :", vType == BountyRegistry.ValidationType.EXPLICIT ? "EXPLICIT" : "OPTIMISTIC");
            console.log("Status   :", _statusStr(status));
            if (winner != address(0)) {
                console.log("Winner   :", winner);
            }

            // Submission'ları göster
            BountyRegistry.Submission[] memory subs = registry.getSubmissions(i);
            console.log("Submissions:", subs.length);
            for (uint256 j = 0; j < subs.length; j++) {
                console.log("  Agent    :", subs[j].agent);
                console.log("  Challenged:", subs[j].challenged);
                console.log("  Approved :", subs[j].approved);
            }
            console.log("");
        }

        // Agent stats — bounty'lere katılmış tüm adresleri tara
        console.log("=== Agent Leaderboard ===");
        address[] memory seen = new address[](100);
        uint256 seenCount = 0;

        for (uint256 i = 1; i <= total; i++) {
            BountyRegistry.Submission[] memory subs = registry.getSubmissions(i);
            for (uint256 j = 0; j < subs.length; j++) {
                address agent = subs[j].agent;
                if (!_contains(seen, seenCount, agent)) {
                    seen[seenCount++] = agent;
                }
            }
        }

        for (uint256 i = 0; i < seenCount; i++) {
            address agent = seen[i];
            (uint256 completed, uint256 attempted, uint256 totalEarned) = registry.agentStats(agent);
            uint256 rate = registry.successRate(agent);

            console.log("Agent    :", agent);
            console.log("Completed:", completed);
            console.log("Attempted:", attempted);
            console.log("Earned   :", totalEarned / 1e18, "USDC");
            console.log("Rate (%) :", rate / 100);
            console.log("");
        }
    }

    function _statusStr(BountyRegistry.BountyStatus s) internal pure returns (string memory) {
        if (s == BountyRegistry.BountyStatus.OPEN)      return "OPEN";
        if (s == BountyRegistry.BountyStatus.COMPLETED) return "COMPLETED";
        return "CANCELLED";
    }

    function _contains(address[] memory arr, uint256 len, address target) internal pure returns (bool) {
        for (uint256 i = 0; i < len; i++) {
            if (arr[i] == target) return true;
        }
        return false;
    }
}
