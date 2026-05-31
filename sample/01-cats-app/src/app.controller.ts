import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getStatus() {
    return {
      name: 'Acongm Nest API',
      status: 'ok',
      endpoints: ['/cats'],
    };
  }
}
