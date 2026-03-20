// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/**
 * @title AgentRiskParameters
 * @notice Immutable on-chain risk parameters for autonomous AI agents
 * @dev Parameters are set once in constructor and cannot be modified
 * 
 * Key Design: AI agent READS these parameters but CANNOT modify them,
 * providing cryptographic safety against prompt injection attacks.
 * 
 * Inspired by SafeAgent hackathon winner: https://dorahacks.io/buidl/40440
 */
contract AgentRiskParameters {
    // ==================== IMMUTABLE PARAMETERS ====================
    
    /// @notice Maximum portfolio risk per transaction (basis points, 500 = 5%)
    uint256 public immutable maxRiskPercentageBps;
    
    /// @notice Maximum transactions allowed per day
    uint256 public immutable dailyMaxTransactions;
    
    /// @notice Maximum daily transaction volume (USDT, 6 decimals)
    uint256 public immutable dailyMaxVolumeUsdt;
    
    /// @notice Maximum slippage tolerance (basis points, 500 = 5%)
    uint256 public immutable maxSlippageBps;
    
    /// @notice Minimum health factor threshold (18 decimals, 1.5e18 = 1.5)
    uint256 public immutable minHealthFactor;
    
    /// @notice Emergency health factor threshold (18 decimals, 1.2e18 = 1.2)
    uint256 public immutable emergencyHealthFactor;
    
    /// @notice Maximum consecutive failures before circuit breaker
    uint256 public immutable maxConsecutiveFailures;
    
    /// @notice Circuit breaker cooldown period (seconds)
    uint256 public immutable circuitBreakerCooldownSeconds;
    
    /// @notice Maximum oracle data age (seconds)
    uint256 public immutable oracleMaxAgeSeconds;
    
    /// @notice Health factor velocity threshold (basis points per minute)
    uint256 public immutable healthFactorVelocityThresholdBps;
    
    // ==================== WHITELISTED ADDRESSES ====================
    
    /// @notice Whitelisted protocol addresses (Aave, Bridge, etc.)
    address[] public whitelistedProtocols;
    
    /// @notice Whitelisted token addresses (USDT, XAUT, etc.)
    address[] public whitelistedTokens;
    
    // ==================== EVENTS ====================
    
    event ParametersDeployed(
        uint256 maxRiskPercentageBps,
        uint256 dailyMaxTransactions,
        uint256 dailyMaxVolumeUsdt,
        uint256 minHealthFactor,
        uint256 emergencyHealthFactor
    );
    
    // ==================== CONSTRUCTOR ====================
    
    constructor(
        uint256 _maxRiskPercentageBps,
        uint256 _dailyMaxTransactions,
        uint256 _dailyMaxVolumeUsdt,
        uint256 _maxSlippageBps,
        uint256 _minHealthFactor,
        uint256 _emergencyHealthFactor,
        uint256 _maxConsecutiveFailures,
        uint256 _circuitBreakerCooldownSeconds,
        uint256 _oracleMaxAgeSeconds,
        uint256 _healthFactorVelocityThresholdBps,
        address[] memory _whitelistedProtocols,
        address[] memory _whitelistedTokens
    ) {
        require(_maxRiskPercentageBps <= 10000, "Risk > 100%");
        require(_maxSlippageBps <= 10000, "Slippage > 100%");
        require(_minHealthFactor >= _emergencyHealthFactor, "Invalid HF");
        
        maxRiskPercentageBps = _maxRiskPercentageBps;
        dailyMaxTransactions = _dailyMaxTransactions;
        dailyMaxVolumeUsdt = _dailyMaxVolumeUsdt;
        maxSlippageBps = _maxSlippageBps;
        minHealthFactor = _minHealthFactor;
        emergencyHealthFactor = _emergencyHealthFactor;
        maxConsecutiveFailures = _maxConsecutiveFailures;
        circuitBreakerCooldownSeconds = _circuitBreakerCooldownSeconds;
        oracleMaxAgeSeconds = _oracleMaxAgeSeconds;
        healthFactorVelocityThresholdBps = _healthFactorVelocityThresholdBps;
        
        whitelistedProtocols = _whitelistedProtocols;
        whitelistedTokens = _whitelistedTokens;
        
        emit ParametersDeployed(
            _maxRiskPercentageBps,
            _dailyMaxTransactions,
            _dailyMaxVolumeUsdt,
            _minHealthFactor,
            _emergencyHealthFactor
        );
    }
    
    // ==================== VIEW FUNCTIONS ====================
    
    /// @notice Get all risk parameters in one call (gas-efficient batch read)
    function getAllParameters() external view returns (
        uint256 maxRisk,
        uint256 maxTx,
        uint256 maxVolume,
        uint256 maxSlippage,
        uint256 minHF,
        uint256 emergencyHF,
        uint256 maxFailures,
        uint256 cooldown,
        uint256 maxOracleAge,
        uint256 hfVelocity
    ) {
        return (
            maxRiskPercentageBps,
            dailyMaxTransactions,
            dailyMaxVolumeUsdt,
            maxSlippageBps,
            minHealthFactor,
            emergencyHealthFactor,
            maxConsecutiveFailures,
            circuitBreakerCooldownSeconds,
            oracleMaxAgeSeconds,
            healthFactorVelocityThresholdBps
        );
    }
    
    /// @notice Get whitelisted protocol addresses
    function getWhitelistedProtocols() external view returns (address[] memory) {
        return whitelistedProtocols;
    }
    
    /// @notice Get whitelisted token addresses
    function getWhitelistedTokens() external view returns (address[] memory) {
        return whitelistedTokens;
    }
    
    /// @notice Check if protocol is whitelisted
    function isProtocolWhitelisted(address protocol) external view returns (bool) {
        for (uint i = 0; i < whitelistedProtocols.length; i++) {
            if (whitelistedProtocols[i] == protocol) return true;
        }
        return false;
    }
    
    /// @notice Check if token is whitelisted
    function isTokenWhitelisted(address token) external view returns (bool) {
        for (uint i = 0; i < whitelistedTokens.length; i++) {
            if (whitelistedTokens[i] == token) return true;
        }
        return false;
    }
}
