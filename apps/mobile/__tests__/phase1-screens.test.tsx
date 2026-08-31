import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import CreateCaseScreen from '../app/cases/new';
import MockResultScreen from '../app/results/[generationJobId]';
import { dentPilotApi } from '../src/api/client';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ generationJobId: '00000000-0000-4000-8000-000000000001' }),
}));

jest.mock('../src/api/client', () => ({
  dentPilotApi: {
    createCase: jest.fn(),
    getGeneration: jest.fn(),
    authenticatedMediaSource: jest.fn(() => ({ uri: 'http://example.test/mock.png', headers: {} })),
  },
}));

jest.mock('../src/auth/auth-provider', () => ({
  useAuth: () => ({ state: { status: 'authenticated' } }),
}));

function TestProvider({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe('Phase 1 mobile workflow states', () => {
  beforeEach(() => jest.clearAllMocks());

  it('submits fictional case creation with a disabled duplicate-submit state', async () => {
    jest.mocked(dentPilotApi.createCase).mockReturnValue(new Promise<string>(() => undefined));
    render(<CreateCaseScreen />, { wrapper: TestProvider });
    fireEvent.changeText(screen.getByTestId('case-label-input'), 'Fictional case');
    fireEvent.press(screen.getByTestId('submit-create-case'));
    await waitFor(() => expect(screen.getByText('Creating…')).toBeTruthy());
    expect(dentPilotApi.createCase).toHaveBeenCalledWith({ displayLabel: 'Fictional case' });
  });

  it('shows a processing state while the server owns generation status', async () => {
    jest.mocked(dentPilotApi.getGeneration).mockResolvedValue({
      job: {
        id: '00000000-0000-4000-8000-000000000001', caseId: '00000000-0000-4000-8000-000000000002', projectId: '00000000-0000-4000-8000-000000000003', sourceMediaId: '00000000-0000-4000-8000-000000000004', providerKey: 'mock', status: 'processing', createdAt: '2026-01-01T00:00:00.000Z', startedAt: null, finishedAt: null, errorCode: null,
      },
      version: null,
    });
    const rendered = render(<MockResultScreen />, { wrapper: TestProvider });
    expect(await screen.findByText('Mock generation is processing…')).toBeTruthy();
    rendered.unmount();
  });

  it('shows an actionable failure state for a failed generation', async () => {
    jest.mocked(dentPilotApi.getGeneration).mockResolvedValue({
      job: {
        id: '00000000-0000-4000-8000-000000000001', caseId: '00000000-0000-4000-8000-000000000002', projectId: '00000000-0000-4000-8000-000000000003', sourceMediaId: '00000000-0000-4000-8000-000000000004', providerKey: 'mock', status: 'failed', createdAt: '2026-01-01T00:00:00.000Z', startedAt: null, finishedAt: '2026-01-01T00:00:01.000Z', errorCode: 'GENERATION_FAILED',
      },
      version: null,
    });
    render(<MockResultScreen />, { wrapper: TestProvider });
    expect(await screen.findByText('Mock generation did not complete')).toBeTruthy();
  });
});
