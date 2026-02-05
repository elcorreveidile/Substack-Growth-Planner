/**
 * Rutas de autenticación
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/db');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 */
router.post('/register', [
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    body('name').trim().isLength({ min: 2 }).withMessage('El nombre debe tener al menos 2 caracteres'),
    body('level').optional().isIn(['C2-8', 'C2-9', 'C2']).withMessage('Nivel inválido')
], async (req, res) => {
    try {
        // Validar entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, name, level, motivation } = req.body;
        const db = getDb();

        // Verificar si el email ya existe
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Este email ya está registrado' });
        }

        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar usuario
        const result = db.prepare(`
            INSERT INTO users (email, password, name, level, motivation)
            VALUES (?, ?, ?, ?, ?)
        `).run(email, hashedPassword, name, level || 'C2', motivation || null);

        const userId = result.lastInsertRowid;

        // Generar token
        const token = generateToken(userId);

        // Crear notificación de bienvenida
        db.prepare(`
            INSERT INTO notifications (user_id, type, title, message)
            VALUES (?, 'welcome', 'Bienvenido/a al curso', 'Te has registrado correctamente en el curso de Producción Escrita C2. El curso comienza el 2 de febrero de 2026.')
        `).run(userId);

        res.status(201).json({
            message: 'Usuario registrado correctamente',
            user: {
                id: userId,
                email,
                name,
                level: level || 'C2',
                role: 'student'
            },
            token
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});

/**
 * POST /api/auth/login
 * Iniciar sesión
 */
router.post('/login', [
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Contraseña requerida')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;
        const db = getDb();

        // Buscar usuario
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        }

        if (!user.active) {
            return res.status(403).json({ error: 'Cuenta desactivada' });
        }

        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        }

        // Actualizar último login
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

        // Generar token
        const token = generateToken(user.id);

        res.json({
            message: 'Sesión iniciada correctamente',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                level: user.level,
                role: user.role
            },
            token
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

/**
 * GET /api/auth/me
 * Obtener usuario actual
 */
router.get('/me', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare(`
            SELECT id, email, name, role, level, motivation, created_at, last_login
            FROM users WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Contar entregas y notificaciones no leídas
        const stats = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM submissions WHERE user_id = ?) as submissions_count,
                (SELECT COUNT(*) FROM submissions WHERE user_id = ? AND status = 'reviewed') as reviewed_count,
                (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0) as unread_notifications
        `).get(req.user.id, req.user.id, req.user.id);

        res.json({
            ...user,
            stats
        });

    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: 'Error al obtener información del usuario' });
    }
});

/**
 * PUT /api/auth/password
 * Cambiar contraseña
 */
router.put('/password', authenticateToken, [
    body('currentPassword').notEmpty().withMessage('Contraseña actual requerida'),
    body('newPassword').isLength({ min: 6 }).withMessage('La nueva contraseña debe tener al menos 6 caracteres')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { currentPassword, newPassword } = req.body;
        const db = getDb();

        // Obtener usuario con contraseña
        const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

        // Verificar contraseña actual
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        // Hash de nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Actualizar contraseña
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);

        res.json({ message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

/**
 * PUT /api/auth/profile
 * Actualizar perfil
 */
router.put('/profile', authenticateToken, [
    body('name').optional().trim().isLength({ min: 2 }).withMessage('Nombre inválido'),
    body('motivation').optional().trim()
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, motivation } = req.body;
        const db = getDb();

        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (motivation !== undefined) {
            updates.push('motivation = ?');
            params.push(motivation);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No hay datos para actualizar' });
        }

        params.push(req.user.id);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

        res.json({ message: 'Perfil actualizado correctamente' });

    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

module.exports = router;
