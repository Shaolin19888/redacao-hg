import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function backupDir(): string {
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  // Em desenvolvimento: raiz do projecto / infra/backups
  const root = path.resolve(process.cwd(), "..", "..");
  return path.join(root, "infra", "backups");
}

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token?.role === "admin";
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const dir = backupDir();

  if (!fs.existsSync(dir)) {
    return NextResponse.json({ backups: [], dir });
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.match(/^redacao_hg_.*\.sql\.gz$/))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return {
        name: f,
        size: stat.size,
        sizeHuman: formatBytes(stat.size),
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ backups: files, dir });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const scriptPath = path.resolve(process.cwd(), "..", "..", "scripts", "backup.sh");

  if (!fs.existsSync(scriptPath)) {
    return NextResponse.json({ error: "Script de backup não encontrado" }, { status: 500 });
  }

  try {
    const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`, {
      timeout: 60_000,
      env: { ...process.env },
    });

    return NextResponse.json({ ok: true, output: stdout + stderr });
  } catch (e: unknown) {
    const err = e as { message?: string; stdout?: string; stderr?: string };
    return NextResponse.json(
      { error: err.message ?? "Erro ao executar backup", output: (err.stdout ?? "") + (err.stderr ?? "") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name || !name.match(/^redacao_hg_.*\.sql\.gz$/)) {
    return NextResponse.json({ error: "Nome inválido" }, { status: 400 });
  }

  const filepath = path.join(backupDir(), name);
  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ error: "Ficheiro não encontrado" }, { status: 404 });
  }

  fs.unlinkSync(filepath);
  return NextResponse.json({ ok: true });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
