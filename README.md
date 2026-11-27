# kii-booking
booking api plus integration google calendar
https://kii-booking-teal.vercel.app/

# KII Booking 

<p align="center"> 

![Python](https://img.shields.io/badge/Python-3.13-blue?logo=python) 
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi) 
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?logo=postgresql) 
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-ORM-red) 
![JWT](https://img.shields.io/badge/Auth-JWT-orange) 
![Google Calendar](https://img.shields.io/badge/Google-Calendar-4285F4?logo=googlecalendar) 
![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react) 
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript) 
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel) 

</p> 

## Overview 

KII Booking is a lightweight online appointment scheduling system for small businesses. 

The application allows businesses to: 

 
- create an account;
  
- define working hours and availability; 
- connect Google Calendar; 
- share a public booking link; 

 
Clients can: 

- view available time slots; 
- book appointments online; 
- receive automatically synchronized events in Google Calendar.
- Google Calendar acts as the single source of truth, eliminating the need for maintaining a separate scheduling system. 
--- 

 

## Live Demo 

 
**Frontend** 

https://kii-booking-teal.vercel.app/
--- 


## Features 

 
### Business Side 


✅ Registration and authentication 

✅ JWT access and refresh tokens 

✅ Business profile management 

✅ Working schedule configuration 

✅ Google OAuth integration 

✅ Google Calendar synchronization 

✅ Booking management 

 

### Client Side 

✅ Public booking page 

✅ Available slots display 

✅ Appointment creation 

✅ Automatic calendar event generation 

 --- 

 

## Technology Stack 

### Backend 

- Python 3.13 
- FastAPI 
- SQLAlchemy 
- Alembic 
- PostgreSQL 
- JWT Authentication 
- Google Calendar API 
- OAuth 2.0 

 
### Frontend 

- React 
- TypeScript 
- Vite 
- Axios 


### Deployment 

- Vercel 
- Neon PostgreSQL 

--- 

## Architecture 

Client 
   │ 
   ▼ 
React Frontend 
   │ 
   ▼ 
FastAPI Backend 
   │ 
   ├── PostgreSQL (Neon) 
   │ 
   └── Google Calendar API 

 

Джерело: <https://copilot.cloud.microsoft/chat/conversation/55199f82-fb67-41ac-8664-d5c250716e5a?fromcode=edgentp&redirectid=6b0925d526674cc2b415aa0af8bdfeb3&auth=2&handinClickTs=1795762081968&redirfrom=mcmToCcm>  
