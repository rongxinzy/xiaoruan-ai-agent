// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';

import { ActivitySource, ActivityStatus } from '../../../shared/activity/constants';
import type { ActivityRun } from '../../../shared/activity/types';
import { i18nService } from '../../services/i18n';
import ActivityRunRow from './ActivityRunRow';

const run: ActivityRun = {
  id: 'run-1',
  source: ActivitySource.ScheduledTask,
  status: ActivityStatus.Failed,
  startedAt: 1,
  updatedAt: 2,
  taskName: '天气预报',
  // The payload from issue #105: the platform answers 503 with an English message.
  errorMessage:
    '503: {"message":"No running instances available","code":503,"type":"ServiceUnavailable"}',
};

beforeEach(() => i18nService.setLanguage('zh', { persist: false }));

test('renders a localized failure reason instead of the upstream English text', () => {
  const view = render(<ActivityRunRow run={run} animateEntrance={false} />);

  expect(view.container.textContent).toContain(i18nService.t('coworkErrorServerError'));
  expect(view.container.textContent).not.toContain('No running instances available');
});

test('prefers the stored error code when the wording is not classifiable', () => {
  const view = render(
    <ActivityRunRow
      run={{ ...run, errorMessage: 'Widget blew up', errorCode: 'scheduled_task_timeout' }}
      animateEntrance={false}
    />,
  );

  expect(view.container.textContent).toContain(i18nService.t('coworkErrorScheduledTaskTimeout'));
  expect(view.container.textContent).not.toContain('Widget blew up');
});
