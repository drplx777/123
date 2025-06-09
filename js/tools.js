/**
 * Инициализирует кнопки инструментов и их обработчики событий.
 * @module tools
 */
import { state } from './mapInit.js';
import { finishDrawing, resetDrawing, exportToGeoJSON, importFromGeoJSON } from './drawing.js';
import { updateToolButtons, showHelp, updateFileList } from './ui.js';
import { isAuthenticated } from './auth.js';

/**
 * Инициализирует обработчики событий для кнопок инструментов.
 */
function initTools() {
  // Кэширование элементов кнопок
  const buttons = {
    marker: document.getElementById('add-marker'),
    line: document.getElementById('add-line'),
    polygon: document.getElementById('add-polygon'),
    delete: document.getElementById('delete-object'),
    clear: document.getElementById('clear-all'),
    save: document.getElementById('save-map'),
    load: document.getElementById('load-map'),
  };

  // Проверка наличия кнопок
  for (const [key, btn] of Object.entries(buttons)) {
    if (!btn) {
      console.error(`Кнопка ${key} (#${key === 'save' ? 'save-map' : key === 'load' ? 'load-map' : key}) не найдена`);
      document.getElementById('error-message').textContent = `Кнопка ${key} не найдена`;
      return;
    }
  }

  // Добавление маркера
  buttons.marker.addEventListener('click', () => {
    finishDrawing(state);
    resetDrawing(state, false);
    state.currentTool = 'marker';
    updateToolButtons(state);
  });

  // Добавление линии
  buttons.line.addEventListener('click', () => {
    finishDrawing(state);
    resetDrawing(state, false);
    state.currentTool = 'line';
    updateToolButtons(state);
  });

  // Добавление полигона
  buttons.polygon.addEventListener('click', () => {
    finishDrawing(state);
    resetDrawing(state, false);
    state.currentTool = 'polygon';
    updateToolButtons(state);
  });

  // Удаление объекта
  buttons.delete.addEventListener('click', () => {
    finishDrawing(state);
    if (state.selectedLayer) {
      state.drawnItems.removeLayer(state.selectedLayer);
      state.selectedLayer = null;
    }
    resetDrawing(state, false);
    state.currentTool = 'delete';
    updateToolButtons(state);
  });

  // Очистка всех объектов
  buttons.clear.addEventListener('click', () => {
    state.drawnItems.clearLayers();
    resetDrawing(state, true);
    state.currentTool = null;
    updateToolButtons(state);
  });

  // Сохранение карты - удалено, чтобы избежать дублирования с ui.js
  /*
  buttons.save.addEventListener('click', async () => {
    if (!isAuthenticated()) {
      showHelp('Ошибка: Необходимо войти в систему');
      return;
    }

    const fileNameInput = document.getElementById('save-file-name');
    const fileName = fileNameInput.value.trim();
    if (!fileName) {
      showHelp('Ошибка: Введите имя файла для сохранения');
      return;
    }

    const geojson = exportToGeoJSON();
    if (!geojson || geojson.features.length === 0) {
      showHelp('Ошибка: На карте нет объектов для сохранения');
      return;
    }

    try {
      console.log('Сохранение файла:', fileName);
      const response = await fetch('http://127.0.0.1:3000/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          fileName,
          geojsonData: geojson
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ошибка сохранения:', response.status, errorText);
        throw new Error('Ошибка сохранения');
      }

      const result = await response.json();
      showHelp(`Сохранено: ${result.message}`);
      fileNameInput.value = '';
      await updateFileList();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      showHelp('Ошибка при сохранении. Проверьте консоль.');
    }
  });
  */

  // Обработчик загрузки
  // if (buttons.load) {
  //     buttons.load.addEventListener('click', async () => {
  //         try {
  //             console.log('Загрузка файла из tools.js');
  //             const fileSelect = document.getElementById('load-file-name');
  //             if (!fileSelect) {
  //                 console.error('Элемент load-file-name не найден');
  //                 alert('Ошибка: Элемент выбора файла не найден.');
  //                 return;
  //             }
  // 
  //             const fileName = fileSelect.value;
  //             if (!fileName) {
  //                 console.error('Файл для загрузки не выбран');
  //                 alert('Пожалуйста, выберите файл для загрузки.');
  //                 return;
  //             }
  // 
  //             console.log('Загрузка файла:', fileName);
  //             const response = await fetch(`http://127.0.0.1:3000/load/${fileName}`, {
  //                 method: 'GET',
  //                 credentials: 'include',
  //                 headers: {
  //                     'Accept': 'application/json',
  //                     'Content-Type': 'application/json'
  //                 }
  //             });
  // 
  //             if (!response.ok) {
  //                 console.error('Ошибка загрузки файла:', response.status, response.statusText);
  //                 const errorText = await response.text();
  //                 console.error('Текст ошибки:', errorText);
  //                 alert(`Ошибка загрузки файла: ${response.status}. ${errorText}`);
  //                 return;
  //             }
  // 
  //             const geojson = await response.json();
  //             console.log('Данные GeoJSON загружены:', geojson);
  // 
  //             if (geojson.type === 'FeatureCollection' && typeof geojson.features === 'string') {
  //                 try {
  //                     geojson.features = JSON.parse(geojson.features);
  //                     console.log('Поле features преобразовано из строки в массив в tools.js:', geojson.features);
  //                 } catch (e) {
  //                     console.error('Ошибка при парсинге поля features в tools.js:', e);
  //                     alert('Ошибка формата данных карты.');
  //                     return;
  //                 }
  //             }
  // 
  //             state.drawnItems.clearLayers();
  //             importFromGeoJSON(geojson);
  //             console.log('Данные переданы в importFromGeoJSON из tools.js');
  //         } catch (error) {
  //             console.error('Ошибка загрузки:', error);
  //             alert('Произошла ошибка при загрузке файла.');
  //         }
  //     });
  // } else {
  //     console.error('Кнопка load-map не найдена');
  // }
}

export { initTools };