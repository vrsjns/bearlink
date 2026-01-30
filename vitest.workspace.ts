import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'auth-service',
  'url-service',
  'analytics-service',
  'notification-service',
  'shared',
  'web-ui',
]);
