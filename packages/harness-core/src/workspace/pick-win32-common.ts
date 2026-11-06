import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { compileWin32Winexe } from './win32-csc.js';

const execFileAsync = promisify(execFile);

export function tempPickPath(ext: string): string {
  return join(tmpdir(), `ciro-pick-${randomBytes(8).toString('hex')}${ext}`);
}

export function cleanupTemp(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // ignore
  }
}

/** IFileDialog COM 成员（嵌入 winexe / Add-Type 类体内） */
export function win32IFileDialogMembers(): string[] {
  return [
    '  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);',
    '  [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();',
    '  [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);',
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
    '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    '  private struct COMDLG_FILTERSPEC {',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pszName;',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pszSpec;',
    '  }',
    '',
    '  [ComImport]',
    '  [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]',
    '  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
    '  private interface IFileDialog {',
    '    [PreserveSig] int Show(IntPtr parent);',
    '    void SetFileTypes(uint cFileTypes, [MarshalAs(UnmanagedType.LPArray)] COMDLG_FILTERSPEC[] rgFilterSpec);',
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
    '  private const uint FOS_FORCEFILESYSTEM = 0x00000040;',
    '  private const uint FOS_PATHMUSTEXIST = 0x00000800;',
    '  private const uint SIGDN_FILESYSPATH = 0x80058000;',
  ];
}

/**
 * DeepSeek harness #259：Show(GetForegroundWindow) + AttachThreadInput，
 * 避免 Node 后台 spawn 的对话框沉到浏览器后。
 */
export function win32ShowWithForegroundOwnerCs(): string[] {
  return [
    '    IntPtr owner = GetForegroundWindow();',
    '    uint ownerPid;',
    '    uint ownerTid = owner != IntPtr.Zero',
    '      ? GetWindowThreadProcessId(owner, out ownerPid) : 0;',
    '    uint myTid = GetCurrentThreadId();',
    '    bool attached = false;',
    '    if (owner != IntPtr.Zero && ownerTid != 0 && ownerTid != myTid) {',
    '      attached = AttachThreadInput(myTid, ownerTid, true);',
    '    }',
    '    try {',
    '      int hr = dialog.Show(owner);',
    '      if (hr != 0) return null;',
    '    } finally {',
    '      if (attached) AttachThreadInput(myTid, ownerTid, false);',
    '    }',
  ];
}

export function win32GetResultPathCs(): string[] {
  return [
    '    IShellItem result;',
    '    dialog.GetResult(out result);',
    '    IntPtr psz;',
    '    result.GetDisplayName(SIGDN_FILESYSPATH, out psz);',
    '    string path = Marshal.PtrToStringUni(psz) ?? "";',
    '    Marshal.FreeCoTaskMem(psz);',
    '    return string.IsNullOrWhiteSpace(path) ? null : path;',
  ];
}

function buildWin32PickerProgram(
  className: string,
  pickMethodBody: string[],
): string {
  return [
    'using System;',
    'using System.IO;',
    'using System.Text;',
    'using System.Runtime.InteropServices;',
    '',
    `public static class ${className} {`,
    ...win32IFileDialogMembers(),
    '',
    ...pickMethodBody,
    '',
    '  [STAThread]',
    '  public static int Main(string[] args) {',
    '    string outPath = args.Length > 0 ? args[0] : "";',
    '    string title = args.Length > 1 ? args[1] : "Select";',
    '    string initial = args.Length > 2 ? args[2] : "";',
    '    try {',
    '      string picked = Pick(title, initial);',
    '      if (string.IsNullOrWhiteSpace(picked) || string.IsNullOrEmpty(outPath)) return 0;',
    '      File.WriteAllText(outPath, picked, new UTF8Encoding(false));',
    '      return 0;',
    '    } catch {',
    '      return 1;',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
}

function psSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** csc 不可用时的 PowerShell STA 回退（尽量 windowsHide） */
async function runWin32PickerViaPowerShell(
  className: string,
  pickMethodBody: string[],
  title: string,
  initial?: string,
): Promise<string | null> {
  const outFile = tempPickPath('.txt');
  const ps1 = tempPickPath('.ps1');
  const initialDir = initial && existsSync(initial) ? initial : '';
  const body = [
    `$out = ${psSingleQuote(outFile)}`,
    `$initial = ${psSingleQuote(initialDir)}`,
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    '',
    `public static class ${className} {`,
    ...win32IFileDialogMembers(),
    '',
    ...pickMethodBody,
    '}',
    '"@',
    '',
    `$picked = [${className}]::Pick(${psSingleQuote(title)}, $initial)`,
    'if ([string]::IsNullOrWhiteSpace($picked)) { exit 0 }',
    '[System.IO.File]::WriteAllText($out, $picked, [System.Text.UTF8Encoding]::new($false))',
    '',
  ].join('\n');
  writeFileSync(ps1, `\uFEFF${body}`, 'utf8');

  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const powershell = join(
    windir,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );

  try {
    await execFileAsync(
      powershell,
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-STA',
        '-WindowStyle',
        'Hidden',
        '-File',
        ps1,
      ],
      {
        encoding: 'utf-8',
        timeout: 300_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
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
    cleanupTemp(ps1);
    cleanupTemp(outFile);
  }
}

async function readPickOutFile(outFile: string): Promise<string | null> {
  if (!existsSync(outFile)) return null;
  const path = readFileSync(outFile, 'utf8').trim();
  return path || null;
}

/**
 * 优先 winexe（无控制台）；csc 不可用或编译失败时回退 PowerShell STA。
 */
export async function runWin32Picker(
  className: string,
  pickMethodBody: string[],
  cacheKey: string,
  title: string,
  initial?: string,
): Promise<string | null> {
  const csSource = buildWin32PickerProgram(className, pickMethodBody);
  const exe = await compileWin32Winexe(csSource, `ciro-${cacheKey}`);
  if (!exe) {
    return runWin32PickerViaPowerShell(className, pickMethodBody, title, initial);
  }

  const outFile = tempPickPath('.txt');
  const initialDir = initial && existsSync(initial) ? initial : '';
  try {
    await execFileAsync(exe, [outFile, title, initialDir], {
      encoding: 'utf-8',
      timeout: 300_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return readPickOutFile(outFile);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const hit = await readPickOutFile(outFile);
    if (hit) return hit;
    if (/canceled|cancelled|0x800704C7/i.test(msg)) return null;
    // winexe 运行失败时再试 PS（例如杀软拦截缓存 exe）
    return runWin32PickerViaPowerShell(className, pickMethodBody, title, initial);
  } finally {
    cleanupTemp(outFile);
  }
}
