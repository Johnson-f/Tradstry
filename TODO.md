### Comprehensive Detail on what it's important on the application 

### Update all database function with 'autn.uid()' to include 'set search = public'

### Update my markets section - entire database schemas, backend endpoints & frontend endpoints 

### Setup Redis with Render for caching - implement aggressive caching strategy 

### Implement caching on my supabase edge function 

### Insecure File Uploads:
* File: backend/routers/images.py

* Issue: The /upload endpoint checks the content_type of the uploaded file (e.g., image/png), but it  does not validate the actual file content. An attacker could upload a 
malicious script with a disguised content type, which could lead to Cross-Site Scripting (XSS) or other attacks if that file is ever served to other users.

* Recommendation: Implement server-side file content validation (e.g., using a library like python-magic) to verify that the uploaded file is a genuine image. Additionally, 
serve user-uploaded content from a separate domain and with appropriate security headers (Content-Security-Policy) to mitigate the risk of XSS.

### Brittle Error Handling:
* File: backend/auth_service.py

* Issue: The safe_rpc_call function retries operations on JWT expiration by checking for "JWT expired" in the error string. This is brittle and can break if the error message 
from the underlying library changes.

* Recommendation: Catch specific exception types (e.g., AuthRetryableError from gotrue-py or a specific JWT expiration error from pyjwt) instead of relying on string matching.

### Unprotected "Admin" Routes:
* File: backend/routers/notes.py

* Issue: The file defines routes like /admin/folders/system but uses the same get_current_user dependency as regular routes. There is no visible logic to check if the 
authenticated user actually has administrative privileges.

* Recommendation: Implement a separate dependency for admin routes that verifies the user's role or permissions (e.g., by checking a custom claim in their JWT or a role column 
in the users table).
