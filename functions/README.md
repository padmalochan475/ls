# Cloud Functions for LAMS 2.0

To secure the "Login by Employee ID" feature, we utilize Firebase Cloud Functions.
This moves the privileged user lookup (finding an email by EmpID) to the server side, allowing you to lock down your Firestore security rules.

## Setup Instructions

1. **Install Dependencies**
   Open a terminal in the `functions` directory and run:
   ```bash
   cd functions
   npm install
   ```

2. **Deploy to Firebase**
   Make sure you have the Firebase CLI installed and are logged in.
   Then run:
   ```bash
   firebase deploy --only functions
   ```
   *Note: This requires your Firebase project to be on the Blaze (Pay-as-you-go) plan. It is free up to 2M invocations/month.*

3. **Verify Deployment**
   Go to your Firebase Console -> Functions dashboard and ensure `getEmailByEmpId` is listed.

## Security Implication
Once this function is deployed, you should update your `firestore.rules` to deny read access to the `users` collection for unauthenticated users:

```match /users/{userId} {
  allow read: if request.auth != null; // Only logged-in users can read profiles
  ...
}
```
