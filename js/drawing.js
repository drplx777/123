/**
 * Управляет рисованием маркеров, линий и полигонов.
 * @module drawing
 */
import { state } from './mapInit.js';
import { saveMapData } from './api.js';

// Таймер для дебаунсинга сохранения
let saveTimeout = null;
let lastSaveTime = 0;
const MIN_SAVE_INTERVAL = 2000; // Минимальный интервал между сохранениями (2 секунды)

/**
 * Настраивает обработчики кликов по карте для рисования.
 */
function setupMapHandlers() {
  if (!state.map) return;
  document.addEventListener('submit', (e) => {
    e.preventDefault();
  });

  state.map.on('click', (e) => {
    if (state.currentTool === 'marker') {
      e.originalEvent.preventDefault();
      addMarker(e.latlng);
    } else if (state.currentTool === 'line') {
      e.originalEvent.preventDefault();
      addLinePoint(e.latlng);
    } else if (state.currentTool === 'polygon') {
      e.originalEvent.preventDefault();
      addPolygonPoint(e.latlng);
    } else if (state.currentTool === 'delete') {
      e.originalEvent.preventDefault();
      // Реализуем удаление объектов по клику
      let foundLayer = null;
      state.drawnItems.eachLayer(layer => {
        // Для маркеров — если клик рядом с маркером (10px)
        if (!foundLayer && layer instanceof L.Marker && layer.getLatLng().distanceTo(e.latlng) < 15) {
          foundLayer = layer;
        }
        // Для линий — если клик близко к линии (используем distanceSegment, если доступен)
        if (
          !foundLayer &&
          layer instanceof L.Polyline &&
          !(layer instanceof L.Polygon)
        ) {
          const latlngs = layer.getLatLngs();
          for (let i = 0; i < latlngs.length - 1; i++) {
            let dist = 99999;
            if (L.GeometryUtil && typeof L.GeometryUtil.distanceSegment === 'function') {
              dist = L.GeometryUtil.distanceSegment(state.map, e.latlng, latlngs[i], latlngs[i + 1]);
            } else {
              // Простейшая эвристика: расстояние до ближайшей точки
              dist = Math.min(
                e.latlng.distanceTo(latlngs[i]),
                e.latlng.distanceTo(latlngs[i + 1])
              );
            }
            if (dist < 15) {
              foundLayer = layer;
              break;
            }
          }
        }
        // Для полигонов — если клик внутри полигона
        if (
          !foundLayer &&
          layer instanceof L.Polygon &&
          layer.getBounds().contains(e.latlng)
        ) {
          foundLayer = layer;
        }
      });
      if (foundLayer) {
        state.drawnItems.removeLayer(foundLayer);
      }
    } else if (!state.currentTool) {
      // Если инструмент не выбран — ищем объект под курсором и показываем popup
      let found = false;
      state.drawnItems.eachLayer((layer) => {
        if (found) return;
        if (layer instanceof L.Marker) {
          if (layer.getLatLng().distanceTo(e.latlng) < 20) {
            showFeaturePopup(layer);
            found = true;
          }
        } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
          // Проверка попадания на линию
          const latlngs = layer.getLatLngs();
          for (let i = 0; i < latlngs.length - 1; i++) {
            let dist;
            if (L.GeometryUtil && typeof L.GeometryUtil.distanceSegment === 'function') {
              dist = L.GeometryUtil.distanceSegment(map, e.latlng, latlngs[i], latlngs[i + 1]);
            } else {
              console.warn('L.GeometryUtil.distanceSegment is not available');
              // Можно обработать ситуацию по-другому или просто return
              return;
            }
            if (dist < 10) {
              showFeaturePopup(layer);
              found = true;
              break;
            }
          }
        } else if (layer instanceof L.Polygon) {
          if (layer.getBounds().contains(e.latlng)) {
            showFeaturePopup(layer);
            found = true;
          }
        }
      });
    }
  });
}

/**
 * Сохраняет текущее состояние карты на сервер с дебаунсингом.
 * @param {boolean} [forceSave=false] - Принудительное сохранение, игнорируя дебаунсинг
 */
async function saveCurrentState(forceSave = false) {
  try {
    const now = Date.now();
    
    // Если это не принудительное сохранение, применяем дебаунсинг
    if (!forceSave) {
      // Проверяем, прошло ли достаточно времени с последнего сохранения
      if (now - lastSaveTime < MIN_SAVE_INTERVAL) {
        // Если нет, отменяем предыдущий таймер и устанавливаем новый
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => saveCurrentState(true), MIN_SAVE_INTERVAL);
        return;
      }
    }

    // Обновляем время последнего сохранения
    lastSaveTime = now;

    // Не сохраняем автоматически, только если это принудительное сохранение
    if (forceSave) {
      const geojson = exportToGeoJSON();
      await saveMapData(geojson);
      console.log('Данные карты успешно сохранены');
    }
  } catch (error) {
    console.error('Ошибка при сохранении данных карты:', error);
  }
}

/**
 * Добавляет маркер на карту.
 * @param {L.LatLng} latlng - Координаты маркера.
 */
function addMarker(latlng) {
  if (typeof L === 'undefined') {
    console.error('Leaflet не загружен');
    return;
  }

  try {
    const marker = L.marker(latlng, { 
      draggable: true // Делаем маркер перетаскиваемым
    }).addTo(state.drawnItems);
    
    marker.feature = { type: 'Feature', properties: { name: 'Маркер' } };
    console.log('Маркер добавлен, открываем всплывающее окно');
    const popupContent = `
      <div>
        <b>Название:</b> <input type="text" id="popup-name-input" value="Маркер" style="width: 150px; padding: 5px; margin-bottom: 5px;"><br>
        <button id="popup-save-name" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Сохранить</button>
      </div>
    `;
    marker.bindPopup(popupContent).openPopup();
    console.log('Всплывающее окно привязано и открыто для маркера');
    
    // Добавляем обработчики событий для маркера
    marker.on('click', (e) => {
      e.originalEvent?.preventDefault();
      showFeaturePopup(marker);
    });
    
    // Не сохраняем автоматически при перетаскивании
    marker.on('dragend', (e) => {
      e.originalEvent?.preventDefault();
    });
    
    // Добавляем обработчик для кнопки сохранения
    setTimeout(() => {
      const saveButton = document.getElementById('popup-save-name');
      if (saveButton) {
        saveButton.addEventListener('click', () => {
          const nameInput = document.getElementById('popup-name-input');
          if (nameInput) {
            const newName = nameInput.value.trim();
            if (newName) {
              marker.feature.properties.name = newName;
              console.log('Название маркера обновлено:', newName);
              marker.closePopup();
            } else {
              console.log('Название не введено');
            }
          }
        });
        console.log('Обработчик для кнопки сохранения добавлен');
      } else {
        console.error('Кнопка сохранения не найдена в всплывающем окне');
      }
    }, 100);
  } catch (error) {
    console.error('Ошибка при добавлении маркера:', error);
  }
}

/**
 * Добавляет точку к временной линии.
 * @param {L.LatLng} latlng - Координаты точки.
 */
function addLinePoint(latlng) {
  if (typeof L === 'undefined') {
    console.error('Leaflet не загружен');
    return;
  }
  state.tempPoints.push(latlng);

  if (state.tempLayer) {
    state.map.removeLayer(state.tempLayer);
    state.tempLayer = null;
  }

  if (state.tempPoints.length >= 2) {
    state.tempLayer = L.polyline(state.tempPoints, {
      color: 'blue',
      dashArray: '5,5',
      weight: 2,
    }).addTo(state.map);
  }
}

/**
 * Добавляет точку к временному полигону.
 * @param {L.LatLng} latlng - Координаты точки.
 */
function addPolygonPoint(latlng) {
  if (typeof L === 'undefined') {
    console.error('Leaflet не загружен');
    return;
  }
  state.tempPoints.push(latlng);

  if (state.tempLayer) {
    state.map.removeLayer(state.tempLayer);
    state.tempLayer = null;
  }

  if (state.tempPoints.length >= 3) {
    state.tempLayer = L.polygon([state.tempPoints], {
      color: 'green',
      dashArray: '5,5',
      fillOpacity: 0.2,
    }).addTo(state.map);
  }
}

/**
 * Завершает рисование линии или полигона и добавляет их в drawnItems.
 * @param {MapState} state - Глобальное состояние.
 */
function finishDrawing(state) {
  if (state.tempPoints.length === 0) return;

  if (typeof L === 'undefined') {
    console.error('Leaflet не загружен');
    return;
  }

  if (state.currentTool === 'line' && state.tempPoints.length >= 2) {
    const line = L.polyline(state.tempPoints, { color: 'red' }).addTo(state.drawnItems);
    line.feature = { type: 'Feature', properties: { name: 'Линия' } };
    const length = calculateLineLength(line.getLatLngs());
    line.feature.properties.length = length;
    const popupContent = `
      <div>
        <b>Название:</b> <input type="text" id="popup-name-input" value="Линия" style="width: 150px; padding: 5px; margin-bottom: 5px;"><br>
        <b>Длина:</b> <span id="line-length">${length.toFixed(2)} м</span><br>
        <select id="unit-select" style="margin-top: 5px;">
          <option value="meters">Метры</option>
          <option value="kilometers">Километры</option>
        </select>
        <button id="popup-save-name" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;">Сохранить</button>
      </div>
    `;
    line.bindPopup(popupContent).openPopup();
    line.on('click', () => showFeaturePopup(line));
    setTimeout(() => {
      const saveButton = document.getElementById('popup-save-name');
      const unitSelect = document.getElementById('unit-select');
      if (saveButton) {
        saveButton.addEventListener('click', () => {
          const nameInput = document.getElementById('popup-name-input');
          if (nameInput) {
            const newName = nameInput.value.trim();
            if (newName) {
              line.feature.properties.name = newName;
              console.log('Название линии обновлено:', newName);
              line.closePopup();
            } else {
              console.log('Название не введено');
            }
          }
        });
      }
      if (unitSelect) {
        unitSelect.addEventListener('change', () => {
          const unit = unitSelect.value;
          const lengthSpan = document.getElementById('line-length');
          if (lengthSpan) {
            if (unit === 'meters') {
              lengthSpan.textContent = `${length.toFixed(2)} м`;
            } else {
              lengthSpan.textContent = `${(length / 1000).toFixed(2)} км`;
            }
          }
        });
      }
    }, 100);
  } else if (state.currentTool === 'polygon' && state.tempPoints.length >= 3) {
    // --- Новый код для редактируемого полигона ---
    const polygon = L.polygon([state.tempPoints], { color: 'green' }).addTo(state.drawnItems);
    polygon.feature = { type: 'Feature', properties: { name: 'Полигон' } };
    const area = calculatePolygonArea(polygon.getLatLngs()[0]);
    polygon.feature.properties.area = area;
    const popupContent = `
      <div>
        <b>Название:</b> <input type="text" id="popup-name-input" value="Полигон" style="width: 150px; padding: 5px; margin-bottom: 5px;"><br>
        <b>Площадь:</b> <span id="polygon-area">${area.toFixed(2)} м²</span><br>
        <select id="unit-select" style="margin-top: 5px;">
          <option value="meters">Метры</option>
          <option value="kilometers">Километры</option>
        </select>
        <button id="popup-save-name" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;">Сохранить</button>
      </div>
    `;
    polygon.bindPopup(popupContent).openPopup();
    
    // Добавляем возможность перетаскивать точки полигона
    enablePolygonVertexDragging(polygon);

    polygon.on('click', () => showFeaturePopup(polygon));
    setTimeout(() => {
      const saveButton = document.getElementById('popup-save-name');
      const unitSelect = document.getElementById('unit-select');
      if (saveButton) {
        saveButton.addEventListener('click', () => {
          const nameInput = document.getElementById('popup-name-input');
          if (nameInput) {
            const newName = nameInput.value.trim();
            if (newName) {
              polygon.feature.properties.name = newName;
              console.log('Название полигона обновлено:', newName);
              polygon.closePopup();
            } else {
              console.log('Название не введено');
            }
          }
        });
      }
      if (unitSelect) {
        unitSelect.addEventListener('change', () => {
          const unit = unitSelect.value;
          const areaSpan = document.getElementById('polygon-area');
          if (areaSpan) {
            if (unit === 'meters') {
              areaSpan.textContent = `${area.toFixed(2)} м²`;
            } else {
              areaSpan.textContent = `${(area / 1000000).toFixed(2)} км²`;
            }
          }
        });
      }
    }, 100);
  }

  if (state.tempLayer) {
    state.map.removeLayer(state.tempLayer);
    state.tempLayer = null;
  }
  state.tempPoints = [];
}

/**
 * Включает возможность перетаскивать вершины полигона.
 * @param {L.Polygon} polygon
 */
function enablePolygonVertexDragging(polygon) {
  if (!polygon || !(polygon instanceof L.Polygon)) return;
  const latlngs = polygon.getLatLngs()[0];
  const markers = [];

  latlngs.forEach((latlng, idx) => {
    const marker = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({ className: 'vertex-drag-icon', iconSize: [12, 12], html: '<div style="width:12px;height:12px;border-radius:50%;background:#4CAF50;border:2px solid #fff;"></div>' })
    }).addTo(state.map);

    marker.on('drag', function (e) {
      latlngs[idx].lat = e.target.getLatLng().lat;
      latlngs[idx].lng = e.target.getLatLng().lng;
      polygon.setLatLngs([latlngs]);
      // Обновляем площадь в popup если открыт
      if (polygon.isPopupOpen()) {
        const area = calculatePolygonArea(latlngs);
        const areaSpan = document.getElementById('polygon-area');
        if (areaSpan) {
          const unitSelect = document.getElementById('unit-select');
          if (unitSelect && unitSelect.value === 'kilometers') {
            areaSpan.textContent = `${(area / 1000000).toFixed(2)} км²`;
          } else {
            areaSpan.textContent = `${area.toFixed(2)} м²`;
          }
        }
      }
    });

    marker.on('dragend', function () {
      // Можно добавить автосохранение или другие действия после перетаскивания
    });

    markers.push(marker);
  });

  // Удаляем маркеры при удалении полигона
  polygon.on('remove', () => {
    markers.forEach(m => state.map.removeLayer(m));
  });
}

/**
 * Сбрасывает состояние рисования.
 * @param {MapState} state - Глобальное состояние.
 * @param {boolean} [fullReset=true] - Сбрасывать ли currentTool.
 */
function resetDrawing(state, fullReset = true) {
  if (state.tempLayer) {
    state.map.removeLayer(state.tempLayer);
    state.tempLayer = null;
  }
  state.tempPoints = [];
  if (fullReset) {
    state.currentTool = null;
  }
}

/**
 * Экспортирует слой drawnItems в GeoJSON.
 * @returns {Object} GeoJSON объект.
 */
function exportToGeoJSON() {
  if (typeof L === 'undefined') {
    console.error('Leaflet не загружен');
    return null;
  }

  const geojson = {
    type: 'FeatureCollection',
    features: [],
  };

  state.drawnItems.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      geojson.features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [layer.getLatLng().lng, layer.getLatLng().lat],
        },
        properties: layer.feature ? layer.feature.properties : { name: 'Маркер' },
      });
      console.log('Маркер добавлен в GeoJSON для сохранения');
    } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      geojson.features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: layer.getLatLngs().map((latlng) => [latlng.lng, latlng.lat]),
        },
        properties: layer.feature ? layer.feature.properties : { name: 'Линия', length: calculateLineLength(layer.getLatLngs()) },
      });
      console.log('Линия добавлена в GeoJSON для сохранения');
    } else if (layer instanceof L.Polygon) {
      geojson.features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [layer.getLatLngs()[0].map((latlng) => [latlng.lng, latlng.lat])],
        },
        properties: layer.feature ? layer.feature.properties : { name: 'Полигон', area: calculatePolygonArea(layer.getLatLngs()[0]) },
      });
      console.log('Полигон добавлен в GeoJSON для сохранения');
    }
  });

  console.log('GeoJSON для сохранения:', geojson);
  return geojson;
}

/**
 * Импортирует GeoJSON в drawnItems.
 * @param {Object} geojson - GeoJSON объект.
 */
function importFromGeoJSON(geojson) {
  if (typeof L === 'undefined') {
    console.error('Leaflet не загружен');
    return;
  }

  if (!geojson || !geojson.features) {
    console.error('Некорректный формат GeoJSON');
    return;
  }

  state.drawnItems.clearLayers();

  geojson.features.forEach((feature) => {
    try {
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        const marker = L.marker([lat, lng], { 
          draggable: true // Делаем маркер перетаскиваемым
        }).addTo(state.drawnItems);
        
        if (feature.properties && feature.properties.name) {
          marker.bindPopup(feature.properties.name);
        }
        
        marker.on('click', () => showFeaturePopup(marker));
        marker.on('dragend', () => saveCurrentState());
      } else if (feature.geometry.type === 'LineString') {
        const coordinates = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const line = L.polyline(coordinates, { color: 'red' })
          .addTo(state.drawnItems);
        if (feature.properties) {
          line.feature = { type: 'Feature', properties: feature.properties };
          const length = feature.properties.length || calculateLineLength(line.getLatLngs());
          line.feature.properties.length = length;
          const popupContent = `
            <div>
              <b>Название:</b> <input type="text" id="popup-name-input" value="${feature.properties.name || 'Линия'}" style="width: 150px; padding: 5px; margin-bottom: 5px;"><br>
              <b>Длина:</b> <span id="line-length">${length.toFixed(2)} м</span><br>
              <select id="unit-select" style="margin-top: 5px;">
                <option value="meters">Метры</option>
                <option value="kilometers">Километры</option>
              </select>
              <button id="popup-save-name" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;">Сохранить</button>
            </div>
          `;
          line.bindPopup(popupContent);
          line.on('popupopen', () => {
            setTimeout(() => {
              const saveButton = document.getElementById('popup-save-name');
              const unitSelect = document.getElementById('unit-select');
              if (saveButton) {
                saveButton.addEventListener('click', () => {
                  const nameInput = document.getElementById('popup-name-input');
                  if (nameInput) {
                    const newName = nameInput.value.trim();
                    if (newName) {
                      line.feature.properties.name = newName;
                      console.log('Название линии обновлено:', newName);
                      line.closePopup();
                    } else {
                      console.log('Название не введено');
                    }
                  }
                });
              }
              if (unitSelect) {
                unitSelect.addEventListener('change', () => {
                  const unit = unitSelect.value;
                  const lengthSpan = document.getElementById('line-length');
                  if (lengthSpan) {
                    if (unit === 'meters') {
                      lengthSpan.textContent = `${length.toFixed(2)} м`;
                    } else {
                      lengthSpan.textContent = `${(length / 1000).toFixed(2)} км`;
                    }
                  }
                });
              }
            }, 100);
          });
        }
        line.on('click', () => showFeaturePopup(line));
      } else if (feature.geometry.type === 'Polygon') {
        const coordinates = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
        const polygon = L.polygon([coordinates], { color: 'green' })
          .addTo(state.drawnItems);
        if (feature.properties) {
          polygon.feature = { type: 'Feature', properties: feature.properties };
          const area = feature.properties.area || calculatePolygonArea(polygon.getLatLngs()[0]);
          polygon.feature.properties.area = area;
          const popupContent = `
            <div>
              <b>Название:</b> <input type="text" id="popup-name-input" value="${feature.properties.name || 'Полигон'}" style="width: 150px; padding: 5px; margin-bottom: 5px;"><br>
              <b>Площадь:</b> <span id="polygon-area">${area.toFixed(2)} м²</span><br>
              <select id="unit-select" style="margin-top: 5px;">
                <option value="meters">Метры</option>
                <option value="kilometers">Километры</option>
              </select>
              <button id="popup-save-name" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;">Сохранить</button>
            </div>
          `;
          polygon.bindPopup(popupContent);
          polygon.on('popupopen', () => {
            setTimeout(() => {
              const saveButton = document.getElementById('popup-save-name');
              const unitSelect = document.getElementById('unit-select');
              if (saveButton) {
                saveButton.addEventListener('click', () => {
                  const nameInput = document.getElementById('popup-name-input');
                  if (nameInput) {
                    const newName = nameInput.value.trim();
                    if (newName) {
                      polygon.feature.properties.name = newName;
                      console.log('Название полигона обновлено:', newName);
                      polygon.closePopup();
                    } else {
                      console.log('Название не введено');
                    }
                  }
                });
              }
              if (unitSelect) {
                unitSelect.addEventListener('change', () => {
                  const unit = unitSelect.value;
                  const areaSpan = document.getElementById('polygon-area');
                  if (areaSpan) {
                    if (unit === 'meters') {
                      areaSpan.textContent = `${area.toFixed(2)} м²`;
                    } else {
                      areaSpan.textContent = `${(area / 1000000).toFixed(2)} км²`;
                    }
                  }
                });
              }
            }, 100);
          });
        }
        polygon.on('click', () => showFeaturePopup(polygon));
      }
    } catch (error) {
      console.error('Ошибка при импорте объекта:', error);
    }
  });
}

/**
 * Показывает popup с названием, длиной/площадью для слоя (линии/полигона/маркера)
 * @param {L.Layer} layer
 */
function showFeaturePopup(layer) {
  if (!layer) return;
  let name = (layer.feature && layer.feature.properties && layer.feature.properties.name) || '';
  let popupContent = '';
  let extraInfo = '';

  if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
    const length = calculateLineLength(layer.getLatLngs());
    extraInfo = `
      <b>Длина:</b> <span id="line-length">${length.toFixed(2)} м</span><br>
      <select id="unit-select" style="margin-top: 5px;">
        <option value="meters">Метры</option>
        <option value="kilometers">Километры</option>
      </select>
    `;
  } else if (layer instanceof L.Polygon) {
    const area = calculatePolygonArea(layer.getLatLngs()[0]);
    extraInfo = `
      <b>Площадь:</b> <span id="polygon-area">${area.toFixed(2)} м²</span><br>
      <select id="unit-select" style="margin-top: 5px;">
        <option value="meters">Метры</option>
        <option value="kilometers">Километры</option>
      </select>
    `;
  }

  popupContent = `
    <div>
      <b>Название:</b> <input type="text" id="popup-name-input" value="${name}" style="width: 150px; padding: 5px; margin-bottom: 5px;"><br>
      ${extraInfo}
      <button id="popup-save-name" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Сохранить</button>
    </div>
  `;

  layer.bindPopup(popupContent).openPopup();

  setTimeout(() => {
    const saveButton = document.getElementById('popup-save-name');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        const nameInput = document.getElementById('popup-name-input');
        if (nameInput) {
          const newName = nameInput.value.trim();
          if (newName) {
            if (!layer.feature) layer.feature = { type: 'Feature', properties: {} };
            layer.feature.properties.name = newName;
            layer.closePopup();
          }
        }
      });
    }
    const unitSelect = document.getElementById('unit-select');
    if (unitSelect && layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      const length = calculateLineLength(layer.getLatLngs());
      unitSelect.addEventListener('change', () => {
        const unit = unitSelect.value;
        const lengthSpan = document.getElementById('line-length');
        if (lengthSpan) {
          if (unit === 'meters') {
            lengthSpan.textContent = `${length.toFixed(2)} м`;
          } else {
            lengthSpan.textContent = `${(length / 1000).toFixed(2)} км`;
          }
        }
      });
    }
    if (unitSelect && layer instanceof L.Polygon) {
      const area = calculatePolygonArea(layer.getLatLngs()[0]);
      unitSelect.addEventListener('change', () => {
        const unit = unitSelect.value;
        const areaSpan = document.getElementById('polygon-area');
        if (areaSpan) {
          if (unit === 'meters') {
            areaSpan.textContent = `${area.toFixed(2)} м²`;
          } else {
            areaSpan.textContent = `${(area / 1000000).toFixed(2)} км²`;
          }
        }
      });
    }
  }, 100);
}

/**
 * Вычисляет длину линии в метрах.
 * @param {L.LatLng[]} latlngs - Координаты точек линии.
 * @returns {number} Длина линии в метрах.
 */
function calculateLineLength(latlngs) {
  let length = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    length += latlngs[i].distanceTo(latlngs[i + 1]);
  }
  return length;
}

/**
 * Вычисляет площадь полигона в квадратных метрах.
 * @param {L.LatLng[]} latlngs - Координаты точек полигона.
 * @returns {number} Площадь полигона в квадратных метрах.
 */
function calculatePolygonArea(latlngs) {
  // Используем проекцию координат в метры (Web Mercator) и формулу Гаусса (Shoelace)
  if (latlngs.length < 3) return 0;

  // Переводим координаты в метры через проекцию Web Mercator
  function project(latlng) {
    const R = 6378137;
    const x = R * latlng.lng * Math.PI / 180;
    const y = R * Math.log(Math.tan(Math.PI / 4 + latlng.lat * Math.PI / 360));
    return { x, y };
  }

  let area = 0;
  for (let i = 0, len = latlngs.length, j = len - 1; i < len; j = i++) {
    const p1 = project(latlngs[j]);
    const p2 = project(latlngs[i]);
    area += (p1.x * p2.y - p2.x * p1.y);
  }
  return Math.abs(area / 2);
}

export {
  setupMapHandlers,
  addMarker,
  addLinePoint,
  addPolygonPoint,
  finishDrawing,
  resetDrawing,
  exportToGeoJSON,
  importFromGeoJSON,
  calculateLineLength,
  calculatePolygonArea,
  showFeaturePopup // экспортируем для тестов/расширения
};