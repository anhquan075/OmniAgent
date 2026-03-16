// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockChainlinkAggregator {
    uint8 public immutable decimals;
    int256 private _answer;
    uint80 private _roundId;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        _answer = answer_;
        _roundId = 1;
        _updatedAt = block.timestamp;
    }

    function setRound(int256 answer_, uint256 updatedAt_) external {
        _answer = answer_;
        _updatedAt = updatedAt_;
        _roundId += 1;
    }

    function updateAnswer(int256 answer_) external {
        _answer = answer_;
        _updatedAt = block.timestamp;
        _roundId += 1;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        _updatedAt = updatedAt_;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}
