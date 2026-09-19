import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get(AppController);
  });

  describe('health', () => {
    it('reports ok with a timestamp', () => {
      const result = appController.health();
      expect(result.status).toBe('ok');
      expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
