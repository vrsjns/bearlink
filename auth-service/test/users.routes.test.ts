import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { createMockPrismaClient, mockPrismaUser, resetPrismaMocks } from './mocks/prisma';
import { mockEventPublisher, resetRabbitMQMocks } from './mocks/rabbitmq';

// Import the REAL app factory - this tests the actual application
import { createApp } from '../app';

describe('Users Routes', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  // Helper to generate valid JWT tokens for testing
  const generateTestToken = (user: { id: number; email: string; name: string; role: string }) => {
    return jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '1h' });
  };

  // Test users
  const regularUser = { id: 1, email: 'user@example.com', name: 'Regular User', role: 'USER' };
  const adminUser = { id: 2, email: 'admin@example.com', name: 'Admin User', role: 'ADMIN' };
  const anotherUser = { id: 3, email: 'another@example.com', name: 'Another User', role: 'USER' };

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();

    mockPrisma = createMockPrismaClient();

    // Create the REAL app with mocked dependencies
    // This tests the actual application that will be deployed
    app = createApp({
      prisma: mockPrisma,
      eventPublisher: mockEventPublisher,
    });
  });

  describe('GET /profile', () => {
    describe('successful requests', () => {
      it('should return current user profile', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = {
          ...regularUser,
          password: 'hashedPassword',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .get('/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.id).toBe(regularUser.id);
        expect(response.body.email).toBe(regularUser.email);
        expect(response.body.name).toBe(regularUser.name);
        expect(response.body).not.toHaveProperty('password');
      });

      it('should query user by ID from token', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaUser.findUnique.mockResolvedValue({
          ...regularUser,
          password: 'hashedPassword',
        });

        await request(app)
          .get('/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
          where: { id: regularUser.id },
        });
      });
    });

    describe('authentication errors', () => {
      it('should return 401 without authorization header', async () => {
        const response = await request(app)
          .get('/profile')
          .expect(401);

        expect(response.body.error).toContain('Missing authorization token');
      });

      it('should return 403 with invalid token', async () => {
        const response = await request(app)
          .get('/profile')
          .set('Authorization', 'Bearer invalid-token')
          .expect(403);

        expect(response.body).toHaveProperty('error');
      });

      it('should return 403 with expired token', async () => {
        const expiredToken = jwt.sign(regularUser, process.env.JWT_SECRET!, { expiresIn: '-1h' });

        const response = await request(app)
          .get('/profile')
          .set('Authorization', `Bearer ${expiredToken}`)
          .expect(403);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('error handling', () => {
      it('should return 404 if user not found in database', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaUser.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .get('/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(404);

        expect(response.body.error).toBe('User not found.');
      });

      it('should return 500 on database error', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaUser.findUnique.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .get('/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(500);

        expect(response.body.error).toBe('Failed to fetch profile.');
      });
    });
  });

  describe('GET /users', () => {
    describe('successful requests (admin)', () => {
      it('should return all users for admin', async () => {
        const token = generateTestToken(adminUser);
        const users = [
          { ...regularUser, password: 'hash1' },
          { ...adminUser, password: 'hash2' },
          { ...anotherUser, password: 'hash3' },
        ];

        mockPrismaUser.findMany.mockResolvedValue(users);

        const response = await request(app)
          .get('/users')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).toHaveLength(3);
        // Verify passwords are sanitized
        response.body.forEach((user: any) => {
          expect(user).not.toHaveProperty('password');
        });
      });

      it('should return empty array when no users exist', async () => {
        const token = generateTestToken(adminUser);
        mockPrismaUser.findMany.mockResolvedValue([]);

        const response = await request(app)
          .get('/users')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).toEqual([]);
      });
    });

    describe('authorization errors', () => {
      it('should return 403 for non-admin user', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .get('/users')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(response.body.error).toContain('does not have admin role');
      });

      it('should return 401 without token', async () => {
        const response = await request(app)
          .get('/users')
          .expect(401);

        expect(response.body.error).toContain('Missing authorization token');
      });
    });
  });

  describe('GET /users/:userId', () => {
    describe('successful requests', () => {
      it('should allow user to get their own profile', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .get(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.id).toBe(regularUser.id);
        expect(response.body).not.toHaveProperty('password');
      });

      it('should allow admin to get any user profile', async () => {
        const token = generateTestToken(adminUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .get(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.id).toBe(regularUser.id);
      });
    });

    describe('authorization errors', () => {
      it('should return 403 when accessing another user profile', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .get(`/users/${anotherUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(response.body.error).toContain('does not have permission');
      });
    });

    describe('not found', () => {
      it('should return 404 for non-existent user', async () => {
        const token = generateTestToken(adminUser);
        mockPrismaUser.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .get('/users/999')
          .set('Authorization', `Bearer ${token}`)
          .expect(404);

        expect(response.body.error).toBe('User not found.');
      });
    });
  });

  describe('PUT /users/:userId', () => {
    describe('update name', () => {
      it('should update user name successfully', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        const updatedUser = { ...dbUser, name: 'New Name' };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockResolvedValue(updatedUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'New Name' })
          .expect(200);

        expect(response.body.user.name).toBe('New Name');
        expect(response.body).toHaveProperty('token');
      });

      it('should trim whitespace from name', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        const updatedUser = { ...dbUser, name: 'Trimmed Name' };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockResolvedValue(updatedUser);

        await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: '  Trimmed Name  ' })
          .expect(200);

        expect(mockPrismaUser.update).toHaveBeenCalledWith({
          where: { id: regularUser.id },
          data: { name: 'Trimmed Name' },
        });
      });

      it('should return 400 for invalid name (too long)', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'a'.repeat(101) })
          .expect(400);

        expect(response.body.error).toContain('Name must be 1-100 characters');
      });

      it('should return 400 for empty name', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: '' })
          .expect(400);

        expect(response.body.error).toContain('Name must be 1-100 characters');
      });
    });

    describe('update email', () => {
      it('should update email with correct password', async () => {
        const token = generateTestToken(regularUser);
        const hashedPassword = await bcrypt.hash('CurrentPass1', 10);
        const dbUser = { ...regularUser, password: hashedPassword };
        const updatedUser = { ...dbUser, email: 'newemail@example.com' };

        mockPrismaUser.findUnique
          .mockResolvedValueOnce(dbUser) // First call: get user
          .mockResolvedValueOnce(null); // Second call: check email uniqueness
        mockPrismaUser.update.mockResolvedValue(updatedUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            email: 'newemail@example.com',
            currentPassword: 'CurrentPass1',
          })
          .expect(200);

        expect(response.body.user.email).toBe('newemail@example.com');
        expect(response.body).toHaveProperty('token');
      });

      it('should return 403 without password when changing email', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ email: 'newemail@example.com' })
          .expect(403);

        expect(response.body.error).toBe('Current password required to change email.');
      });

      it('should return 403 with wrong password', async () => {
        const token = generateTestToken(regularUser);
        const hashedPassword = await bcrypt.hash('RealPassword1', 10);
        const dbUser = { ...regularUser, password: hashedPassword };
        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            email: 'newemail@example.com',
            currentPassword: 'WrongPassword1',
          })
          .expect(403);

        expect(response.body.error).toBe('Invalid current password.');
      });

      it('should return 409 when email already in use', async () => {
        const token = generateTestToken(regularUser);
        const hashedPassword = await bcrypt.hash('CurrentPass1', 10);
        const dbUser = { ...regularUser, password: hashedPassword };

        mockPrismaUser.findUnique
          .mockResolvedValueOnce(dbUser) // Get user
          .mockResolvedValueOnce({ id: 999, email: 'taken@example.com' }); // Email check

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            email: 'taken@example.com',
            currentPassword: 'CurrentPass1',
          })
          .expect(409);

        expect(response.body.error).toBe('Email already in use.');
      });

      it('should return 400 for invalid email format', async () => {
        const token = generateTestToken(regularUser);
        const hashedPassword = await bcrypt.hash('CurrentPass1', 10);
        const dbUser = { ...regularUser, password: hashedPassword };
        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            email: 'invalid-email',
            currentPassword: 'CurrentPass1',
          })
          .expect(400);

        expect(response.body.error).toContain('Invalid email format');
      });

      it('should not require password when email unchanged', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ email: regularUser.email }) // Same email
          .expect(200);

        // Should return existing user without update
        expect(response.body.user.email).toBe(regularUser.email);
      });
    });

    describe('no changes', () => {
      it('should return current user when no changes provided', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(200);

        expect(response.body.user.id).toBe(regularUser.id);
        expect(mockPrismaUser.update).not.toHaveBeenCalled();
      });
    });

    describe('authorization', () => {
      it('should allow admin to update any user', async () => {
        const token = generateTestToken(adminUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };
        const updatedUser = { ...dbUser, name: 'Updated by Admin' };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockResolvedValue(updatedUser);

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Updated by Admin' })
          .expect(200);

        expect(response.body.user.name).toBe('Updated by Admin');
      });

      it('should return 403 when updating another user', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .put(`/users/${anotherUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Hacked Name' })
          .expect(403);

        expect(response.body.error).toContain('does not have permission');
      });
    });

    describe('error handling', () => {
      it('should return 404 for non-existent user', async () => {
        const token = generateTestToken(adminUser);
        mockPrismaUser.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .put('/users/999')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'New Name' })
          .expect(404);

        expect(response.body.error).toBe('User not found.');
      });

      it('should return 500 on database error', async () => {
        const token = generateTestToken(regularUser);
        const dbUser = { ...regularUser, password: 'hashedPassword' };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .put(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'New Name' })
          .expect(500);

        expect(response.body.error).toBe('Failed to update profile.');
      });
    });
  });

  describe('DELETE /users/:userId', () => {
    describe('successful deletion (admin only)', () => {
      it('should delete user as admin', async () => {
        const token = generateTestToken(adminUser);
        mockPrismaUser.delete.mockResolvedValue({ ...regularUser });

        await request(app)
          .delete(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(204);

        expect(mockPrismaUser.delete).toHaveBeenCalledWith({
          where: { id: regularUser.id },
        });
      });
    });

    describe('authorization errors', () => {
      it('should return 403 for non-admin user', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .delete(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(response.body.error).toContain('does not have admin role');
      });

      it('should not allow user to delete themselves without admin', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .delete(`/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(response.body.error).toContain('does not have admin role');
      });
    });
  });

  describe('POST /users/:userId/password', () => {
    describe('successful password change', () => {
      it('should change password with valid current password', async () => {
        const token = generateTestToken(regularUser);
        const currentPassword = 'OldPassword1';
        const newPassword = 'NewPassword1';
        const hashedCurrent = await bcrypt.hash(currentPassword, 10);
        const dbUser = { ...regularUser, password: hashedCurrent };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockResolvedValue({ ...dbUser });

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword, newPassword })
          .expect(200);

        expect(response.body.message).toBe('Password changed successfully.');
      });

      it('should hash the new password', async () => {
        const token = generateTestToken(regularUser);
        const currentPassword = 'OldPassword1';
        const newPassword = 'NewPassword1';
        const hashedCurrent = await bcrypt.hash(currentPassword, 10);
        const dbUser = { ...regularUser, password: hashedCurrent };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockResolvedValue({ ...dbUser });

        await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword, newPassword })
          .expect(200);

        // Verify the update was called with a hashed password
        const updateCall = mockPrismaUser.update.mock.calls[0][0];
        expect(updateCall.data.password).not.toBe(newPassword);
        // Verify it's a valid bcrypt hash of the new password
        const isValidHash = await bcrypt.compare(newPassword, updateCall.data.password);
        expect(isValidHash).toBe(true);
      });
    });

    describe('validation errors', () => {
      it('should return 400 when currentPassword is missing', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({ newPassword: 'NewPassword1' })
          .expect(400);

        expect(response.body.error).toContain('Missing required fields');
        expect(response.body.details.missing).toContain('currentPassword');
      });

      it('should return 400 when newPassword is missing', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword: 'OldPassword1' })
          .expect(400);

        expect(response.body.error).toContain('Missing required fields');
        expect(response.body.details.missing).toContain('newPassword');
      });

      it('should return 400 for weak new password', async () => {
        const token = generateTestToken(regularUser);
        const hashedCurrent = await bcrypt.hash('OldPassword1', 10);
        const dbUser = { ...regularUser, password: hashedCurrent };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            currentPassword: 'OldPassword1',
            newPassword: 'weak',
          })
          .expect(400);

        expect(response.body.error).toContain('Password must be at least 8 characters');
      });

      it('should return 400 when new password is same as current', async () => {
        const token = generateTestToken(regularUser);
        const password = 'SamePassword1';
        const hashedPassword = await bcrypt.hash(password, 10);
        const dbUser = { ...regularUser, password: hashedPassword };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            currentPassword: password,
            newPassword: password,
          })
          .expect(400);

        expect(response.body.error).toContain('New password must be different');
      });
    });

    describe('authentication errors', () => {
      it('should return 403 with wrong current password', async () => {
        const token = generateTestToken(regularUser);
        const hashedCurrent = await bcrypt.hash('RealPassword1', 10);
        const dbUser = { ...regularUser, password: hashedCurrent };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            currentPassword: 'WrongPassword1',
            newPassword: 'NewPassword1',
          })
          .expect(403);

        expect(response.body.error).toBe('Invalid current password.');
      });
    });

    describe('authorization', () => {
      it('should allow admin to change any user password', async () => {
        const token = generateTestToken(adminUser);
        const hashedCurrent = await bcrypt.hash('UserPassword1', 10);
        const dbUser = { ...regularUser, password: hashedCurrent };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockResolvedValue({ ...dbUser });

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            currentPassword: 'UserPassword1',
            newPassword: 'NewPassword1',
          })
          .expect(200);

        expect(response.body.message).toBe('Password changed successfully.');
      });

      it('should return 403 when changing another user password', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post(`/users/${anotherUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            currentPassword: 'OldPassword1',
            newPassword: 'NewPassword1',
          })
          .expect(403);

        expect(response.body.error).toContain('does not have permission');
      });
    });

    describe('error handling', () => {
      it('should return 404 for non-existent user', async () => {
        const token = generateTestToken(adminUser);
        mockPrismaUser.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .post('/users/999/password')
          .set('Authorization', `Bearer ${token}`)
          .send({
            currentPassword: 'OldPassword1',
            newPassword: 'NewPassword1',
          })
          .expect(404);

        expect(response.body.error).toBe('User not found.');
      });

      it('should return 500 on database error', async () => {
        const token = generateTestToken(regularUser);
        const hashedCurrent = await bcrypt.hash('OldPassword1', 10);
        const dbUser = { ...regularUser, password: hashedCurrent };

        mockPrismaUser.findUnique.mockResolvedValue(dbUser);
        mockPrismaUser.update.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .post(`/users/${regularUser.id}/password`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            currentPassword: 'OldPassword1',
            newPassword: 'NewPassword1',
          })
          .expect(500);

        expect(response.body.error).toBe('Failed to change password.');
      });
    });
  });

  describe('Security considerations', () => {
    it('should never return password in any response', async () => {
      const token = generateTestToken(adminUser);

      // Test GET /profile
      mockPrismaUser.findUnique.mockResolvedValue({
        ...regularUser,
        password: 'secretPassword',
      });

      const profileResponse = await request(app)
        .get('/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(profileResponse.body).not.toHaveProperty('password');

      // Test GET /users
      mockPrismaUser.findMany.mockResolvedValue([
        { ...regularUser, password: 'secretPassword' },
      ]);

      const usersResponse = await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${token}`);

      usersResponse.body.forEach((user: any) => {
        expect(user).not.toHaveProperty('password');
      });

      // Test PUT /users/:id
      mockPrismaUser.findUnique.mockResolvedValue({
        ...regularUser,
        password: 'secretPassword',
      });
      mockPrismaUser.update.mockResolvedValue({
        ...regularUser,
        name: 'Updated',
        password: 'secretPassword',
      });

      const updateResponse = await request(app)
        .put(`/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(updateResponse.body.user).not.toHaveProperty('password');
    });

    it('should validate JWT signature', async () => {
      // Token signed with different secret
      const fakeToken = jwt.sign(regularUser, 'wrong-secret', { expiresIn: '1h' });

      const response = await request(app)
        .get('/profile')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });
});
