const { runQuery, run, db } = require('../config/database');

// Операции с пользователями
async function createUser(username, hashedPassword) {
    const result = await run(
        'INSERT INTO Users (username, password) VALUES (?, ?)',
        [username, hashedPassword]
    );
    return result.id;
}

async function getUserByUsername(username) {
    const rows = await runQuery(
        'SELECT * FROM Users WHERE username = ?',
        [username]
    );
    return rows[0];
}

async function getUserByEmail(email) {
    const rows = await runQuery(
        'SELECT * FROM Users WHERE email = ?',
        [email]
    );
    return rows[0];
}

async function getUserById(id) {
    const rows = await runQuery('SELECT * FROM Users WHERE id = ?', [id]);
    return rows[0];
}

async function updateUserLastLogin(userId) {
    const now = new Date().toISOString();
    return await run('UPDATE Users SET last_login = ? WHERE id = ?', [now, userId]);
}

async function updateUserRole(userId, role) {
    const sql = 'UPDATE Users SET role = ? WHERE id = ?';
    return await run(sql, [role, userId]);
}

async function updateUserPassword(userId, hashedPassword) {
    return await run('UPDATE Users SET password = ? WHERE id = ?', [hashedPassword, userId]);
}

// Операции с объектами карты
async function saveMapObject(userId, name, type, coordinates, properties) {
    const result = await run(
        'INSERT INTO MapObjects (name, type, coordinates, properties, created_by) VALUES (?, ?, ?, ?, ?)',
        [name, type, JSON.stringify(coordinates), JSON.stringify(properties), userId]
    );
    return result.id;
}

async function getMapObjectsByUserId(userId) {
    return await runQuery('SELECT * FROM MapObjects WHERE created_by = ?', [userId]);
}

async function getAllMapObjects() {
    const rows = await runQuery(
        'SELECT m.*, u.username FROM MapObjects m JOIN Users u ON m.created_by = u.id'
    );
    return rows;
}

async function getFileByNameAndUser(userId, fileName) {
    // Только file_name, не пробуем file
    const query = 'SELECT * FROM files WHERE user_id = ? AND file_name = ?';
    const rows = await runQuery(query, [userId, fileName]);
    console.log(`Поиск файла ${fileName} для пользователя с ID ${userId}`);
    console.log('Результат поиска файла:', rows[0] ? 'файл найден' : 'файл не найден');
    return rows[0];
}

async function deleteFile(userId, fileName) {
    console.log(`Удаление файла ${fileName} для пользователя с ID ${userId}`);
    const query = 'DELETE FROM files WHERE user_id = ? AND file_name = ?';
    const result = await run(query, [userId, fileName]);
    console.log(`Удалено записей: ${result.changes}`);
    return result;
}

// Исправленный saveFile для поддержки разных схем таблицы files
async function saveFile(userId, fileName, geojsonData) {
    // Пробуем сохранить в таблицу files с разными схемами
    try {
        const query = 'INSERT OR REPLACE INTO files (user_id, file_name, file_content) VALUES (?, ?, ?)';
        return await run(query, [userId, fileName, JSON.stringify(geojsonData)]);
    } catch (e) {
        // Если не удалось, пробуем альтернативную схему
        const query2 = 'INSERT OR REPLACE INTO files (user_id, file, data) VALUES (?, ?, ?)';
        return await run(query2, [userId, fileName, JSON.stringify(geojsonData)]);
    }
}

// Исправленный getFilesByUserId для поддержки разных схем таблицы files
async function getFilesByUserId(userId) {
    // Запрашиваем только file_name
    let rows = await runQuery('SELECT file_name FROM files WHERE user_id = ?', [userId]);
    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }
    return rows.map(r => r.file_name).filter(f => typeof f === 'string' && f.length > 0);
}

async function cleanupFilesWithoutFile() {
    return new Promise((resolve, reject) => {
        run(`DELETE FROM files WHERE file IS NULL OR file = '' OR file = '11' OR file = '123' OR file = '352345' OR file = '1233' OR file = 'undefined'`, [], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
}

async function getAllUsers() {
    return await runQuery('SELECT * FROM Users');
}

async function deleteMapObject(id) {
    return await run('DELETE FROM MapObjects WHERE id = ?', [id]);
}

async function getFilesByUserId(userId) {
    console.log(`Получение списка файлов для пользователя с ID ${userId}`);
    const query = 'SELECT file_name, file_content, created_at FROM files WHERE user_id = ? ORDER BY created_at DESC';
    const rows = await runQuery(query, [userId]);
    console.log(`Найдено файлов: ${rows.length}`);
    return rows;
}

// Миграция для добавления столбца last_login
run('PRAGMA table_info(Users)', [], function(err, rows) {
    if (err) {
        console.error('Ошибка при проверке структуры таблицы Users:', err);
        return;
    }
    const hasLastLogin = rows.some(row => row.name === 'last_login');
    if (!hasLastLogin) {
        run('ALTER TABLE Users ADD COLUMN last_login TEXT', [], function(err) {
            if (err) {
                console.error('Ошибка при добавлении столбца last_login:', err);
            } else {
                console.log('Столбец last_login успешно добавлен в таблицу Users');
            }
        });
    } else {
        console.log('Столбец last_login уже существует в таблице Users');
    }
});

async function recreateDatabase() {
    return new Promise(async (resolve, reject) => {
        try {
            // Закрываем текущее соединение с базой данных
            db.close((err) => {
                if (err) {
                    console.error('Ошибка при закрытии базы данных:', err);
                    reject(err);
                    return;
                }
                console.log('Текущее соединение с базой данных закрыто.');

                // Удаляем файл базы данных
                const fs = require('fs');
                const path = require('path');
                const dbPath = path.join(__dirname, '../map4.db');
                if (fs.existsSync(dbPath)) {
                    fs.unlinkSync(dbPath);
                    console.log('Файл базы данных удален:', dbPath);
                } else {
                    console.log('Файл базы данных не найден, создаем новый:', dbPath);
                }

                // Создаем новое соединение и инициализируем базу данных
                const sqlite3 = require('sqlite3').verbose();
                const newDb = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        console.error('Ошибка при создании новой базы данных:', err);
                        reject(err);
                        return;
                    }
                    console.log('Новая база данных создана:', dbPath);
                });

                // Создаем таблицы
                newDb.serialize(() => {
                    newDb.run(`CREATE TABLE IF NOT EXISTS Users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT UNIQUE NOT NULL,
                        username TEXT UNIQUE,
                        password TEXT NOT NULL,
                        role TEXT DEFAULT 'user',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TEXT
                    )`);

                    newDb.run(`CREATE TABLE IF NOT EXISTS MapObjects (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        geojson TEXT NOT NULL,
                        created_by INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (created_by) REFERENCES Users(id)
                    )`);

                    newDb.run(`CREATE TABLE IF NOT EXISTS files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        file_name TEXT NOT NULL,
                        file_content TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES Users(id)
                    )`);

                    // Очищаем таблицу files от невалидных записей
                    newDb.run(`DELETE FROM files WHERE file_name IS NULL OR file_name = '' OR file_name = '11' OR file_name = '123' OR file_name = '352345' OR file_name = '1233' OR file_name = 'undefined' OR file_name LIKE 'undefined_%'`, [], function(err) {
                        if (err) {
                            console.error('Ошибка при очистке таблицы files:', err);
                        } else {
                            console.log('Таблица files очищена от невалидных записей');
                        }
                    });

                    console.log('Таблицы созданы в новой базе данных.');
                });

                // Закрываем новое соединение
                newDb.close((err) => {
                    if (err) {
                        console.error('Ошибка при закрытии новой базы данных:', err);
                        reject(err);
                        return;
                    }
                    console.log('Новое соединение с базой данных закрыто.');
                    resolve();
                });
            });
        } catch (error) {
            console.error('Ошибка при пересоздании базы данных:', error);
            reject(error);
        }
    });
}

async function clearAllSaves() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM files', [], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
}

// Добавить функцию создания пользователя по email
async function createUserByEmail(email, hashedPassword) {
    const result = await run(
        'INSERT INTO Users (email, username, password, role) VALUES (?, ?, ?, ?)',
        [email, email, hashedPassword, 'student']
    );
    return result.id;
}

// Получить всех файлов для админа
async function getAllFiles() {
    // Запрашиваем только file_name, не пробуем file
    let rows = await runQuery('SELECT file_name FROM files');
    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }
    return rows.map(r => r.file_name).filter(f => typeof f === 'string' && f.length > 0);
}

// Заглушка для getTeacherBySchoolNumber
async function getTeacherBySchoolNumber() {
    return null;
}

// Заглушка для getStudentsBySchoolNumber
async function getStudentsBySchoolNumber() {
    return [];
}

module.exports = {
    run,
    runQuery,
    createUser,
    getUserByUsername,
    getUserByEmail,
    getUserById,
    updateUserPassword,
    updateUserRole,
    getAllUsers,
    saveMapObject,
    getAllMapObjects,
    getMapObjectsByUserId,
    deleteMapObject,
    saveFile,
    getFilesByUserId,
    getFileByNameAndUser,
    deleteFile,
    cleanupFilesWithoutFile,
    updateUserLastLogin,
    recreateDatabase,
    clearAllSaves,
    // новые функции
    createUserByEmail,
    getAllFiles,
    getTeacherBySchoolNumber,
    getStudentsBySchoolNumber
};