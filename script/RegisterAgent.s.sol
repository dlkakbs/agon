// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";

/// @notice Arc IdentityRegistry'ye agent olarak kayıt olur.
/// IdentityRegistry: 0x8004A818BFB912233c491871b3d84c89A494BD9e
contract RegisterAgentScript is Script {
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function run() external {
        uint256 agentKey = vm.envUint("PRIVATE_KEY");
        address agent    = vm.addr(agentKey);

        IIdentityRegistry registry = IIdentityRegistry(IDENTITY_REGISTRY);

        console.log("Registering agent:", agent);
        console.log("Current balance (NFT):", registry.balanceOf(agent));

        vm.startBroadcast(agentKey);
        uint256 tokenId = registry.register("ipfs://QmAgentBountyProtocol");
        vm.stopBroadcast();

        console.log("Registered! Token ID:", tokenId);
        console.log("New balance (NFT):", registry.balanceOf(agent));
    }
}
