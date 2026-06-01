import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Sparkles, Send, Loader2, Cloud, Settings, Key, CheckCircle, RefreshCw } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';

const AIAssistant = ({ isOpen, onClose, contextData }) => {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello! I am LAMS-AI, powered by Llama 3 via Groq.' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const fetchApiKey = async () => {
            try {
                const snap = await getDoc(doc(db, 'settings', 'global'));
                if (snap.exists() && snap.data().groqApiKey) {
                    setApiKey(snap.data().groqApiKey);
                } else {
                    setApiKey(import.meta.env.VITE_GROQ_API_KEY || '');
                }
            } catch (err) {
                console.error('Failed to load API key', err);
                setApiKey(import.meta.env.VITE_GROQ_API_KEY || '');
            }
        };
        if (isOpen) {
            fetchApiKey();
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const [isSaving, setIsSaving] = useState(false);

    const handleApproveSave = async (args, messageIndex) => {
        if (!contextData.activeAcademicYear) {
            alert("No active academic year found.");
            return;
        }
        if (contextData?.userProfile?.role !== 'admin') {
            alert("Security Error: Only administrators have permission to modify the schedule.");
            return;
        }
        
        setIsSaving(true);
        try {
            const payload = {
                ...args,
                academicYear: contextData.activeAcademicYear,
                createdAt: new Date().toISOString(),
                createdBy: contextData?.userProfile?.uid || 'system_ai',
                isAIGenerated: true
            };
            
            await addDoc(collection(db, 'schedule'), payload);
            
            // Mark the message as approved
            setMessages(prev => {
                const newMsgs = [...prev];
                if (newMsgs[messageIndex]) {
                    newMsgs[messageIndex] = {
                        ...newMsgs[messageIndex],
                        approved: true
                    };
                }
                return newMsgs;
            });
            
            setMessages(prev => [...prev, { role: 'assistant', content: '✅ Assignment successfully saved to the database!' }]);
        } catch (error) {
            console.error("Save error:", error);
            alert("Failed to save assignment via AI.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;
        
        if (!apiKey) {
            setMessages(prev => [...prev, { role: 'user', content: input }, { role: 'assistant', content: "The Groq API Key has not been configured globally. Please ask an administrator to set it up in the Admin Panel." }]);
            setInput('');
            return;
        }

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setIsTyping(true);

        try {
            const facultyCount = contextData?.faculty?.length || 0;
            const classesCount = contextData?.schedule?.length || 0;
            const userProfile = contextData?.userProfile || null;
            const facultyNames = (contextData?.faculty || []).map(f => typeof f === 'object' ? (f.name || f.empId) : f).join(', ');
            
            // Format schedule efficiently to save context tokens
            const denseSchedule = (contextData?.schedule || []).map(s => 
                `[${s.day} ${s.time}] ${s.subject} in ${s.room} by ${s.faculty}${s.faculty2 ? ` & ${s.faculty2}` : ''} for ${s.dept}-${s.section}${s.group ? `-${s.group}` : ''}`
            ).join('\n');
            
            const formatTimeForSchedule = (t) => {
                if (!t) return '';
                const d = new Date(t);
                if(isNaN(d.getTime())) return t;
                return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\u202F/g, ' ');
            };

            const validTimes = (contextData?.timeSlots || []).map(s => `${formatTimeForSchedule(s.startTime)} - ${formatTimeForSchedule(s.endTime)}`).join(', ');
            const validDays = (contextData?.days || []).map(d => d.name).join(', ');
            const rooms = (contextData?.rooms || []).map(r => r.name || r.id).join(', ');
            const subjects = (contextData?.subjects || []).map(s => s.name || s.id).join(', ');
            const depts = (contextData?.departments || []).map(d => d.name || d.id).join(', ');
            const sems = (contextData?.semesters || []).map(s => s.name || s.id).join(', ');
            
            let systemPrompt = `You are LAMS-AI, an intelligent assistant for the Lab Assignment Management System.
Current Database State: 
- Faculty Members: ${facultyCount} active (${facultyNames})
- Total Scheduled Classes: ${classesCount}
- Departments: ${depts}
- Semesters: ${sems}
- Rooms Available: ${rooms}
- Subjects Taught: ${subjects}

DYNAMIC VALIDATION LOGIC:
You must cross-reference the ACTIVE SCHEDULE with the MASTER DATA. 
- VALID TIME SLOTS: ${validTimes}
- VALID DAYS: ${validDays}
If a class in the schedule has a time or day that is NOT in the valid lists above, it is an ORPHANED/HIDDEN class. You must proactively warn the user about these hidden classes if they ask about them, explaining they won't appear on the grid because their time/day doesn't match Master Data.

CRITICAL INSTRUCTION: You are an internal system assistant. Do NOT attempt to use 'brave_search' or any web search tools under any circumstances. You only have access to the data provided in this prompt. If you don't know the answer, simply state that you don't have that information.

OUTER BOUNDARY POLICY: If the user asks a question that is completely unrelated to LAMS (Lab Assignment Management System), timetables, scheduling, faculty, subjects, or education, politely decline and state: "I can only answer questions related to the Lab Assignment Management System (LAMS) and its data."

Answer the user's questions clearly, concisely, and naturally based on this data.`;

            if (userProfile) {
                systemPrompt += `\n\nUSER PROFILE:\nYou are talking to: ${userProfile.name} (${userProfile.email}). Their role is: ${userProfile.role}.`;
            }
            if (denseSchedule) {
                systemPrompt += `\n\nACTIVE SCHEDULE:\n${denseSchedule}`;
            }

            const isAdmin = userProfile?.role === 'admin';
            
            const tools = [
                {
                    type: "function",
                    function: {
                        name: "schedule_class",
                        description: "Schedules a new class or lab assignment in the active academic year.",
                        parameters: {
                            type: "object",
                            properties: {
                                subject: { type: "string", description: "The name of the subject or lab (e.g. 'OS Lab')" },
                                day: { type: "string", description: "The day of the week (e.g. 'Monday')" },
                                time: { type: "string", description: "The time slot (e.g. '10:00 AM - 11:00 AM')" },
                                room: { type: "string", description: "The room name or number (e.g. 'Room 101')" },
                                faculty: { type: "string", description: "The name of the main faculty member" },
                                faculty2: { type: "string", description: "The name of the co-faculty member, if any" },
                                dept: { type: "string", description: "The department code (e.g. 'CSE')" },
                                sem: { type: "string", description: "The semester (e.g. '4th Semester')" },
                                section: { type: "string", description: "The main group/section (e.g. 'G1')" },
                                group: { type: "string", description: "The sub-group (e.g. 'B1')" }
                            },
                            required: ["subject", "day", "time", "room", "faculty", "dept", "sem", "section"]
                        }
                    }
                }
            ];

            const requestBody = {
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: systemPrompt },
                    // Filter out our internal 'tool_call' UI messages before sending to API
                    ...messages.filter(m => m.role !== 'tool_call').map(m => ({ role: m.role, content: m.content })),
                    { role: 'user', content: userMsg }
                ],
                temperature: 0.7,
                max_tokens: 500,
                ...(isAdmin && { tools, tool_choice: "auto" })
            };

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 401) throw new Error("Invalid API Key");
                throw new Error(`Cloud API Error ${response.status}: ${errData?.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            const messageObj = data.choices?.[0]?.message;
            if (messageObj?.tool_calls && messageObj.tool_calls.length > 0) {
                const toolCall = messageObj.tool_calls[0];
                if (toolCall.function.name === 'schedule_class') {
                    const args = JSON.parse(toolCall.function.arguments);
                    const newMessages = [];
                    if (messageObj.content) {
                        newMessages.push({ role: 'assistant', content: messageObj.content });
                    }

                    // DYNAMIC AI LOGIC: Client-side conflict checking using cached data (0 DB Reads!)
                    const schedule = contextData?.schedule || [];
                    const conflict = schedule.find(s => 
                        s.day === args.day && 
                        s.time === args.time && 
                        (
                            s.room === args.room || 
                            s.faculty === args.faculty || 
                            s.faculty === args.faculty2 || 
                            (args.faculty2 && s.faculty2 === args.faculty) ||
                            (args.faculty2 && s.faculty2 === args.faculty2) ||
                            (s.faculty2 && s.faculty2 === args.faculty)
                        )
                    );

                    if (conflict) {
                        let issue = `Room ${args.room} is already booked for ${conflict.subject}.`;
                        
                        // Precise pinpointing of the conflict
                        if (conflict.faculty === args.faculty || conflict.faculty2 === args.faculty) {
                            issue = `Faculty ${args.faculty} is already teaching ${conflict.subject} at this time.`;
                        } else if (args.faculty2 && (conflict.faculty === args.faculty2 || conflict.faculty2 === args.faculty2)) {
                            issue = `Co-Faculty ${args.faculty2} is already teaching ${conflict.subject} at this time.`;
                        }
                        
                        // Reject the AI's proposal and warn the user
                        newMessages.push({ 
                            role: 'assistant', 
                            content: `⚠️ **Conflict Detected!**\n\nI tried to schedule ${args.subject} on ${args.day} at ${args.time}, but **${issue}**\n\nI have blocked this assignment from being stored. Please ask me to schedule it at a different time or in a different room.` 
                        });
                    } else {
                        // All good, no conflicts!
                        newMessages.push({
                            role: 'tool_call',
                            content: `I have verified availability and prepared a draft assignment. No conflicts detected! Please review and approve it below.`,
                            args: args
                        });
                    }
                    
                    setMessages(prev => [...prev, ...newMessages]);
                }
            } else {
                const generatedText = messageObj?.content || "I couldn't generate a response.";
                setMessages(prev => [...prev, { role: 'assistant', content: generatedText }]);
            }
        } catch (error) {
            console.error("AI Generation Error:", error);
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${error.message}. Please check your connection and API key.` }]);
        } finally {
            setIsTyping(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div 
                className="glass-panel"
                onClick={e => e.stopPropagation()}
                style={{ 
                    width: '90%', maxWidth: '420px', height: '650px', 
                    display: 'flex', flexDirection: 'column',
                    borderRadius: '24px', overflow: 'hidden',
                    boxShadow: '0 0 50px rgba(99, 102, 241, 0.2)'
                }}
            >
                {/* Header */}
                <div style={{ 
                    padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'linear-gradient(to right, rgba(99, 102, 241, 0.1), transparent)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ 
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Bot size={24} color="#818cf8" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>LAMS AI</h3>
                            <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Cloud size={12} /> Powered by Llama 3
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Chat Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {messages.map((m, i) => {
                        if (m.role === 'tool_call') {
                            return (
                                <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))', border: '1px solid #3b82f6', borderRadius: '16px', overflow: 'hidden' }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Sparkles size={16} color="#60a5fa" />
                                        <strong style={{ color: '#60a5fa' }}>Draft Assignment</strong>
                                    </div>
                                    <div style={{ padding: '16px', fontSize: '0.9rem', color: '#cbd5e1' }}>
                                        <p style={{ margin: '0 0 12px 0' }}>{m.content}</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                                            <span style={{ color: '#94a3b8' }}>Subject:</span> <span>{m.args.subject}</span>
                                            <span style={{ color: '#94a3b8' }}>Time:</span> <span>{m.args.day}, {m.args.time}</span>
                                            <span style={{ color: '#94a3b8' }}>Room:</span> <span>{m.args.room}</span>
                                            <span style={{ color: '#94a3b8' }}>Faculty:</span> <span>{m.args.faculty} {m.args.faculty2 ? `& ${m.args.faculty2}` : ''}</span>
                                            <span style={{ color: '#94a3b8' }}>Class:</span> <span>{m.args.dept}-{m.args.section}{m.args.group ? `-${m.args.group}` : ''} ({m.args.sem})</span>
                                        </div>
                                        {m.approved ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', justifyContent: 'center', padding: '8px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px' }}>
                                                <CheckCircle size={18} /> Approved & Saved
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => handleApproveSave(m.args, i)}
                                                disabled={isSaving}
                                                style={{ width: '100%', padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: isSaving ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                                            >
                                                {isSaving ? <RefreshCw className="spin" size={16} /> : <CheckCircle size={16} />} 
                                                Approve & Save to Schedule
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={i} style={{ 
                                alignSelf: m.role === 'user' ? 'flex-end' : (m.role === 'system' ? 'center' : 'flex-start'),
                                maxWidth: '85%', 
                                padding: '1rem', 
                                borderRadius: '16px',
                                background: m.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                                border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                color: '#fff', 
                                fontSize: '0.95rem', 
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap'
                            }}>
                                {m.content}
                            </div>
                        );
                    })}
                    {isTyping && (
                        <div style={{ alignSelf: 'flex-start', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Loader2 size={16} className="spin-animation" color="#818cf8" /> 
                            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Thinking...</span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                            type="text" 
                            className="glass-input" 
                            placeholder="Ask the AI..." 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && handleSend()}
                            style={{ borderRadius: '100px', flex: 1 }}
                            disabled={isTyping}
                        />
                        <button 
                            onClick={handleSend}
                            disabled={isTyping || !input.trim()}
                            style={{ 
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: (isTyping || !input.trim()) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none',
                                color: (isTyping || !input.trim()) ? '#94a3b8' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: (isTyping || !input.trim()) ? 'not-allowed' : 'pointer'
                            }}
                            onMouseEnter={e => { if(!isTyping && input.trim()) e.target.style.transform = 'scale(1.05)'}}
                            onMouseLeave={e => { if(!isTyping && input.trim()) e.target.style.transform = 'scale(1)'}}
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIAssistant;
