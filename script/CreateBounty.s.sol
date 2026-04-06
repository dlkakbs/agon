// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {BountyRegistry} from "../src/BountyRegistry.sol";

contract CreateBountyScript is Script {
    address constant BOUNTY_REGISTRY = 0xD52fFD67b1AfC230EDaBAD66B5657aCDA385D645;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        BountyRegistry registry = BountyRegistry(payable(BOUNTY_REGISTRY));

        uint256 bountyId = registry.createBounty{value: 1e18}( // 1 USDC
            "Analyze Arc Network TVL Growth Q1 2026",
            "Analyze Arc Network TVL growth Q1 2026 and produce a detailed report.",
            keccak256("Analyze Arc Network TVL growth Q1 2026 and produce a report"),
            block.timestamp + 3 days,
            BountyRegistry.ValidationType.OPTIMISTIC,
            deployer, // arbitrator olarak kendimiz
            1 hours   // challenge period
        );

        vm.stopBroadcast();

        console.log("Bounty created! ID:", bountyId);
        console.log("Reward: 1 USDC");
        console.log("Deadline: 3 days from now");
        console.log("Type: OPTIMISTIC (1 hour challenge period)");
    }
}
