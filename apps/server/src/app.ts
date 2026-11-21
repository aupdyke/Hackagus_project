import cors from 'cors';
import express from 'express';
import { errorMiddleware, notFound } from './http';
import { systemRouter } from './routes/system';
import { tripsRouter } from './routes/trips';
import { tripsAiRouter } from './routes/tripsAi';
import { packetRouter, tripsPublishRouter } from './routes/tripsPublish';
import { seasonRouter } from './routes/season';
import { athletesRouter } from './routes/athletes';
import { shareRouter } from './routes/share';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '200kb' }));
  app.use(systemRouter);
  app.use(packetRouter); // before the staff-only /trips routers: athletes may fetch their own packet (A-11)
  app.use(tripsRouter);
  app.use(tripsAiRouter);
  app.use(tripsPublishRouter);
  app.use(seasonRouter);
  app.use(athletesRouter);
  app.use(shareRouter);
  app.use((_req, _res, next) => next(notFound('route')));
  app.use(errorMiddleware);
  return app;
}
