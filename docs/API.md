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
- A role not listed under **Who** gets `403`. SUPER_ADMIN can do everything.

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
| kavya@kestrel.test | MANAGER | approves for sanjay, ananya, vikram |
| sanjay@kestrel.test | EMPLOYEE | has a pending leave request `lr_seed01` |
| ananya@kestrel.test | EMPLOYEE | not checked in today |
| vikram@kestrel.test | EMPLOYEE | |

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
