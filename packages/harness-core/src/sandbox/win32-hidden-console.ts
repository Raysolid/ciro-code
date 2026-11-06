/**
 * Windows：为 daemon / 子 shell 提供「隐藏控制台」宿主。
 *
 * Node 的 windowsHide 会同时设 CREATE_NO_WINDOW。父进程没有控制台时，
 * 孙进程（npm.cmd → cmd.exe 等）会 AllocConsole，桌面上闪黑框。
 * DeepSeek Desktop 2.2 / 同类产品做法：宿主先 AllocConsole + SW_HIDE，
 * 子进程继承该隐藏控制台，不再对 shell 使用 CREATE_NO_WINDOW。
 */
import { compileWin32Winexe } from '../workspace/win32-csc.js';

export const CIRO_HIDDEN_CONSOLE_ENV = 'CIRO_HIDDEN_CONSOLE';

const LAUNCHER_CS = `
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class CiroHiddenConsoleHost {
  [DllImport("kernel32.dll")] private static extern bool AllocConsole();
  [DllImport("kernel32.dll")] private static extern bool FreeConsole();
  [DllImport("kernel32.dll")] private static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  private const int SW_HIDE = 0;

  private static string QuoteArg(string arg) {
    if (arg.Length == 0) return "\\"\\"";
    bool needQuotes = false;
    foreach (char c in arg) {
      if (c == ' ' || c == '\\t' || c == '"') { needQuotes = true; break; }
    }
    if (!needQuotes) return arg;
    var sb = new StringBuilder();
    sb.Append('"');
    int bs = 0;
    foreach (char c in arg) {
      if (c == '\\\\') { bs++; continue; }
      if (c == '"') {
        sb.Append('\\\\', bs * 2 + 1);
        sb.Append('"');
        bs = 0;
        continue;
      }
      if (bs > 0) { sb.Append('\\\\', bs); bs = 0; }
      sb.Append(c);
    }
    if (bs > 0) sb.Append('\\\\', bs * 2);
    sb.Append('"');
    return sb.ToString();
  }

  public static int Main(string[] args) {
    if (args.Length < 1) return 2;
    AllocConsole();
    ShowWindow(GetConsoleWindow(), SW_HIDE);

    var psi = new ProcessStartInfo();
    psi.FileName = args[0];
    if (args.Length > 1) {
      var parts = new List<string>();
      for (int i = 1; i < args.Length; i++) parts.Add(QuoteArg(args[i]));
      psi.Arguments = string.Join(" ", parts.ToArray());
    }
    psi.UseShellExecute = false;
    psi.CreateNoWindow = false;
    psi.EnvironmentVariables["CIRO_HIDDEN_CONSOLE"] = "1";

    try {
      Process p = Process.Start(psi);
      if (p == null) return 3;
      // 宿主脱离控制台后继续等待子进程：dev-web/ensure-daemon 监控的是本进程，
      // 若立即 exit 0 会被误判为「API 已退出」。
      FreeConsole();
      p.WaitForExit();
      return p.ExitCode;
    } catch {
      return 4;
    }
  }
}
`;

let launcherPromise: Promise<string | null> | null = null;

/** 编译并缓存 winexe 启动器；失败返回 null（调用方回退 windowsHide） */
export async function ensureWin32HiddenConsoleLauncher(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  if (!launcherPromise) {
    launcherPromise = compileWin32Winexe(LAUNCHER_CS, 'ciro-hidden-console');
  }
  return launcherPromise;
}

export function hasInheritedHiddenConsole(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[CIRO_HIDDEN_CONSOLE_ENV] === '1';
}

/**
 * 将 node/命令包进隐藏控制台宿主。
 * 已在宿主内则原样返回（避免套娃）。
 */
export async function wrapSpawnWithHiddenConsole(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ command: string; args: string[]; env: NodeJS.ProcessEnv; wrapped: boolean }> {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (process.platform !== 'win32' || hasInheritedHiddenConsole(merged)) {
    return { command, args, env: merged, wrapped: false };
  }
  const launcher = await ensureWin32HiddenConsoleLauncher();
  if (!launcher) {
    return { command, args, env: merged, wrapped: false };
  }
  return {
    command: launcher,
    args: [command, ...args],
    env: { ...merged, [CIRO_HIDDEN_CONSOLE_ENV]: '1' },
    wrapped: true,
  };
}

/** bash 子进程：已有隐藏控制台时禁用 CREATE_NO_WINDOW，让孙进程继承 */
export function windowsHideForSandboxedChild(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (process.platform !== 'win32') return false;
  return !hasInheritedHiddenConsole(env);
}
