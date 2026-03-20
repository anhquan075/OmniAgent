// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./PolicyGuard.sol";

/**
 * @title AgentNFA
 * @notice NFT-based agent identity that routes all write operations through PolicyGuard.
 *         Modeled after shll-safe-agent's AgentNFA pattern.
 *
 * @dev Each AgentNFA token represents an autonomous agent with its own vault (AgentAccount).
 *      All DeFi operations must go through execute() or executeBatch() which enforces PolicyGuard.
 *
 *      Execution flow:
 *        1. AgentNFA.execute() / executeBatch()
 *        2. PolicyGuard.validate()
 *        3. Action executed via .call() to target
 *        4. PolicyGuard.commit()
 */
contract AgentNFA {
    // ── Errors ────────────────────────────────────────────────────
    error AgentNFA__NotOwner();
    error AgentNFA__NotOperator();
    error AgentNFA__PolicyRejected(string reason);
    error AgentNFA__ExecutionFailed(bytes reason);
    error AgentNFA__ZeroAddress();
    error AgentNFA__InvalidAction();

    // ── Events ────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event ActionExecuted(uint256 indexed tokenId, address target, uint256 value, bytes data);
    event BatchExecuted(uint256 indexed tokenId, uint256 actionCount);
    event OperatorUpdated(uint256 indexed tokenId, address oldOperator, address newOperator);
    event VaultDeployed(uint256 indexed tokenId, address vault);

    // ── Action Struct ─────────────────────────────────────────────
    struct Action {
        address target;
        uint256 value;
        bytes data;
    }

    // ── State ─────────────────────────────────────────────────────
    string public name = "OmniAgent NFA";
    string public symbol = "ONFA";

    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public operatorOf;
    mapping(uint256 => address) public vaultOf;
    mapping(uint256 => PolicyGuard) public policyGuardOf;

    address public admin;
    uint256 public nextTokenId;

    // ── Constructor ───────────────────────────────────────────────
    constructor() {
        admin = msg.sender;
    }

    // ── Minting ───────────────────────────────────────────────────

    /**
     * @notice Mint a new agent NFT with associated vault and policy guard.
     * @param to Owner address
     * @param operator Operator address (can execute actions)
     * @param policyGuard PolicyGuard contract for this agent
     * @return tokenId The new token ID
     */
    function mint(
        address to,
        address operator,
        address policyGuard
    ) external returns (uint256 tokenId) {
        if (to == address(0)) revert AgentNFA__ZeroAddress();
        if (operator == address(0)) revert AgentNFA__ZeroAddress();
        if (policyGuard == address(0)) revert AgentNFA__ZeroAddress();

        tokenId = nextTokenId++;
        ownerOf[tokenId] = to;
        operatorOf[tokenId] = operator;
        policyGuardOf[tokenId] = PolicyGuard(policyGuard);

        emit Transfer(address(0), to, tokenId);
        emit OperatorUpdated(tokenId, address(0), operator);

        return tokenId;
    }

    // ── Execute ───────────────────────────────────────────────────

    /**
     * @notice Execute a single action through PolicyGuard.
     * @param tokenId Agent token ID
     * @param action The action to execute (target, value, data)
     * @param portfolioValueUsdt Current portfolio value for percentage check
     * @return result The return data from the target call
     */
    function execute(
        uint256 tokenId,
        Action calldata action,
        uint256 portfolioValueUsdt
    ) external returns (bytes memory result) {
        _assertOperator(tokenId);

        PolicyGuard guard = policyGuardOf[tokenId];
        address receiver = action.target;
        uint256 amountUsdt = action.value;

        // Validate through PolicyGuard
        try guard.validate(receiver, amountUsdt, portfolioValueUsdt) {
            // Validation passed, execute
            result = _executeAction(action);
            // Commit after successful execution
            guard.commit(amountUsdt);
            emit ActionExecuted(tokenId, action.target, action.value, action.data);
        } catch (bytes memory reason) {
            revert AgentNFA__PolicyRejected(_decodeRevertReason(reason));
        }
    }

    /**
     * @notice Execute multiple actions atomically through PolicyGuard.
     * @param tokenId Agent token ID
     * @param actions Array of actions to execute
     * @param portfolioValueUsdt Current portfolio value for percentage check
     * @return results Array of return data from each action
     */
    function executeBatch(
        uint256 tokenId,
        Action[] calldata actions,
        uint256 portfolioValueUsdt
    ) external returns (bytes[] memory results) {
        _assertOperator(tokenId);
        if (actions.length == 0) revert AgentNFA__InvalidAction();

        PolicyGuard guard = policyGuardOf[tokenId];
        uint256 totalValue = 0;

        // Calculate total value for batch validation
        for (uint256 i = 0; i < actions.length; i++) {
            totalValue += actions[i].value;
        }

        // Validate entire batch through PolicyGuard
        try guard.validate(address(0), totalValue, portfolioValueUsdt) {
            // Validation passed, execute all
            results = new bytes[](actions.length);
            for (uint256 i = 0; i < actions.length; i++) {
                results[i] = _executeAction(actions[i]);
            }
            // Commit after all successful
            guard.commit(totalValue);
            emit BatchExecuted(tokenId, actions.length);
        } catch (bytes memory reason) {
            revert AgentNFA__PolicyRejected(_decodeRevertReason(reason));
        }
    }

    // ── Internal ──────────────────────────────────────────────────

    function _executeAction(Action calldata action) internal returns (bytes memory) {
        (bool success, bytes memory result) = action.target.call{value: action.value}(action.data);
        if (!success) {
            revert AgentNFA__ExecutionFailed(result);
        }
        return result;
    }

    function _assertOperator(uint256 tokenId) internal view {
        if (msg.sender != operatorOf[tokenId] && msg.sender != ownerOf[tokenId]) {
            revert AgentNFA__NotOperator();
        }
    }

    function _decodeRevertReason(bytes memory reason) internal pure returns (string memory) {
        if (reason.length < 68) return "Unknown error";
        // Skip 4-byte selector, read string
        uint256 abiEncodedLength = (reason.length - 4) / 32;
        if (abiEncodedLength == 0) return "Unknown error";
        return abi.decode(reason, (string));
    }

    // ── Admin ─────────────────────────────────────────────────────

    function setOperator(uint256 tokenId, address newOperator) external {
        require(msg.sender == ownerOf[tokenId] || msg.sender == admin, "Not authorized");
        address old = operatorOf[tokenId];
        operatorOf[tokenId] = newOperator;
        emit OperatorUpdated(tokenId, old, newOperator);
    }

    function setPolicyGuard(uint256 tokenId, address newPolicyGuard) external {
        require(msg.sender == ownerOf[tokenId] || msg.sender == admin, "Not authorized");
        require(newPolicyGuard != address(0), "Zero address");
        policyGuardOf[tokenId] = PolicyGuard(newPolicyGuard);
    }

    // ── View ──────────────────────────────────────────────────────

    function accountOf(uint256 tokenId) external view returns (address) {
        return vaultOf[tokenId];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // ERC-721
        return interfaceId == 0x80ac58cd || interfaceId == 0x01ffc9a7;
    }
}
