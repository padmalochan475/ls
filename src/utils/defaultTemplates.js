export const defaultTemplates = {
    birthday_wa: "🎉 *HAPPY BIRTHDAY!* 🎉\n\nDear *{name}*,\n\nWishing you a fantastic birthday from the College Administration! \nWe hope you have a wonderful day and a highly successful year ahead. 🎂🥳",
    
    anniversary_wa: "🎊 *WORK ANNIVERSARY* 🎊\n\nDear *{name}*,\n\nCongratulations on completing *{years}* of dedicated service with our institution! \nWe deeply appreciate your continued commitment and hard work. 🌟",
    
    holiday_push_title: "🏖️ Holiday Notification",
    holiday_push_body: "Today is {holiday_name}. Regular classes are suspended.",
    holiday_wa: "🏖️ *HOLIDAY ALERT* 🏖️\n\nDear Faculty & Staff,\n\nPlease be informed that today is *{holiday_name}*.\n\n━━━━━━━━━━━━━━\n🚫 Regular classes and academic activities are *suspended* for the day.\n━━━━━━━━━━━━━━\n\nHave a great day off! ✨\n-- College Administration",
    
    warn1_push_title: "⏳ Upcoming Class",
    warn1_push_body: "Reminder: {subject} ({group}){cofacInline} begins in {mins} mins at Room {room}.",
    warn1_wa: "⚠️ *CLASS REMINDER [ Starts in {mins} mins ]* ⚠️\n\nDear *{name}*,\nYour next class is approaching rapidly.\n\n*SESSION DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}\n👥 *Group:* {group}\n📍 *Room:* {room}{cofacStr}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🏃 Please proceed to your designated classroom.\n-- LAMS System",
    
    warn2_push_title: "🚨 Class Starting",
    warn2_push_body: "Action Required: {subject} ({group}){cofacInline} is starting now at Room {room}.",
    warn2_wa: "🚨 *CLASS STARTING NOW* 🚨\n\nDear *{name}*,\nYour scheduled class is beginning *immediately*.\n\n*SESSION DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}\n👥 *Group:* {group}\n📍 *Room:* {room}{cofacStr}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n⚡ Please ensure you are in the classroom.\n-- LAMS System",
    
    weekly_header: "📅 *LAMS WEEKLY ITINERARY* 📅\n\nHello *{name}*,\n\nHere is your official schedule for the upcoming week. \nYou have a total of *{total_sessions}* assigned sessions.\n\n━━━━━━━━━━━━━━\n",
    weekly_class_line: "🔹 *Session {idx}*\n   ⏰ {time} | 📍 Room: {room}\n   📚 {subject}\n   👥 {group}{semStr}{cofacStr}{subStr}\n",
    weekly_footer: "━━━━━━━━━━━━━━\n\n🔗 Please verify this schedule on the LAMS portal.\n-- College Administration",
    
    morning_header: "🌅 *LAMS DAILY BRIEFING* 🌅\n\nHello *{name}*,\n\nHere is your official academic itinerary for today (*{day}*). \nYou have a total of *{total_classes}* sessions.\n\n━━━━━━━━━━━━━━\n",
    morning_class_line: "🔹 *Session {idx}*\n   ⏰ {time} | 📍 Room: {room}\n   📚 {subject}\n   👥 {group}{semStr}{cofacStr}{subStr}\n",
    morning_footer: "━━━━━━━━━━━━━━\n\nHave a productive day! 🚀\n-- College Administration",
    
    sys_sub_req: "🔄 *SUBSTITUTION REQUEST* 🔄\n\nDear *{name}*,\n*{requesterName}* has requested you to cover a class.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject} ({group})\n🗓️ *Schedule:* {date} at {time}\n📍 *Room:* {room}{cofacStr}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n⚡ *ACTION REQUIRED:*\nPlease log in to the LAMS portal to *ACCEPT* or *DECLINE* this request.\n-- LAMS System",
    
    sys_sub_app: "✅ *SUBSTITUTION APPROVED* ✅\n\nDear *{name}*,\nYour substitution arrangement has been formally processed and *approved*.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}{cofacStr}\n🗓️ *Schedule:* {date}\n👤 *Covered By:* {subName}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n-- College Administration",
    
    sys_sub_rej: "❌ *SUBSTITUTION DECLINED* ❌\n\nDear *{name}*,\nYour substitution arrangement has been *declined* or *cancelled*.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}{cofacStr}\n🗓️ *Schedule:* {date}\n⚠️ *Status:* Declined / Cancelled\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\nPlease log in to the portal to review your schedule.\n-- College Administration",
    
    sys_sub_acc: "🤝 *SUBSTITUTION ACCEPTED* 🤝\n\nDear *{name}*,\nYour substitution request has been *accepted* by *{subName}*.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}{cofacStr}\n🗓️ *Schedule:* {date}\n👤 *Accepted By:* {subName}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n⏳ *Status:* Pending final Administrative approval.\n-- LAMS System",
    
    sys_sub_can: "🚫 *SUBSTITUTION CANCELLED* 🚫\n\nDear *{name}*,\nA previously requested substitution has been *cancelled*.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}{cofacStr}\n🗓️ *Schedule:* {date}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n⚠️ You are now expected to conduct this class yourself.\n-- College Administration",
    
    sys_sub_can_sub: "🛑 *COVERAGE CANCELLED* 🛑\n\nDear *{name}*,\nA substitution arrangement you were assigned to cover has been *cancelled*.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}{cofacStr}\n🗓️ *Schedule:* {date}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n✅ You are no longer required to cover this class.\n-- College Administration",
    
    sys_req_can: "🔙 *REQUEST WITHDRAWN* 🔙\n\nDear *{name}*,\nA peer has withdrawn their request for you to cover their class.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Subject:* {subject}{cofacStr}\n🗓️ *Schedule:* {date}\n⚠️ *Status:* Request Withdrawn\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n-- College Administration",
    
    sys_new_assign: "📋 *NEW ASSIGNMENT* 📋\n\nDear *{name}*,\nA new academic assignment has been added to your profile.\n\n*DETAILS:*\n━━━━━━━━━━━━━━\n{body}\n━━━━━━━━━━━━━━\n\n-- College Administration",
    
    sys_alert: "📢 *LAMS ADMIN ANNOUNCEMENT* 📢\n\n*{title}*\n\n{body}\n\n-- System Broadcast",
    
    sys_acc_app: "🎓 *ACCOUNT APPROVED* 🎓\n\nDear *{name}*,\nYour faculty account has been successfully verified and *approved* by the Administration.\n\n━━━━━━━━━━━━━━\nYou may now log in to the LAMS portal to access your schedule.\n🔗 *Portal:* https://lams.vercel.app\n━━━━━━━━━━━━━━\n\nWelcome aboard! 🚀\n-- College Administration",
    
    obs_sub_app: "👀 *ADMIN ALERT: LEAVE COVERED* 👀\n\nA substitution arrangement has been finalized.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n🛌 *On Leave:* {requesterName}\n🦸 *Substitute:* {subName}\n📚 *Class:* {subject} ({group}){cofacStr}\n🗓️ *Schedule:* {date} at {time}\n📍 *Room:* {room}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈",
    
    obs_sub_can: "👀 *ADMIN ALERT: SUB CANCELLED* 👀\n\nA substitution arrangement has been revoked.\n\n*DETAILS:*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n📚 *Class:* {subject} ({group}){cofacStr}\n🗓️ *Schedule:* {date} at {time}\n📍 *Room:* {room}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈",
    
    obs_bday: "🎂 *ADMIN ALERT: BIRTHDAY* 🎂\n\nToday is *{name}*'s birthday! 🎉",
    obs_anni: "🌟 *ADMIN ALERT: WORK ANNIVERSARY* 🌟\n\n*{name}* is celebrating *{years}* with us today! 🎊"
};
