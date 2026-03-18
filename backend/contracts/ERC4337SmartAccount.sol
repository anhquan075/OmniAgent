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

    mapping(address => address) public owners;
    mapping(address => bool) public isAccount;
    
    IEntryPoint public immutable entryPoint;
    
    event AccountCreated(address indexed account, address indexed owner);

    constructor(address _entryPoint) Ownable(msg.sender) {
        entryPoint = IEntryPoint(_entryPoint);
    }

    /// @notice Create a new smart account for a given owner
    /// @param owner The EOA that will control this smart account
    /// @return account The address of the newly created account
    function createAccount(address owner) external returns (address account) {
        bytes32 salt = keccak256(abi.encodePacked(owner, block.chainid));
        bytes memory bytecode = type(SimpleAccount).creationCode;
        assembly {
            account := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(account != address(0), "create2 failed");
        
        owners[account] = owner;
        isAccount[account] = true;
        
        emit AccountCreated(account, owner);
    }

    /// @notice Get the predicted account address before creation
    /// @param owner The intended owner of the account
    /// @return The predicted account address
    function getAccountAddress(address owner) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(owner, block.chainid));
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(type(SimpleAccount).creationCode)
            )
        );
        return address(bytes20(hash));
    }

    /// @notice Validate if an address is a deployed account
    /// @param account The address to check
    /// @return True if it's a valid account
    function isValidAccount(address account) external view returns (bool) {
        return isAccount[account];
    }
}

/// @title SimpleAccount - Minimal ERC-4337 compatible smart account
/// @dev Supports execute, validateUserOp, and token payments
contract SimpleAccount {
    using SafeERC20 for IERC20;

    address public owner;
    address public immutable accountFactory;
    IEntryPoint public immutable entryPoint_;

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        accountFactory = msg.sender;
        owner = SimpleAccountFactory(msg.sender).owners(address(this));
        entryPoint_ = SimpleAccountFactory(msg.sender).entryPoint();
    }

    /// @notice Execute a transaction (called by EntryPoint)
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
