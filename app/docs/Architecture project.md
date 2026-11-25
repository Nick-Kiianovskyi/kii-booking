KII Booking v1 Architecture

Главная идея

Возможность представителям бизнеса информировать потенциальных клиентов о доступности распространяя ссылку на приложение , которое позволит бронировать доступ к услугам
KII Booking не хранит собственное расписание записей.

Источник истины:

Google Calendar

KII Booking хранит только:

Настройки бизнеса

Клиентов

Бронирования

и синхронизирует их с Google Calendar.

Сущности

Business -Поставщик услуг.

Python

Business

Примеры:

Барбер

Стоматолог

Репетитор

Психолог

Автомастер

Поля:

Python

id

name

email

password_hash

 

slug

 

is_active

 

google_connected

google_access_token

google_refresh_token

BusinessSchedule

Отдельная таблица.

Не хранить расписание в Business.

Python

BusinessSchedule

Поля:

Python

id

business_id

 

weekday

 

start_time

end_time

 

slot_minutes

is_working

Пример:

weekday

start

end

slot

Monday

09:00

18:00

30

Tuesday

09:00

18:00

30

Wednesday

09:00

18:00

30

Thursday

09:00

18:00

30

Friday

09:00

18:00

30

Saturday

10:00

14:00

60

Sunday

NULL

NULL

NULL

Client

Клиент бизнеса.

Python

Client

Поля:

Python

id

 

name

phone

email

 

Booking

Запись клиента.

Поля:

Python

id

 

business_id

 

client_name

phone

 

service

 

date

 

start_time

end_time

 

google_event_id

Логика получения свободного времени

Клиент открывает:

Plain Text

/book/nikolay-barber

Получаем Business:

Python

slug

↓

Получаем расписание:

Python

BusinessSchedule

↓

Определяем день недели:

Python

2026-11-23

 

Monday

↓

Берем настройки понедельника:

Plain Text

09:00-18:00

30 минут

↓

Генерируем ВСЕ возможные слоты:

Plain Text

09:00

09:30

10:00

10:30

...

17:30

↓

Читаем Google Calendar

↓

Убираем занятые интервалы

↓

Возвращаем:

JSON

{

"available": [

"09:00",

"09:30",

"11:00",

"11:30"

]

}

API структура

Регистрация

HTTP

POST /auth/register

 

Google

HTTP

GET /google/connect/{business_id}

 

GET /google/callback

 

GET /google/test-event/{business_id}

Расписание бизнеса

Получить:

HTTP

GET /business/{id}/schedule

Изменить:

HTTP

PUT /business/{id}/schedule

Клиентская запись

Получить свободное время:

HTTP

GET /availability/{business_id}?date=2026-11-24

Создать запись:

HTTP

POST /bookings

Отменить:

HTTP

DELETE /bookings/{id}

Кабинет бизнеса

Все записи:

HTTP

GET /bookings

или лучше

HTTP

GET /business/{id}/bookings

Frontend страницы

1. Регистрация бизнеса

Plain Text

Имя

Email

Пароль

2. Подключение Google

Plain Text

Connect Google Calendar

3. Настройка графика

Plain Text

Рабочие дни

 

Пн

Вт

Ср

Чт

Пт

Сб

Вс

 

Начало работы

 

Конец работы

 

Длительность приема

 

4. Кабинет бизнеса

Plain Text

Мои записи

 

Иван

10:00

 

Петр

11:00

 

5. Публичная страница

Plain Text

/book/{slug}

Например:

Plain Text

/ book / nikolay-barber

Клиент видит:

Plain Text

Выберите дату

 

Свободное время

 

09:00

09:30

11:00

11:30
