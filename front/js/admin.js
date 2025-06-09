import { importFromGeoJSON } from './drawing.js';
import { state } from './mapInit.js';

/**
 * Загружает список всех файлов для админа
 */
let isFileListLoaded = false;
let fileListLoadTimeout = null;
let fileListLoadCount = 0;
async function loadAdminFileList() {
    fileListLoadCount++;
    console.log(`Вызов loadAdminFileList, попытка #${fileListLoadCount}`);
    if (isFileListLoaded) {
        console.log('Список файлов уже загружен, пропускаем запрос.');
        return;
    }
    if (fileListLoadTimeout) {
        console.log('Запрос на загрузку списка файлов уже в процессе, пропускаем.');
        return;
    }
    fileListLoadTimeout = setTimeout(async () => {
        try {
            console.log('Проверка прав администратора перед запросом списка файлов...');
            const userResponse = await fetch('/user/info', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!userResponse.ok) {
                console.error('Ошибка получения информации о пользователе:', userResponse.status, userResponse.statusText);
                throw new Error('Ошибка получения информации о пользователе');
            }
            
            const user = await userResponse.json();
            console.log('Информация о пользователе:', user);

            if (!user.isAdmin && !user.isTeacher && user.username !== 'admin') {
                console.log('Пользователь не является администратором или учителем, запрос списка файлов не выполняется.');
                return;
            }

            console.log('Запрос списка всех файлов для администратора...');
            const response = await fetch('/admin/files', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ошибка получения списка файлов для админа:', response.status, errorText);
                throw new Error('Ошибка получения списка файлов');
            }

            const files = await response.json();
            console.log('Получен список файлов для админа:', files);
            const select = document.getElementById('admin-file-list');
            if (select) {
                select.innerHTML = '<option value="">Select user file...</option>';
                files.forEach(file => {
                    if (file.email && file.fileName) {
                        const option = document.createElement('option');
                        const fileValue = `${file.email}/${file.fileName}`;
                        option.value = fileValue;
                        option.textContent = `${file.email} - ${file.fileName} (${file.createdAt || 'No date'})`;
                        select.appendChild(option);
                        console.log('Добавлен файл в список:', fileValue);
                    } else {
                        console.error('Пропущен файл с некорректными данными:', file);
                    }
                });
                isFileListLoaded = true; // Устанавливаем флаг после успешной загрузки
            } else {
                console.error('Элемент admin-file-list не найден в DOM');
            }
        } catch (error) {
            console.error('Ошибка загрузки списка файлов для админа:', error);
            // Не выводим ошибку на UI, чтобы не отвлекать администратора
        } finally {
            fileListLoadTimeout = null; // Сбрасываем таймер после завершения запроса
        }
    }, 100); // Небольшая задержка для предотвращения множественных вызовов
}

/**
 * Загружает выбранный файл
 */
async function loadSelectedFile() {
    try {
        console.log('Нажата кнопка "Загрузить файл" для администратора');
        const filePath = document.getElementById('admin-file-list').value;
        if (!filePath) {
            console.error('Ошибка: Не выбран файл для загрузки');
            alert('Пожалуйста, выберите файл для загрузки.');
            return;
        }
        console.log('Попытка загрузки файла администратором:', filePath);
        console.log('Выбранное значение в списке admin-file-list:', document.getElementById('admin-file-list').value);
        const parts = filePath.split('/');
        console.log('Разбиение пути на части:', parts);
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            console.error('Ошибка: Неверный формат пути файла', filePath);
            alert('Неверный формат пути файла. Пожалуйста, выберите корректный файл из списка.');
            return;
        }
        const [username, fileName] = parts;
        const response = await fetch(`/admin/load/${username}/${fileName}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Ошибка загрузки файла администратором:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Текст ошибки от сервера:', errorText);
            alert(`Ошибка загрузки файла: ${response.status}. ${errorText}`);
            return;
        }

        const mapData = await response.json();
        console.log('Данные карты успешно загружены администратором/учителем:', mapData);
        
        // Очищаем текущие данные на карте
        if (state && state.drawnItems) {
            state.drawnItems.clearLayers();
        }
        
        // Определяем формат файла и загружаем соответственно
        let geoJsonToImport = null;
        let hasQuestions = false;
        
        if (mapData && mapData.type === 'MapWithQuestions') {
            console.log('📁 Админ загружает файл нового формата с картой и ответами');
            geoJsonToImport = mapData.geojson;
            hasQuestions = mapData.questionsAnswers && Object.keys(mapData.questionsAnswers).length > 0;
            
            if (hasQuestions) {
                console.log('📋 Файл содержит ответы на вопросы:', mapData.questionsAnswers);
                // Можно добавить отображение ответов для админов/учителей
                showQuestionsForReview(mapData.questionsAnswers);
            }
        } else if (mapData && mapData.type === 'FeatureCollection') {
            console.log('📁 Админ загружает файл старого формата (только карта)');
            geoJsonToImport = mapData;
        } else if (mapData && mapData.geojsonData && mapData.geojsonData.type === 'FeatureCollection') {
            console.log('📁 Админ загружает файл очень старого формата');
            geoJsonToImport = mapData.geojsonData;
        } else {
            console.error('❌ Неизвестный формат файла:', mapData);
            alert('Ошибка: неподдерживаемый формат файла');
            return;
        }
        
        // Импортируем GeoJSON данные
        if (geoJsonToImport && geoJsonToImport.type === 'FeatureCollection') {
            importFromGeoJSON(geoJsonToImport);
            console.log('✅ Данные карты импортированы на карту');
            
            if (hasQuestions) {
                alert('Файл с картой и ответами студента успешно загружен!');
            } else {
                alert('Файл с картой успешно загружен!');
            }
        } else {
            console.error('❌ Некорректные GeoJSON данные:', geoJsonToImport);
            alert('Ошибка: некорректные данные карты в файле');
        }
    } catch (error) {
        console.error('Исключение при загрузке файла администратором:', error);
        alert('Произошла ошибка при загрузке файла.');
    }
}

/**
 * Обработчик для кнопки удаления файла
 */
async function deleteSelectedFile() {
    try {
        console.log('Нажата кнопка "Удалить выбранный файл"');
        const filePath = document.getElementById('admin-file-list').value;
        if (!filePath) {
            console.error('Ошибка: Не выбран файл для удаления');
            alert('Пожалуйста, выберите файл для удаления.');
            return;
        }
        console.log('Попытка удаления файла:', filePath);
        const parts = filePath.split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            console.error('Ошибка: Неверный формат пути файла', filePath);
            alert('Неверный формат пути файла. Пожалуйста, выберите корректный файл из списка.');
            return;
        }
        const [username, fileName] = parts;
        if (confirm(`Вы уверены, что хотите удалить файл ${fileName} пользователя ${username}?`)) {
            const response = await fetch(`/admin/delete/${username}/${fileName}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.error('Ошибка удаления файла:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('Текст ошибки от сервера:', errorText);
                alert(`Ошибка удаления файла: ${response.status}. ${errorText}`);
                return;
            }

            const result = await response.json();
            console.log('Файл успешно удален:', result);
            alert('Файл успешно удален!');
            loadAdminFileList(); // Обновляем список файлов после удаления
        } else {
            console.log('Удаление файла отменено пользователем');
        }
    } catch (error) {
        console.error('Исключение при удалении файла:', error);
        alert('Произошла ошибка при удалении файла.');
    }
}

/**
 * Обработчик для кнопки удаления всех файлов
 */
async function deleteAllFiles() {
    try {
        console.log('Нажата кнопка "Удалить все файлы"');
        if (confirm('Вы уверены, что хотите удалить все файлы всех пользователей? Это действие нельзя отменить.')) {
            const response = await fetch('/admin/delete-all-files', {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.error('Ошибка удаления всех файлов:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('Текст ошибки от сервера:', errorText);
                alert(`Ошибка удаления всех файлов: ${response.status}. ${errorText}`);
                return;
            }

            const result = await response.json();
            console.log('Все файлы успешно удалены:', result);
            alert('Все файлы успешно удалены!');
            loadAdminFileList(); // Обновляем список файлов после удаления
        } else {
            console.log('Удаление всех файлов отменено пользователем');
        }
    } catch (error) {
        console.error('Исключение при удалении всех файлов:', error);
        alert('Произошла ошибка при удалении всех файлов.');
    }
}

/**
 * Показать ответы студента для просмотра админом/учителем
 */
function showQuestionsForReview(questionsAnswers) {
    console.log('📋 Отображение ответов студента для просмотра:', questionsAnswers);
    
    // Создаем модальное окно для просмотра ответов
    let modal = document.getElementById('questions-review-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'questions-review-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        document.body.appendChild(modal);
    }
    
    const questions = [
        'Объясните историю возникновения и основные этапы развития города.',
        'Продемонстрируйте на карте роль природных условий и ресурсов в развитии города и жизни горожан.',
        'Определите социально-экономические факторы развития города.',
        'Дайте характеристику населению и трудовым ресурсам города.',
        'Определите народнохозяйственную структуру и функции города.',
        'Продемонстрируйте на карте внутригородское расселение, или территориальную организацию города.',
        'Опишите город в системе расселения страны к которой он принадлежит.',
        'Опишите город и его окружающую среду.',
        'Выявите перспективы развития.'
    ];
    
    let content = `
        <div style="
            background: white;
            border-radius: 10px;
            padding: 30px;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        ">
            <h2 style="margin-top: 0; color: #333; text-align: center;">📋 Ответы студента на вопросы</h2>
    `;
    
    for (let i = 1; i <= 9; i++) {
        const questionKey = `question${i}`;
        const answer = questionsAnswers[questionKey] || 'Ответ не дан';
        const questionText = questions[i-1];
        
        content += `
            <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff;">
                <h4 style="margin: 0 0 10px 0; color: #495057;">${i}. ${questionText}</h4>
                <div style="
                    padding: 12px;
                    background: white;
                    border-radius: 5px;
                    border: 1px solid #dee2e6;
                    min-height: 60px;
                    font-family: inherit;
                    line-height: 1.5;
                    color: ${answer === 'Ответ не дан' ? '#6c757d' : '#212529'};
                    font-style: ${answer === 'Ответ не дан' ? 'italic' : 'normal'};
                ">${answer}</div>
            </div>
        `;
    }
    
    content += `
            <div style="text-align: center; margin-top: 30px;">
                <button onclick="document.getElementById('questions-review-modal').style.display='none'" 
                        style="
                            padding: 12px 30px;
                            background: #007bff;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            font-size: 16px;
                            cursor: pointer;
                        ">Закрыть</button>
            </div>
        </div>
    `;
    
    modal.innerHTML = content;
    modal.style.display = 'flex';
    
    // Закрытие по клику вне модального окна
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
}

/**
 * Просмотр ответов студента без загрузки карты
 */
async function viewSelectedFileAnswers() {
    try {
        console.log('Нажата кнопка "Просмотр ответов"');
        const filePath = document.getElementById('admin-file-list').value;
        if (!filePath) {
            console.error('Ошибка: Не выбран файл для просмотра ответов');
            alert('Пожалуйста, выберите файл для просмотра ответов.');
            return;
        }
        
        console.log('Попытка загрузки файла для просмотра ответов:', filePath);
        const parts = filePath.split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            console.error('Ошибка: Неверный формат пути файла', filePath);
            alert('Неверный формат пути файла. Пожалуйста, выберите корректный файл из списка.');
            return;
        }
        
        const [username, fileName] = parts;
        const response = await fetch(`/admin/load/${username}/${fileName}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Ошибка загрузки файла для просмотра ответов:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Текст ошибки от сервера:', errorText);
            alert(`Ошибка загрузки файла: ${response.status}. ${errorText}`);
            return;
        }

        const fileData = await response.json();
        console.log('Данные файла для просмотра ответов:', fileData);
        
        // Проверяем формат файла и показываем ответы
        if (fileData && fileData.type === 'MapWithQuestions') {
            if (fileData.questionsAnswers && Object.keys(fileData.questionsAnswers).length > 0) {
                console.log('📋 Найдены ответы студента, показываем их');
                showQuestionsForReview(fileData.questionsAnswers);
            } else {
                alert('В этом файле нет ответов на вопросы.');
            }
        } else {
            alert('Выбранный файл не содержит ответов на вопросы (старый формат файла).');
        }
        
    } catch (error) {
        console.error('Исключение при просмотре ответов:', error);
        alert('Произошла ошибка при загрузке ответов.');
    }
}

/**
 * Инициализация админских функций
 */
function initAdmin() {
    document.addEventListener('authSuccess', () => {
        // Обновляем список файлов при успешной авторизации
        loadAdminFileList();
    });

    // Добавляем обработчик для кнопки загрузки
    const loadButton = document.getElementById('admin-load-file');
    if (loadButton) {
        loadButton.addEventListener('click', loadSelectedFile);
    }

    // Добавляем обработчик для кнопки просмотра ответов
    const viewAnswersButton = document.getElementById('admin-view-answers');
    if (viewAnswersButton) {
        viewAnswersButton.addEventListener('click', viewSelectedFileAnswers);
    }

    // Добавляем обработчик события для кнопки удаления
    try {
        const deleteButton = document.getElementById('admin-delete-file');
        if (deleteButton) {
            deleteButton.addEventListener('click', deleteSelectedFile);
            console.log('Обработчик события для кнопки удаления добавлен');
        } else {
            console.error('Кнопка admin-delete-file не найдена в DOM');
        }
    } catch (error) {
        console.error('Ошибка при добавлении обработчика события для кнопки удаления:', error);
    }

    // Добавляем обработчик события для кнопки удаления всех файлов
    try {
        const deleteAllButton = document.getElementById('admin-delete-all-files');
        if (deleteAllButton) {
            deleteAllButton.addEventListener('click', deleteAllFiles);
            console.log('Обработчик события для кнопки удаления всех файлов добавлен');
        } else {
            console.error('Кнопка admin-delete-all-files не найдена в DOM');
        }
    } catch (error) {
        console.error('Ошибка при добавлении обработчика события для кнопки удаления всех файлов:', error);
    }
}

export { initAdmin }; 