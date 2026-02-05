/**
 * Producción Escrita C2 - Backend API
 * Servidor Express con SQLite
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Importar rutas
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const submissionsRoutes = require('./routes/submissions');

// Crear aplicación Express
const app = express();

// Configuración
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_TEST = NODE_ENV === 'test';

// Middleware de seguridad
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS - permitir frontend
const corsOptions = {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://elcorreveidile.github.io'
    ],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting (deshabilitado en tests para evitar handles abiertos)
if (!IS_TEST) {
    const limiter = rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 peticiones por ventana
        message: {
            success: false,
            error: 'Demasiadas peticiones. Intenta de nuevo más tarde.'
        },
        standardHeaders: true,
        legacyHeaders: false
    });
    app.use('/api/', limiter);

    // Rate limiting más estricto para autenticación
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutos
        max: 10, // 10 intentos
        message: {
            success: false,
            error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.'
        }
    });
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
}

// Logging
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Parsear JSON y formularios
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/submissions', submissionsRoutes);

// Ruta de health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'API funcionando correctamente',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV
    });
});

// Información del curso (pública)
app.get('/api/course', (req, res) => {
    res.json({
        success: true,
        data: {
            name: 'Producción Escrita C2',
            institution: 'Centro de Lenguas Modernas - Universidad de Granada',
            professor: 'Javier Benítez Láinez',
            email: 'benitezl@go.ugr.es',
            year: '2025-2026',
            sessions: 27,
            duration: '90 minutos',
            schedule: 'Martes y Jueves',
            startDate: '2026-02-03',
            endDate: '2026-05-21'
        }
    });
});

// Servir archivos estáticos del frontend en producción
if (NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../../')));

    // SPA fallback - servir index.html para rutas no encontradas
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
            return next();
        }
        res.sendFile(path.join(__dirname, '../../index.html'));
    });
}

// Middleware de manejo de errores 404
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Recurso no encontrado',
        path: req.path
    });
});

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
    console.error('Error:', err);

    // Errores de validación de express-validator
    if (err.array && typeof err.array === 'function') {
        return res.status(400).json({
            success: false,
            error: 'Error de validación',
            details: err.array()
        });
    }

    // Error de JSON malformado
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            error: 'JSON inválido en el cuerpo de la petición'
        });
    }

    // Error genérico
    res.status(err.status || 500).json({
        success: false,
        error: NODE_ENV === 'development' ? err.message : 'Error interno del servidor'
    });
});

// Iniciar servidor solo si se ejecuta directamente (evita escuchar durante tests)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════╗
║   Producción Escrita C2 - API Backend                  ║
║   Centro de Lenguas Modernas - UGR                     ║
╠════════════════════════════════════════════════════════╣
║   Servidor iniciado en: http://localhost:${PORT}          ║
║   Entorno: ${NODE_ENV.padEnd(44)}║
║   Fecha: ${new Date().toLocaleString('es-ES').padEnd(46)}║
╚════════════════════════════════════════════════════════╝
        `);
    });
}

module.exports = app;
