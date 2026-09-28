import React from 'react';

import { i18nService } from '../../services/i18n';
import PageHeader from '../PageHeader';

interface CodingWorkbenchPlaceholderProps {
  message: string;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const CodingWorkbenchPlaceholder: React.FC<CodingWorkbenchPlaceholderProps> = ({
  message,
  isSidebarCollapsed,
  onToggleSidebar,
}) => (
  <div className="flex h-full min-h-0 flex-col bg-background">
    <PageHeader
      title={i18nService.t('codingAgent')}
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebar={onToggleSidebar}
    />
    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  </div>
);
