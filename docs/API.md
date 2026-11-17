# Muster ERP API

Base URL: `http://localhost:4000/api/v1`

## How to use

1. `cp .env.example .env`, fill in your AWS keys, table and bucket names.
2. `npm install`, then `npm run db:create` (once), then `npm run db:seed` (demo data), then `npm run dev`.
3. In Postman: **Import** `docs/Muster-ERP.postman_collection.json`. Run **1. Auth > Login as ...**. The token is saved automatically; every other request uses it.
4. To test as someone else, run another login request, then re-run the request you want.

## Conventions

- Send `Authorization: Bearer <accessToken>` on everything except login and refresh (Postman does this for you).
- Send `Content-Type: application/json` with a body.
- Success: `{ "data": ... }`. Failure: `{ "error": { "code": 409, "message": "..." } }`.
- Dates are `YYYY-MM-DD`, months `YYYY-MM`. Times are ISO timestamps (UTC).
- Access tokens last 15 minutes, refresh tokens 7 days.
<<<<<<< HEAD
- A role not listed under **Who** gets `403`. SUPER_ADMIN can do everything.
=======
- A role not listed under **Who** gets `403`. SUPER_ADMIN of a company can do everything inside that company. `/platform/*` is only for people whose orgId is `platform`.
- A feature switched off for the company (payroll, assets, reports, ...) answers `403` on its routes. A suspended company cannot sign in (`403`).
>>>>>>> master

| Status | Meaning |
|---|---|
| 200 / 201 | Done / created |
| 400 | Request makes no sense (e.g. not enough leave) |
| 401 | Not signed in, wrong password, or token expired |
| 403 | Signed in but not allowed |
| 404 | Not found |
| 409 | Conflict (already checked in, already decided, duplicate) |
| 422 | A required field is missing or invalid |

## Demo accounts (password `Passw0rd!`)

| Email | Role | Notes |
|---|---|---|
| arjun@kestrel.test | SUPER_ADMIN | everything |
| meera@kestrel.test | HR_ADMIN | people, leave stage 2, assets, settings |
| rohan@kestrel.test | FINANCE | payroll lock, expense stage 2 |
| nisha@kestrel.test | AUDITOR | read-only reports and audit |
<<<<<<< HEAD
| kavya@kestrel.test | MANAGER | approves for sanjay, ananya, vikram |
| sanjay@kestrel.test | EMPLOYEE | has a pending leave request `lr_seed01` |
| ananya@kestrel.test | EMPLOYEE | not checked in today |
| vikram@kestrel.test | EMPLOYEE | |
=======
| kavya@kestrel.test | MANAGER | team: pooja (project manager), sanjay, ananya |
| dev@kestrel.test | MANAGER | team: imran (project manager), vikram, tara. Cannot see Kavya's team |
| pooja@kestrel.test | PROJECT_MANAGER | reports to Kavya; first approver for sanjay and ananya |
| imran@kestrel.test | PROJECT_MANAGER | reports to Dev; first approver for vikram and tara |
| sanjay@kestrel.test | EMPLOYEE | has a pending leave request `lr_seed01` (waiting on Pooja) |
| ananya@kestrel.test | EMPLOYEE | not checked in today |
| vikram@kestrel.test, tara@kestrel.test | EMPLOYEE | |
| hr@orbit.test | HR_ADMIN | second company "Orbit Foods", Starter plan: payroll, assets, projects are OFF |
| admin@muster.test | SUPER_ADMIN (platform) | organizations, plans, audit, everything on the platform |
| sales@muster.test | SALES (platform) | plans, organization plan and features |
| accounts@muster.test | FINANCE (platform) | read-only revenue |

Reporting lines: Manager -> Project Manager -> Employee (`managerId`). Platform staff have orgId `platform`.
>>>>>>> master

Seeded ids you can use directly: `emp_sanjay`, `emp_kavya`, `dept_eng`, `lt_casual`, `lr_seed01`, `as_laptop1`.

## Suggested test order

1. **Auth:** login as Ananya, then check-in, check-out, my month. Login as Sanjay, request leave.
2. **Approval chain:** login as Kavya, inbox, approve. Login as Meera, inbox, approve. Login as Sanjay, balances (days now used).
3. **People:** login as Meera, create person, update person, list people.
4. **Payroll:** login as Rohan, start run, calculate, lock. Login as Sanjay, my payslips.
5. **Assets, documents, reports:** as Meera, then as Nisha for the audit trail.


---

## 1. Auth

### Login as HR admin (Meera)

`POST {{baseUrl}}/auth/login`

**Who:** Public

Signs in as the seeded HR_ADMIN. The test script saves `token` and `refreshToken` as collection variables, so every other request is automatically authorized as this user.

**Body (JSON)**

```json
{
  "email": "meera@kestrel.test",
  "password": "Passw0rd!"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 wrong email or password. 403 account inactive. 422 missing field.

### Login as Manager (Kavya)

`POST {{baseUrl}}/auth/login`

**Who:** Public

Signs in as the seeded MANAGER. The test script saves `token` and `refreshToken` as collection variables, so every other request is automatically authorized as this user.

**Body (JSON)**

```json
{
  "email": "kavya@kestrel.test",
  "password": "Passw0rd!"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 wrong email or password. 403 account inactive. 422 missing field.

### Login as Employee (Sanjay)

`POST {{baseUrl}}/auth/login`

**Who:** Public

Signs in as the seeded EMPLOYEE. The test script saves `token` and `refreshToken` as collection variables, so every other request is automatically authorized as this user.

**Body (JSON)**

```json
{
  "email": "sanjay@kestrel.test",
  "password": "Passw0rd!"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 wrong email or password. 403 account inactive. 422 missing field.

### Login as Employee (Ananya)

`POST {{baseUrl}}/auth/login`

**Who:** Public

Signs in as the seeded EMPLOYEE. The test script saves `token` and `refreshToken` as collection variables, so every other request is automatically authorized as this user.

**Body (JSON)**

```json
{
  "email": "ananya@kestrel.test",
  "password": "Passw0rd!"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 wrong email or password. 403 account inactive. 422 missing field.

### Login as Finance (Rohan)

`POST {{baseUrl}}/auth/login`

**Who:** Public

Signs in as the seeded FINANCE. The test script saves `token` and `refreshToken` as collection variables, so every other request is automatically authorized as this user.

**Body (JSON)**

```json
{
  "email": "rohan@kestrel.test",
  "password": "Passw0rd!"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 wrong email or password. 403 account inactive. 422 missing field.

### Login as Auditor (Nisha)

`POST {{baseUrl}}/auth/login`

**Who:** Public

Signs in as the seeded AUDITOR. The test script saves `token` and `refreshToken` as collection variables, so every other request is automatically authorized as this user.

**Body (JSON)**

```json
{
  "email": "nisha@kestrel.test",
  "password": "Passw0rd!"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 wrong email or password. 403 account inactive. 422 missing field.

### Login as Super admin (Arjun)

`POST {{baseUrl}}/auth/login`

**Who:** Public

Signs in as the seeded SUPER_ADMIN. The test script saves `token` and `refreshToken` as collection variables, so every other request is automatically authorized as this user.

**Body (JSON)**

```json
{
  "email": "arjun@kestrel.test",
  "password": "Passw0rd!"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 wrong email or password. 403 account inactive. 422 missing field.

### Refresh token

`POST {{baseUrl}}/auth/refresh`

**Who:** Public

Exchanges the refresh token (valid 7 days) for a new access token (valid 15 minutes). The role is re-read from the database, so a role change takes effect here.

**Body (JSON)**

```json
{
  "refreshToken": "{{refreshToken}}"
}
```

**Success (200)**

```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "empId": "emp_meera",
      "orgId": "kestrel",
      "orgName": "Kestrel Logistics",
      "timezone": "Asia/Kolkata",
      "name": "Meera Iyer",
      "email": "meera@kestrel.test",
      "role": "HR_ADMIN",
      "designation": "Head of People",
      "deptId": "dept_people",
      "empCode": "EMP-0002",
      "managerId": "emp_arjun"
    }
  }
}
```

**Errors:** 401 refresh token invalid or expired.

### Who am I

`GET {{baseUrl}}/auth/me`

**Who:** Any signed-in user

Returns the signed-in user's profile.

**Success (200)**

```json
{
  "data": {
    "empId": "emp_meera",
    "orgId": "kestrel",
    "orgName": "Kestrel Logistics",
    "timezone": "Asia/Kolkata",
    "name": "Meera Iyer",
    "email": "meera@kestrel.test",
    "role": "HR_ADMIN",
    "designation": "Head of People",
    "deptId": "dept_people",
    "empCode": "EMP-0002",
    "managerId": "emp_arjun"
  }
}
```

---

## 2. Organization

### Get my organization

`GET {{baseUrl}}/organizations/me`

**Who:** Any signed-in user

Company name, timezone, shift times and attendance rules.

**Success (200)**

```json
{
  "data": {
    "orgId": "kestrel",
    "name": "Kestrel Logistics",
    "timezone": "Asia/Kolkata",
    "shiftName": "General",
    "shiftStart": "09:30",
    "shiftEnd": "18:30",
    "graceMinutes": 10,
    "halfDayAfterMinutes": 120
  }
}
```

### Update attendance settings

`PUT {{baseUrl}}/organizations/policy`

**Who:** HR_ADMIN

Changes shift times and attendance rules. All fields are optional. Add `geofence` ({lat, lng, radiusMeters}) to require check-ins from the office; leave it out to allow check-in from anywhere.

**Body (JSON)**

```json
{
  "shiftStart": "09:30",
  "shiftEnd": "18:30",
  "graceMinutes": 10,
  "halfDayAfterMinutes": 120
}
```

**Success (200)**

```json
{
  "data": {
    "orgId": "kestrel",
    "graceMinutes": 10
  }
}
```

**Errors:** 403 not HR admin.

### List departments

`GET {{baseUrl}}/organizations/departments`

**Who:** Any signed-in user

All departments.

**Success (200)**

```json
{
  "data": [
    {
      "deptId": "dept_eng",
      "name": "Engineering"
    }
  ]
}
```

### Add department

`POST {{baseUrl}}/organizations/departments`

**Who:** HR_ADMIN, HR_MANAGER

Creates a department. Saves `deptId`.

**Body (JSON)**

```json
{
  "name": "Sales"
}
```

**Success (201)**

```json
{
  "data": {
    "deptId": "dept_ab12cd34ef",
    "name": "Sales"
  }
}
```

### List leave types

`GET {{baseUrl}}/organizations/leave-types`

**Who:** Any signed-in user

All leave types and their yearly days.

**Success (200)**

```json
{
  "data": [
    {
      "typeId": "lt_casual",
      "name": "Casual leave",
      "annualDays": 12,
      "color": "#0B6E75"
    }
  ]
}
```

### Add leave type

`POST {{baseUrl}}/organizations/leave-types`

**Who:** HR_ADMIN

Creates a leave type. Existing employees do not get a balance for it automatically; new employees do.

**Body (JSON)**

```json
{
  "name": "Paternity leave",
  "annualDays": 10,
  "color": "#2E8B57"
}
```

**Success (201)**

```json
{
  "data": {
    "typeId": "lt_x1",
    "name": "Paternity leave",
    "annualDays": 10
  }
}
```

---

## 3. Employees

### List people

`GET {{baseUrl}}/employees`

**Who:** HR_ADMIN, HR_MANAGER, FINANCE, AUDITOR see everyone. MANAGER sees direct reports only.

Search and filter. A manager can never see another team.

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| q | `sanjay` | Search name, email, code or title |
| status | `ACTIVE` | ACTIVE or INACTIVE |

**Success (200)**

```json
{
  "data": [
    {
      "empId": "emp_sanjay",
      "empCode": "EMP-0006",
      "name": "Sanjay Patil",
      "email": "sanjay@kestrel.test",
      "role": "EMPLOYEE",
      "deptId": "dept_eng",
      "designation": "Senior Engineer",
      "managerId": "emp_kavya",
      "joinDate": "2023-04-10",
      "status": "ACTIVE",
      "salary": {
        "basic": 80000,
        "hra": 32000,
        "allowances": 20000
      }
    }
  ]
}
```

**Errors:** 403 for EMPLOYEE.

### Get one person

`GET {{baseUrl}}/employees/{{employeeId}}`

**Who:** The person themselves, their manager, HR, finance, auditor

Salary is shown to the person, HR, finance and auditor. Bank account and national ID are shown only to the person and HR admin.

**Success (200)**

```json
{
  "data": {
    "empId": "emp_sanjay",
    "empCode": "EMP-0006",
    "name": "Sanjay Patil",
    "email": "sanjay@kestrel.test",
    "role": "EMPLOYEE",
    "deptId": "dept_eng",
    "designation": "Senior Engineer",
    "managerId": "emp_kavya",
    "joinDate": "2023-04-10",
    "status": "ACTIVE",
    "salary": {
      "basic": 80000,
      "hra": 32000,
      "allowances": 20000
    }
  }
}
```

**Errors:** 403 not allowed to view. 404 unknown id.

### Create person

`POST {{baseUrl}}/employees`

**Who:** HR_ADMIN, HR_MANAGER

Adds a person, creates their login and gives them every leave type's yearly balance. Returns a one-time `tempPassword`. Saves `newEmpId`.

**Body (JSON)**

```json
{
  "name": "Tara Menon",
  "email": "tara@kestrel.test",
  "phone": "+91 9800000000",
  "role": "EMPLOYEE",
  "deptId": "dept_eng",
  "designation": "Logistics Analyst",
  "managerId": "emp_kavya",
  "joinDate": "2026-10-01",
  "salary": {
    "basic": 50000,
    "hra": 20000,
    "allowances": 10000
  },
  "bankAccount": "123456789012",
  "nationalId": "ABCDE1234F"
}
```

**Success (201)**

```json
{
  "data": {
    "employee": {
      "empId": "emp_9f3a1c7b2d",
      "empCode": "EMP-0006",
      "name": "Tara Menon",
      "email": "sanjay@kestrel.test",
      "role": "EMPLOYEE",
      "deptId": "dept_eng",
      "designation": "Senior Engineer",
      "managerId": "emp_kavya",
      "joinDate": "2023-04-10",
      "status": "ACTIVE",
      "salary": {
        "basic": 80000,
        "hra": 32000,
        "allowances": 20000
      }
    },
    "tempPassword": "Muster@a1b2c3"
  }
}
```

**Errors:** 409 email already exists. 422 missing field or bad role.

### Update person

`PATCH {{baseUrl}}/employees/{{newEmpId}}`

**Who:** HR_ADMIN, HR_MANAGER (role, salary, bankAccount, nationalId: HR_ADMIN only)

Send only the fields to change. `managerId: null` removes the manager.

**Body (JSON)**

```json
{
  "designation": "Senior Analyst",
  "phone": "+91 9811111111",
  "status": "ACTIVE"
}
```

**Success (200)**

```json
{
  "data": {
    "empId": "emp_sanjay",
    "empCode": "EMP-0006",
    "name": "Sanjay Patil",
    "email": "sanjay@kestrel.test",
    "role": "EMPLOYEE",
    "deptId": "dept_eng",
    "designation": "Senior Analyst",
    "managerId": "emp_kavya",
    "joinDate": "2023-04-10",
    "status": "ACTIVE",
    "salary": {
      "basic": 80000,
      "hra": 32000,
      "allowances": 20000
    }
  }
}
```

**Errors:** 403 HR manager changing role/salary/bank/ID.

---

## 4. Attendance

### Today (my status)

`GET {{baseUrl}}/attendance/today`

**Who:** Any signed-in user

Today's date, server time, shift, rules and my record (`null` if not checked in).

**Success (200)**

```json
{
  "data": {
    "date": "2026-10-13",
    "serverTime": "2026-10-13T04:02:11.000Z",
    "shift": {
      "name": "General",
      "start": "09:30",
      "end": "18:30"
    },
    "policy": {
      "graceMinutes": 10,
      "halfDayAfterMinutes": 120
    },
    "record": null
  }
}
```

### Check in

`POST {{baseUrl}}/attendance/check-in`

**Who:** Any signed-in user

Marks you in. Status is PRESENT (within grace), LATE, or HALF_DAY (past the half-day cut-off). One check-in per day: a second attempt returns 409. `lat`/`lng` are required only if a geofence is configured.

**Body (JSON)**

```json
{
  "lat": 18.5204,
  "lng": 73.8567,
  "deviceId": "postman"
}
```

**Success (201)**

```json
{
  "data": {
    "date": "2026-10-13",
    "status": "PRESENT",
    "checkInAt": "2026-10-13T03:55:00.000Z",
    "lateByMinutes": 0
  }
}
```

**Errors:** 409 already checked in. 400/422 location rules.

### Check out

`POST {{baseUrl}}/attendance/check-out`

**Who:** Any signed-in user

Marks you out and records minutes worked.

**Body (JSON)**

```json
{}
```

**Success (200)**

```json
{
  "data": {
    "date": "2026-10-13",
    "checkOutAt": "2026-10-13T12:50:00.000Z",
    "workedMinutes": 535
  }
}
```

**Errors:** 400 not checked in. 409 already checked out.

### My month

`GET {{baseUrl}}/attendance/me`

**Who:** Any signed-in user

My daily records and totals for a month (defaults to this month).

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| month | `{{month}}` | YYYY-MM |

**Success (200)**

```json
{
  "data": {
    "month": "2026-10",
    "records": [
      {
        "date": "2026-10-12",
        "status": "PRESENT",
        "checkInAt": "...",
        "checkOutAt": "...",
        "workedMinutes": 555
      }
    ],
    "summary": {
      "present": 8,
      "late": 1,
      "halfDay": 0,
      "workedMinutes": 4800
    }
  }
}
```

### Team or company, one day

`GET {{baseUrl}}/attendance/org`

**Who:** MANAGER (team), HR_ADMIN, HR_MANAGER, AUDITOR (everyone)

One row per active person for the date. Status: PRESENT, LATE, HALF_DAY, ABSENT (past day, no record), NOT_YET (today, not in yet).

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| date | `{{date}}` | YYYY-MM-DD, defaults to today |

**Success (200)**

```json
{
  "data": {
    "date": "2026-10-12",
    "rows": [
      {
        "empId": "emp_sanjay",
        "name": "Sanjay Patil",
        "status": "PRESENT",
        "checkInAt": "...",
        "workedMinutes": 555
      }
    ],
    "counts": {
      "total": 8,
      "present": 7,
      "late": 1,
      "halfDay": 0,
      "absent": 0,
      "notYet": 0
    }
  }
}
```

**Errors:** 403 for EMPLOYEE, FINANCE.

### One person's month

`GET {{baseUrl}}/attendance/employee/{{employeeId}}`

**Who:** The person, their manager, HR, finance, auditor

Same shape as 'My month' for someone else.

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| month | `{{month}}` | YYYY-MM |

**Success (200)**

```json
{
  "data": {
    "month": "2026-10",
    "records": [],
    "summary": {}
  }
}
```

**Errors:** 403 not allowed.

---

## 5. Leave

### My balances and requests

`GET {{baseUrl}}/leaves/me`

**Who:** Any signed-in user

Leave balances (with `available`) and my requests. Saves `leaveTypeId`.

**Success (200)**

```json
{
  "data": {
    "balances": [
      {
        "typeId": "lt_casual",
        "name": "Casual leave",
        "total": 12,
        "used": 0,
        "pending": 2,
        "available": 10,
        "color": "#0B6E75"
      }
    ],
    "requests": [
      {
        "reqId": "lr_seed01",
        "typeName": "Casual leave",
        "from": "2026-10-16",
        "to": "2026-10-19",
        "days": 2,
        "status": "PENDING"
      }
    ]
  }
}
```

### Request leave

`POST {{baseUrl}}/leaves/requests`

**Who:** Any signed-in user

Weekends are not counted. The days are held (`pending`) until a decision. Goes to the manager, then HR admin. Saves `reqId`.

**Body (JSON)**

```json
{
  "typeId": "{{leaveTypeId}}",
  "from": "{{leaveFrom}}",
  "to": "{{leaveTo}}",
  "reason": "Family function"
}
```

**Success (201)**

```json
{
  "data": {
    "reqId": "lr_5e2f9a01bc",
    "typeName": "Casual leave",
    "from": "2026-12-07",
    "to": "2026-12-09",
    "days": 3,
    "status": "PENDING"
  }
}
```

**Errors:** 400 not enough balance, bad dates, or only weekend days.

### Cancel my request

`POST {{baseUrl}}/leaves/requests/{{reqId}}/cancel`

**Who:** The person who requested

Withdraws a request that is still open and releases the held days.

**Success (200)**

```json
{
  "data": {
    "reqId": "lr_5e2f9a01bc",
    "status": "CANCELLED"
  }
}
```

**Errors:** 409 already decided. 404 not yours.

---

## 6. Approvals

### My inbox (waiting on me)

`GET {{baseUrl}}/approvals/pending`

**Who:** Any signed-in user

Requests waiting for this user: as the named manager, or through their role (HR admin, finance). Saves the first one as `approvalId`.

**Success (200)**

```json
{
  "data": [
    {
      "reqId": "lr_seed01",
      "entityType": "LEAVE",
      "requesterName": "Sanjay Patil",
      "summary": "Casual leave, 2 days (...)",
      "status": "PENDING",
      "createdAt": "..."
    }
  ]
}
```

### History by status

`GET {{baseUrl}}/approvals`

**Who:** HR_ADMIN, HR_MANAGER, AUDITOR

Decided or open requests across the company.

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| status | `APPROVED` | APPROVED, REJECTED, CANCELLED or PENDING |

**Success (200)**

```json
{
  "data": [
    {
      "reqId": "lr_seed01",
      "entityType": "LEAVE",
      "requesterId": "emp_sanjay",
      "requesterName": "Sanjay Patil",
      "summary": "Casual leave, 2 days (2026-10-16 to 2026-10-19)",
      "status": "PENDING",
      "currentStage": 1,
      "totalStages": 2,
      "stages": [
        {
          "approverType": "REPORTING_MANAGER"
        },
        {
          "approverType": "ROLE",
          "role": "HR_ADMIN"
        }
      ],
      "approver": {
        "kind": "USER",
        "approverId": "emp_kavya",
        "label": "Kavya Nair"
      },
      "payload": {
        "typeId": "lt_casual",
        "days": 2,
        "reason": "Family function"
      },
      "actions": [],
      "canAct": true,
      "createdAt": "2026-10-13T08:00:00.000Z"
    }
  ]
}
```

**Errors:** 403 other roles. 422 bad status.

### Request detail

`GET {{baseUrl}}/approvals/{{approvalId}}`

**Who:** Requester, their manager, anyone who acted, HR, auditor, current approver

The request, its stages, history and `canAct` (true if the caller can decide it now).

**Success (200)**

```json
{
  "data": {
    "reqId": "lr_seed01",
    "entityType": "LEAVE",
    "requesterId": "emp_sanjay",
    "requesterName": "Sanjay Patil",
    "summary": "Casual leave, 2 days (2026-10-16 to 2026-10-19)",
    "status": "PENDING",
    "currentStage": 1,
    "totalStages": 2,
    "stages": [
      {
        "approverType": "REPORTING_MANAGER"
      },
      {
        "approverType": "ROLE",
        "role": "HR_ADMIN"
      }
    ],
    "approver": {
      "kind": "USER",
      "approverId": "emp_kavya",
      "label": "Kavya Nair"
    },
    "payload": {
      "typeId": "lt_casual",
      "days": 2,
      "reason": "Family function"
    },
    "actions": [],
    "canAct": true,
    "createdAt": "2026-10-13T08:00:00.000Z"
  }
}
```

**Errors:** 403 / 404.

### Approve

`POST {{baseUrl}}/approvals/{{approvalId}}/act`

**Who:** The current approver (manager, or role holder). Never the requester.

Approves the current stage. After the last stage the request becomes APPROVED and the leave days are used (or the expense marked approved). Use ONE of Approve / Reject / Escalate per request. For the seeded request lr_seed01: first run 'Login as Manager (Kavya)' (stage 1), then 'Login as HR admin (Meera)' (stage 2).

**Body (JSON)**

```json
{
  "action": "approve",
  "comment": "Enjoy the break"
}
```

**Success (200)**

```json
{
  "data": {
    "reqId": "lr_seed01",
    "entityType": "LEAVE",
    "requesterId": "emp_sanjay",
    "requesterName": "Sanjay Patil",
    "summary": "Casual leave, 2 days (2026-10-16 to 2026-10-19)",
    "status": "PENDING",
    "currentStage": 2,
    "totalStages": 2,
    "stages": [
      {
        "approverType": "REPORTING_MANAGER"
      },
      {
        "approverType": "ROLE",
        "role": "HR_ADMIN"
      }
    ],
    "approver": {
      "kind": "USER",
      "approverId": "emp_kavya",
      "label": "Kavya Nair"
    },
    "payload": {
      "typeId": "lt_casual",
      "days": 2,
      "reason": "Family function"
    },
    "actions": [
      {
        "action": "approve",
        "actorName": "Kavya Nair",
        "comment": "Approved",
        "at": "..."
      }
    ],
    "canAct": true,
    "createdAt": "2026-10-13T08:00:00.000Z"
  }
}
```

**Errors:** 403 not your turn or your own request. 409 already decided. 422 reject without a comment.

### Reject

`POST {{baseUrl}}/approvals/{{approvalId}}/act`

**Who:** The current approver (manager, or role holder). Never the requester.

Rejects and ends the request. A comment is required. Held leave days are released. Use ONE of Approve / Reject / Escalate per request. For the seeded request lr_seed01: first run 'Login as Manager (Kavya)' (stage 1), then 'Login as HR admin (Meera)' (stage 2).

**Body (JSON)**

```json
{
  "action": "reject",
  "comment": "Release week, please reschedule"
}
```

**Success (200)**

```json
{
  "data": {
    "reqId": "lr_seed01",
    "entityType": "LEAVE",
    "requesterId": "emp_sanjay",
    "requesterName": "Sanjay Patil",
    "summary": "Casual leave, 2 days (2026-10-16 to 2026-10-19)",
    "status": "PENDING",
    "currentStage": 2,
    "totalStages": 2,
    "stages": [
      {
        "approverType": "REPORTING_MANAGER"
      },
      {
        "approverType": "ROLE",
        "role": "HR_ADMIN"
      }
    ],
    "approver": {
      "kind": "USER",
      "approverId": "emp_kavya",
      "label": "Kavya Nair"
    },
    "payload": {
      "typeId": "lt_casual",
      "days": 2,
      "reason": "Family function"
    },
    "actions": [
      {
        "action": "approve",
        "actorName": "Kavya Nair",
        "comment": "Approved",
        "at": "..."
      }
    ],
    "canAct": true,
    "createdAt": "2026-10-13T08:00:00.000Z"
  }
}
```

**Errors:** 403 not your turn or your own request. 409 already decided. 422 reject without a comment.

### Escalate

<<<<<<< HEAD
=======
> **Changed:** escalating never skips the chain. A stage-1 approver escalates to his own manager (409 when nobody is above him); the HR stage escalates to the admin.

>>>>>>> master
`POST {{baseUrl}}/approvals/{{approvalId}}/act`

**Who:** The current approver (manager, or role holder). Never the requester.

Hands the request to the next role up (HR admin, or Admin if already with HR). Use ONE of Approve / Reject / Escalate per request. For the seeded request lr_seed01: first run 'Login as Manager (Kavya)' (stage 1), then 'Login as HR admin (Meera)' (stage 2).

**Body (JSON)**

```json
{
  "action": "escalate",
  "comment": "Need HR to decide"
}
```

**Success (200)**

```json
{
  "data": {
    "reqId": "lr_seed01",
    "entityType": "LEAVE",
    "requesterId": "emp_sanjay",
    "requesterName": "Sanjay Patil",
    "summary": "Casual leave, 2 days (2026-10-16 to 2026-10-19)",
    "status": "PENDING",
    "currentStage": 2,
    "totalStages": 2,
    "stages": [
      {
        "approverType": "REPORTING_MANAGER"
      },
      {
        "approverType": "ROLE",
        "role": "HR_ADMIN"
      }
    ],
    "approver": {
      "kind": "USER",
      "approverId": "emp_kavya",
      "label": "Kavya Nair"
    },
    "payload": {
      "typeId": "lt_casual",
      "days": 2,
      "reason": "Family function"
    },
    "actions": [
      {
        "action": "approve",
        "actorName": "Kavya Nair",
        "comment": "Approved",
        "at": "..."
      }
    ],
    "canAct": true,
    "createdAt": "2026-10-13T08:00:00.000Z"
  }
}
```

**Errors:** 403 not your turn or your own request. 409 already decided. 422 reject without a comment.

---

## 7. Expenses

### My expenses

`GET {{baseUrl}}/expenses`

**Who:** Any signed-in user

My expense claims, newest first.

**Success (200)**

```json
{
  "data": [
    {
      "reqId": "ex_1a2b3c",
      "category": "Travel",
      "amount": 4850,
      "date": "2026-10-08",
      "description": "Cab",
      "status": "PENDING"
    }
  ]
}
```

### Submit expense

`POST {{baseUrl}}/expenses`

**Who:** Any signed-in user

Creates a claim and sends it to the manager, then Finance. Saves `approvalId` so you can act on it.

**Body (JSON)**

```json
{
  "category": "Travel",
  "amount": 4850,
  "date": "2026-10-08",
  "description": "Client site visit, cab Pune to Nashik"
}
```

**Success (201)**

```json
{
  "data": {
    "reqId": "ex_1a2b3c",
    "status": "PENDING"
  }
}
```

**Errors:** 422 bad category (Travel, Meals, Equipment, Software, Other) or amount.

---

## 8. Payroll

<<<<<<< HEAD
### List runs

`GET {{baseUrl}}/payroll/runs`

**Who:** HR_ADMIN, HR_MANAGER, FINANCE, AUDITOR

Payroll months, newest first. Status: DRAFT, PROCESSING (calculated), FINALIZED (locked).

**Success (200)**

```json
{
  "data": [
    {
      "period": "2026-09",
      "status": "DRAFT",
      "employeeCount": 0,
      "totalGross": 0,
      "totalNet": 0,
      "createdBy": "Rohan Shah",
      "createdAt": "2026-10-13T08:00:00.000Z"
    }
  ]
}
```

### Start a run

`POST {{baseUrl}}/payroll/runs`

**Who:** HR_ADMIN, FINANCE

Creates a draft run for a month.

**Body (JSON)**

```json
{
  "period": "{{period}}"
}
```

**Success (201)**

```json
{
  "data": {
    "period": "2026-09",
    "status": "DRAFT",
    "employeeCount": 0,
    "totalGross": 0,
    "totalNet": 0,
    "createdBy": "Rohan Shah",
    "createdAt": "2026-10-13T08:00:00.000Z"
  }
}
```

**Errors:** 409 run already exists. 422 bad period.

### Calculate run

`POST {{baseUrl}}/payroll/runs/{{period}}/process`

**Who:** HR_ADMIN, FINANCE

Works out pay for every active person from attendance and approved leave. Can be repeated until the run is locked. (Pay rules are examples; replace with your own.)

**Success (200)**

```json
{
  "data": {
    "period": "2026-09",
    "status": "PROCESSING",
    "employeeCount": 8,
    "totalGross": 900000,
    "totalNet": 780000,
    "createdBy": "Rohan Shah",
    "createdAt": "2026-10-13T08:00:00.000Z"
  }
}
```

**Errors:** 404 no such run. 409 already locked.

### Lock run

`POST {{baseUrl}}/payroll/runs/{{period}}/finalize`

**Who:** FINANCE

Locks the run so it can never change; payslips become visible to employees. Only works once, and only after calculating.

**Success (200)**

```json
{
  "data": {
    "period": "2026-09",
    "status": "FINALIZED",
    "employeeCount": 0,
    "totalGross": 0,
    "totalNet": 0,
    "createdBy": "Rohan Shah",
    "createdAt": "2026-10-13T08:00:00.000Z",
    "finalizedBy": "Rohan Shah"
  }
}
```

**Errors:** 409 not calculated yet, or already locked. 403 not finance.

### Run lines

`GET {{baseUrl}}/payroll/runs/{{period}}/lines`

**Who:** HR_ADMIN, HR_MANAGER, FINANCE, AUDITOR

Every person's pay line for the run.

**Success (200)**

```json
{
  "data": {
    "run": {
      "period": "2026-09",
      "status": "DRAFT",
      "employeeCount": 0,
      "totalGross": 0,
      "totalNet": 0,
      "createdBy": "Rohan Shah",
      "createdAt": "2026-10-13T08:00:00.000Z"
    },
    "lines": [
      {
        "runId": "kestrel#2026-09",
        "period": "2026-09",
        "empId": "emp_sanjay",
        "empCode": "EMP-0006",
        "name": "Sanjay Patil",
        "designation": "Senior Engineer",
        "basic": 80000,
        "hra": 32000,
        "allowances": 20000,
        "gross": 132000,
        "workingDays": 22,
        "lopDays": 0,
        "lopAmount": 0,
        "pf": 9600,
        "professionalTax": 200,
        "tds": 8000,
        "deductions": 17800,
        "net": 114200
      }
    ]
  }
}
```

### My payslips

`GET {{baseUrl}}/payroll/payslips/me`

**Who:** Any signed-in user

My own payslips, only for locked months.

**Success (200)**

```json
{
  "data": [
    {
      "runId": "kestrel#2026-09",
      "period": "2026-09",
      "empId": "emp_sanjay",
      "empCode": "EMP-0006",
      "name": "Sanjay Patil",
      "designation": "Senior Engineer",
      "basic": 80000,
      "hra": 32000,
      "allowances": 20000,
      "gross": 132000,
      "workingDays": 22,
      "lopDays": 0,
      "lopAmount": 0,
      "pf": 9600,
      "professionalTax": 200,
      "tds": 8000,
      "deductions": 17800,
      "net": 114200
    }
  ]
}
```
=======
The salary credit flow between HR and Finance. Every step is one conditional update, so two people cannot both act, and every step is written to the audit log and notifies the person who acts next.

```
DRAFT -> CALCULATED -> SUBMITTED -> APPROVED -> PAID -> PAYSLIPS_SENT        RETURNED = back to HR from SUBMITTED
```

| Step | Who | Endpoint | Allowed from | Result |
|---|---|---|---|---|
| Start a run | HR_ADMIN | `POST /payroll/runs` | (new) | DRAFT |
| Calculate | HR_ADMIN | `POST /payroll/runs/:period/calculate` | DRAFT, CALCULATED, RETURNED | CALCULATED |
| Submit to Finance | HR_ADMIN | `POST /payroll/runs/:period/submit` | CALCULATED | SUBMITTED (HR is locked out) |
| Approve | FINANCE | `POST /payroll/runs/:period/approve` | SUBMITTED | APPROVED |
| Return to HR | FINANCE | `POST /payroll/runs/:period/return` `{ "reason" }` (required) | SUBMITTED | RETURNED |
| Record payments | FINANCE | `POST /payroll/runs/:period/payments` | APPROVED | PAID when every line is PAID |
| Generate payslips and email | HR_ADMIN | `POST /payroll/runs/:period/payslips` | PAID | PAYSLIPS_SENT when every payslip is emailed |

HR_MANAGER and AUDITOR can read. FINANCE only sees runs from SUBMITTED onwards. Any other status gives `409` with a message. The table of steps is `TRANSITIONS` at the top of `controllers/payrollController.js`.

Runs made before this flow keep working: `PROCESSING` is shown as CALCULATED and `FINALIZED` as PAYSLIPS_SENT (their payslips stay visible, and they never trigger emails).

### List runs

`GET {{baseUrl}}/payroll/runs`  **Who:** HR_ADMIN, HR_MANAGER, FINANCE, AUDITOR

Newest first. Each run has `period`, `cycleFrom`, `cycleTo`, `status`, `employeeCount`, `totalGross`, `totalNet`, `createdBy`, and when set `submittedBy`, `approvedBy`, `returnReason`, `returnedBy`.

### Run lines

`GET {{baseUrl}}/payroll/runs/:period/lines`  **Who:** HR_ADMIN, HR_MANAGER, FINANCE, AUDITOR

`{ "data": { "run": {...}, "lines": [...] } }`. A line has the pay figures (`gross, lopDays, lopAmount, pf, professionalTax, tds, deductions, net, absentDays, wplDays, ...`) and `payStatus` (`PENDING | PAID | FAILED | ON_HOLD`), `transactionRef`, `paidOn`, `payNote`, `payslipSentAt`, `payslipDocumentId`, `emailError`.

### Record payments

`POST {{baseUrl}}/payroll/runs/:period/payments`  **Who:** FINANCE

```json
{ "empIds": ["emp_sanjay", "emp_ananya"], "payStatus": "PAID", "transactionRef": "NEFT-20261105-01", "paidOn": "2026-11-05" }
```

One person or many: send `empIds`, or `"all": true` for every line that is not paid yet. `payStatus` is `PAID`, `FAILED` or `ON_HOLD`. `PAID` needs `transactionRef`. `FAILED` and `ON_HOLD` take an optional `note` and stay flagged until retried with a new call. A line that is already `PAID` is never changed.
**Success (200)** `{ "data": { "run": {...}, "updated": 3, "flagged": 1 } }`. **Errors:** 409 run is not APPROVED, or nothing to update. 422 missing reference, bad date.

### Generate payslips and email

`POST {{baseUrl}}/payroll/runs/:period/payslips`  **Who:** HR_ADMIN. Optional body `{ "empId": "emp_x" }` retries one person.

For every line that is `PAID`: builds a PDF, saves it to S3 and the employee's documents (category `payslips`), emails it as an attachment and sets `payslipSentAt`. A failed email stores `emailError` on that line and the run stays PAID; call again (or with `empId`) to retry. A line with `payslipSentAt` is never emailed again, even if two people press the button together.
**Success (200)** `{ "data": { "run": {...}, "sent": 4, "failed": 0, "skipped": 0 } }`. **Errors:** 409 run is not PAID, or payslips already sent.

### My payslips

`GET {{baseUrl}}/payroll/payslips/me`  **Who:** any signed-in user

Only payslips that were generated (the line has `payslipSentAt`, or it belongs to an older completed run). Each has `payslipDocumentId`, which works with `GET /documents/:id/download-url` for the PDF.

### One person's payslips

`GET {{baseUrl}}/payroll/payslips/employee/:id`  **Who:** HR_ADMIN, HR_MANAGER, FINANCE, or the person himself

HR sees every run, FINANCE the runs from SUBMITTED onwards, the person only released payslips. Each line has `runStatus`. **Errors:** 403 for anyone else.
>>>>>>> master

---

## 9. Assets

### List equipment

`GET {{baseUrl}}/assets`

**Who:** HR, finance, auditor see all. Others see only what is assigned to them.

Equipment inventory.

**Success (200)**

```json
{
  "data": [
    {
      "assetId": "as_laptop1",
      "tag": "KL-LT-0142",
      "name": "MacBook Pro 14",
      "category": "Laptop",
      "status": "AVAILABLE",
      "value": 189900
    }
  ]
}
```

### My equipment

`GET {{baseUrl}}/assets/mine`

**Who:** Any signed-in user

Equipment assigned to me.

**Success (200)**

```json
{
  "data": []
}
```

### Add equipment

`POST {{baseUrl}}/assets`

**Who:** HR_ADMIN, HR_MANAGER

Adds an item. Saves `assetId`.

**Body (JSON)**

```json
{
  "tag": "KL-PH-0007",
  "name": "Pixel 8",
  "category": "Phone",
  "serial": "R5CT9201",
  "purchaseDate": "2024-06-18",
  "value": 62000
}
```

**Success (201)**

```json
{
  "data": {
    "assetId": "as_laptop1",
    "tag": "KL-LT-0142",
    "name": "Pixel 8",
    "category": "Laptop",
    "status": "AVAILABLE",
    "value": 189900
  }
}
```

**Errors:** 422 bad category (Laptop, Phone, Monitor, Accessory, Furniture, Other).

### Assign to a person

`POST {{baseUrl}}/assets/{{assetId}}/assign`

**Who:** HR_ADMIN, HR_MANAGER

Gives an available item to someone and records it in the history.

**Body (JSON)**

```json
{
  "empId": "{{employeeId}}",
  "note": "Issued on joining"
}
```

**Success (200)**

```json
{
  "data": {
    "assetId": "as_laptop1",
    "tag": "KL-LT-0142",
    "name": "MacBook Pro 14",
    "category": "Laptop",
    "status": "ASSIGNED",
    "value": 189900,
    "assignedTo": "emp_sanjay",
    "assignedToName": "Sanjay Patil"
  }
}
```

**Errors:** 409 not available. 404 unknown asset or person.

### Mark returned

`POST {{baseUrl}}/assets/{{assetId}}/return`

**Who:** HR_ADMIN, HR_MANAGER

Marks the item available again.

**Body (JSON)**

```json
{
  "note": "Returned in good condition"
}
```

**Success (200)**

```json
{
  "data": {
    "assetId": "as_laptop1",
    "tag": "KL-LT-0142",
    "name": "MacBook Pro 14",
    "category": "Laptop",
    "status": "AVAILABLE",
    "value": 189900
  }
}
```

**Errors:** 409 not assigned.

### Assignment history

`GET {{baseUrl}}/assets/{{assetId}}/history`

**Who:** HR_ADMIN, HR_MANAGER, AUDITOR

Every assign and return, newest first.

**Success (200)**

```json
{
  "data": [
    {
      "action": "ASSIGNED",
      "empName": "Sanjay Patil",
      "by": "Meera Iyer",
      "at": "..."
    }
  ]
}
```

---

## 10. Documents

### Categories

`GET {{baseUrl}}/documents/categories`

**Who:** Any signed-in user

Allowed document categories.

**Success (200)**

```json
{
  "data": [
    "identity",
    "bank",
    "offer-letters",
    "payslips",
    "certificates",
    "contracts",
    "assets"
  ]
}
```

### 1. Get upload link

`POST {{baseUrl}}/documents/upload-url`

**Who:** HR can upload anything for anyone. Employees can upload identity and certificates for themselves.

Returns a temporary S3 link (5 minutes). Saves `documentId`, `docKey`, `uploadUrl`, `docFilename`. Leave `employeeId` out to upload for yourself.

**Body (JSON)**

```json
{
  "employeeId": "{{employeeId}}",
  "category": "identity",
  "filename": "passport.pdf",
  "contentType": "application/pdf"
}
```

**Success (201)**

```json
{
  "data": {
    "documentId": "doc_1a2b3c4d5e",
    "key": "kestrel/emp_sanjay/identity/doc_1a2b3c4d5e-passport.pdf",
    "uploadUrl": "https://bucket.s3.ap-south-1.amazonaws.com/...",
    "headers": {
      "Content-Type": "application/pdf"
    },
    "expiresIn": 300
  }
}
```

**Errors:** 403 not allowed for this category. 422 bad category or file type.

### 2. Upload file to S3

`PUT {{uploadUrl}}`

**Who:** Goes to S3, not this API

In Postman choose Body > binary and pick a PDF. Do NOT use the API token here (this request has auth turned off). The Content-Type header must match the one requested in step 1.

**Body:** binary file (the PDF itself)

**Success (200)**

```json
200 OK with an empty body from S3
```

**Errors:** 403 from S3 if the link expired (5 minutes) or the Content-Type differs.

### 3. Confirm upload

`POST {{baseUrl}}/documents/confirm`

**Who:** Same person as step 1

Records the document, only if the file really reached S3.

**Body (JSON)**

```json
{
  "documentId": "{{documentId}}",
  "employeeId": "{{employeeId}}",
  "category": "identity",
  "filename": "passport.pdf",
  "key": "{{docKey}}"
}
```

**Success (201)**

```json
{
  "data": {
    "documentId": "doc_1a2b3c4d5e",
    "filename": "passport.pdf",
    "size": 120344,
    "uploadedBy": "Meera Iyer"
  }
}
```

**Errors:** 404 file never finished uploading. 409 already recorded.

### List documents

`GET {{baseUrl}}/documents`

**Who:** The owner, HR. Finance sees payslips and bank documents.

Documents of one person (yours by default). You only see categories you are allowed to view.

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| employeeId | `{{employeeId}}` | Optional. Omit for your own |

**Success (200)**

```json
{
  "data": [
    {
      "documentId": "doc_1a2b3c4d5e",
      "category": "identity",
      "filename": "passport.pdf",
      "size": 120344
    }
  ]
}
```

### Download link

`GET {{baseUrl}}/documents/{{documentId}}/download-url`

**Who:** Same as List documents

Returns a link that stops working after 2 minutes.

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| employeeId | `{{employeeId}}` | Owner of the document. Omit for your own |

**Success (200)**

```json
{
  "data": {
    "url": "https://bucket.s3...?X-Amz-Signature=...",
    "expiresIn": 120,
    "filename": "passport.pdf"
  }
}
```

**Errors:** 403 / 404.

---

## 11. Reports

### Dashboard numbers

`GET {{baseUrl}}/reports/dashboard`

**Who:** Any signed-in user

`scope` is `org` (HR, finance, auditor: whole company), `team` (manager) or `self` (employee: only `pendingMine`).

**Success (200)**

```json
{
  "data": {
    "scope": "org",
    "date": "2026-10-13",
    "headcount": 8,
    "present": 6,
    "late": 1,
    "absent": 1,
    "pendingMine": 2,
    "openRequests": 3
  }
}
```

### Attendance trend

`GET {{baseUrl}}/reports/attendance-trend`

**Who:** HR_ADMIN, HR_MANAGER, FINANCE, AUDITOR

Daily counts for the last N days.

**Query parameters**

| Name | Example | Notes |
|---|---|---|
| days | `14` | 7 to 60, default 14 |

**Success (200)**

```json
{
  "data": [
    {
      "date": "2026-10-12",
      "present": 7,
      "late": 1,
      "halfDay": 0
    }
  ]
}
```

**Errors:** 403 for managers and employees.

### Audit trail

`GET {{baseUrl}}/reports/audit`

**Who:** HR_ADMIN, AUDITOR

The 50 most recent sensitive actions (employee changes, approvals, payroll, assets, settings).

**Success (200)**

```json
{
  "data": [
    {
      "at": "2026-10-13T08:00:00.000Z",
      "actorName": "Rohan Shah",
      "actorRole": "FINANCE",
      "action": "PAYROLL_RUN_FINALIZED",
      "entityType": "PAYROLL",
      "entityId": "2026-09"
    }
  ]
}
```

---

## 12. Notifications

### My notifications

`GET {{baseUrl}}/notifications`

**Who:** Any signed-in user

Latest 30, newest first. Created when something needs you (a request to approve, a decision on yours, a late check-in).

**Success (200)**

```json
{
  "data": [
    {
      "id": "2026-10-13T08:00:00.000Z#n_ab12",
      "title": "Casual leave: approved",
      "body": "By Meera Iyer.",
      "link": "/leave",
      "read": false,
      "createdAt": "..."
    }
  ]
}
```

### Mark all read

`POST {{baseUrl}}/notifications/read-all`

**Who:** Any signed-in user

Marks them read.

**Body (JSON)**

```json
{}
```

**Success (200)**

```json
{
  "data": {
    "done": true
  }
}
```
<<<<<<< HEAD
=======


---

## 13. Platform

Only people in the `platform` organization (SUPER_ADMIN, SALES, FINANCE). A company user, even a company SUPER_ADMIN, gets `403`.
Actions on an organization are written to **that organization's** audit log.

Feature names: `payroll`, `assets`, `reports`, `onboarding`, `projects`.

### Dashboard

`GET {{baseUrl}}/platform/dashboard`  **Who:** SUPER_ADMIN

```json
{ "data": { "organizations": { "total": 2, "active": 2, "suspended": 0 }, "employees": 11, "activePlans": 2,
  "byPlan": [{ "planId": "plan_growth", "name": "Growth", "organizations": 1 }] } }
```

### Reports (revenue)

`GET {{baseUrl}}/platform/reports`  **Who:** SUPER_ADMIN, FINANCE (read-only)

Estimated from plan price x active organizations (there is no invoices table yet). Returns `monthlyRevenue`, `byPlan[]` and `organizations[]`.

### Audit logs

`GET {{baseUrl}}/platform/audit?orgId=kestrel&limit=100`  **Who:** SUPER_ADMIN

Newest first. `orgId` defaults to `platform` (the platform team's own actions). `limit` max 200.

### List organizations

`GET {{baseUrl}}/platform/organizations`  **Who:** SUPER_ADMIN, SALES

Each row: `orgId, name, status (ACTIVE | SUSPENDED), planId, planName, price, maxEmployees, features{}, employeeCount`.

### Create organization

`POST {{baseUrl}}/platform/organizations`  **Who:** SUPER_ADMIN

```json
{ "name": "Acme Traders", "planId": "plan_growth", "timezone": "Asia/Kolkata", "adminName": "Asha", "adminEmail": "asha@acme.test" }
```

`name` and `planId` required. The organization gets the features of its plan. With `adminName` + `adminEmail` its first HR_ADMIN is created and `tempPassword` is returned (or send `adminPassword`).
**Errors:** 404 plan, 409 name or email already used, 422 missing field.

### Update / suspend / reactivate

- `PATCH {{baseUrl}}/platform/organizations/:orgId` body `{ "name", "timezone" }`  **Who:** SUPER_ADMIN
- `POST {{baseUrl}}/platform/organizations/:orgId/suspend`  **Who:** SUPER_ADMIN. People of that company can no longer sign in, and signed-in users get `403` on feature routes.
- `POST {{baseUrl}}/platform/organizations/:orgId/reactivate`  **Who:** SUPER_ADMIN

### Set features

`PUT {{baseUrl}}/platform/organizations/:orgId/features`  **Who:** SUPER_ADMIN, SALES

```json
{ "features": { "payroll": false, "assets": true } }
```

Only the named switches change. **Errors:** 422 unknown feature or value that is not true/false.

### Set plan

`PUT {{baseUrl}}/platform/organizations/:orgId/plan`  **Who:** SUPER_ADMIN, SALES

```json
{ "planId": "plan_starter" }
```

Also sets the organization's feature switches to the features of that plan. Change single switches afterwards with *Set features*.
The plan's `maxEmployees` blocks creating more active employees (`403` on `POST /employees`).

### Plans

- `GET {{baseUrl}}/platform/plans`  **Who:** SUPER_ADMIN, SALES, FINANCE
- `POST {{baseUrl}}/platform/plans`  **Who:** SUPER_ADMIN, SALES. Body `{ "name", "price", "maxEmployees", "features": ["payroll", ...] }`
- `PATCH {{baseUrl}}/platform/plans/:planId`  **Who:** SUPER_ADMIN, SALES. Body any of `name, price, maxEmployees, features, status (ACTIVE | ARCHIVED)`.
  Changing a plan does not change organizations already on it; assign the plan again to apply new features.

### Platform staff

- `GET {{baseUrl}}/platform/staff`  **Who:** SUPER_ADMIN
- `POST {{baseUrl}}/platform/staff`  **Who:** SUPER_ADMIN. Body `{ "name", "email", "role": "SALES" | "FINANCE" }`. Returns `tempPassword`.

### Changes to existing endpoints (Phase 1)

- `POST/PATCH /employees`: `role` may now be `PROJECT_MANAGER`.
- `GET /employees`, `GET /employees/:id`, `GET /attendance/org`, `GET /attendance/employee/:id`, `GET /reports/dashboard`: a MANAGER sees his whole team tree (project managers and their members), a PROJECT_MANAGER sees his members. Nobody sees another manager's people.
- `POST /auth/login`, `GET /auth/me`: the user object now has `features` and `isPlatform`.
- `/payroll/*` needs feature `payroll`, `/assets/*` needs `assets`, `/reports/attendance-trend` and `/reports/audit` need `reports`.


---

## 14. Breaks, tasks, expense bills, salary so far (Phase 2)

### Start a break

`POST {{baseUrl}}/attendance/break/start`  **Who:** anyone who checks in

Rules (all enforced here, settings come from the organization): checked in and not checked out, no break already open, breaks used < `maxBreaksPerDay`, and if `breakAllowedAfterMinutes` is set, at least that many minutes since check-in. If it is not set a break is allowed any time between check-in and check-out.

**Success (201)** `{ "data": { "breaksUsed": 1, "onBreak": true } }`
**Errors:** 400 not checked in. 409 with the reason (already on a break, all breaks used, too early, already checked out, breaks not enabled).

### End a break

`POST {{baseUrl}}/attendance/break/end`  **Who:** anyone who checks in

**Success (200)** `{ "data": { "breaksUsed": 1, "onBreak": false, "breakMinutes": 12 } }`. **Errors:** 409 you are not on a break.

Break time is not counted as worked time: `workedMinutes` on check-out is the time since check-in minus the breaks. Check-out closes a break that is still open. The attendance record has `breaks: [{ startAt, endAt }]` and `breakMinutes`.

### Today (changed)

`GET {{baseUrl}}/attendance/today` now also returns

```json
{ "policy": { "maxBreaksPerDay": 2, "breakAllowedAfterMinutes": null },
  "breaksUsed": 0, "onBreak": false, "canBreakNow": true, "breakBlockedReason": null }
```

`canBreakNow` is computed by the same rule as `break/start`; when false, `breakBlockedReason` is a short sentence. The app shows the Break button only when `canBreakNow` is true.

### Settings (changed)

`PUT {{baseUrl}}/organizations/policy`  **Who:** HR_ADMIN. New optional fields:

| Field | Meaning |
|---|---|
| `maxBreaksPerDay` | whole number 0 to 10. 0 = breaks off (the default until set) |
| `breakAllowedAfterMinutes` | whole number of minutes since check-in. `null` or `""` = not set |
| `cycleStartDay` | 1 to 28. 1 = calendar month (default). 26 = pay cycle 26th to 25th |
| `holidays` | `[{ "date": "2026-12-25", "name": "Christmas Day" }]`. Not working days |

**Errors:** 422 with a plain message for an invalid value.

`POST {{baseUrl}}/organizations/leave-types` accepts `"paid": false` for without-pay leave (WPL). Leave types without the flag are paid.

### My tasks (today)

`GET {{baseUrl}}/projects/tasks/mine`  **Who:** any signed-in user. Needs feature `projects`.

Tasks assigned to me that are due today or earlier and not done, plus the ones I finished today. Each task has `projectName` and `overdue`.

### Change my task status

`PATCH {{baseUrl}}/projects/tasks/:projectId/:taskId/status`  **Who:** only the person the task is assigned to

```json
{ "status": "IN_PROGRESS" }
```

`status` is `TODO`, `IN_PROGRESS` or `DONE`. Finishing a task notifies the person who assigned it. **Errors:** 403 not your task, 404, 422.

### Expenses: bill is required (changed)

1. `POST /documents/upload-url` with `"category": "expense-bills"`, PUT the file to the returned URL, `POST /documents/confirm`.
2. `POST {{baseUrl}}/expenses` with `"billDocumentId": "<documentId from confirm>"` plus the usual fields.

**Errors:** 422 when `billDocumentId` is missing, or is not one of your own `expense-bills` documents. 409 when the same bill is already on another claim.
The claim stores `billDocumentId`, `billKey`, `billFilename`; the approval `payload` carries `billDocumentId` so approvers can open it.
Expense bills can be opened (`GET /documents/:id/download-url?employeeId=<owner>`) by the owner, HR, finance, auditors and the owner's managers. Allowed upload types: PDF, PNG, JPG.

### My salary so far

`GET {{baseUrl}}/payroll/my-estimate`  **Who:** any signed-in user (his own pay only). Needs feature `payroll`.

From the first day of the current pay cycle (`cycleStartDay`) up to today (today counts once you have checked in). Weekends and holidays are not working days.

```json
{ "data": {
  "label": "Estimate till today, not a payslip",
  "period": "2026-11",
  "cycle": { "from": "2026-10-26", "to": "2026-11-25", "asOf": "2026-11-05" },
  "days":  [{ "label": "Present days", "value": 6 }, ...],
  "lines": [{ "label": "Absent: 1 days x 4714", "amount": -4714, "kind": "deduct" }, ...],
  "summary": { "gross": 99000, "absentDays": 1, "wplDays": 0, "lopAmount": 4714, "net": 82805 } } }
```

Days counted: present, half days (0.5), approved paid leave, without-pay leave (WPL) and absent days (deductions), then PF, professional tax and TDS (example rules, see `services/payCalc.js`).

### Payroll runs (changed)

A run's `period` is named after the month its cycle ends in. `POST /payroll/runs` saves `cycleFrom` and `cycleTo` on the run (from `cycleStartDay`), so changing the setting later does not move an old run. Calculation now uses those dates, org holidays, and the paid flag of leave types. Lines have extra fields: `elapsedDays, presentDays, halfDays, paidLeaveDays, wplDays, absentDays, dayRate`; `lopDays` is absent + WPL.


---

## 15. Projects, team, onboarding, performance (Phases 3 and 4)

### Leave and expense routing (changed)

Stage 1 is the requester's reporting manager: the first ACTIVE person up the `managerId` chain. For an employee that is his PROJECT_MANAGER; with no project manager it is his Manager; if that person has left, one level up. It **never** goes to HR first. HR (stage 2) sees the request, and gets Approve / Reject, only after stage 1 approved. HR_MANAGER can also decide the HR stage.
With nobody to approve, `POST /leave` and `POST /expenses` answer `409` ("You have no active reporting manager...") **before** saving anything.
`GET /approvals/:id` now returns, per stage, `decision: { action, actorName, comment, at }` once that stage decided, so HR sees what the project manager said.

### Projects (feature `projects`)

Managers own projects (`managerId`), project managers run them (`pmId`). Each project has members (an employee works on it under a project manager) and tasks.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /projects` | any | MANAGER: his own. PROJECT_MANAGER: the ones he runs. HR/AUDITOR: all. Others: where they are a member. Each has `taskCounts` |
| `GET /projects/:projectId` | owner manager, project manager, HR, members | members, tasks (a plain member sees only his own), `canManage`, `canAssignTasks` |
| `POST /projects` | MANAGER, HR_ADMIN | `{ name, startDate?, endDate?, pmId?, managerId (HR only) }`. A manager can only pick a project manager from his own team (403) |
| `PATCH /projects/:projectId` | the project's MANAGER, HR_ADMIN | `name, status (ACTIVE \| ON_HOLD \| COMPLETED), startDate, endDate` |
| `PUT /projects/:projectId/pm` | the project's MANAGER, HR_ADMIN | `{ pmId }`. Members move under the new project manager |
| `POST /projects/:projectId/members` | the project's MANAGER, HR_ADMIN | `{ empId }`. A manager can only add people from his own team. Needs a project manager first |
| `DELETE /projects/:projectId/members/:empId` | same | 409 while the person still has open tasks on the project |
| `POST /projects/:projectId/tasks` | MANAGER, PROJECT_MANAGER of that project | `{ title, description?, assigneeId, dueDate }`. A manager assigns to the project manager, a project manager to a member (422 otherwise) |
| `PATCH` / `DELETE /projects/:projectId/tasks/:taskId` | who assigned it, the project's manager or project manager | `title, description, dueDate` |
| `GET /projects/tasks/mine`, `PATCH /projects/tasks/:projectId/:taskId/status` | assignee | see section 14 |

### Team dashboard (feature `projects`)

`GET {{baseUrl}}/team/overview`  **Who:** MANAGER, PROJECT_MANAGER

A MANAGER gets one group per project manager (that person's whole team, every level), plus a group for people reporting to him directly. A PROJECT_MANAGER gets one group. Who is included comes from the token, never from a parameter.

```json
{ "data": { "date": "2026-11-16", "groups": [ {
  "lead": { "empId": "emp_pooja", "name": "Pooja Menon" }, "size": 2,
  "attendance": { "present": 1, "late": 1, "halfDay": 0, "onLeave": 0, "notIn": 0 },
  "tasks": { "open": 3, "inProgress": 1, "done": 2, "overdue": 1, "total": 5 },
  "members": [ { "empId": "emp_sanjay", "name": "Sanjay Patil", "today": "PRESENT", "tasks": { "open": 2, "overdue": 1 } } ] } ] } }
```

`GET {{baseUrl}}/team/employee/:id?month=2026-11`  **Who:** MANAGER, PROJECT_MANAGER, HR, FINANCE, AUDITOR (and the same people-visibility rule as `GET /employees/:id`, otherwise 403)

One person's attendance for the month (`records`, `summary`), leave requests and tasks.

### Performance

`GET {{baseUrl}}/employees/:id/performance?month=2026-11`  **Who:** same visibility as `GET /employees/:id` (the person himself, HR, finance, auditor, his managers)

```json
{ "data": { "month": "2026-11", "score": 83, "label": "Good",
  "components": { "tasks": { "weight": 0.5, "score": 0.75, "due": 4, "onTime": 3, "doneLate": 1 },
                  "attendance": { "weight": 0.4, "score": 0.9, "present": 12, "late": 2, "halfDay": 0, "absent": 1 },
                  "leaves": { "weight": 0.1, "score": 0.8, "days": 1 } },
  "trend": [ { "month": "2026-06", "score": 71 }, "... six months, oldest first" ] } }
```

`GET {{baseUrl}}/employees/performance?month=2026-11`  **Who:** HR_ADMIN, HR_MANAGER, MANAGER, PROJECT_MANAGER, AUDITOR: one row per visible person, best score first.
The formula and its weights are constants at the top of `services/performance.js`. A part with nothing to measure (no tasks due) is left out and the other weights scale up.

### Onboarding (feature `onboarding`)

HR creates an invite; the candidate gets a link `/onboard/<token>` (7 days, one submission); HR reviews and converts it into an employee.

| Endpoint | Who | Notes |
|---|---|---|
| `POST /onboarding/invites` | HR_ADMIN, HR_MANAGER | `{ name, email, role?, deptId?, designation? }`. Emails the link and returns `link`, `emailSent`, `emailError`. 409 if the email already belongs to an employee |
| `GET /onboarding/invites` | HR | statuses `SENT`, `SUBMITTED`, `CONVERTED`. Never includes bank or ID numbers |
| `GET /onboarding/invites/:token` | HR | the submission (bank account and ID decrypted) and the uploaded documents |
| `GET /onboarding/invites/:token/documents/:documentId/url` | HR | 2-minute link to a file the candidate uploaded |
| `POST /onboarding/invites/:token/resend` | HR | emails the link again |
| `POST /onboarding/invites/:token/convert` | HR_ADMIN | `{ joinDate, salary, designation, deptId, role?, managerId? }`. Creates the employee with the same code as `POST /employees`, files the documents on his card. Returns `employee` and `tempPassword`. 409 if not SUBMITTED or already converted |

**Public endpoints (no sign-in).** The long random token in the link is the key. Rate limited per IP (120 requests per 15 minutes, 30 for uploads, 10 for submitting). A wrong token is `404`, an expired link `410`, a submitted form `409`.

| Endpoint | Notes |
|---|---|
| `GET /public/onboarding/:token` | candidate name and email, company name, uploaded files |
| `POST /public/onboarding/:token/upload-url` | `{ category: identity \| bank \| certificates, filename, contentType }`. PDF, PNG or JPG only, up to 15 files. Returns a 5-minute S3 upload URL |
| `POST /public/onboarding/:token/confirm` | `{ documentId, category, filename, key }`. Checks the file in S3: over 10 MB or a wrong type is deleted and refused |
| `POST /public/onboarding/:token/submit` | `{ phone, address, bankAccount, bankIfsc, nationalId, dob?, emergencyName?, emergencyPhone?, bankName? }`. Needs at least one identity document. Bank account and national ID are stored encrypted |

### Email

`services/mailer.js` sends through Amazon SES (default) or SMTP (`MAIL_TRANSPORT=smtp`); `MAIL_TRANSPORT=log` prints emails instead of sending (development). See `.env.example`.

>>>>>>> master
