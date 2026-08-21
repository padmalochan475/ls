require('dotenv').config();

async function testEmailJS() {
    console.log("Testing EmailJS connection...");
    
    const { VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY } = process.env;
    
    if (!VITE_EMAILJS_SERVICE_ID || !VITE_EMAILJS_TEMPLATE_ID || !VITE_EMAILJS_PUBLIC_KEY) {
        console.error("❌ Missing EmailJS environment variables.");
        return;
    }

    const emailJsData = {
        service_id: VITE_EMAILJS_SERVICE_ID,
        template_id: VITE_EMAILJS_TEMPLATE_ID,
        user_id: VITE_EMAILJS_PUBLIC_KEY,
        template_params: {
            to_email: "lams@1dtyt.onmicrosoft.com",
            to_name: "Admin",
            otp: "123456",
            message: "This is a test OTP from the backend using EmailJS!",
            subject: "LAMS Backend EmailJS Test"
        }
    };

    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(emailJsData)
        });

        if (response.ok) {
            console.log("✅ Email sent successfully via EmailJS! Status:", response.status);
        } else {
            const errorText = await response.text();
            console.error("❌ EmailJS API Error:", errorText);
        }
    } catch (error) {
        console.error("❌ Fetch Error:", error);
    }
}

testEmailJS();
