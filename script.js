// ============================================================
// CONFIGURACIÓN
// ============================================================
const API_KEY = 'abce361a6e615da34d2b863e8f047c0e';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const STORAGE_CITY = 'ultimaCiudad';
const STORAGE_FAVS = 'favoritos';

// Elementos del DOM
const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const locationBtn = document.getElementById('location-btn');
const cityNameEl = document.getElementById('city-name');
const localTimeEl = document.getElementById('local-time');
const temperatureEl = document.getElementById('temperature');
const feelsLikeEl = document.getElementById('feels-like');
const descriptionEl = document.getElementById('description');
const humidityEl = document.getElementById('humidity');
const windEl = document.getElementById('wind');
const visibilityEl = document.getElementById('visibility');
const pressureEl = document.getElementById('pressure');
const sunTimesEl = document.getElementById('sun-times');
const moonInfoEl = document.getElementById('moon-info');
const weatherIconEl = document.getElementById('weather-icon');
const favBtn = document.getElementById('fav-btn');
const errorMessageEl = document.getElementById('error-message');
const favoritesContainer = document.getElementById('favorites-container');
const favoritesList = document.getElementById('favorites-list');
const airContainer = document.getElementById('air-container');
const airCard = document.getElementById('air-card');
const airAqiEl = document.getElementById('air-aqi');
const airDetailsEl = document.getElementById('air-details');
const hourlyContainer = document.getElementById('hourly-container');
const hourlyList = document.getElementById('hourly-list');
const forecastContainer = document.getElementById('forecast-container');
const forecastList = document.getElementById('forecast-list');
const chartContainer = document.getElementById('chart-container');

// Modal
const modal = document.getElementById('day-modal');
const modalClose = document.getElementById('modal-close');
const modalTitle = document.getElementById('modal-title');
const modalList = document.getElementById('modal-list');

// Estado
let chartInstance = null;
let forecastDaysMap = {};
let currentCity = null;
let favorites = JSON.parse(localStorage.getItem(STORAGE_FAVS) || '[]');
let clockInterval = null;
let currentTimezoneOffset = 0;

// ============================================================
// API
// ============================================================
async function callAPI(endpoint, params) {
    const query = new URLSearchParams({
        ...params,
        appid: API_KEY,
        units: 'metric',
        lang: 'es'
    });

    const url = `${BASE_URL}/${endpoint}?${query.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        switch (response.status) {
            case 401: throw new Error('API Key inválida.');
            case 404: throw new Error('Ciudad no encontrada. Prueba "Cordoba,AR".');
            case 429: throw new Error('Demasiadas peticiones. Espera un minuto.');
            default: throw new Error(`Error ${response.status}: ${data.message || 'desconocido'}`);
        }
    }
    return data;
}

// ============================================================
// Helpers
// ============================================================
function getPrecipText(item) {
    const rain = item.rain?.['3h'] || 0;
    const snow = item.snow?.['3h'] || 0;
    if (rain === 0 && snow === 0) return '';
    const parts = [];
    if (rain > 0) parts.push(`💧 ${rain.toFixed(1)} mm`);
    if (snow > 0) parts.push(`❄️ ${snow.toFixed(1)} mm`);
    return parts.join(' · ');
}

function getWindDirection(deg) {
    if (deg === undefined || deg === null) return '';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    const index = Math.round(deg / 22.5) % 16;
    return dirs[index];
}

function getWeatherIconImg(iconCode, size = '') {
    return `<img src="https://openweathermap.org/img/wn/${iconCode}${size}.png" alt="clima">`;
}

function formatLocalTime(utcTimestamp, timezoneOffset) {
    const date = new Date((utcTimestamp + timezoneOffset) * 1000);
    return date.toISOString().substr(11, 5);
}

function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    const updateClock = () => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cityTime = new Date(utc + (currentTimezoneOffset * 1000));
        localTimeEl.textContent = `🕒 ${cityTime.toLocaleTimeString('es-ES')}`;
    };
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function getMoonPhase() {
    const now = new Date();
    const lp = 2551443;
    const newMoon = new Date('2000-01-06T18:14:00Z').getTime() / 1000;
    const phase = ((now.getTime() / 1000) - newMoon) % lp;
    const age = phase / (24 * 3600);

    if (age < 1.84) return '🌑 Luna Nueva';
    if (age < 5.53) return '🌒 Luna Creciente';
    if (age < 9.22) return '🌓 Cuarto Creciente';
    if (age < 12.91) return '🌔 Gibosa Creciente';
    if (age < 16.61) return '🌕 Luna Llena';
    if (age < 20.30) return '🌖 Gibosa Menguante';
    if (age < 23.99) return '🌗 Cuarto Menguante';
    if (age < 27.68) return '🌘 Luna Menguante';
    return '🌑 Luna Nueva';
}

function updateBackground(iconCode) {
    const isNight = iconCode.endsWith('n');
    const code = iconCode.substring(0, 2);
    let cls = 'bg-default';

    if (code === '01') cls = isNight ? 'bg-clear-night' : 'bg-clear-day';
    else if (['02', '03', '04'].includes(code)) cls = isNight ? 'bg-clouds-night' : 'bg-clouds-day';
    else if (['09', '10'].includes(code)) cls = 'bg-rain';
    else if (code === '11') cls = 'bg-thunder';
    else if (code === '13') cls = 'bg-snow';
    else if (code === '50') cls = 'bg-mist';

    document.body.className = cls;
}

// ============================================================
// Clima actual
// ============================================================
async function getCurrentWeather(params) {
    clearError();
    try {
        const data = await callAPI('weather', params);
        displayWeather(data);
    } catch (error) {
        showError(error.message);
        [forecastContainer, hourlyContainer, chartContainer, airContainer]
            .forEach(el => el.style.display = 'none');
    }
}

function displayWeather(data) {
    const { name, main, weather, wind, sys, coord, timezone, visibility } = data;

    cityNameEl.textContent = `${name}, ${sys.country}`;
    temperatureEl.textContent = `${Math.round(main.temp)}°C`;
    feelsLikeEl.textContent = `ST: ${Math.round(main.feels_like)}°C`;
    descriptionEl.textContent = weather[0].description;
    
    humidityEl.textContent = `${main.humidity}%`;
    visibilityEl.textContent = `${(visibility / 1000).toFixed(1)} km`;
    pressureEl.textContent = `${main.pressure} hPa`;

    const windDir = getWindDirection(wind.deg);
    windEl.textContent = `${(wind.speed * 3.6).toFixed(1)} km/h ${windDir}`;

    const sunrise = formatLocalTime(sys.sunrise, timezone);
    const sunset = formatLocalTime(sys.sunset, timezone);
    sunTimesEl.textContent = `🌅 ${sunrise} · 🌇 ${sunset}`;

    const daylightSeconds = sys.sunset - sys.sunrise;
    const hours = Math.floor(daylightSeconds / 3600);
    const minutes = Math.floor((daylightSeconds % 3600) / 60);
    
    moonInfoEl.innerHTML = `☀️ ${hours}h ${minutes}m<br>${getMoonPhase()}`;

    weatherIconEl.innerHTML = getWeatherIconImg(weather[0].icon, '@4x');
    
    cityInput.value = name;
    currentTimezoneOffset = timezone;
    startClock();

    currentCity = { name, country: sys.country, lat: coord.lat, lon: coord.lon };
    updateFavButton();
    updateBackground(weather[0].icon);

    getAirQuality(coord.lat, coord.lon);
}

// ============================================================
// Calidad del aire
// ============================================================
async function getAirQuality(lat, lon) {
    try {
        const url = `${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const aqi = data.list[0].main.aqi;
        const c = data.list[0].components;

        const labels = { 1: '🟢 Buena', 2: '🟡 Aceptable', 3: '🟠 Moderada', 4: '🔴 Pobre', 5: '🟣 Muy pobre' };

        airAqiEl.textContent = `AQI: ${labels[aqi] || '--'}`;
        airDetailsEl.textContent = `PM2.5: ${c.pm2_5.toFixed(1)} µg/m³ · PM10: ${c.pm10.toFixed(1)} µg/m³ · NO₂: ${c.no2.toFixed(1)} · O₃: ${c.o3.toFixed(1)}`;

        airCard.className = `air-card aqi-${aqi}`;
        airContainer.style.display = 'block';
    } catch {
        airContainer.style.display = 'none';
    }
}

// ============================================================
// Pronóstico
// ============================================================
async function getForecast(params) {
    try {
        const data = await callAPI('forecast', params);
        buildForecastDaysMap(data);
        displayHourly(data);
        displayForecast(data);
        displayChart(data);
    } catch {
        [forecastContainer, hourlyContainer, chartContainer]
            .forEach(el => el.style.display = 'none');
    }
}

function buildForecastDaysMap(data) {
    forecastDaysMap = {};
    data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (!forecastDaysMap[key]) forecastDaysMap[key] = [];
        forecastDaysMap[key].push(item);
    });
}

// ============================================================
// Cargar
// ============================================================
function loadWeatherByCity(city, save = true) {
    if (save) localStorage.setItem(STORAGE_CITY, city);
    getCurrentWeather({ q: city });
    getForecast({ q: city });
}

function loadWeatherByCoords(lat, lon) {
    localStorage.removeItem(STORAGE_CITY);
    getCurrentWeather({ lat, lon });
    getForecast({ lat, lon });
}

// ============================================================
// Próximas 24h
// ============================================================
function displayHourly(data) {
    const items = [...data.list].sort((a, b) => a.dt - b.dt).slice(0, 8);
    hourlyList.innerHTML = '';

    items.forEach(item => {
        const date = new Date(item.dt * 1000);
        const hour = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const temp = Math.round(item.main.temp);
        const precip = getPrecipText(item);

        const card = document.createElement('div');
        card.className = 'hour-card';
        card.innerHTML = `
            <div class="hour-time">${hour}</div>
            <div class="hour-icon">${getWeatherIconImg(item.weather[0].icon)}</div>
            <div class="hour-temp">${temp}°C</div>
            <div class="hour-precip">${precip}</div>
        `;
        hourlyList.appendChild(card);
    });

    hourlyContainer.style.display = 'block';
}

// ============================================================
// Pronóstico 5 días
// ============================================================
function displayForecast(data) {
    const daily = {};

    data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        if (!daily[key]) {
            daily[key] = { date, temps: [], icons: [], descriptions: [], rain: 0, snow: 0 };
        }
        daily[key].temps.push(item.main.temp);
        daily[key].icons.push(item.weather[0].icon);
        daily[key].descriptions.push(item.weather[0].description);
        daily[key].rain += item.rain?.['3h'] || 0;
        daily[key].snow += item.snow?.['3h'] || 0;
    });

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const days = Object.entries(daily).filter(([key]) => key !== todayKey).slice(0, 5);
    const finalDays = days.length > 0 ? days : Object.entries(daily).slice(0, 5);

    forecastList.innerHTML = '';

    finalDays.forEach(([key, day]) => {
        const min = Math.round(Math.min(...day.temps));
        const max = Math.round(Math.max(...day.temps));
        const midIndex = Math.floor(day.icons.length / 2);
        const icon = day.icons[midIndex];
        const desc = day.descriptions[midIndex];

        let precipHtml = '';
        if (day.rain > 0 || day.snow > 0) {
            const parts = [];
            if (day.rain > 0) parts.push(`💧 ${day.rain.toFixed(1)} mm`);
            if (day.snow > 0) parts.push(`❄️ ${day.snow.toFixed(1)} mm`);
            precipHtml = `<div class="forecast-precip">${parts.join('<br>')}</div>`;
        }

        const dayName = day.date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.innerHTML = `
            <div class="forecast-day">${dayName}</div>
            <div class="forecast-icon">${getWeatherIconImg(icon)}</div>
            <div class="forecast-temp">${max}°C<span class="min">${min}°C</span></div>
            <div class="forecast-desc">${desc}</div>
            ${precipHtml}
        `;

        card.addEventListener('click', () => openDayModal(key, day.date));
        card.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDayModal(key, day.date);
            }
        });

        forecastList.appendChild(card);
    });

    forecastContainer.style.display = 'block';
}

// ============================================================
// Modal
// ============================================================
function openDayModal(dayKey, date) {
    const blocks = forecastDaysMap[dayKey];
    if (!blocks || blocks.length === 0) return;

    modalTitle.textContent = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    modalList.innerHTML = '';

    blocks.forEach(item => {
        const blockDate = new Date(item.dt * 1000);
        const hour = blockDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const temp = Math.round(item.main.temp);
        const desc = item.weather[0].description;
        const humidity = item.main.humidity;
        const precip = getPrecipText(item);

        const row = document.createElement('div');
        row.className = 'modal-row';
        row.innerHTML = `
            <span class="row-time">${hour}</span>
            <span class="row-icon">${getWeatherIconImg(item.weather[0].icon)}</span>
            <span class="row-desc">${desc} · ${humidity}%${precip ? `<span class="row-precip">${precip}</span>` : ''}</span>
            <span class="row-temp">${temp}°C</span>
        `;
        modalList.appendChild(row);
    });

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeDayModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeDayModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeDayModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('show')) closeDayModal(); });

// ============================================================
// Gráfico
// ============================================================
function displayChart(data) {
    const labels = [];
    const temps = [];

    data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        labels.push(date.toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit' }));
        temps.push(Math.round(item.main.temp * 10) / 10);
    });

    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('temp-chart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Temperatura (°C)',
                data: temps,
                borderColor: '#5bc0de',
                backgroundColor: 'rgba(116, 235, 213, 0.25)',
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#74ebd5',
                pointBorderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}°C` } }
            },
            scales: {
                y: { ticks: { callback: (v) => `${v}°C`, color: '#666' }, grid: { color: '#eee' } },
                x: { ticks: { color: '#666', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } }
            }
        }
    });

    chartContainer.style.display = 'block';
}

// ============================================================
// Favoritos
// ============================================================
function updateFavButton() {
    if (!currentCity) return;
    const isFav = favorites.some(f => f.name.toLowerCase() === currentCity.name.toLowerCase());
    favBtn.textContent = isFav ? '★' : '☆';
    favBtn.classList.toggle('active', isFav);
}

function toggleFavorite() {
    if (!currentCity) return;
    const idx = favorites.findIndex(f => f.name.toLowerCase() === currentCity.name.toLowerCase());

    if (idx >= 0) favorites.splice(idx, 1);
    else favorites.push({ ...currentCity });

    localStorage.setItem(STORAGE_FAVS, JSON.stringify(favorites));
    renderFavorites();
    updateFavButton();
}

function renderFavorites() {
    favoritesList.innerHTML = '';
    if (favorites.length === 0) {
        favoritesContainer.style.display = 'none';
        return;
    }

    favorites.forEach(fav => {
        const chip = document.createElement('div');
        chip.className = 'fav-chip';
        chip.innerHTML = `<span>${fav.name}${fav.country ? ', ' + fav.country : ''}</span><button class="remove" title="Quitar">✕</button>`;

        chip.querySelector('span').addEventListener('click', () => loadWeatherByCoords(fav.lat, fav.lon));
        chip.querySelector('.remove').addEventListener('click', (e) => {
            e.stopPropagation();
            favorites = favorites.filter(f => f.name !== fav.name);
            localStorage.setItem(STORAGE_FAVS, JSON.stringify(favorites));
            renderFavorites();
            updateFavButton();
        });

        favoritesList.appendChild(chip);
    });

    favoritesContainer.style.display = 'block';
}

favBtn.addEventListener('click', toggleFavorite);

// ============================================================
// Geolocalización
// ============================================================
function getUserLocation() {
    if (!navigator.geolocation) {
        showError('La geolocalización no está soportada por tu navegador');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => loadWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
        (error) => {
            const msgs = { 1: 'Permiso de ubicación denegado', 2: 'Ubicación no disponible', 3: 'Tiempo de espera agotado' };
            showError(msgs[error.code] || 'Error al obtener la ubicación');
        }
    );
}

// ============================================================
// Utilidades
// ============================================================
function showError(msg) { errorMessageEl.textContent = `❌ ${msg}`; }
function clearError() { errorMessageEl.textContent = ''; }

// ============================================================
// Eventos
// ============================================================
searchBtn.addEventListener('click', () => {
    const city = cityInput.value.trim();
    if (city) loadWeatherByCity(city);
    else showError('Por favor, ingresa una ciudad');
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const city = cityInput.value.trim();
        if (city) loadWeatherByCity(city);
        else showError('Por favor, ingresa una ciudad');
    }
});

locationBtn.addEventListener('click', getUserLocation);

// ============================================================
// Inicialización
// ============================================================
window.addEventListener('load', () => {
    renderFavorites();
    const savedCity = localStorage.getItem(STORAGE_CITY);
    if (savedCity) loadWeatherByCity(savedCity, false);
    else getUserLocation();
});
