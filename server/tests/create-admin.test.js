const bcrypt = require('bcryptjs');
const request = require('supertest');
const express = require('express');
const { createAdmin } = require('../scripts/create-admin');

const env = { ADMIN_EMAIL: ' TEST@example.com ', ADMIN_PASSWORD: 'new-admin-password-123' };
let prisma;
beforeEach(() => {
  prisma = { user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    session: { create: jest.fn().mockResolvedValue({}) } };
});

test('creates a normalized active admin whose password works with the login endpoint', async () => {
  await createAdmin(prisma, env);
  const user = prisma.user.create.mock.calls[0][0].data;
  expect(user).toMatchObject({ email: 'test@example.com', role: 'admin', active: true });
  expect(user.passwordHash).not.toBe(env.ADMIN_PASSWORD);
  expect(bcrypt.getRounds(user.passwordHash)).toBe(12);
  prisma.user.findUnique.mockResolvedValue({ id: 'admin-id', ...user });
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../routes/api-auth')(prisma));
  const response = await request(app).post('/auth/login').send({ email: user.email, password: env.ADMIN_PASSWORD });
  expect(response.status).toBe(200);
  expect(response.body.user.role).toBe('admin');
  expect(response.body.token).toBeTruthy();
});

test.each(['short', ' leading-password-123', 'trailing-password-123 ', 'x'.repeat(73), 'ก'.repeat(25)])('rejects an invalid password before database access: %s', async (password) => {
  await expect(createAdmin(prisma, { ...env, ADMIN_PASSWORD: password })).rejects.toThrow('ADMIN_PASSWORD');
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.user.create).not.toHaveBeenCalled();
});

test('rejects invalid email before creating a user', async () => {
  await expect(createAdmin(prisma, { ...env, ADMIN_EMAIL: 'invalid' })).rejects.toThrow('email');
  expect(prisma.user.create).not.toHaveBeenCalled();
});

test('repeat setup succeeds only for the same active admin and password', async () => {
  const existing = { role: 'admin', active: true, passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 4) };
  prisma.user.findUnique.mockResolvedValue(existing);
  await expect(createAdmin(prisma, env)).resolves.toContain('already exists');
  await expect(createAdmin(prisma, { ...env, ADMIN_PASSWORD: 'different-password-123' })).rejects.toThrow('already exists');
  prisma.user.findUnique.mockResolvedValue({ ...existing, role: 'receptionist' });
  await expect(createAdmin(prisma, env)).rejects.toThrow('already exists');
  prisma.user.findUnique.mockResolvedValue({ ...existing, active: false });
  await expect(createAdmin(prisma, env)).rejects.toThrow('already exists');
  expect(prisma.user.create).not.toHaveBeenCalled();
});
