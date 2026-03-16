// Enhanced Status Card Component for History Tab
// This provides clear visual distinction between different statuses

import { CheckCircle, X, Clock, MapPin } from 'lucide-react';

const EnhancedHistoryCard = ({ item, userProfile }) => {
    // Determine status styling
    const getStatusStyle = () => {
        if (item.status === 'approved') {
            return {
                borderColor: 'rgba(34, 197, 94, 0.6)',
                headerBg: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%)',
                statusBg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                statusColor: '#fff',
                statusText: 'CONFIRMED',
                statusIcon: CheckCircle,
                glowColor: 'rgba(34, 197, 94, 0.25)',
                stripeBg: 'linear-gradient(to right, #22c55e, #16a34a)'
            };
        } else if (item.status === 'rejected' || item.status === 'cancelled') {
            return {
                borderColor: 'rgba(239, 68, 68, 0.5)',
                headerBg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%)',
                statusBg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                statusColor: '#fff',
                statusText: item.status === 'cancelled' ? 'CANCELLED' : 'REJECTED',
                statusIcon: X,
                glowColor: 'rgba(239, 68, 68, 0.2)',
                stripeBg: 'linear-gradient(to right, #ef4444, #dc2626)'
            };
        } else {
            return {
                borderColor: 'rgba(245, 158, 11, 0.5)',
                headerBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(234, 179, 8, 0.1) 100%)',
                statusBg: 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)',
                statusColor: '#fff',
                statusText: 'AWAITING RESPONSE',
                statusIcon: Clock,
                glowColor: 'rgba(245, 158, 11, 0.2)',
                stripeBg: 'linear-gradient(to right, #f59e0b, #eab308)'
            };
        }
    };

    const statusStyle = getStatusStyle();
    const StatusIcon = statusStyle.statusIcon;

    return (
        <div
            className="glass-panel"
            style={{
                padding: '0',
                position: 'relative',
                overflow: 'hidden',
                border: `2px solid ${statusStyle.borderColor}`,
                boxShadow: `0 0 20px ${statusStyle.glowColor}, 0 4px 12px rgba(0,0,0,0.3)`,
                transition: 'all 0.3s ease',
                cursor: 'pointer'
            }}
        >
            {/* Status Stripe - Most Prominent */}
            <div style={{
                background: statusStyle.stripeBg,
                padding: '0.7rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${statusStyle.borderColor}`
            }}>
                <div style={{
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    letterSpacing: '1.2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <StatusIcon size={16} />
                    {statusStyle.statusText}
                </div>
                {item.requesterName === userProfile.name ? (
                    <span style={{
                        fontSize: '0.7rem',
                        background: 'rgba(255,255,255,0.25)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px',
                        backdropFilter: 'blur(10px)'
                    }}>OUTGOING</span>
                ) : (
                    <span style={{
                        fontSize: '0.7rem',
                        background: 'rgba(255,255,255,0.25)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px',
                        backdropFilter: 'blur(10px)'
                    }}>INCOMING</span>
                )}
            </div>

            {/* Header with Date */}
            <div style={{
                padding: '1.2rem',
                background: statusStyle.headerBg,
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        minWidth: '75px',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#94a3b8',
                            textTransform: 'uppercase',
                            fontWeight: 'bold',
                            marginBottom: '3px'
                        }}>
                            {new Date(item.date).toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: '#fff',
                            lineHeight: '1'
                        }}>
                            {new Date(item.date).getDate()}
                        </div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            fontSize: '1.15rem',
                            fontWeight: 'bold',
                            color: '#fff',
                            marginBottom: '6px'
                        }}>
                            {item.scheduleDetails?.subject || "Subject N/A"}
                        </div>
                        <div style={{
                            display: 'flex',
                            gap: '10px',
                            fontSize: '0.85rem',
                            color: '#94a3b8',
                            alignItems: 'center'
                        }}>
                            <Clock size={13} />
                            <span>{item.scheduleDetails?.time}</span>
                            <span style={{ opacity: 0.4 }}>•</span>
                            <MapPin size={13} />
                            <span>{item.scheduleDetails?.room || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Body Content */}
            <div style={{ padding: '1.2rem' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.06)'
                }}>
                    {item.requesterName === userProfile.name ? (
                        <>
                            <div style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)'
                            }}>
                                To
                            </div>
                            <div style={{ flex: 1 }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    color: '#64748b',
                                    display: 'block',
                                    marginBottom: '3px',
                                    fontWeight: '600'
                                }}>
                                    Designated Substitute
                                </span>
                                <span style={{
                                    fontSize: '1rem',
                                    fontWeight: '700',
                                    color: '#e2e8f0'
                                }}>
                                    {item.targetFacultyName}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
                            }}>
                                Fr
                            </div>
                            <div style={{ flex: 1 }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    color: '#64748b',
                                    display: 'block',
                                    marginBottom: '3px',
                                    fontWeight: '600'
                                }}>
                                    Original Faculty
                                </span>
                                <span style={{
                                    fontSize: '1rem',
                                    fontWeight: '700',
                                    color: '#e2e8f0'
                                }}>
                                    {item.requesterName}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {/* Department Info */}
                {item.scheduleDetails?.dept && (
                    <div style={{
                        marginTop: '14px',
                        padding: '10px 14px',
                        background: 'rgba(59, 130, 246, 0.12)',
                        borderRadius: '10px',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        fontSize: '0.9rem',
                        color: '#60a5fa',
                        fontWeight: '700',
                        textAlign: 'center',
                        letterSpacing: '0.8px'
                    }}>
                        {item.scheduleDetails.dept}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EnhancedHistoryCard;
