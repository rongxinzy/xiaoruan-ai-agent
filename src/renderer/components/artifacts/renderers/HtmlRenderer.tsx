import React, { useEffect, useState } from 'react';

import { loadArtifactDataUrl } from '@/services/artifactFileLoader';
import { i18nService } from '@/services/i18n';
import type { Artifact } from '@/types/artifact';

import { PreviewOpenExternalMessage } from './constants';

const t = (key: string) => i18nService.t(key);

const OPEN_EXTERNAL_HREF = /^(mailto:|tel:|https?:)/i;

interface HtmlRendererProps {
  artifact: Artifact;
}

function hasRelativeResources(html: string): boolean {
  const srcRe = /(?:src|href)=["'](?!https?:|data:|blob:|#|javascript:)([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = srcRe.exec(html)) !== null) {
    const value = match[1];
    // Relative paths: ./file, ../file, file (no protocol)
    if (
      value.startsWith('./') ||
      value.startsWith('../') ||
      (!value.startsWith('/') && !value.includes(':'))
    ) {
      return true;
    }
    // Absolute paths to local source files (e.g., /src/main.jsx)
    if (value.startsWith('/') && !value.startsWith('//')) {
      return true;
    }
  }
  return false;
}

// 2026/09/17 lixiang  阻断应用深色 color-scheme 渗入 srcDoc，避免简历等浅底页白字不可见
export function ensurePreviewColorScheme(html: string): string {
  if (/name\s*=\s*["']color-scheme["']/i.test(html) || /color-scheme\s*:/i.test(html)) {
    return html;
  }
  const inject =
    '<meta name="color-scheme" content="light">' +
    '<style data-xiaoruan-preview-color-scheme>:root{color-scheme:light;}</style>';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${inject}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/(<html[^>]*>)/i, `$1<head>${inject}</head>`);
  }
  return `<!DOCTYPE html><html><head>${inject}</head><body>${html}</body></html>`;
}

/**
 * 2026/09/20 lisa srcDoc 预览里相对页面跳转会变空白（手机菜单常见）；
 * 2026/09/28：hash / mailto / tel / http(s) 在 srcDoc 里都会把 iframe 导航成空白——
 * 可锚点则同页滚动，可外开则 postMessage 给父页 shell.openExternal，否则停在当前页。
 */
export function injectPreviewNavigationGuard(html: string): string {
  if (html.includes('data-xiaoruan-preview-nav-guard')) return html;
  const messageType = PreviewOpenExternalMessage.Type;
  const script =
    '<script data-xiaoruan-preview-nav-guard>' +
    '(function(){' +
    'function findByAttr(attr,id){' +
    'var nodes=document.querySelectorAll("["+attr+"]");' +
    'for(var i=0;i<nodes.length;i++){if(nodes[i].getAttribute(attr)===id)return nodes[i];}' +
    'return null;' +
    '}' +
    'function findSection(id,label){' +
    'if(id){' +
    'var el=document.getElementById(id)||findByAttr("name",id)||findByAttr("data-section",id);' +
    'if(el)return el;' +
    '}' +
    'var key=(label||id||"").trim();' +
    'if(!key)return null;' +
    'var nodes=document.querySelectorAll("section,h1,h2,h3,h4,[id],[data-section]");' +
    'for(var i=0;i<nodes.length;i++){' +
    'var n=nodes[i];' +
    'var text=(n.getAttribute("data-section")||n.id||n.textContent||"").replace(/\\s+/g," ").trim();' +
    'if(!text)continue;' +
    'if(text===key||text.indexOf(key)!==-1||key.indexOf(text)!==-1)return n;' +
    '}' +
    'return null;' +
    '}' +
    'function scrollTo(el){' +
    'if(el&&el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"start"});' +
    '}' +
    'function resolveOpenUrl(href){' +
    'if(/^(mailto:|tel:|https?:)/i.test(href))return href;' +
    'if(/^[^\\s@/?#]+@[^\\s@/?#]+\\.[^\\s@/?#]+$/i.test(href))return "mailto:"+href;' +
    'return null;' +
    '}' +
    'function requestOpenExternal(url){' +
    'try{parent.postMessage({type:' +
    JSON.stringify(messageType) +
    ',url:url},"*");}catch(_err){}' +
    '}' +
    'document.addEventListener("click",function(e){' +
    'var a=e.target&&e.target.closest?e.target.closest("a"):null;' +
    'if(!a)return;' +
    'var href=(a.getAttribute("href")||"").trim();' +
    'if(!href||/^javascript:/i.test(href))return;' +
    'e.preventDefault();e.stopPropagation();' +
    'var openUrl=resolveOpenUrl(href);' +
    'if(openUrl){requestOpenExternal(openUrl);return;}' +
    'var hashIdx=href.indexOf("#");' +
    'var hashId=hashIdx>=0?decodeURIComponent(href.slice(hashIdx+1)).replace(/^#/,""):"";' +
    'var pathPart=hashIdx===0?"":href.slice(0,hashIdx>=0?hashIdx:href.length);' +
    'var pathId=pathPart.replace(/^\\.\\/?/,"").replace(/\\.html?$/i,"").replace(/[\\\\/]/g,"-");' +
    'var isHashOnly=href.charAt(0)==="#";' +
    'var isRelative=!/^[a-z][a-z0-9+.-]*:/i.test(href);' +
    'if(!isHashOnly&&!isRelative)return;' +
    'var label=(a.textContent||"").replace(/\\s+/g," ").trim();' +
    'scrollTo(findSection(hashId||pathId,label));' +
    '},true);' +
    '})();' +
    '</script>';
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${script}</html>`);
  }
  return `${html}${script}`;
}

function isPreviewOpenExternalMessage(
  data: unknown,
): data is { type: string; url: string } {
  if (!data || typeof data !== 'object') return false;
  const record = data as { type?: unknown; url?: unknown };
  return (
    record.type === PreviewOpenExternalMessage.Type &&
    typeof record.url === 'string' &&
    OPEN_EXTERNAL_HREF.test(record.url.trim())
  );
}

function preparePreviewHtml(html: string): string {
  return injectPreviewNavigationGuard(ensurePreviewColorScheme(html));
}

const HtmlRenderer: React.FC<HtmlRendererProps> = ({ artifact }) => {
  const [processedHtml, setProcessedHtml] = useState<string | null>(null);
  // A missing or unreadable source must surface as an error: the preview used to
  // stay on "Loading" forever, which reads as a hung panel.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isPreviewOpenExternalMessage(event.data)) return;
      const url = event.data.url.trim();
      const openExternal = window.electron?.shell?.openExternal;
      if (!openExternal) return;
      void openExternal(url).catch((error: unknown) => {
        console.error('[HtmlRenderer] failed to open external url from preview:', error);
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!artifact.content && !artifact.filePath) {
      setProcessedHtml(null);
      setFailed(true);
      return;
    }

    setFailed(false);
    let cancelled = false;

    const process = async () => {
      try {
        let html = artifact.content;

        // If content is empty but filePath exists, read file directly
        if (!html && artifact.filePath) {
          const result = await loadArtifactDataUrl(artifact.filePath);
          if (cancelled) return;
          try {
            const base64 = result.split(',')[1] || '';
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            html = new TextDecoder('utf-8').decode(bytes);
          } catch {
            if (!cancelled) {
              setProcessedHtml(null);
              setFailed(true);
            }
            return;
          }
        }

        if (!html) {
          if (!cancelled) {
            setProcessedHtml(null);
            setFailed(true);
          }
          return;
        }

        if (artifact.filePath && !hasRelativeResources(html)) {
          html = await inlineLocalResources(html, artifact.filePath);
        }
        if (!cancelled) setProcessedHtml(preparePreviewHtml(html));
      } catch {
        if (cancelled) return;
        if (artifact.content) {
          setProcessedHtml(preparePreviewHtml(artifact.content));
          return;
        }
        setProcessedHtml(null);
        setFailed(true);
      }
    };

    process();
    return () => {
      cancelled = true;
    };
  }, [artifact.content, artifact.filePath]);

  if (!artifact.content && !artifact.filePath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t('artifactDocumentError')}
      </div>
    );
  }

  // Content with relative resources and a filePath: inline resources not possible,
  // render via srcDoc with a <base> tag so relative URLs resolve
  if (artifact.filePath && artifact.content && hasRelativeResources(artifact.content)) {
    const lastSlash = Math.max(
      artifact.filePath.lastIndexOf('/'),
      artifact.filePath.lastIndexOf('\\'),
    );
    const dirPath = lastSlash >= 0 ? artifact.filePath.slice(0, lastSlash + 1) : '';
    const baseTag = dirPath ? `<base href="file://${dirPath.replace(/\\/g, '/')}">` : '';
    const withBase = baseTag
      ? artifact.content.replace(/(<head[^>]*>)/i, `$1${baseTag}`)
      : artifact.content;
    const htmlWithBase = preparePreviewHtml(withBase);
    return (
      <iframe
        srcDoc={htmlWithBase}
        className="w-full h-full border-0"
        style={{ colorScheme: 'light' }}
        sandbox="allow-scripts allow-same-origin"
        title={artifact.title}
      />
    );
  }

  // Nothing to show: either the load failed or it is still in flight.
  if (!processedHtml && !artifact.content) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {failed ? t('artifactDocumentError') : t('artifactDocumentLoading')}
      </div>
    );
  }

  // Self-contained HTML (no relative resources): use srcDoc
  return (
    <iframe
      srcDoc={processedHtml || preparePreviewHtml(artifact.content)}
      className="w-full h-full border-0"
      style={{ colorScheme: 'light' }}
      sandbox="allow-scripts"
      title={artifact.title}
    />
  );
};

function resolveRelativePath(src: string, htmlDir: string): string | null {
  if (
    !src ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:')
  ) {
    return null;
  }
  return src.startsWith('/') ? src : htmlDir + src;
}

async function inlineLocalResources(html: string, filePath: string): Promise<string> {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSlash <= 0) return html;
  const dir = filePath.slice(0, lastSlash + 1);

  const srcAttrs = /(?:src|data)=["']([^"']+)["']/gi;
  const matches = [...html.matchAll(srcAttrs)];
  const replacements: Array<[string, string]> = [];

  for (const match of matches) {
    const originalSrc = match[1];
    const absPath = resolveRelativePath(originalSrc, dir);
    if (!absPath) continue;

    try {
      const dataUrl = await loadArtifactDataUrl(absPath);
      replacements.push([originalSrc, dataUrl]);
    } catch {
      // Missing local resources are left untouched for the iframe to resolve.
    }
  }

  let result = html;
  for (const [original, replacement] of replacements) {
    result = result.split(original).join(replacement);
  }

  return result;
}

export default HtmlRenderer;
