/**
 * node:sqlite (AuditLog) still emits ExperimentalWarning on current Node.
 * Drop only that noise. Must be the first import in cli.ts.
 */
function isSqliteExperimental(warning: unknown, ...rest: unknown[]): boolean {
  const parts: string[] = [
    warning instanceof Error ? `${warning.name} ${warning.message}` : String(warning ?? ''),
  ];
  for (const arg of rest) {
    if (typeof arg === 'string') parts.push(arg);
    else if (arg && typeof arg === 'object' && 'type' in arg) {
      parts.push(String((arg as { type: unknown }).type));
    }
  }
  const text = parts.join(' ');
  return /sqlite/i.test(text) && /experimental/i.test(text);
}

const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  if (isSqliteExperimental(warning, ...rest)) return;
  Reflect.apply(emitWarning, process, [warning, ...rest]);
}) as typeof process.emitWarning;

const emit = process.emit.bind(process);
process.emit = ((event: string | symbol, ...args: unknown[]) => {
  if (event === 'warning' && args[0] != null && isSqliteExperimental(args[0])) return false;
  return Reflect.apply(emit, process, [event, ...args]) as boolean;
}) as typeof process.emit;
