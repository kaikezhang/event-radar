import { applyDarkModeGuard } from './theme-guard.js';

describe('applyDarkModeGuard', () => {
  it('forces the document into dark mode for production rendering', () => {
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = 'light';

    applyDarkModeGuard();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
