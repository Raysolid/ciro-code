import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function tempPath(ext: string): string {
  return join(tmpdir(), `ciro-pick-${randomBytes(8).toString('hex')}${ext}`);
}

function cleanup(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // ignore
  }
}

/** PowerShell 脚本：IFileOpenDialog 选文件夹，路径经 CIRO_PICK_OUT 回写 */
function windowsPickerScript(): string {
  // 纯拼接，避免 JS 模板字符串吞掉 PowerShell `$`
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    '',
    'public static class CiroFolderPicker {',
    '  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]',
    '  private static extern void SHCreateItemFromParsingName(',
    '    [MarshalAs(UnmanagedType.LPWStr)] string pszPath,',
    '    IntPtr pbc,',
    '    ref Guid riid,',
    '    [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);',
    '',
    '  [ComImport]',
    '  [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]',
    '  private class FileOpenDialog { }',
    '',
    '  [ComImport]',
    '  [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]',
    '  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
    '  private interface IFileDialog {',
    '    [PreserveSig] int Show(IntPtr parent);',
    '    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);',
    '    void SetFileTypeIndex(uint iFileType);',
    '    void GetFileTypeIndex(out uint piFileType);',
    '    void Advise(IntPtr pfde, out uint pdwCookie);',
    '    void Unadvise(uint dwCookie);',
    '    void SetOptions(uint fos);',
    '    void GetOptions(out uint pfos);',
    '    void SetDefaultFolder(IShellItem psi);',
    '    void SetFolder(IShellItem psi);',
    '    void GetFolder(out IShellItem ppsi);',
    '    void GetCurrentSelection(out IShellItem ppsi);',
    '    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);',
    '    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);',
    '    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);',
    '    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);',
    '    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);',
    '    void GetResult(out IShellItem ppsi);',
    '    void AddPlace(IShellItem psi, int fdap);',
    '    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);',
    '    void Close(int hr);',
    '    void SetClientGuid(ref Guid guid);',
    '    void ClearClientData();',
    '    void SetFilter(IntPtr pFilter);',
    '  }',
    '',
    '  [ComImport]',
    '  [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]',
    '  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
    '  private interface IShellItem {',
    '    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);',
    '    void GetParent(out IShellItem ppsi);',
    '    void GetDisplayName(uint sigdnName, out IntPtr ppszName);',
    '    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);',
    '    void Compare(IShellItem psi, uint hint, out int piOrder);',
    '  }',
    '',
    '  private const uint FOS_PICKFOLDERS = 0x00000020;',
    '  private const uint FOS_FORCEFILESYSTEM = 0x00000040;',
    '  private const uint FOS_PATHMUSTEXIST = 0x00000800;',
    '  private const uint SIGDN_FILESYSPATH = 0x80058000;',
    '',
    '  public static string Pick(string title, string initialDirectory) {',
    '    var dialog = (IFileDialog)new FileOpenDialog();',
    '    dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);',
    '    if (!string.IsNullOrEmpty(title)) {',
    '      dialog.SetTitle(title);',
    '    }',
    // PowerShell Add-Type 使用 C# 5：禁止 out Type x 内联声明
    '    if (!string.IsNullOrEmpty(initialDirectory)) {',
    '      try {',
    '        var iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");',
    '        IShellItem item;',
    '        SHCreateItemFromParsingName(initialDirectory, IntPtr.Zero, ref iid, out item);',
    '        dialog.SetFolder(item);',
    '      } catch {',
    '      }',
    '    }',
    '    int hr = dialog.Show(IntPtr.Zero);',
    '    if (hr != 0) return null;',
    '    IShellItem result;',
    '    dialog.GetResult(out result);',
    '    IntPtr psz;',
    '    result.GetDisplayName(SIGDN_FILESYSPATH, out psz);',
    '    string path = Marshal.PtrToStringUni(psz) ?? "";',
    '    Marshal.FreeCoTaskMem(psz);',
    '    return string.IsNullOrWhiteSpace(path) ? null : path;',
    '  }',
    '}',
    '"@',
    '',
    '$out = $env:CIRO_PICK_OUT',
    '$initial = $env:CIRO_PICK_INITIAL',
    "$picked = [CiroFolderPicker]::Pick('Select workspace folder', $initial)",
    'if ([string]::IsNullOrWhiteSpace($picked)) { exit 0 }',
    '[System.IO.File]::WriteAllText($out, $picked, [System.Text.UTF8Encoding]::new($false))',
    '',
  ].join('\n');
}

/**
 * Windows：IFileOpenDialog + FOS_PICKFOLDERS（现代「选择文件夹」UI，对齐 VS Code / DeepSeek native）。
 * 结果写入 UTF-8 临时文件，避免控制台代码页损坏中文路径。
 */
async function pickWindows(initial?: string): Promise<string | null> {
  const outFile = tempPath('.txt');
  const ps1 = tempPath('.ps1');
  writeFileSync(ps1, `\uFEFF${windowsPickerScript()}`, 'utf8');

  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', ps1],
      {
        encoding: 'utf-8',
        timeout: 300_000,
        // 必须可见：windowsHide 会把 IFileOpenDialog 藏掉
        windowsHide: false,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          CIRO_PICK_OUT: outFile,
          CIRO_PICK_INITIAL: initial && existsSync(initial) ? initial : '',
        },
      },
    );

    if (!existsSync(outFile)) return null;
    const path = readFileSync(outFile, 'utf8').trim();
    return path || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!existsSync(outFile)) {
      if (/canceled|cancelled|0x800704C7/i.test(msg)) return null;
      throw err;
    }
    const path = readFileSync(outFile, 'utf8').trim();
    return path || null;
  } finally {
    cleanup(ps1);
    cleanup(outFile);
  }
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
    // zenity cancel → exit 1
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
