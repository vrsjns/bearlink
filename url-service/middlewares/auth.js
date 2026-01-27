const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticateJWT = (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];

    if (token) {
        return jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
            if (err) {
                return res.sendStatus(403);
            }

            // Fetch the full user details including the role from the database
            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
            if (!dbUser) {
                return res.sendStatus(403);
            }

            req.user = dbUser;
            return next();
        });
    }

    return res.sendStatus(401);
};

// Middleware to check for admin role
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.sendStatus(403);
    }

    return next();
};

// Middleware to check if the user is accessing their own data
const isSelfOrAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN' && req.user.id !== parseInt(req.params.userId)) {
        return res.sendStatus(403);
    }

    return next();
};

module.exports = {
    authenticateJWT,
    isAdmin,
    isSelfOrAdmin,
};
