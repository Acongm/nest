import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Express } from 'express';
import express = require('express');
import { AppModule } from '../src/app.module';

let cachedServer: Express;

async function bootstrapServer(): Promise<Express> {
  if (cachedServer) {
    return cachedServer;
  }

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

  app.useGlobalPipes(new ValidationPipe());
  await app.init();

  cachedServer = server;
  return server;
}

export default async function handler(req, res) {
  const server = await bootstrapServer();
  return server(req, res);
}
