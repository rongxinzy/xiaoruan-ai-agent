import { describe, expect, test } from 'vitest';

import { buildScheduleInput, createFormState } from './taskFormState';
import type { TaskTemplateValues } from './TaskTemplateGallery';

const templatePrefill = (expr: string): TaskTemplateValues => ({
  name: '财经新闻',
  description: '每日财经要闻',
  schedule: { kind: 'cron', expr },
  promptText: '搜索今日财经要闻',
});

describe('createFormState', () => {
  test('blank task defaults to an hourly schedule', () => {
    const form = createFormState();
    expect(form.planType).toBe('hourly');
    expect(buildScheduleInput(form)).toEqual({ kind: 'cron', expr: '0 * * * *' });
  });

  test('template prefill exposes the structured plan behind its cron expr', () => {
    const daily = createFormState(undefined, templatePrefill('0 9 * * *'));
    expect(daily.planType).toBe('daily');
    expect(daily.hour).toBe(9);
    expect(daily.minute).toBe(0);
    expect(buildScheduleInput(daily)).toEqual({ kind: 'cron', expr: '0 9 * * *' });

    const hourly = createFormState(undefined, templatePrefill('30 * * * *'));
    expect(hourly.planType).toBe('hourly');
    expect(buildScheduleInput(hourly)).toEqual({ kind: 'cron', expr: '30 * * * *' });
  });

  test('template prefill keeps the cron plan when the expr has no structured form', () => {
    const form = createFormState(undefined, templatePrefill('*/15 * * * *'));
    expect(form.planType).toBe('cron');
    expect(buildScheduleInput(form)).toEqual({ kind: 'cron', expr: '*/15 * * * *' });
  });
});
