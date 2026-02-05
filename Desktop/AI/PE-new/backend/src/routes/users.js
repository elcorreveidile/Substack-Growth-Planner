/**
 * Rutas de usuarios (admin)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/users
 * Listar usuarios (solo admin)
 */
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const { role, active } = req.query;

        let whereClause = [];
        let params = [];

        if (role) {
            whereClause.push('role = ?');
            params.push(role);
        }

        if (active !== undefined) {
            whereClause.push('active = ?');
            params.push(active === 'true' ? 1 : 0);
        }

        const whereSQL = whereClause.length > 0 ? 'WHERE ' + whereClause.join(' AND ') : '';

        const users = db.prepare(`
            SELECT
                u.id, u.email, u.name, u.role, u.level, u.active, u.created_at, u.last_login,
                (SELECT COUNT(*) FROM submissions WHERE user_id = u.id) as submissions_count,
                (SELECT COUNT(*) FROM submissions WHERE user_id = u.id AND status = 'reviewed') as reviewed_count
            FROM users u
            ${whereSQL}
            ORDER BY u.created_at DESC
        `).all(...params);

        res.json(users);

    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: 'Error al listar usuarios' });
    }
});

/**
 * GET /api/users/:id
 * Obtener usuario específico (solo admin)
 */
router.get('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const userId = req.params.id;

        const user = db.prepare(`
            SELECT id, email, name, role, level, motivation, active, created_at, last_login
            FROM users WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Obtener entregas del usuario
        const submissions = db.prepare(`
            SELECT s.*, f.grade
            FROM submissions s
            LEFT JOIN feedback f ON s.id = f.submission_id
            WHERE s.user_id = ?
            ORDER BY s.created_at DESC
        `).all(userId);

        // Obtener progreso
        const progress = db.prepare(`
            SELECT * FROM student_progress WHERE user_id = ?
        `).all(userId);

        res.json({
            ...user,
            submissions,
            progress
        });

    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

/**
 * PUT /api/users/:id
 * Actualizar usuario (solo admin)
 */
router.put('/:id', authenticateToken, requireAdmin, [
    body('name').optional().trim().isLength({ min: 2 }),
    body('level').optional().isString(),
    body('role').optional().isIn(['student', 'admin']),
    body('active').optional().isBoolean()
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const db = getDb();
        const userId = req.params.id;
        const { name, level, role, active } = req.body;

        // Verificar que el usuario existe
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const updates = [];
        const params = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (level) { updates.push('level = ?'); params.push(level); }
        if (role) { updates.push('role = ?'); params.push(role); }
        if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No hay datos para actualizar' });
        }

        params.push(userId);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

        res.json({ message: 'Usuario actualizado correctamente' });

    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

/**
 * PUT /api/users/:id/password
 * Cambiar contraseña de usuario (solo admin)
 */
router.put('/:id/password', authenticateToken, requireAdmin, [
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const db = getDb();
        const userId = req.params.id;
        const { password } = req.body;

        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);

        res.json({ message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

/**
 * DELETE /api/users/:id
 * Eliminar usuario (solo admin)
 */
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const userId = req.params.id;

        // No permitir que admin se elimine a sí mismo
        if (userId == req.user.id) {
            return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
        }

        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(userId);

        res.json({ message: 'Usuario eliminado correctamente' });

    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

/**
 * GET /api/users/stats/overview
 * Estadísticas de usuarios (solo admin)
 */
router.get('/stats/overview', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();

        const stats = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) as students,
                SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
                SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active
            FROM users
        `).get();

        const byLevel = db.prepare(`
            SELECT level, COUNT(*) as count
            FROM users
            WHERE role = 'student'
            GROUP BY level
        `).all();

        const recentRegistrations = db.prepare(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= date('now', '-30 days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `).all();

        res.json({
            stats,
            byLevel,
            recentRegistrations
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

module.exports = router;
