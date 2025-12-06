const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Cloud Function: getEmailByEmpId
 * Description: Securely looks up a user's email using their Employee ID.
 * This function bypasses client-side Firestore rules by running with Admin privileges.
 *
 * Input: { empId: string }
 * Output: { email: string } | Error
 */
exports.getEmailByEmpId = functions.https.onCall(async (data, context) => {
    const empId = data.empId;

    if (!empId) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "The function must be called with one argument 'empId'."
        );
    }

    try {
        const usersRef = admin.firestore().collection("users");
        const querySnapshot = await usersRef.where("empId", "==", empId).limit(1).get();

        if (querySnapshot.empty) {
            throw new functions.https.HttpsError(
                "not-found",
                `No user found with Employee ID: ${empId}`
            );
        }

        const userData = querySnapshot.docs[0].data();

        if (!userData.email) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "User found, but no email is associated with this account."
            );
        }

        // Return only the email to the client
        return { email: userData.email };

    } catch (error) {
        console.error("Error fetching user by EmpID:", error);
        // Re-throw HttpsErrors or wrap generic errors
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            "internal",
            "Unable to lookup user.",
            error.message
        );
    }
});
