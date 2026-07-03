import { useCallback, useState } from 'react';

import { apiFetch } from '../../lib/api';

type Payload = Record<string, any>;

export function useCasperDashboardActions(loadSnapshot: (options?: { silent?: boolean }) => Promise<void>) {
  const [actionStatus, setActionStatus] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const postAction = useCallback(async (path: string, body?: Payload, okStatus = 'updated') => {
    setActionBusy(true);
    setActionStatus('working');
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(`${path} ${response.status}`);
      setActionStatus(okStatus);
      await loadSnapshot({ silent: true });
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'action failed');
    } finally {
      setActionBusy(false);
    }
  }, [loadSnapshot]);

  const runCycle = useCallback(() => {
    void postAction('/api/cycle/run', {
      decisionId: `dashboard-${Date.now()}`,
      submit: false,
    }, 'cycle recorded');
  }, [postAction]);

  const startLoop = useCallback(() => {
    void postAction('/api/loop/start?interval_sec=60&dry_run=true', undefined, 'loop started');
  }, [postAction]);

  const stopLoop = useCallback(() => {
    void postAction('/api/loop/stop', undefined, 'loop stopped');
  }, [postAction]);

  return { actionBusy, actionStatus, runCycle, startLoop, stopLoop };
}
