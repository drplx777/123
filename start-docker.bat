@echo off
chcp 65001 >nul

echo 🚀 Запуск гео-образовательного приложения в Docker...

:: Создаем необходимые директории если их нет
if not exist uploads mkdir uploads

:: Проверяем наличие .env файла
if not exist .env (
    echo 📝 Создаем .env файл...
    (
        echo NODE_ENV=production
        echo PORT=3000
        echo JWT_SECRET=your-secure-jwt-secret-key-1234567890-change-in-production
        echo SESSION_SECRET=your-secure-session-secret-key-0987654321-change-in-production
        echo FRONTEND_URL=http://localhost:3000
    ) > .env
)

:: Останавливаем существующий контейнер если он запущен
echo 🛑 Останавливаем существующие контейнеры...
docker-compose down

:: Собираем и запускаем контейнер
echo 🔨 Собираем Docker образ...
docker-compose build

echo ▶️ Запускаем контейнер...
docker-compose up -d

echo ✅ Приложение запущено!
echo 🌐 Откройте браузер и перейдите по адресу: http://localhost:3000
echo 📊 Для просмотра логов: docker-compose logs -f
echo 🛑 Для остановки: docker-compose down

pause 