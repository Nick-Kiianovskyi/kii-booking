KII Booking - текущий статус проекта

✅ Базовая инфраструктура

Backend

Реализовано:

✅ FastAPI

✅ SQLAlchemy

✅ PostgreSQL (Neon)

✅ Uvicorn

✅ Подключение к БД

✅ Модели данных

✅ Business

Модель бизнеса создана.

Реализовано:

✅ регистрация бизнеса

✅ проверка уникальности email

✅ генерация slug

✅ сохранение бизнеса в БД

Endpoint:

HTTP

POST /auth/register

✅ Google OAuth

Реализовано полностью.

Endpoint:

HTTP

GET /google/connect/{business_id}

 

GET /google/callback

Работает:

✅ получение auth_url

✅ вход через Google

✅ получение authorization code

✅ получение access token

✅ получение refresh token

✅ сохранение токенов в БД

✅ флаг google_connected

✅ Google Calendar Integration

Реализовано создание событий.

Endpoint:

HTTP

GET /google/test-event/{business_id}

Проверено:

✅ доступ к Google Calendar API

✅ создание событий

✅ события появляются в календаре

✅ Booking

Создана модель Booking.

Поля:

Plain Text

business_id

client_name

phone

service

date

start_time

end_time

google_event_id

Создание записи

Endpoint:

HTTP

POST /bookings

Реализовано:

✅ создание бронирования

✅ проверка существования бизнеса

✅ проверка пересечения времени

✅ проверка start < end

✅ сохранение в БД

Получение записей

Endpoint:

HTTP

GET /bookings

Реализовано:

✅ получение списка записей

✅ Создание Google Event при Booking

После создания записи:

Plain Text

Booking

↓

Google Calendar Event

Реализовано:

✅ отправка события в Google

✅ создание встречи в календаре

✅ Availability

Endpoint:

HTTP

GET /availability/{business_id}

Реализовано:

✅ чтение Google Calendar

✅ получение событий выбранного дня

✅ получение busy-интервалов

Проверено:

✅ API работает

✅ календарь читается

✅ нашли и диагностировали проблему истечения access token

✅ BusinessSchedule

Это сегодняшний большой этап.

Модель создана

Python

BusinessSchedule

Таблица создана

SQL

business_schedules

Поля реализованы

Plain Text

id

business_id

weekday

start_time

end_time

slot_minutes

is_working

Данные заведены

Пример:

Plain Text

Пн 09:00-18:00

Вт 09:00-18:00

Ср 09:00-18:00

Чт 09:00-18:00

Пт 09:00-18:00

Сб 10:00-14:00

Вс выходной

Получение расписания

Endpoint:

HTTP

GET /business/{id}/schedule

Статус:

✅ работает

🚧 В работе

Available Slots

Сейчас:

JSON

{

"busy": [...]

}

Нужно:

JSON

{

"available": [...]

}

Логика пока не реализована.

Статус:

🚧

❌ Не реализовано

Изменение расписания

Нужен endpoint:

HTTP

PUT /business/{id}/schedule

Статус:

❌

Автоматическое обновление Google Token

Нужно:

Python

refresh_google_token()

Статус:

❌

Удаление бронирования

Нужно:

HTTP

DELETE /bookings/{id}

Логика:

Plain Text

Удалить Booking

↓

Удалить Google Event

 

Статус:

❌

Публичная страница бизнеса

По slug:

HTTP

GET /book/{slug}

Статус:

❌

Личный кабинет бизнеса

Нужно:

HTTP

GET /business/{id}

 

GET /business/{id}/bookings

Статус:

❌

Frontend

Пока нет.

План:

Plain Text

React

TypeScript

Vite

Axios

Tailwind

Статус:

❌

Реальная оценка готовности проекта

Блок

Готовность

Backend Core

90%

Google OAuth

95%

Google Calendar

90%

Business Schedule

90%

Booking

85%

Availability

60%

Frontend

0%

Общая готовность MVP

Plain Text

≈ 70%

Следующая задача №1

Plain Text

Availability:

BusinessSchedule + Google Calendar

↓

Available Slots
