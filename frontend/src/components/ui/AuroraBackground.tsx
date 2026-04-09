import React from 'react';

interface AuroraBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const auroraStyles = `
  @keyframes aurora-1 {
    0%   { transform: translate(0%, 0%) scale(1); }
    100% { transform: translate(3%, -5%) scale(1.03); }
  }
  @keyframes aurora-2 {
    0%   { transform: translate(0%, 0%) scale(1); }
    100% { transform: translate(-4%, 3%) scale(1.02); }
  }
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = auroraStyles;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function AuroraBackground({ children, className = '', style }: AuroraBackgroundProps) {
  React.useEffect(() => { injectStyles(); }, []);

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Reduced from 3 → 2 blobs, blur 100/80 → 60/50, smaller sizes */}
        <div
          className="absolute -top-[20%] left-[15%] h-[35%] w-[35%] rounded-full opacity-20 blur-[60px]"
          style={{
            background: 'radial-gradient(ellipse, #26a17b 0%, transparent 70%)',
            animation: 'aurora-1 15s ease-in-out infinite alternate',
          }}
        />
        <div
          className="absolute top-[10%] -right-[5%] h-[30%] w-[30%] rounded-full opacity-15 blur-[50px]"
          style={{
            background: 'radial-gradient(ellipse, #22d3ee 0%, transparent 70%)',
            animation: 'aurora-2 20s ease-in-out infinite alternate',
          }}
        />
      </div>
      {children}
    </div>
  );
}
