import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('верный пароль проходит, неверный нет', async () => {
    const hash = await passwords.hash('correct horse battery');
    expect(await passwords.verify('correct horse battery', hash)).toBe(true);
    expect(await passwords.verify('correct horse batterY', hash)).toBe(false);
    expect(await passwords.verify('', hash)).toBe(false);
  });

  it('соль разная: один пароль даёт разные хэши; параметры лежат в строке', async () => {
    const [a, b] = await Promise.all([passwords.hash('same-password-1'), passwords.hash('same-password-1')]);
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$16384$8$1$')).toBe(true);
  });

  it('испорченная строка хэша даёт false, а не исключение', async () => {
    for (const broken of ['', 'plain', 'scrypt$x$y$z$a$b', 'scrypt$16384$8$1$AAAA$', 'bcrypt$1$2$3$a$b']) {
      expect(await passwords.verify('whatever-password', broken)).toBe(false);
    }
  });

  it('Unicode нормализуется (NFKC): тот же пароль в другой форме записи подходит', async () => {
    const hash = await passwords.hash('é-password-123');
    expect(await passwords.verify('é-password-123', hash)).toBe(true);
  });
});
