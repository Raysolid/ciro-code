import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { SandboxError } from './path-sandbox.js';

export interface SandboxedExecOptions {
  cwd: string;
  command: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface SandboxedExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 100_000;

/** 限制传给子进程的环境变量（尽力限制出站相关配置） */
export function buildRestrictedEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    windir: process.env.windir,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    LANG: process.env.LANG,
    ComSpec: process.env.ComSpec,
  };
  // 去掉常见代理 / 云凭证，降低意外出站
  const blocked = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
  ];
  for (const key of blocked) {
    delete base[key];
  }
  return { ...base, ...extra };
}

function truncate(s: string): { text: string; truncated: boolean } {
  if (s.length <= MAX_OUTPUT_CHARS) return { text: s, truncated: false };
  return { text: s.slice(0, MAX_OUTPUT_CHARS) + '\n…[truncated]', truncated: true };
}

/**
 * 整段解码子进程输出。Windows cmd 常用系统 ANSI/GBK；按 chunk 用 UTF-8
 * 解码会在多字节字符边界产生 U+FFFD，并在中文 stderr 上表现为乱码。
 */
export function decodeShellBuffer(buf: Buffer): string {
  if (buf.length === 0) return '';
  const utf8 = buf.toString('utf8');
  if (process.platform !== 'win32' || !utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gbk').decode(buf);
  } catch {
    return utf8;
  }
}

function pushChunk(chunks: Buffer[], chunk: Buffer | string): void {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}

/**
 * 在 workspace cwd 下执行命令；timeout 默认 30s。
 * 网络隔离在 Windows 上为尽力而为（剥离代理 env），非强制沙箱。
 */
export function runSandboxed(options: SandboxedExecOptions): Promise<SandboxedExecResult> {
  const cwd = resolve(options.cwd);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const env = buildRestrictedEnv(options.env);

  if (!options.command.trim()) {
    return Promise.reject(new SandboxError('Empty command'));
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(options.command, {
      cwd,
      env,
      shell: true,
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref?.();
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      pushChunk(stdoutChunks, chunk);
      const approx = stdoutChunks.reduce((n, b) => n + b.length, 0);
      if (approx > MAX_OUTPUT_CHARS * 2) {
        child.kill('SIGTERM');
      }
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      pushChunk(stderrChunks, chunk);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = truncate(decodeShellBuffer(Buffer.concat(stdoutChunks)));
      const err = truncate(decodeShellBuffer(Buffer.concat(stderrChunks)));
      resolvePromise({
        stdout: out.text,
        stderr: err.text,
        exitCode: timedOut ? null : code,
        timedOut,
        truncated: out.truncated || err.truncated,
      });
    });
  });
}
