/* eslint-env node */
export default function handler(req, res) {
    // Return the version from package.json or environment
    // For Vercel, we can use the Git Commit SHA if available, or a manual version.
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Use a unique Build ID generated during deployment.
    res.status(200).json({
        version: process.env.VITE_APP_VERSION || "1.0.0",
        buildId: process.env.VERCEL_GIT_COMMIT_SHA || "local-dev"
    });
}
