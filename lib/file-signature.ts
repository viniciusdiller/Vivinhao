// Nunca confiar apenas no `file.type` declarado pelo cliente no multipart
// (é só o Content-Type que o navegador/atacante escolheu mandar) — valida o
// conteúdo real do arquivo pelos magic bytes antes de salvar no disco.

export type AllowedImageMime = "image/jpeg" | "image/jpg" | "image/png" | "image/webp" | "image/gif";

function matchesSignature(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Detecta o tipo real do arquivo a partir dos primeiros bytes. Retorna null
 * se não reconhecer nenhum dos formatos de imagem permitidos.
 */
export function detectImageMimeFromBuffer(buffer: Buffer): AllowedImageMime | null {
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(buffer.byteLength, 16));

  if (matchesSignature(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (matchesSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (matchesSignature(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return "image/gif";
  }

  // WEBP: "RIFF" nos bytes 0-3, tamanho nos bytes 4-7, "WEBP" nos bytes 8-11.
  if (matchesSignature(bytes, [0x52, 0x49, 0x46, 0x46]) && matchesSignature(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  return null;
}
