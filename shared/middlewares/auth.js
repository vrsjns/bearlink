const jwt = require('jsonwebtoken');
const logger = require('shared/utils/logger');

const ROLES = {
    ADMIN: 'ADMIN',
    USER: 'USER'
};

const authenticateJWT = (req, res, next) => {
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (token) {
        return jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
            if (err) {
                logger.error(err.message);
                return res.status(403).json({ error: err.message });
            }

            req.user = user;
            return next();
        });
    }

    const message = 'Missing authorization token';
    logger.warn(message);
    return res.status(401).json({ error: message });
};

// Middleware to check for admin role
const isAdmin = (req, res, next) => {
    if (req.user.role !== ROLES.ADMIN) {
        const message = 'User does not have admin role';
        logger.warn(message);
        return res.status(403).json({ error: message });
    }

    return next();
};

// Middleware to check if the user is accessing their own data
const isSelfOrAdmin = (req, res, next) => {
    if (req.user.role !== ROLES.ADMIN && req.user.id !== parseInt(req.params.userId)) {
        const message = 'User does not have permission to access this resource';
        logger.warn(message);
        return res.status(403).json({ error: message });
    }

    return next();
};

module.exports = {
    authenticateJWT,
    isAdmin,
    isSelfOrAdmin,
};
