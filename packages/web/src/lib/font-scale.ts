export type FontScale = 'small' | 'medium' | 'large';

const FONT_SCALE_STORAGE_KEY = 'er-font-size';

const FONT_SIZE_BY_SCALE: Record<FontScale, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
};

function isFontScale(value: string | null): value is FontScale {
  return value === 'small' || value === 'medium' || value === 'large';
}

function applyFontScale(scale: FontScale, root: HTMLElement = document.documentElement): void {
  root.style.fontSize = FONT_SIZE_BY_SCALE[scale];
}

export function getStoredFontScale(): FontScale {
  try {
    const stored = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    if (isFontScale(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }

  return 'medium';
}

export function setStoredFontScale(scale: FontScale): void {
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
  } catch {
    // localStorage unavailable
  }

  applyFontScale(scale);
}

export function applyStoredFontScaleGuard(root: HTMLElement = document.documentElement): void {
  applyFontScale(getStoredFontScale(), root);
}
