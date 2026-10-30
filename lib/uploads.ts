// Fotos de quarto/galeria são salvas em public/uploads/..., mas servidas por
// uma rota própria (app/api/uploads/[...path]/route.ts) em vez de depender
// do arquivo estático do Next/proxy — aquele caminho só reconhece arquivos
// novos depois de um restart do processo, o que não é aceitável para um
// upload feito durante a operação normal do painel.
export function toPublicUploadUrl(relativePath: string | null | undefined): string {
  if (!relativePath) {
    return '';
  }

  if (!relativePath.startsWith('/uploads/')) {
    return relativePath;
  }

  return `/api${relativePath}`;
}
