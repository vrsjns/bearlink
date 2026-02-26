import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

const QUEUE = 'events';
const MAX_RETRIES = 30;
const RETRY_INTERVAL_MS = 2000;

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (_) {}
  }

  private async connect() {
    const url = process.env.RABBITMQ_URL || 'amqp://localhost';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(QUEUE, { durable: true });
        this.logger.log('Connected to RabbitMQ');
        return;
      } catch (err) {
        this.logger.warn(`RabbitMQ connection attempt ${attempt}/${MAX_RETRIES} failed`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
        }
      }
    }
    this.logger.error('Could not connect to RabbitMQ after max retries');
  }

  private publish(type: string, payload: object) {
    if (!this.channel) {
      this.logger.warn('RabbitMQ channel not available, skipping event publish');
      return;
    }
    this.channel.sendToQueue(
      QUEUE,
      Buffer.from(JSON.stringify({ type, payload })),
    );
  }

  async publishLinkCreated(payload: {
    id: number;
    alias: string;
    originalUrl: string;
    userId: number;
  }) {
    this.publish('link_created', payload);
  }

  async publishLinkClicked(payload: {
    alias: string;
    originalUrl: string;
    userId: number;
  }) {
    this.publish('link_clicked', payload);
  }
}
