import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test } from "vitest";

const root = path.resolve(__dirname, "..");

function resourceSources(config: {
  extraResources?: Array<{ from?: string }>;
}): string[] {
  return (config.extraResources || []).flatMap((item) =>
    typeof item.from === "string" ? [item.from] : [],
  );
}

test("each desktop target keeps the private document and Python toolchain resources", () => {
  const config = JSON.parse(
    readFileSync(path.join(root, "electron-builder.json"), "utf8"),
  ) as {
    mac: { extraResources?: Array<{ from?: string }> };
    linux: { extraResources?: Array<{ from?: string }> };
    win: { extraResources?: Array<{ from?: string }> };
  };
  const mac = resourceSources(config.mac);
  const linux = resourceSources(config.linux);

  assert.deepEqual(
    [
      "resources/uv-mac",
      "resources/python-mac",
      "resources/skill-python",
    ].every((source) => mac.includes(source)),
    true,
  );
  assert.deepEqual(
    [
      "resources/uv-linux",
      "resources/python-linux",
      "resources/skill-python",
    ].every((source) => linux.includes(source)),
    true,
  );

  // Windows puts large resources in independently reusable component archives.
  const windowsResourcePack = readFileSync(
    path.join(root, "scripts", "windows-resource-pack.cjs"),
    "utf8",
  );
  for (const resource of ["mingit", "python-win", "skill-python", "uv-win"]) {
    assert.match(
      windowsResourcePack,
      new RegExp(`prefix: ["']${resource}["']`),
    );
  }
});

test("unpacks AnyDoc native bindings from the application archive", () => {
  const config = JSON.parse(
    readFileSync(path.join(root, "electron-builder.json"), "utf8"),
  ) as {
    asarUnpack?: string[];
  };
  assert.ok(config.asarUnpack?.includes("node_modules/@firecrawl/**"));

  const viteConfig = readFileSync(path.join(root, "vite.config.ts"), "utf8");
  const runtimeDependencies = readFileSync(
    path.join(root, "scripts", "electron-runtime-dependencies.mjs"),
    "utf8",
  );
  assert.match(
    viteConfig,
    /ELECTRON_MAIN_EXTERNALS\.includes\(id\)/,
  );
  assert.match(
    runtimeDependencies,
    /ELECTRON_MAIN_EXTERNALS\s*=\s*\[[\s\S]*['"]@firecrawl\/anydoc['"]/,
  );
});

test("unpacks npm for connector installation without a system Node.js runtime", () => {
  const config = JSON.parse(
    readFileSync(path.join(root, "electron-builder.json"), "utf8"),
  ) as {
    asarUnpack?: string[];
  };

  assert.ok(config.asarUnpack?.includes("node_modules/npm/**"));
});

test("unpacks ACP adapters without bundling external agent binaries", () => {
  const config = JSON.parse(
    readFileSync(path.join(root, "electron-builder.json"), "utf8"),
  ) as {
    files?: string[];
    asarUnpack?: string[];
  };

  assert.ok(
    config.asarUnpack?.includes(
      "node_modules/@agentclientprotocol/codex-acp/**",
    ),
  );
  assert.ok(
    config.asarUnpack?.includes(
      "node_modules/@agentclientprotocol/claude-agent-acp/**",
    ),
  );
  assert.ok(
    config.asarUnpack?.includes(
      "node_modules/@anthropic-ai/claude-agent-sdk/**",
    ),
  );
  assert.ok(config.asarUnpack?.includes("node_modules/zod/**"));
  assert.ok(!config.asarUnpack?.includes("node_modules/@anthropic-ai/**"));
  assert.ok(!config.asarUnpack?.includes("node_modules/@agentclientprotocol/**"));
  assert.ok(!config.asarUnpack?.includes("node_modules/@openai/**"));
  assert.ok(config.files?.includes("!node_modules/zod/src/**"));

  for (const platform of ["darwin", "linux", "win32"]) {
    assert.ok(
      config.files?.includes(
        `!node_modules/@anthropic-ai/claude-agent-sdk-${platform}-*/**`,
      ),
    );
    assert.ok(
      config.files?.includes(`!node_modules/@openai/codex-${platform}-*/**`),
    );
  }
});

test("release supply-chain gates track every checked-in npm lockfile", () => {
  const trackedLockfiles = execFileSync(
    "git",
    ["ls-files", "*package-lock.json"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  const policy = readFileSync(
    path.join(root, "scripts", "ci", "check-supply-chain-inputs.mjs"),
    "utf8",
  );
  const policyLockfiles = Array.from(
    policy.matchAll(/^\s+'([^']+package-lock\.json)',?$/gm),
    (match) => match[1],
  ).sort();
  assert.deepEqual(policyLockfiles, trackedLockfiles);
});

test("the private Windows package workflow uses the expected runtime setup", () => {
  const content = readFileSync(
    path.join(root, ".github", "workflows", "build-platforms.yml"),
    "utf8",
  );
  assert.match(content, /bun run setup:uv-runtime/);
  assert.match(content, /bun run setup:python-runtime/);
  assert.doesNotMatch(content, /setup:pandoc-runtime/);
  assert.match(content, /runs-on: windows-latest/);
});

test("Windows release workflow runs the clean-path bundled runtime gate", () => {
  const workflow = readFileSync(
    path.join(root, ".github", "workflows", "build-platforms.yml"),
    "utf8",
  );
  assert.match(workflow, /windows-runtime-smoke\.ps1/);
  const smoke = readFileSync(
    path.join(root, "scripts", "ci", "windows-runtime-smoke.ps1"),
    "utf8",
  );
  assert.match(smoke, /skill-python\\layers\\shared\\Scripts\\python\.exe/);
  assert.doesNotMatch(smoke, /skill-python\\(?:xlsx|pdf)\\Scripts\\python\.exe/);
  assert.match(smoke, /bundled XLSX dependency probe/);
  assert.match(smoke, /bundled PDF dependency probe/);
  assert.match(smoke, /markdown_to_docx\.mjs/);
  assert.match(smoke, /docx\\scripts\\markdown_to_docx\.mjs/);
  assert.match(smoke, /electron-builder\.json/);
  assert.match(smoke, /release\\win-unpacked/);
  assert.match(smoke, /packaged Electron Node runtime/);
  assert.doesNotMatch(smoke, /node_modules\\electron\\dist\\electron\.exe/);
  assert.match(smoke, /ELECTRON_RUN_AS_NODE/);
  assert.match(smoke, /Start-Process[\s\S]*-Wait[\s\S]*-PassThru/);
  assert.match(smoke, /DOCX Markdown conversion/);
  assert.match(smoke, /validate-docx-smoke\.mjs/);
  assert.match(smoke, /generated DOCX validation/);
  assert.doesNotMatch(smoke, /Invoke-Checked \$electron/);
  assert.match(smoke, /External command unexpectedly remains discoverable/);
  assert.match(smoke, /mingit\\usr\\bin\\bash\.exe/);
  assert.match(smoke, /PATH = "\$env:SystemRoot\\System32;\$env:SystemRoot"/);
  const packageScript = readFileSync(
    path.join(root, "scripts", "ci", "package-windows.ps1"),
    "utf8",
  );
  assert.match(packageScript, /windows-runtime-smoke\.ps1/);
});

test("protected Windows releases authenticate with Certum and require valid signatures", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.match(
    packageJson.scripts["dist:win:signed"],
    /electron-builder\.windows-signed\.cjs/,
  );
  assert.match(packageJson.scripts["dist:win:offline"], /electron-builder\.json/);

  const setupAction = readFileSync(
    path.join(
      root,
      ".github",
      "actions",
      "setup-certum-signing",
      "action.yml",
    ),
    "utf8",
  );
  assert.match(
    setupAction,
    /dismine\/windows-app-signing-setup-action@[0-9a-f]{40}/,
  );
  assert.match(setupAction, /SimplySignDesktop-9\.4\.3\.90-64-bit-en\.msi/);
  assert.match(setupAction, /SignerCertificate\.Subject[\s\S]*Asseco Data Systems/);
  assert.match(setupAction, /capture-diagnostics: false/);

  const signedConfigPath = path.join(
    root,
    "electron-builder.windows-signed.cjs",
  );
  const signedConfig = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        "const c=require(process.argv[1]); process.stdout.write(JSON.stringify(c.win.signtoolOptions));",
        signedConfigPath,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CERTUM_CERT_THUMBPRINT: "0123456789abcdef0123456789abcdef01234567",
        },
      },
    ),
  ) as {
    certificateSha1: string;
    signingHashAlgorithms: string[];
    rfc3161TimeStampServer: string;
  };
  assert.equal(
    signedConfig.certificateSha1,
    "0123456789ABCDEF0123456789ABCDEF01234567",
  );
  assert.deepEqual(signedConfig.signingHashAlgorithms, ["sha256"]);
  assert.equal(signedConfig.rfc3161TimeStampServer, "http://time.certum.pl");

  const signatureVerifier = readFileSync(
    path.join(root, "scripts", "ci", "verify-windows-authenticode.ps1"),
    "utf8",
  );
  assert.match(
    signatureVerifier,
    /electron-builder\.json'[\s\S]*-Raw -Encoding UTF8 \| ConvertFrom-Json/,
  );
});

test("installer-related pull requests build and exercise the Windows installer", () => {
  const workflow = readFileSync(
    path.join(root, ".github", "workflows", "windows-installer-pr.yml"),
    "utf8",
  );
  assert.match(workflow, /workflow_call:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /paths:/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /@\('run', 'dist:win:offline'\)/);
  assert.match(workflow, /windows-runtime-smoke\.ps1/);
  assert.match(workflow, /windows-installer-size-smoke\.ps1/);
  assert.match(workflow, /windows-installer-smoke\.ps1/);

  const smoke = readFileSync(
    path.join(root, "scripts", "ci", "windows-installer-smoke.ps1"),
    "utf8",
  );
  assert.match(smoke, /'cold installation'/);
  assert.match(smoke, /'cache-hit upgrade'/);
  assert.match(smoke, /phase=component-cache-miss/);
  assert.match(smoke, /phase=component-cache-hit/);
  assert.doesNotMatch(smoke, /phase=defender-exclusion/);
  assert.match(smoke, /'uninstall'/);

  const sizeSmoke = readFileSync(
    path.join(root, "scripts", "ci", "windows-installer-size-smoke.ps1"),
    "utf8",
  );
  assert.match(sizeSmoke, /\$_\.archiveSizeBytes/);
  assert.doesNotMatch(sizeSmoke, /\$_\.archiveBytes\b/);
  assert.match(sizeSmoke, /component archive bytes/);
  assert.match(sizeSmoke, /MaximumInstallerBytes = 315MB/);
  assert.match(sizeSmoke, /MaximumComponentBytes = 165MB/);
  assert.match(sizeSmoke, /MaximumNonComponentBytes = 150MB/);
});

test("DOCX smoke validator accepts the bundled Markdown converter output", () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "zhiyuan-docx-smoke-"));
  const markdown = path.join(workspace, "smoke.md");
  const docx = path.join(workspace, "smoke.docx");
  try {
    writeFileSync(
      markdown,
      "# Runtime smoke\n\nPackaged Electron conversion works.\n",
    );
    execFileSync(
      process.execPath,
      [
        path.join(root, "SKILLs", "docx", "scripts", "markdown_to_docx.mjs"),
        markdown,
        docx,
      ],
      { stdio: "pipe" },
    );
    execFileSync(
      process.execPath,
      [path.join(root, "scripts", "ci", "validate-docx-smoke.mjs"), docx],
      {
        stdio: "pipe",
      },
    );
    assert.equal(existsSync(docx), true);
    assert.ok(statSync(docx).size > 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
