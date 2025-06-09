/**
 * Главная точка входа для приложения карты.
 * @module main
 */
import { initMap } from './mapInit.js';
import { setupMapHandlers, finishDrawing, resetDrawing } from './drawing.js';
import { initTools } from './tools.js';
import { initSearch } from './search.js';
import { initAuth, isAuthenticated } from './auth.js';
import { state } from './mapInit.js';
import { initCoordinates, updateFileList, initUI } from './ui.js';
import { initAdmin } from './admin.js';
import { initQuestions } from './questions.js';

/**
 * Инициализирует карту и связанные компоненты
 */
async function initMapComponents() {
  try {
    console.log('Инициализация карты...');
    await initMap();

    if (!state.map) {
      throw new Error('Инициализация карты не удалась');
    }

    console.log('Инициализация остальных модулей...');
    setupMapHandlers();
    initTools();
    initSearch();
    initUI();
    initCoordinates();
    await updateFileList();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        finishDrawing(state);
        resetDrawing(state, true);
      }
    });

    console.log('Приложение полностью инициализировано');
  } catch (error) {
    console.error('Ошибка инициализации приложения:', error);
    document.getElementById('error-message').textContent = 'Ошибка инициализации приложения';
  }
}

/**
 * Инициализирует приложение.
 */
async function init() {
  try {
    console.log('Инициализация приложения...');
    
    // Инициализация аутентификации
    initAuth();

    // Показываем карту только если пользователь уже авторизован
    if (isAuthenticated()) {
      document.getElementById('auth-container').style.display = 'none';
      document.getElementById('map-container').style.display = 'block';
      await initMapComponents();
    }

    // Подписываемся на событие успешной авторизации
    document.addEventListener('authSuccess', async () => {
      console.log('Успешная аутентификация, инициализация карты...');
      document.getElementById('auth-container').style.display = 'none';
      document.getElementById('map-container').style.display = 'block';
      await initMapComponents();
    });

    initAdmin();
    initQuestions();

  } catch (error) {
    console.error('Ошибка инициализации приложения:', error);
    document.getElementById('error-message').textContent = 'Ошибка инициализации приложения';
  }
}

// Запуск приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', init);