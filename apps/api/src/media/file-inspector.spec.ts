import sharp from 'sharp';
import { inspectFile, sanitizeSvg } from './file-inspector.js';
import { cleanName, fixFilenameEncoding } from './media.service.js';

const png = () =>
  sharp({ create: { width: 4, height: 3, channels: 3, background: '#ff0000' } }).png().toBuffer();

describe('inspectFile', () => {
  it('определяет PNG по сигнатуре и возвращает размеры', async () => {
    const result = await inspectFile(await png());
    expect(result.type.ext).toBe('png');
    expect(result.width).toBe(4);
    expect(result.height).toBe(3);
  });

  it('не доверяет содержимому: текст с расширением картинки отклоняется', async () => {
    await expect(inspectFile(Buffer.from('MZ not an image, just text'))).rejects.toThrow(
      'Тип файла не поддерживается',
    );
  });

  it('отклоняет пустой файл', async () => {
    await expect(inspectFile(Buffer.alloc(0))).rejects.toThrow('Пустой файл');
  });

  it('отклоняет HTML, замаскированный под картинку', async () => {
    await expect(inspectFile(Buffer.from('<html><script>alert(1)</script></html>'))).rejects.toThrow();
  });

  it('удаляет EXIF у JPEG', async () => {
    const withExif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00ff00' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-author' } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await inspectFile(withExif);
    expect(result.type.ext).toBe('jpg');
    expect((await sharp(result.buffer).metadata()).exif).toBeUndefined();
    expect(result.buffer.includes(Buffer.from('secret-author'))).toBe(false);
  });

  it('принимает SVG и очищает обработчики событий', async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
        '<rect width="10" height="10" onload="alert(2)"/></svg>',
    );
    const result = await inspectFile(svg);
    const text = result.buffer.toString('utf8');
    expect(result.type.ext).toBe('svg');
    expect(text).toContain('<rect');
    expect(text).not.toContain('onload');
  });

  it('отклоняет SVG со скриптом', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(inspectFile(svg)).rejects.toThrow('недопустимые элементы');
  });

  it('отклоняет SVG больше 1 МБ', async () => {
    const big = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${'<g/>'.repeat(300_000)}</svg>`);
    await expect(inspectFile(big)).rejects.toThrow('Файл больше');
  });
});

describe('sanitizeSvg', () => {
  it('убирает javascript: в ссылках и обработчики событий, сохраняя остальное', () => {
    const clean = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a>' +
        '<circle r="5" onclick="x()"/></svg>',
    );
    expect(clean).not.toMatch(/javascript:|onclick/i);
    expect(clean).toContain('<circle');
    expect(clean).toContain('<text>x</text>');
  });

  it('отклоняет foreignObject и iframe', () => {
    expect(() =>
      sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="x"/></foreignObject></svg>'),
    ).toThrow('недопустимые элементы');
  });
});

describe('fixFilenameEncoding', () => {
  it('восстанавливает UTF-8, прочитанный как latin1', () => {
    const mangled = Buffer.from('красный.png', 'utf8').toString('latin1');
    expect(mangled).not.toBe('красный.png');
    expect(fixFilenameEncoding(mangled)).toBe('красный.png');
  });

  it('не трогает ASCII и уже корректный Unicode', () => {
    expect(fixFilenameEncoding('photo.png')).toBe('photo.png');
    expect(fixFilenameEncoding('красный.png')).toBe('красный.png');
  });

  it('оставляет строку как есть, если перекодирование даёт некорректный UTF-8', () => {
    expect(fixFilenameEncoding('café.png')).toBe('café.png');
  });
});

describe('cleanName', () => {
  it('убирает путь и управляющие символы', () => {
    expect(cleanName('../../etc/passwd')).toBe('passwd');
    expect(cleanName('C:\\Users\\a\\photo.png')).toBe('photo.png');
    expect(cleanName('a\u0000b.png')).toBe('ab.png');
    expect(cleanName('')).toBe('file');
    expect(cleanName('x'.repeat(500))).toHaveLength(200);
  });
});
