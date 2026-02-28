const LOCK_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const createLoginAttemptStore = () => {
  // email -> { count: number, lockedUntil: number | null }
  const store = new Map();

  const isLocked = (email) => {
    const entry = store.get(email);
    if (!entry || !entry.lockedUntil) return false;
    if (Date.now() < entry.lockedUntil) return true;
    // Lock expired — clean up so the counter resets
    store.delete(email);
    return false;
  };

  const recordFailedAttempt = (email) => {
    const entry = store.get(email) || { count: 0, lockedUntil: null };
    entry.count += 1;
    if (entry.count >= LOCK_THRESHOLD) {
      entry.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    store.set(email, entry);
  };

  const clearAttempts = (email) => {
    store.delete(email);
  };

  return { isLocked, recordFailedAttempt, clearAttempts };
};

module.exports = { createLoginAttemptStore };
