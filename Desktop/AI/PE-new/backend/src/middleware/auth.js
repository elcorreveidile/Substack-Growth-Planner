/**
 * Middleware de autenticación JWT
 */

const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';

/**
 * Verificar token JWT
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expirado' });
            }
            return res.status(403).json({ error: 'Token inválido' });
        }

        // Verificar que el usuario aún existe y está activo
        const db = getDb();
        const user = db.prepare('SELECT id, email, name, role, active FROM users WHERE id = ?').get(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }

        if (!user.active) {
            return res.status(403).json({ error: 'Cuenta desactivada' });
        }

        req.user = user;
        next();
    });
}

/**
 * Verificar que el usuario es administrador
 */
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso restringido a administradores' });
    }
    next();
}

/**
 * Middleware opcional - no bloquea si no hay token
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (!err) {
            const db = getDb();
            const user = db.prepare('SELECT id, email, name, role, active FROM users WHERE id = ?').get(decoded.userId);
            if (user && user.active) {
                req.user = user;
            }
        }
        next();
    });
}

/**
 * Generar token JWT
 */
function generateToken(userId) {
    return jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

module.exports = {
    authenticateToken,
    requireAdmin,
    optionalAuth,
    generateToken
};
