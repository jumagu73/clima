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
            case 401: throw new Error('API Key inválida o aún no activada.');
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

// NUEVO: Devuelve la etiqueta <img> con la URL oficial de OpenWeatherMap
function getWeatherIconImg(iconCode, size = '') {
    // size puede ser '' o '@2x' o '@4x'
    return `<img src="https://openweathermap.org/img/wn/${iconCode}${size}.png" alt="clima">`;
}

function formatLocalTime(utcTimestamp, timezoneOffset) {
    const date = new Date((utcTimestamp + timezoneOffset) * 1000);
    return date.toISOString().substr(11, 5);
}

// ============================================================
// Reloj en vivo y Fase Lunar
// ============================================================
function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    
    const updateClock = () => {
        const now = new Date();
        // Convertimos la hora UTC actual a la zona horaria de la ciudad buscada
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cityTime = new Date(utc + (currentTimezoneOffset * 1000));
        
        localTimeEl.textContent = `🕒 ${cityTime.toLocaleTimeString('es-ES')}`;
    };
    
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function getMoonPhase() {
    // Algoritmo simple para calcular la edad de la luna (0 a 29.53 días)
    const now = new Date();
    const lp = 2551443; // segundos en un ciclo lunar
    const newMoon = new Date('2000-01-06T18:14:00Z').getTime() / 1000;
    const phase = ((now.getTime() / 1000) - newMoon) % lp;
    const age = phase / (24 * 3600); // días

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
    
    // Nuevos datos
    humidityEl.textContent = `${main.humidity}%`;
    visibilityEl.textContent = `${(visibility / 1000).toFixed(1)} km`;
    pressureEl.textContent = `${main.pressure} hPa`;

    const windDir = getWindDirection(wind.deg);
    windEl.textContent = `${(wind.speed * 3.6).toFixed(1)} km/h ${windDir}`;

    // Amanecer, atardecer y duración del día
    const sunrise = formatLocalTime(sys.sunrise, timezone);
    const sunset = formatLocalTime(sys.sunset, timezone);
    sunTimesEl.textContent = `🌅 ${sunrise} · 🌇 ${sunset}`;

    const daylightSeconds = sys.sunset - sys.sunrise;
    const hours = Math.floor(daylightSeconds / 3600);
    const minutes = Math.floor((daylightSeconds % 3600) / 60);
    
    // Fase lunar
    const moonPhase = getMoonPhase();
    
    moonInfoEl.innerHTML = `☀️ ${hours}h ${minutes}m<br>${moonPhase}`;

    // Usamos el ícono grande (4x) para el clima actual
    weatherIconEl.innerHTML = getWeatherIconImg(weather[0].icon, '@4x');
    
    cityInput.value = name;

    // Reloj en vivo
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