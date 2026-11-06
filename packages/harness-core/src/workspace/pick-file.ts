import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  runWin32Picker,
  win32GetResultPathCs,
  win32ShowWithForegroundOwnerCs,
} from './pick-win32-common.js';

const execFileAsync = promisify(execFile);

const FILE_PICK_BODY = [
  '  private const uint FOS_FILEMUSTEXIST = 0x00001000;',
  '',
  '  public static string Pick(string title, string initialPath) {',
  '    var dialog = (IFileDialog)new FileOpenDialog();',
  '    dialog.SetOptions(FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_FILEMUSTEXIST);',
  '    dialog.SetFileTypes(2, new[] {',
  '      new COMDLG_FILTERSPEC { pszName = "Shell executables", pszSpec = "bash.exe;sh.exe;pwsh.exe;powershell.exe;*.exe" },',
  '      new COMDLG_FILTERSPEC { pszName = "All files", pszSpec = "*.*" }',
  '    });',
  '    dialog.SetFileTypeIndex(1);',
  '    if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);',
  '    if (!string.IsNullOrEmpty(initialPath)) {',
  '      try {',
  '        string folder = System.IO.Directory.Exists(initialPath)',
  '          ? initialPath',
  '          : System.IO.Path.GetDirectoryName(initialPath);',
  '        string name = System.IO.Directory.Exists(initialPath)',
  '          ? null',
  '          : System.IO.Path.GetFileName(initialPath);',
  '        if (!string.IsNullOrEmpty(folder)) {',
  '          var iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");',
  '          IShellItem item;',
  '          SHCreateItemFromParsingName(folder, IntPtr.Zero, ref iid, out item);',
  '          dialog.SetFolder(item);',
  '        }',
  '        if (!string.IsNullOrEmpty(name)) dialog.SetFileName(name);',
  '      } catch { }',
  '    }',
  ...win32ShowWithForegroundOwnerCs(),
  ...win32GetResultPathCs(),
  '  }',
];

async function pickWindows(initial?: string): Promise<string | null> {
  return runWin32Picker(
    'CiroFilePicker',
    FILE_PICK_BODY,
    'file',
    'Select shell executable',
    initial,
  );
}

async function pickDarwin(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-e', 'POSIX path of (choose file with prompt "Select shell executable")'],
      { encoding: 'utf-8', timeout: 300_000 },
    );
    return stdout.trim().replace(/\/$/, '') || null;
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
      ['--file-selection', '--title=Select shell executable'],
      { encoding: 'utf-8', timeout: 300_000 },
    );
    return stdout.trim() || null;
  } catch (err) {
    const code = (err as { code?: number | string }).code;
    if (code === 1) return null;
    throw err;
  }
}

/** 弹出本机文件选择对话框（选 shell 可执行文件）；取消返回 null */
export async function pickFileDialog(initial?: string): Promise<string | null> {
  if (process.platform === 'win32') {
    return pickWindows(initial);
  }
  if (process.platform === 'darwin') {
    return pickDarwin();
  }
  return pickLinux();
}
