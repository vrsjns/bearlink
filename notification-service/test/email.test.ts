import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the actual service
const { createTransporter, createEmailSender } = require('../services/email.service');

// Import the actual app factory
const { createApp } = require('../app');

describe('Notification Service', () => {
  describe('Email Service - createTransporter', () => {
    it('should create a nodemailer transporter', () => {
      const transporter = createTransporter();

      expect(transporter).toBeDefined();
      expect(transporter.sendMail).toBeDefined();
    });

    it('should return a transporter with sendMail method', () => {
      const transporter = createTransporter();

      expect(typeof transporter.sendMail).toBe('function');
    });
  });

  describe('Email Service - createEmailSender', () => {
    let mockTransporter: any;
    let sendEmail: any;

    beforeEach(() => {
      mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
      };
      sendEmail = createEmailSender(mockTransporter);
    });

    it('should send email with correct parameters', async () => {
      const emailPayload = {
        to: 'user@example.com',
        subject: 'Welcome to BearLink!',
        text: 'Hello User, thank you for registering.',
      };

      await sendEmail(emailPayload);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: process.env.EMAIL_USER,
        to: 'user@example.com',
        subject: 'Welcome to BearLink!',
        text: 'Hello User, thank you for registering.',
      });
    });

    it('should use EMAIL_USER as from address', async () => {
      const emailPayload = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body',
      };

      await sendEmail(emailPayload);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.from).toBe(process.env.EMAIL_USER);
    });

    it('should send welcome email on user registration', async () => {
      const emailPayload = {
        to: 'newuser@example.com',
        subject: 'Welcome to BearLink!',
        text: 'Hello NewUser,\n\nThank you for registering at BearLink.\n\nBest Regards,\nBearLink Team',
      };

      await sendEmail(emailPayload);

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newuser@example.com',
          subject: 'Welcome to BearLink!',
        })
      );
    });

    it('should handle email delivery failure', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP connection failed'));

      const emailPayload = {
        to: 'user@example.com',
        subject: 'Test Email',
        text: 'Test content',
      };

      await expect(sendEmail(emailPayload)).rejects.toThrow('SMTP connection failed');
    });

    it('should handle SMTP authentication failure', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Authentication failed'));

      const emailPayload = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test',
      };

      await expect(sendEmail(emailPayload)).rejects.toThrow('Authentication failed');
    });

    it('should handle invalid recipient error', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Invalid recipient address'));

      const emailPayload = {
        to: 'invalid-email',
        subject: 'Test',
        text: 'Test',
      };

      await expect(sendEmail(emailPayload)).rejects.toThrow('Invalid recipient address');
    });

    it('should handle network timeout', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Connection timeout'));

      const emailPayload = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test',
      };

      await expect(sendEmail(emailPayload)).rejects.toThrow('Connection timeout');
    });

    it('should send emails with various subjects', async () => {
      const subjects = [
        'Welcome to BearLink!',
        'Password Reset Request',
        'Your account has been updated',
      ];

      for (const subject of subjects) {
        mockTransporter.sendMail.mockClear();

        await sendEmail({
          to: 'user@example.com',
          subject,
          text: 'Email body',
        });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({ subject })
        );
      }
    });

    it('should pass to, subject, and text from payload', async () => {
      const emailPayload = {
        to: 'test@test.com',
        subject: 'Test Subject',
        text: 'Test Body Content',
      };

      await sendEmail(emailPayload);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: process.env.EMAIL_USER,
        to: 'test@test.com',
        subject: 'Test Subject',
        text: 'Test Body Content',
      });
    });
  });

  describe('App Factory - createApp', () => {
    it('should create an Express app', () => {
      const app = createApp();

      expect(app).toBeDefined();
      expect(typeof app.use).toBe('function');
      expect(typeof app.listen).toBe('function');
    });

    it('should setup middleware', () => {
      const app = createApp();

      // App should have middleware stack
      expect(app._router).toBeDefined();
    });

    it('should return a new app instance each time', () => {
      const app1 = createApp();
      const app2 = createApp();

      expect(app1).not.toBe(app2);
    });

    it('should be a function', () => {
      expect(typeof createApp).toBe('function');
    });
  });

  describe('Email Sender Factory', () => {
    it('should return a function', () => {
      const mockTransporter = { sendMail: vi.fn() };
      const sendEmail = createEmailSender(mockTransporter);

      expect(typeof sendEmail).toBe('function');
    });

    it('should accept transporter as dependency', () => {
      const mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({ messageId: 'abc123' }),
      };

      const sendEmail = createEmailSender(mockTransporter);

      expect(sendEmail).toBeDefined();
    });
  });
});
