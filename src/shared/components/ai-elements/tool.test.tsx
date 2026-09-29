// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { Pencil } from 'lucide-react';
import { expect, test } from 'vitest';

import { Tool, ToolHeader } from './tool';

test('keeps the icon, title, status, and chevron in separate header tracks', () => {
  render(
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName="coding-agent"
        state="output-available"
        title="A long command title that may wrap without moving the completed status"
        icon={<Pencil />}
      />
    </Tool>,
  );

  const header = screen.getByRole('button');
  expect(header).toHaveClass('grid', 'grid-cols-[1rem_minmax(0,1fr)_auto_1rem]', 'text-left');

  const icon = header.querySelector('[data-slot="tool-icon"]');
  expect(icon).toHaveClass('size-4', '[&>svg]:size-4');

  const title = header.querySelector('[data-slot="tool-title"]');
  expect(title).toHaveClass('min-w-0', 'break-words', 'text-left');

  const status = header.querySelector('[data-slot="tool-status"]');
  expect(status).toHaveClass('shrink-0', 'justify-self-end');
});
