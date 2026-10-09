import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Prometheus metrics. Each process (api, worker) owns its own registry. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'emcom_http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly emergenciesCreated = new Counter({
    name: 'emcom_emergencies_created_total',
    help: 'Emergencies created by pathway',
    labelNames: ['pathway'],
    registers: [this.registry],
  });

  readonly broadcastFanoutLatency = new Histogram({
    name: 'emcom_broadcast_fanout_latency_seconds',
    help: 'Time from broadcast intent committed to all push jobs enqueued',
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [this.registry],
  });

  readonly pushProviderLatency = new Histogram({
    name: 'emcom_push_queue_to_provider_seconds',
    help: 'Time from delivery queued to provider acceptance',
    labelNames: ['provider'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300],
    registers: [this.registry],
  });

  readonly pushResults = new Counter({
    name: 'emcom_push_results_total',
    help: 'Push send outcomes (PROVIDER_ACCEPTED is not proof of device delivery)',
    labelNames: ['provider', 'status'],
    registers: [this.registry],
  });

  readonly outboxDispatched = new Counter({
    name: 'emcom_outbox_dispatched_total',
    help: 'Outbox events published to the queue',
    labelNames: ['type'],
    registers: [this.registry],
  });

  readonly outboxPublishErrors = new Counter({
    name: 'emcom_outbox_publish_errors_total',
    help: 'Failures publishing outbox events to the queue (will retry)',
    registers: [this.registry],
  });

  readonly outboxPending = new Gauge({
    name: 'emcom_outbox_pending',
    help: 'Outbox events not yet dispatched',
    registers: [this.registry],
  });

  readonly outboxOldestAge = new Gauge({
    name: 'emcom_outbox_oldest_pending_age_seconds',
    help: 'Age of the oldest undispatched outbox event — alert if this grows',
    registers: [this.registry],
  });

  readonly queueJobs = new Gauge({
    name: 'emcom_queue_jobs',
    help: 'BullMQ job counts',
    labelNames: ['queue', 'state'],
    registers: [this.registry],
  });

  constructor() {
    if (process.env.NODE_ENV !== 'test') collectDefaultMetrics({ register: this.registry });
  }
}
