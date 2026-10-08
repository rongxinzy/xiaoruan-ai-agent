// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import {
  CodingAgentDriverKind,
  CodingAgentProfileStatus,
  type CodingAgentProfile,
  type CodingWorkspaceSummary,
} from '../../../shared/codingAgent';
import { i18nService } from '../../services/i18n';
import { CodingSessionSetupDialog } from './CodingSessionSetupDialog';

const workspace: CodingWorkspaceSummary = {
  id: 'workspace-1',
  name: 'Workspace',
  primaryRoot: '/workspace',
  defaultProfileId: 'opencode',
  sources: [{ id: 'source-1', workspaceId: 'workspace-1', path: '/workspace', isPrimary: true }],
  sessions: [],
  activeSessionId: null,
};

const profiles: CodingAgentProfile[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'External coding agent',
    driverKind: CodingAgentDriverKind.Acp,
    status: CodingAgentProfileStatus.Ready,
    capabilities: {
      supportsLoadSession: false,
      supportsResumeSession: false,
      supportsPlans: false,
      supportsPermissions: false,
      supportsFilesystem: false,
      supportsTerminal: false,
      supportsConfigOptions: false,
      supportsUsage: false,
      supportsElicitation: false,
    },
    authMethods: [],
    command: '/usr/local/bin/opencode',
    args: ['acp'],
    environment: {},
    isBuiltin: false,
  },
];

test('preselects the workspace default when that Agent is ready', () => {
  i18nService.setLanguage('zh', { persist: false });
  render(
    <CodingSessionSetupDialog
      workspace={workspace}
      profiles={profiles}
      onCancel={() => {}}
      onManageAgents={() => {}}
      onSubmit={() => {}}
    />,
  );

  expect(screen.getByRole('combobox', { name: '选择 Agent' })).toHaveTextContent('OpenCode');
  expect(screen.getByRole('button', { name: '确认' })).toBeEnabled();
});

test('keeps a registered agent listed when it is not ready', async () => {
  i18nService.setLanguage('zh', { persist: false });
  const builtin: CodingAgentProfile = {
    ...profiles[0],
    id: 'builtin-zhiyuan-coding',
    name: '晓软智能体编程 Agent',
    driverKind: CodingAgentDriverKind.Builtin,
    status: CodingAgentProfileStatus.NeedsConfiguration,
    command: null,
    isBuiltin: true,
  };
  render(
    <CodingSessionSetupDialog
      workspace={workspace}
      profiles={[builtin, ...profiles]}
      onCancel={() => {}}
      onManageAgents={() => {}}
      onSubmit={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole('combobox', { name: '选择 Agent' }));
  const options = await screen.findAllByRole('option');
  expect(options.map(option => option.textContent)).toEqual([
    '晓软智能体编程 Agent · 需要配置模型',
    'OpenCode',
  ]);
  expect(options[0]).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: '确认' })).toBeEnabled();
});
