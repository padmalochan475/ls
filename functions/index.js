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

/**
 * Cloud Function: sendAssignmentNotification
 * Description: Triggers when a new assignment is created in 'schedule'.
 * Sends a push notification to the assigned faculty members (including Faculty 2).
 */
exports.sendAssignmentNotification = functions.firestore
    .document('schedule/{assignmentId}')
    .onCreate(async (snap, context) => {
        const assignment = snap.data();
        const tokens = [];

        // Helper to get tokens for an EmpID
        const getTokensForEmpId = async (empId) => {
            if (!empId) return [];
            const usersRef = admin.firestore().collection('users');
            const snapshot = await usersRef.where('empId', '==', empId).get();
            let userTokens = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
                    userTokens = [...userTokens, ...data.fcmTokens];
                }
            });
            return userTokens;
        };

        try {
            // Get tokens for Faculty 1
            if (assignment.facultyEmpId) {
                const t1 = await getTokensForEmpId(assignment.facultyEmpId);
                tokens.push(...t1);
            }

            // Get tokens for Faculty 2
            if (assignment.faculty2EmpId) {
                const t2 = await getTokensForEmpId(assignment.faculty2EmpId);
                tokens.push(...t2);
            }

            // Remove duplicates
            const uniqueTokens = [...new Set(tokens)];

            if (uniqueTokens.length === 0) {
                console.log("No devices to notify for assignment:", context.params.assignmentId);
                return null;
            }

            const message = {
                notification: {
                    title: 'New Assignment',
                    body: `You have been assigned to ${assignment.subject} (${assignment.dept} - ${assignment.section}) on ${assignment.day} at ${assignment.time}.`
                },
                data: {
                    assignmentId: context.params.assignmentId,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK' // Optional: for mobile handlers
                },
                tokens: uniqueTokens
            };

            const response = await admin.messaging().sendMulticast(message);
            console.log(response.successCount + ' messages were sent successfully');

            // Cleanup invalid tokens if needed (advanced: remove failed tokens)
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(uniqueTokens[idx]);
                    }
                });
                console.log('List of tokens that caused failures: ' + failedTokens);
            }

        } catch (error) {
            console.error("Error sending notification:", error);
        }
    });

/**
 * Cloud Function: sendManualNotification
 * Description: Triggers when an admin creates a document in 'outbox_notifications'.
 * Sends a custom text notification to 'targetUser' (EmpID) or 'all'.
 */
exports.sendManualNotification = functions.firestore
    .document('outbox_notifications/{notifId}')
    .onCreate(async (snap, context) => {
        const payload = snap.data();
        // payload: { targetUser: 'all' | empId, title, body, status: 'pending' }

        if (payload.status !== 'pending') return null; // Avoid re-trigger

        const tokens = [];

        try {
            if (payload.targetUser === 'all') {
                // Fetch ALL users with tokens
                // Note: In large systems, this should be batched or use Topic Messaging.
                // For this scale, query all users with tokens is fine.
                const allUsersSnap = await admin.firestore().collection('users').get();
                allUsersSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.fcmTokens && Array.isArray(d.fcmTokens)) {
                        tokens.push(...d.fcmTokens);
                    }
                });
            } else {
                // Target is specific EmpId or UserId (UI sends EmpID or ID? Let's assume ID from the select value)
                // The UI sends: value={u.empId || u.id}
                // Let's try to match by ID first, then EmpID.

                // Case A: payload.targetUser is a doc ID (uid)
                let userDoc = await admin.firestore().collection('users').doc(payload.targetUser).get();

                if (!userDoc.exists) {
                    // Case B: payload.targetUser might be EmpID
                    const qIdx = await admin.firestore().collection('users').where('empId', '==', payload.targetUser).get();
                    if (!qIdx.empty) {
                        userDoc = qIdx.docs[0];
                    }
                }

                if (userDoc && userDoc.exists) {
                    const d = userDoc.data();
                    if (d.fcmTokens && Array.isArray(d.fcmTokens)) {
                        tokens.push(...d.fcmTokens);
                    }
                }
            }

            const uniqueTokens = [...new Set(tokens)];

            if (uniqueTokens.length === 0) {
                await snap.ref.update({ status: 'failed', error: 'No tokens found' });
                return;
            }

            const message = {
                notification: {
                    title: payload.title || 'Notification',
                    body: payload.body || ''
                },
                tokens: uniqueTokens
            };

            const response = await admin.messaging().sendMulticast(message);

            await snap.ref.update({
                status: 'sent',
                successCount: response.successCount,
                failureCount: response.failureCount,
                sentAt: new Date()
            });

        } catch (error) {
            console.error("Error sending manual notification:", error);
            await snap.ref.update({ status: 'error', error: error.message });
        }
    });
