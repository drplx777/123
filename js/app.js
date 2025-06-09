import { loadAdminFileList } from './admin.js';

function checkUserAndUpdateUI() {
    fetch('/user/info', {
        credentials: 'include',
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Ошибка получения информации о пользователе');
        }
        return response.json();
    })
    .then(user => {
        console.log('Информация о пользователе:', user);
        if (user.isAdmin || user.username === 'admin') {
            console.log('Пользователь является администратором');
            const adminPanel = document.getElementById('admin-panel');
            if (adminPanel) {
                adminPanel.style.display = 'block';
                loadAdminFileList();
            } else {
                console.error('Элемент admin-panel не найден в DOM');
            }
        }
    })
    .catch(error => {
        console.error('Ошибка проверки пользователя:', error);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    checkUserAndUpdateUI();
}); 