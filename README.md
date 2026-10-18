
# DocAppoint Server

Backend API for the DocAppoint doctor appointment management system.

## Live API

https://docappoint-server-2.onrender.com

## Frontend

https://doc-appoint-client-three.vercel.app

## Technologies

- Node.js
- Express.js
- MongoDB Atlas
- Better Auth
- Cloudinary
- Multer

## Features

- Email/password and Google authentication
- Password reset
- User and admin role-based access
- Doctor CRUD operations
- Doctor search, filtering, sorting and pagination
- Appointment booking, updating and cancellation
- User and admin dashboard statistics
- Contact message storage
- Profile image uploads using Cloudinary
- Server-side input validation
- Centralized API error handling

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
BETTER_AUTH_SECRET=your_generated_secret
BETTER_AUTH_URL=http://localhost:5000
CLIENT_URL=http://localhost:3000

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Additional authentication provider and email service variables may be required depending on the configuration in `auth.js`.

Never commit real API keys, passwords or secrets.

## Run Locally

```bash
npm run dev
```

## Main API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/doctors` | List doctors |
| GET | `/doctors/:id` | Doctor details |
| GET | `/api/doctors` | Search, filter and paginate |
| GET | `/api/stats` | Public statistics |
| GET | `/appointments` | User bookings |
| POST | `/appointments` | Create booking |
| PUT | `/appointments/:id` | Update booking |
| DELETE | `/appointments/:id` | Delete booking |
| POST | `/api/contact` | Send contact message |
| POST | `/api/upload/profile-image` | Upload profile image |
| GET | `/api/admin/overview` | Admin statistics |
| GET | `/api/admin/doctors` | Admin doctor list |
| POST | `/api/admin/doctors` | Add doctor |
| PATCH | `/api/admin/doctors/:id` | Edit doctor |
| DELETE | `/api/admin/doctors/:id` | Delete doctor |

Protected endpoints require an authenticated session. Admin endpoints additionally require administrator permissions.

## Deployment

Backend: Render

Database: MongoDB Atlas

Image Storage: Cloudinary

## Repository

https://github.com/sumaya-jahan/DocAppoint-Server
