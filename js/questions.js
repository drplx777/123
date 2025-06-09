import { showNotification } from './ui.js';

/**
 * Модуль для управления вопросами для учеников
 */

let questionsVisible = false;

/**
 * Инициализация функционала вопросов
 */
function initQuestions() {
    console.log('Инициализация функционала вопросов...');
    
    // Добавляем обработчики событий
    setupQuestionHandlers();
    
    // Слушаем событие успешной авторизации
    document.addEventListener('authSuccess', handleAuthSuccess);
    
    // Тестовая кнопка для проверки функционала
    setupTestButton();
    
    // Автоматически проверяем и показываем для студентов
    setTimeout(() => {
        console.log('🔄 Автоматическая проверка роли пользователя...');
        handleAuthSuccess();
    }, 1000);
}

/**
 * Обработчик успешной авторизации
 */
function handleAuthSuccess() {
    console.log('🎓 Обработчик авторизации для вопросов сработал');
    
    // Получаем информацию о текущем пользователе
    const currentUser = getCurrentUserFromAuth();
    console.log('🔍 Данные пользователя:', currentUser);
    
    if (currentUser) {
        console.log(`👤 Роль пользователя: ${currentUser.role}`);
        
        if (currentUser.role === 'student') {
            console.log('✅ Пользователь - студент, показываем вопросы');
            showQuestionsPanel();
        } else {
            console.log('❌ Пользователь не студент, скрываем вопросы');
            hideQuestionsPanel();
        }
    } else {
        console.warn('⚠️ Данные пользователя не найдены');
        // Показываем панель для тестирования
        showQuestionsPanel();
    }
}

/**
 * Получение информации о текущем пользователе
 */
function getCurrentUserFromAuth() {
    // Получаем currentUser из глобального объекта или localStorage
    if (window.currentUser) {
        return window.currentUser;
    }
    
    // Пытаемся получить из localStorage
    try {
        const userData = localStorage.getItem('currentUser');
        if (userData) {
            return JSON.parse(userData);
        }
    } catch (error) {
        console.error('Ошибка при получении данных пользователя:', error);
    }
    
    return null;
}

/**
 * Показать панель вопросов
 */
function showQuestionsPanel() {
    console.log('📋 Попытка показать панель вопросов...');
    const questionsPanel = document.getElementById('student-questions');
    
    if (questionsPanel) {
        questionsPanel.style.display = 'block';
        questionsVisible = true;
        console.log('✅ Панель вопросов показана для ученика');
        console.log('📍 Стили панели:', {
            display: questionsPanel.style.display,
            position: getComputedStyle(questionsPanel).position,
            zIndex: getComputedStyle(questionsPanel).zIndex
        });
        
        // Не загружаем ответы автоматически - они теперь в файлах карты
        console.log('ℹ️ Ответы будут загружены при загрузке файла карты');
    } else {
        console.error('❌ Элемент student-questions не найден в DOM!');
    }
}

/**
 * Скрыть панель вопросов
 */
function hideQuestionsPanel() {
    const questionsPanel = document.getElementById('student-questions');
    if (questionsPanel) {
        questionsPanel.style.display = 'none';
        questionsVisible = false;
        console.log('Панель вопросов скрыта');
    }
}

/**
 * Настройка тестовой кнопки
 */
function setupTestButton() {
    const testBtn = document.getElementById('test-questions-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            console.log('Тестовая кнопка нажата');
            const questionsPanel = document.getElementById('student-questions');
            if (questionsPanel) {
                if (questionsPanel.style.display === 'none') {
                    questionsPanel.style.display = 'block';
                    console.log('Панель вопросов показана через тест');
                } else {
                    questionsPanel.style.display = 'none';
                    console.log('Панель вопросов скрыта через тест');
                }
            } else {
                console.error('Элемент student-questions не найден!');
            }
        });
        console.log('Тестовая кнопка настроена');
    } else {
        console.warn('Тестовая кнопка не найдена');
    }
}

/**
 * Настройка обработчиков событий
 */
function setupQuestionHandlers() {
    console.log('Обработчики вопросов настроены (только интегрированное сохранение)');
}



/**
 * Загрузка ответов с сервера
 */
async function loadAnswers(showMessage = true) {
    const loadBtn = document.getElementById('load-answers');
    
    try {
        if (loadBtn && showMessage) {
            loadBtn.classList.add('loading');
            loadBtn.textContent = 'Загрузка...';
        }
        
        console.log('Загрузка ответов с сервера...');
        
        const response = await fetch('/answers/load', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                if (showMessage) {
                    showNotification('У вас пока нет сохраненных ответов', 'info');
                }
                return;
            }
            if (response.status === 401) {
                showNotification('Сессия истекла, требуется повторная авторизация', 'error');
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Ответы загружены:', result);
        
        // Заполняем текстовые поля
        if (result.answers) {
            for (let i = 1; i <= 9; i++) {
                const textarea = document.getElementById(`question${i}`);
                const questionKey = `question${i}`;
                if (textarea && result.answers[questionKey]) {
                    textarea.value = result.answers[questionKey];
                }
            }
            
            if (showMessage) {
                showNotification('Ответы успешно загружены!', 'success');
            }
        }
        
    } catch (error) {
        console.error('Ошибка при загрузке ответов:', error);
        if (showMessage) {
            showNotification('Ошибка при загрузке ответов: ' + error.message, 'error');
        }
    } finally {
        if (loadBtn && showMessage) {
            loadBtn.classList.remove('loading');
            loadBtn.textContent = 'Загрузить мои ответы';
        }
    }
}





/**
 * Получение текущих ответов на вопросы (для интеграции с сохранением карты)
 */
function getQuestionAnswers() {
    console.log('🔍 Функция getQuestionAnswers вызвана');
    const answers = {};
    let hasAnswers = false;
    
    for (let i = 1; i <= 9; i++) {
        const textarea = document.getElementById(`question${i}`);
        console.log(`Проверка question${i}:`, textarea ? `найдено, значение: "${textarea.value}"` : 'не найдено');
        
        if (textarea && textarea.value.trim()) {
            answers[`question${i}`] = textarea.value.trim();
            hasAnswers = true;
        }
    }
    
    console.log('📝 Собрано ответов на вопросы:', hasAnswers ? Object.keys(answers).length : 0);
    console.log('📋 Итоговые ответы:', answers);
    
    return hasAnswers ? answers : {};
}

// Делаем функции глобально доступными для ui.js
window.getQuestionAnswers = getQuestionAnswers;
window.getCurrentUserFromAuth = getCurrentUserFromAuth;
window.loadQuestionAnswers = loadAnswers;

// Экспортируем функции
export {
    initQuestions,
    showQuestionsPanel,
    hideQuestionsPanel,
    loadAnswers,
    getQuestionAnswers
}; 