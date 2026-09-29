import { getFileName } from '../../services/artifactParser';
import { stripFileProtocol } from '../cowork/helpers/localFilePathLinks';

const LOCAL_FILE_MARKDOWN_LINK_PATTERN =
  /!?\[([^\]\n]*)\]\(\s*<?(file:\/\/[^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/gi;

/**
 * Local file links are represented by ArtifactPreviewCard in coding turns.
 * Streamdown blocks file:// URLs before custom link rendering, so retain the
 * visible label while removing only the local URL from the markdown input.
 */
export const replaceLocalFileLinksWithLabels = (content: string): string =>
  content.replace(LOCAL_FILE_MARKDOWN_LINK_PATTERN, (_match, label: string, href: string) => {
    const visibleLabel = label.trim();
    return visibleLabel || getFileName(stripFileProtocol(href));
  });
