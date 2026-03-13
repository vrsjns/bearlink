import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'services/auth',
  'services/url',
  'services/analytics',
  'services/notification',
  'services/shared',
  'frontend/web-ui',
]);
