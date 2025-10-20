# Neighborhood Aid API Documentation

## Base URL
All endpoints are available at: `https://kwilbymcpqyhufhqgtii.supabase.co/functions/v1`

## Authentication
All endpoints require authentication using JWT tokens in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. User Approval (Admin Only)
**POST** `/approve-user`
- Approve, reject, or suspend user accounts
- Body: `{ user_id, status: 'approved'|'rejected'|'suspended', role?: 'admin'|'user' }`

### 2. Help Posts
**GET** `/help-posts?id=<uuid>&type=<type>&status=<status>&category=<category>`
**POST** `/help-posts` - Body: `{ type, title, description, category, latitude?, longitude? }`
**PUT** `/help-posts?id=<uuid>` - Body: `{ title?, description?, status?, ... }`
**DELETE** `/help-posts?id=<uuid>`

### 3. Nearby Help
**GET** `/nearby-help?latitude=<lat>&longitude=<lng>&radius=<km>&type=<type>`
- Returns help posts within specified radius with distances

### 4. Ratings
**GET** `/ratings?user_id=<uuid>` - Get user ratings with average
**POST** `/ratings` - Body: `{ rated_user_id, rating: 1-5, help_post_id?, comment? }`

### 5. Grievances
**GET** `/grievances?id=<uuid>&status=<status>`
**POST** `/grievances` - Body: `{ title, description, category }`
**PUT** `/grievances?id=<uuid>` (Admin) - Body: `{ status?, admin_notes? }`

### 6. Support Tickets
**GET** `/support-tickets?id=<uuid>&include_messages=true`
**POST** `/support-tickets` - Body: `{ subject, message, priority?: 'low'|'medium'|'high'|'urgent' }`
**PUT** `/support-tickets?id=<uuid>` (Admin) - Body: `{ status?, assigned_to?, priority? }`

### 7. Ticket Messages
**POST** `/ticket-messages` - Body: `{ ticket_id, message, is_internal?: boolean }`

## User Workflow
1. **Sign up** → User created with status='pending'
2. **Admin approval** → Admin calls `/approve-user` with status='approved'
3. **User access** → Approved users can access all features

## Database Tables
- `profiles` - User profiles with approval status
- `user_roles` - Admin/user role assignments
- `neighborhoods` - Neighborhood definitions
- `help_posts` - Help requests/offers
- `ratings` - User ratings (1-5 stars)
- `grievances` - Community grievances
- `support_tickets` - Support system
- `ticket_messages` - Ticket conversations