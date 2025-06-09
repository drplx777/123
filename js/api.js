/**
 * API функции для работы с сервером.
 * @module api
 */

const API_URL = 'http://127.0.0.1:3000';

/**
 * Загружает данные карты с сервера.
 * @returns {Promise<Object>} GeoJSON данные.
 */
export async function loadMapData() {
  try {
    // Возвращаем пустой GeoJSON по умолчанию
    return {
      type: 'FeatureCollection',
      features: []
    };
  } catch (error) {
    console.error('Ошибка при загрузке данных карты:', error);
    throw error;
  }
}

/**
 * Сохраняет данные карты на сервер.
 * @param {Object} geojson - GeoJSON данные для сохранения.
 * @returns {Promise<void>}
 */
export async function saveMapData(geojson) {
  try {
    const response = await fetch(`${API_URL}/save`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'default',
        geojsonData: geojson
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Ошибка при сохранении данных карты:', error);
    throw error;
  }
} 