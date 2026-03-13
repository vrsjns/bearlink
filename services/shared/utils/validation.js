const validator = require('validator');

/**
 * Validates email format using validator.isEmail()
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if valid email format
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return validator.isEmail(email);
};

/**
 * Validates password strength: min 8 chars, uppercase, lowercase, number
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password meets requirements
 */
const isValidPassword = (password) => {
  if (!password || typeof password !== 'string') {
    return false;
  }
  if (password.length < 8) {
    return false;
  }
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasUppercase && hasLowercase && hasNumber;
};

/**
 * Validates URL format and ensures only http: or https: protocols
 * @param {string} urlString - URL to validate
 * @returns {boolean} - True if valid URL with safe protocol
 */
const isValidUrl = (urlString) => {
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Validates URL is safe for redirects (blocks javascript:, data:, etc.)
 * @param {string} urlString - URL to validate
 * @returns {boolean} - True if safe for redirect
 */
const isSafeRedirectUrl = (urlString) => {
  return isValidUrl(urlString);
};

/**
 * Validates that required fields are present in an object
 * @param {object} obj - Object to validate
 * @param {string[]} fields - Array of required field names
 * @returns {{isValid: boolean, missing: string[]}} - Validation result
 */
const validateRequiredFields = (obj, fields) => {
  const missing = [];
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }
  return {
    isValid: missing.length === 0,
    missing,
  };
};

/**
 * Sends a standardized 400 validation error response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {object} [details] - Optional error details
 */
const validationError = (res, message, details = null) => {
  const response = { error: message };
  if (details) {
    response.details = details;
  }
  return res.status(400).json(response);
};

/**
 * Validates name: 1-100 characters after trim
 * @param {string} name - Name to validate
 * @returns {boolean} - True if valid name
 */
const isValidName = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
};

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidUrl,
  isSafeRedirectUrl,
  isValidName,
  validateRequiredFields,
  validationError,
};
