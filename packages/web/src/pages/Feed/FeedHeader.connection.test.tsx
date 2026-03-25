import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import {
  ConnectionProvider,
  useSetConnectionRetry,
  useSetConnectionStatus,
} from '../../contexts/ConnectionContext.js';
import type { WebSocketStatus } from '../../hooks/useWebSocket.js';
import { FeedHeader } from './FeedHeader.js';

function renderHeaderWithConnection(
  status: WebSocketStatus,
  retry = vi.fn(),
) {
  function StatefulHeader() {
    const setStatus = useSetConnectionStatus();
    const setRetry = useSetConnectionRetry();

    useEffect(() => {
      setStatus(status);
      setRetry(retry);
    }, [setRetry, setStatus]);

    return (
      <FeedHeader
        activeTab="all"
        activeFilterCount={0}
        hasActiveFilters={false}
        onSortModeChange={vi.fn()}
        onTabChange={vi.fn()}
        onToggleFilters={vi.fn()}
        onToggleModeDropdown={vi.fn()}
        showModeDropdown={false}
        sortMode="latest"
      />
    );
  }

  return render(
    <ConnectionProvider>
      <StatefulHeader />
    </ConnectionProvider>,
  );
}

describe('FeedHeader connection states', () => {
  it('shows an explicit stale-data warning while disconnected', () => {
    renderHeaderWithConnection('disconnected');

    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/data may be stale/i)).toBeInTheDocument();
  });

  it('offers a manual retry button after repeated websocket failures', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    renderHeaderWithConnection('failed', retry);

    await user.click(screen.getByRole('button', { name: /connection lost.*click to retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
