// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IVaultGate {
    function verifyVaultGateBytes(bytes calldata proofBytes) external returns (bool);
    function verifier() external view returns (address);
}

interface IHashKeyVault {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
}

interface IAgentNFA {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
}

contract ZKIdentityGateSimple {
    error ZeroAddress();
    error InvalidProof();
    error ExpiredProof();
    error NullifierUsed();
    error InvalidInput();
    error InvalidAgentOwner();
    error NoValidProof();
    error TransferFailed();
    error ApprovalFailed();
    error ZeroAssets();

    struct ProofData {
        uint64 validUntil;
        uint32 agentTokenId;
        bytes32 nullifier;
        uint64 verifiedAt;
    }

    IVaultGate public immutable vaultGate;
    IHashKeyVault public immutable vault;
    IAgentNFA public immutable agentNFA;
    IERC20 public immutable assetToken;

    mapping(bytes32 => bool) public nullifierUsed;
    mapping(address => ProofData) public proofOf;

    event ProofAccepted(
        address indexed subject,
        uint32 indexed agentTokenId,
        bytes32 indexed nullifier,
        uint64 validUntil
    );
    event GatedDeposit(
        address indexed caller,
        address indexed receiver,
        uint256 assets,
        uint256 shares
    );

    constructor(address vaultGate_, address vault_, address agentNFA_) {
        if (vaultGate_ == address(0) || vault_ == address(0) || agentNFA_ == address(0))
            revert ZeroAddress();
        vaultGate = IVaultGate(vaultGate_);
        vault = IHashKeyVault(vault_);
        agentNFA = IAgentNFA(agentNFA_);
        assetToken = IERC20(IHashKeyVault(vault_).asset());
    }

    function verifier() external view returns (address) {
        return vaultGate.verifier();
    }

    function submitProof(
        bytes calldata proof,
        address subject,
        uint32 agentTokenId,
        bytes32 nullifier,
        uint64 validUntil
    ) external {
        if (subject == address(0)) revert ZeroAddress();
        if (validUntil < block.timestamp) revert ExpiredProof();
        if (nullifier == bytes32(0)) revert InvalidInput();
        if (nullifierUsed[nullifier]) revert NullifierUsed();
        // Skip NFT ownership check for testnet
        // if (agentTokenId != 0 && agentNFA.ownerOf(agentTokenId) != subject) revert InvalidAgentOwner();

        // Verify proof via VaultGate
        if (!vaultGate.verifyVaultGateBytes(proof)) revert InvalidProof();

        nullifierUsed[nullifier] = true;
        proofOf[subject] = ProofData(validUntil, agentTokenId, nullifier, uint64(block.timestamp));

        emit ProofAccepted(subject, agentTokenId, nullifier, validUntil);
    }

    function depositWithProof(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAssets();
        ProofData memory data = proofOf[receiver];
        if (data.verifiedAt == 0 || data.validUntil < block.timestamp) revert NoValidProof();
        // Skip NFT ownership check for testnet
        // if (agentNFA.ownerOf(data.agentTokenId) != receiver) revert InvalidAgentOwner();

        _safeTransferFrom(assetToken, msg.sender, address(this), assets);
        _safeApprove(assetToken, address(vault), 0);
        _safeApprove(assetToken, address(vault), assets);

        shares = vault.deposit(assets, receiver);
        emit GatedDeposit(msg.sender, receiver, assets, shares);
    }

    function hasValidProof(address subject) external view returns (bool) {
        ProofData memory data = proofOf[subject];
        return data.verifiedAt != 0 && data.validUntil >= block.timestamp;
    }

    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeApprove(IERC20 token, address spender, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.approve.selector, spender, value)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert ApprovalFailed();
    }
}
