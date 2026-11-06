import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  runWin32Picker,
  win32GetResultPathCs,
  win32ShowWithForegroundOwnerCs,
} from './pick-win32-common.js';

const execFileAsync = promisify(execFile);

const FOLDER_PICK_BODY = [
  '  private const uint FOS_PICKFOLDERS = 0x00000020;',
  '',
  '  public static string Pick(string title, string initialDirectory) {',
  '    var dialog = (IFileDialog)new FileOpenDialog();',
  '    dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);',
  '    if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);',
  '    if (!string.IsNullOrEmpty(initialDirectory)) {',
  '      try {',
  '        var iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");',
  '        IShellItem item;',
  '        SHCreateItemFromParsingName(initialDirectory, IntPtr.Zero, ref iid, out item);',
  '        dialog.SetFolder(item);',
  '      } catch { }',
  '    }',
  ...win32ShowWithForegroundOwnerCs(),
  ...win32GetResultPathCs(),
  '  }',
];

async function pickWindows(initial?: string): Promise<string | null> {
  return runWin32Picker(
    'CiroFolderPicker',
    FOLDER_PICK_BODY,
    'folder',
    'Select workspace folder',
    initial,
  );
}

async function pickDarwin(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "Select workspace folder")'],
      { encoding: 'utf-8', timeout: 300_000 },
    );
    const path = stdout.trim().replace(/\/$/, '');
    return path || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/User canceled|(-128)/i.test(msg)) return null;
    throw err;
  }
}

async function pickLinux(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'zenity',
      ['--file-selection', '--directory', '--title=Select workspace folder'],
      { encoding: 'utf-8', timeout: 300_000 },
    );
    return stdout.trim() || null;
  } catch (err) {
    const code = (err as { code?: number | string }).code;
    if (code === 1) return null;
    throw err;
  }
}

/** 弹出本机文件夹选择对话框（本地 Harness）；取消返回 null */
export async function pickDirectoryDialog(initial?: string): Promise<string | null> {
  if (process.platform === 'win32') {
    return pickWindows(initial);
  }
  if (process.platform === 'darwin') {
    return pickDarwin();
  }
  return pickLinux();
}
