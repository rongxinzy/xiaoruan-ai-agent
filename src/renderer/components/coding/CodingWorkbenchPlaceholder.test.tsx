// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { i18nService } from '../../services/i18n';
import { CodingWorkbenchPlaceholder } from './CodingWorkbenchPlaceholder';

vi.mock('../../services/i18n', () => ({
  i18nService: { t: (key: string) => key },
}));
vi.mock('../window/WindowTitleBar', () => ({
  default: () => <div data-testid="window-controls" />,
}));

beforeEach(() => {
  window.electron = { platform: 'win32' } as typeof window.electron;
});

test('keeps the shared page header and window controls visible while coding loads', () => {
  render(
    <CodingWorkbenchPlaceholder
      message={i18nService.t('codingAgentLoading')}
      isSidebarCollapsed
      onToggleSidebar={() => {}}
    />,
  );

  expect(screen.getByText('codingAgent')).toBeInTheDocument();
  expect(screen.getByText('codingAgentLoading')).toBeInTheDocument();
  expect(screen.getByTestId('window-controls')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument();
});
