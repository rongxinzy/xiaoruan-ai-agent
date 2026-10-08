import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import React from 'react';

import { i18nService } from '../../services/i18n';
// 2026/10/08  失败详情与活动流一致：走统一错误管道，界面只出中文
import { appErrorTextFromStored } from '../../services/errorNormalization';
import { compactMarkdownClass } from '../compactMarkdownClass';
import MarkdownContent from '../MarkdownContent';

interface FailureDetailModalProps {
  inputCommand: string;
  error: string;
  taskName?: string;
  runTime?: string;
  onClose: () => void;
}

const FailureDetailModal: React.FC<FailureDetailModalProps> = ({
  inputCommand,
  error,
  taskName,
  runTime,
  onClose,
}) => {
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="theme-control-card-surface">
        <DialogHeader>
          <div>
            <DialogTitle>{i18nService.t('scheduledTasksFailureDetailTitle')}</DialogTitle>
            {taskName && <p className="text-xs text-muted-foreground mt-0.5">{taskName}</p>}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {runTime && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {i18nService.t('scheduledTasksHistoryColTime')}
              </div>
              <div className="text-sm text-foreground">{runTime}</div>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {i18nService.t('scheduledTasksInputCommand')}
            </div>
            <div className="text-sm text-foreground bg-secondary rounded-lg p-3 whitespace-pre-wrap wrap-break-word border border-border">
              {inputCommand || '-'}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-destructive mb-1">
              {i18nService.t('scheduledTasksFailureReason')}
            </div>
            <div className="bg-destructive/10 rounded-lg p-3 wrap-break-word border border-destructive/20">
              {error ? (
                <MarkdownContent
                  content={appErrorTextFromStored(error)}
                  className={compactMarkdownClass('destructive')}
                />
              ) : (
                <span className="text-sm text-destructive">-</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {i18nService.t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FailureDetailModal;
