import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { __resetMockApiState } from '../lib/api.js';

beforeEach(() => {
  __resetMockApiState();
});
