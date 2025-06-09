/**
 * Управляет обновлением интерфейса (кнопки, текст подсказок, координаты).
 * @module ui
 */
import { state } from './mapInit.js';
import { exportToGeoJSON, importFromGeoJSON } from './drawing.js';
import { isAuthenticated, getCurrentUser } from './auth.js';

/**
 * Обновляет состояние кнопок инструментов.
 * @param {MapState} state - Глобальное состояние.
 */
function updateToolButtons(state) {
  console.log('Обновление кнопок, currentTool:', state.currentTool);
  document.querySelectorAll('.tools button').forEach((btn) => {
    btn.classList.remove('active');
  });

  if (state.currentTool) {
    const btnId = state.currentTool === 'delete' ? 'delete-object' : `add-${state.currentTool}`;
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.add('active');
    } else {
      console.warn(`Кнопка с ID ${btnId} не найдена`);
      document.getElementById('error-message').textContent = `Кнопка ${btnId} не найдена`;
    }
  }
}

/**
 * Отображает текст подсказки или ошибки.
 * @param {string} message - Сообщение для отображения.
 */
function showHelp(message) {
  const helpText = message || `
    Инструкция по использованию карты:
    1. Для добавления маркера нажмите кнопку "Маркер" и кликните на карту
    2. Для сохранения карты введите имя файла и нажмите "Сохранить"
    3. Для загрузки карты выберите файл из списка и нажмите "Загрузить"
    4. Для удаления файла выберите его из списка и нажмите "Удалить"
  `;
  showNotification(helpText, 'info');
}

/**
 * Обновляет отображение координат
 */
function updateCoordinates(lat, lng) {
    const latElement = document.getElementById('lat');
    const lngElement = document.getElementById('lng');
    if (latElement && lngElement) {
        latElement.textContent = lat.toFixed(6);
        lngElement.textContent = lng.toFixed(6);
    } else {
        console.warn('Элементы координат (#lat, #lng) не найдены');
        document.getElementById('error-message').textContent = 'Элементы координат не найдены';
    }
}

/**
 * Инициализирует отображение координат с дебаунсингом.
 */
function initCoordinates() {
    if (!state.map) {
        console.error('Карта не инициализирована для обновления координат');
        document.getElementById('error-message').textContent = 'Карта не инициализирована';
        return;
    }

    let timeout;
    state.map.on('mousemove', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            updateCoordinates(e.latlng.lat, e.latlng.lng);
        }, 50);
    });
}

/**
 * Очищает все объекты на карте
 */
function clearAllFeatures() {
    if (state.drawnItems) {
        state.drawnItems.clearLayers();
        showHelp('Все объекты очищены');
    } else {
        showHelp('Ошибка: Слой для объектов не инициализирован');
    }
}

/**
 * Обновляет список файлов
 */
let isFileListUpdated = false;
let fileListUpdateTimeout = null;
let fileListUpdateCount = 0;
async function updateFileList() {
    try {
        console.log('Обновление списка файлов...');
        const response = await fetch('/files', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        // Логируем статус ответа сервера
        console.log('Ответ сервера на /files:', response.status, response.statusText);
        if (!response.ok) {
            // Очищаем DOM элементы при ошибке
            const fileList = document.getElementById('file-list');
            if (fileList) fileList.innerHTML = '<li>Ошибка загрузки списка файлов (сервер недоступен или ошибка 500)</li>';
            const fileSelect = document.getElementById('load-file-name');
            if (fileSelect) fileSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
            const errorMessage = document.getElementById('error-message');
            if (errorMessage) {
                errorMessage.textContent = `Ошибка загрузки файлов: ${response.status} ${response.statusText}`;
            }
            console.error('Ошибка при получении списка файлов:', response.status, response.statusText);
            // Не выбрасываем исключение, просто выходим из функции
            return;
        }
        let files = await response.json();
        // Исправление: если сервер возвращает массив объектов, преобразуем к массиву имён файлов
        if (Array.isArray(files) && files.length > 0 && typeof files[0] === 'object' && files[0].file_name) {
            files = files.map(f => f.file_name);
        }
        // Проверяем, что сервер вернул массив
        if (!Array.isArray(files)) {
            console.warn('Сервер вернул не массив файлов, files:', files);
            files = [];
        }
        // Фильтруем только строки
        files = files.filter(f => typeof f === 'string' && f.length > 0);
        console.log('Список файлов получен:', files);
        const fileList = document.getElementById('file-list');
        if (fileList) {
            fileList.innerHTML = '';
            if (files.length === 0) {
                console.log('Нет сохраненных файлов для отображения');
                fileList.innerHTML = '<li>Нет сохраненных файлов</li>';
            } else {
                files.forEach(fileName => {
                    const li = document.createElement('li');
                    li.textContent = fileName;
                    li.setAttribute('data-file-name', fileName);
                    li.classList.add('file-item');
                    // Добавляем обработчик выбора файла по клику
                    li.addEventListener('click', function() {
                        // Снимаем выделение со всех
                        fileList.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
                        li.classList.add('selected');
                        // Синхронизируем select
                        const fileSelect = document.getElementById('load-file-name');
                        if (fileSelect) fileSelect.value = fileName;
                    });
                    fileList.appendChild(li);
                });
            }
        } else {
            console.error('Элемент file-list не найден в DOM');
        }
        
        const fileSelect = document.getElementById('load-file-name');
        if (fileSelect) {
            fileSelect.innerHTML = '<option value="">Выберите файл...</option>';
            if (files.length > 0) {
                files.forEach(fileName => {
                    const option = document.createElement('option');
                    option.value = fileName;
                    option.textContent = fileName;
                    fileSelect.appendChild(option);
                });
                // При изменении select выделяем соответствующий li
                fileSelect.addEventListener('change', function() {
                    const selected = fileSelect.value;
                    if (fileList) {
                        fileList.querySelectorAll('.file-item').forEach(li => {
                            if (li.getAttribute('data-file-name') === selected) {
                                li.classList.add('selected');
                            } else {
                                li.classList.remove('selected');
                            }
                        });
                    }
                });
            }
        } else {
            console.error('Элемент load-file-name не найден в DOM');
        }
        // Очищаем сообщение об ошибке, если всё прошло успешно
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = '';
        }
    } catch (error) {
        // Очищаем DOM элементы при ошибке
        const fileList = document.getElementById('file-list');
        if (fileList) fileList.innerHTML = '<li>Ошибка загрузки списка файлов (сервер недоступен или ошибка 500)</li>';
        const fileSelect = document.getElementById('load-file-name');
        if (fileSelect) fileSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = 'Ошибка загрузки списка файлов. Попробуйте позже или обратитесь к администратору.';
        }
        console.error('Исключение при получении списка файлов:', error);
                        console.error('URL запроса:', '/files');
        console.error('Ошибка может быть связана с недоступностью сервера или сетевыми проблемами.');
    }
}

let isSaving = false;
let saveAttempts = 0;
let currentFileName = null;

async function saveMap() {
    if (isSaving) {
        console.log('Сохранение уже выполняется, пропускаем');
        return;
    }
    isSaving = true;
    console.log('Попытка сохранения номер:', saveAttempts + 1);
    saveAttempts++;

    const fileNameInput = document.getElementById('save-file-name');
    if (!fileNameInput) {
        showNotification('Ошибка: поле ввода имени файла не найдено', 'error');
        isSaving = false;
        return;
    }

    const fileName = fileNameInput.value.trim();
    console.log('Сохранение файла:', fileName);

    if (!fileName) {
        showNotification('Введите имя файла', 'error');
        isSaving = false;
        return;
    }

    const geojsonData = getGeoJSONForSave();
    console.log('Данные карты для сохранения:', geojsonData);

    // Получаем ответы на вопросы если пользователь - студент
    console.log('💾 Начинаем процесс сохранения карты и ответов в один файл...');
    let questionsAnswers = {};
    
    // Проверяем доступность функции
    if (typeof window.getQuestionAnswers === 'function') {
        console.log('✅ Получаем ответы на вопросы...');
        questionsAnswers = window.getQuestionAnswers();
        console.log('📋 Ответы на вопросы:', questionsAnswers);
    } else {
        console.warn('⚠️ Функция getQuestionAnswers недоступна');
    }

    // Создаем объединенные данные: карта + ответы на вопросы
    const fileData = {
        type: 'MapWithQuestions',
        version: '1.0',
        geojson: geojsonData,
        questionsAnswers: questionsAnswers,
        savedAt: new Date().toISOString()
    };
    
    console.log('📦 Объединенные данные для сохранения:', fileData);

    try {
        const response = await fetch('/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                fileName: fileName,
                geojsonData: fileData  // Сохраняем объединенные данные
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                showNotification('Сессия истекла, требуется повторная авторизация', 'error');
                showLoginForm();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Файл с картой и ответами успешно сохранен:', result);
        
        const hasAnswers = questionsAnswers && Object.keys(questionsAnswers).length > 0;
        if (hasAnswers) {
            showNotification('Карта и ответы на вопросы успешно сохранены в файл!', 'success');
        } else {
            showNotification('Карта успешно сохранена в файл!', 'success');
        }

        await updateFileList();
    } catch (error) {
        console.error('Ошибка при сохранении файла:', error);
        showNotification('Ошибка при сохранении файла', 'error');
    } finally {
        isSaving = false;
        console.log('Сохранение завершено, isSaving сброшен в false.');
    }
}

/**
 * Получает значение cookie по имени
 * @param {string} name - Имя cookie
 * @returns {string|null} - Значение cookie или null, если не найдено
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        return parts.pop().split(';').shift();
    }
    return null;
}

/**
 * Проверяет доступность сервера
 * @returns {Promise<boolean>}
 */
async function checkServerAvailability() {
    try {
        const response = await fetch('/health', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            },
            mode: 'cors'
        });
        return response.ok;
    } catch (error) {
        console.error('Сервер недоступен:', error);
        return false;
    }
}

/**
 * Проверяет и обновляет токен при необходимости
 * @returns {Promise<boolean>}
 */
async function checkAndRefreshToken() {
    const token = getCookie('token');
    if (!token) {
        console.log('Токен отсутствует');
        return false;
    }

    try {
        const response = await fetch('/check-token', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            console.log('Токен истек, требуется повторная аутентификация');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Ошибка при проверке токена:', error);
        return false;
    }
}

// Функция для получения GeoJSON данных карты
function getGeoJSONForSave() {
    if (!state || !state.drawnItems) {
        console.error('Ошибка: state или drawnItems не определены');
        return {
            type: 'FeatureCollection',
            features: []
        };
    }

    try {
        const geojsonData = state.drawnItems.toGeoJSON();
        console.log('GeoJSON для сохранения:', geojsonData);
        return geojsonData;
    } catch (error) {
        console.error('Ошибка при получении GeoJSON:', error);
        return {
            type: 'FeatureCollection',
            features: []
        };
    }
}

async function deleteFile(fileName) {
    // Получение имени файла из аргумента, а если не передан - из выбранного элемента
    if (!fileName || typeof fileName !== 'string') {
        // Попробуем получить имя файла из select
        const fileSelect = document.getElementById('load-file-name');
        if (fileSelect && fileSelect.value) {
            fileName = fileSelect.value;
        } else {
            // Если select пуст, ищем выделенный элемент списка
            const selectedLi = document.querySelector('#file-list .file-item.selected');
            if (selectedLi) {
                fileName = selectedLi.getAttribute('data-file-name');
            }
        }
    }

    if (!fileName || typeof fileName !== 'string' || fileName.trim() === '') {
        showNotification('Выберите файл для удаления', 'error');
        return;
    }

    console.log('Попытка удаления файла:', fileName);

    // Добавляем подтверждение действия
    if (!confirm(`Вы уверены, что хотите удалить файл "${fileName}"? Это действие нельзя отменить.`)) {
        return;
    }

    try {
        const response = await fetch(`/delete/${encodeURIComponent(fileName)}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                showNotification('Сессия истекла, требуется повторная авторизация', 'error');
                showLoginForm();
                return;
            } else if (response.status === 404) {
                showNotification('Файл не найден или уже удален', 'error');
                await updateFileList(); // Обновляем список файлов
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Файл успешно удален:', result);
        showNotification('Файл успешно удален', 'success');
        
        // Очищаем выбор в select
        const fileSelect = document.getElementById('load-file-name');
        if (fileSelect) {
            fileSelect.value = '';
        }
        
        // Убираем выделение с элементов списка
        const selectedItems = document.querySelectorAll('#file-list .file-item.selected');
        selectedItems.forEach(item => item.classList.remove('selected'));
        
        // Обновляем список файлов
        await updateFileList();
    } catch (error) {
        console.error('Ошибка при удалении файла:', error);
        showNotification(`Ошибка при удалении файла: ${error.message}`, 'error');
    }
}

// Добавляем обработчик для кнопки удаления файла
function initFileControls() {
    // Обработчик для основной кнопки удаления
    const deleteButton = document.getElementById('delete-file');
    if (deleteButton) {
        // Удаляем все предыдущие обработчики
        const newDeleteButton = deleteButton.cloneNode(true);
        deleteButton.parentNode.replaceChild(newDeleteButton, deleteButton);
        newDeleteButton.addEventListener('click', () => {
            deleteFile(); // Функция сама определит имя файла
        });
        console.log('Обработчик для кнопки delete-file добавлен');
    } else {
        console.error('Кнопка delete-file не найдена в DOM');
    }

    // Обработчик для второй кнопки удаления
    const deleteSelectedButton = document.getElementById('delete-selected-file');
    if (deleteSelectedButton) {
        // Удаляем все предыдущие обработчики
        const newDeleteSelectedButton = deleteSelectedButton.cloneNode(true);
        deleteSelectedButton.parentNode.replaceChild(newDeleteSelectedButton, deleteSelectedButton);
        newDeleteSelectedButton.addEventListener('click', () => {
            deleteFile(); // Функция сама определит имя файла
        });
        console.log('Обработчик для кнопки delete-selected-file добавлен');
    } else {
        console.error('Кнопка delete-selected-file не найдена в DOM');
    }
}

/**
 * Инициализация обработчиков событий для UI
 */
function initUI() {
    console.log('Инициализация UI...');
    initCoordinates();
    updateFileList();

    document.getElementById('add-marker').addEventListener('click', () => {
        state.currentTool = 'marker';
        updateToolButtons(state);
        
    });
    document.getElementById('add-line').addEventListener('click', () => {
        state.currentTool = 'line';
        updateToolButtons(state);
        
    });
    document.getElementById('add-polygon').addEventListener('click', () => {
        state.currentTool = 'polygon';
        updateToolButtons(state);
        
    });
    document.getElementById('delete-object').addEventListener('click', () => {
        state.currentTool = 'delete';
        updateToolButtons(state);
        
    });
    document.getElementById('clear-all').addEventListener('click', clearAllFeatures);

    // Добавляем обработчик для кнопки отмены выбора инструмента
    const cancelToolBtn = document.getElementById('cancel-tool');
    if (cancelToolBtn) {
        cancelToolBtn.addEventListener('click', () => {
            state.currentTool = null;
            updateToolButtons(state);
            
        });
    } else {
        console.error('Кнопка отмены выбора инструмента не найдена в DOM');
    }

    const saveButton = document.getElementById('save-map');
    if (saveButton) {
        // Удаляем все существующие обработчики событий для кнопки сохранения
        saveButton.removeEventListener('click', saveMap);
        saveButton.addEventListener('click', saveMap);
        console.log('Обработчик для кнопки сохранения добавлен (удалены все предыдущие обработчики)');
    } else {
        console.error('Кнопка сохранения не найдена в DOM');
    }

    // Исправлено: передавать имя файла в loadMap только из select, а не событие
    const loadButton = document.getElementById('load-map');
    if (loadButton) {
        loadButton.addEventListener('click', () => {
            const fileName = document.getElementById('load-file-name').value;
            loadMap(fileName);
        });
    } else {
        console.error('Кнопка загрузки не найдена в DOM');
    }

    initNameEditor();
    initFileControls();

    // Исправлено: обработчик для удаления объектов с карты по клику при активном инструменте "delete"
    if (state.map && state.drawnItems) {
        state.map.off('click', handleDeleteObjectClick);
        state.map.on('click', handleDeleteObjectClick);
    } else {
        // Если карта еще не инициализирована, добавим обработчик после инициализации карты
        document.addEventListener('DOMContentLoaded', () => {
            if (state.map && state.drawnItems) {
                state.map.off('click', handleDeleteObjectClick);
                state.map.on('click', handleDeleteObjectClick);
            }
        });
    }
}

// Функция-обработчик для удаления объектов с карты по клику
function handleDeleteObjectClick(e) {
    if (state.currentTool !== 'delete') return;
    let foundLayer = null;
    state.drawnItems.eachLayer(layer => {
        // Для маркеров
        if (layer instanceof L.Marker && layer.getLatLng && layer.getLatLng().distanceTo(e.latlng) < 10) {
            foundLayer = layer;
        }
        // Для линий и полигонов
        if (!foundLayer && (layer instanceof L.Polyline || layer instanceof L.Polygon) && layer.getBounds && layer.getBounds().contains(e.latlng)) {
            foundLayer = layer;
        }
    });
    if (foundLayer) {
        state.drawnItems.removeLayer(foundLayer);
        showHelp('Объект удалён');
    }
}

/**
 * Инициализирует обработчик изменения названия объекта
 */
function initNameEditor() {
    const saveNameBtn = document.getElementById('save-name');
    const nameInput = document.getElementById('object-name');
    
    if (saveNameBtn && nameInput) {
        saveNameBtn.addEventListener('click', () => {
            if (state.selectedFeature && state.selectedFeature.layer) {
                const newName = nameInput.value.trim();
                if (newName) {
                    // Обновляем свойства объекта
                    if (!state.selectedFeature.layer.feature) {
                        state.selectedFeature.layer.feature = { type: 'Feature', properties: {} };
                    }
                    state.selectedFeature.layer.feature.properties.name = newName;
                    state.selectedFeature.properties = state.selectedFeature.layer.feature.properties;
                    // Обновляем всплывающее окно
                    state.selectedFeature.layer.bindPopup(newName);
                    state.selectedFeature.layer.openPopup();
                    console.log('Название обновлено:', newName);
                    nameInput.value = '';
                    showHelp('Название объекта обновлено');
                } else {
                    showHelp('Ошибка: Введите название');
                }
            } else {
                showHelp('Ошибка: Выберите объект для изменения названия');
                console.log('Объект не выбран');
            }
        });
        
        // При выборе объекта показываем текущее название, если оно есть
        document.addEventListener('featureselect', (e) => {
            console.log('Событие featureselect получено:', e.detail.feature);
            if (e.detail.feature && e.detail.feature.properties && e.detail.feature.properties.name) {
                nameInput.value = e.detail.feature.properties.name;
                console.log('Поле ввода обновлено с названием:', e.detail.feature.properties.name);
            } else {
                nameInput.value = '';
                console.log('Поле ввода очищено, название отсутствует');
            }
        });
    } else {
        console.error('Элементы для редактирования названия не найдены');
    }
}

// Функция для загрузки карты
async function loadMap(fileName) {
    if (!fileName || typeof fileName !== 'string') {
        console.error('Некорректное имя файла:', fileName);
        showNotification('Ошибка: некорректное имя файла', 'error');
        return;
    }

    console.log('Загрузка файла:', fileName);
    try {
        const response = await fetch(`/load/${encodeURIComponent(fileName)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                showNotification('Сессия истекла, требуется повторная авторизация', 'error');
                showLoginForm();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Получены данные из файла:', data);

        // Новый формат: файл с картой и ответами на вопросы
        if (data && data.type === 'MapWithQuestions') {
            console.log('📁 Загружается файл нового формата с картой и ответами');
            
            if (state && state.drawnItems) {
                state.drawnItems.clearLayers();
            }
            
            // Загружаем карту
            if (data.geojson && data.geojson.type === 'FeatureCollection') {
                importFromGeoJSON(data.geojson);
                console.log('✅ Карта загружена из файла');
            }
            
            // Загружаем ответы на вопросы из файла
            if (data.questionsAnswers && typeof data.questionsAnswers === 'object') {
                loadQuestionAnswersFromFile(data.questionsAnswers);
                console.log('✅ Ответы на вопросы загружены из файла');
                showNotification('Файл с картой и ответами успешно загружен!', 'success');
            } else {
                showNotification('Карта загружена из файла!', 'success');
            }
            return;
        }

        // Поддержка старого формата: обычный GeoJSON
        if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            console.log('📁 Загружается файл старого формата (только карта)');
            if (state && state.drawnItems) {
                state.drawnItems.clearLayers();
            }
            importFromGeoJSON(data);
            showNotification('Карта загружена (старый формат файла)', 'success');
            return;
        }

        // Еще более старый формат 
        if (data && data.geojsonData && data.geojsonData.type === 'FeatureCollection') {
            console.log('📁 Загружается файл очень старого формата');
            if (state && state.drawnItems) {
                state.drawnItems.clearLayers();
            }
            importFromGeoJSON(data.geojsonData);
            showNotification('Карта загружена (очень старый формат файла)', 'success');
            return;
        }

        throw new Error('Некорректный формат данных');
    } catch (error) {
        console.error('Ошибка при загрузке файла:', error);
        showNotification('Ошибка при загрузке файла', 'error');
    }
}

/**
 * Загрузка ответов на вопросы из файла (не из базы данных)
 */
function loadQuestionAnswersFromFile(answersData) {
    console.log('📋 Загрузка ответов из файла:', answersData);
    
    if (!answersData || typeof answersData !== 'object') {
        console.warn('⚠️ Нет ответов для загрузки из файла');
        return;
    }
    
    // Заполняем поля ответов
    for (let i = 1; i <= 9; i++) {
        const textarea = document.getElementById(`question${i}`);
        const questionKey = `question${i}`;
        
        if (textarea && answersData[questionKey]) {
            textarea.value = answersData[questionKey];
            console.log(`✅ Загружен ответ на вопрос ${i}`);
        }
    }
}

// Функция для отображения формы авторизации
function showLoginForm() {
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('map-container').style.display = 'none';
    // Перезагружаем страницу для корректной инициализации
    window.location.reload();
}

// Добавляем функцию для установки имени файла
function setCurrentFileName(fileName) {
    currentFileName = fileName;
    const currentFileElement = document.getElementById('current-file');
    if (currentFileElement) {
        currentFileElement.textContent = 'Текущий файл: ' + fileName;
    }
}

// Улучшенная функция уведомлений
function showNotification(message, type = 'info') {
    // Создаем контейнер для уведомлений, если его нет
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(notificationContainer);
    }

    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.style.cssText = `
        padding: 15px;
        margin-bottom: 10px;
        border-radius: 4px;
        color: white;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        cursor: pointer;
    `;

    // Устанавливаем цвет в зависимости от типа
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#4CAF50';
            break;
        case 'error':
            notification.style.backgroundColor = '#f44336';
            break;
        case 'warning':
            notification.style.backgroundColor = '#ff9800';
            break;
        default:
            notification.style.backgroundColor = '#2196F3';
    }

    notification.textContent = message;
    notificationContainer.appendChild(notification);

    // Анимация появления
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);

    // Удаление уведомления через 5 секунд или по клику
    const removeNotification = () => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    };

    notification.addEventListener('click', removeNotification);
    setTimeout(removeNotification, 5000);
}

// Экспортируем все необходимые функции
export {
    initUI,
    updateFileList,
    showNotification,
    saveMap,
    deleteFile,
    showHelp,
    updateToolButtons,
    updateCoordinates,
    initCoordinates,
    clearAllFeatures,
    showLoginForm,
    loadMap
};