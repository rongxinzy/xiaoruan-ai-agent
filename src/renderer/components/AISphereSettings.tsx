import { useEffect, useState } from 'react';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/components/ui/select';
import {
  AISphere,
  AISphereError,
  AISphereStatus,
  type AISphereSnapshot,
} from '../../shared/aisphere';
import { configService } from '../services/config';
import { i18nService } from '../services/i18n';

export function AISphereSettings() {
  const [snapshot, setSnapshot] = useState<AISphereSnapshot>();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(configService.getConfig().model.defaultModel ?? '');
  const t = (key: string) => i18nService.t(key);

  // 2026/09/22 lixiang  choose 上移供过期默认自动回落与手动选择共用
  const choose = async (value: string | null) => {
    if (!value) return;
    setBusy(true);
    setError('');
    try {
      await configService.updateConfig({
        model: {
          ...configService.getConfig().model,
          defaultModel: value,
          defaultModelProvider: AISphere.Provider,
        },
      });
      setSelected(value);
    } catch {
      setError(AISphereError.Unavailable);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.electron.managedProviders.onChanged(() => {
      void window.electron.managedProviders
        .aisphereSnapshot()
        .then(value => {
          if (!disposed) {
            setSnapshot(value);
            if (value.status === AISphereStatus.Ready)
              setError(current => (current === AISphereError.Unavailable ? '' : current));
          }
        })
        .catch(() => {
          if (!disposed) setError(AISphereError.Unavailable);
        });
    });
    void window.electron.managedProviders
      .aisphereSnapshot()
      .then(value => {
        if (!disposed) {
          setSnapshot(value);
          setAddress(value.address);
        }
      })
      .catch(() => {
        if (!disposed) setError(AISphereError.Unavailable);
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  // 2026/09/22 lixiang  存储的默认模型缺失或不在目录时，自动持久化为目录首个模型
  useEffect(() => {
    if (busy || snapshot?.status !== AISphereStatus.Ready || !snapshot.models.length) return;
    if (snapshot.models.some(model => model.id === selected)) return;
    void choose(snapshot.models[0].id);
  }, [busy, snapshot, selected]);

  const connect = async (refresh: boolean) => {
    setBusy(true);
    setError('');
    try {
      const value = refresh
        ? await window.electron.managedProviders.aisphereRefresh()
        : await window.electron.managedProviders.aisphereConnect(address);
      setSnapshot(value);
      setAddress(value.address);
      const config = await configService.reload();
      // 2026/09/22 lixiang  连接/刷新后校验默认模型仍在目录，否则写回首个模型并同步配置
      const nextSelected =
        value.models.some(model => model.id === config.model.defaultModel)
          ? (config.model.defaultModel ?? '')
          : (value.models[0]?.id ?? '');
      if (nextSelected && nextSelected !== config.model.defaultModel) {
        await configService.updateConfig({
          model: {
            ...config.model,
            defaultModel: nextSelected,
            defaultModelProvider: AISphere.Provider,
          },
        });
      } else {
        window.dispatchEvent(new CustomEvent('config-updated'));
      }
      setSelected(nextSelected);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(
        Object.values(AISphereError).find(code => message.includes(code)) ??
          AISphereError.Unavailable,
      );
      setSnapshot(await window.electron.managedProviders.aisphereSnapshot().catch(() => undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6 p-4">
      <div className="space-y-2">
        <Label htmlFor="aisphere-address">{t('aisphereAddress')}</Label>
        <Input
          id="aisphere-address"
          value={address}
          onChange={event => setAddress(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!busy && address.trim()) void connect(false);
            }
          }}
          placeholder={t('aisphereAddressPlaceholder')}
          disabled={busy}
          autoComplete="off"
        />
        <p className="text-sm text-muted-foreground">{t('aisphereDescription')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void connect(false)}
            disabled={busy || !address.trim()}
          >
            {t(busy ? 'aisphereConnecting' : 'aisphereConnect')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void connect(true)}
            disabled={busy || !snapshot?.address}
          >
            {t('aisphereRefresh')}
          </Button>
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {t(
          snapshot?.status === AISphereStatus.Ready
            ? 'aisphereConnected'
            : snapshot?.status === AISphereStatus.Unavailable
              ? AISphereError.Unavailable
              : 'aisphereUnconfigured',
        )}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <div className="space-y-2">
        <Label id="aisphere-model-label">{t('aisphereDefaultModel')}</Label>
        <Select
          value={snapshot?.models.some(model => model.id === selected) ? selected : null}
          onValueChange={value => void choose(value)}
          disabled={busy || snapshot?.status !== AISphereStatus.Ready || !snapshot.models.length}
        >
          <SelectTrigger className="w-full" aria-labelledby="aisphere-model-label">
            <SelectValue placeholder={t('aisphereSelectModel')} />
          </SelectTrigger>
          <SelectContent>
            {snapshot?.models.map(model => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {snapshot?.status === AISphereStatus.Ready && snapshot.models.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('aisphereNoModels')}</p>
        )}
      </div>
    </div>
  );
}
