// Primera versión mejorada de Clima.
// Reemplazá el texto de API_KEY por una clave nueva de OpenWeatherMap.
// Importante: una clave en JavaScript queda visible para cualquier visitante.
// Para producción, lo correcto es consultar la API desde un backend/proxy.

const API_KEY = "abce361a6e615da34d2b863e8f047c0e";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const STORAGE_CITY = "clima_ultima_ciudad";
const STORAGE_FAVS = "clima_favoritos";

const $ = (id) => document.getElementById(id);
const els = {
  cityInput: $("city-input"), searchBtn: $("search-btn"), locationBtn: $("location-btn"),
  cityName: $("city-name"), localTime: $("local-time"), temperature: $("temperature"),
  feelsLike: $("feels-like"), description: $("description"), humidity: $("humidity"),
  wind: $("wind"), visibility: $("visibility"), pressure: $("pressure"),
  weatherIcon: $("weather-icon"), favBtn: $("fav-btn"), error: $("error-message"),
  favoritesContainer: $("favorites-container"), favoritesList: $("favorites-list"),
  hourlyList: $("hourly-list"), forecastList: $("forecast-list"), chart: $("temp-chart"),
  todayMax: $("today-max"), todayMin: $("today-min"), todayRain: $("today-rain"),
  sunTimes: $("sun-times"), updatedAt: $("updated-at"), weatherTip: $("weather-tip"),
  airContainer: $("air-container"), airCard: $("air-card"), airAqi: $("air-aqi"),
  airDetails: $("air-details"), modal: $("day-modal"), modalTitle: $("modal-title"),
  modalList: $("modal-list"), modalClose: $("modal-close")
};

let currentCity = null;
let currentTimezone = 0;
let forecastByDay = {};
let chartInstance = null;
let favorites = JSON.parse(localStorage.getItem(STORAGE_FAVS) || "[]");

async function api(endpoint, params) {
  if (!API_KEY || API_KEY === "TU_API_KEY_DE_OPENWEATHERMAP") {
    throw new Error("Primero tenés que configurar tu clave de OpenWeatherMap en script.js.");
  }
  const query = new URLSearchParams({ ...params, appid: API_KEY, units: "metric", lang: "es" });
  const response = await fetch(`${BASE_URL}/${endpoint}?${query}`);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error("La clave de OpenWeatherMap no es válida o todavía no está activa.");
    if (response.status === 404) throw new Error("No encontramos esa localidad. Probá agregando el país, por ejemplo: Córdoba,AR.");
    if (response.status === 429) throw new Error("Se alcanzó el límite de consultas. Intentá nuevamente en un momento.");
    throw new Error(data.message || `Error ${response.status}`);
  }
  return data;
}

function localDate(date, offset) {
  // Convierte una fecha UTC a una fecha cuyos getters representan la hora local de la ciudad.
  return new Date(date.getTime() + offset * 1000);
}
function dateKey(timestamp, offset) {
  const d = localDate(new Date(timestamp * 1000), offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
function cityTime(timestamp, offset, options) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", ...options }).format(localDate(new Date(timestamp * 1000), offset));
}
function clockForCity(offset) {
  const now = new Date();
  const cityDate = localDate(now, offset);
  return new Intl.DateTimeFormat("es-AR", { timeZone:"UTC", weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" }).format(cityDate);
}
function emoji(icon) {
  const map = { "01d":"☀️","01n":"🌙","02d":"🌤️","02n":"☁️","03d":"☁️","03n":"☁️","04d":"☁️","04n":"☁️","09d":"🌧️","09n":"🌧️","10d":"🌦️","10n":"🌧️","11d":"⛈️","11n":"⛈️","13d":"❄️","13n":"❄️","50d":"🌫️","50n":"🌫️" };
  return map[icon] || "🌤️";
}
function windDirection(deg) {
  if (deg == null) return "";
  return ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"][Math.round(deg/22.5)%16];
}
function precipProbability(item) { return Math.round((item.pop || 0) * 100); }
function precipAmount(item) {
  const rain = item.rain?.["3h"] || 0;
  const snow = item.snow?.["3h"] || 0;
  const parts = [];
  if (rain > 0) parts.push(`${rain.toFixed(1)} mm`);
  if (snow > 0) parts.push(`${snow.toFixed(1)} mm nieve`);
  return parts.join(" · ");
}
function showError(message) { els.error.textContent = `⚠ ${message}`; }
function clearError() { els.error.textContent = ""; }

async function loadByCity(city, save=true) {
  clearError();
  if (save) localStorage.setItem(STORAGE_CITY, city);
  await loadWeather({ q: city });
}
async function loadByCoords(lat, lon) {
  clearError();
  localStorage.removeItem(STORAGE_CITY); // Borra la ciudad guardada para priorizar el GPS
  await loadWeather({ lat, lon });
}
async function loadWeather(params) {
  els.updatedAt.textContent = "Actualizando…";
  try {
    const [current, forecast] = await Promise.all([api("weather", params), api("forecast", params)]);
    currentTimezone = current.timezone || 0;
    currentCity = { name: current.name, country: current.sys.country, lat: current.coord.lat, lon: current.coord.lon };
    renderCurrent(current);
    renderForecast(forecast);
    renderFavorites();
    updateFavoriteButton();
    els.updatedAt.textContent = `Actualizado ${new Intl.DateTimeFormat("es-AR",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`;
    els.cityInput.value = current.name;
    loadAirQuality(current.coord.lat, current.coord.lon);
  } catch (error) {
    showError(error.message);
    els.updatedAt.textContent = "No se pudo actualizar";
  }
}
function renderCurrent(data) {
  const weather = data.weather[0];
  els.cityName.textContent = `${data.name}, ${data.sys.country}`;
  els.localTime.textContent = clockForCity(data.timezone);
  els.temperature.textContent = `${Math.round(data.main.temp)}°`;
  els.feelsLike.textContent = `Sensación térmica: ${Math.round(data.main.feels_like)}°`;
  els.description.textContent = weather.description;
  els.weatherIcon.textContent = emoji(weather.icon);
  els.humidity.textContent = `${data.main.humidity}%`;
  els.wind.textContent = `${(data.wind.speed*3.6).toFixed(1)} km/h ${windDirection(data.wind.deg)}`;
  els.pressure.textContent = `${data.main.pressure} hPa`;
  els.visibility.textContent = data.visibility != null ? `${(data.visibility/1000).toFixed(1)} km` : "—";
  els.sunTimes.textContent = `Amanecer ${cityTime(data.sys.sunrise,data.timezone,{hour:"2-digit",minute:"2-digit"})} · Atardecer ${cityTime(data.sys.sunset,data.timezone,{hour:"2-digit",minute:"2-digit"})}`;
  const code = weather.icon.slice(0,2);
  document.body.dataset.weather = code;
}
function renderForecast(data) {
  const list = data.list;
  const todayKey = dateKey(list[0].dt, currentTimezone);
  forecastByDay = {};
  list.forEach(item => {
    const key = dateKey(item.dt, currentTimezone);
    (forecastByDay[key] ||= []).push(item);
  });
  const entries = Object.entries(forecastByDay);
  const todayItems = forecastByDay[todayKey] || [];
  if (todayItems.length) {
    els.todayMax.textContent = `${Math.round(Math.max(...todayItems.map(x=>x.main.temp_max)))}°`;
    els.todayMin.textContent = `${Math.round(Math.min(...todayItems.map(x=>x.main.temp_min)))}°`;
    els.todayRain.textContent = `${precipProbability(todayItems[0])}%`;
  }
  const next24 = list.slice(0,8);
  renderHourly(next24);
  const futureDays = entries.filter(([key]) => key !== todayKey).slice(0,5);
  renderDaily(futureDays);
  renderChart(next24);
  updateWeatherTip(next24);
}
function renderHourly(items) {
  els.hourlyList.innerHTML = "";
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "hour-card";
    const time = cityTime(item.dt,currentTimezone,{hour:"2-digit",minute:"2-digit"});
    const rain = precipProbability(item);
    card.innerHTML = `<span class="hour-time">${time}</span><span class="hour-icon">${emoji(item.weather[0].icon)}</span><strong class="hour-temp">${Math.round(item.main.temp)}°</strong><span class="hour-rain ${rain===0?"muted":""}">${rain}% lluvia</span>`;
    els.hourlyList.appendChild(card);
  });
}
function renderDaily(days) {
  els.forecastList.innerHTML = "";
  if (!days.length) {
    els.forecastList.textContent = "No hay suficientes datos para mostrar el pronóstico.";
    return;
  }
  days.forEach(([key,items]) => {
    const temps = items.map(x=>x.main.temp);
    const min = Math.round(Math.min(...temps));
    const max = Math.round(Math.max(...temps));
    const representative = items[Math.floor(items.length/2)] || items[0];
    const rain = Math.max(...items.map(precipProbability));
    const date = localDate(new Date(items[0].dt*1000),currentTimezone);
    const dayName = new Intl.DateTimeFormat("es-AR",{timeZone:"UTC",weekday:"long",day:"numeric"}).format(date);
    const row = document.createElement("div");
    row.className = "forecast-row";
    row.tabIndex = 0;
    row.setAttribute("role","button");
    row.innerHTML = `<span class="forecast-day">${dayName}</span><span class="forecast-icon">${emoji(representative.weather[0].icon)}</span><span class="forecast-range"><strong>${max}°</strong><span class="range-track"></span>${min}°</span><span class="forecast-rain">${rain>0?`☂ ${rain}%`:"—"}</span>`;
    row.addEventListener("click",()=>openDay(key,dayName));
    row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDay(key,dayName);}});
    els.forecastList.appendChild(row);
  });
}
function openDay(key,label) {
  const items = forecastByDay[key] || [];
  els.modalTitle.textContent = label;
  els.modalList.innerHTML = "";
  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "modal-row";
    const time = cityTime(item.dt,currentTimezone,{hour:"2-digit",minute:"2-digit"});
    const rain = precipProbability(item);
    const amount = precipAmount(item);
    row.innerHTML = `<span>${time}</span><span>${emoji(item.weather[0].icon)}</span><span>${item.weather[0].description} · ${rain}% lluvia${amount?` · ${amount}`:""}</span><span>${Math.round(item.main.temp)}°</span>`;
    els.modalList.appendChild(row);
  });
  els.modal.classList.add("show");
  els.modal.setAttribute("aria-hidden","false");
}
function closeModal() { els.modal.classList.remove("show"); els.modal.setAttribute("aria-hidden","true"); }
function renderChart(items) {
  if (chartInstance) chartInstance.destroy();
  const labels = items.map(x=>cityTime(x.dt,currentTimezone,{hour:"2-digit"}));
  const values = items.map(x=>Math.round(x.main.temp));
  chartInstance = new Chart(els.chart.getContext("2d"), {
    type:"line",
    data:{labels,datasets:[{data:values,label:"Temperatura",borderColor:"#338fc5",backgroundColor:"rgba(51,143,197,.12)",fill:true,tension:.38,pointRadius:2,pointHoverRadius:5,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.y}°C`}}},scales:{x:{grid:{display:false},ticks:{color:"#8798a8",maxTicksLimit:8}},y:{grid:{color:"#edf2f6"},ticks:{color:"#8798a8",callback:v=>`${v}°`}}}}
  });
}
async function loadAirQuality(lat,lon) {
  try {
    const data = await api("air_pollution",{lat,lon});
    const aqi = data.list[0].main.aqi;
    const labels = {1:"Buena",2:"Aceptable",3:"Moderada",4:"Mala",5:"Muy mala"};
    const c = data.list[0].components;
    els.airAqi.textContent = `Calidad ${labels[aqi] || "sin datos"}`;
    els.airDetails.textContent = `PM2.5 ${c.pm2_5.toFixed(1)} · PM10 ${c.pm10.toFixed(1)} · NO₂ ${c.no2.toFixed(1)} µg/m³`;
    els.airCard.style.borderLeftColor = ["","#65ad80","#a7bd65","#e4b64d","#e58b4b","#d85c5c"][aqi] || "#65ad80";
    els.airContainer.hidden = false;
  } catch { els.airContainer.hidden = true; }
}
function updateWeatherTip(items) {
  const maxRain = Math.max(...items.map(precipProbability));
  const maxWind = Math.max(...items.map(x=>x.wind?.speed || 0))*3.6;
  if (maxRain >= 60) els.weatherTip.textContent = `Hay una probabilidad elevada de lluvia en las próximas horas (hasta ${maxRain}%). Conviene salir con paraguas.`;
  else if (maxWind >= 35) els.weatherTip.textContent = `Se esperan ráfagas o vientos sostenidos relevantes: hasta ${Math.round(maxWind)} km/h en el período.`;
  else els.weatherTip.textContent = "No se observa una señal destacada de lluvia o viento fuerte en las próximas horas. Consultá nuevamente antes de salir.";
}
function updateFavoriteButton() {
  if (!currentCity) return;
  const saved = favorites.some(f=>f.name.toLowerCase()===currentCity.name.toLowerCase() && f.country===currentCity.country);
  els.favBtn.textContent = saved ? "★" : "☆";
  els.favBtn.classList.toggle("active",saved);
}
function toggleFavorite() {
  if (!currentCity) return;
  const index = favorites.findIndex(f=>f.name.toLowerCase()===currentCity.name.toLowerCase() && f.country===currentCity.country);
  if (index>=0) favorites.splice(index,1); else favorites.push({...currentCity});
  localStorage.setItem(STORAGE_FAVS,JSON.stringify(favorites));
  renderFavorites(); updateFavoriteButton();
}
function renderFavorites() {
  els.favoritesList.innerHTML = "";
  els.favoritesContainer.hidden = favorites.length===0;
  favorites.forEach(fav=>{
    const chip = document.createElement("div"); chip.className="fav-chip";
    const city = document.createElement("button"); city.className="fav-city"; city.textContent=`${fav.name}, ${fav.country}`; city.addEventListener("click",()=>loadByCoords(fav.lat,fav.lon));
    const remove = document.createElement("button"); remove.className="remove"; remove.textContent="×"; remove.title="Quitar de favoritos"; remove.addEventListener("click",()=>{favorites=favorites.filter(x=>!(x.name===fav.name&&x.country===fav.country));localStorage.setItem(STORAGE_FAVS,JSON.stringify(favorites));renderFavorites();updateFavoriteButton();});
    chip.append(city,remove); els.favoritesList.appendChild(chip);
  });
}
function searchCity() {
  const city = els.cityInput.value.trim();
  if (city) loadByCity(city); else showError("Escribí una ciudad para buscar.");
}
function useLocation() {
  if (!navigator.geolocation) { 
    // Si el navegador no soporta GPS, usamos la última ciudad guardada
    const savedCity = localStorage.getItem(STORAGE_CITY);
    if (savedCity) loadByCity(savedCity, false);
    else showError("Tu navegador no permite obtener la ubicación."); 
    return; 
  }
  
  els.updatedAt.textContent = "Buscando ubicación…";
  
  navigator.geolocation.getCurrentPosition(
    pos => loadByCoords(pos.coords.latitude,pos.coords.longitude),
    err => {
      showError(err.code === 1 ? "No se concedió permiso para acceder a la ubicación." : "No pudimos determinar tu ubicación.");
      els.updatedAt.textContent = "Ubicación no disponible";
      
      // Si falla el GPS o se deniega el permiso, cargamos la última ciudad guardada
      const savedCity = localStorage.getItem(STORAGE_CITY);
      if (savedCity) loadByCity(savedCity, false);
    },
    {enableHighAccuracy:false,timeout:12000,maximumAge:300000}
  );
}

els.searchBtn.addEventListener("click",searchCity);
els.cityInput.addEventListener("keydown",e=>{if(e.key==="Enter")searchCity();});
els.locationBtn.addEventListener("click",useLocation);
els.favBtn.addEventListener("click",toggleFavorite);
els.modalClose.addEventListener("click",closeModal);
els.modal.addEventListener("click",e=>{if(e.target.dataset.close==="true")closeModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

renderFavorites();
// AL INICIAR: Siempre intenta obtener el GPS primero.
useLocation();