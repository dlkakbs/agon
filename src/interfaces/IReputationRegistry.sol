// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IReputationRegistry {
    function giveFeedback(address agent, bool positive) external;
}
