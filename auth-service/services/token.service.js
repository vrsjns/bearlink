const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object with id, email, name, role
 * @returns {string} JWT token
 */
const generateToken = (user) => jwt.sign(
  { id: user.id, email: user.email, name: user.name, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
);

/**
 * Remove password from user object
 * @param {Object} user - User object with password
 * @returns {Object} User object without password
 */
const sanitizeUser = (user) => {
  const { password, ...sanitized } = user;
  return sanitized;
};

module.exports = {
  generateToken,
  sanitizeUser,
};
