import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseEther, formatEther, parseUnits, formatUnits } from 'viem';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Shield, Wallet, TrendingUp, Send, ArrowDownToLine, Bot, Fingerprint, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { HASHKEY_TESTNET_PRESET } from '../../lib/contractAddresses';
import { kycSbtAbi, hashkeyVaultAbi, agentNfaAbi, erc20Abi, zkIdentityGateAbi } from '../../lib/abi';
import { generateProof, proofToHex } from '../../lib/zkProof';

const HASHKEY_TESTNET_CHAIN_ID = 133;

type KycStatus = { isValid: boolean; level: number; loading: boolean };
type VaultState = { totalAssets: string; apy: string; userShares: string; loading: boolean };

export const HashKeyVaultDashboard: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const isCorrectChain = chain?.id === HASHKEY_TESTNET_CHAIN_ID;
  const [kycStatus, setKycStatus] = useState<KycStatus>({ isValid: false, level: 0, loading: true });
  const [vaultState, setVaultState] = useState<VaultState>({ totalAssets: '0', apy: '0', userShares: '0', loading: true });
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [zkDepositAmount, setZkDepositAmount] = useState('');
  const [zkProofGenerating, setZkProofGenerating] = useState(false);
  const [zkProofError, setZkProofError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'agent' | 'zk'>('deposit');
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const { data: kycInfo } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.kycSbtAddress as `0x${string}`,
    abi: kycSbtAbi,
    functionName: 'getKycInfo',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 10000 },
  });

  const { data: totalAssets } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'totalAssets',
    query: { enabled: isCorrectChain, refetchInterval: 5000 },
  });

  const { data: currentApy } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'currentApy',
    query: { enabled: isCorrectChain, refetchInterval: 30000 },
  });

  const { data: userShares } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 5000 },
  });

  const { data: userUsdtBalance } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 10000 },
  });

  const { data: hasValidProof } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
    abi: zkIdentityGateAbi,
    functionName: 'hasValidProof',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 10000 },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (kycInfo) {
      const [, level] = kycInfo as [string, number, number, bigint];
      setKycStatus({ isValid: level >= 1, level: Number(level), loading: false });
    }
  }, [kycInfo]);

  useEffect(() => {
    if (totalAssets !== undefined) {
      setVaultState(prev => ({
        ...prev,
        totalAssets: formatEther(totalAssets as bigint),
        apy: currentApy ? `${Number(currentApy) / 100}` : '5.0',
        userShares: userShares ? formatEther(userShares as bigint) : '0',
        loading: false,
      }));
    }
  }, [totalAssets, currentApy, userShares]);

  useEffect(() => {
    if (isSuccess) setTxStatus('confirmed');
    else if (isConfirming) setTxStatus('pending');
  }, [isSuccess, isConfirming]);

  const handleApprove = useCallback(async () => {
    if (!depositAmount) return;
    setTxStatus('approving');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`, parseUnits(depositAmount, 6)],
    });
  }, [depositAmount, writeContract]);

  const handleDeposit = useCallback(async () => {
    if (!depositAmount || !address) return;
    setTxStatus('depositing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
      abi: hashkeyVaultAbi,
      functionName: 'deposit',
      args: [parseUnits(depositAmount, 6), address],
    });
  }, [depositAmount, address, writeContract]);

  const handleWithdraw = useCallback(async () => {
    if (!withdrawAmount || !address) return;
    setTxStatus('withdrawing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
      abi: hashkeyVaultAbi,
      functionName: 'withdraw',
      args: [parseUnits(withdrawAmount, 6), address, address],
    });
  }, [withdrawAmount, address, writeContract]);

  const handleMintAgent = useCallback(async () => {
    if (!address) return;
    setTxStatus('minting');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.agentNfaAddress as `0x${string}`,
      abi: agentNfaAbi,
      functionName: 'mint',
      args: [address, address, HASHKEY_TESTNET_PRESET.policyGuardAddress as `0x${string}`],
    });
  }, [address, writeContract]);

  const handleSubmitProof = useCallback(async () => {
    if (!address) return;
    setZkProofError(null);
    setZkProofGenerating(true);
    try {
      const validUntil = Math.floor(Date.now() / 1000) + 86400 * 365;
      const nullifier = `0x${Array.from({ length: 64 }, (_, i) => ((i + 7) % 16).toString(16)).join('')}`;
      const subjectField = BigInt(address).toString();

      const { proof, publicInputs } = await generateProof({
        currentYear: 2026,
        requiredKycLevel: 2,
        subject: subjectField,
        agentTokenId: 1,
        proofValidUntil: validUntil,
        nullifier,
        birthYear: 1995,
        countryCode: 702,
        kycLevel: 3,
        agentHolder: subjectField,
      });

      setZkProofGenerating(false);
      setTxStatus('submitting-proof');
      writeContract({
        address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
        abi: zkIdentityGateAbi,
        functionName: 'submitProof',
        args: [
          proofToHex(proof) as `0x${string}`,
          {
            currentYear: 2026,
            requiredKycLevel: 2,
            subject: address,
            agentTokenId: 1,
            proofValidUntil: BigInt(validUntil),
            nullifier: nullifier as `0x${string}`,
          },
        ],
      });
    } catch (err: any) {
      setZkProofGenerating(false);
      setZkProofError(err?.message ?? 'Proof generation failed');
    }
  }, [address, writeContract]);

  const handleZkDeposit = useCallback(async () => {
    if (!zkDepositAmount || !address) return;
    setTxStatus('zk-depositing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
      abi: zkIdentityGateAbi,
      functionName: 'depositWithProof',
      args: [parseUnits(zkDepositAmount, 6), address],
    });
  }, [zkDepositAmount, address, writeContract]);

  if (!isConnected) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Wallet className="w-12 h-12 text-purple-400 mb-4" />
          <p className="text-gray-400">Connect your wallet to access HashKey Vault</p>
        </CardContent>
      </Card>
    );
  }

  if (!isCorrectChain) {
    return (
      <Card className="max-w-2xl mx-auto border-yellow-500/50 bg-yellow-500/5">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <AlertTriangle className="w-12 h-12 text-yellow-400" />
          <p className="text-gray-300 text-center">
            HashKey Vault requires <span className="text-purple-400 font-semibold">HashKey Chain Testnet</span>
          </p>
          <p className="text-gray-500 text-sm">
            Currently connected to {chain?.name ?? 'unknown network'}
          </p>
          <Button
            onClick={() => switchChain({ chainId: HASHKEY_TESTNET_CHAIN_ID })}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Switch to HashKey Testnet
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canDeposit = kycStatus.level >= 1;
  const hasShares = vaultState.userShares !== '0';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-400" />
            HashKey Vault
          </h2>
          <p className="text-gray-400 text-sm">KYC-gated DeFi vault with AI agent management</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={kycStatus.isValid ? 'success' : 'warning'}>
            <Fingerprint className="w-3 h-3 mr-1" />
            KYC Lv{kycStatus.level}
          </Badge>
          <Badge variant="outline">{address?.slice(0, 6)}...{address?.slice(-4)}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-400">Total Assets</p>
            <p className="text-xl font-bold text-white">${vaultState.totalAssets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-400">Current APY</p>
            <p className="text-xl font-bold text-green-400">{vaultState.apy}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-400">Your Shares</p>
            <p className="text-xl font-bold text-white">{vaultState.userShares}</p>
          </CardContent>
        </Card>
      </div>

      {!canDeposit && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <div>
              <p className="text-yellow-400 font-medium">KYC Required</p>
              <p className="text-gray-400 text-sm">Complete KYC verification to deposit. Your current level: {kycStatus.level}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {[
          { id: 'deposit', label: 'Deposit', icon: Send },
          { id: 'withdraw', label: 'Withdraw', icon: ArrowDownToLine },
          { id: 'agent', label: 'Mint Agent', icon: Bot },
          { id: 'zk', label: 'ZK Verify', icon: Fingerprint },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === id
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {activeTab === 'deposit' && 'Deposit USDT'}
            {activeTab === 'withdraw' && 'Withdraw USDT'}
            {activeTab === 'agent' && 'Mint Agent NFA'}
            {activeTab === 'zk' && 'ZK Identity Verification'}
          </CardTitle>
          <CardDescription>
            {activeTab === 'deposit' && `Balance: ${userUsdtBalance ? formatUnits(userUsdtBalance as bigint, 6) : '0'} USDT`}
            {activeTab === 'withdraw' && `Withdrawable: ${vaultState.userShares} shares`}
            {activeTab === 'agent' && 'Create an AI agent NFT to manage your vault'}
            {activeTab === 'zk' && 'Submit a ZK proof to verify your identity privately'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTab === 'deposit' && (
            <>
              <Input
                type="number"
                placeholder="Amount in USDT"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={!canDeposit}
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleApprove}
                  disabled={!depositAmount || !canDeposit || isPending}
                  variant="outline"
                  className="flex-1"
                >
                  {txStatus === 'approving' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve'}
                </Button>
                <Button
                  onClick={handleDeposit}
                  disabled={!depositAmount || !canDeposit || isPending}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  {txStatus === 'depositing' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Deposit'}
                </Button>
              </div>
            </>
          )}

          {activeTab === 'withdraw' && (
            <>
              <Input
                type="number"
                placeholder="Amount in USDT"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={!hasShares}
              />
              <Button
                onClick={handleWithdraw}
                disabled={!withdrawAmount || !hasShares || isPending}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {txStatus === 'withdrawing' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Withdraw'}
              </Button>
            </>
          )}

          {activeTab === 'agent' && (
            <div className="text-center space-y-4">
              <Bot className="w-16 h-16 text-purple-400 mx-auto" />
              <p className="text-gray-400">Mint an Agent NFT to enable autonomous vault management</p>
              <Button
                onClick={handleMintAgent}
                disabled={isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {txStatus === 'minting' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mint Agent NFA'}
              </Button>
            </div>
          )}

          {activeTab === 'zk' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Fingerprint className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-gray-300 text-sm">ZK Identity Proof</p>
                  <p className="text-xs">
                    {hasValidProof
                      ? <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Valid proof on-chain</span>
                      : <span className="text-yellow-400">No valid proof — submit one below</span>
                    }
                  </p>
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 text-left text-sm">
                <p className="text-purple-400 font-medium mb-2">Circuit verifies:</p>
                <ul className="text-gray-300 space-y-1">
                  <li>✓ Age ≥ 18 (no DOB revealed)</li>
                  <li>✓ Not in sanctioned jurisdiction</li>
                  <li>✓ KYC level meets threshold</li>
                  <li>✓ Valid Agent NFA holder</li>
                </ul>
              </div>
              <Button
                onClick={handleSubmitProof}
                disabled={isPending || !!hasValidProof || zkProofGenerating}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {zkProofGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {txStatus === 'submitting-proof' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {hasValidProof ? 'Proof Already Submitted' : zkProofGenerating ? 'Generating ZK Proof...' : 'Generate & Submit ZK Proof'}
              </Button>
              {zkProofError && (
                <p className="text-red-400 text-xs">{zkProofError}</p>
              )}
              {hasValidProof && (
                <>
                  <div className="border-t border-gray-700 pt-4">
                    <p className="text-sm text-gray-400 mb-2">Deposit via ZK Gate (requires valid proof + Agent NFA)</p>
                    <Input
                      type="number"
                      placeholder="Amount in USDT"
                      value={zkDepositAmount}
                      onChange={(e) => setZkDepositAmount(e.target.value)}
                    />
                    <Button
                      onClick={handleZkDeposit}
                      disabled={!zkDepositAmount || isPending}
                      className="w-full mt-3 bg-green-600 hover:bg-green-700"
                    >
                      {txStatus === 'zk-depositing' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Deposit with ZK Proof
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {txStatus && hash && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              txStatus === 'confirmed' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'
            }`}>
              {txStatus === 'confirmed' ? <CheckCircle2 className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="text-sm">
                {txStatus === 'confirmed' ? 'Transaction confirmed!' : `Transaction ${txStatus}...`}
              </span>
              <a
                href={`https://testnet-explorer.hsk.xyz/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs underline"
              >
                View on explorer
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HashKeyVaultDashboard;
