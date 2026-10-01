# DigiCampus platform

One repo, four pieces, fully wired:

```
 Android app (Expo)  ─┐                       ┌─> Postgres (Prisma, 20 tables)
 Web console (Next)  ─┼─> Backend API (:4000) ┤
                      │   auth/RBAC, workflow,└─> AI engine (FastAPI :8000)
                      │   attendance, fees…       risk model · RAG chat + self-check · mentor
                      └── apps never talk to the AI directly; the backend adds auth, student context and live data
```

| Folder | What it is |
|---|---|
| `mobile/` | React Native (Expo) app for **students, parents, faculty/HOD/Dean** (role-based tabs) → builds the APK |
| `web/` | Next.js console for **Admin/Dean/HOD/Faculty**: analytics, approvals, exam seating, CSV export |
| `backend/` | Express + Prisma REST API (the only thing the apps call) |
| `ai/` | FastAPI AI engine: dropout risk (Random Forest), study plans + PYQs, career advisor, policy chatbot (RAG + self-argument + mentor), assignment evaluator |

## 1. Run everything (needs Docker)

```bash
cp .env.example .env        # optional for a demo; change the secrets for anything real
docker compose up --build
```
* Web console http://localhost:3000 · API http://localhost:4000/health · seeded automatically on first boot.
* Demo data: 3 departments, 8 students (different attendance situations), parents, faculty, HODs, a Dean, an Admin, fees, assessments, notices, vault files, workflow requests in flight.

**Demo logins** (password `Password@123`)

| Role | Email | Notable |
|---|---|---|
| Student | `aarav.sharma@student.digicampus.edu` | ~74%: condonation band, fee due in 4 days |
| Student | `rohan.verma@student.digicampus.edu` | ~63%: critical, fee overdue, leave request in flight |
| Student | `diya.iyer@student.digicampus.edu` | top performer |
| Parent | `parent.aarav@digicampus.edu` / `parent.rohan@digicampus.edu` | linked to the students above |
| Faculty | `faculty.cse@digicampus.edu` | teaches Data Structures, DBMS, OS |
| HOD / Dean / Admin | `hod.cse@…`, `dean@…`, `admin@digicampus.edu` | approvals, analytics |

Without Docker: `backend/` (`npm i`, set `DATABASE_URL`, `npm run db:push && npm run db:seed && npm run dev`), `ai/` (`pip install -r requirements.txt && uvicorn app.main:app`), `web/` (`npm i && npm run dev`).

## 2. Get the Android APK

The app needs the backend reachable from the phone: `http://<your-computer-LAN-ip>:4000` on the same Wi-Fi, or a public HTTPS URL. (On the Android *emulator* the host is `http://10.0.2.2:4000`.) You can also change the server on the login screen ("Server settings") without rebuilding.

**A. GitHub Actions (no local Android setup)** – push the repo, then *Actions → Build Android APK → Run workflow*, enter your backend URL, download the `DigiCampus-apk` artifact.
**B. Your machine** – needs Node 20+, JDK 17, Android SDK: `cd mobile && ./build-apk.sh http://192.168.1.20:4000` → `mobile/DigiCampus.apk`.
**C. Expo cloud** – `cd mobile && npx eas-cli login && npm run build:apk` (edit the URL in `eas.json`).
**Try it instantly (no build)** – `cd mobile && npm i && npx expo install --fix && npx expo start`, scan the QR with Expo Go, set the server on the login screen.

The APK is signed with the debug key so it installs directly (fine for demos and pilots). For the Play Store, create a release keystore and use `eas build --profile production`. Android blocks plain `http://` in release builds unless allowed; this project enables cleartext for LAN demos (`mobile/app.json` → `usesCleartextTraffic`); **use HTTPS in production and set it to false**.

## 3. What is wired to what

| Feature | Mobile / Web | Backend | AI engine |
|---|---|---|---|
| Live attendance ring + <75% warnings, per-subject | Student home, parent | `GET /api/attendance/:id` | – |
| Alerts L1 <78 / L2 <75 (+parent) / L3 <65 (+HOD) | in-app alerts, parent view | notification service (deduplicated, SMS stub) | – |
| Leave & bonafide builder, live stage tracker | Student requests | `/api/applications` (3-stage engine, 48h auto-escalation) | – |
| Approval desk | Faculty/HOD/Dean app, web | `PUT /api/applications/:id/approve` (compare-and-swap) | – |
| Fast tap attendance | Faculty app | `POST /api/attendance/mark` (own subjects only) | – |
| Dropout risk | at-risk lists, parent card, dashboard | `/api/ai/risk`, `/api/analytics/*` | `/ai/predict-risk` |
| 7-day study plan + PYQs | Student → Learn | `POST /api/ai/study-plan` (weak topics from real marks) | `/ai/recommend-study-plan` |
| Career, resume, events | Student → Learn | `GET /api/student/career-recommendations` | `/ai/career-advisor` |
| Policy chatbot, mentor, read-aloud | Assistant tab | `POST /api/ai/chat` (+student profile) | `/ai/chat` (RAG + self-check) |
| Fees: pay, receipt, extension | Student + parent | `/api/fees` (mock gateway) | risk uses fee delay |
| Meetings with HOD/Dean/faculty | Parent + staff | `/api/appointments` | – |
| QR campus pass (auto-refresh, offline grace) | Pass tab | `GET /api/student/qr-pass`, `POST /api/gate/scan` (reader key) | – |
| Peer vault + moderation | Learn → Vault | `/api/vault/*` (disk storage, type allow-list) | – |
| Exam seating (no adjacent same branch) | Web | `POST /api/admin/generate-seating` | – |
| Executive KPIs, trend, CSV export | Web dashboard | `/api/analytics/*` | risk scoring |

If the AI service is down, the apps keep working: risk falls back to a local estimate (labelled), and chat shows a clear error.

## 4. Before going live

* Set real `JWT_SECRET`, `CAMPUS_PASS_SECRET`, `GATE_API_KEY`, `AI_SERVICE_API_KEY`, `POSTGRES_PASSWORD`; set `SEED_ON_START=0`; lock `CORS_ORIGINS`; serve everything over HTTPS.
* Replace the stubs: SMS (`notification.service.ts → sendSms`), payments (`payment.service.ts → charge`).
* Switch from `prisma db push` to versioned migrations (`npm run db:migrate`) and commit the `prisma/migrations` folder.
* Retrain the risk model on real outcomes (`ai/scripts/train_risk_model.py --csv`). It ships trained on synthetic data.
* Replace `ai/data/knowledge/digicampus_ai_kb.md` with your official regulations; edit `events.json` / `resources.json` with your college's clubs and links.

## 5. Not built (from the original wish-list)

DigiLocker verification, bus GPS tracking, indoor turn-by-turn map, voice *input* (read-aloud is included), push/SMS delivery providers, biometric device drivers (the gate scan API exists), official NAAC/NIRF templates (a base CSV export exists), roommate-matching engine (described in the KB, not coded), iOS build.
