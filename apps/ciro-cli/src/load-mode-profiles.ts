import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ModeProfileProvider } from '@ciro-code/harness-shared';

/**
 * 产品四模式 Profile：优先 npm 包内 vendor（发版嵌入），否则工作区包（开发）。
 */
export async function loadModeProfiles(): Promise<ModeProfileProvider> {
  const vendorEntry = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'vendor',
    'profile-modes',
    'dist',
    'src',
    'index.js',
  );
  if (existsSync(vendorEntry)) {
    const mod = (await import(pathToFileURL(vendorEntry).href)) as {
      createModeProfileProvider: () => ModeProfileProvider;
    };
    return mod.createModeProfileProvider();
  }

  const { createModeProfileProvider } = await import('@ciro-code/profile-modes');
  return createModeProfileProvider();
}
