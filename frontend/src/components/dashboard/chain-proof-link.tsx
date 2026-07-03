import { ExternalLinkIcon, HashIcon } from 'lucide-react';

type LinkProps = {
  hash?: string | null;
  explorerUrl?: string | null;
  explorerBaseUrl?: string | null;
  kind?: 'deploy' | 'contract' | 'contract-package' | 'account';
  label?: string;
};

const shortHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

export function chainExplorerUrl({ hash, explorerUrl, explorerBaseUrl, kind = 'deploy' }: LinkProps) {
  if (explorerUrl) return explorerUrl;
  if (!hash) return '';
  const baseUrl = (explorerBaseUrl || 'https://testnet.cspr.live').replace(/\/$/, '');
  return `${baseUrl}/${kind}/${hash}`;
}

export function ChainProofLink(props: LinkProps) {
  const hash = props.hash ?? '';
  const href = chainExplorerUrl(props);
  if (!hash || !href) return <span className="chain-proof-missing">pending</span>;
  const label = props.label ?? `${props.kind ?? 'deploy'} proof`;
  return (
    <a className="chain-proof-link" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label} on Casper explorer`}>
      <HashIcon className="h-3 w-3" />
      {props.label ? <span>{props.label}</span> : null}
      {shortHash(hash)}
      <ExternalLinkIcon className="h-3 w-3" />
    </a>
  );
}

export default ChainProofLink;
