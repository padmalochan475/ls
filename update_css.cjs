const fs = require('fs');
const path = 'src/pages/Assignments.jsx';
let content = fs.readFileSync(path, 'utf8');

const newCss = `
                /* Main Layout */
                .assignments-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    overflow: hidden;
                    background: radial-gradient(circle at top left, #1e293b, #0f172a);
                    color: #fff;
                }

                .assignments-header {
                    padding: 1.5rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(10px);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    z-index: 10;
                }

                .assignments-content {
                    display: grid;
                    grid-template-columns: 320px 1fr;
                    height: calc(100vh - 80px); /* Adjust based on header */
                    overflow: hidden;
                }

                /* Premium Side Panel (Form) */
                .form-panel {
                    background: rgba(30, 41, 59, 0.3);
                    backdrop-filter: blur(12px);
                    border-right: 1px solid rgba(255, 255, 255, 0.05);
                    padding: 2rem;
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    overflow-y: auto;
                    box-shadow: 4px 0 24px rgba(0,0,0,0.2);
                }

                .form-section-group {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    padding-bottom: 1.5rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .form-section-group:last-child {
                    border-bottom: none;
                }

                .form-group label {
                    display: block;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #94a3b8;
                    margin-bottom: 0.5rem;
                    font-weight: 600;
                }

                /* Premium Table Panel */
                .table-panel {
                    display: flex;
                    flex-direction: column;
                    background: transparent;
                    overflow: hidden;
                    padding: 0;
                }

                .table-header {
                    padding: 1.5rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: rgba(15, 23, 42, 0.4);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .table-title {
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .assignments-table-wrapper {
                    flex: 1;
                    overflow: auto;
                    padding: 0 2rem 2rem 2rem;
                }

                .assignments-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0 8px;
                }

                .assignments-table th {
                    text-align: left;
                    padding: 1rem;
                    color: #94a3b8;
                    font-weight: 600;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .assignments-table td {
                    padding: 1rem;
                    background: rgba(30, 41, 59, 0.4);
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    color: #e2e8f0;
                    font-size: 0.95rem;
                    transition: all 0.2s ease;
                }

                .assignments-table tr td:first-child {
                    border-left: 1px solid rgba(255, 255, 255, 0.05);
                    border-top-left-radius: 12px;
                    border-bottom-left-radius: 12px;
                }

                .assignments-table tr td:last-child {
                    border-right: 1px solid rgba(255, 255, 255, 0.05);
                    border-top-right-radius: 12px;
                    border-bottom-right-radius: 12px;
                }

                .assignments-table tr:hover td {
                    background: rgba(59, 130, 246, 0.1);
                    transform: scale(1.002);
                    border-color: rgba(59, 130, 246, 0.3);
                }
                
                .badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }
                .badge-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
                .badge-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.2); }
                .badge-pink { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.2); }
                .badge-green { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); }

                /* Mobile Optimizations */
                @media (max-width: 1024px) {
                    .assignments-content {
                        grid-template-columns: 1fr;
                        height: auto;
                        overflow-y: visible;
                    }
                    .form-panel {
                        border-right: none;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    }
                }
`;

// Regex to match the style block content
// We look for <style>{` ... `}</style>
// The regex needs to be careful with newlines.
const startMarker = "<style>{`";
const endMarker = "`}</style>";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const before = content.substring(0, startIndex + startMarker.length);
    const after = content.substring(endIndex);
    const newFileContent = before + newCss + after;
    fs.writeFileSync(path, newFileContent, 'utf8');
    console.log('CSS updated successfully.');
} else {
    console.error('Could not find style block markers.');
    process.exit(1);
}
