import { renderWithQuery } from '../test/render.js';
import { SeverityBadge } from './SeverityBadge.js';
import userEvent from '@testing-library/user-event';

describe('SeverityBadge', () => {
  it('renders the label and icon for critical alerts', () => {
    const { getByText, getByRole } = renderWithQuery(<SeverityBadge severity="CRITICAL" />);
    const badge = getByRole('button', { name: 'Critical severity alert' });

    expect(getByText('CRITICAL')).toBeInTheDocument();
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      'title',
      'CRITICAL = Major market-moving event, HIGH = Significant event, MEDIUM = Notable event, LOW = Minor event',
    );
  });

  it('renders accessible text for low severity alerts', () => {
    const { getByRole } = renderWithQuery(<SeverityBadge severity="LOW" />);

    expect(getByRole('button', { name: 'Low severity alert' })).toBeInTheDocument();
  });

  it('shows a tap-friendly glossary popover on click', async () => {
    const user = userEvent.setup();
    const { getByRole, queryByText, getByText } = renderWithQuery(<SeverityBadge severity="HIGH" />);

    const badge = getByRole('button', { name: 'High severity alert' });
    expect(queryByText(/major market-moving event/i)).not.toBeInTheDocument();

    await user.click(badge);
    expect(getByText(/major market-moving event/i)).toBeInTheDocument();

    await user.click(badge);
    expect(queryByText(/major market-moving event/i)).not.toBeInTheDocument();
  });
});
