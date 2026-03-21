// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SimpleAccount - Minimal ERC-4337 compatible smart contract wallet
/// @notice This is a simplified version for OmniAgent hackathon demo
/// @dev Follows ERC-4337 EntryPoint interface patterns

interface IEntryPoint {
    function getUserOpHash(bytes calldata userOpCalldata) external view returns (bytes32);
    function handleOps(bytes[] calldata userOps, address payable beneficiary) external;
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

/// @title SimpleAccountFactory - Creates ERC-4337 compatible smart accounts
contract SimpleAccountFactory is Ownable {
    using SafeERC20 for IERC20;

    mapping(address => address) public ownerToAccount;
    mapping(address => bool) public isAccount;
    
    IEntryPoint public immutable entryPoint;
    
    event AccountCreated(address indexed account, address indexed owner);

    constructor(address _entryPoint) Ownable(msg.sender) {
        entryPoint = IEntryPoint(_entryPoint);
    }

    /// @notice Create a new smart account for a given owner
    function createAccount(address owner) external returns (address account) {
        require(ownerToAccount[owner] == address(0), "account exists");
        
        account = address(new SimpleAccount(owner, address(this), address(entryPoint)));
        ownerToAccount[owner] = account;
        isAccount[account] = true;
        
        emit AccountCreated(account, owner);
    }

    /// @notice Get the account address for an owner
    function getAccountAddress(address owner) external view returns (address) {
        return ownerToAccount[owner];
    }

    /// @notice Validate if an address is a deployed account
    function isValidAccount(address account) external view returns (bool) {
        return isAccount[account];
    }
}

/// @title SimpleAccount - Minimal ERC-4337 compatible smart account
/// @dev Supports execute, validateUserOp, session keys with spending limits, and token payments
contract SimpleAccount {
    using SafeERC20 for IERC20;

    address public owner;
    address public immutable accountFactory;
    IEntryPoint public immutable entryPoint_;

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    /// @notice Session key data structure
    struct SessionKeyData {
        uint256 spendingLimit;      // Max value per transaction
        uint256 dailyLimit;        // Max value per day
        uint256 dailySpent;        // Amount spent today
        uint256 dailyResetTime;    // Timestamp when daily limit resets
        address target;            // Restrict to specific target address (address(0) = any)
        uint256 expiresAt;         // Expiration timestamp
        bool revoked;              // Whether session key is revoked
    }

    /// @notice Mapping from session key address to session data
    /// @dev Uses address(this) as key, NOT msg.sender - fixes validation bug
    mapping(address => mapping(address => SessionKeyData)) public sessionKeys;

    event SessionKeyGranted(address indexed sessionKey, address indexed owner, uint256 spendingLimit, uint256 dailyLimit, address target, uint256 expiresAt);
    event SessionKeyRevoked(address indexed sessionKey, address indexed owner);
    event SessionKeyUsed(address indexed sessionKey, uint256 value, address target);
    event DailyLimitReset(address indexed sessionKey, uint256 newDaySpent);

    constructor(address _owner, address _factory, address _entryPoint) {
        accountFactory = _factory;
        owner = _owner;
        entryPoint_ = IEntryPoint(_entryPoint);
    }

    /// @notice Grant a session key with spending limits
    /// @param sessionKey The address that will be able to execute
    /// @param spendingLimit Max value per single transaction (in wei)
    /// @param dailyLimit Max value per 24-hour period (in wei)
    /// @param target Restrict execution to specific address (address(0) = any target)
    /// @param expiresAt Unix timestamp when session key expires
    function grantSessionKey(
        address sessionKey,
        uint256 spendingLimit,
        uint256 dailyLimit,
        address target,
        uint256 expiresAt
    ) external onlyOwner {
        require(sessionKey != address(0), "invalid session key");
        require(sessionKey != owner, "cannot be owner");
        require(expiresAt > block.timestamp, "invalid expiry");

        sessionKeys[address(this)][sessionKey] = SessionKeyData({
            spendingLimit: spendingLimit,
            dailyLimit: dailyLimit,
            dailySpent: 0,
            dailyResetTime: block.timestamp + 24 hours,
            target: target,
            expiresAt: expiresAt,
            revoked: false
        });

        emit SessionKeyGranted(sessionKey, owner, spendingLimit, dailyLimit, target, expiresAt);
    }

    /// @notice Revoke a session key instantly
    /// @param sessionKey The session key to revoke
    function revokeSessionKey(address sessionKey) external onlyOwner {
        require(sessionKeys[address(this)][sessionKey].expiresAt != 0, "session key not granted");

        sessionKeys[address(this)][sessionKey].revoked = true;
        sessionKeys[address(this)][sessionKey].expiresAt = block.timestamp; // Mark as expired

        emit SessionKeyRevoked(sessionKey, owner);
    }

    /// @notice Check if a session key is valid (not revoked, not expired, within limits)
    /// @param sessionKey The session key to check
    /// @param value The transaction value to check against limits
    /// @param target The target address to check against restrictions
    /// @return isValid True if the session key can be used for this transaction
    function isSessionKeyValid(
        address sessionKey,
        uint256 value,
        address target
    ) external view returns (bool isValid) {
        SessionKeyData storage data = sessionKeys[address(this)][sessionKey];

        // Check if session key exists (has been granted)
        if (data.expiresAt == 0 || data.expiresAt <= block.timestamp) {
            return false;
        }

        // Check if revoked
        if (data.revoked) {
            return false;
        }

        // Check spending limit
        if (value > data.spendingLimit) {
            return false;
        }

        // Check target restriction
        if (data.target != address(0) && data.target != target) {
            return false;
        }

        // Check daily limit (with reset)
        uint256 dailySpent = data.dailySpent;
        if (block.timestamp >= data.dailyResetTime) {
            // Daily limit has reset, no additional spending check needed
            if (value > data.dailyLimit) {
                return false;
            }
        } else {
            if (value + dailySpent > data.dailyLimit) {
                return false;
            }
        }

        return true;
    }

    /// @notice Execute a transaction using a session key
    /// @param sessionKey The session key to use for authorization
    /// @param dest The destination address
    /// @param value The amount of native tokens to send
    /// @param data The calldata to send
    function executeWithSessionKey(
        address sessionKey,
        address dest,
        uint256 value,
        bytes calldata data
    ) external {
        SessionKeyData storage sessionData = sessionKeys[address(this)][sessionKey];

        // Validate session key exists and is active
        require(sessionData.expiresAt != 0, "session key not granted");
        require(sessionData.expiresAt > block.timestamp, "session key expired");
        require(!sessionData.revoked, "session key revoked");

        // Validate spending limit
        require(value <= sessionData.spendingLimit, "exceeds spending limit");

        // Validate target restriction
        require(sessionData.target == address(0) || sessionData.target == dest, "invalid target");

        // Handle daily limit tracking
        if (block.timestamp >= sessionData.dailyResetTime) {
            // Reset daily tracker
            sessionData.dailySpent = value;
            sessionData.dailyResetTime = block.timestamp + 24 hours;
            emit DailyLimitReset(sessionKey, value);
        } else {
            // Check daily limit
            require(sessionData.dailySpent + value <= sessionData.dailyLimit, "exceeds daily limit");
            sessionData.dailySpent += value;
        }

        // Execute the call
        (bool success, ) = dest.call{value: value}(data);
        require(success, "call failed");

        emit SessionKeyUsed(sessionKey, value, dest);
    }

    /// @notice Execute a transaction (called by EntryPoint or owner directly)
    /// @param dest The destination address
    /// @param value The amount of native tokens to send
    /// @param data The calldata to send
    function execute(address dest, uint256 value, bytes calldata data) external {
        require(msg.sender == owner || msg.sender == address(entryPoint_), "not authorized");

        (bool success, ) = dest.call{value: value}(data);
        require(success, "call failed");
    }

    /// @notice Execute multiple transactions in batch
    /// @param dests Array of destination addresses
    /// @param values Array of native token amounts
    /// @param datas Array of calldata payloads
    function executeBatch(address[] calldata dests, uint256[] calldata values, bytes[] calldata datas) external {
        require(msg.sender == owner || msg.sender == address(entryPoint_), "not authorized");
        require(dests.length == values.length && dests.length == datas.length, "length mismatch");

        for (uint256 i = 0; i < dests.length; i++) {
            (bool success, ) = dests[i].call{value: values[i]}(datas[i]);
            require(success, "call failed");
        }
    }

    /// @notice Validate a user operation (ERC-4337 validation)
    /// @param userOpHash The hash of the user operation
    /// @return validationData Validation data (0 = valid, 1 = invalid)
    function validateUserOp(
        bytes calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256) {
        require(msg.sender == address(entryPoint_), "not entrypoint");
        
        // Extract signature from userOp (last 65 bytes for ECDSA)
        bytes calldata sig = userOp[userOp.length - 65:];
        
        // Extract v, r, s from signature
        bytes32 sigR;
        bytes32 sigS;
        uint8 sigV;
        
        assembly {
            // Load r (first 32 bytes of sig)
            sigR := calldataload(add(sig.offset, 0))
            // Load s (next 32 bytes)
            sigS := calldataload(add(sig.offset, 32))
            // Load v (last byte)
            sigV := byte(0, calldataload(add(sig.offset, 64)))
        }
        
        // Verify signature
        bytes32 hash = keccak256(abi.encodePacked(userOpHash, address(this), nonces[userOpHash]++));
        address recovered = ecrecover(hash, sigV, sigR, sigS);
        
        if (recovered == owner) {
            return 0;
        }
        return 1;
    }

    mapping(bytes32 => uint256) public nonces;

    /// @notice ERC-4337 entry point getter
    function entryPoint() external view returns (address) {
        return address(entryPoint_);
    }

    /// @notice Add deposit to the account (for gas payments)
    function addDeposit() external payable {
        entryPoint_.depositTo{value: msg.value}(address(this));
    }

    /// @notice Get account balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Get deposited balance in EntryPoint
    function getDeposit() external view returns (uint256) {
        return entryPoint_.balanceOf(address(this));
    }

    /// @notice Get session key full data
    /// @param sessionKey The session key to query
    /// @return spendingLimit_ Max value per transaction
    /// @return dailyLimit_ Max value per day
    /// @return dailySpent_ Amount spent today
    /// @return dailyResetTime_ When daily limit resets
    /// @return target_ Restricted target address
    /// @return expiresAt_ Expiration timestamp
    /// @return revoked_ Whether revoked
    function getSessionKeyData(address sessionKey) external view returns (
        uint256 spendingLimit_,
        uint256 dailyLimit_,
        uint256 dailySpent_,
        uint256 dailyResetTime_,
        address target_,
        uint256 expiresAt_,
        bool revoked_
    ) {
        SessionKeyData storage data = sessionKeys[address(this)][sessionKey];
        return (
            data.spendingLimit,
            data.dailyLimit,
            data.dailySpent,
            data.dailyResetTime,
            data.target,
            data.expiresAt,
            data.revoked
        );
    }

    // Signature verification (simplified for demo)
    uint8 public v;
    bytes32 public r;
    bytes32 public s;

    function setSignature(uint8 _v, bytes32 _r, bytes32 _s) external onlyOwner {
        v = _v;
        r = _r;
        s = _s;
    }

    /// @notice Enable token payments for gas (sponsored gas feature)
    function payGasWithToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw tokens from the account
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Withdraw native tokens from the account
    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "transfer failed");
    }

    receive() external payable {}
}

/// @title Paymaster - Sponsored gas for ERC-4337 user operations
/// @notice Allows OmniAgent to sponsor gas for user transactions
contract Paymaster is Ownable {
    using SafeERC20 for IERC20;

    mapping(address => bool) public approvedTokens;
    mapping(address => uint256) public tokenRates;
    
    IEntryPoint public immutable entryPoint;

    event TokenApprovalUpdated(address indexed token, bool approved, uint256 rate);

    constructor(address _entryPoint) Ownable(msg.sender) {
        entryPoint = IEntryPoint(_entryPoint);
    }

    /// @notice Approve a token for gas payment sponsorship
    /// @param token The token address
    /// @param approved Whether the token is approved
    /// @param rate The exchange rate (USD per token, with 8 decimals)
    function setTokenApproval(address token, bool approved, uint256 rate) external onlyOwner {
        approvedTokens[token] = approved;
        tokenRates[token] = rate;
        emit TokenApprovalUpdated(token, approved, rate);
    }

    /// @notice Validate a paymaster user operation
    /// @param userOp The user operation
    /// @return context Context bytes (empty for now)
    /// @return validationTimeholder Validation timestamp holder
    function validatePaymasterUserOp(
        bytes calldata userOp,
        bytes32,
        uint256
    ) external view returns (bytes memory context, uint256 validationTimeholder) {
        (userOp);
        
        context = "";
        validationTimeholder = 0;
    }

    /// @notice Post-operation handler (called after userOp executes)
    function postOp(
        bytes calldata context
    ) external view {
        (context);
        // In production: verify payment, transfer tokens from user
    }

    /// @notice Get postOp gas overhead
    function postOpGasOverhead() external pure returns (uint256) {
        return 50000;
    }

    /// @notice Check if a token is approved for sponsorship
    function isTokenApproved(address token) external view returns (bool) {
        return approvedTokens[token];
    }
}
