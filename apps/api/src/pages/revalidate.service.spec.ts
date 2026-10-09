import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { REVALIDATE_SECRET_CONTEXT, SecretBox } from '../common/secret-box.js';
import { RevalidateService } from './revalidate.service.js';

const box = new SecretBox({ get: () => randomBytes(32).toString('base64') } as unknown as ConfigService);
const service = () => new RevalidateService(box);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

async function listen(handler: Parameters<typeof createServer>[1]) {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/revalidate`;
}

describe('RevalidateService', () => {
  it('notify не ждёт сайт, flush дожидается завершения вызова', async () => {
    const received: Array<string | undefined> = [];
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const url = await listen(async (req, res) => {
      received.push(req.headers['x-revalidate-secret'] as string);
      await hold;
      res.end('ok');
    });

    const revalidate = service();
    const started = Date.now();
    const result = revalidate.notify({
      slug: 'rucode',
      revalidateUrl: url,
      revalidateSecret: box.encrypt('s3cret', REVALIDATE_SECRET_CONTEXT),
    });
    expect(result).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(100);

    let flushed = false;
    const flushing = revalidate.flush().then(() => (flushed = true));
    await sleep(80);
    expect(flushed).toBe(false);
    release();
    await flushing;
    expect(received).toEqual(['s3cret']);
  });

  it('недоступный сайт не приводит к исключению', async () => {
    const revalidate = service();
    revalidate.notify({ slug: 'rucode', revalidateUrl: 'http://127.0.0.1:1/x', revalidateSecret: null });
    await expect(revalidate.flush()).resolves.toBeUndefined();
  });

  it('повреждённый секрет не приводит к исключению и не отправляет запрос', async () => {
    let calls = 0;
    const url = await listen((_req, res) => {
      calls++;
      res.end('ok');
    });
    const revalidate = service();
    revalidate.notify({ slug: 'rucode', revalidateUrl: url, revalidateSecret: 'v1:broken' });
    await revalidate.flush();
    expect(calls).toBe(0);
  });

  it('без адреса вебхука ничего не делает', async () => {
    const revalidate = service();
    revalidate.notify({ slug: 'rucode', revalidateUrl: null, revalidateSecret: null });
    await expect(revalidate.flush()).resolves.toBeUndefined();
  });
});
