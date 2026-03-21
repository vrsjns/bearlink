# Events Topic Exchange

> **Status:** approved
> **Service(s):** shared, analytics-service, auth-service, url-service, billing-service
> **Priority:** high

## Goal

Replace the single shared `events` queue with a topic exchange so that multiple
services can independently consume only the domain events they care about, without
competing for messages and without receiving events they publish themselves.

## Background

The current shared `consumer.js` calls `assertQueue(QUEUES.EVENTS)` and
`consume(QUEUES.EVENTS)` directly. In RabbitMQ, multiple consumers bound to the
same queue are competing consumers: each message is delivered to exactly one of
them, round-robin. This works today because analytics-service is the only consumer
of the `events` queue.

The premium-plans initiative introduces two additional consumers of domain events:

- billing-service must consume `user_registered` to create default subscription
  records (see `spec/plan-model.md`).
- auth-service must consume `subscription_updated` (published by billing-service)
  to keep the denormalized `plan` field on the User record up to date.

Adding both as consumers of the current single `events` queue would cause all three
services to compete for every message — each event reaching only one of them.

A fanout exchange (deliver to all bound queues unconditionally) is not sufficient
either: billing-service both publishes `subscription_updated` and consumes from the
exchange. With fanout, its own queue would receive every event on the exchange,
including the events it just published, creating a self-consumption loop.

A **topic exchange** solves both problems. The publisher sets the event type as the
routing key. Each consuming service binds its own durable queue to the exchange with
only the routing keys it needs. A service that publishes `subscription_updated`
never binds its queue to that routing key, so it never receives its own messages.

## Requirements

### Functional

- **R1:** The shared events module shall declare a durable topic exchange named
  `domain_events`.
- **R2:** The publisher shall publish all domain events to the `domain_events`
  exchange using the event type as the routing key (e.g. routing key
  `user_registered` for a `user_registered` event).
- **R3:** Each consuming service shall declare its own durable queue, bound to the
  `domain_events` exchange with the specific routing keys it needs:

  | Service           | Queue name         | Routing keys (binding) |
  | ----------------- | ------------------ | ---------------------- |
  | analytics-service | `events.analytics` | `#` (all events)       |
  | billing-service   | `events.billing`   | `user_registered`      |
  | auth-service      | `events.auth`      | `subscription_updated` |

- **R4:** The shared `consumeEvents` helper shall accept a `queueName` and
  `bindingKeys` parameter so each service can declare its own queue with the
  appropriate bindings rather than sharing a hardcoded queue name.
- **R5:** The existing `events` queue shall be retired. Docker Compose and k8s
  environments will naturally create only the new queues on next startup.
- **R6:** analytics-service shall be updated to consume from `events.analytics`
  bound with `#`, preserving its current behaviour of handling all event types.
- **R7:** Services that do not consume domain events (notification-service,
  preview-service, audit-service) shall not be affected.

### Non-Functional

- **R8:** The publisher interface (`publishEvent`, `publishUserRegistered`, etc.)
  shall not change signature — only the internal routing changes from direct queue
  to exchange.
- **R9:** Existing tests that mock RabbitMQ shall continue to pass with minimal
  changes (queue name or exchange name assertions may need updating).
- **R10:** No RabbitMQ data migration is required. Per-service queues start empty;
  any in-flight messages on the old `events` queue are drained by the existing
  analytics-service consumer before it is retired. A short window where in-flight
  events are processed by the old consumer during deployment is acceptable.

## Acceptance Criteria

- [ ] A single `user_registered` event is received by both `events.analytics`
      (analytics-service) and `events.billing` (billing-service) independently.
- [ ] analytics-service processing a `user_registered` event does not prevent
      billing-service from receiving it, and vice versa.
- [ ] A `subscription_updated` event published by billing-service is received by
      `events.auth` (auth-service) but NOT by `events.billing` (billing-service).
- [ ] Stopping analytics-service does not cause events to be lost for billing-service
      (messages queue up in `events.billing` until it reconnects).
- [ ] The publisher continues to work with the same call signature as before.
- [ ] All existing analytics-service event-handling tests pass after the migration.

## Out of Scope

- Dead-letter queues or retry exchanges (separate concern).
- auth-service actually consuming `subscription_updated` (covered in
  `spec/plan-model.md`; this spec only provides the infrastructure and updates the
  binding table).
- billing-service consumer implementation (covered in `spec/plan-model.md`).

## Docs to Update

- [ ] `docs/asyncapi.yaml` -- update channel from `events` queue to
      `domain_events` topic exchange; document per-service subscriber queues and
      binding keys

## Tasks

<!-- Generated by Claude. Ask: "Generate tasks for spec/events-topic-exchange.md" -->
