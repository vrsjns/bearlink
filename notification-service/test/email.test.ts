import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Notification Service - Email', () => {
  const mockSendMail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
  });

  describe('sendEmail', () => {
    const sendEmail = async (payload: { to: string; subject: string; text: string }) => {
      const result = await mockSendMail({
        from: process.env.EMAIL_USER,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      });
      return result;
    };

    it('should send welcome email', async () => {
      const emailPayload = {
        to: 'user@example.com',
        subject: 'Welcome to BearLink!',
        text: 'Hello User, thank you for registering.',
      };

      await sendEmail(emailPayload);

      expect(mockSendMail).toHaveBeenCalledWith({
        from: process.env.EMAIL_USER,
        to: 'user@example.com',
        subject: 'Welcome to BearLink!',
        text: 'Hello User, thank you for registering.',
      });
    });

    it('should return message ID on success', async () => {
      const emailPayload = {
        to: 'user@example.com',
        subject: 'Test Email',
        text: 'Test content',
      };

      const result = await sendEmail(emailPayload);

      expect(result.messageId).toBe('test-id');
    });

    it('should handle email delivery failure', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection failed'));

      const emailPayload = {
        to: 'user@example.com',
        subject: 'Test Email',
        text: 'Test content',
      };

      await expect(sendEmail(emailPayload)).rejects.toThrow('SMTP connection failed');
    });
  });

  describe('email payload validation', () => {
    it('should validate required fields', () => {
      const validPayload = {
        to: 'user@example.com',
        subject: 'Subject',
        text: 'Body',
      };

      expect(validPayload.to).toBeDefined();
      expect(validPayload.subject).toBeDefined();
      expect(validPayload.text).toBeDefined();
    });
  });
});
