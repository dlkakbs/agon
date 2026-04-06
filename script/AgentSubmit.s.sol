// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {BountyRegistry} from "../src/BountyRegistry.sol";

/// @notice Test akışı:
///   1. submitResult  — agent sonuç gönderir
///   2. claimOptimistic — challenge süresi dolduktan sonra USDC çeker
///
/// Dikkat: claimOptimistic için önce vm.warp ile zaman atlıyoruz (testnet'te
/// gerçek süre beklenmez, cast send ile ayrı tx atılır).
contract AgentSubmitScript is Script {
    address constant BOUNTY_REGISTRY = 0xD52fFD67b1AfC230EDaBAD66B5657aCDA385D645;
    uint256 constant BOUNTY_ID       = 1;

    function run() external {
        uint256 agentKey = vm.envUint("PRIVATE_KEY");
        address agent    = vm.addr(agentKey);

        BountyRegistry registry = BountyRegistry(payable(BOUNTY_REGISTRY));

        // ── 1. submitResult ──────────────────────────────────────────────────
        console.log("Agent:", agent);

        (,,,,,,,,,BountyRegistry.BountyStatus status,) = registry.bounties(BOUNTY_ID);
        console.log("Bounty status (0=OPEN):", uint8(status));

        string memory result = "Arc TVL grew 340% in Q1 2026 driven by BlackRock integration. Full report: ipfs://Qm...";
        bytes32 resultHash = keccak256(bytes(result));

        vm.startBroadcast(agentKey);
        registry.submitResult(BOUNTY_ID, resultHash, result);
        vm.stopBroadcast();

        console.log("Result submitted! Hash:");
        console.logBytes32(resultHash);
        console.log("");
        console.log("Challenge period: 1 hour.");
        console.log("Claim komutu (1 saat sonra calistir):");
        console.log("  forge script script/AgentClaim.s.sol --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast");
    }
}
