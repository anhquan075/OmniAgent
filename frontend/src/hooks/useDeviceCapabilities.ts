import { useState, useEffect } from 'react';

interface DeviceCapabilities {
  isLowEnd: boolean;
  prefersReducedMotion: boolean;
  canUseWebGL: boolean;
}

export function useDeviceCapabilities(): DeviceCapabilities {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities>({
    isLowEnd: false,
    prefersReducedMotion: false,
    canUseWebGL: false
  });

  useEffect(() => {
    const cpuCores = navigator.hardwareConcurrency || 4;
    const deviceMemory = (navigator as any).deviceMemory || 4;
    
    const isLowEnd = cpuCores <= 4 || deviceMemory <= 4;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    setCapabilities({ 
      isLowEnd, 
      prefersReducedMotion, 
      canUseWebGL: false 
    });
  }, []);

  return capabilities;
}
