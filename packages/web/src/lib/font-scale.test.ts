import {
  applyStoredFontScaleGuard,
  getStoredFontScale,
  setStoredFontScale,
} from './font-scale.js';

describe('font scale preference', () => {
  it('defaults to medium when no saved preference exists', () => {
    localStorage.removeItem('er-font-size');

    expect(getStoredFontScale()).toBe('medium');
  });

  it('persists the preference and applies the matching html font size', () => {
    setStoredFontScale('large');

    expect(localStorage.getItem('er-font-size')).toBe('large');
    expect(document.documentElement.style.fontSize).toBe('18px');
  });

  it('reads a stored preference before first render and applies it to the root element', () => {
    document.documentElement.style.fontSize = '';
    localStorage.setItem('er-font-size', 'small');

    applyStoredFontScaleGuard();

    expect(document.documentElement.style.fontSize).toBe('14px');
  });
});
