import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { DirectionBadge } from './DirectionBadge.js';

describe('DirectionBadge', () => {
  it('renders bullish direction with correct label', () => {
    render(<DirectionBadge direction="bullish" />);
    expect(screen.getByText(/BULLISH/)).toBeInTheDocument();
    expect(screen.getByText(/BULLISH/).closest('div')).toHaveAttribute(
      'title',
      'Bullish = Expected to push price UP, Bearish = Expected to push price DOWN',
    );
  });

  it('renders bearish direction with correct label', () => {
    render(<DirectionBadge direction="bearish" />);
    expect(screen.getByText(/BEARISH/)).toBeInTheDocument();
  });

  it('renders neutral direction with correct label', () => {
    render(<DirectionBadge direction="neutral" />);
    expect(screen.getByText(/NEUTRAL/)).toBeInTheDocument();
  });

  it('shows "High conf" for confidence >= 0.80', () => {
    render(<DirectionBadge direction="bullish" confidence={0.85} />);
    expect(screen.getByText(/High conf/)).toBeInTheDocument();
  });

  it('shows "Moderate" for confidence 0.60-0.79', () => {
    render(<DirectionBadge direction="bearish" confidence={0.65} />);
    expect(screen.getByText(/Moderate/)).toBeInTheDocument();
  });

  it('shows "Speculative" for confidence < 0.60', () => {
    render(<DirectionBadge direction="neutral" confidence={0.4} />);
    expect(screen.getByText(/Speculative/)).toBeInTheDocument();
  });

  it('shows confidence from bucket when numeric confidence is absent', () => {
    render(<DirectionBadge direction="bullish" confidenceBucket="high" />);
    expect(screen.getByText(/High conf/)).toBeInTheDocument();
  });

  it('hides confidence label when no data provided', () => {
    const { container } = render(<DirectionBadge direction="bullish" />);
    expect(container.textContent).not.toMatch(/High conf|Moderate|Speculative/);
  });

  it('falls back to neutral for unknown direction', () => {
    render(<DirectionBadge direction="sideways" />);
    expect(screen.getByText(/NEUTRAL/)).toBeInTheDocument();
  });
});
