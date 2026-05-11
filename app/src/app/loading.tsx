import React from 'react';

export default function Loading() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="circular-spinner" />
            <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.05em' }}>Loading...</div>
        </div>
    );
}
