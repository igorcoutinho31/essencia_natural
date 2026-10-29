// Converte os logos das marcas (public/assets/brands/*.png|jpg) para
// dourado sobre fundo transparente, em public/assets/brands/ouro/, que é o
// que a faixa de marcas da home usa. Logo novo: coloque o arquivo em
// public/assets/brands/ e rode
//   node tools/logos-ouro.cjs /caminho/previa.jpg
// (a prévia mostra todos em fundo escuro para conferir).
const sharp = require('sharp'); const fs = require('fs'); const path = require('path');
const SRC = 'public/assets/brands', OUT = 'public/assets/brands/ouro';
const GOLD = [214, 178, 116];
(async () => {
  const sheet = [];
  for (const f of fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g)$/i.test(f))) {
    const { data, info } = await sharp(path.join(SRC, f)).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    // fundo = média das bordas
    let s = 0, n = 0;
    for (let x = 0; x < w; x++) { s += data[x] + data[(h - 1) * w + x]; n += 2; }
    for (let y = 0; y < h; y++) { s += data[y * w] + data[y * w + w - 1]; n += 2; }
    const fundo = s / n; const escuro = fundo < 128;
    // contraste: distância até o fundo
    let max = 1; for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - fundo));
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      let a = Math.abs(data[i] - fundo) / max; a = Math.max(0, (a - 0.12) / 0.88); a = Math.min(1, a * 1.25);
      rgba[i * 4] = GOLD[0]; rgba[i * 4 + 1] = GOLD[1]; rgba[i * 4 + 2] = GOLD[2]; rgba[i * 4 + 3] = Math.round(a * 255);
    }
    const nome = f.replace(/\.(png|jpe?g)$/i, '');
    const img = sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 });
    const buf = await img.png().toBuffer();
    const out = await sharp(buf).resize({ height: 160, width: 420, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(OUT, nome + '.png'), out);
    sheet.push({ nome, out, escuro });
  }
  const cols = 4, cw = 300, ch = 150;
  const comps = await Promise.all(sheet.map(async (s, i) => {
    const r = await sharp(s.out).resize({ width: cw - 40, height: ch - 50, fit: 'inside' }).toBuffer();
    const m = await sharp(r).metadata();
    return { input: r, left: (i % cols) * cw + Math.round((cw - m.width) / 2), top: Math.floor(i / cols) * ch + 10 + Math.round((ch - 50 - m.height) / 2) };
  }));
  const labels = Buffer.from(`<svg width="${cols * cw}" height="${Math.ceil(sheet.length / cols) * ch}">${sheet.map((s, i) => `<text x="${(i % cols) * cw + 10}" y="${Math.floor(i / cols) * ch + ch - 12}" fill="#888" font-size="14" font-family="sans-serif">${s.nome}${s.escuro ? ' (fundo escuro)' : ''}</text>`).join('')}</svg>`);
  await sharp({ create: { width: cols * cw, height: Math.ceil(sheet.length / cols) * ch, channels: 3, background: '#0e0c0a' } })
    .composite([...comps, { input: labels, left: 0, top: 0 }]).jpeg({ quality: 80 }).toFile(process.argv[2]);
})();
