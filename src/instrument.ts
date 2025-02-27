import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import * as dotenv from 'dotenv';

dotenv.config();

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
        nodeProfilingIntegration(),
        Sentry.koaIntegration(),
    ],
    tracesSampleRate: 1.0,
});

Sentry.profiler.startProfiler();

export default Sentry;