#!/bin/bash

echo "🚀 Запуск географического образовательного приложения..."

# Проверяем есть ли Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Пожалуйста, установите Docker сначала."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose не установлен. Пожалуйста, установите Docker Compose сначала."
    exit 1
fi

# Создаем директорию для загрузок если её нет
mkdir -p uploads

# Останавливаем предыдущие контейнеры если они запущены
echo "🛑 Останавливаем предыдущие контейнеры..."
docker-compose down --remove-orphans

# Строим и запускаем контейнеры
echo "🔨 Собираем Docker образ..."
docker-compose build

echo "🌟 Запускаем приложение..."
docker-compose up -d

# Ждем пока приложение запустится
echo "⏳ Ждем запуска приложения..."
sleep 10

# Проверяем статус
if curl -f http://localhost:3000 &> /dev/null; then
    echo "✅ Приложение успешно запущено!"
    echo "🌐 Откройте браузер и перейдите по адресу: http://localhost:3000"
    echo ""
    echo "📊 Для просмотра логов: docker-compose logs -f"
    echo "🛑 Для остановки: docker-compose down"
else
    echo "❌ Ошибка запуска приложения. Проверьте логи:"
    echo "docker-compose logs"
fi 