// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {BountyRegistry} from "../src/BountyRegistry.sol";

/// @notice Challenge süresi dolduktan sonra agent USDC'yi çeker.
contract AgentClaimScript is Script {
    address constant BOUNTY_REGISTRY = 0xD52fFD67b1AfC230EDaBAD66B5657aCDA385D645;
    uint256 constant BOUNTY_ID       = 1;

    function run() external {
        uint256 agentKey = vm.envUint("PRIVATE_KEY");
        address agent    = vm.addr(agentKey);

        BountyRegistry registry = BountyRegistry(payable(BOUNTY_REGISTRY));

        uint256 balanceBefore = agent.balance;
        console.log("Balance before:", balanceBefore);

        vm.startBroadcast(agentKey);
        registry.claimOptimistic(BOUNTY_ID);
        vm.stopBroadcast();

        uint256 balanceAfter = agent.balance;
        console.log("Balance after :", balanceAfter);
        console.log("Earned (USDC) :", balanceAfter - balanceBefore);

        // Stats
        (uint256 completed, uint256 attempted, uint256 totalEarned) = registry.agentStats(agent);
        console.log("--- Agent Stats ---");
        console.log("Completed :", completed);
        console.log("Attempted :", attempted);
        console.log("Total Earned:", totalEarned);
        console.log("Success Rate (bps):", registry.successRate(agent));
    }
}
