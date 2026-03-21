import { useState, useEffect, useCallback } from 'react';

const NEVER_SHOW_KEY = 'omniagent_onboarding_never_show';

interface OnboardingState {
  shouldShow: boolean;
  completeOnboarding: () => void;
  neverShowAgain: () => void;
  resetOnboarding: () => void;
}

export function useOnboarding(): OnboardingState {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const neverShow = localStorage.getItem(NEVER_SHOW_KEY);
    if (!neverShow) {
      setShouldShow(true);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    setShouldShow(false);
  }, []);

  const neverShowAgain = useCallback(() => {
    localStorage.setItem(NEVER_SHOW_KEY, 'true');
    setShouldShow(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(NEVER_SHOW_KEY);
    setShouldShow(true);
  }, []);

  return {
    shouldShow,
    completeOnboarding,
    neverShowAgain,
    resetOnboarding,
  };
}
