@echo off
chcp 65001 > nul
echo 🚀 Запуск географического образовательного приложения...

REM Проверяем есть ли Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker не установлен. Пожалуйста, установите Docker Desktop сначала.
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose не установлен. Пожалуйста, установите Docker Compose сначала.
    pause
    exit /b 1
)

REM Создаем директорию для загрузок если её нет
if not exist uploads mkdir uploads

REM Останавливаем предыдущие контейнеры если они запущены
echo 🛑 Останавливаем предыдущие контейнеры...
docker-compose down --remove-orphans

REM Строим и запускаем контейнеры
echo 🔨 Собираем Docker образ...
docker-compose build

echo 🌟 Запускаем приложение...
docker-compose up -d

REM Ждем пока приложение запустится
echo ⏳ Ждем запуска приложения...
timeout /t 15 /nobreak > nul

REM Проверяем статус
curl -f http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Приложение успешно запущено!
    echo 🌐 Откройте браузер и перейдите по адресу: http://localhost:3000
    echo.
    echo 📊 Для просмотра логов: docker-compose logs -f
    echo 🛑 Для остановки: docker-compose down
) else (
    echo ❌ Ошибка запуска приложения. Проверьте логи:
    echo docker-compose logs
)

pause 