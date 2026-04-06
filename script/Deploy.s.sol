// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {BountyRegistry} from "../src/BountyRegistry.sol";

/// @notice Arc testnet'e BountyRegistry deploy eder.
///
/// Kullanım:
///   forge script script/Deploy.s.sol \
///     --rpc-url $ARC_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast
///
/// Arc Testnet registry adresleri:
///   IdentityRegistry   : 0x8004A818BFB912233c491871b3d84c89A494BD9e
///   ReputationRegistry : 0x8004B663056A597Dffe9eCcC1965A193B7388713
contract DeployScript is Script {
    // Arc Testnet — pre-deployed registry adresleri
    address constant IDENTITY_REGISTRY   = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("Deployer :", deployer);
        console.log("Balance  :", deployer.balance);

        vm.startBroadcast(deployerKey);

        BountyRegistry registry = new BountyRegistry(
            IDENTITY_REGISTRY,
            REPUTATION_REGISTRY
        );

        vm.stopBroadcast();

        console.log("BountyRegistry deployed at:", address(registry));
    }
}
