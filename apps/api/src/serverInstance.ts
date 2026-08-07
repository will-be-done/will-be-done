export function resolveServerInstanceId(
  env: Readonly<Record<string, string | undefined>> = process.env,
  createRandomId: () => string = () => crypto.randomUUID(),
): string {
  const configuredInstanceId = env.WBD_INSTANCE_ID?.trim();
  if (configuredInstanceId) return configuredInstanceId;

  const flyMachineId = env.FLY_MACHINE_ID?.trim();
  if (flyMachineId) return flyMachineId;

  return `local-${createRandomId()}`;
}

let serverInstanceId: string | undefined;

export function getServerInstanceId(): string {
  serverInstanceId ??= resolveServerInstanceId();
  return serverInstanceId;
}

export function createServerClientId(
  dbName: string,
  instanceId: string = getServerInstanceId(),
): string {
  return `server-${instanceId}-${dbName}`;
}
