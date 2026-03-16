// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZKRiskOracle - Brevis/Axiom Coprocessor integration for Monte Carlo risk math
/// @notice Accepts cryptographically verified off-chain computations for dynamic risk boundaries
contract ZKRiskOracle is Ownable2Step {
    
    // Address of the ZK Verifier (e.g. Brevis Request contract)
    address public zkVerifier;

    struct RiskMetrics {
        uint32 timestamp;
        uint32 verifiedSharpeRatio;
        uint32 monteCarloDrawdownBps;
        uint32 recommendedBufferBps;
    }

    RiskMetrics public latestMetrics;

    error ZKRiskOracle__UnauthorizedVerifier();
    error ZKRiskOracle__ZeroAddress();

    event RiskMetricsVerified(uint32 sharpe, uint32 drawdown, uint32 buffer);
    event ZkVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    constructor(address _zkVerifier) Ownable(msg.sender) {
        if (_zkVerifier == address(0)) revert ZKRiskOracle__ZeroAddress();
        zkVerifier = _zkVerifier;
    }

    /// @notice Callback from ZK Coprocessor after SNARK verification.
    /// @dev    The `zkVerifier` address IS the Brevis Request contract. Brevis verifies the
    ///         SNARK proof on-chain before calling this function, so by the time execution
    ///         reaches here the proof has already been cryptographically validated.
    ///         The `_requestId` and `_proof` parameters are reserved for direct
    ///         IBrevisVerifier.verifyProof integration in the production deployment.
    function fulfillRiskCalculation(
        bytes32 /* _requestId */,
        bytes calldata /* _proof */,
        uint32 _computedSharpe,
        uint32 _computedDrawdownBps,
        uint32 _recommendedBufferBps
    ) external {
        if (msg.sender != zkVerifier) revert ZKRiskOracle__UnauthorizedVerifier();

        latestMetrics = RiskMetrics({
            timestamp: uint32(block.timestamp),
            verifiedSharpeRatio: _computedSharpe,
            monteCarloDrawdownBps: _computedDrawdownBps,
            recommendedBufferBps: _recommendedBufferBps
        });

        emit RiskMetricsVerified(_computedSharpe, _computedDrawdownBps, _recommendedBufferBps);
    }

    function getVerifiedRiskBands() external view returns (RiskMetrics memory) {
        if (latestMetrics.timestamp == 0) {
            return RiskMetrics({
                timestamp: uint32(block.timestamp),
                verifiedSharpeRatio: 0,
                monteCarloDrawdownBps: 0,
                recommendedBufferBps: 500 // 5% default safety buffer
            });
        }
        return latestMetrics;
    }

    function setZkVerifier(address _newVerifier) external onlyOwner {
        if (_newVerifier == address(0)) revert ZKRiskOracle__ZeroAddress();
        address oldVerifier = zkVerifier;
        zkVerifier = _newVerifier;
        emit ZkVerifierUpdated(oldVerifier, _newVerifier);
    }
}
