import { vi } from 'vitest';

export const mockChannel = {
  assertQueue: vi.fn(),
  sendToQueue: vi.fn(),
  consume: vi.fn(),
  ack: vi.fn(),
  nack: vi.fn(),
};

export const mockEventPublisher = {
  publishUserRegistered: vi.fn(),
  publishUrlCreated: vi.fn(),
  publishUrlClicked: vi.fn(),
  publishEmailNotification: vi.fn(),
  publishEvent: vi.fn(),
};

export const createMockEventPublisher = () => mockEventPublisher;

export const resetRabbitMQMocks = () => {
  Object.values(mockChannel).forEach((mock) => mock.mockReset());
  Object.values(mockEventPublisher).forEach((mock) => mock.mockReset());
};
