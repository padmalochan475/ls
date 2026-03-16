export default function handler(req, res) {
    res.status(200).json({
        status: "ok",
        message: "LAMS API is operational.",
        timestamp: new Date().toISOString()
    });
}
