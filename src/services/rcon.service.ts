import { Rcon } from 'rcon-client';

export interface RconConfig {
  host: string;
  port: number;
  password: string;
}

export interface RconResult {
  command: string;
  response: string;
  success: boolean;
  error?: string;
}

export async function executeRconCommands(
  rconConfig: RconConfig,
  commands: string[],
): Promise<RconResult[]> {
  const rcon = new Rcon({
    host: rconConfig.host,
    port: rconConfig.port,
    password: rconConfig.password,
  });

  const results: RconResult[] = [];

  try {
    await rcon.connect();

    for (const cmd of commands) {
      try {
        const response = await rcon.send(cmd);
        results.push({ command: cmd, response, success: true });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        results.push({ command: cmd, response: '', success: false, error });
      }
    }
  } finally {
    await rcon.end().catch(() => {/* ignore disconnect errors */});
  }

  return results;
}

export async function testRconConnection(rconConfig: RconConfig): Promise<{ success: boolean; message: string }> {
  const rcon = new Rcon({
    host: rconConfig.host,
    port: rconConfig.port,
    password: rconConfig.password,
  });

  try {
    await rcon.connect();
    await rcon.end().catch(() => {});
    return { success: true, message: 'Conexão RCON estabelecida com sucesso' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Falha na conexão RCON: ${message}` };
  }
}
