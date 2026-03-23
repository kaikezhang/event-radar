export function applyDarkModeGuard(root: HTMLElement = document.documentElement): void {
  root.classList.add('dark');
  root.style.colorScheme = 'dark';
}
