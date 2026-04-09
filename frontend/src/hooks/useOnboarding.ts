import { useState, useEffect, useCallback } from 'react';

const ONBOARDING_COMPLETED_KEY = 'omniagent_onboarding_completed';

interface OnboardingState {
  shouldShow: boolean;
  completeOnboarding: () => void;
  neverShowAgain: () => void;
  resetOnboarding: () => void;
}

export function useOnboarding(): OnboardingState {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const completed = sessionStorage.getItem(ONBOARDING_COMPLETED_KEY);
    if (!completed) {
      setShouldShow(true);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    sessionStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    setShouldShow(false);
  }, []);

  const neverShowAgain = useCallback(() => {
    sessionStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    setShouldShow(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    sessionStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    setShouldShow(true);
  }, []);

  return {
    shouldShow,
    completeOnboarding,
    neverShowAgain,
    resetOnboarding,
  };
}
