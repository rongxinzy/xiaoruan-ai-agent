// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { Artifact } from '@/types/artifact';
import ArtifactPreviewCard from './ArtifactPreviewCard';

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: () => null,
}));
vi.mock('@/services/i18n', () => ({
  i18nService: { t: (key: string) => key },
}));

const artifact: Artifact = {
  id: 'artifact-1',
  messageId: '',
  sessionId: 'session-1',
  type: 'html',
  title: 'report.html',
  content: '',
  fileName: 'report.html',
  filePath: 'C:/workspace/report.html',
  source: 'tool',
  role: 'deliverable',
  createdAt: 1,
};

test('keeps a pending generated file visible but disables preview opening', () => {
  render(<ArtifactPreviewCard artifact={artifact} isLoading />);

  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText('artifactOpen')).toBeNull();
});

test('enables preview opening after generated file content is ready', () => {
  render(<ArtifactPreviewCard artifact={{ ...artifact, content: '<html />' }} />);

  expect(screen.getByRole('button')).toBeEnabled();
  expect(screen.getByText('artifactOpen')).toBeInTheDocument();
});
