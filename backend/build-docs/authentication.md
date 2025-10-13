implement this on this codebase 

Replace the supabase connection logic with @docs:turso 

I am going to use @docs:clerk as my authentication

This is how the flow is going to be 
When a user signs up, Clerk should automatically triggers a webhook to your backend sending a JSON payload, verifing it came from Clerk

JSON format 
{
  "data": {
    "object": "event",
    "id": "evt_2xRjF...",
    "type": "user.created",
    "data": {
      "id": "user_2abc123",
      "username": "johnsmith",
      "first_name": "John",
      "last_name": "Smith",
      "email_addresses": [
        {
          "id": "idn_123",
          "email_address": "john@example.com",
          "verification": {
            "status": "verified"
          }
        }
      ],
      "image_url": "https://img.clerk.com/user_2abc123",
      "created_at": 1728493234,
      "updated_at": 1728493234,
      "public_metadata": {},
      "private_metadata": {},
      "unsafe_metadata": {}
    }
  }
}

