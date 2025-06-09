/**
 * Обрабатывает поиск местоположений с использованием API Nominatim.
 * @module search
 */
import { state } from './mapInit.js';

/**
 * Выполняет поиск местоположения и отображает его на карте.
 */
async function searchLocation() {
  if (typeof L === 'undefined') {
    console.error('Leaflet не загружен');
    return;
  }

  const query = document.getElementById('search-input').value.trim();
  if (!query) {
    document.getElementById('error-message').textContent = 'Введите запрос для поиска';
    return;
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();

    if (data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      state.map.setView([lat, lon], 14);

      if (state.searchMarker) {
        state.map.removeLayer(state.searchMarker);
      }

      state.searchMarker = L.marker([lat, lon])
        .addTo(state.map)
        .bindPopup(`<b>${result.display_name}</b>`)
        .openPopup();

      document.getElementById('error-message').textContent = '';
    } else {
      document.getElementById('error-message').textContent = 'Местоположение не найдено';
    }
  } catch (error) {
    console.error('Ошибка поиска:', error);
    document.getElementById('error-message').textContent = 'Ошибка при поиске местоположения';
  }
}

/**
 * Инициализирует обработчики для поля поиска и кнопки.
 */
function initSearch() {
  const searchBtn = document.getElementById('search-btn');
  const searchInput = document.getElementById('search-input');
  if (!searchBtn || !searchInput) {
    console.error('Элементы поиска (#search-btn, #search-input) не найдены');
    document.getElementById('error-message').textContent = 'Ошибка интерфейса поиска';
    return;
  }
  searchBtn.addEventListener('click', searchLocation);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchLocation();
  });
}

export { searchLocation, initSearch };