import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CatsModule } from './cats/cats.module';
import { CoreModule } from './core/core.module';

@Module({
  imports: [CoreModule, CatsModule],
  controllers: [AppController],
})
export class AppModule {}
