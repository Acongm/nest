import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CatsService } from './cats.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { UpdateCatDto } from './dto/update-cat.dto';
import { Cat } from './schemas/cat.schema';

@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Post()
  async create(@Req() reqRequest: Request, @Body() data: CreateCatDto) {
    // @Body() 装饰器：从请求体中提取并验证数据
    // @Req() 装饰器：注入 Express Request 对象
    return this.catsService.create(data);
  }

  @Get()
  async findAll(@Req() reqRequest: Request): Promise<Cat[]> {
    return this.catsService.findAll();
  }

  @Get(':id')
  async findOne(@Req() reqRequest: Request, @Param('id') id: string): Promise<Cat> {
    return this.catsService.findOne(id);
  }

  @Post(':id')
  async update(@Req() reqRequest: Request, @Param('id') id: string, @Body() data: UpdateCatDto) {
    return this.catsService.update(id, data);
  }

  @Delete(':id')
  async delete(@Req() reqRequest: Request, @Param('id') id: string) {
    return this.catsService.delete(id);
  }
}
