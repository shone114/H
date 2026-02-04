🧱 HushHour — Tech Stack & Engineering Approach
Lean, Real-Time, Hackathon-Optimized Architecture
✅ 1. Core Engineering Principles

These principles guide every tech choice:

1. Real-time First

Native WebSockets for live updates

Instant question creation + instant upvote sync

No Redis, no clusters, minimal latency

2. Zero Friction

No audience authentication

QR → join instantly

Minimal API surface

3. Minimalism Over Complexity

Everything is simple, stable, shippable

Only essential features implemented

Avoid unnecessary microservices or infra

4. Database-Only Realism

Postgres for all persistent data

In-memory store for active WS connections

No Redis, no caching layers

5. Deploy Fast, Debug Fast

Railway/Render for backend

Vercel/Netlify for frontend

Focus on demo reliability

🚀 2. Technology Stack (Overview)
Layer	Technology	Reason
Frontend	React + TypeScript + Vite	Fast dev, small bundle, simple real-time UI
Styling	Tailwind CSS	Rapid UI building, easy consistent styling
Backend	FastAPI (Python)	Clean async WebSockets, easy APIs, stable
Database	PostgreSQL	Relational, reliable, fast indexing
Realtime	Native WebSockets	Lightweight, perfect for hackathon scale
Deployment (Frontend)	Vercel / Netlify	Instant static deploy
Deployment (Backend)	Railway / Render	Automatic HTTPS + Postgres included
QR Codes	qrcode Python package	Generates PNG QR codes for room links
Organizer Auth	Simple UUID token	Lightweight, zero login UI
🔌 3. Backend Stack (FastAPI)
FastAPI

Async-first Python framework

Native WebSocket support

Auto-generated OpenAPI docs (bonus for developers)

Easy to structure clean API routes

Uvicorn

High-performance ASGI server

Handles all WebSocket connections

Minimal configuration

Ideal for single-instance real-time workloads

PostgreSQL Driver

asyncpg or psycopg[binary]

Fast prepared queries

Efficient async connections

No Redis used

Removes dependency overhead

Eliminates complexity

Prevents cross-service debugging issues

Perfectly fine for <1000 CCU

📦 4. Database Stack (PostgreSQL)
Why PostgreSQL?

Built-in with Railway/Render

ACID guarantees (important for votes)

Works great with async drivers

Easy to sort questions by time/upvotes

Minimal config needed

Tables Used

rooms

questions

votes

Only 3 tables — simple, predictable, efficient.

Indexes

questions(room_id)

questions(room_id, votes DESC)

rooms(expires_at)

That's all we need.

🔄 5. Real-Time Stack (WebSockets)
Native WebSockets

No Socket.io

No Redis Pub/Sub

No "rooms server" layer

The server keeps:

connections = {
    "ROOM123": set([ws1, ws2, ws3])
}


This supports:

broadcast to room

reliable message delivery

minimal resource usage

WebSocket Events

question:new

question:update (votes)

question:answered

sync on connection

Why this works for hackathons

<2 ms local broadcast time

<20 ms round trip for most users

No horizontal scaling needed

No complex state management

🎨 6. Frontend Stack (React + Vite)
React

Component-driven UI for question cards, input boxes, dashboards

Easy to update state on WebSocket events

Vite

Extremely fast dev server

Hot reload in milliseconds

Better DX than CRA

TypeScript

Strong typing for WebSocket events

Prevents silly bugs during hackathon stress

Tailwind CSS

Utility classes = lightning-fast UI building

Beautiful typography + spacing without thinking

Easy responsiveness out of the box

🏗️ 7. Project Structure (Recommended)
Backend (FastAPI)
backend/
 ├── main.py
 ├── routes/
 │    ├── rooms.py
 │    ├── organizer.py
 │    └── ws.py
 ├── db.py
 ├── models.sql
 ├── utils/
 │    ├── qr.py
 │    └── auth.py
 └── requirements.txt

Frontend (React + Vite)
frontend/
 ├── src/
 │    ├── App.tsx
 │    ├── components/
 │    │     ├── QuestionInput.tsx
 │    │     └── QuestionCard.tsx
 │    ├── ws/
 │    │     └── useRoomSocket.ts
 │    └── pages/
 │          ├── RoomPage.tsx
 │          └── OrganizerDashboard.tsx
 ├── public/
 ├── index.html
 └── vite.config.js

🗂️ 8. API Layer (REST)
Public endpoints
Method	Path	Purpose
POST	/api/rooms	Create room (organizer)
GET	/r/{room_code}	QR landing page
GET	/api/rooms/{room_code}/questions	List questions
POST	/api/rooms/{room_code}/questions	Submit question
POST	/api/rooms/{room_code}/questions/{id}/vote	Upvote
Organizer endpoints
Method	Path	Purpose
GET	/dashboard/{room_code}/{token}	Organizer data
POST	/dashboard/{room_code}/{token}/reply	Add reply
POST	/dashboard/{room_code}/{token}/close	Close room
🔒 9. Authentication & Authorization
Audience

No login

No account

No identity

Client stores a random voter_uuid in localStorage

Organizer

Room token generated at creation

Eg: https://hushhour.app/dashboard/AB1234/0c928c3f-...

Acts as private admin URL

Fast and secure enough for hackathon

📡 10. Deployment Stack
Frontend (Vercel / Netlify)

Static files only (super fast CDN)

Zero downtime

No config needed

Backend (Railway / Render)

Single FastAPI server

Free PostgreSQL add-on

Auto HTTPS

GitHub CI deploys automatically

Hosting Simplicity

No Docker required
No Redis required
No load balancers required

Everything deploys in <5 minutes.

⚡ 11. Performance Guarantees (Realistic)
Operation	Expected Latency
Submit question	20–60 ms
Upvote	20–40 ms
WebSocket broadcast	1–5 ms
Page load	< 150 ms
Room join	< 50 ms

Plenty fast for:

hackathons

college events

workshops

panels

🧪 12. Stress Limitations (Honest)
Can handle:

500–1000 concurrent users

1000+ questions

10k+ upvotes

<50 ms latency

Struggles if:

5k+ concurrent WebSocket connections

5 backend instances (needs Redis Pub/Sub then)

But for your hackathon and expected user loads, this is more than enough.

🥇 13. Why This Stack Wins Hackathons
✔ Builds fast
✔ Easy to debug
✔ Impressive real-time UX
✔ Foolproof demo
✔ No infrastructure failure points
✔ Clean, readable code
✔ Zero bottlenecks for hackathon scale