import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext.js';
import { ConnectionProvider } from '../contexts/ConnectionContext.js';

export function renderWithQuery(
  ui: ReactElement,
): ReturnType<typeof render> & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ConnectionProvider>{children}</ConnectionProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  const result = render(ui, { wrapper: Wrapper });

  return Object.assign(result, { queryClient });
}

export function renderWithRouter(
  routes: RouteObject[],
  initialEntries: string[],
): ReturnType<typeof render> & {
  queryClient: QueryClient;
  router: ReturnType<typeof createMemoryRouter>;
} {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const router = createMemoryRouter(routes, {
    initialEntries,
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConnectionProvider>
          <RouterProvider router={router} />
        </ConnectionProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return Object.assign(result, { queryClient, router });
}
