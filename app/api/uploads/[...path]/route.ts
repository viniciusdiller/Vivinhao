import { stat, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Serve os arquivos de public/uploads lendo direto do disco a cada request,
// em vez de depender do arquivo estático servido pelo Next/proxy — aquele
// caminho só reconhece arquivos novos depois de um restart do processo
// (o próprio Next/proxy mantém uma lista de arquivos públicos construída no
// boot). Como os nomes de arquivo são únicos (timestamp + UUID), é seguro
// cachear a resposta por bastante tempo — o conteúdo de uma URL nunca muda.
const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  if (!Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  // Bloqueia tentativas de sair da pasta de uploads (ex.: "..", caminhos absolutos).
  if (segments.some((segment) => segment.includes("..") || segment.includes("\\") || segment.includes("/"))) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  const filePath = path.join(UPLOADS_ROOT, ...segments);

  if (!filePath.startsWith(UPLOADS_ROOT)) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXTENSION[extension];

  if (!contentType) {
    return NextResponse.json({ error: "Tipo de arquivo não suportado." }, { status: 400 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
}
