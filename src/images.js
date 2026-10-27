// Otimização das fotos enviadas pelo /admin.
//
// Duas camadas:
//  1. No navegador (páginas do admin): a foto é reduzida para no máximo
//     1600px e convertida para WEBP antes do envio — funciona em qualquer
//     hospedagem e deixa o upload rápido mesmo no 4G da loja.
//  2. No Worker da Cloudflare: se o binding de Images (`IMAGES`) existir,
//     a imagem passa por ele (mesmo limite de 1600px, WEBP qualidade 82).
//     Se o binding não existir (Node local) ou falhar, grava a imagem como
//     chegou — o upload nunca quebra por causa da otimização.
import { sniffImage } from './util.js';

export const MAX_DIMENSION = 1600;
const CONTENT_TYPE = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function optimizeImage(images, bytes, ext) {
  const original = { bytes, ext, contentType: CONTENT_TYPE[ext], optimized: false };
  if (!images || typeof images.input !== 'function') return original;
  try {
    const result = await images
      .input(new Blob([bytes]).stream())
      .transform({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 82 });
    const out = new Uint8Array(await result.response().arrayBuffer());
    // Confere o resultado e só fica com ele se realmente ficou menor.
    if (sniffImage(out) !== 'webp' || out.length >= bytes.length) return original;
    return { bytes: out, ext: 'webp', contentType: 'image/webp', optimized: true };
  } catch (e) {
    console.warn('[imagens] otimização indisponível, gravando original:', e && e.message);
    return original;
  }
}
