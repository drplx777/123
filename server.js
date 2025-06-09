require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

const db = require('./models/db');

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://0.0.0.0:3000',
        process.env.FRONTEND_URL || 'http://localhost:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());
app.use(cookieParser());

// Обслуживание статических файлов frontend
app.use(express.static(path.join(__dirname, 'front')));

// Middleware для логирования всех запросов
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Cookies:', JSON.stringify(req.cookies, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    next();
});

// Middleware для проверки JWT
async function authenticateToken(req, res, next) {
    console.log('[AUTH] Проверка токена аутентификации');
    const token = req.cookies.token;
    if (!token) {
        console.log('[AUTH] Токен отсутствует в cookies');
        return res.status(401).json({ error: 'Требуется аутентификация' });
    }

    try {
        console.log('[AUTH] Проверка токена:', token);
        const secret = process.env.JWT_SECRET || 'my-secret-key-please-change-me';
        const decoded = jwt.verify(token, secret);
        console.log('[AUTH] Токен декодирован:', decoded);
        const user = await db.getUserByEmail(decoded.email);
        if (!user) {
            console.log('[AUTH] Пользователь не найден:', decoded.email);
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        req.user = { id: user.id, email: user.email, role: user.role, isAdmin: user.role === 'admin' };
        console.log('[AUTH] Пользователь аутентифицирован:', req.user);
        next();
    } catch (error) {
        console.error('[AUTH] Ошибка проверки токена:', error);
        return res.status(403).json({ error: 'Недействительный токен' });
    }
}

// Middleware для проверки прав администратора
function isAdmin(req, res, next) {
    if (!req.user.isAdmin && req.user.email !== 'admin') {
        console.log('Доступ запрещен для пользователя:', req.user.email);
        return res.status(403).json({ error: 'Требуются права администратора' });
    }
    console.log('Доступ администратора разрешен для:', req.user.email);
    next();
}

// Middleware для проверки прав администратора или учителя
function isAdminOrTeacher(req, res, next) {
    if (!req.user.isAdmin && req.user.role !== 'teacher' && req.user.email !== 'admin') {
        console.log('Доступ запрещен для пользователя:', req.user.email, 'роль:', req.user.role);
        return res.status(403).json({ error: 'Требуются права администратора или учителя' });
    }
    console.log('Доступ администратора/учителя разрешен для:', req.user.email, 'роль:', req.user.role);
    next();
}

// Регистрация
app.post('/register', async (req, res) => {
    console.log('Запрос на регистрацию получен:', req.body);
    const { email, password } = req.body;
    
    if (!email || !password) {
        console.log('Ошибка: отсутствует email или пароль');
        return res.status(400).json({ error: 'Требуются email и пароль' });
    }

    // Проверка действительности email с помощью quickemailverification
    try {
        console.log('Проверка действительности email...');
        const quickemailverification = require('quickemailverification').client('API_KEY').quickemailverification(); // Замените API_KEY на ваш ключ API
        const verificationResult = await new Promise((resolve, reject) => {
            quickemailverification.verify(email, function (err, response) {
                if (err) {
                    reject(err);
                } else {
                    resolve(response.body);
                }
            });
        });

        if (!verificationResult.result || verificationResult.result !== 'valid') {
            console.log('Недействительный email:', email);
            // Теперь не возвращаем ошибку, а просто логируем
            // return res.status(400).json({ error: 'Недействительный email-адрес' });
        } else {
            console.log('Email действителен:', email);
        }
    } catch (error) {
        console.error('Ошибка проверки email:', error);
        // Можно решить, продолжать ли регистрацию при ошибке проверки
        // В данном случае продолжаем, но логируем ошибку
    }

    try {
        console.log('Проверка существующего пользователя...');
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            console.log('Пользователь уже существует:', email);
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        console.log('Хеширование пароля...');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('Создание нового пользователя...');
        const userId = await db.createUserByEmail(email, hashedPassword);
        // Устанавливаем роль student для новых пользователей
        await db.updateUserRole(userId, 'student');
        
        console.log('Генерация JWT токена...');
        const secret = process.env.JWT_SECRET || 'my-secret-key-please-change-me';
        const token = jwt.sign({ email }, secret, { expiresIn: '24h' });
        
        console.log('Установка cookie...');
        res.cookie('token', token, { 
            httpOnly: false,
            secure: false,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            path: '/',
            domain: '127.0.0.1'
        });
        console.log('Отправка успешного ответа...');
        res.json({ message: 'Регистрация успешна', email });
    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/login', async (req, res) => {
    console.log('Запрос на вход получен:', req.body);
    const { email, password } = req.body;

    try {
        console.log('Поиск пользователя...');
        const user = await db.getUserByEmail(email);
        if (!user) {
            console.log('Пользователь не найден:', email);
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        console.log('Проверка пароля...');
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Неверный пароль для пользователя:', email);
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        console.log('Обновление времени последнего входа...');
        await db.updateUserLastLogin(user.id);

        console.log('Генерация JWT токена...');
        const secret = process.env.JWT_SECRET || 'my-secret-key-please-change-me';
        const token = jwt.sign({ email }, secret, { expiresIn: '24h' });
        
        console.log('Установка cookie...');
        res.cookie('token', token, { 
            httpOnly: false,
            secure: false,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            path: '/',
            domain: '127.0.0.1'
        });
        
        console.log('Отправка успешного ответа...');
        res.json({ 
            message: 'Вход выполнен успешно', 
            email,
            isAdmin: user.role === 'admin'
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Сохранение файла
app.post('/save', authenticateToken, async (req, res) => {
    try {
        console.log('Запрос на сохранение файла от пользователя:', req.user.email);
        const { fileName, geojsonData } = req.body;
        if (!fileName || !geojsonData) {
            console.log('Ошибка: fileName или geojsonData отсутствуют в запросе', req.body);
            return res.status(400).json({ error: 'fileName и geojsonData обязательны' });
        }

        // Проверка валидности имени файла
        if (fileName === '11' || fileName === '123' || fileName === '352345' || 
            fileName === '1233' || fileName === 'undefined' || fileName.startsWith('undefined_')) {
            console.log('Ошибка: недопустимое имя файла:', fileName);
            return res.status(400).json({ error: 'Недопустимое имя файла' });
        }

        console.log('Сохранение файла с именем:', fileName);
        console.log('Данные GeoJSON для сохранения:', geojsonData);
        const userId = req.user.id;
        await db.saveFile(userId, fileName, geojsonData);
        console.log(`Файл ${fileName} успешно сохранен для пользователя ${req.user.email} с ID ${userId}`);
        res.json({ message: 'Файл успешно сохранен' });
    } catch (error) {
        console.error('Ошибка при сохранении файла:', error);
        res.status(500).json({ error: 'Ошибка сервера при сохранении файла' });
    }
});

// Загрузка файла
app.get('/load/:fileName', authenticateToken, async (req, res) => {
    try {
        console.log('Запрос на загрузку файла от пользователя:', req.user.email);
        const fileName = req.params.fileName;
        const userId = req.user.id;

        console.log(`Поиск файла ${fileName} для пользователя ${req.user.email} (ID: ${userId})`);
        const fileData = await db.getFileByNameAndUser(userId, fileName);
        
        if (!fileData) {
            console.log(`Файл ${fileName} не найден для пользователя ${req.user.email}`);
            return res.status(404).json({ error: 'Файл не найден' });
        }

        console.log('Данные файла найдены:', fileData);
        let geojsonData = fileData.file_content;
        
        // Проверяем, является ли file_content строкой, и если да, преобразуем в объект
        if (typeof geojsonData === 'string') {
            try {
                geojsonData = JSON.parse(geojsonData);
                console.log(`Данные файла ${fileName} преобразованы из строки в объект`);
            } catch (e) {
                console.error(`Ошибка при парсинге данных файла ${fileName}:`, e);
                return res.status(500).json({ error: 'Ошибка формата данных файла' });
            }
        }

        console.log(`Файл ${fileName} успешно загружен для пользователя ${req.user.email}`);
        res.json(geojsonData);
    } catch (error) {
        console.error('Ошибка при загрузке файла:', error);
        res.status(500).json({ error: 'Ошибка сервера при загрузке файла' });
    }
});

// Список файлов
app.get('/files', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;

    try {
        const files = await db.getFilesByUserId(userId);
        console.log('Запрос списка файлов от пользователя:', req.user.email);
        console.log('Найдено файлов:', files.length);

        res.json(files);
    } catch (error) {
        console.error('Ошибка получения списка файлов:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении списка файлов' });
    }
});

// Получение списка всех файлов (для админа и учителя)
app.get('/admin/files', authenticateToken, isAdminOrTeacher, async (req, res) => {
    console.log('Запрос списка всех файлов от администратора/учителя:', req.user.email);
    try {
        // Получаем всех пользователей и их файлы
        const { runQuery } = require('./config/database');
        const filesQuery = `
            SELECT u.email, f.file_name, f.created_at 
            FROM files f 
            JOIN Users u ON f.user_id = u.id 
            WHERE u.email IS NOT NULL AND u.email != '' AND f.file_name IS NOT NULL AND f.file_name != ''
            ORDER BY f.created_at DESC
        `;
        const allFiles = await runQuery(filesQuery);
        
        const files = allFiles.map(file => ({
            email: file.email,
            fileName: file.file_name,
            createdAt: file.created_at
        }));
        console.log('Список файлов успешно отправлен администратору/учителю:', files.length, 'файлов');
        res.json(files);
    } catch (error) {
        console.error('Ошибка получения списка файлов для админа/учителя:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении списка файлов' });
    }
});

// Загрузка файла любого пользователя (для админа и учителя)
app.get('/admin/load/:email/:fileName', authenticateToken, isAdminOrTeacher, async (req, res) => {
    const { email, fileName } = req.params;

    try {
        console.log(`Запрос на загрузку файла ${fileName} пользователя ${email} от администратора/учителя:`, req.user.email);
        
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const fileData = await db.getFileByNameAndUser(user.id, fileName);
        if (!fileData) {
            return res.status(404).json({ error: 'Файл не найден' });
        }

        let geojsonData = fileData.file_content;
        
        // Проверяем, является ли file_content строкой, и если да, преобразуем в объект
        if (typeof geojsonData === 'string') {
            try {
                geojsonData = JSON.parse(geojsonData);
            } catch (e) {
                console.error(`Ошибка при парсинге данных файла ${fileName}:`, e);
                return res.status(500).json({ error: 'Ошибка формата данных файла' });
            }
        }

        console.log(`Файл ${fileName} пользователя ${email} успешно загружен администратором/учителем`);
        res.json(geojsonData);
    } catch (error) {
        console.error('Ошибка загрузки файла администратором/учителем:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение информации о пользователе
app.get('/user/info', authenticateToken, async (req, res) => {
    try {
        const user = await db.getUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({
            email: user.email,
            role: user.role,
            isAdmin: user.role === 'admin',
            isTeacher: user.role === 'teacher'
        });
    } catch (error) {
        console.error('Ошибка при получении информации о пользователе:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Выход из системы
app.post('/logout', (req, res) => {
    console.log('Запрос на выход из системы получен');
    res.clearCookie('token', {
        httpOnly: false,
        secure: false,
        sameSite: 'none',
        path: '/'
    });
    res.json({ message: 'Выход выполнен успешно' });
    console.log('Cookie токен очищен, выход выполнен');
});

// Проверка существования email через API QuickEmailVerification
app.get('/verify-email', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: 'Email обязателен' });
    }

    try {
        console.log('Проверка email через API:', email);
        const quickemailverification = require('quickemailverification').client('ef2daf6f600fa70684ae72d405e822042a47b06b4de528a9a17c8f5351df').quickemailverification();
        
        quickemailverification.verify(email, function(err, response) {
            if (err) {
                console.error('Ошибка при проверке email через API:', err);
                return res.status(500).json({ error: 'Ошибка проверки email', details: err.message });
            }
            
            const result = response.body;
            console.log('Результат проверки email:', result);
            res.json({ exists: result.result === 'valid' });
        });
    } catch (error) {
        console.error('Ошибка при проверке email через API:', error);
        res.status(500).json({ error: 'Ошибка проверки email', details: error.message });
    }
});

// Endpoint для обновления роли пользователя (для администраторов)
app.get('/admin/set-role', authenticateToken, isAdmin, async (req, res) => {
    const { email, role } = req.query;
    if (!email || !role) {
        return res.status(400).json({ error: 'Email и роль обязательны' });
    }

    if (!['student', 'teacher', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Недопустимая роль. Разрешены: student, teacher, admin' });
    }

    try {
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await db.updateUserRole(user.id, role);
        res.json({ message: `Роль пользователя ${email} обновлена на ${role}` });
    } catch (error) {
        console.error('Ошибка при обновлении роли:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Временный endpoint для проверки количества пользователей без email (для отладки)
app.get('/admin/check-users-without-email', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { runQuery } = require('./config/database');
        const usersWithoutEmail = await runQuery('SELECT id, username FROM Users WHERE email IS NULL OR email = ""');
        res.json({ count: usersWithoutEmail.length, users: usersWithoutEmail });
    } catch (error) {
        console.error('Ошибка при проверке пользователей без email:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение списка всех пользователей (для админа)
app.get('/admin/users', authenticateToken, isAdmin, async (req, res) => {
    console.log('Запрос списка всех пользователей от администратора:', req.user.email);
    try {
        const { runQuery } = require('./config/database');
        const allUsers = await runQuery('SELECT id, email, role FROM Users WHERE email IS NOT NULL AND email != ""');
        console.log('Список пользователей успешно отправлен администратору');
        res.json(allUsers.map(user => ({
            id: user.id,
            email: user.email,
            role: user.role || 'student'
        })));
    } catch (error) {
        console.error('Ошибка получения списка пользователей для админа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Email Verification
app.post('/verify-email', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        var quickemailverification = require('quickemailverification').client('API_KEY').quickemailverification(); // Replace API_KEY with your API Key

        quickemailverification.verify(email, function (err, response) {
            if (err) {
                console.error('Email verification error:', err);
                return res.status(500).json({ error: 'Verification failed' });
            }
            // Print response object
            console.log(response.body);
            res.json({ message: 'Email verification result', result: response.body });
        });
    } catch (error) {
        console.error('Server error during email verification:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Удаление файла
app.delete('/delete/:fileName', authenticateToken, async (req, res) => {
    try {
        console.log('Запрос на удаление файла от пользователя:', req.user.email);
        const fileName = req.params.fileName;
        const userId = req.user.id;

        console.log(`Попытка удаления файла ${fileName} для пользователя ${req.user.email} (ID: ${userId})`);
        const result = await db.deleteFile(userId, fileName);
        
        if (result.changes === 0) {
            console.log(`Файл ${fileName} не найден для пользователя ${req.user.email}`);
            return res.status(404).json({ error: 'Файл не найден' });
        }

        console.log(`Файл ${fileName} успешно удален для пользователя ${req.user.email}`);
        res.json({ message: 'Файл успешно удален' });
    } catch (error) {
        console.error('Ошибка при удалении файла:', error);
        res.status(500).json({ error: 'Ошибка сервера при удалении файла' });
    }
});

// Временный маршрут для получения списка файлов текущего пользователя (для отладки)
app.get('/user/files', authenticateToken, async (req, res) => {
    try {
        console.log('Запрос списка файлов от пользователя:', req.user.email);
        const userId = req.user.id;
        const { runQuery } = require('./config/database');
        const files = await runQuery('SELECT id, file_name, created_at FROM files WHERE user_id = ?', [userId]);
        console.log(`Найдено ${files.length} файлов для пользователя ${req.user.email}`);
        res.json({ files });
    } catch (error) {
        console.error('Ошибка при получении списка файлов пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении списка файлов' });
    }
});

// Endpoint для очистки базы данных от записей без file
app.delete('/admin/cleanup-files', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    try {
        const result = await db.cleanupFilesWithoutFile();
        res.json({ message: 'База данных очищена от записей без файла.', deletedCount: result });
    } catch (error) {
        console.error('Ошибка при очистке базы данных:', error);
        res.status(500).json({ error: 'Ошибка сервера при очистке базы данных.' });
    }
});

// Endpoint для пересоздания базы данных
app.post('/admin/recreate-database', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    try {
        await db.recreateDatabase();
        res.json({ message: 'База данных успешно пересоздана.' });
    } catch (error) {
        console.error('Ошибка при пересоздании базы данных:', error);
        res.status(500).json({ error: 'Ошибка сервера при пересоздании базы данных.' });
    }
});

// Endpoint для очистки всех сохранений
app.delete('/admin/clear-saves', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    try {
        const result = await db.clearAllSaves();
        res.json({ message: 'Все сохранения успешно удалены из базы данных.', deletedCount: result });
    } catch (error) {
        console.error('Ошибка при очистке сохранений:', error);
        res.status(500).json({ error: 'Ошибка сервера при очистке сохранений.' });
    }
});

// Проверка доступности сервера
app.get('/health', (req, res) => {
    console.log('[HEALTH] Получен запрос на проверку здоровья сервера');
    res.status(200).json({ status: 'ok' });
});

// Проверка токена
app.get('/check-token', authenticateToken, (req, res) => {
    console.log('[TOKEN] Проверка токена для пользователя:', req.user.email);
    res.status(200).json({ 
        message: 'Токен действителен',
        user: {
            email: req.user.email,
            isAdmin: req.user.isAdmin
        }
    });
});

// === ENDPOINTS ДЛЯ РАБОТЫ С ОТВЕТАМИ СТУДЕНТОВ ===

// Сохранение ответов студента
app.post('/answers/save', authenticateToken, async (req, res) => {
    try {
        const { answers } = req.body;
        const userId = req.user.id;
        const role = req.user.role;
        
        // Проверяем, что пользователь - студент
        if (role !== 'student') {
            return res.status(403).json({ 
                success: false, 
                message: 'Только студенты могут сохранять ответы на вопросы' 
            });
        }
        
        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({ 
                success: false, 
                message: 'Неверный формат ответов' 
            });
        }
        
        console.log(`Сохранение ответов для пользователя ${userId}:`, answers);
        
        // Преобразуем ответы в JSON строку
        const answersJson = JSON.stringify(answers);
        
        // Используем REPLACE для вставки или обновления записи
        const query = `
            INSERT OR REPLACE INTO student_answers (user_id, answers, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `;
        
        const { run } = require('./config/database');
        await run(query, [userId, answersJson]);
        
        console.log(`Ответы пользователя ${userId} успешно сохранены`);
        
        res.json({ 
            success: true, 
            message: 'Ответы успешно сохранены' 
        });
        
    } catch (error) {
        console.error('Ошибка при сохранении ответов:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка сервера при сохранении ответов',
            error: error.message 
        });
    }
});

// Загрузка ответов студента
app.get('/answers/load', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        
        // Проверяем, что пользователь - студент
        if (role !== 'student') {
            return res.status(403).json({ 
                success: false, 
                message: 'Только студенты могут загружать свои ответы' 
            });
        }
        
        console.log(`Загрузка ответов для пользователя ${userId}`);
        
        const query = `
            SELECT answers, created_at, updated_at 
            FROM student_answers 
            WHERE user_id = ?
        `;
        
        const { runQuery } = require('./config/database');
        const rows = await runQuery(query, [userId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Ответы не найдены' 
            });
        }
        
        const answersData = rows[0];
        let answers;
        
        try {
            answers = JSON.parse(answersData.answers);
        } catch (parseError) {
            console.error('Ошибка парсинга ответов:', parseError);
            return res.status(500).json({ 
                success: false, 
                message: 'Ошибка формата сохраненных ответов' 
            });
        }
        
        console.log(`Ответы пользователя ${userId} успешно загружены`);
        
        res.json({ 
            success: true, 
            answers: answers,
            created_at: answersData.created_at,
            updated_at: answersData.updated_at
        });
        
    } catch (error) {
        console.error('Ошибка при загрузке ответов:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка сервера при загрузке ответов',
            error: error.message 
        });
    }
});

// Получение всех ответов студентов (только для админов и учителей)
app.get('/admin/answers', authenticateToken, isAdminOrTeacher, async (req, res) => {
    try {
        console.log('Админ/учитель запрашивает все ответы студентов');
        
        const query = `
            SELECT sa.id, sa.user_id, sa.answers, sa.created_at, sa.updated_at,
                   u.username, u.email
            FROM student_answers sa
            JOIN Users u ON sa.user_id = u.id
            WHERE u.role = 'student'
            ORDER BY sa.updated_at DESC
        `;
        
        const { runQuery } = require('./config/database');
        const rows = await runQuery(query);
        
        const answersWithUserInfo = rows.map(row => {
            let answers;
            try {
                answers = JSON.parse(row.answers);
            } catch (parseError) {
                console.error(`Ошибка парсинга ответов пользователя ${row.user_id}:`, parseError);
                answers = {};
            }
            
            return {
                id: row.id,
                user_id: row.user_id,
                username: row.username,
                email: row.email,
                answers: answers,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
        });
        
        res.json({ 
            success: true, 
            answers: answersWithUserInfo 
        });
        
    } catch (error) {
        console.error('Ошибка при получении всех ответов:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка сервера при получении ответов',
            error: error.message 
        });
    }
});

// Роут для обслуживания главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'front', 'index.html'));
});

// Роут для обслуживания всех остальных страниц (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'front', 'index.html'));
});

app.listen(port, async () => {
    console.log(`Сервер запущен на порту ${port}`);
    
    // Проверка подключения к базе данных
    try {
        const { runQuery } = require('./config/database');
        const result = await runQuery('SELECT 1 as test');
        console.log('Успешное подключение к базе данных SQLite!');
        
        // Временный код для установки роли admin для пользователя gagenik257@gmail.com
        try {
            const adminUser = await db.getUserByEmail('gagenik257@gmail.com');
            if (adminUser && adminUser.role !== 'admin') {
                await db.updateUserRole(adminUser.id, 'admin');
                console.log('Роль пользователя gagenik257@gmail.com обновлена на admin');
            } else if (adminUser) {
                console.log('Пользователь gagenik257@gmail.com уже имеет роль admin');
            } else {
                console.log('Пользователь gagenik257@gmail.com не найден в базе данных');
            }
        } catch (error) {
            console.error('Ошибка при установке роли admin для gagenik257@gmail.com:', error);
        }
    } catch (error) {
        console.error('Ошибка подключения к базе данных при старте сервера:', error);
        console.error('Код ошибки:', error.code);
        if (error.originalError) {
            console.error('Оригинальная ошибка:', error.originalError);
        }
    }
});