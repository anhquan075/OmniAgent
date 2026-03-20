import { ethers } from 'ethers';
import { env } from '../config/env';

const SIMPLE_ACCOUNT_FACTORY_ABI = [
  'function createAccount(address owner) external returns (address account)',
  'function getAccountAddress(address owner) external view returns (address)',
  'function isValidAccount(address account) external view returns (bool)',
  'function owners(address account) external view returns (address)'
];

const SIMPLE_ACCOUNT_ABI = [
  'function execute(address dest, uint256 value, bytes calldata data) external',
  'function executeBatch(address[] calldata dests, uint256[] calldata values, bytes[] calldata datas) external',
  'function addDeposit() external payable',
  'function getBalance() external view returns (uint256)',
  'function getDeposit() external view returns (uint256)',
  'function withdrawNative(address payable to, uint256 amount) external',
  'function withdrawToken(address token, address to, uint256 amount) external',
  'function owner() external view returns (address)',
  'function entryPoint() external view returns (address)'
];

const PAYMASTER_ABI = [
  'function setTokenApproval(address token, bool approved, uint256 rate) external',
  'function isTokenApproved(address token) external view returns (bool)',
  'function tokenRates(address token) external view returns (uint256)'
];

interface ERC4337Account {
  address: string;
  owner: string;
  balance: string;
  deposit: string;
}

export class ERC4337SmartAccount {
  private provider: ethers.JsonRpcProvider;
  private factoryAddress: string;
  private paymasterAddress: string;

  constructor(
    factoryAddress: string = '',
    paymasterAddress: string = ''
  ) {
    this.provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
    this.factoryAddress = factoryAddress;
    this.paymasterAddress = paymasterAddress;
  }

  async getAccountAddress(ownerAddress: string): Promise<string> {
    if (!this.factoryAddress) {
      throw new Error('Factory not configured');
    }

    const factory = new ethers.Contract(
      this.factoryAddress,
      SIMPLE_ACCOUNT_FACTORY_ABI,
      this.provider
    );

    return await factory.getAccountAddress(ownerAddress);
  }

  async createAccount(ownerAddress: string, signer: ethers.Signer): Promise<string> {
    if (!this.factoryAddress) {
      throw new Error('Factory not configured');
    }

    const factory = new ethers.Contract(
      this.factoryAddress,
      SIMPLE_ACCOUNT_FACTORY_ABI,
      signer
    );

    const tx = await factory.createAccount(ownerAddress);
    const receipt = await tx.wait();
    
    const accountCreatedEvent = receipt.logs.find((log: any) => 
      log.topics[0] === (env.ERC4337_ACCOUNT_CREATED_TOPIC || '0x5ac3c6e8b0e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9')
    );
    
    return await factory.getAccountAddress(ownerAddress);
  }

  async getAccountInfo(accountAddress: string): Promise<ERC4337Account> {
    const account = new ethers.Contract(
      accountAddress,
      SIMPLE_ACCOUNT_ABI,
      this.provider
    );

    const [owner, balance, deposit] = await Promise.all([
      account.owner(),
      account.getBalance(),
      account.getDeposit()
    ]);

    return {
      address: accountAddress,
      owner,
      balance: ethers.formatEther(balance),
      deposit: ethers.formatEther(deposit)
    };
  }

  async executeTransaction(
    accountAddress: string,
    to: string,
    value: string,
    data: string,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    const account = new ethers.Contract(
      accountAddress,
      SIMPLE_ACCOUNT_ABI,
      signer
    );

    const tx = await account.execute(to, ethers.parseEther(value), data);
    return tx;
  }

  async executeBatch(
    accountAddress: string,
    dests: string[],
    values: string[],
    datas: string[],
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    const account = new ethers.Contract(
      accountAddress,
      SIMPLE_ACCOUNT_ABI,
      signer
    );

    const parsedValues = values.map(v => ethers.parseEther(v));
    const tx = await account.executeBatch(dests, parsedValues, datas);
    return tx;
  }

  async addDeposit(accountAddress: string, signer: ethers.Signer, amount: string): Promise<ethers.TransactionResponse> {
    const account = new ethers.Contract(
      accountAddress,
      SIMPLE_ACCOUNT_ABI,
      signer
    );

    const tx = await account.addDeposit({ value: ethers.parseEther(amount) });
    return tx;
  }

  async withdrawNative(
    accountAddress: string,
    to: string,
    amount: string,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    const account = new ethers.Contract(
      accountAddress,
      SIMPLE_ACCOUNT_ABI,
      signer
    );

    const tx = await account.withdrawNative(to, ethers.parseEther(amount));
    return tx;
  }

  async isTokenApprovedForPaymaster(tokenAddress: string): Promise<boolean> {
    if (!this.paymasterAddress) {
      return false;
    }

    const paymaster = new ethers.Contract(
      this.paymasterAddress,
      PAYMASTER_ABI,
      this.provider
    );

    return await paymaster.isTokenApproved(tokenAddress);
  }
}

export const erc4337Account = new ERC4337SmartAccount(
  process.env.ERC4337_FACTORY_ADDRESS,
  process.env.ERC4337_PAYMASTER_ADDRESS
);
