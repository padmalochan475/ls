import React from 'react';

const StatCard = ({ title, value, icon, trend, color }) => (
    <div className="glass-panel" style={{ padding: 'var(--space-lg)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '5rem', opacity: 0.05 }}>
            {icon}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
            <div style={{ padding: 'var(--space-xs)', borderRadius: 'var(--radius-md)', background: `rgba(${color}, 0.1)`, color: `rgb(${color})` }}>
                {icon}
            </div>
            {trend && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>
                    {trend}
                </span>
            )}
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: 'var(--space-xs)' }}>{value}</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{title}</div>
    </div>
);

const ActivityItem = ({ user, action, time }) => (
    <div style={{ display: 'flex', gap: 'var(--space-md)', padding: 'var(--space-md)', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem' }}>
            {user.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.875rem' }}>
                <span style={{ fontWeight: 600 }}>{user}</span> {action}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{time}</div>
        </div>
    </div>
);

const Dashboard = () => {
    // Mock Data
    const stats = [
        { title: 'Total Assignments', value: '124', icon: '📝', trend: '+12%', color: '59, 130, 246' },
        { title: 'Active Faculty', value: '48', icon: '👨‍🏫', trend: '+2', color: '16, 185, 129' },
        { title: 'Lab Rooms', value: '12', icon: '🏢', color: '245, 158, 11' },
        { title: 'Subjects', value: '36', icon: '📚', color: '239, 68, 68' },
    ];

    const activities = [
        { user: 'Dr. Smith', action: 'created a new assignment for CSE 3rd Sem', time: '2 mins ago' },
        { user: 'Prof. Johnson', action: 'updated the schedule for Lab 1', time: '15 mins ago' },
        { user: 'Admin', action: 'approved 2 new faculty members', time: '1 hour ago' },
        { user: 'System', action: 'performed automated backup', time: '3 hours ago' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-lg)' }}>
                {stats.map((stat, index) => (
                    <StatCard key={index} {...stat} />
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
                {/* Recent Activity */}
                <div className="glass-panel" style={{ padding: '0' }}>
                    <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>Recent Activity</h3>
                        <button className="btn" style={{ fontSize: '0.875rem', color: 'var(--color-accent)' }}>View All</button>
                    </div>
                    <div>
                        {activities.map((activity, index) => (
                            <ActivityItem key={index} {...activity} />
                        ))}
                    </div>
                </div>

                {/* Quick Actions & Tips */}
                <div className="glass-panel" style={{ padding: 'var(--space-lg)' }}>
                    <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-sm)' }}>
                        <button className="btn glass-panel" style={{ textAlign: 'center', padding: 'var(--space-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)' }}>
                            <span style={{ fontSize: '1.25rem' }}>📤</span>
                            <span>Export Report</span>
                        </button>
                    </div>

                    <div style={{ marginTop: 'var(--space-xl)', padding: 'var(--space-md)', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--color-accent)' }}>
                        <h4 style={{ margin: '0 0 var(--space-xs) 0', fontSize: '0.875rem', color: 'var(--color-accent)' }}>💡 Pro Tip</h4>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            Drag and drop assignments in the Schedule view to quickly reorganize lab timings.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
