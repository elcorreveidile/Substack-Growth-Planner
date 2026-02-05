/**
 * Conexión a la base de datos SQLite
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || './data/database.sqlite';
const dbPath = path.resolve(__dirname, '../../', DB_PATH);

let db = null;

function getDb() {
    if (!db) {
        db = new Database(dbPath);
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
    }
    return db;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, closeDb };
