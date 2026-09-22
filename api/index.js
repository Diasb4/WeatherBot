import { Bot, InlineKeyboard } from 'grammy';
import http from 'http';

// ==========================================
// Конфигурация и переменные окружения
// ==========================================
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '5fc94082b0bd5d73c10e14c959ac190a';
const BOT_TOKEN = process.env.BOT_TOKEN || '';

// Инициализация бота grammY (если токен еще не задан, создаем заглушку, чтобы не падало при сборке)
export const bot = new Bot(BOT_TOKEN || '0000000000:AAFakeTokenForVercelBuildPreview00000');

// ==========================================
// Вспомогательные функции оформления
// ==========================================

/**
 * Экранирование спецсимволов для безопасного HTML в Telegram
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Преобразование двухбуквенного кода страны (RU, US, etc.) в флаг-эмодзи
 */
function getCountryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * Подбор эмодзи состояния погоды по коду OpenWeatherMap
 */
function getWeatherEmoji(weatherId, iconCode = '') {
  const isNight = iconCode.endsWith('n');
  if (weatherId >= 200 && weatherId < 300) return '⛈️'; // Гроза
  if (weatherId >= 300 && weatherId < 400) return '🌦️'; // Морось
  if (weatherId >= 500 && weatherId < 600) {
    if (weatherId === 511) return '🌨️'; // Ледяной дождь
    return weatherId >= 520 ? '🌧️' : '💧'; // Дождь / Ливень
  }
  if (weatherId >= 600 && weatherId < 700) return '❄️'; // Снег
  if (weatherId >= 700 && weatherId < 800) {
    if (weatherId === 781) return '🌪️'; // Торнадо
    return '🌫️'; // Туман / Мгла
  }
  if (weatherId === 800) return isNight ? '🌙' : '☀️'; // Ясно
  if (weatherId === 801) return isNight ? '☁️' : '🌤️'; // Малооблачно
  if (weatherId === 802) return '⛅'; // Переменная облачность
  if (weatherId >= 803) return '☁️'; // Пасмурно
  return '🌡️';
}

/**
 * Направление ветра со стрелочками и названиями
 */
function getWindDirection(deg) {
  if (deg === undefined || deg === null) return 'Переменный';
  const directions = [
    { name: 'Северный', icon: '⬇️' },
    { name: 'Северо-Восточный', icon: '↙️' },
    { name: 'Восточный', icon: '⬅️' },
    { name: 'Юго-Восточный', icon: '↖️' },
    { name: 'Южный', icon: '⬆️' },
    { name: 'Юго-Западный', icon: '↗️' },
    { name: 'Западный', icon: '➡️' },
    { name: 'Северо-Западный', icon: '↘️' }
  ];
  const index = Math.round(deg / 45) % 8;
  return `${directions[index].name} ${directions[index].icon}`;
}

/**
 * Форматирование времени с учетом временной зоны города
 */
function formatLocalTime(timestamp, timezoneOffsetSec = 0) {
  if (!timestamp) return '--:--';
  const date = new Date((timestamp + timezoneOffsetSec) * 1000);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Форматирование температуры со знаком плюс/минус
 */
function formatTemp(t) {
  if (t === undefined || t === null) return '0°C';
  const r = Math.round(t);
  return `${r > 0 ? '+' : ''}${r}°C`;
}

/**
 * Создание красивого текста прогноза погоды
 */
export function formatWeatherHtml(data, locationName = '') {
  const w = data.weather?.[0] || {};
  const m = data.main || {};
  const wind = data.wind || {};
  const sys = data.sys || {};
  const clouds = data.clouds?.all ?? 0;
  const flag = getCountryFlag(sys.country);
  const emoji = getWeatherEmoji(w.id, w.icon);
  
  const cityName = locationName || data.name || 'Город';
  const desc = w.description
    ? w.description.charAt(0).toUpperCase() + w.description.slice(1)
    : 'Погода';

  const temp = formatTemp(m.temp);
  const feelsLike = formatTemp(m.feels_like);
  const tempMin = formatTemp(m.temp_min);
  const tempMax = formatTemp(m.temp_max);

  const windDir = getWindDirection(wind.deg);
  const windSpeed = (wind.speed || 0).toFixed(1) + ' м/с';
  const windGust = wind.gust ? ` (порывы до ${wind.gust.toFixed(1)} м/с)` : '';

  // Перевод hPa в мм рт. ст.
  const pressureMm = Math.round((m.pressure || 1013) * 0.750062);
  const visibilityKm = data.visibility
    ? (data.visibility >= 1000 ? `${(data.visibility / 1000).toFixed(1)} км` : `${data.visibility} м`)
    : 'Хорошая';

  const sunrise = formatLocalTime(sys.sunrise, data.timezone);
  const sunset = formatLocalTime(sys.sunset, data.timezone);
  const localTime = formatLocalTime(Math.floor(Date.now() / 1000), data.timezone);

  return [
    `${emoji} <b>Погода: ${escapeHtml(cityName)}${flag ? ' ' + flag : ''}</b>`,
    `<i>${escapeHtml(desc)}</i>`,
    `────────────────────`,
    `🌡 <b>Температура:</b> ${temp} <i>(ощущается как ${feelsLike})</i>`,
    `📊 <b>Мин / Макс:</b> ${tempMin} / ${tempMax}`,
    `💧 <b>Влажность:</b> ${m.humidity ?? 0}%`,
    `💨 <b>Ветер:</b> ${windSpeed}, ${windDir}${windGust}`,
    `🧭 <b>Давление:</b> ${pressureMm} мм рт. ст. <i>(${m.pressure ?? 1013} гПа)</i>`,
    `☁️ <b>Облачность:</b> ${clouds}%`,
    `👁 <b>Видимость:</b> ${visibilityKm}`,
    ``,
    `🌅 <b>Восход:</b> ${sunrise}   🌇 <b>Закат:</b> ${sunset}`,
    `────────────────────`,
    `🕒 <i>Местное время: ${localTime}</i>`
  ].join('\n');
}

/**
 * Создание интерактивной клавиатуры для погоды
 */
export function createWeatherKeyboard(cityName, lat, lon) {
  const keyboard = new InlineKeyboard();
  
  if (lat !== undefined && lon !== undefined) {
    const latStr = Number(lat).toFixed(3);
    const lonStr = Number(lon).toFixed(3);
    keyboard
      .text('🔄 Обновить', `ref:${latStr}:${lonStr}`)
      .switchInline('↗️ Поделиться', cityName)
      .row()
      .url('📍 На карте', `https://www.google.com/maps/search/?api=1&query=${latStr},${lonStr}`)
      .url('📊 OpenWeather', `https://openweathermap.org/find?q=${encodeURIComponent(cityName)}`);
  } else {
    keyboard
      .switchInline('↗️ Поделиться', cityName)
      .url('📊 OpenWeather', `https://openweathermap.org/find?q=${encodeURIComponent(cityName)}`);
  }
  
  return keyboard;
}

// ==========================================
// Запросы к OpenWeatherMap API
// ==========================================

/**
 * Получение погоды по координатам
 */
export async function fetchWeatherByCoords(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=ru&appid=${OPENWEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeather error: ${res.status}`);
  return await res.json();
}

/**
 * Поиск городов по названию (геокодинг)
 */
export async function searchGeocoding(query, limit = 5) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=${limit}&appid=${OPENWEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  
  // Дедупликация по округленным координатам
  const seen = new Set();
  return list.filter((item) => {
    const key = `${item.lat.toFixed(2)},${item.lon.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Получение погоды по текстовому запросу города
 */
export async function fetchWeatherByQuery(query) {
  // Сначала пробуем прямой поиск по имени
  const directUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&units=metric&lang=ru&appid=${OPENWEATHER_API_KEY}`;
  const directRes = await fetch(directUrl);
  if (directRes.ok) {
    return await directRes.json();
  }

  // Если не вышло напрямую, пробуем через геокодинг
  const geo = await searchGeocoding(query, 1);
  if (geo.length > 0) {
    return await fetchWeatherByCoords(geo[0].lat, geo[0].lon);
  }

  return null;
}

// Список городов по умолчанию для пустого инлайн-запроса
const DEFAULT_POPULAR_CITIES = [
  { name: 'Москва', lat: 55.7558, lon: 37.6173, country: 'RU' },
  { name: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351, country: 'RU' },
  { name: 'Минск', lat: 53.9006, lon: 27.5590, country: 'BY' },
  { name: 'Алматы', lat: 43.2389, lon: 76.8897, country: 'KZ' },
  { name: 'Ташкент', lat: 41.2995, lon: 69.2401, country: 'UZ' }
];

// ==========================================
// Обработчики бота Telegram (grammY)
// ==========================================

// Команда /start
bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .switchInlineCurrent('🔎 Найти погоду', 'Москва')
    .row()
    .url('🌐 О проекте', 'https://openweathermap.org');

  const text = [
    `👋 <b>Привет, ${escapeHtml(ctx.from?.first_name || 'друг')}!</b>`,
    ``,
    `Я бот погоды на базе <b>OpenWeatherMap</b> с поддержкой инлайн-режима.`,
    ``,
    `🌦 <b>Как мной пользоваться:</b>`,
    `• Напиши мне название города в этот чат (например: <code>Москва</code>, <code>Лондон</code>, <code>Токио</code>).`,
    `• Отправь свою геолокацию 📍, чтобы узнать погоду прямо сейчас в твоем месте.`,
    `• Или используй меня <b>в любом чате</b> через инлайн:`,
    `  <code>@${ctx.me?.username || 'bot'} Казань</code>`,
    ``,
    `Нажми кнопку ниже, чтобы попробовать инлайн прямо сейчас! 👇`
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// Команда /help
bot.command('help', async (ctx) => {
  const botUser = ctx.me?.username || 'bot';
  const text = [
    `ℹ️ <b>Справка по боту:</b>`,
    ``,
    `🔹 <b>Инлайн-поиск в любых чатах:</b>`,
    `Просто наберите в поле ввода любого чата:`,
    `<code>@${botUser} название_города</code>`,
    `Например: <code>@${botUser} Париж</code>`,
    ``,
    `🔹 <b>Команды в чате:</b>`,
    `• <code>/weather &lt;город&gt;</code> или просто напишите название города`,
    `• Отправка локации через скрепку Telegram 📎`,
    `• <code>/help</code> — это сообщение`
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
});

// Команда /weather или /погода
bot.command(['weather', 'pogoda'], async (ctx) => {
  const query = ctx.match?.trim();
  if (!query) {
    return ctx.reply('⚠️ Пожалуйста, укажите город после команды. Например:\n<code>/weather Сочи</code>', { parse_mode: 'HTML' });
  }

  const weather = await fetchWeatherByQuery(query);
  if (!weather || weather.cod !== 200) {
    return ctx.reply(`❌ Город "<b>${escapeHtml(query)}</b>" не найден. Попробуйте уточнить название.`, { parse_mode: 'HTML' });
  }

  const html = formatWeatherHtml(weather, weather.name || query);
  const kb = createWeatherKeyboard(weather.name || query, weather.coord?.lat, weather.coord?.lon);
  await ctx.reply(html, { parse_mode: 'HTML', reply_markup: kb });
});

// Обработка входящей геолокации
bot.on(':location', async (ctx) => {
  const { latitude, longitude } = ctx.message.location;
  try {
    const weather = await fetchWeatherByCoords(latitude, longitude);
    const cityName = weather.name || 'Ваше местоположение';
    const html = formatWeatherHtml(weather, cityName);
    const kb = createWeatherKeyboard(cityName, latitude, longitude);
    await ctx.reply(html, { parse_mode: 'HTML', reply_markup: kb });
  } catch (err) {
    console.error('Location weather error:', err);
    await ctx.reply('❌ Не удалось получить погоду для указанных координат.');
  }
});

// ==========================================
// ИНЛАЙН РЕЖИМ (Inline Query)
// ==========================================
bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query?.trim() || '';

  try {
    // 1. Если запрос пустой — выдаем популярные города и карточку-подсказку
    if (query.length === 0) {
      const weatherPromises = DEFAULT_POPULAR_CITIES.map(async (c) => {
        try {
          const w = await fetchWeatherByCoords(c.lat, c.lon);
          const icon = w.weather?.[0]?.icon || '02d';
          const flag = getCountryFlag(c.country);
          const tempStr = formatTemp(w.main?.temp);
          const weatherDesc = w.weather?.[0]?.description || 'Ясно';
          const emoji = getWeatherEmoji(w.weather?.[0]?.id, icon);

          return {
            type: 'article',
            id: `city_${c.lat}_${c.lon}`,
            title: `${flag} ${c.name} — ${tempStr}`,
            description: `${emoji} ${weatherDesc} | 💨 ${(w.wind?.speed || 0).toFixed(1)} м/с | 💧 ${w.main?.humidity || 0}%`,
            thumbnail_url: `https://openweathermap.org/img/wn/${icon}@2x.png`,
            input_message_content: {
              message_text: formatWeatherHtml(w, c.name),
              parse_mode: 'HTML'
            },
            reply_markup: createWeatherKeyboard(c.name, c.lat, c.lon)
          };
        } catch (e) {
          return null;
        }
      });

      const items = (await Promise.all(weatherPromises)).filter(Boolean);

      // Добавим в начало подсказку
      const helpItem = {
        type: 'article',
        id: 'help_prompt',
        title: '🔍 Введите название города...',
        description: 'Например: @' + (ctx.me?.username || 'bot') + ' Казань',
        thumbnail_url: 'https://openweathermap.org/img/wn/02d@2x.png',
        input_message_content: {
          message_text: '🌦 Чтобы узнать погоду в любом городе, просто напишите:\n<code>@' + (ctx.me?.username || 'bot') + ' &lt;город&gt;</code>',
          parse_mode: 'HTML'
        }
      };

      return await ctx.answerInlineQuery([helpItem, ...items], { cache_time: 30 });
    }

    // 2. Если запрос не пустой — ищем через Geocoding API
    const geoList = await searchGeocoding(query, 5);

    if (geoList.length > 0) {
      const results = await Promise.all(
        geoList.map(async (g, idx) => {
          try {
            const w = await fetchWeatherByCoords(g.lat, g.lon);
            const cityName = g.local_names?.ru || g.name || w.name;
            const flag = getCountryFlag(g.country);
            const region = g.state ? `, ${g.state}` : '';
            const icon = w.weather?.[0]?.icon || '01d';
            const emoji = getWeatherEmoji(w.weather?.[0]?.id, icon);
            const tempStr = formatTemp(w.main?.temp);
            const desc = w.weather?.[0]?.description || '';

            return {
              type: 'article',
              id: `geo_${g.lat}_${g.lon}_${idx}`,
              title: `${flag} ${cityName}${region} — ${tempStr}`,
              description: `${emoji} ${desc} | 💨 ${(w.wind?.speed || 0).toFixed(1)} м/с | 💧 ${w.main?.humidity || 0}%`,
              thumbnail_url: `https://openweathermap.org/img/wn/${icon}@2x.png`,
              input_message_content: {
                message_text: formatWeatherHtml(w, cityName),
                parse_mode: 'HTML'
              },
              reply_markup: createWeatherKeyboard(cityName, g.lat, g.lon)
            };
          } catch (e) {
            return null;
          }
        })
      );

      const validResults = results.filter(Boolean);
      if (validResults.length > 0) {
        return await ctx.answerInlineQuery(validResults, { cache_time: 20 });
      }
    }

    // 3. Если геокодинг ничего не вернул, пробуем прямой запрос погоды
    const directWeather = await fetchWeatherByQuery(query);
    if (directWeather && directWeather.cod === 200) {
      const cityName = directWeather.name || query;
      const flag = getCountryFlag(directWeather.sys?.country);
      const icon = directWeather.weather?.[0]?.icon || '01d';
      const emoji = getWeatherEmoji(directWeather.weather?.[0]?.id, icon);
      const tempStr = formatTemp(directWeather.main?.temp);
      const desc = directWeather.weather?.[0]?.description || '';

      const singleResult = {
        type: 'article',
        id: `direct_${directWeather.id || 1}`,
        title: `${flag} ${cityName} — ${tempStr}`,
        description: `${emoji} ${desc} | 💨 ${(directWeather.wind?.speed || 0).toFixed(1)} м/с`,
        thumbnail_url: `https://openweathermap.org/img/wn/${icon}@2x.png`,
        input_message_content: {
          message_text: formatWeatherHtml(directWeather, cityName),
          parse_mode: 'HTML'
        },
        reply_markup: createWeatherKeyboard(cityName, directWeather.coord?.lat, directWeather.coord?.lon)
      };

      return await ctx.answerInlineQuery([singleResult], { cache_time: 20 });
    }

    // 4. Если ничего не найдено — возвращаем карточку с уведомлением
    return await ctx.answerInlineQuery(
      [
        {
          type: 'article',
          id: 'not_found',
          title: `❌ Город "${query}" не найден`,
          description: 'Проверьте написание названия на русском или английском',
          thumbnail_url: 'https://openweathermap.org/img/wn/11d@2x.png',
          input_message_content: {
            message_text: `❌ Город "<b>${escapeHtml(query)}</b>" не найден.\nПопробуйте написать название иначе (например: <i>Москва</i>, <i>Saint Petersburg</i>, <i>Казань</i>).`,
            parse_mode: 'HTML'
          }
        }
      ],
      { cache_time: 10 }
    );
  } catch (err) {
    console.error('Inline query error:', err);
    return await ctx.answerInlineQuery([], { cache_time: 5 });
  }
});

// ==========================================
// Обработка кнопки «🔄 Обновить» (Callback)
// ==========================================
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data || '';

  if (data.startsWith('ref:')) {
    const parts = data.split(':');
    const lat = parseFloat(parts[1]);
    const lon = parseFloat(parts[2]);

    if (!isNaN(lat) && !isNaN(lon)) {
      try {
        const w = await fetchWeatherByCoords(lat, lon);
        const html = formatWeatherHtml(w, w.name);
        const kb = createWeatherKeyboard(w.name, lat, lon);

        // Обновляем сообщение
        await ctx.editMessageText(html, {
          parse_mode: 'HTML',
          reply_markup: kb
        });

        await ctx.answerCallbackQuery({ text: '✅ Погода обновлена!' });
      } catch (err) {
        // Если текст не изменился, Telegram вернет ошибку "message is not modified", игнорируем
        await ctx.answerCallbackQuery({ text: 'Данные актуальны 👌' });
      }
    } else {
      await ctx.answerCallbackQuery({ text: 'Координаты недоступны' });
    }
  }
});

// ==========================================
// Обычный текстовый ввод (название города)
// ==========================================
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return; // Пропускаем команды

  try {
    const weather = await fetchWeatherByQuery(text);
    if (!weather || weather.cod !== 200) {
      return ctx.reply(
        `❌ Город "<b>${escapeHtml(text)}</b>" не найден.\n\nПроверьте написание или воспользуйтесь инлайн-поиском: <code>@${ctx.me?.username || 'bot'} ${escapeHtml(text)}</code>`,
        { parse_mode: 'HTML' }
      );
    }

    const html = formatWeatherHtml(weather, weather.name || text);
    const kb = createWeatherKeyboard(weather.name || text, weather.coord?.lat, weather.coord?.lon);
    await ctx.reply(html, { parse_mode: 'HTML', reply_markup: kb });
  } catch (err) {
    console.error('Text weather query error:', err);
    await ctx.reply('⚠️ Произошла ошибка при получении погоды. Попробуйте еще раз позже.');
  }
});

// ==========================================
// ВЕБ-ИНТЕРФЕЙС И VERCEL SERVERLESS HANDLER
// ==========================================

/**
 * HTML страница дашборда для GET запросов
 */
function renderDashboardHtml(host, botTokenSet, openWeatherKey) {
  const webhookUrl = `https://${host}/api`;
  const maskedKey = openWeatherKey ? `${openWeatherKey.slice(0, 6)}...${openWeatherKey.slice(-4)}` : 'Не задан';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Weather Bot — Webhook Serverless</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col justify-between p-4 sm:p-8">
  <div class="max-w-3xl mx-auto w-full space-y-6">
    
    <!-- Заголовок -->
    <header class="flex items-center justify-between pb-6 border-b border-slate-800">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-2xl shadow-lg shadow-sky-500/20">
          🌤️
        </div>
        <div>
          <h1 class="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
            Telegram Weather Bot
          </h1>
          <p class="text-xs sm:text-sm text-slate-400">OpenWeatherMap &bull; Vercel Serverless &bull; Inline Mode</p>
        </div>
      </div>
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full ${botTokenSet ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'} text-xs font-semibold">
        <span class="w-2 h-2 rounded-full ${botTokenSet ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
        ${botTokenSet ? 'Бот активен' : 'Ожидает токен'}
      </div>
    </header>

    <!-- Статус конфигурации -->
    <div class="grid sm:grid-cols-2 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
        <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">OpenWeatherMap API</span>
        <div class="flex items-center justify-between">
          <code class="text-sm text-sky-300 font-mono">${maskedKey}</code>
          <span class="text-xs bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-md">Подключено</span>
        </div>
        <p class="text-xs text-slate-500">Ключ активен для погоды и геокодинга.</p>
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
        <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Telegram BOT_TOKEN</span>
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium ${botTokenSet ? 'text-emerald-400' : 'text-amber-400'}">
            ${botTokenSet ? '✓ Задан в Vercel Env' : '⚠️ Не указан'}
          </span>
          <span class="text-xs ${botTokenSet ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'} px-2 py-0.5 rounded-md">
            ${botTokenSet ? 'Готов' : 'Требуется настройка'}
          </span>
        </div>
        <p class="text-xs text-slate-500">
          ${botTokenSet ? 'Вебхук готов принимать обновления от Telegram.' : 'Укажите BOT_TOKEN в Vercel Environment Variables.'}
        </p>
      </div>
    </div>

    <!-- Инструмент быстрой установки вебхука -->
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-base font-semibold text-slate-200 flex items-center gap-2">
        <span>⚡</span> Быстрая привязка Webhook
      </h2>
      <p class="text-sm text-slate-400">
        URL вашего сервера для получения вебхуков от Telegram:
      </p>
      
      <div class="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
        <input id="webhookInput" type="text" readonly value="${webhookUrl}" class="bg-transparent text-xs sm:text-sm font-mono text-sky-300 flex-1 outline-none">
        <button onclick="navigator.clipboard.writeText('${webhookUrl}'); alert('URL скопирован!');" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-slate-200 transition">
          Копировать
        </button>
      </div>

      <div class="pt-2 flex flex-wrap gap-3">
        <button id="setWebhookBtn" onclick="registerWebhook()" class="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-2">
          <span>🔗</span> Зарегистрировать Webhook в Telegram
        </button>
        <button onclick="checkWebhookInfo()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm rounded-xl transition">
          🔍 Проверить статус Webhook
        </button>
      </div>

      <div id="webhookResult" class="hidden p-4 rounded-xl text-xs font-mono"></div>
    </div>

    <!-- Инструкция по включению Inline Mode -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-base font-semibold text-slate-200 flex items-center gap-2">
        <span>💬</span> Как включить Инлайн-режим (Inline Mode)
      </h2>
      <ol class="text-sm text-slate-400 space-y-2 list-decimal list-inside">
        <li>Откройте официального бота <a href="https://t.me/BotFather" target="_blank" class="text-sky-400 hover:underline">@BotFather</a> в Telegram.</li>
        <li>Отправьте команду <code class="bg-slate-800 px-2 py-0.5 rounded text-sky-300">/setinline</code>.</li>
        <li>Выберите вашего бота из предложенного списка.</li>
        <li>Введите текст-подсказку плейсхолдера, например: <code class="bg-slate-800 px-2 py-0.5 rounded text-sky-300">Погода в городе...</code></li>
        <li>Готово! Теперь введите <code class="bg-slate-800 px-2 py-0.5 rounded text-sky-300">@ваш_бот Москва</code> в любом чате!</li>
      </ol>
    </div>

    <!-- Пример оформления карточки погоды -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-base font-semibold text-slate-200 flex items-center gap-2">
        <span>✨</span> Превью карточки погоды
      </h2>
      <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs sm:text-sm font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
🌧 <b>Погода: Москва 🇷🇺</b>
<i>Небольшой дождь</i>
────────────────────
🌡 <b>Температура:</b> +15°C <i>(ощущается как +14°C)</i>
📊 <b>Мин / Макс:</b> +14°C / +16°C
💧 <b>Влажность:</b> 68%
💨 <b>Ветер:</b> 3.7 м/с, Юго-Восточный ↖️ (порывы до 8.5 м/с)
🧭 <b>Давление:</b> 760 мм рт. ст. <i>(1013 гПа)</i>
☁️ <b>Облачность:</b> 99%
👁 <b>Видимость:</b> 10.0 км

🌅 <b>Восход:</b> 06:14   🌇 <b>Закат:</b> 18:30
────────────────────
🕒 <i>Местное время: 12:05</i>
      </div>
    </div>

  </div>

  <footer class="mt-8 text-center text-xs text-slate-500 py-4">
    Развернуто на Vercel Serverless Function &bull; <a href="https://openweathermap.org" target="_blank" class="text-slate-400 hover:text-sky-400">OpenWeatherMap API</a>
  </footer>

  <script>
    async function registerWebhook() {
      const box = document.getElementById('webhookResult');
      box.className = 'p-4 rounded-xl text-xs font-mono bg-sky-950/60 border border-sky-800 text-sky-200 block';
      box.innerHTML = '⏳ Отправка запроса на регистрацию Webhook...';
      try {
        const res = await fetch('/api?action=setWebhook');
        const data = await res.json();
        if (data.ok) {
          box.className = 'p-4 rounded-xl text-xs font-mono bg-emerald-950/60 border border-emerald-800 text-emerald-200 block';
          box.innerHTML = '✅ Успешно! Webhook установлен: ' + JSON.stringify(data, null, 2);
        } else {
          box.className = 'p-4 rounded-xl text-xs font-mono bg-red-950/60 border border-red-800 text-red-200 block';
          box.innerHTML = '❌ Ошибка установки Webhook: ' + JSON.stringify(data, null, 2);
        }
      } catch (e) {
        box.className = 'p-4 rounded-xl text-xs font-mono bg-red-950/60 border border-red-800 text-red-200 block';
        box.innerHTML = '❌ Сетевая ошибка: ' + e.message;
      }
    }

    async function checkWebhookInfo() {
      const box = document.getElementById('webhookResult');
      box.className = 'p-4 rounded-xl text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300 block';
      box.innerHTML = '⏳ Получение информации о Webhook...';
      try {
        const res = await fetch('/api?action=getWebhookInfo');
        const data = await res.json();
        box.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
      } catch (e) {
        box.innerHTML = '❌ Ошибка: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
}

let botInitPromise = null;

async function ensureBotInit() {
  if (bot.isInited()) return;
  if (!botInitPromise) {
    botInitPromise = bot.init().catch((err) => {
      botInitPromise = null;
      throw err;
    });
  }
  await botInitPromise;
}

// ==========================================
// VERCEL SERVERLESS EXPORT (Default Handler)
// ==========================================
export default async function handler(req, res) {
  const host = req.headers.host || 'localhost';

  // Обработка GET запросов (дашборд и утилиты вебхука)
  if (req.method === 'GET') {
    const url = new URL(req.url, `https://${host}`);
    const action = url.searchParams.get('action');

    // Экшен установки вебхука
    if (action === 'setWebhook') {
      if (!BOT_TOKEN) {
        return res.status(400).json({ ok: false, description: 'BOT_TOKEN is not set in environment variables' });
      }
      const webhookUrl = `https://${host}/api`;
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=${encodeURIComponent(JSON.stringify(["message", "inline_query", "callback_query"]))}`);
        const tgData = await tgRes.json();
        return res.status(200).json(tgData);
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    // Экшен получения инфо о вебхуке
    if (action === 'getWebhookInfo') {
      if (!BOT_TOKEN) {
        return res.status(400).json({ ok: false, description: 'BOT_TOKEN is not set' });
      }
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
        const tgData = await tgRes.json();
        return res.status(200).json(tgData);
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    // Отображение главной страницы
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderDashboardHtml(host, Boolean(BOT_TOKEN), OPENWEATHER_API_KEY));
  }

  // Обработка POST запросов (Telegram Webhook updates)
  if (req.method === 'POST') {
    try {
      let update = req.body;
      if (typeof update === 'string') {
        update = JSON.parse(update);
      }

      if (!update || typeof update !== 'object') {
        return res.status(400).send('Bad Request: Invalid update payload');
      }

      // Инициализируем бота перед обработкой (получение botInfo для grammY)
      await ensureBotInit();

      // Передаем обновление в grammY
      await bot.handleUpdate(update);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Webhook handle error:', err);
      // Всегда отдаем 200 Telegram, чтобы он не зацикливал повторы при ошибке парсинга
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // Другие HTTP методы
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

// Запуск локального сервера при прямом вызове (node api/index.js)
if (process.env.NODE_ENV !== 'production' && process.argv[1]?.endsWith('index.js')) {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(async (req, res) => {
    // Вспомогательный сборщик body для чистого node http
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        req.body = body;
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        res.send = (data) => res.end(data);
        await handler(req, res);
      });
    } else {
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };
      res.send = (data) => res.end(data);
      await handler(req, res);
    }
  });

  server.listen(PORT, () => {
    console.log(`🌤️ Weather Bot dev server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to view dashboard.`);
  });
}

