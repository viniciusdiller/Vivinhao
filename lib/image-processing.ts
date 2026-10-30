import sharp from "sharp";

// Fotos de quarto/galeria chegam cruas do celular do cliente (câmeras atuais
// tiram fotos de 4000px+ de largura, às vezes em PNG sem compressão) e nunca
// precisam ser exibidas maiores que isso na tela — sem redimensionar/
// recomprimir aqui, cada foto ocupava até ~3MB no disco e no carregamento da
// página pública.
const MAX_DIMENSION_PX = 1920;
const WEBP_QUALITY = 80;

export const COMPRESSED_IMAGE_EXTENSION = ".webp";
export const COMPRESSED_IMAGE_MIME = "image/webp";

/**
 * Redimensiona (só encolhe, nunca amplia) e recodifica para WebP. Preserva
 * animação de GIFs/WebP animados — sharp lê todos os frames com
 * `animated: true` e o `.webp()` de saída também gera todos os frames.
 */
export async function compressImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { animated: true })
    .resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
