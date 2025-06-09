const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Путь к файлу базы данных SQLite
const dbPath = path.resolve(process.env.DB_PATH || './map4.db');

console.log('SQLite database path:', dbPath);

// Создаем подключение к базе данных
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        // Создаем таблицы, если они еще не существуют
        db.run(`CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT DEFAULT 'user',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating Users table:', err);
        });

        db.run(`CREATE TABLE IF NOT EXISTS MapObjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            coordinates TEXT NOT NULL,
            properties TEXT,
            created_by INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES Users(id)
        )`, (err) => {
            if (err) console.error('Error creating MapObjects table:', err);
        });

        db.run(`CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            file_name TEXT NOT NULL,
            file_content TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES Users(id)
        )`, (err) => {
            if (err) console.error('Error creating files table:', err);
        });

        db.run(`CREATE TABLE IF NOT EXISTS student_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            answers TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
            UNIQUE(user_id)
        )`, (err) => {
            if (err) console.error('Error creating student_answers table:', err);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_mapobjects_type ON MapObjects(type)`, (err) => {
            if (err) console.error('Error creating index idx_mapobjects_type:', err);
        });
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON Users(username)`, (err) => {
            if (err) console.error('Error creating index idx_users_username:', err);
        });
    }
});

// Функция для выполнения запросов
async function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
}

module.exports = {
    runQuery,
    run,
    db
};