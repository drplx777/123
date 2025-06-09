# Multi-stage build для оптимизации размера образа
FROM node:18-alpine as builder

# Устанавливаем системные зависимости для сборки native модулей
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production --silent

# Production stage
FROM node:18-alpine

# Устанавливаем только runtime зависимости
RUN apk add --no-cache \
    sqlite \
    dumb-init

# Создаем пользователя для приложения
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем node_modules из builder stage
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Копируем код приложения
COPY --chown=nodeuser:nodejs . .

# Создаем необходимые директории
RUN mkdir -p uploads data && \
    chown -R nodeuser:nodejs uploads data

# Убеждаемся что база данных имеет правильные права доступа
RUN if [ -f map4.db ]; then chown nodeuser:nodejs map4.db; fi

# Создаем .env файл если его нет
RUN if [ ! -f .env ]; then \
    echo "NODE_ENV=production" > .env && \
    echo "PORT=3000" >> .env && \
    echo "JWT_SECRET=your-secure-jwt-secret-key-1234567890-change-in-production" >> .env && \
    echo "SESSION_SECRET=your-secure-session-secret-key-0987654321-change-in-production" >> .env && \
    echo "FRONTEND_URL=http://localhost:3000" >> .env && \
    chown nodeuser:nodejs .env; \
    fi

# Переключаемся на непривилегированного пользователя
USER nodeuser

# Экспонируем порт
EXPOSE 3000

# Проверка здоровья приложения
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Используем dumb-init для правильной обработки сигналов
ENTRYPOINT ["dumb-init", "--"]

# Запускаем приложение
CMD ["node", "server.js"] 