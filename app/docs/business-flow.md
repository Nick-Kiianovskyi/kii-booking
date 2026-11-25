# KII Booking - Business Flow

## Product Purpose

KII Booking helps a business receive appointment requests through a public booking link.

Google Calendar is the source of truth.

Business manages appointments directly in Google Calendar.

KII Booking is responsible only for:

- business registration

- schedule configuration

- Google Calendar connection

- public booking page

- appointment creation

---

# Business User Journey

## Step 1. Register

Business creates an account.

Required fields:

- Business Name

- Email

- Password

Result:

Business account is created.

---

## Step 2. Configure Working Schedule

Business configures:

- working days

- work start time

- work end time

- slot duration

Example:

Working Days:

Monday-Friday

Work Hours:

09:00 - 18:00

Slot Duration:

30 minutes

Result:

KII Booking knows when appointments are allowed.

---

## Step 3. Connect Google Calendar

Business connects Google Calendar using OAuth.

Action:

Connect Google Calendar

Result:

Google Calendar is linked.

New bookings can be created automatically in Google Calendar.

---

## Step 4. Receive Public Booking Link

Business receives a personal booking link.

Example:

https://kii-booking.com/book/nikolay-barber

Actions:

- Copy Link

- Open Link

Result:

Link is ready for sharing.

---

## Step 5. Share Booking Link

Business can share the link using:

- Telegram

- Viber

- WhatsApp

- Instagram

- Facebook

- Website

- Email

Result:

Clients can create bookings without contacting the business manually.

---

## Step 6. Manage Appointments

Business manages appointments directly in Google Calendar.

KII Booking does NOT provide:

- booking editing

- booking deletion

- internal calendar management

These operations are performed in Google Calendar.

---

# Business Dashboard

The dashboard should contain only:

## Google Calendar Status

Examples:

✅ Connected

or

⚠ Not Connected

---

## Working Schedule Summary

Example:

Mon-Fri

09:00 - 18:00

30 minute slots

---

## Booking Link

Example:

https://kii-booking.com/book/nikolay-barber

Actions:

- Copy Link

- Open Link

---

# Out Of Scope

The following features are NOT part of MVP:

- CRM

- Client database

- Employee management

- Service catalog

- Analytics

- Revenue reports

- Internal calendar

- Internal booking management

- Notifications center

- Billing

---

# Success Criteria

A business owner can:

✅ Register

✅ Configure working schedule

✅ Connect Google Calendar

✅ Receive personal booking link

✅ Share the booking link

✅ Receive bookings in Google Calendar

✅ Manage appointments through Google Calendar
