/**
 * Инициализирует карту Leaflet и глобальное состояние.
 * @module mapInit
 */
import { loadMapData } from './api.js';
import { importFromGeoJSON } from './drawing.js';

/**
 * Глобальное состояние приложения карты.
 * @typedef {Object} MapState
 * @property {L.Map|null} map - Экземпляр карты Leaflet.
 * @property {L.FeatureGroup} drawnItems - Группа для нарисованных объектов.
 * @property {string|null} currentTool - Активный инструмент (marker, line, polygon, delete).
 * @property {L.Layer|null} selectedLayer - Текущий выбранный слой.
 * @property {L.Marker|null} searchMarker - Маркер для результатов поиска.
 * @property {L.Layer|null} tempLayer - Временный слой для рисования.
 * @property {L.LatLng[]} tempPoints - Точки для временных линий/полигонов.
 */

/** @type {MapState} */
const state = {
  map: null,
  drawnItems: null,
  currentTool: null,
  selectedLayer: null,
  searchMarker: null,
  tempLayer: null,
  tempPoints: [],
};

/**
 * Настраивает иконки маркеров Leaflet.
 */
function configureMarkerIcons() {
  // Создаем HTML-маркер с использованием эмодзи
  const DefaultIcon = L.divIcon({
    html: '📍',
    className: 'custom-div-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
  });

  // Устанавливаем иконку по умолчанию для всех маркеров
  L.Marker.prototype.options.icon = DefaultIcon;

  // Добавляем стили для маркера
  const style = document.createElement('style');
  style.textContent = `
    .custom-div-icon {
      background: none;
      border: none;
      font-size: 24px;
      text-align: center;
      line-height: 30px;
    }
  `;
  document.head.appendChild(style);

  return Promise.resolve();
}

/**
 * Инициализирует карту Leaflet с ретраями.
 * @param {number} [retries=3] - Количество попыток.
 * @param {number} [delay=500] - Задержка между попытками в мс.
 * @returns {Promise<void>}
 */
async function initMap(retries = 3, delay = 500) {
  let attempt = 1;

  while (attempt <= retries) {
    try {
      console.log(`Попытка инициализации карты (Попытка ${attempt}/${retries})`);

      // Проверка доступности Leaflet
      if (typeof L === 'undefined') {
        throw new Error('Leaflet не загружен. Проверьте подключение скрипта Leaflet.');
      }

      // Настройка иконок маркеров
      configureMarkerIcons();

      // Проверка наличия контейнера карты
      const mapContainer = document.getElementById('map');
      if (!mapContainer) {
        throw new Error('Контейнер карты (#map) не найден в DOM');
      }

      // Проверка размеров контейнера
      const rect = mapContainer.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        console.warn('Контейнер карты имеет нулевые размеры. Попытка исправить.');
        mapContainer.style.width = '100vw';
        mapContainer.style.height = '100vh';
      }

      // Инициализация карты
      state.map = L.map('map', {
        center: [53.757, 87.134],
        zoom: 13,
        zoomControl: true,
      });

      // Добавление слоя тайлов OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(state.map);

      // Инициализация слоя нарисованных объектов
      state.drawnItems = new L.FeatureGroup();
      state.map.addLayer(state.drawnItems);

      // Принудительное обновление карты
      console.log('Карта инициализирована, выполняется принудительное обновление...');
      setTimeout(() => {
        if (state.map) {
          state.map.invalidateSize();
          console.log('Обновление карты выполнено');
          // Проверка, отображается ли контейнер карты
          const mapContainerCheck = document.getElementById('map-container');
          if (mapContainerCheck) {
            console.log('Контейнер map-container найден, проверка стиля display:', mapContainerCheck.style.display);
            if (mapContainerCheck.style.display === 'none') {
              console.warn('Контейнер map-container скрыт (display: none), это может быть причиной проблем с UI');
            }
          } else {
            console.error('Контейнер map-container не найден в DOM');
          }
        }
      }, 100);

      // Успех
      console.log('Карта успешно инициализирована');
      return;
    } catch (error) {
      console.error(`Ошибка инициализации карты (Попытка ${attempt}/${retries}):`, error);
      if (attempt === retries) {
        console.error('Все попытки инициализации провалились. Карта не будет отображена.');
        document.getElementById('error-message').textContent = 'Не удалось инициализировать карту. Проверьте консоль.';
        return;
      }
      // Ожидание перед следующей попыткой
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}

export { state, initMap };