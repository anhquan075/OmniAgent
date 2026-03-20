// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract ApprovalQueue {
    error ApprovalQueue__NotOperator();
    error ApprovalQueue__AlreadyExecuted();
    error ApprovalQueue__NotFound();
    error ApprovalQueue__Expired();
    error ApprovalQueue__ZeroAddress();

    event ApprovalRequested(
        bytes32 indexed requestHash,
        address indexed requester,
        address target,
        uint256 value,
        bytes data,
        uint256 timestamp
    );

    event ApprovalGranted(
        bytes32 indexed requestHash,
        address indexed approver,
        uint256 timestamp
    );

    event ApprovalRevoked(
        bytes32 indexed requestHash,
        address indexed revoker,
        uint256 timestamp
    );

    event RequestExecuted(
        bytes32 indexed requestHash,
        address indexed executor,
        bool success,
        uint256 timestamp
    );

    struct Request {
        address requester;
        address target;
        uint256 value;
        bytes data;
        uint256 timestamp;
        bool approved;
        bool executed;
        bool revoked;
        address approver;
    }

    address public operator;
    uint256 public approvalTimeoutSeconds;
    
    mapping(bytes32 => Request) public requests;
    mapping(bytes32 => bool) public approvalHashes;

    modifier onlyOperator() {
        if (msg.sender != operator) revert ApprovalQueue__NotOperator();
        _;
    }

    constructor(uint256 approvalTimeoutSeconds_) {
        operator = msg.sender;
        approvalTimeoutSeconds = approvalTimeoutSeconds_;
    }

    function requestApproval(
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bytes32 requestHash) {
        requestHash = keccak256(abi.encode(
            msg.sender,
            target,
            value,
            data,
            block.timestamp
        ));

        require(!requests[requestHash].executed, "Request already executed");
        
        requests[requestHash] = Request({
            requester: msg.sender,
            target: target,
            value: value,
            data: data,
            timestamp: block.timestamp,
            approved: false,
            executed: false,
            revoked: false,
            approver: address(0)
        });

        emit ApprovalRequested(requestHash, msg.sender, target, value, data, block.timestamp);
    }

    function approveRequest(bytes32 requestHash) external onlyOperator {
        Request storage request = requests[requestHash];
        
        if (request.requester == address(0)) revert ApprovalQueue__NotFound();
        if (request.executed) revert ApprovalQueue__AlreadyExecuted();
        if (request.revoked) revert ApprovalQueue__Expired();
        
        if (block.timestamp > request.timestamp + approvalTimeoutSeconds) {
            revert ApprovalQueue__Expired();
        }

        request.approved = true;
        request.approver = msg.sender;

        emit ApprovalGranted(requestHash, msg.sender, block.timestamp);
    }

    function revokeRequest(bytes32 requestHash) external onlyOperator {
        Request storage request = requests[requestHash];
        
        if (request.requester == address(0)) revert ApprovalQueue__NotFound();
        if (request.executed) revert ApprovalQueue__AlreadyExecuted();
        
        request.revoked = true;

        emit ApprovalRevoked(requestHash, msg.sender, block.timestamp);
    }

    function executeRequest(bytes32 requestHash) external returns (bool success) {
        Request storage request = requests[requestHash];
        
        if (request.requester == address(0)) revert ApprovalQueue__NotFound();
        if (request.executed) revert ApprovalQueue__AlreadyExecuted();
        if (!request.approved) revert ApprovalQueue__NotFound();
        if (request.revoked) revert ApprovalQueue__Expired();
        
        if (block.timestamp > request.timestamp + approvalTimeoutSeconds) {
            revert ApprovalQueue__Expired();
        }

        request.executed = true;

        (success, ) = request.target.call{value: request.value}(request.data);

        emit RequestExecuted(requestHash, msg.sender, success, block.timestamp);
    }

    function getRequest(bytes32 requestHash) external view returns (Request memory) {
        return requests[requestHash];
    }

    function isApproved(bytes32 requestHash) external view returns (bool) {
        return requests[requestHash].approved;
    }

    function isExecuted(bytes32 requestHash) external view returns (bool) {
        return requests[requestHash].executed;
    }

    function setOperator(address newOperator) external onlyOperator {
        if (newOperator == address(0)) revert ApprovalQueue__ZeroAddress();
        operator = newOperator;
    }

    function setApprovalTimeout(uint256 timeoutSeconds) external onlyOperator {
        approvalTimeoutSeconds = timeoutSeconds;
    }
}
