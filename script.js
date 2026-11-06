const API_KEY = 'abce361a6e615da34d2b863e8f047c0e';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const STORAGE_CITY = 'ultimaCiudad';
const STORAGE_FAVS = 'favoritos';

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
const modal = document.getElementById('day-modal');
const modalClose = document.getElementById('modal-close');
const modalTitle = document.getElementById('modal-title');
const modalList = document.getElementById('modal-list');

let chartInstance = null;
let forecastDaysMap = {};
let currentCity = null;
let favorites = JSON.parse(localStorage.getItem(STORAGE_FAVS) || '[]');
let clockInterval = null;
let currentTimezoneOffset = 0;

async function callAPI(endpoint, params) {
    const query = new URLSearchParams({ ...params, appid: API_KEY, units: 'metric', lang: 'es' });
    const res = await fetch(`${BASE_URL}/${endpoint}?${query.toString()}`);
    const data = await res.json();
    if (!res.ok) {
        if (res.status === 401) throw new Error('API Key inválida.');
        if (res.status === 404) throw new Error('Ciudad no encontrada. Prueba "Cordoba,AR".');
        if (res.status === 429) throw new Error('Demasiadas peticiones. Espera un minuto.');
        throw new Error(`Error ${res.status}: ${data.message || 'desconocido'}`);
    }
    return data;
}

function getPrecipText(item) {
    const rain = item.rain?.['3h'] || 0;
    const snow = item.snow?.['3h'] || 0;
    if (rain === 0 && snow === 0) return '';
    let text = [];
    if (rain > 0) text.push(`💧 ${rain.toFixed(1)} mm`);
    if (snow > 0) text.push(`❄️ ${snow.toFixed(1)} mm`);
    return text.join(' · ');
}

function getWindDirection(deg) {
    if (deg == null) return '';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    return dirs[Math.round(deg / 22.5) % 16];
}

// ACÁ ESTÁ LA FUNCIÓN DE LOS EMOJIS QUE TE GUSTAN
function getWeatherEmoji(iconCode) {
    const iconMap = {
        '01d': '☀️', '01n': '🌙',
        '02d': '⛅', '02n': '☁️',
        '03d': '☁️', '03n': '☁️',
        '04d': '☁️', '04n': '☁️',
        '09d': '🌧️', '09n': '🌧️',
        '10d': '🌦️', '10n': '🌧️',
        '11d': '⛈️', '11n': '⛈️',
        '13d': '❄️', '13n': '❄️',
        '50d': '🌫️', '50n': '🌫️'
    };
    return iconMap[iconCode] || '🌍';
}

function formatLocalTime(utc, tz) {
    return new Date((utc + tz) * 1000).toISOString().substr(11, 5);
}

function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    const update = () => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cityTime = new Date(utc + (currentTimezoneOffset * 1000));
        localTimeEl.textContent = `🕒 ${cityTime.toLocaleTimeString('es-ES')}`;
    };
    update();
    clockInterval = setInterval(update, 1000);
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
    const code = iconCode.substring(0, 2);
    const isNight = iconCode.endsWith('n');
    let cls = 'bg-default';
    if (code === '01') cls = isNight ? 'bg-clear-night' : 'bg-clear-day';
    else if (['02', '03', '04'].includes(code)) cls = isNight ? 'bg-clouds-night' : 'bg-clouds-day';
    else if (['09', '10'].includes(code)) cls = 'bg-rain';
    else if (code === '11') cls = 'bg-thunder';
    else if (code === '13') cls = 'bg-snow';
    else if (code === '50') cls = 'bg-mist';
    document.body.className = cls;
}

async function getCurrentWeather(params) {
    clearError();
    try {
        const data = await callAPI('weather', params);
        displayWeather(data);
    } catch (error) {
        showError(error.message);
        [forecastContainer, hourlyContainer, chartContainer, airContainer].forEach(el => el.style.display = 'none');
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
    windEl.textContent = `${(wind.speed * 3.6).toFixed(1)} km/h ${getWindDirection(wind.deg)}`;
    sunTimesEl.textContent = `🌅 ${formatLocalTime(sys.sunrise, timezone)} · 🌇 ${formatLocalTime(sys.sunset, timezone)}`;
    
    const daylightSeconds = sys.sunset - sys.sunrise;
    const hours = Math.floor(daylightSeconds / 3600);
    const minutes = Math.floor((daylightSeconds % 3600) / 60);
    moonInfoEl.innerHTML = `☀️ ${hours}h ${minutes}m<br>${getMoonPhase()}`;
    
    // ACÁ APLICAMOS EL EMOJI EN EL CLIMA ACTUAL
    weatherIconEl.textContent = getWeatherEmoji(weather[0].icon);
    
    cityInput.value = name;
    currentTimezoneOffset = timezone;
    startClock();

    currentCity = { name, country: sys.country, lat: coord.lat, lon: coord.lon };
    updateFavButton();
    updateBackground(weather[0].icon);
    getAirQuality(coord.lat, coord.lon);
}

async function getAirQuality(lat, lon) {
    try {
        const res = await fetch(`${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
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

async function getForecast(params) {
    try {
        const data = await callAPI('forecast', params);
        buildForecastDaysMap(data);
        displayHourly(data);
        displayForecast(data);
        displayChart(data);
    } catch {
        [forecastContainer, hourlyContainer, chartContainer].forEach(el => el.style.display = 'none');
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

function displayHourly(data) {
    const items = [...data.list].sort((a, b) => a.dt - b.dt).slice(0, 8);
    hourlyList.innerHTML = '';
    items.forEach(item => {
        const date = new Date(item.dt * 1000);
        const card = document.createElement('div');
        card.className = 'hour-card';
        // ACÁ APLICAMOS EL EMOJI EN LAS HORAS
        card.innerHTML = `
            <div class="hour-time">${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
            <div class="hour-icon">${getWeatherEmoji(item.weather[0].icon)}</div>
            <div class="hour-temp">${Math.round(item.main.temp)}°C</div>
            <div class="hour-precip">${getPrecipText(item)}</div>
        `;
        hourlyList.appendChild(card);
    });
    hourlyContainer.style.display = 'block';
}

function displayForecast(data) {
    const daily = {};
    data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (!daily[key]) daily[key] = { date, temps: [], icons: [], descriptions: [], rain: 0, snow: 0 };
        daily[key].temps.push(item.main.temp);
        daily[key].icons.push(item.weather[0].icon);
        daily[key].descriptions.push(item.weather[0].description);
        daily[key].rain += item.rain?.['3h'] || 0;
        daily[key].snow += item.snow?.['3h'] || 0;
    });

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const days = Object.entries(daily).filter(([k]) => k !== todayKey).slice(0, 5);
    const finalDays = days.length > 0 ? days : Object.entries(daily).slice(0, 5);

    forecastList.innerHTML = '';
    finalDays.forEach(([key, day]) => {
        const min = Math.round(Math.min(...day.temps));
        const max = Math.round(Math.max(...day.temps));
        const mid = Math.floor(day.icons.length / 2);
        const desc = day.descriptions[mid];
        
        let precipHtml = '';
        if (day.rain > 0 || day.snow > 0) {
            let p = [];
            if (day.rain > 0) p.push(`💧 ${day.rain.toFixed(1)} mm`);
            if (day.snow > 0) p.push(`❄️ ${day.snow.toFixed(1)} mm`);
            precipHtml = `<div class="forecast-precip">${p.join('<br>')}</div>`;
        }

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        // ACÁ APLICAMOS EL EMOJI EN LOS 5 DÍAS
        card.innerHTML = `
            <div class="forecast-day">${day.date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <div class="forecast-icon">${getWeatherEmoji(day.icons[mid])}</div>
            <div class="forecast-temp">${max}°C<span class="min">${min}°C</span></div>
            <div class="forecast-desc">${desc}</div>
            ${precipHtml}
        `;
        card.addEventListener('click', () => openDayModal(key, day.date));
        card.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayModal(key, day.date); }
        });
        forecastList.appendChild(card);
    });
    forecastContainer.style.display = 'block';
}

function openDayModal(dayKey, date) {
    const blocks = forecastDaysMap[dayKey];
    if (!blocks || blocks.length === 0) return;
    modalTitle.textContent = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    modalList.innerHTML = '';
    blocks.forEach(item => {
        const dateObj = new Date(item.dt * 1000);
        const row = document.createElement('div');
        row.className = 'modal-row';
        // ACÁ APLICAMOS EL EMOJI EN EL MODAL
        row.innerHTML = `
            <span class="row-time">${dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="row-icon">${getWeatherEmoji(item.weather[0].icon)}</span>
            <span class="row-desc">${item.weather[0].description} · ${item.main.humidity}%${getPrecipText(item) ? `<span class="row-precip">${getPrecipText(item)}</span>` : ''}</span>
            <span class="row-temp">${Math.round(item.main.temp)}°C</span>
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

function displayChart(data) {
    const labels = [];
    const temps = [];
    data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        labels.push(date.toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit' }));
        temps.push(Math.round(item.main.temp * 10) / 10);
    });

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById('temp-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{ label: 'Temperatura (°C)', data: temps, borderColor: '#5bc0de', backgroundColor: 'rgba(116, 235, 213, 0.25)', tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#74ebd5', pointBorderColor: '#fff', borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}°C` } } },
            scales: { y: { ticks: { callback: (v) => `${v}°C`, color: '#666' }, grid: { color: '#eee' } }, x: { ticks: { color: '#666', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } } }
        }
    });
    chartContainer.style.display = 'block';
}

function updateFavButton() {
    if (!currentCity) return;
    const isFav = favorites.some(f => f.name.toLowerCase() === currentCity.name.toLowerCase());
    favBtn.textContent = isFav ? '★' : '☆';
    favBtn.classList.toggle('active', isFav);
}

function toggleFavorite() {
    if (!currentCity) return;
    const idx = favorites.findIndex(f => f.name.toLowerCase() === currentCity.name.toLowerCase());
    if (idx >= 0) favorites.splice(idx, 1); else favorites.push({ ...currentCity });
    localStorage.setItem(STORAGE_FAVS, JSON.stringify(favorites));
    renderFavorites();
    updateFavButton();
}

function renderFavorites() {
    favoritesList.innerHTML = '';
    if (favorites.length === 0) { favoritesContainer.style.display = 'none'; return; }
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

function getUserLocation() {
    if (!navigator.geolocation) { showError('La geolocalización no está soportada por tu navegador'); return; }
    navigator.geolocation.getCurrentPosition(
        (pos) => loadWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
        (error) => {
            const msgs = { 1: 'Permiso de ubicación denegado', 2: 'Ubicación no disponible', 3: 'Tiempo de espera agotado' };
            showError(msgs[error.code] || 'Error al obtener la ubicación');
        }
    );
}

function showError(msg) { errorMessageEl.textContent = `❌ ${msg}`; }
function clearError() { errorMessageEl.textContent = ''; }

searchBtn.addEventListener('click', () => { const city = cityInput.value.trim(); if (city) loadWeatherByCity(city); else showError('Por favor, ingresa una ciudad'); });
cityInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { const city = cityInput.value.trim(); if (city) loadWeatherByCity(city); else showError('Por favor, ingresa una ciudad'); } });
locationBtn.addEventListener('click', getUserLocation);
favBtn.addEventListener('click', toggleFavorite);
modalClose.addEventListener('click', closeDayModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeDayModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('show')) closeDayModal(); });

window.addEventListener('load', () => {
    renderFavorites();
    const savedCity = localStorage.getItem(STORAGE_CITY);
    if (savedCity) loadWeatherByCity(savedCity, false); else getUserLocation();
});