import { AISphere } from '../../shared/aisphere';
import { aisphereService } from './service';

export function selectAISphereModel(
  config: { model?: { defaultModel?: string; defaultModelProvider?: string } },
  ref?: string,
) {
  if (ref !== undefined) {
    const prefix = AISphere.Provider + '/';
    return aisphereService.selection(
      ref.startsWith(prefix) ? ref.slice(prefix.length) : '',
      AISphere.Provider,
    );
  }
  const provider = config.model?.defaultModelProvider;
  try {
    return aisphereService.selection(config.model?.defaultModel, provider);
  } catch (error) {
    // An explicit non-AISphere selection must stay unresolved instead of being
    // substituted with a platform model.
    if (provider && provider !== AISphere.Provider) throw error;
    // The stored default is cleared by a failed platform refresh and can also
    // disappear when the platform retires a model. Resolve the app default to
    // the first model in the catalog instead, so consumers such as the built-in
    // coding agent recover on their own; a rethrown error below keeps the real
    // "platform unavailable" case visible.
    const fallbackModel = aisphereService.snapshot().models[0]?.id;
    if (!fallbackModel) throw error;
    return aisphereService.selection(fallbackModel, AISphere.Provider);
  }
}
