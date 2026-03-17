import { ethers } from 'ethers';
import { logger } from '../utils/logger';

/**
 * Aave V3 BNB Chain Constants
 */
export const AAVE_V3_POOL_BNB = '0x6807dc923806fE8Fd134338EABCA509979a7e0cB';
export const AAVE_V3_aUSDT_BNB = '0xc2c1C0AdF21A9731c87E6a369eb4f000e3E77f60';

const AAVE_ADAPTER_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function managedAssets() external view returns (uint256)",
  "function getHealthFactor() external view returns (uint256)",
  "function onVaultDeposit(uint256 amount) external",
  "function withdrawToVault(uint256 amount) external returns (uint256)"
];

export class AaveV3LendingAdapter {
  private adapterContract: ethers.Contract;

  constructor(adapterAddress: string, signer: ethers.Signer) {
    this.adapterContract = new ethers.Contract(adapterAddress, AAVE_ADAPTER_ABI, signer);
  }

  /**
   * Supply assets to Aave via the adapter
   * @param amount Amount in smallest units (e.g. USDT 6 decimals)
   */
  async supply(amount: bigint): Promise<ethers.ContractTransactionResponse> {
    logger.info({ amount: amount.toString() }, '[AaveV3LendingAdapter] Supplying assets to Aave');
    try {
      const tx = await this.adapterContract.onVaultDeposit(amount);
      logger.info({ hash: tx.hash }, '[AaveV3LendingAdapter] Supply transaction submitted');
      return tx;
    } catch (error) {
      logger.error({ error, amount: amount.toString() }, '[AaveV3LendingAdapter] Supply failed');
      throw error;
    }
  }

  /**
   * Withdraw assets from Aave to the vault via the adapter
   * @param amount Amount in smallest units
   */
  async withdraw(amount: bigint): Promise<ethers.ContractTransactionResponse> {
    logger.info({ amount: amount.toString() }, '[AaveV3LendingAdapter] Withdrawing assets from Aave');
    try {
      const tx = await this.adapterContract.withdrawToVault(amount);
      logger.info({ hash: tx.hash }, '[AaveV3LendingAdapter] Withdraw transaction submitted');
      return tx;
    } catch (error) {
      logger.error({ error, amount: amount.toString() }, '[AaveV3LendingAdapter] Withdraw failed');
      throw error;
    }
  }

  /**
   * Get current health factor for the adapter's position
   * @returns Health factor (scaled by 1e18)
   */
  async getHealthFactor(): Promise<bigint> {
    try {
      const healthFactor = await this.adapterContract.getHealthFactor();
      logger.debug({ healthFactor: healthFactor.toString() }, '[AaveV3LendingAdapter] Health factor retrieved');
      return healthFactor;
    } catch (error) {
      logger.error({ error }, '[AaveV3LendingAdapter] Failed to get health factor');
      throw error;
    }
  }

  /**
   * Get total assets managed by this adapter (idle + supplied)
   */
  async getManagedAssets(): Promise<bigint> {
    try {
      return await this.adapterContract.managedAssets();
    } catch (error) {
      logger.error({ error }, '[AaveV3LendingAdapter] Failed to get managed assets');
      throw error;
    }
  }
}
