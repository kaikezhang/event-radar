import { renderWithQuery } from '../test/render.js';
import { SeverityBadge } from './SeverityBadge.js';

describe('SeverityBadge', () => {
  it('renders the label and icon for critical alerts', () => {
    const { getByText, getByLabelText } = renderWithQuery(<SeverityBadge severity="CRITICAL" />);
    const badge = getByLabelText('Critical severity alert');

    expect(getByText('CRITICAL')).toBeInTheDocument();
    expect(getByLabelText('Critical severity alert')).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      'title',
      'CRITICAL = Major market-moving event, HIGH = Significant event, MEDIUM = Notable event, LOW = Minor event',
    );
  });

  it('renders accessible text for low severity alerts', () => {
    const { getByLabelText } = renderWithQuery(<SeverityBadge severity="LOW" />);

    expect(getByLabelText('Low severity alert')).toBeInTheDocument();
  });
});
