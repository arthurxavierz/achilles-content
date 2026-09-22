// Reduz a imagem no navegador antes de subir.
//
// As referencias da marca vao anexadas a TODA arte gerada, via multipart.
// Duas referencias de 8 MB viram 16 MB de upload por imagem, e num carrossel
// de cinco isso passa de 80 MB no mesmo job: era o caminho mais curto para a
// requisicao estourar o tempo e voltar como "fetch failed". Reduzido aqui,
// o anexo cai para algumas centenas de KB, e o custo em tokens de entrada
// cai junto, sem perda visivel de fidelidade para o modelo.

const MAX_EDGE = 1024
const QUALITY = 0.85

export async function shrinkImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  // Formato que o navegador nao decodifica, ou API ausente: sobe como veio.
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file
  if (typeof createImageBitmap !== 'function') return file

  let bitmap
  try { bitmap = await createImageBitmap(file) } catch { return file }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close?.(); return file }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  // Se o resultado não ficou menor, o original já estava bom.
  if (!blob || blob.size >= file.size) return file

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}
