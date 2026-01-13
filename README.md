# FaceCheck Server - NestJS Microservice

A comprehensive NestJS microservice application for managing academic attendance and session tracking with face recognition capabilities. The system is designed for the College of Medicine and Allied Sciences (COMAS), handling students, lecturers, courses, sessions, and attendance records.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [Modules](#modules)
- [Database Schema](#database-schema)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Running the Application](#running-the-application)
- [Testing](#testing)

---

## Overview

FaceCheck Server is a NestJS-based microservice built to streamline academic attendance management through integration with face recognition technology. The application supports multiple user roles (Students, Lecturers, Staff, Admins) and provides comprehensive features for course management, session tracking, attendance recording, and payroll management.

**Key Technologies:**

- **Framework**: NestJS 11.0.1
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT (JSON Web Tokens) with Passport
- **Message Queue**: BullMQ for asynchronous job processing
- **Storage**: Supabase for image management
- **Email**: Brevo SMTP for email notifications
- **Cache**: Cache Manager for performance optimization
- **Rate Limiting**: Throttler module for API rate limiting

---

## Architecture

### Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (NestJS)                         │
│  Controllers for Auth, Users, Courses, Sessions, etc.       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                              │
│  Business Logic & Data Processing                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Data Access Layer                          │
│  Prisma ORM + PostgreSQL Database                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              External Services Integration                   │
│  Supabase (Storage) | Brevo (Email) | Redis (Cache)        │
└─────────────────────────────────────────────────────────────┘
```

### Request/Response Flow

1. **Incoming Request**: Hits the API endpoint (Controller)
2. **Authentication**: JWT validation via `JwtAuthGuard`
3. **Business Logic**: Processed by the Service layer
4. **Data Persistence**: Prisma ORM handles database operations
5. **Async Tasks**: BullMQ jobs for image processing
6. **Response**: JSON response sent back to client

---

## Project Structure

```
nestjs-microservice/
├── src/
│   ├── app.controller.ts          # Root controller
│   ├── app.service.ts             # Root service
│   ├── app.module.ts              # Root module (imports all modules)
│   ├── main.ts                    # Application bootstrap
│   │
│   ├── auth/                      # Authentication & JWT
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── jwt-auth.guard.ts      # JWT authentication guard
│   │   └── jwt.strategy.ts        # Passport JWT strategy
│   │
│   ├── users/                     # User management
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   │
│   ├── courses/                   # Course management
│   │   ├── courses.controller.ts
│   │   ├── courses.service.ts
│   │   └── courses.module.ts
│   │
│   ├── sessions/                  # Session & Attendance sessions
│   │   ├── sessions.controller.ts
│   │   ├── sessions.service.ts
│   │   └── sessions.module.ts
│   │
│   ├── notifications/             # User notifications & logs
│   │   ├── notifications.controller.ts
│   │   ├── notifications.service.ts
│   │   └── notifcations.module.ts
│   │
│   ├── producers/                 # BullMQ job producers
│   │   ├── image.producer.ts      # Image processing jobs
│   │   └── producers.module.ts
│   │
│   ├── consumers/                 # BullMQ job consumers
│   │   ├── image.consumer.ts      # Image processing worker
│   │   └── consumers.module.ts
│   │
│   ├── helpers/                   # Utility functions
│   │   ├── helpers.service.ts     # Common helper methods
│   │   └── helpers.module.ts
│   │
│   ├── dto/                       # Data Transfer Objects (DTOs)
│   │   ├── auth.dto.ts
│   │   ├── users.dto.ts
│   │   ├── courses.dto.ts
│   │   └── sessions.dto.ts
│   │
│   ├── enums/                     # TypeScript Enums
│   │   └── user.enums.ts
│   │
│   ├── prisma/                    # Database service
│   │   └── prisma.service.ts
│   │
│   ├── supabase/                  # Supabase configuration
│   │   └── supabase-client.ts
│   │
│   ├── config/                    # Application configuration
│   │   └── app.config.ts
│   │
│   ├── views/                     # EJS email templates
│   │   └── email-verify.ejs
│   │
│   ├── attendance/                # (Empty - placeholder)
│   ├── analytics/                 # (Empty - placeholder)
│   └── payroll/                   # (Empty - placeholder)
│
├── prisma/
│   ├── schema.prisma              # Database schema definition
│   └── migrations/                # Database migrations
│
├── generated/
│   └── prisma/                    # Generated Prisma types
│
├── test/
│   ├── jest-e2e.json
│   └── app.e2e-spec.ts
│
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
├── eslint.config.mjs              # ESLint configuration
└── README.md                       # This file
```

---

## Core Features

### 1. **User Management**

- Multi-role support (Student, Lecturer, Staff, Admin)
- User registration and email verification
- Password management with hashing (bcrypt)
- Profile updates with image upload
- User status tracking (Active, Inactive, Locked)

### 2. **Authentication & Security**

- JWT-based authentication
- Role-based access control (RBAC)
- Login attempt tracking with account lockout
- Email verification via OTP codes
- Password reset with secure tokens
- IP address tracking for security monitoring

### 3. **Course Management**

- Course creation and management
- Course assignment to lecturers
- Student enrollment in courses
- Course code uniqueness validation
- Course representative assignment

### 4. **Session Management**

- Create attendance sessions (Online/Physical/Hybrid)
- Session state management (Open/Closed)
- Time-based session validation
- Session linking to lecturers and courses
- Unique session tokens for access control

### 5. **Attendance Tracking**

- Mark student attendance in sessions
- Attendance history logging
- Session-based attendance records
- Attendance status management

### 6. **Image Processing & Face Recognition**

- Asynchronous image upload via BullMQ
- Image storage in Supabase
- Face embedding generation
- Image status tracking (Pending/Processing/Uploaded/Failed)
- Job queue with exponential backoff

### 7. **Notifications System**

- User notification logs
- Notification status management (Read/Unread)
- Notification deletion
- System-wide logging

### 8. **Email Management**

- Email verification for registration
- Password reset notifications
- HTML email templates (EJS)
- Brevo SMTP integration

### 9. **Rate Limiting & Throttling**

- Global rate limiter (5 requests per 60 seconds)
- CORS enabled for cross-origin requests
- Static asset serving

---

## Modules

### **AuthModule**

Handles user authentication and authorization.

**Controllers:**

- `POST /api/auth/register` - Register new student
- `POST /api/auth/login` - User login
- `GET /api/auth/verify-email` - Email verification
- `POST /api/auth/reset-password` - Change password (requires JWT)
- `GET /api/auth/request-reset-code` - Request password reset code (requires JWT)

**Services:**

- User registration with email verification
- Login with credential validation
- JWT token generation
- Email verification code validation
- Password reset functionality

---

### **UsersModule**

Manages user profiles and enrollment.

**Controllers:**

- `POST /api/users/enroll` - Enroll user (Student/Lecturer/Staff)
- `GET /api/users/job-status` - Get image processing job status
- `PATCH /api/users/update` - Update user details (requires JWT)
- `PATCH /api/users/update-records` - Update user academic records (requires JWT)
- `GET /api/users/remove` - Remove user account (requires JWT)
- `GET /api/users/all` - Get all users (requires JWT)

**Services:**

- Conditional user enrollment based on role
- Image upload to Supabase
- Student profile creation with course enrollment
- Lecturer profile creation with hourly rates
- Staff profile management
- User detail updates
- Account removal with cascading deletes

---

### **CoursesModule**

Manages academic courses.

**Controllers:**

- `POST /api/courses/add` - Create new course
- `PATCH /api/courses/update/:id` - Update course details
- `GET /api/courses/all` - Get all courses
- `GET /api/courses/:id` - Get course by ID

**Services:**

- Course creation with lecturer assignment
- Course updates (title, description)
- Lecturer management for courses
- Course retrieval and filtering

---

### **SessionsModule**

Manages attendance sessions.

**Controllers:**

- `POST /api/sessions/create` - Create new session (requires JWT)
- `GET /api/sessions/close` - Close session (requires JWT)
- `POST /api/sessions/admin/all-sessions` - Get all sessions (admin)
- `GET /api/sessions/creator-sessions` - Get user's sessions (requires JWT)

**Services:**

- Session creation with validation
- Session state management
- Lecturer/course linking
- Session token generation
- Multiple open session prevention

---

### **NotificationsModule**

Handles user notifications and logging.

**Controllers:**

- `GET /api/notifications` - Get user notifications (requires JWT)
- `DELETE /api/notifications/:id` - Delete notification (requires JWT)
- `PATCH /api/notifications/:id/read` - Mark as read (requires JWT)
- `DELETE /api/notifications/clear-all` - Clear all notifications (requires JWT)

**Services:**

- Fetch user-specific notifications
- Delete individual notifications
- Mark notifications as read
- Clear all notifications for user

---

### **ProducersModule**

Creates asynchronous jobs for processing.

**ImageProducer:**

- Adds image processing jobs to BullMQ queue
- Tracks job status
- Handles job retrieval and error handling

**Features:**

- Exponential backoff on retry
- Job removal on success
- Failed job retention for debugging

---

### **ConsumersModule**

Processes asynchronous jobs.

**ImageConsumer:**

- Processes image jobs from queue
- Updates image processing status
- Generates face embeddings
- Handles processing failures with rollback

---

### **HelpersModule**

Provides utility functions across the application.

**Key Services:**

- `getUser(email)` - Retrieve user from database
- `checkRole(email, role)` - Validate user role
- `enforceMailType(regex, email)` - Validate email format
- `uploadImage()` - Upload image to Supabase
- `getFaceEmbedding()` - Generate face embeddings
- `sendEmail()` - Send emails via Brevo
- `createSystemLog()` - Log system events
- `hashPassword()` - Hash passwords with bcrypt

---

## Database Schema

### Core Models

#### **User**

Central user entity with multi-role support.

```prisma
- id (String, Primary Key)
- email (String, Unique)
- name (String)
- password (String, hashed)
- phone (String)
- role (Enum: STUDENT, LECTURER, STAFF, ADMIN, REP)
- imageUrl (String, Supabase URL)
- imageStatus (ImageStatus: PENDING, PROCESSING, UPLOADED, FAILED)
- faceEmbedding (String, Vector)
- embeddingStatus (ImageStatus)
- accountStatus (ACTIVE, INACTIVE, LOCKED)
- loginRetries (Int)
- accountLockedUntil (DateTime)
- emailVerificationCode (String)
- emailVerificationRetries (Int)
- emailCodeCreatedAt (DateTime)
- passwordResetCode (String)
- resetCodeCreatedAt (DateTime)
- lastLoginAt (DateTime)
- lastLoginIp (String)
- ipAddress (String)
- isActive (Boolean)
- createdAt (DateTime)
- updatedAt (DateTime)

Relations:
- student (Student?)
- lecturer (Lecturer?)
- staff (Staff?)
- admin (Admin?)
- sessions (Session[])
- attendances (Attendance[])
- logs (Logs[])
```

#### **Student**

Student-specific information.

```prisma
- id (String, Primary Key)
- userId (String, Unique Foreign Key)
- studentId (String, Unique)
- matricNo (String, Unique)
- createdAt (DateTime)
- updatedAt (DateTime)

Relations:
- user (User)
- enrollments (CourseEnrollment[])
- courseReps (CourseRep[])
```

#### **Lecturer**

Lecturer/Faculty information.

```prisma
- id (String, Primary Key)
- userId (String, Unique Foreign Key)
- staffNo (String, Unique)
- hourlyRate (Float)
- createdAt (DateTime)
- updatedAt (DateTime)

Relations:
- user (User)
- courses (CourseLecturer[])
- sessions (Session[])
```

#### **Course**

Academic course information.

```prisma
- id (String, Primary Key)
- code (String, Unique)
- title (String)
- description (String)
- createdAt (DateTime)
- updatedAt (DateTime)

Relations:
- enrollments (CourseEnrollment[])
- lecturers (CourseLecturer[])
- reps (CourseRep[])
- sessions (Session[])
```

#### **Session**

Attendance session information.

```prisma
- id (String, Primary Key)
- userId (String, Foreign Key)
- courseId (String, Foreign Key)
- lecturerId (String, Foreign Key)
- name (String)
- token (String, Unique)
- type (Enum: LECTURE, EXAM, PRACTICAL)
- mode (Enum: ONLINE, PHYSICAL, HYBRID)
- location (String)
- status (OPEN, CLOSED, CANCELLED)
- startTime (DateTime)
- endTime (DateTime)
- createdAt (DateTime)
- updatedAt (DateTime)

Relations:
- createdBy (User)
- course (Course)
- lecturer (Lecturer)
- attendances (Attendance[])
```

#### **Attendance**

Student attendance records.

```prisma
- id (String, Primary Key)
- userId (String, Foreign Key)
- sessionId (String, Foreign Key)
- status (PRESENT, ABSENT, EXCUSED)
- markedAt (DateTime)

Relations:
- user (User)
- session (Session)
```

#### **CourseEnrollment**

Student enrollment in courses.

```prisma
- id (String, Primary Key)
- studentId (String, Foreign Key)
- courseId (String, Foreign Key)
- enrolledAt (DateTime)

Relations:
- student (Student)
- course (Course)
```

#### **Logs**

System and user activity logs.

```prisma
- id (String, Primary Key)
- userId (String, Foreign Key)
- message (String)
- type (Enum: SYSTEM, USER)
- status (UNREAD, READ)
- priority (Enum: LOW, MEDIUM, HIGH)
- createdAt (DateTime)

Relations:
- user (User)
```

#### **Staff & Admin**

Administrative user information.

```prisma
Staff:
- id (String, Primary Key)
- userId (String, Unique Foreign Key)
- staffNo (String, Unique)

Admin:
- id (String, Primary Key)
- userId (String, Unique Foreign Key)
```

---

## Installation & Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL database
- Redis instance (for BullMQ)
- Supabase account (for storage)
- Brevo account (for email)

### Step 1: Clone and Install Dependencies

```bash
cd nestjs-microservice
npm install
```

### Step 3: Database Setup

Run Prisma migrations:

```bash
npx prisma migrate dev
```

Generate Prisma Client:

```bash
npx prisma generate
```

(Optional) Seed the database:

```bash
npx prisma db seed
```

---

## Configuration

### App Configuration (`src/config/app.config.ts`)

The application loads configuration from environment variables:

```typescript
{
  app: {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
  mailer: {
    brevoServer: process.env.MAILER_BREVO_SERVER,
    brevoPort: process.env.MAILER_BREVO_PORT,
    brevoUser: process.env.MAILER_BREVO_USER,
    brevoSmtpKey: process.env.MAILER_BREVO_SMTP_KEY,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
}
```

### Global Middleware & Guards

Configured in `app.module.ts`:

- **ValidationPipe**: Validates and transforms incoming DTOs
- **JwtAuthGuard**: Protects routes requiring authentication
- **ThrottlerGuard**: Rate limiting (5 requests per 60 seconds)
- **CORS**: Enabled for all origins with credentials

### Email Template

Email verification template located at `src/views/email-verify.ejs`:

Used for sending verification codes to users during registration.

---

## API Endpoints

### Authentication Endpoints

| Method | Endpoint                       | Description            | Auth Required |
| ------ | ------------------------------ | ---------------------- | ------------- |
| POST   | `/api/auth/register`           | Register new student   | No            |
| POST   | `/api/auth/login`              | Login user             | No            |
| GET    | `/api/auth/verify-email`       | Verify email with code | No            |
| POST   | `/api/auth/reset-password`     | Change password        | Yes           |
| GET    | `/api/auth/request-reset-code` | Request password reset | Yes           |

### Users Endpoints

| Method | Endpoint                    | Description             | Auth Required |
| ------ | --------------------------- | ----------------------- | ------------- |
| POST   | `/api/users/enroll`         | Enroll user (S/L/St)    | No            |
| GET    | `/api/users/job-status`     | Get image job status    | No            |
| PATCH  | `/api/users/update`         | Update user profile     | Yes           |
| PATCH  | `/api/users/update-records` | Update academic records | Yes           |
| GET    | `/api/users/remove`         | Remove user account     | Yes           |
| GET    | `/api/users/all`            | List all users          | Yes           |

### Courses Endpoints

| Method | Endpoint                  | Description      | Auth Required |
| ------ | ------------------------- | ---------------- | ------------- |
| POST   | `/api/courses/add`        | Create course    | No            |
| PATCH  | `/api/courses/update/:id` | Update course    | No            |
| GET    | `/api/courses/all`        | List all courses | No            |
| GET    | `/api/courses/:id`        | Get course by ID | No            |

### Sessions Endpoints

| Method | Endpoint                           | Description       | Auth Required |
| ------ | ---------------------------------- | ----------------- | ------------- |
| POST   | `/api/sessions/create`             | Create session    | Yes           |
| GET    | `/api/sessions/close`              | Close session     | Yes           |
| POST   | `/api/sessions/admin/all-sessions` | Get all sessions  | No            |
| GET    | `/api/sessions/creator-sessions`   | Get user sessions | Yes           |

### Notifications Endpoints

| Method | Endpoint                       | Description         | Auth Required |
| ------ | ------------------------------ | ------------------- | ------------- |
| GET    | `/api/notifications`           | Get notifications   | Yes           |
| DELETE | `/api/notifications/:id`       | Delete notification | Yes           |
| PATCH  | `/api/notifications/:id/read`  | Mark as read        | Yes           |
| DELETE | `/api/notifications/clear-all` | Clear all           | Yes           |

---

## Running the Application

### Development Mode

```bash
npm run start:dev
```

Runs the application with hot-reload enabled. Perfect for development.

### Production Mode

```bash
npm run build
npm run start:prod
```

Builds the application and runs the compiled version.

### Debug Mode

```bash
npm run start:debug
```

Runs with Node debugger enabled for detailed debugging.

---

## Testing

### Unit Tests

```bash
npm run test
```

Run all test files matching `*.spec.ts` pattern.

### Test Watch Mode

```bash
npm run test:watch
```

Continuously run tests on file changes.

### Test Coverage

```bash
npm run test:cov
```

Generate coverage report for all test files.

### End-to-End Tests

```bash
npm run test:e2e
```

Run integration tests defined in `test/` folder.

**Current E2E Test:** [app.e2e-spec.ts](test/app.e2e-spec.ts)

---

## Development Scripts

```bash
npm run format        # Format code with Prettier
npm run lint          # Fix ESLint issues
npm run build         # Build production bundle
npm run start         # Run production build
npm run start:dev     # Run with hot-reload
npm run start:debug   # Run with debugger
```

---

## Key Design Patterns

### 1. **Dependency Injection**

NestJS provides built-in DI container. Services are injected into controllers and other services.

### 2. **Repository Pattern**

Prisma acts as the repository layer, abstracting database access.

### 3. **Service-Oriented Architecture**

Business logic is encapsulated in service classes for reusability and testability.

### 4. **Guard-Based Authorization**

JWT and role-based access control through custom guards.

### 5. **Job Queue Pattern**

BullMQ handles asynchronous operations (image processing) with retry logic.

### 6. **DTO Validation**

Class-validator ensures type safety and input validation.

---

## Error Handling

The application uses NestJS exception filters:

- **BadRequestException** - Invalid input/validation errors
- **UnauthorizedException** - Invalid credentials
- **ForbiddenException** - Insufficient permissions
- **NotFoundException** - Resource not found
- **ConflictException** - Resource already exists
- **PreconditionFailedException** - Pre-condition failed (e.g., email sending)

---

## Security Considerations

1. **Password Hashing**: Uses bcrypt with salt (10 rounds)
2. **JWT Tokens**: Secure authentication and authorization
3. **Email Verification**: OTP-based email verification
4. **Account Lockout**: Automatic lockout after failed login attempts
5. **CORS Configuration**: Restricted to known domains in production
6. **IP Tracking**: Logs user IP for security monitoring
7. **Rate Limiting**: Prevents brute force attacks

---

## Performance Optimization

1. **Caching**: Cache Manager for frequently accessed data
2. **Job Queuing**: BullMQ for non-blocking image processing
3. **Database Indexing**: Unique constraints on frequently queried fields
4. **Connection Pooling**: PostgreSQL with Prisma adapter
5. **Static Asset Serving**: Express static middleware for public files

---

## Monitoring & Logging

The application includes:

- System logs for important events
- User activity logs through Logs model
- Job queue monitoring via BullMQ dashboard (if enabled)
- Error logging in services

---

## Contributing

When adding new features:

1. Create a new module with controller, service, and module files
2. Define DTOs for input validation
3. Add database migrations if needed
4. Write unit and E2E tests
5. Update this README with new endpoints

---

## License

UNLICENSED - This project is proprietary to COMAS.

---

## Support

For issues, questions, or suggestions, please contact the development team.

---

**Last Updated**: January 13, 2026
