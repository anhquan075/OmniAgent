// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IUltraVerifier { function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool); }
interface IHashKeyVault { function asset() external view returns (address); function deposit(uint256 assets, address receiver) external returns (uint256 shares); }
interface IAgentNFA { function ownerOf(uint256 tokenId) external view returns (address owner); }
interface IERC20 { function transferFrom(address from, address to, uint256 value) external returns (bool); function approve(address spender, uint256 value) external returns (bool); }

contract ZKIdentityGate {
    error ZeroAddress(); error InvalidProof(); error ExpiredProof(); error NullifierUsed(); error InvalidSignature();
    error InvalidSigner(); error InvalidInput(); error InvalidAgentOwner(); error NoValidProof(); error TransferFailed();
    error ApprovalFailed(); error ZeroAssets();

    struct CompliancePublicInputs { uint16 currentYear; uint8 requiredKycLevel; address subject; uint32 agentTokenId; uint64 proofValidUntil; bytes32 nullifier; }
    struct ProofStatus { uint64 validUntil; uint32 agentTokenId; bytes32 nullifier; uint64 verifiedAt; }

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PROOF_PERMIT_TYPEHASH = keccak256("ProofPermit(address subject,bytes32 publicInputsHash,uint256 validUntil,uint256 nonce,uint256 deadline)");
    uint256 private constant SECP256K1N_DIV_2 = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    IUltraVerifier public immutable verifier;
    IHashKeyVault public immutable vault;
    IAgentNFA public immutable agentNFA;
    IERC20 public immutable assetToken;
    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

    mapping(address => uint256) public nonces;
    mapping(bytes32 => bool) public nullifierUsed;
    mapping(address => ProofStatus) public proofOf;

    event ProofAccepted(address indexed subject, uint32 indexed agentTokenId, bytes32 indexed nullifier, uint64 validUntil, address relayer);
    event GatedDeposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);

    constructor(address verifier_, address vault_, address agentNFA_) {
        if (verifier_ == address(0) || vault_ == address(0) || agentNFA_ == address(0)) revert ZeroAddress();
        verifier = IUltraVerifier(verifier_);
        vault = IHashKeyVault(vault_);
        agentNFA = IAgentNFA(agentNFA_);
        assetToken = IERC20(IHashKeyVault(vault_).asset());
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    function submitProof(bytes calldata proof, CompliancePublicInputs calldata publicInputs) external {
        if (msg.sender != publicInputs.subject) revert InvalidSigner();
        _submitProof(proof, publicInputs, msg.sender);
    }

    function submitProofWithPermit(bytes calldata proof, CompliancePublicInputs calldata publicInputs, uint256 deadline, bytes calldata signature) external {
        if (deadline < block.timestamp) revert ExpiredProof();
        uint256 nonce = nonces[publicInputs.subject];
        bytes32 structHash = keccak256(abi.encode(PROOF_PERMIT_TYPEHASH, publicInputs.subject, _hashPublicInputs(publicInputs), uint256(publicInputs.proofValidUntil), nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
        address signer = _recoverSigner(digest, signature);
        if (signer == address(0)) revert InvalidSignature();
        if (signer != publicInputs.subject) revert InvalidSigner();
        nonces[publicInputs.subject] = nonce + 1;
        _submitProof(proof, publicInputs, msg.sender);
    }

    function depositWithProof(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAssets();
        ProofStatus memory status = proofOf[receiver];
        if (status.verifiedAt == 0 || status.validUntil < block.timestamp) revert NoValidProof();
        if (agentNFA.ownerOf(status.agentTokenId) != receiver) revert InvalidAgentOwner();
        _safeTransferFrom(assetToken, msg.sender, address(this), assets);
        _safeApprove(assetToken, address(vault), 0);
        _safeApprove(assetToken, address(vault), assets);
        shares = vault.deposit(assets, receiver);
        emit GatedDeposit(msg.sender, receiver, assets, shares);
    }

    function hasValidProof(address subject) external view returns (bool) {
        ProofStatus memory status = proofOf[subject];
        return status.verifiedAt != 0 && status.validUntil >= block.timestamp;
    }

    function _submitProof(bytes calldata proof, CompliancePublicInputs calldata publicInputs, address relayer) internal {
        if (publicInputs.subject == address(0)) revert ZeroAddress();
        if (publicInputs.proofValidUntil < block.timestamp) revert ExpiredProof();
        if (publicInputs.agentTokenId == 0 || publicInputs.nullifier == bytes32(0)) revert InvalidInput();
        if (nullifierUsed[publicInputs.nullifier]) revert NullifierUsed();
        if (!verifier.verify(proof, _toVerifierInputs(publicInputs))) revert InvalidProof();
        if (agentNFA.ownerOf(publicInputs.agentTokenId) != publicInputs.subject) revert InvalidAgentOwner();

        nullifierUsed[publicInputs.nullifier] = true;
        proofOf[publicInputs.subject] = ProofStatus(publicInputs.proofValidUntil, publicInputs.agentTokenId, publicInputs.nullifier, uint64(block.timestamp));
        emit ProofAccepted(publicInputs.subject, publicInputs.agentTokenId, publicInputs.nullifier, publicInputs.proofValidUntil, relayer);
    }

    function _toVerifierInputs(CompliancePublicInputs calldata inputs) internal pure returns (bytes32[] memory out) {
        out = new bytes32[](6);
        out[0] = bytes32(uint256(inputs.currentYear));
        out[1] = bytes32(uint256(inputs.requiredKycLevel));
        out[2] = bytes32(uint256(uint160(inputs.subject)));
        out[3] = bytes32(uint256(inputs.agentTokenId));
        out[4] = bytes32(uint256(inputs.proofValidUntil));
        out[5] = inputs.nullifier;
    }

    function _hashPublicInputs(CompliancePublicInputs calldata inputs) internal pure returns (bytes32) {
        return keccak256(abi.encode(inputs.currentYear, inputs.requiredKycLevel, inputs.subject, inputs.agentTokenId, inputs.proofValidUntil, inputs.nullifier));
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        return block.chainid == _cachedChainId ? _cachedDomainSeparator : _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256("ZKIdentityGate"), keccak256("1"), block.chainid, address(this)));
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }
        if (uint256(s) > SECP256K1N_DIV_2 || (v != 27 && v != 28)) return address(0);
        signer = ecrecover(digest, v, r, s);
    }

    function _safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeApprove(IERC20 token, address spender, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(token.approve.selector, spender, value));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert ApprovalFailed();
    }
}
