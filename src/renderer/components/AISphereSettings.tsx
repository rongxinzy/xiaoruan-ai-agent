import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
import { ModelCapabilityStatus } from '../../shared/providers/constants';
import { agentService } from '../services/agent';
import { configService } from '../services/config';
import { coworkService } from '../services/cowork';
import { i18nService } from '../services/i18n';
import { store, type RootState } from '../store';
import { updateCurrentSessionModelOverride } from '../store/slices/coworkSlice';
import {
  setDefaultSelectedModel,
  setSelectedModel,
  type Model,
} from '../store/slices/modelSlice';
import { toAgentModelRef } from '../utils/agentModelRef';

export function AISphereSettings() {
  const dispatch = useDispatch();
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const [snapshot, setSnapshot] = useState<AISphereSnapshot>();
  const [address, setAddress] = useState('');
  // 2026/09/23 区分正在进行的操作，避免连接/刷新互相把对方按钮置灰闪一下
  const [busyAction, setBusyAction] = useState<'connect' | 'refresh' | 'choose' | null>(null);
  const busy = busyAction !== null;
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(configService.getConfig().model.defaultModel ?? '');
  const t = (key: string) => i18nService.t(key);

  const resolveModel = (modelId: string): Model => {
    const fromAvailable = availableModels.find(
      model => model.id === modelId && model.providerKey === AISphere.Provider,
    );
    if (fromAvailable) return fromAvailable;
    const fromSnapshot = snapshot?.models.find(model => model.id === modelId);
    if (fromSnapshot) {
      return {
        id: fromSnapshot.id,
        name: fromSnapshot.name,
        providerKey: AISphere.Provider,
        supportsImage: fromSnapshot.capabilities.imageInput === ModelCapabilityStatus.Supported,
      };
    }
    return { id: modelId, name: modelId, providerKey: AISphere.Provider };
  };

  /**
   * 2026/09/22 lixiang
   * 设置页改默认后必须立刻推到 Chat：
   * 1) 同步写 Redux 默认模型（不能只等 App 的异步 config-updated）
   * 2) 同步当前会话 modelOverride（挂了 Skill 的 Chat 仍读会话选择）
   */
  const applyDefaultModelToChat = async (modelId: string) => {
    const model = resolveModel(modelId);
    const modelRef = toAgentModelRef(model);
    dispatch(setDefaultSelectedModel(model));
    dispatch(setSelectedModel({ agentId: 'main', model }));
    void agentService.updateAgent('main', { model: modelRef }).catch(error => {
      console.error('[AISphereSettings] failed to sync the agent model:', error);
    });

    const session = store.getState().cowork.currentSession;
    if (!session?.id) return;

    dispatch(
      updateCurrentSessionModelOverride({
        sessionId: session.id,
        modelOverride: modelRef,
      }),
    );
    try {
      await coworkService.updateSessionModel(session.id, modelRef);
    } catch (error) {
      console.error('[AISphereSettings] failed to sync the session model:', error);
    }
  };

  // 2026/09/22 lixiang  choose 上移供过期默认自动回落与手动选择共用
  const choose = async (value: string | null) => {
    if (!value || busyAction) return;
    setBusyAction('choose');
    setError('');
    try {
      // 先推 Chat，再落盘；避免只改 config、Chat 仍显示旧模型
      await applyDefaultModelToChat(value);
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
      setBusyAction(null);
    }
  };

  // 2026/09/22 lixiang  连接不可用时清空默认模型展示与本地选择
  const resetDefaultModelSelection = async () => {
    setSelected('');
    const config = configService.getConfig();
    if (!config.model.defaultModel) return;
    await configService.updateConfig({
      model: {
        ...config.model,
        defaultModel: '',
        defaultModelProvider: AISphere.Provider,
      },
    });
  };

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.electron.managedProviders.onChanged(() => {
      void window.electron.managedProviders
        .aisphereSnapshot()
        .then(async value => {
          if (disposed) return;
          setSnapshot(value);
          if (value.status === AISphereStatus.Ready) {
            setError(current => (current === AISphereError.Unavailable ? '' : current));
            return;
          }
          await resetDefaultModelSelection().catch(() => undefined);
        })
        .catch(() => {
          if (!disposed) setError(AISphereError.Unavailable);
        });
    });
    void window.electron.managedProviders
      .aisphereSnapshot()
      .then(async value => {
        if (disposed) return;
        setSnapshot(value);
        setAddress(value.address);
        if (value.status !== AISphereStatus.Ready) {
          await resetDefaultModelSelection().catch(() => undefined);
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

  // 2026/09/22 lixiang  Chat 改模型后回写 config，设置页本地 selected 跟随
  useEffect(() => {
    const syncSelectedFromConfig = () => {
      setSelected(configService.getConfig().model.defaultModel ?? '');
    };
    window.addEventListener('config-updated', syncSelectedFromConfig);
    return () => window.removeEventListener('config-updated', syncSelectedFromConfig);
  }, []);

  // 2026/09/22 lixiang  存储的默认模型缺失或不在目录时，自动持久化为目录首个模型
  useEffect(() => {
    if (busy || snapshot?.status !== AISphereStatus.Ready || !snapshot.models.length) return;
    if (snapshot.models.some(model => model.id === selected)) return;
    void choose(snapshot.models[0].id);
  }, [busy, snapshot, selected]);

  // 2026/09/22 lixiang  连接与刷新都使用输入框地址，避免刷新回落到旧绑定
  const connect = async (action: 'connect' | 'refresh') => {
    const target = address.trim();
    if (!target || busyAction) return;
    setBusyAction(action);
    setError('');
    try {
      const value = await window.electron.managedProviders.aisphereConnect(target);
      setSnapshot(value);
      setAddress(value.address);
      const config = await configService.reload();
      // 2026/09/22 lixiang  连接/刷新后校验默认模型仍在目录，否则写回首个模型并同步配置
      const nextSelected =
        value.models.some(model => model.id === config.model.defaultModel)
          ? (config.model.defaultModel ?? '')
          : (value.models[0]?.id ?? '');
      // 仅当默认模型需要纠正时才推到 Chat；刷新成功但默认未变时不要覆盖会话手选模型
      if (nextSelected && nextSelected !== config.model.defaultModel) {
        await applyDefaultModelToChat(nextSelected);
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
      const value = await window.electron.managedProviders.aisphereSnapshot().catch(() => undefined);
      // 2026/09/22 lixiang  连接失败清空目录展示；保留输入框地址，不回写旧绑定
      setSnapshot(
        value
          ? {
              ...value,
              address: target,
              status: AISphereStatus.Unavailable,
              models: [],
            }
          : {
              address: target,
              status: AISphereStatus.Unavailable,
              models: [],
            },
      );
      await resetDefaultModelSelection().catch(() => undefined);
      // 2026/09/22 lixiang  强制重载配置并通知 App，清空对话页可用模型列表
      await configService.reload().catch(() => undefined);
      window.dispatchEvent(new CustomEvent('config-updated'));
    } finally {
      setBusyAction(null);
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
              if (!busyAction && address.trim()) void connect('connect');
            }
          }}
          placeholder={t('aisphereAddressPlaceholder')}
          // 2026/09/23 连接中不禁用输入框，避免灰态闪烁；重复提交仍由 busyAction 拦截
          autoComplete="off"
        />
        <p className="text-sm text-muted-foreground">{t('aisphereDescription')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void connect('connect')}
            // 2026/09/23 仅禁用当前操作按钮，另一侧保持常态不闪灰
            disabled={busyAction === 'connect' || !address.trim()}
          >
            {/* 2026/09/23 用长文案占位，避免「正在连接」变短后刷新按钮左移 */}
            <span className="inline-grid justify-items-center">
              <span className="invisible col-start-1 row-start-1" aria-hidden>
                {t('aisphereConnect')}
              </span>
              <span className="col-start-1 row-start-1">
                {t(busyAction === 'connect' ? 'aisphereConnecting' : 'aisphereConnect')}
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void connect('refresh')}
            disabled={busyAction === 'refresh' || !address.trim()}
          >
            {/* 2026/09/23 刷新中文案较短，用「刷新模型」占位保持宽度 */}
            <span className="inline-grid justify-items-center">
              <span className="invisible col-start-1 row-start-1" aria-hidden>
                {t('aisphereRefresh')}
              </span>
              <span className="col-start-1 row-start-1">
                {t(busyAction === 'refresh' ? 'aisphereRefreshing' : 'aisphereRefresh')}
              </span>
            </span>
          </Button>
        </div>
      </div>
      {/* 2026/09/22 lixiang  有明确 error 时只展示红色告警，避免与 Unavailable 状态文案重复 */}
      {snapshot?.status === AISphereStatus.Ready ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('aisphereConnected')}
        </p>
      ) : !error ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            snapshot?.status === AISphereStatus.Unavailable
              ? AISphereError.Unavailable
              : 'aisphereUnconfigured',
          )}
        </p>
      ) : null}
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
          // 2026/09/23 连接中不因 busy 灰掉 Select，仅按连接态/目录是否可用禁用
          disabled={snapshot?.status !== AISphereStatus.Ready || !snapshot.models.length}
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
