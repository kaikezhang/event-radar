import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="mt-8 border-t border-border-default pb-4 pt-4 text-center text-[12px] text-text-tertiary">
      <div className="flex items-center justify-center gap-3">
        <Link to="/privacy" className="hover:text-text-secondary transition">Privacy Policy</Link>
        <span>|</span>
        <Link to="/terms" className="hover:text-text-secondary transition">Terms of Service</Link>
      </div>
      <p className="mt-2 text-xs">Not financial advice. Always do your own research.</p>
      <p className="mt-1 text-xs">&copy; 2026 Event Radar</p>
    </footer>
  );
}
