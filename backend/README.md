# Backend-Ready Structure (NestJS + Redis + PostgreSQL)

This folder is a **structure-only scaffold** for the future backend split.

## Planned stack

- Framework: NestJS
- Database: PostgreSQL
- Cache/Queue: Redis

## Suggested modules

- `auth` - auth/session/token logic
- `routes-fares` - route, fare, distance/time logic
- `reservations` - reservation flow and status lifecycle
- `queue` - van in-line/boarding state machine
- `chat` - realtime passenger/operator chat hub
- `payments` - PayMongo integration and webhook handling
- `reports` - CSV-ready reporting endpoints

## Notes

- Current app still runs in Next.js route handlers.
- This folder is prepared for gradual migration (no runtime impact yet).
