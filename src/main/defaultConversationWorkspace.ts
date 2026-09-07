import fs from 'fs';
import os from 'os';
import path from 'path';

export const getDefaultConversationWorkspacePath = (): string => {
  return path.join(os.homedir(), '.xiaoruan', 'scratch');
};

export const ensureDefaultConversationWorkspacePath = (): string => {
  const workspacePath = getDefaultConversationWorkspacePath();
  fs.mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
};

export const isDefaultConversationWorkspacePath = (candidatePath: string): boolean => {
  const normalizedCandidatePath = path.resolve(candidatePath);
  const normalizedDefaultPath = path.resolve(getDefaultConversationWorkspacePath());
  return process.platform === 'win32'
    ? normalizedCandidatePath.toLowerCase() === normalizedDefaultPath.toLowerCase()
    : normalizedCandidatePath === normalizedDefaultPath;
};
