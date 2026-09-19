import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // lets PrismaService.onModuleDestroy close the DB pool
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
