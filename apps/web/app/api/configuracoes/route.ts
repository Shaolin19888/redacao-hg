import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  verifyWordPress, verifyTelegramBot, verifyTelegramChat, verifyFacebook,
  verifyOpenAi, verifyAnthropic, verifyOneSignal, verifyPushAlert, type VerifyResult,
} from "@/lib/config/verify";

/**
 * Configurações do painel. Os valores guardados vivem na base de dados e sobrepõem-se às
 * variáveis de ambiente (que continuam a servir de base, mas não são expostas ao editor).
 *
 * Sempre que se guarda uma credencial, ela é TESTADA contra o serviço: a resposta diz se
 * ficou boa ou porque falhou. Valores sensíveis nunca são devolvidos ao ecrã.
 */

interface SettingDef {
  key: string;
  label: string;
  group: string;
  sensitive: boolean;
  placeholder: string;
  verify?: "wordpress" | "telegram_bot" | "telegram_chat" | "facebook" | "openai" | "anthropic" | "onesignal" | "pushalert";
  hint?: string;
  /** Valor em vigor quando nada foi guardado nem definido no ambiente. Mostrado no painel
   *  para não parecer "vazio" o que na verdade está activo por omissão. */
  defaultValue?: string;
}

const SETTINGS_SCHEMA: SettingDef[] = [
  // WordPress
  { key: "wordpress_url", label: "Endereço do site", group: "wordpress", sensitive: false, placeholder: "https://hugogil.pt", verify: "wordpress" },
  { key: "wordpress_user", label: "Utilizador", group: "wordpress", sensitive: false, placeholder: "redacao-hg", verify: "wordpress" },
  { key: "wordpress_app_password", label: "Palavra-passe de aplicação", group: "wordpress", sensitive: true, placeholder: "xxxx xxxx xxxx xxxx", verify: "wordpress", hint: "Criada no perfil do utilizador do WordPress, em Palavras-passe de aplicação." },

  // Telegram
  { key: "telegram_bot_token", label: "Token do bot", group: "telegram", sensitive: true, placeholder: "123456:ABC-DEF...", verify: "telegram_bot", hint: "Dado pelo @BotFather." },
  { key: "telegram_chat_id", label: "Chat das aprovações", group: "telegram", sensitive: false, placeholder: "-1001234567890", verify: "telegram_chat" },
  { key: "telegram_report_chat_id", label: "Chat do relatório semanal", group: "telegram", sensitive: false, placeholder: "vazio = mesmo chat", verify: "telegram_chat" },

  // Redes sociais
  { key: "facebook_page_id", label: "ID da página de Facebook", group: "social", sensitive: false, placeholder: "1815217615178794", verify: "facebook" },
  { key: "facebook_access_token", label: "Token de acesso do Facebook", group: "social", sensitive: true, placeholder: "EAAG...", verify: "facebook", hint: "Token de página, de longa duração." },
  { key: "instagram_account_id", label: "ID da conta Instagram", group: "social", sensitive: false, placeholder: "opcional" },
  { key: "instagram_access_token", label: "Token do Instagram", group: "social", sensitive: true, placeholder: "opcional" },

  // Modelos de IA
  { key: "anthropic_api_key", label: "Chave da Anthropic", group: "ai", sensitive: true, placeholder: "sk-ant-...", verify: "anthropic" },
  { key: "anthropic_model", label: "Modelo de escrita", group: "ai", sensitive: false, placeholder: "claude-sonnet-5", defaultValue: "claude-sonnet-5", hint: "Usado na escrita e na revisão. Mais capaz = mais caro." },
  { key: "anthropic_model_fast", label: "Modelo de triagem", group: "ai", sensitive: false, placeholder: "claude-haiku-4-5", defaultValue: "claude-haiku-4-5", hint: "Usado para decidir se uma notícia interessa. É o que corre mais vezes." },
  { key: "openai_api_key", label: "Chave da OpenAI", group: "ai", sensitive: true, placeholder: "sk-...", verify: "openai" },
  { key: "openai_model", label: "Modelo OpenAI", group: "ai", sensitive: false, placeholder: "gpt-4o" },

  // Push
  { key: "onesignal_app_id", label: "OneSignal App ID", group: "push", sensitive: false, placeholder: "", verify: "onesignal" },
  { key: "onesignal_api_key", label: "OneSignal API Key", group: "push", sensitive: true, placeholder: "", verify: "onesignal" },
  { key: "pushalert_api_key", label: "PushAlert API Key", group: "push", sensitive: true, placeholder: "", verify: "pushalert" },

  // Recolha e automatismos (os defaults abaixo são os que o código assume quando nada
  // está guardado — mostrá-los evita que uma opção activa pareça "vazia" no painel).
  { key: "cron_fetch_enabled", label: "Radar automático activo", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "false" },
  { key: "cron_fetch_interval", label: "Intervalo do radar (minutos)", group: "radar", sensitive: false, placeholder: "15", defaultValue: "15" },
  { key: "pipeline_collect_enabled", label: "Recolha do pipeline activa", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "false" },
  { key: "pipeline_topic_gate", label: "Pedir aprovação antes de escrever", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "true", hint: "Ligado: todas as notícias esperam pela tua decisão antes de gastar créditos." },
  { key: "pipeline_transcricao_enabled", label: "Transcrever conferências de imprensa", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "true", hint: "Só do site oficial do Benfica, e só depois de aprovares o tema. Cerca de 0,17 € por conferência de 30 minutos." },
  { key: "pipeline_skip_video_pages", label: "Ignorar páginas de vídeo e directos", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "true", hint: "Páginas de vídeo, directo e galeria não têm texto para extrair factos. Eram 9,5% da recolha e nunca deram um artigo publicado." },
  { key: "pipeline_images_enabled", label: "Procurar imagem automaticamente", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "false" },
  { key: "pipeline_social_gate", label: "Pedir aprovação para publicar nas redes", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "true" },
  { key: "pipeline_push_gate", label: "Pedir aprovação para enviar push", group: "radar", sensitive: false, placeholder: "true ou false", defaultValue: "true" },
];

/** Variável de ambiente correspondente a cada definição (base, quando não há valor guardado). */
const ENV_KEYS: Record<string, string> = {
  wordpress_url: "WORDPRESS_URL",
  wordpress_user: "WORDPRESS_USER",
  wordpress_app_password: "WORDPRESS_APP_PASSWORD",
  telegram_bot_token: "TELEGRAM_BOT_TOKEN",
  telegram_chat_id: "TELEGRAM_CHAT_ID",
  telegram_report_chat_id: "TELEGRAM_REPORT_CHAT_ID",
  facebook_page_id: "FACEBOOK_PAGE_ID",
  facebook_access_token: "FACEBOOK_ACCESS_TOKEN",
  instagram_account_id: "INSTAGRAM_ACCOUNT_ID",
  instagram_access_token: "INSTAGRAM_ACCESS_TOKEN",
  anthropic_api_key: "ANTHROPIC_API_KEY",
  anthropic_model: "ANTHROPIC_MODEL_TEXT",
  anthropic_model_fast: "ANTHROPIC_MODEL_FAST",
  openai_api_key: "OPENAI_API_KEY",
  openai_model: "OPENAI_MODEL_TEXT",
  onesignal_app_id: "ONESIGNAL_APP_ID",
  onesignal_api_key: "ONESIGNAL_API_KEY",
  pushalert_api_key: "PUSHALERT_API_KEY",
};

function valorEfectivo(key: string, savedMap: Record<string, string>): string {
  if (key in savedMap) return savedMap[key];
  const env = ENV_KEYS[key];
  const doAmbiente = env ? process.env[env] ?? "" : "";
  if (doAmbiente) return doAmbiente;
  return SETTINGS_SCHEMA.find((s) => s.key === key)?.defaultValue ?? "";
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const saved = await prisma.setting.findMany();
  const savedMap = Object.fromEntries(saved.map((s) => [s.key, s.value]));

  const settings = SETTINGS_SCHEMA.map((s) => {
    const efectivo = valorEfectivo(s.key, savedMap);
    return {
      key: s.key,
      label: s.label,
      group: s.group,
      sensitive: s.sensitive,
      placeholder: s.placeholder,
      hint: s.hint ?? null,
      verifiable: Boolean(s.verify),
      // Sensíveis nunca voltam ao ecrã: diz-se apenas se estão preenchidos.
      value: s.sensitive ? "" : efectivo,
      configured: Boolean(efectivo),
    };
  });

  return NextResponse.json({ settings });
}

/** Corre o verificador do campo, usando os valores efectivos dos campos irmãos. */
async function verificar(def: SettingDef, savedMap: Record<string, string>): Promise<VerifyResult | null> {
  if (!def.verify) return null;
  const v = (k: string) => valorEfectivo(k, savedMap);
  switch (def.verify) {
    case "wordpress":
      return verifyWordPress(v("wordpress_url"), v("wordpress_user"), v("wordpress_app_password"));
    case "telegram_bot":
      return verifyTelegramBot(v("telegram_bot_token"));
    case "telegram_chat": {
      const chat = v(def.key);
      if (!chat) return { ok: true, message: "Vazio: usa o chat das aprovações." };
      return verifyTelegramChat(v("telegram_bot_token"), chat);
    }
    case "facebook":
      return verifyFacebook(v("facebook_page_id"), v("facebook_access_token"));
    case "openai":
      return verifyOpenAi(v("openai_api_key"));
    case "anthropic":
      return verifyAnthropic(v("anthropic_api_key"));
    case "onesignal":
      return verifyOneSignal(v("onesignal_app_id"), v("onesignal_api_key"));
    case "pushalert":
      return verifyPushAlert(v("pushalert_api_key"));
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { key, value } = await req.json();
  const def = SETTINGS_SCHEMA.find((s) => s.key === key);
  if (!def) return NextResponse.json({ error: "Definição desconhecida" }, { status: 400 });

  const limpo = typeof value === "string" ? value.trim() : "";

  if (!limpo) {
    await prisma.setting.deleteMany({ where: { key } });
    return NextResponse.json({ ok: true, cleared: true, verified: null, message: "Valor removido." });
  }

  await prisma.setting.upsert({
    where: { key },
    update: { value: limpo, sensitive: def.sensitive },
    create: { key, value: limpo, sensitive: def.sensitive },
  });

  // Testar de verdade contra o serviço, para se saber logo se ficou bom.
  const saved = await prisma.setting.findMany();
  const savedMap = Object.fromEntries(saved.map((s) => [s.key, s.value]));
  const resultado = await verificar(def, savedMap).catch(
    (e): VerifyResult => ({ ok: false, message: `Não foi possível verificar: ${e instanceof Error ? e.message : "erro"}.` }),
  );

  await prisma.log.create({
    data: {
      action: "config_update",
      details: `${def.label}: guardado${resultado ? ` — ${resultado.ok ? "verificado" : "FALHOU"}: ${resultado.message}` : ""}`,
      userId: session.user?.id,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    verified: resultado?.ok ?? null,
    message: resultado?.message ?? "Guardado.",
  });
}
