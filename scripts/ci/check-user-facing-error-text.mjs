/**
 * 界面文案必须是中文：组件不允许直接取原始错误串来渲染。
 *
 * `extractUserFacingErrorMessage()` 只负责从 JSON 载荷里取出 message，不做翻译，
 * 组件直接用它就会把上游英文贴到界面上（issue #105）。渲染层要显示错误时走
 * `appErrorText()` / `appErrorTextFromStored()`（先按错误码/分类翻译，最后中文兜底）。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const rendererRoot = 'src/renderer';
// 服务层是这个能力的实现处，允许出现；组件与 hooks 不允许。
const servicePrefix = path.join('src', 'renderer', 'services');
const forbiddenPattern = /\bextractUserFacingErrorMessage\b/;
const sourcePattern = /\.(?:ts|tsx)$/;

function walk(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) files.push(...walk(relativePath));
    else files.push(relativePath);
  }
  return files;
}

const failures = [];
for (const file of walk(rendererRoot)) {
  if (!sourcePattern.test(file) || /\.test\.(?:ts|tsx)$/.test(file)) continue;
  if (file.startsWith(servicePrefix)) continue;
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbiddenPattern.test(line)) {
      failures.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error(
    '[check-user-facing-error-text] 组件不得直接使用 extractUserFacingErrorMessage（原始错误串未翻译）：',
  );
  for (const failure of failures) console.error(`  ${failure}`);
  console.error('  请改用 appErrorText() 或 appErrorTextFromStored()。');
  process.exitCode = 1;
} else {
  console.log('[check-user-facing-error-text] ok — 组件未直接渲染未翻译的错误串');
}
