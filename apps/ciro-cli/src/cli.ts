#!/usr/bin/env node
import './suppress-sqlite-warning.js';
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  AuditLog,
  hasApiKey,
  initExampleWorkspace,
  INIT_EXAMPLE_IDS,
  loadEffectiveConfig,
  migrateProductDirs,
  PackStore,
  parsePackSpec,
  runDoctor,
  validateConfig,
  SkillRegistry,
} from '@ciro-code/harness-core';
import { HARNESS_VERSION, createMinimalModeProfiles } from '@ciro-code/harness-shared';
import { startHarnessServer } from '@ciro-code/harness-web';
import { openBrowser, printCiroBanner, printWebReady } from './banner.js';

const program = new Command();

program.name('ciro').description('Ciro Code Harness CLI').version(HARNESS_VERSION);

program
  .command('web')
  .description('Start local Harness web server')
  .option('-w, --workspace <path>', 'Workspace root (omit to restore last Recent)')
  .option('-p, --port <number>', 'Port', '3080')
  .option('--mode <mode>', 'Initial mode override: ask | agent | plan | debug')
  .option('--profile <id>', 'Profile overlay (e.g. developer)')
  .option('--no-open', 'Do not open browser (default: open workbench)')
  .option('--mock', 'Use mock agent runtime (no API key needed)')
  .action(
    async (opts: {
      workspace?: string;
      port: string;
      mode?: string;
      profile?: string;
      open: boolean;
      mock?: boolean;
    }) => {
      printCiroBanner(HARNESS_VERSION);

      if (!opts.mock && process.env.CIRO_AGENT_BACKEND !== 'mock' && !hasApiKey()) {
        console.warn(
          'Warning: No API key found. Set DEEPSEEK_API_KEY / OPENAI_API_KEY, configure 模型设置, or use --mock / CIRO_AGENT_BACKEND=mock.',
        );
      }

      const mode =
        opts.mode === 'agent' ||
        opts.mode === 'ask' ||
        opts.mode === 'plan' ||
        opts.mode === 'debug'
          ? opts.mode
          : undefined;
      const workspacePinned = Boolean(opts.workspace);
      const workspace = resolve(opts.workspace ?? process.cwd());
      const port = parseInt(opts.port, 10);
      const useMock = Boolean(opts.mock) || process.env.CIRO_AGENT_BACKEND === 'mock';

      try {
        const { config } = await startHarnessServer({
          workspace,
          port,
          mode,
          profile: opts.profile,
          agentBackend: useMock ? 'mock' : 'pi',
          workspacePinned,
          modeProfiles: createMinimalModeProfiles(),
        });

        const url = `http://${config.bind.host}:${config.bind.port}`;

        printWebReady({
          url,
          workspace: config.workspace,
          agentBackend: useMock ? 'mock' : 'pi',
          mode: config.mode,
          profile: opts.profile,
          willOpen: opts.open,
        });

        if (opts.open) openBrowser(url);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    },
  );

program
  .command('init')
  .description('Copy a starter example workspace into the target directory')
  .requiredOption(
    '--example <id>',
    `Example id: ${INIT_EXAMPLE_IDS.join(' | ')}`,
  )
  .option('-d, --dir <path>', 'Destination directory', process.cwd())
  .option('--force', 'Overwrite existing files', false)
  .action((opts: { example: string; dir: string; force?: boolean }) => {
    try {
      const result = initExampleWorkspace({
        exampleId: opts.example,
        destDir: resolve(opts.dir),
        force: Boolean(opts.force),
      });
      console.log(
        JSON.stringify(
          { ok: true, exampleId: result.exampleId, destDir: result.destDir, files: result.files },
          null,
          2,
        ),
      );
      console.log(`[ciro init] copied ${result.files.length} file(s). Try: ciro web --mock -w ${result.destDir}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

const configCmd = program.command('config').description('Configuration helpers');

configCmd
  .command('show')
  .description('Show effective config with source tree')
  .option('-w, --workspace <path>', 'Workspace root', process.cwd())
  .option('--mode <mode>', 'CLI mode override')
  .option('--profile <id>', 'Profile overlay')
  .action((opts: { workspace: string; mode?: string; profile?: string }) => {
    const mode = opts.mode === 'agent' || opts.mode === 'ask' ? opts.mode : undefined;
    try {
      const effective = loadEffectiveConfig({
        workspace: resolve(opts.workspace),
        mode,
        profile: opts.profile,
      });
      console.log(
        JSON.stringify(
          {
            config: effective.config,
            sources: effective.sources,
            paths: effective.paths,
            profileId: effective.profileId,
            warnings: effective.warnings,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

configCmd
  .command('effective')
  .description('Print effective config as JSON')
  .option('-w, --workspace <path>', 'Workspace root', process.cwd())
  .option('--mode <mode>', 'CLI mode override')
  .option('--profile <id>', 'Profile overlay')
  .action((opts: { workspace: string; mode?: string; profile?: string }) => {
    const mode = opts.mode === 'agent' || opts.mode === 'ask' ? opts.mode : undefined;
    try {
      const effective = loadEffectiveConfig({
        workspace: resolve(opts.workspace),
        mode,
        profile: opts.profile,
      });
      console.log(JSON.stringify(effective.config, null, 2));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

configCmd
  .command('validate')
  .description('Validate effective config')
  .option('-w, --workspace <path>', 'Workspace root', process.cwd())
  .action((opts: { workspace: string }) => {
    const effective = loadEffectiveConfig({ workspace: resolve(opts.workspace) });
    const result = validateConfig(effective);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  });

configCmd
  .command('wizard')
  .description('Print recommended starter config (non-interactive)')
  .option('-w, --workspace <path>', 'Workspace root', process.cwd())
  .action((opts: { workspace: string }) => {
    const workspace = resolve(opts.workspace);
    console.log(`# Recommended ${workspace}/.ciro/config.yaml`);
    console.log(`mode: ask`);
    console.log(`tools: [read, list_files, grep]`);
    console.log(`permissions:`);
    console.log(`  preset: workspace-readonly`);
    console.log(`# Switch to agent when ready to edit:`);
    console.log(`# mode: agent`);
    console.log(`# tools: [read, list_files, grep, write, edit, bash]`);
    console.log(`# permissions:`);
    console.log(`#   preset: workspace-write`);
  });

program
  .command('doctor')
  .description('Check .ciro / legacy .pi product directories')
  .option('-w, --workspace <path>', 'Workspace root', process.cwd())
  .action((opts: { workspace: string }) => {
    const report = runDoctor({ workspace: resolve(opts.workspace) });
    console.log(JSON.stringify(report, null, 2));
    if (report.findings.some((f) => f.level === 'warn')) process.exitCode = 0;
  });

program
  .command('migrate')
  .description('Copy legacy .pi / ~/.pi/agent data into .ciro / ~/.ciro (does not delete old files)')
  .option('-w, --workspace <path>', 'Workspace root (omit for home-only)')
  .action((opts: { workspace?: string }) => {
    const result = migrateProductDirs({
      workspace: opts.workspace ? resolve(opts.workspace) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) process.exitCode = 1;
    else {
      console.log('[ciro migrate] done. Restart daemon/web if it was running.');
    }
  });

const packCmd = program.command('pack').description('Official Feature Packs (@ciro-code/ext-*)');

packCmd
  .command('list')
  .description('List installed packs and enable state')
  .action(() => {
    const store = new PackStore();
    store.ensureLayout();
    console.log(JSON.stringify(store.list(), null, 2));
  });

packCmd
  .command('add')
  .description('Install an official pack from npm (or --from local dir); does not enable')
  .argument('<id>', 'Pack id, e.g. @ciro-code/ext-git or @ciro-code/ext-git@0.1.1')
  .option('--from <path>', 'Local package directory (must contain ciro.pack.json); skips npm')
  .action((rawId: string, opts: { from?: string }) => {
    try {
      const store = new PackStore();
      store.ensureLayout();
      const { id, version } = parsePackSpec(rawId);
      const item = opts.from
        ? store.addFromDirectory(id, resolve(opts.from))
        : store.addFromNpm(id, version);
      console.log(JSON.stringify(item, null, 2));
      console.log('[ciro pack] installed (not enabled). Enable in Settings → Feature packs.');
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

packCmd
  .command('remove')
  .description('Uninstall a pack')
  .argument('<id>', 'Pack id, e.g. @ciro-code/ext-smoke')
  .action((id: string) => {
    try {
      const store = new PackStore();
      store.remove(id);
      console.log(JSON.stringify({ ok: true, removed: id }, null, 2));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command('debug')
  .description('Environment, config, LLM/Pi smoke, recent audit')
  .option('-w, --workspace <path>', 'Workspace root', process.cwd())
  .action((opts: { workspace: string }) => {
    const workspace = resolve(opts.workspace);
    const effective = loadEffectiveConfig({ workspace });
    const validation = validateConfig(effective);
    let piVersion = 'unknown';
    try {
      const pkg = execSync(
        'node -e "console.log(require(\'@earendil-works/pi-coding-agent/package.json\').version)"',
        { cwd: workspace, encoding: 'utf-8' },
      ).trim();
      piVersion = pkg || 'unknown';
    } catch {
      piVersion = 'not resolvable (use monorepo install)';
    }

    let audit: unknown[] = [];
    try {
      audit = new AuditLog().list({ limit: 5 });
    } catch {
      audit = [];
    }

    const skills = new SkillRegistry({ workspace }).list();

    const report = {
      versions: {
        node: process.version,
        ciro: HARNESS_VERSION,
        pi: piVersion,
        lockedPi: '=0.84.4',
      },
      apiKeyPresent: hasApiKey(),
      effective: {
        config: effective.config,
        sources: effective.sources,
        paths: effective.paths,
      },
      validation,
      skills: skills.map((s) => ({ name: s.name, source: s.source, triggers: s.triggers })),
      recentAudit: audit,
    };
    console.log(JSON.stringify(report, null, 2));
  });

program.parse();
