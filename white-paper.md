# Face Recognition Microservice: Technical White Paper

## Executive Summary

The Face Recognition Microservice is a specialized Python-based service designed to perform facial recognition and face embedding operations for an attendance tracking system. It provides two core capabilities: user enrollment through face capture and real-time face recognition for attendance verification. The service leverages advanced deep learning models for face detection and embedding generation, combined with vector search capabilities for fast and accurate identification.

## 1. Introduction

### 1.1 Purpose
The Face Recognition Microservice provides the facial biometric backbone for the facecheck attendance tracking system. It enables:
- **Enrollment**: Capturing and storing facial embeddings for new users
- **Recognition**: Identifying users from facial images with high accuracy and minimal latency

### 1.2 System Context
This microservice operates as part of a larger distributed system:
- **NestJS Backend**: Main application server handling business logic, database management, and API orchestration
- **Python Microservice**: Specialized face recognition service (this component)
- **Qdrant Vector Database**: High-performance vector similarity search engine for face embeddings
- **PostgreSQL (via Prisma)**: Primary database for user and attendance records

## 2. Architecture Overview

### 2.1 Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Client / NestJS Backend             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  FastAPI    │
                    │ Application │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐      ┌─────▼─────┐      ┌────▼────┐
   │  Enroll  │      │ Recognize │      │ Startup │
   │ Endpoint │      │ Endpoint  │      │ Events  │
   └────┬────┘      └─────┬─────┘      └────┬────┘
        │                  │                 │
        └──────────────────┼─────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼───────┐    ┌────▼──────┐    ┌─────▼──────┐
   │ Face Model │    │   Image    │    │   Qdrant   │
   │  (InsightFace) │    │  Loader  │    │   Client   │
   └────┬────────┘    └────┬──────┘    └─────┬──────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────────┐
                    │ Qdrant Vector DB │
                    └─────────────────┘
```

### 2.2 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | FastAPI | >= 0.128.0 | REST API framework |
| Runtime | Python | >= 3.12 | Programming language |
| Face Detection & Embedding | InsightFace | >= 0.7.3 | Deep learning face recognition |
| ML Runtime | ONNX Runtime | >= 1.23.2 | Optimized inference engine |
| Vector Database | Qdrant | >= 1.16.2 | Vector similarity search |
| Image Processing | OpenCV, Pillow | Latest | Image loading and manipulation |
| HTTP Client | HTTPX | >= 0.28.1 | Async HTTP requests |
| Server | Uvicorn | >= 0.40.0 | ASGI server |
| Configuration | Pydantic Settings | >= 2.12.0 | Environment configuration |

## 3. Core Components

### 3.1 Face Detection and Embedding Module

**File**: `src/face/embedding.py`, `src/face/models.py`

**Responsibility**: Detects faces in images and generates 512-dimensional embeddings

**Key Features**:
- Uses InsightFace's "buffalo_l" model for state-of-the-art detection
- Supports both CUDA GPU and CPU inference
- Automatic largest face selection (by bounding box width)
- Returns embedding vectors and bounding box coordinates
- Async-compatible for non-blocking operations

**Model Specifications**:
- Model Name: Buffalo_l
- Embedding Dimension: 512
- Inference Providers: CUDA (GPU preferred), CPU (fallback)
- Detection Size: 640x640 pixels

**Process Flow**:
```
Image URL → Download/Load → Face Detection → Face Embedding → Return Vector
```

### 3.2 Image Loading Module

**File**: `src/utils/image_loader.py`

**Responsibility**: Safely downloads and loads images from URLs

**Key Features**:
- Async HTTP requests for non-blocking I/O
- Image format validation
- Error handling for network and decoding failures

### 3.3 Qdrant Vector Database Client

**File**: `src/qdrant/client.py`

**Responsibility**: Manages vector storage and similarity search operations

**Key Features**:
- Collection initialization on service startup
- Embedding storage with user metadata
- Vector similarity search with configurable thresholds
- Automatic connection management

**Collection Configuration**:
- Collection Name: `face_embeddings`
- Vector Dimension: 512
- Distance Metric: Cosine Similarity
- Scoring Threshold: 0.75 (configurable)

**Data Structure**:
```json
{
  "id": "unique-uuid",
  "vector": {
    "face": [512-dimensional embedding vector]
  },
  "payload": {
    "user_id": "external-user-identifier"
  }
}
```

### 3.4 API Router

**File**: `src/api.py`

**Responsibility**: Exposes HTTP endpoints for enrollment and recognition

**Endpoints**:
1. **POST /enroll**
   - Purpose: Register a new user's face
   - Parameters:
     - `user_id` (string): External user identifier
     - `image_url` (string): URL to user's face image
   - Response: `{"status": "enrolled"}`
   - Error Handling:
     - 400: Image processing failed
     - 404: No face detected
     - 502: Database save operation failed

2. **POST /recognize**
   - Purpose: Identify a user from a facial image
   - Parameters:
     - `image_url` (string): URL to query face image
   - Response:
     - `{"match": false}`: No face detected
     - `{"match": true, "user_id": "...", "score": 0.xx}`: Match found
   - Error Handling:
     - 400: Image processing failed
     - 502: Database search operation failed

### 3.5 Main Application Entry Point

**File**: `src/main.py`

**Responsibility**: Application initialization and startup

**Startup Sequence**:
1. FastAPI application instantiation
2. Qdrant collection verification/creation
3. Service ready for requests

## 4. Data Flow

### 4.1 Enrollment Flow

```
Client Request
    ↓
POST /enroll (user_id, image_url)
    ↓
Download Image from URL
    ↓
Detect Faces (InsightFace)
    ├→ No faces found → Return 404
    └→ Faces found
        ↓
    Extract Largest Face
        ↓
    Generate 512-dim Embedding
        ↓
    Store in Qdrant
        ├→ Success → Return {"status": "enrolled"}
        └→ Failure → Return 502
```

### 4.2 Recognition Flow

```
Client Request
    ↓
POST /recognize (image_url)
    ↓
Download Image from URL
    ↓
Detect Faces (InsightFace)
    ├→ No faces found → Return {"match": false}
    └→ Faces found
        ↓
    Extract Largest Face
        ↓
    Generate 512-dim Embedding
        ↓
    Search Qdrant Collection
        ├→ No similar match (score < 0.75) → Return {"match": false}
        └→ Match found
            ↓
        Return {"match": true, "user_id": "...", "score": ...}
```

## 5. Configuration

### 5.1 Environment Variables

The service requires the following environment variables (`.env` file):

```env
QDRANT_URL=<qdrant-server-url>
QDRANT_API_KEY=<qdrant-api-key>
```

**Configuration Source**: `src/config.py` using Pydantic Settings

## 6. Performance Characteristics

### 6.1 Latency Estimates

| Operation | Estimated Time | Factors |
|-----------|----------------|---------|
| Image Download | 100-500ms | Network latency, image size |
| Face Detection | 50-200ms | Image resolution, number of faces |
| Embedding Generation | 20-50ms | Model inference time |
| Vector Search | 10-50ms | Qdrant collection size |
| **Total Enrollment** | **200-800ms** | All operations combined |
| **Total Recognition** | **200-800ms** | All operations combined |

### 6.2 Scalability Considerations

- **Concurrent Requests**: Limited by server resources (CPU/GPU)
- **Vector Database Size**: Qdrant supports millions of vectors with fast retrieval
- **Memory Usage**: Face model (InsightFace) requires ~400-500MB
- **GPU Acceleration**: CUDA execution provider for 5-10x performance improvement
- **Request Concurrency**: FastAPI async support enables high concurrency

## 7. Error Handling and Resilience

### 7.1 Error Categories

| Layer | Error Type | Handling Strategy |
|-------|-----------|------------------|
| Network | Image download failure | HTTP 400 with error details |
| ML Model | No faces detected | HTTP 404 with appropriate message |
| ML Model | Face detection failure | HTTP 400 with error details |
| Database | Qdrant connectivity | HTTP 502 with error details |
| Database | Save/Search operation | HTTP 502 with error details |

### 7.2 Logging

All errors are logged asynchronously to enable debugging and monitoring:
```python
logger.exception("...")  # Captures full stack trace
```

## 8. Security Considerations

### 8.1 API Security

- **Authentication**: Delegated to NestJS backend (reverse proxy pattern)
- **HTTPS**: Configured at infrastructure/reverse proxy level
- **Input Validation**: FastAPI automatic validation via type hints

### 8.2 Qdrant Security

- API key-based authentication
- TLS encryption in transit
- No sensitive data stored (only embeddings and user IDs)

### 8.3 Model Security

- Pre-trained InsightFace model from official source
- ONNX runtime provides sandboxed inference
- No model updates or fine-tuning performed

## 9. Integration with NestJS Backend

### 9.1 Service Discovery

The Python microservice is typically accessed via:
- **Direct HTTP calls** from NestJS backend
- **API Gateway/Reverse Proxy** pattern for load balancing
- **Docker/Kubernetes** orchestration for deployment

### 9.2 Data Flow with Backend

```
NestJS Backend
    ↓
[User uploads face image]
    ↓
POST http://python-service/enroll
    ↓
Python Microservice
    ↓
[Returns embedding stored status]
    ↓
NestJS updates database
```

## 10. Deployment and Operations

### 10.1 Requirements

- Python >= 3.12
- Docker (recommended)
- 2+ CPU cores (4+ for production)
- 2GB+ RAM (4GB+ with GPU)
- GPU support (optional but recommended): NVIDIA CUDA-capable GPU

### 10.2 Startup Checklist

- [ ] Environment variables configured (QDRANT_URL, QDRANT_API_KEY)
- [ ] Qdrant service accessible and authenticated
- [ ] Python dependencies installed (`pip install -r requirements.txt`)
- [ ] Sufficient disk space for model files (~500MB)
- [ ] Network connectivity to image URLs verified

### 10.3 Monitoring Points

- Service health: HTTP endpoint availability
- Latency: Track request/response times
- Errors: Monitor 4xx and 5xx response rates
- Vector DB: Monitor Qdrant connection and collection stats
- Model Performance: Track recognition accuracy if ground truth available

## 11. Future Enhancements

### 11.1 Potential Improvements

- **Batch Processing**: Support multiple face enrollments in single request
- **Face Comparison**: Direct comparison of two face images (1-to-1 matching)
- **Liveness Detection**: Verify real person vs. photograph/video
- **Face Quality Metrics**: Return quality scores for enrollment validation
- **Model Updates**: Implement version management for face models
- **Distributed Processing**: Redis task queue for long-running operations
- **Caching**: Cache frequently accessed embeddings
- **Multi-Modal Biometrics**: Combine face recognition with other biometric data

## 12. Conclusion

The Face Recognition Microservice provides a specialized, high-performance component for facial biometric operations in the facecheck attendance system. Its clear separation of concerns, robust error handling, and integration with Qdrant vector database make it a reliable foundation for face-based identification. The architecture supports both current operational requirements and future scaling needs.

---

# NestJS Backend Service: Technical White Paper

## Executive Summary

The NestJS Backend Service is the core application server for the FaceCheck attendance tracking system. It orchestrates all business logic, database operations, user management, authentication, session management, attendance processing, and payroll calculations. Built with NestJS framework, it provides a scalable, modular, and maintainable architecture that integrates with multiple external services including PostgreSQL (via Prisma ORM), Redis (for job queues), Supabase (for file storage), and the Python face recognition microservice.

## 1. Introduction

### 1.1 Purpose
The NestJS Backend Service provides:
- **User Management**: Registration, authentication, and role-based access control for students, lecturers, staff, and administrators
- **Session Management**: Creating and managing attendance sessions with flexible modes and types
- **Attendance Tracking**: Recording attendance via face recognition with check-in/check-out capabilities
- **Course Management**: Managing courses, enrollments, and course assignments
- **Payroll Processing**: Calculating lecturer earnings based on attendance hours
- **Notifications**: Email and SMS notifications for various system events
- **Health Monitoring**: System health checks and logging

### 1.2 System Context
This service acts as the central orchestrator:
- **Frontend Clients**: Mobile apps, kiosk interfaces, web dashboards
- **Python Microservice**: Face recognition and embedding services
- **PostgreSQL Database**: Primary data storage via Prisma ORM
- **Redis**: Job queue management (BullMQ)
- **Supabase**: Cloud file storage for images
- **Email Service**: Brevo (Sendinblue) for transactional emails
- **SMS Service**: Arkesel for SMS notifications
- **Payment Gateway**: Paystack for payroll transfers

## 2. Architecture Overview

### 2.1 Service Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Client Applications                    │
│         (Mobile, Kiosk, Web Dashboard)                   │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP/REST API
                         ▼
┌────────────────────────────────────────────────────────────┐
│                   NestJS Backend Service                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           API Gateway (Express + Swagger)            │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                           │
│  ┌──────────────┴───────────────────────────────────────┐  │
│  │              Module Layer                            │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │  │
│  │  │ Auth │ │Users │ │Sessn │ │Attnd │ │Payrll│      │  │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘      │  │
│  │     └────────┴────────┴────────┴────────┘           │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                           │
│  ┌──────────────┴───────────────────────────────────────┐  │
│  │          Core Services Layer                         │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌──────────┐   │  │
│  │  │ Prisma  │ │ Helpers  │ │ Queue │ │  JWT     │   │  │
│  │  └────┬────┘ └─────┬────┘ └───┬───┘ └────┬─────┘   │  │
│  │       │            │           │          │          │  │
│  └───────┼────────────┼───────────┼──────────┼──────────┘  │
└──────────┼────────────┼───────────┼──────────┼─────────────┘
           │            │           │          │
    ┌──────▼──┐  ┌──────▼──┐  ┌────▼────┐  ┌──▼───┐
    │PostgreSQL│ │Supabase │  │  Redis  │  │Python│
    │   DB     │ │ Storage │  │  Queue  │  │ μSvc │
    └──────────┘  └─────────┘  └─────────┘  └──────┘
```

### 2.2 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | NestJS | ^11.0.1 | Application framework |
| Runtime | Node.js | >= 18.x | JavaScript runtime |
| Language | TypeScript | Latest | Type-safe development |
| ORM | Prisma | ^7.2.0 | Database ORM |
| Database | PostgreSQL | Latest | Primary data store |
| Authentication | Passport JWT | ^4.0.1 | JWT authentication |
| Email | @nestjs-modules/mailer | ^2.0.2 | Email service |
| Queue | BullMQ | ^5.66.4 | Background job processing |
| Cache | Redis | Latest | Queue backend & caching |
| Storage | Supabase | ^2.90.1 | Cloud file storage |
| Validation | class-validator | ^0.14.3 | DTO validation |
| API Docs | Swagger | ^11.2.4 | API documentation |
| Security | bcrypt | ^6.0.0 | Password hashing |
| Rate Limiting | @nestjs/throttler | ^6.5.0 | API rate limiting |
| HTTP Client | Axios | ^1.13.2 | External API calls |

## 3. Core Modules

### 3.1 Authentication Module

**Location**: `src/auth/`

**Responsibilities**:
- User registration (students only)
- Login with JWT token generation
- Password reset via email verification codes
- Email and phone verification
- Account lockout after failed login attempts
- IP address tracking for security

**Key Features**:
- **Email Verification**: 6-digit codes sent via Brevo
- **Password Security**: bcrypt hashing with salt rounds
- **Account Protection**: Rate limiting and automatic lockout (3 failed attempts = 30-minute lock)
- **JWT Strategy**: Token-based authentication with configurable expiry
- **Role-Based Access**: Different flows for STUDENT, LECTURER, STAFF, ADMIN, SYSTEM_ADMIN

**Authentication Flow**:
```
Registration → Email Verification → Account Activation → Login → JWT Token
```

**Password Reset Flow**:
```
Request Reset → Email Code → Verify Code → Update Password → Login
```

### 3.2 Users Module

**Location**: `src/users/`

**Responsibilities**:
- User enrollment with face image capture
- Profile management
- Role-specific data management (Student, Lecturer, Staff, Admin)
- Image upload to Supabase
- Face embedding job scheduling

**Key Operations**:
1. **Enrollment**:
   - Upload face image to Supabase
   - Validate image format (JPEG, PNG, WEBP)
   - File size limits (5MB max)
   - Queue image processing job for face embedding
   - Link courses to students
   - Create staff/lecturer records with unique IDs

2. **Profile Management**:
   - Retrieve user profile by email
   - Update user information
   - Delete user accounts (cascade deletion)

**User Roles & Hierarchies**:
- **STUDENT**: Access to courses, sessions, and personal attendance
- **LECTURER**: Create sessions, view course attendance, manage sessions
- **REP (Course Representative)**: Create sessions on behalf of lecturers
- **STAFF**: Administrative tasks
- **ADMIN**: Full system access except super admin functions
- **SYSTEM_ADMIN**: Complete system control

### 3.3 Sessions Module

**Location**: `src/sessions/`

**Responsibilities**:
- Create attendance sessions (lectures, exams, practicals)
- Manage session lifecycle (OPEN, CLOSED)
- Configure late/absent thresholds
- Session modes: CHECK_IN, CHECK_OUT, CHECK_IN_OUT
- Token-based session access

**Session Types**:
- `CLASS`: Regular lectures
- `EXAM`: Examination sessions
- `PRACTICAL`: Lab/practical sessions
- `SEMINAR`: Seminar sessions
- `OTHER`: Miscellaneous sessions

**Session Modes**:
- `CHECK_IN`: Only check-in required
- `CHECK_OUT`: Only check-out required
- `CHECK_IN_OUT`: Both check-in and check-out required

**Session Configuration**:
```typescript
{
  name: "Data Structures Lecture",
  type: SessionType.CLASS,
  mode: SessionMode.CHECK_IN_OUT,
  startTime: "2026-01-20T08:00:00Z",
  endTime: "2026-01-20T10:00:00Z",
  lateThreshold: 15,      // minutes
  absentThreshold: 30,    // minutes
  courseId: "course-id",
  token: "unique-6-char"  // Auto-generated
}
```

### 3.4 Attendance Module

**Location**: `src/attendance/`

**Responsibilities**:
- Mark attendance via face recognition
- Validate session status and timing
- Calculate attendance status (PRESENT, LATE, ABSENT, EXCUSED)
- Support multiple sources (kiosk, mobile)
- Check-in/check-out time tracking

**Attendance Flow**:
```
1. Validate session (open, not expired)
2. Receive face image from client
3. Send face to Python microservice for recognition
4. Verify user identity and course enrollment
5. Calculate attendance status based on timing
6. Record attendance with confidence score
7. Update check-in/check-out times
```

**Attendance Status Logic**:
- **PRESENT**: Arrival within late threshold
- **LATE**: Arrival after late threshold but before absent threshold
- **ABSENT**: No attendance or arrival after absent threshold
- **CHECKED_IN**: Check-in recorded (for CHECK_IN_OUT mode)
- **EXCUSED**: Manually marked by lecturer/admin

**Validation Rules**:
- Session must be OPEN
- Session creator cannot mark own attendance
- User must be enrolled in course (students) or assigned to course (lecturers)
- Face recognition confidence must be ≥ 0.6
- Cannot mark duplicate attendance

### 3.5 Courses Module

**Location**: `src/courses/`

**Responsibilities**:
- Course creation and management
- Course enrollment for students
- Lecturer assignment to courses
- Course representative (rep) assignment
- Course information retrieval

**Operations**:
- Create course with unique code
- Enroll students in courses
- Assign lecturers to courses
- Designate course representatives
- List courses by role (student's enrollments, lecturer's assignments)

### 3.6 Payroll Module

**Location**: `src/payroll/`

**Responsibilities**:
- Calculate lecturer earnings based on attendance hours
- Integrate with Paystack for payment processing
- Create transfer recipients (mobile money)
- Track hours worked per session

**Earnings Calculation**:
```typescript
totalEarnings = hourlyRate × totalHoursWorked
totalHours = Σ(checkOutTime - checkInTime) for all sessions
```

**Payment Integration**:
- Paystack API for mobile money transfers
- Transfer recipient management
- Support for GHS currency

### 3.7 Notifications Module

**Location**: `src/notifications/`

**Responsibilities**:
- Send email notifications via Brevo
- Send SMS notifications via Arkesel
- Email templates for verification, password reset
- Notification logging

**Email Templates**:
- Registration verification
- Password reset
- Session notifications
- Attendance confirmations

### 3.8 Queue Processing (Producers & Consumers)

**Location**: `src/producers/`, `src/consumers/`

**Responsibilities**:
- Background job processing for image embedding
- Retry logic with exponential backoff
- Job status tracking

**Image Processing Job Flow**:
```
1. Image uploaded to Supabase
2. Job queued with image URL and user ID
3. Consumer picks up job
4. Update user status to PROCESSING
5. Call Python microservice for face embedding
6. Store embedding in Qdrant (via Python service)
7. Update user status to UPLOADED/FAILED
```

**Job Configuration**:
- 3 retry attempts
- 5-second exponential backoff
- Remove completed jobs
- Retain failed jobs for debugging

### 3.9 Helpers Module

**Location**: `src/helpers/`

**Responsibilities**:
- Utility functions for common operations
- User retrieval and validation
- Email format validation
- File upload to Supabase
- System logging
- Integration with Python microservice

**Key Utilities**:
- `getUser()`: Fetch user by email
- `checkRole()`: Role-based authorization
- `uploadImage()`: Supabase storage integration
- `sendMail()`: Email sending via Brevo
- `sendSMS()`: SMS via Arkesel
- `createSystemLog()`: System event logging
- `getFaceEmbedding()`: Call Python service for embedding
- `compareFaceEmbeddings()`: Call Python service for recognition

### 3.10 Health Module

**Location**: `src/health/`

**Responsibilities**:
- Health check endpoints
- Database connectivity status
- Service availability monitoring

## 4. Database Schema

### 4.1 Core Entities

**User**: Base entity for all system users
- Authentication credentials
- Profile information
- Face embedding status
- Image URL and status
- Account security fields
- Relationships: Student, Lecturer, Staff, Admin

**Student**: Extends User
- Student ID and matriculation number
- Course enrollments
- Course representative assignments

**Lecturer**: Extends User
- Staff number
- Hourly rate for payroll
- Course assignments
- Sessions created

**Staff**: Extends User
- Staff number
- Paystack recipient code

**Admin**: Extends User
- Admin number
- Administrative privileges

**Course**: Academic courses
- Unique course code
- Course title
- Enrollments (students)
- Assigned lecturers
- Course representatives
- Associated sessions

**Session**: Attendance sessions
- Session name and type
- Start and end times
- Mode (check-in, check-out, both)
- Status (OPEN, CLOSED)
- Late and absent thresholds
- Unique access token
- Creator reference
- Attendance records

**Attendance**: Attendance records
- Session and user references
- Check-in and check-out times
- Status (PRESENT, LATE, ABSENT, etc.)
- Face recognition confidence score
- Source (kiosk, mobile, admin)

**Logs**: User activity logs
- User actions
- Priority levels
- IP addresses
- Read/unread status

**SystemLogs**: System-wide events
- Automated system actions
- Administrative activities

### 4.2 Relationships

```
User 1───0..1 Student
User 1───0..1 Lecturer
User 1───0..1 Staff
User 1───0..1 Admin
User 1───* Session (creator)
User 1───* Attendance
User 1───* Logs

Course 1───* CourseEnrollment ───* Student
Course 1───* CourseLecturer ───* Lecturer
Course 1───* CourseRep ───* Student
Course 1───* Session

Session 1───* Attendance
```

### 4.3 Enums

**Role**: STUDENT, LECTURER, STAFF, REP, ADMIN, SYSTEM_ADMIN

**SessionType**: CLASS, EXAM, PRACTICAL, SEMINAR, OTHER

**SessionMode**: CHECK_IN, CHECK_OUT, CHECK_IN_OUT

**SessionStatus**: OPEN, CLOSED

**AttendanceStatus**: PRESENT, LATE, EXCUSED, ABSENT, CHECKED_IN

**ImageStatus**: PENDING, PROCESSING, UPLOADED, FAILED

**AccountStatus**: ACTIVE, SUSPENDED, DELETED

## 5. API Architecture

### 5.1 API Design Principles

- RESTful conventions
- Global `/api` prefix
- Swagger documentation at `/docs`
- DTO-based validation
- JWT authentication for protected routes
- Rate limiting (5 requests per minute per IP)
- CORS enabled for all origins (configurable)

### 5.2 Key Endpoints

**Authentication**:
- `POST /api/auth/register` - Student registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/request-password-reset` - Password reset request
- `POST /api/auth/reset-password` - Password reset completion

**Users**:
- `POST /api/users/enroll` - Enroll user with face image
- `GET /api/users/profile/:email` - Get user profile
- `DELETE /api/users/:email` - Delete user

**Sessions**:
- `POST /api/sessions/create` - Create attendance session
- `GET /api/sessions/:email` - Get user's sessions
- `GET /api/sessions/token/:token` - Get session by token
- `PUT /api/sessions/close/:sessionId` - Close session

**Attendance**:
- `POST /api/attendance/mark` - Mark attendance with face
- `GET /api/attendance/:sessionId` - Get session attendance
- `GET /api/attendance/user/:userId` - Get user's attendance history

**Courses**:
- `POST /api/courses/create` - Create course
- `GET /api/courses/:email` - Get user's courses
- `POST /api/courses/enroll` - Enroll student in course

**Payroll**:
- `GET /api/payroll/earnings/:email` - Get lecturer earnings
- `POST /api/payroll/create-recipient` - Create payment recipient

**Health**:
- `GET /api/health` - Health check endpoint

### 5.3 Request/Response Patterns

**Request Validation**:
- DTOs with class-validator decorators
- Automatic validation via ValidationPipe
- Transform payloads to proper types

**Response Format**:
```json
{
  "data": { ... },
  "message": "Success message",
  "statusCode": 200
}
```

**Error Format**:
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

## 6. Security Architecture

### 6.1 Authentication & Authorization

**JWT-Based Authentication**:
- Secret key from environment
- Token expiration configurable
- Passport JWT strategy
- Guards for protected routes

**Password Security**:
- bcrypt hashing (10 salt rounds)
- Password strength validation
- Secure password reset flow with time-limited codes (30 minutes)

**Account Security**:
- Failed login attempt tracking
- Automatic account lockout (30 minutes after 3 failures)
- IP address logging
- Last login tracking

### 6.2 Rate Limiting

- Throttler guard globally applied
- 5 requests per 60 seconds per IP
- Configurable per endpoint
- Prevents brute force attacks

### 6.3 Data Validation

- DTOs for all request payloads
- class-validator constraints
- Transform decorator for type safety
- Whitelist unknown properties

### 6.4 CORS Configuration

- Allowed origins: Configurable (currently *)
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS
- Credentials: Enabled
- Exposed headers: set-cookie

### 6.5 File Upload Security

- File size limits (5MB)
- MIME type validation
- Virus scanning (via Supabase)
- Secure storage with private buckets

## 7. Integration Points

### 7.1 Python Microservice Integration

**Enrollment Integration**:
```typescript
POST http://python-service/enroll
Body: { user_id: string, image_url: string }
Response: { status: "enrolled" }
```

**Recognition Integration**:
```typescript
POST http://python-service/recognize
Body: { image_url: string }
Response: { 
  match: boolean,
  user_id?: string,
  score?: number
}
```

### 7.2 Supabase Storage Integration

**Image Upload**:
- Bucket: `face-check-media`
- File naming: `{timestamp}-{original-filename}`
- Public URL generation
- Automatic content type detection

### 7.3 Redis Queue Integration

**BullMQ Configuration**:
- Queue name: `image`
- Job name: `process-image`
- Retry strategy: 3 attempts with exponential backoff
- Connection pooling

### 7.4 Email Service Integration (Brevo)

**SMTP Configuration**:
- Host: Configurable
- Port: 587
- Authentication: API key
- From address: info@comas.edu.gh

**Email Templates**:
- EJS template engine
- Template directory: `views/`
- Dynamic content injection

### 7.5 SMS Service Integration (Arkesel)

**API Integration**:
- REST API calls
- API key authentication
- SMS sending for verification codes

### 7.6 Payment Gateway Integration (Paystack)

**Transfer Recipients**:
- Mobile money transfers
- GHS currency
- Recipient creation and management
- Automatic payroll processing

## 8. Performance & Scalability

### 8.1 Performance Optimizations

**Database**:
- Prisma query optimization
- Connection pooling
- Indexed fields (email, studentId, staffNo, token)
- Selective field retrieval

**Caching**:
- Redis-based caching (planned)
- Session token caching
- User profile caching

**File Processing**:
- Asynchronous image processing
- Background job queues
- Parallel processing capability

**API Response Time**:
- Target: < 200ms for database queries
- Target: < 1s for image upload
- Target: < 2s for face recognition flow

### 8.2 Scalability Considerations

**Horizontal Scaling**:
- Stateless architecture (JWT)
- Load balancer ready
- Shared Redis for queue coordination
- Database connection pooling

**Vertical Scaling**:
- Optimized for multi-core systems
- Memory-efficient operations
- Minimal memory footprint per request

**Database Scaling**:
- PostgreSQL supports read replicas
- Sharding strategies for large datasets
- Archive old attendance records

**Queue Scaling**:
- Multiple worker instances
- Job priority management
- Queue monitoring and alerts

## 9. Configuration Management

### 9.1 Environment Variables

```env
# Application
APP_PORT=3000
NODE_ENV=production
JWT_SECRET=your-secret-key
FACE_CHECK_SECRET_CODE=admin-secret

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key

# Email (Brevo)
BREVO_API_KEY=your-brevo-key
BREVO_PORT=587
BREVO_SERVER=smtp.sendinblue.com
BREVO_SMTP_KEY=your-smtp-key
BREVO_USER=your-email@domain.com

# SMS (Arkesel)
ARKESEL_SMS_API_KEY=your-arkesel-key
ARKESEL_SMS_URL=https://sms.arkesel.com

# Paystack
PAYSTACK_SECRET_KEY=your-paystack-key

# URLs
APP_PROD_URL=https://your-domain.com
APP_DEV_URL=http://localhost:3000
```

### 9.2 Configuration Module

- Centralized config service
- Type-safe configuration access
- Environment-specific settings
- Validation on startup

## 10. Logging & Monitoring

### 10.1 Logging Strategy

**User Activity Logs**:
- User actions
- Priority levels (LOW, MEDIUM, HIGH)
- Status (READ, UNREAD)
- IP address tracking
- Timestamp

**System Logs**:
- System events
- Administrative actions
- Cron job executions
- Integration failures

**Application Logs**:
- NestJS Logger
- Module-level loggers
- Error stack traces
- Request/response logging

### 10.2 Monitoring Points

- API endpoint health
- Database connection status
- Redis queue health
- External service availability (Python microservice, Supabase)
- Job processing rates
- Error rates by endpoint
- Response time metrics

### 10.3 Health Check Endpoint

```typescript
GET /api/health
Response: {
  status: "ok",
  info: {
    database: { status: "up" },
    redis: { status: "up" }
  }
}
```

## 11. Error Handling

### 11.1 Error Hierarchy

- **BadRequestException** (400): Invalid input, validation failures
- **UnauthorizedException** (401): Authentication failures
- **ForbiddenException** (403): Authorization failures
- **NotFoundException** (404): Resource not found
- **ConflictException** (409): Duplicate records
- **PreconditionFailedException** (412): Business rule violations
- **PayloadTooLargeException** (413): File size exceeded
- **UnsupportedMediaTypeException** (415): Invalid file type
- **InternalServerErrorException** (500): System errors

### 11.2 Error Response Format

```json
{
  "statusCode": 400,
  "message": "Detailed error message",
  "error": "Bad Request",
  "timestamp": "2026-01-17T10:30:00Z",
  "path": "/api/users/enroll"
}
```

### 11.3 Rollback Strategies

**Transaction Rollback**:
- Prisma transactions for multi-step operations
- Automatic rollback on failure
- Clean-up operations (e.g., delete uploaded images)

**Queue Job Failures**:
- Retry with exponential backoff
- Update user status to FAILED
- Preserve failed job data for debugging

## 12. Testing Strategy

### 12.1 Unit Testing

- Jest framework
- Mock dependencies (Prisma, external services)
- Test coverage goals: > 80%
- Module-specific test suites

### 12.2 Integration Testing

- E2E tests with test database
- API endpoint testing
- Service integration testing
- Database transaction testing

### 12.3 Testing Commands

```bash
npm run test           # Run unit tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage report
npm run test:e2e       # E2E tests
npm run test:debug     # Debug mode
```

## 13. Deployment

### 13.1 Build Process

```bash
npm run build          # Compile TypeScript to JavaScript
npm run start:prod     # Production server
```

### 13.2 Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied (`npx prisma migrate deploy`)
- [ ] Prisma client generated (`npx prisma generate`)
- [ ] Redis server accessible
- [ ] Supabase bucket configured
- [ ] Email service credentials verified
- [ ] Python microservice endpoint configured
- [ ] CORS origins properly set
- [ ] SSL/TLS certificates installed
- [ ] Health check endpoint accessible
- [ ] Logging configured
- [ ] Monitoring alerts set up

### 13.3 Docker Deployment

**Dockerfile Structure**:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main"]
```

### 13.4 Scaling Deployment

**Horizontal Scaling**:
- Deploy multiple instances behind load balancer
- Shared Redis for queue coordination
- Shared PostgreSQL database
- Session-less authentication (JWT)

**Database Scaling**:
- Read replicas for queries
- Master for writes
- Connection pooling optimization

## 14. API Documentation

### 14.1 Swagger Documentation

- Accessible at `/docs`
- Auto-generated from decorators
- Interactive API testing
- Request/response schemas
- Authentication examples

### 14.2 API Versioning

- Current version: v0.1
- Global prefix: `/api`
- Version header support (future)

## 15. Development Workflow

### 15.1 Development Scripts

```bash
npm run start:dev      # Development with hot reload
npm run start:debug    # Debug mode
npm run format         # Format code with Prettier
npm run lint           # Lint with ESLint
```

### 15.2 Database Management

```bash
npx prisma migrate dev         # Create and apply migration
npx prisma migrate reset       # Reset database
npx prisma studio             # GUI for database
npx prisma generate           # Generate Prisma client
```

### 15.3 Code Organization

**Module Structure**:
```
module-name/
  ├── module-name.module.ts      # Module definition
  ├── module-name.controller.ts  # HTTP handlers
  ├── module-name.service.ts     # Business logic
  └── module-name.spec.ts        # Tests
```

**DTO Structure**:
```
dto/
  ├── auth.dto.ts               # Auth-related DTOs
  ├── users.dto.ts              # User DTOs
  ├── sessions.dto.ts           # Session DTOs
  └── ...
```

## 16. Future Enhancements

### 16.1 Planned Features

- **Real-time Notifications**: WebSocket integration for live updates
- **Advanced Analytics**: Dashboard with attendance trends, course insights
- **Geolocation Verification**: Ensure attendance from campus locations
- **Biometric Multi-factor**: Combine face + QR code verification
- **Mobile App Integration**: Native mobile SDKs
- **Reporting System**: PDF generation for attendance reports
- **Audit Trail**: Comprehensive audit logging for compliance
- **Data Export**: CSV/Excel export for attendance data
- **Attendance Appeals**: Student appeal system for missed attendance
- **Session Scheduling**: Recurring session templates
- **Bulk Operations**: Batch enrollment, bulk session creation
- **Machine Learning Insights**: Predictive attendance analytics

### 16.2 Technical Improvements

- **GraphQL API**: Alternative to REST for flexible queries
- **Microservices Architecture**: Break into smaller services (Auth, Attendance, Payroll)
- **Event-Driven Architecture**: Use message broker (Kafka, RabbitMQ)
- **Caching Layer**: Redis-based caching for frequent queries
- **API Rate Limiting Per User**: More granular rate limiting
- **Multi-tenancy**: Support multiple institutions
- **Database Sharding**: Horizontal database partitioning
- **CI/CD Pipeline**: Automated testing and deployment
- **Container Orchestration**: Kubernetes deployment
- **Service Mesh**: Istio for service-to-service communication

## 17. Conclusion

The NestJS Backend Service provides a robust, scalable, and maintainable foundation for the FaceCheck attendance tracking system. Its modular architecture, comprehensive error handling, and integration with modern cloud services make it well-suited for both current operational needs and future growth. The service successfully orchestrates complex workflows involving face recognition, attendance tracking, payroll processing, and notification delivery while maintaining high security standards and performance.

---

**Document Version**: 1.0  
**Last Updated**: January 17, 2026  
**Scope**: Complete System (Python Microservice + NestJS Backend)