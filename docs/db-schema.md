# MongoDB Database Schema

## Collection: users
Each document represents a student/user and is identified by their unique `userId`.

### Fields
- **userId**: string (document key, unique for each user)
- **name**: string — The student's full name. (required)
- **grade**: string — The student's grade or level. (required)
- **areaOfInterest**: string — The student's primary area of technical interest. (required)

### Example Document
```json
{
  "userId": "abc123xyz",
  "name": "Jane Doe",
  "grade": "10",
  "areaOfInterest": "Web Development"
}
```

## Notes
- The schema is enforced at the application level (not in MongoDB itself).
- All user data is stored in the `users` collection.
- The backend API provides endpoints to create and fetch user documents.
