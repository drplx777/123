/**
 * Модуль аутентификации
 */

let currentUser = null;

/**
 * Инициализация формы аутентификации
 */
function initAuth() {
    setupAuthListeners();
    checkAuthStatus();
}

/**
 * Настройка обработчиков событий для формы аутентификации
 */
function setupAuthListeners() {
    const authSubmit = document.getElementById('auth-submit');
    const switchAuth = document.getElementById('switch-auth');
    const logoutBtn = document.getElementById('logout-btn');
    const updateRoleBtn = document.getElementById('admin-update-role');
    let isLoginMode = true;

    // Предотвращаем стандартное поведение формы
    document.querySelector('.auth-form').addEventListener('submit', (e) => {
        e.preventDefault();
    });

    switchAuth.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        document.querySelector('.auth-form h2').textContent = isLoginMode ? 'Вход' : 'Регистрация';
        authSubmit.textContent = isLoginMode ? 'Войти' : 'Зарегистрироваться';
        switchAuth.textContent = isLoginMode ? 'Зарегистрироваться' : 'Войти';
        document.getElementById('registration-extra-fields').style.display = isLoginMode ? 'none' : 'block';
        hideError();
    });

    authSubmit.addEventListener('click', async (e) => {
        e.preventDefault(); // Предотвращаем стандартное поведение кнопки
        const email = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            showError('Заполните все поля');
            return;
        }

        try {
            if (isLoginMode) {
                await login(email, password);
            } else {
                // Удалить обработку schoolNumber
                await register(email, password);
            }
        } catch (error) {
            showError(error.message);
        }
    });

    logoutBtn.addEventListener('click', logout);
    
    if (updateRoleBtn) {
        updateRoleBtn.addEventListener('click', updateUserRole);
    }
}

/**
 * Показать сообщение об ошибке
 */
function showError(message) {
    const errorDiv = document.querySelector('.auth-form .error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * Скрыть сообщение об ошибке
 */
function hideError() {
    const errorDiv = document.querySelector('.auth-form .error');
    errorDiv.style.display = 'none';
}

/**
 * Регистрация нового пользователя
 */
async function register(email, password) {
    try {
        if (!email || !password) {
            throw new Error('Заполните все поля');
        }
        if (!isValidEmail(email)) {
            throw new Error('Некорректный формат email');
        }
        // Проверка существования email (заглушка)
        const emailExists = await checkEmailExistence(email);
        if (!emailExists) {
            throw new Error('Этот email не существует или недоступен');
        }
        console.log('Отправка запроса на регистрацию с данными:', { email, password });
        const response = await fetch('/register', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password }),
        });

        console.log('Ответ сервера на запрос регистрации:', response.status, response.statusText);
        const data = await response.json();
        console.log('Данные ответа сервера:', data);
        if (!response.ok) {
            if (response.status === 400 && data.error === 'Пользователь уже существует') {
                throw new Error('Этот email уже зарегистрирован');
            }
            throw new Error(data.error || 'Ошибка регистрации');
        }

        // Проверяем куки после регистрации
        console.log('Куки после регистрации:', document.cookie);
        
        // Verify authentication after registration
        const verifyResponse = await fetch('/files', {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Ответ на проверку аутентификации после регистрации:', verifyResponse.status, verifyResponse.statusText);
        if (!verifyResponse.ok) {
            throw new Error('Ошибка аутентификации после регистрации');
        }

        currentUser = { 
            email,
            role: data.role,
            isAdmin: data.isAdmin,
            isTeacher: data.isTeacher
        };
        updateAuthUI();
        dispatchAuthSuccess();
    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        throw error;
    }
}

/**
 * Проверка существования email
 * Использует endpoint на сервере для проверки через API QuickEmailVerification
 */
async function checkEmailExistence(email) {
    try {
        console.log('Проверка существования email через серверный endpoint:', email);
        const response = await fetch(`/verify-email?email=${encodeURIComponent(email)}`, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        const result = await response.json();
        console.log('Результат проверки email:', result);
        if (!response.ok) {
            throw new Error(result.error || 'Ошибка проверки email через сервер');
        }
        return result.exists;
    } catch (error) {
        console.error('Ошибка при проверке email через серверный endpoint:', error);
        throw new Error('Этот email не может быть проверен. Проблема с сервисом проверки.');
    }
}

/**
 * Вход пользователя
 */
async function login(email, password) {
    try {
        console.log('Начало процесса входа для:', email);
        if (!email || !password) {
            throw new Error('Заполните все поля');
        }
        if (!isValidEmail(email)) {
            throw new Error('Некорректный формат email');
        }
        console.log('Отправка запроса на вход...');
        const response = await fetch('/login', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password }),
        });

        console.log('Получен ответ от сервера:', response.status, response.statusText);
        const data = await response.json();
        console.log('Данные ответа:', data);
        
        // Проверяем наличие cookie после входа
        const cookies = document.cookie;
        console.log('Cookies после входа:', cookies);

        if (!response.ok) {
            if (response.status === 401) {
                currentUser = null;
                document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                throw new Error('Email не зарегистрирован или пароль неверный');
            }
            throw new Error(data.error || 'Ошибка входа');
        }

        console.log('Установка currentUser...');
        // Сразу устанавливаем currentUser
        currentUser = { 
            email,
            role: data.role,
            isAdmin: data.isAdmin,
            isTeacher: data.isTeacher
        };
        console.log('currentUser установлен:', currentUser);

        // Проверяем аутентификацию перед обновлением UI
        try {
            console.log('Проверка аутентификации...');
            const verifyResponse = await fetch('/user/info', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            console.log('Ответ на проверку аутентификации:', verifyResponse.status, verifyResponse.statusText);
            if (!verifyResponse.ok) {
                throw new Error('Ошибка аутентификации после входа');
            }

            const userInfo = await verifyResponse.json();
            console.log('Информация о пользователе:', userInfo);
            
            // Обновляем currentUser с актуальной информацией
            currentUser = {
                email: userInfo.email,
                role: userInfo.role,
                isAdmin: userInfo.isAdmin,
                isTeacher: userInfo.isTeacher
            };
            
            console.log('Обновление UI...');
            updateAuthUI();
            dispatchAuthSuccess();
        } catch (error) {
            console.error('Ошибка проверки аутентификации:', error);
            throw error;
        }
    } catch (error) {
        console.error('Ошибка при входе:', error);
        throw error;
    }
}

/**
 * Выход пользователя
 */
async function logout() {
    try {
        console.log('Выполняется выход из системы...');
        const response = await fetch('/logout', {
            method: 'POST',
            credentials: 'include',
        });
        console.log('Ответ сервера на запрос выхода:', response.status, response.statusText);
    } catch (error) {
        console.error('Ошибка при выходе:', error);
    }

    console.log('Очистка текущего пользователя и обновление UI...');
    currentUser = null;
    updateAuthUI();
    console.log('Удаление токена из куки...');
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    console.log('Перезагрузка страницы после выхода...');
    window.location.reload();
}

/**
 * Проверка статуса аутентификации при загрузке
 */
async function checkAuthStatus() {
    try {
        console.log('Проверка статуса аутентификации...');
        console.log('Текущие cookies:', document.cookie);
        
        const token = document.cookie.split('; ').find(row => row.startsWith('token='));
        console.log('Найден токен:', token);
        
        if (token) {
            const email = decodeToken(token.split('=')[1]);
            console.log('Декодированное имя пользователя:', email);
            
            if (email) {
                // Получаем информацию о пользователе с сервера
                const response = await fetch('/user/info', {
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const userData = await response.json();
                    currentUser = {
                        email: userData.email,
                        role: userData.role,
                        isAdmin: userData.isAdmin,
                        isTeacher: userData.isTeacher
                    };
                    updateAuthUI();
                    dispatchAuthSuccess();
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Ошибка проверки аутентификации:', error);
        return false;
    }
}

/**
 * Декодирование JWT токена
 */
function decodeToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload);
        return payload.email;
    } catch (error) {
        return null;
    }
}

/**
 * Обновление UI в зависимости от состояния аутентификации
 */
function updateAuthUI() {
    console.log('Обновление UI, currentUser:', currentUser);
    const authContainer = document.getElementById('auth-container');
    const mapContainer = document.getElementById('map-container');
    const userInfo = document.querySelector('.user-info');
    const usernameDisplay = document.getElementById('username-display');
    const adminFilePanel = document.getElementById('admin-file-panel');
    const adminRolePanel = document.getElementById('admin-role-panel');

    if (currentUser) {
        console.log('Показываем интерфейс для авторизованного пользователя');
        authContainer.style.display = 'none';
        mapContainer.style.display = 'block';
        userInfo.style.display = 'block';
        // Отображаем роль пользователя
        let roleText = '';
        if (currentUser.isAdmin) {
            roleText = ' (Admin)';
        } else if (currentUser.isTeacher) {
            roleText = ' (Teacher)';
        }
        usernameDisplay.textContent = currentUser.email + roleText;
        
        // Показываем или скрываем админ-панели (для админов и учителей)
        const isAdminOrTeacher = currentUser.isAdmin || currentUser.isTeacher;
        if (adminFilePanel && adminRolePanel) {
            console.log('Обновление админ-панелей, isAdmin:', currentUser.isAdmin, 'isTeacher:', currentUser.isTeacher);
            adminFilePanel.style.display = isAdminOrTeacher ? 'block' : 'none';
            // Панель управления ролями только для админов
            adminRolePanel.style.display = currentUser.isAdmin ? 'block' : 'none';
            if (currentUser.isAdmin) {
                console.log('Загрузка списка пользователей для админа');
                loadUserList();
            }
        }
    } else {
        console.log('Показываем форму входа');
        authContainer.style.display = 'flex';
        mapContainer.style.display = 'none';
        userInfo.style.display = 'none';
        if (adminFilePanel && adminRolePanel) {
            adminFilePanel.style.display = 'none';
            adminRolePanel.style.display = 'none';
        }
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
}

/**
 * Отправка события успешной аутентификации
 */
function dispatchAuthSuccess() {
    const event = new Event('authSuccess');
    document.dispatchEvent(event);
}

/**
 * Проверка аутентификации пользователя
 */
function isAuthenticated() {
    return currentUser !== null;
}

/**
 * Получение текущего пользователя
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * Проверка формата email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Обновление роли пользователя
 */
async function updateUserRole() {
    const email = document.getElementById('admin-user-list').value;
    const role = document.getElementById('admin-role-select').value;
    // Удалить обработку schoolNumber
    if (!email || !role) {
        alert('Введите email и выберите роль');
        return;
    }
    try {
        const response = await fetch(`/admin/set-role?email=${encodeURIComponent(email)}&role=${role}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Ошибка обновления роли');
        }

        alert(result.message);
        loadUserList();
    } catch (error) {
        console.error('Ошибка при обновлении роли:', error);
        alert('Ошибка: ' + error.message);
    }
}

/**
 * Загрузка списка пользователей для админ-панели
 */
async function loadUserList() {
    try {
        const usersResponse = await fetch('/admin/users', {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        const users = await usersResponse.json();
        if (!usersResponse.ok) {
            throw new Error(users.error || 'Ошибка получения списка пользователей');
        }

        // Заполняем выпадающее меню email пользователей
        const emailSelect = document.getElementById('admin-user-list');
            emailSelect.innerHTML = '<option value="">Выберите пользователя...</option>';
        users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.email;
                option.textContent = `${user.email} (${user.role})`;
                emailSelect.appendChild(option);
            });
    } catch (error) {
        console.error('Ошибка при загрузке списка пользователей:', error);
    }
}

export { initAuth, isAuthenticated, getCurrentUser };