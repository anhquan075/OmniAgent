// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract X402Registry {
    error X402Registry__NotOperator();
    error X402Registry__ZeroAddress();
    error X402Registry__DuplicatePayment();
    error X402Registry__InvalidAmount();

    event PaymentRecorded(
        bytes32 indexed paymentHash,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);

    struct Payment {
        address payer;
        address recipient;
        uint256 amount;
        uint256 timestamp;
        bool exists;
    }

    address public operator;
    mapping(bytes32 => Payment) public payments;
    mapping(address => uint256) public dailySpent;
    mapping(address => uint256) public lastResetDay;

    modifier onlyOperator() {
        if (msg.sender != operator) revert X402Registry__NotOperator();
        _;
    }

    constructor(address operator_) {
        if (operator_ == address(0)) revert X402Registry__ZeroAddress();
        operator = operator_;
    }

    function recordPayment(
        bytes32 paymentHash,
        address payer,
        address recipient,
        uint256 amount
    ) external onlyOperator returns (bool) {
        if (payments[paymentHash].exists) {
            revert X402Registry__DuplicatePayment();
        }
        if (amount == 0) {
            revert X402Registry__InvalidAmount();
        }

        payments[paymentHash] = Payment({
            payer: payer,
            recipient: recipient,
            amount: amount,
            timestamp: block.timestamp,
            exists: true
        });

        _updateDailySpent(payer, amount);

        emit PaymentRecorded(paymentHash, payer, recipient, amount, block.timestamp);
        return true;
    }

    function verifyPayment(bytes32 paymentHash) external view returns (Payment memory) {
        return payments[paymentHash];
    }

    function isPaymentVerified(bytes32 paymentHash) external view returns (bool) {
        return payments[paymentHash].exists;
    }

    function getDailySpent(address user) external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        if (today == lastResetDay[user]) {
            return dailySpent[user];
        }
        return 0;
    }

    function _updateDailySpent(address user, uint256 amount) internal {
        uint256 today = block.timestamp / 1 days;
        if (today != lastResetDay[user]) {
            dailySpent[user] = 0;
            lastResetDay[user] = today;
        }
        dailySpent[user] += amount;
    }

    function setOperator(address newOperator) external onlyOperator {
        if (newOperator == address(0)) revert X402Registry__ZeroAddress();
        address old = operator;
        operator = newOperator;
        emit OperatorUpdated(old, newOperator);
    }
}
