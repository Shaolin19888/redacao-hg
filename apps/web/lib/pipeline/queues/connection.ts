import type { ConnectionOptions } from "bullmq";

/**
 * Opções de ligação Redis para a BullMQ. Passamos opções (não uma instância) para que
 * a BullMQ crie e faça a gestão das suas próprias conexões — recomendado para os workers
 * bloqueantes. Deriva de REDIS_URL.
 */
export function getRedisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 6379,
    password: url.password || undefined,
    username: url.username || undefined,
    db: url.pathname && url.pathname.length > 1 ? parseInt(url.pathname.slice(1), 10) : undefined,
    maxRetriesPerRequest: null,
  };
}
