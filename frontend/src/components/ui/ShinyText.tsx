import React from 'react';

const shinyStyles = `
  @keyframes shiny-sweep {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = shinyStyles;
  document.head.appendChild(style);
  stylesInjected = true;
}

interface ShinyTextProps {
  text: string;
  className?: string;
  speed?: number;
  disabled?: boolean;
}

export function ShinyText({
  text,
  className = '',
  speed = 3,
  disabled = false,
}: ShinyTextProps) {
  React.useEffect(() => { injectStyles(); }, []);

  if (disabled) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      className={`inline-block bg-clip-text ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(120deg, transparent 0%, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%, transparent 100%)',
        backgroundSize: '200% 100%',
        backgroundRepeat: 'no-repeat',
        WebkitBackgroundClip: 'text',
        animation: `shiny-sweep ${speed}s linear infinite`,
      }}
    >
      {text}
    </span>
  );
}
