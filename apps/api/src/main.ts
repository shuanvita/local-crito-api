import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { isDevelopment } from './config/runtime.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // SIGTERM/SIGINT: дождаться вебхуков и закрыть соединение с БД, а не оборвать процесс.
  app.enableShutdownHooks();

  // Документация API только в разработке.
  if (isDevelopment()) {
    const config = new DocumentBuilder().setTitle('Crito CMS API').addBearerAuth().build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
