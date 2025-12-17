const fs = require('fs');
const path = 'src/pages/Assignments.jsx';
let content = fs.readFileSync(path, 'utf8');

const tableStartMarker = '<table className="assignments-table">';
const tableEndMarker = '</table>';

const startIndex = content.indexOf(tableStartMarker);
// We need to find the correct closing tag. Since there are no nested tables, the next </table> after startIndex is safe.
const endIndex = content.indexOf(tableEndMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    const before = content.substring(0, startIndex + tableStartMarker.length);
    const after = content.substring(endIndex);

    const newTableContent = `
                                                <thead>
                                                    <tr>
                                                        <th>Time</th>
                                                        <th>Subject</th>
                                                        <th>Faculty</th>
                                                        <th>Room</th>
                                                        <th>Group</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {loading ? (
                                                        // Loading Skeletons
                                                        Array(5).fill(0).map((_, i) => (
                                                            <tr key={'skel-'+i}>
                                                                <td><Skeleton width="60px" height="16px" /><Skeleton width="40px" height="12px" style={{ marginTop: 4 }} /></td>
                                                                <td><Skeleton width="120px" height="16px" /></td>
                                                                <td><Skeleton width="100px" height="20px" /></td>
                                                                <td><Skeleton width="50px" height="20px" /></td>
                                                                <td><Skeleton width="60px" height="20px" /></td>
                                                                <td><Skeleton width="24px" height="24px" /></td>
                                                            </tr>
                                                        ))
                                                    ) : currentItems.length > 0 ? (
                                                        currentItems.map((item) => (
                                                            <tr key={item.id} className="table-row-hover">
                                                                <td>
                                                                    <div style={{fontWeight:'600', color:'#fff'}}>{item.day}</div>
                                                                    <div style={{fontSize:'0.8rem', color:'#94a3b8', display:'flex', alignItems:'center', gap:'4px'}}>
                                                                        <Clock size={12} /> {formatTime(item.time)}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <div style={{color:'#e2e8f0', fontWeight:'500'}} title={item.subject}>{item.subject}</div>
                                                                    <div style={{fontSize:'0.75rem', color:'#64748b'}}>{item.dept} - {item.sem}</div>
                                                                </td>
                                                                <td>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                        <div className="badge badge-blue">
                                                                            <User size={12} /> {item.faculty}
                                                                        </div>
                                                                        {item.faculty2 && (
                                                                            <div className="badge badge-purple">
                                                                                <User size={12} /> {item.faculty2}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <div className="badge badge-pink">
                                                                        <MapPin size={12} /> {item.room}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <div className="badge badge-green">
                                                                        <Users size={12} /> 
                                                                        {item.section} {item.group && item.group !== 'All' ? '('+item.group+')' : ''}
                                                                    </div>
                                                                </td>
                                                                <td className="actions-col">
                                                                    <button
                                                                        className="icon-btn-danger"
                                                                        onClick={(e) => handleDelete(e, item)}
                                                                        title={deletingIds.has(item.id) ? "Deleting..." : "Delete Assignment"}
                                                                        disabled={deletingIds.has(item.id)}
                                                                        style={{ opacity: deletingIds.has(item.id) ? 0.5 : 1 }}
                                                                    >
                                                                        {deletingIds.has(item.id) ? <RefreshCw size={16} className="spin" /> : <Trash2 size={16} />}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan="6" style={{ textAlign: 'center', padding: '4rem' }}>
                                                                <div style={{ opacity: 0.5, display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem' }}>
                                                                    <FileText size={48} color="#475569" />
                                                                    <div style={{color: '#94a3b8'}}>No assignments found</div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>`;

    const newFileContent = before + newTableContent + after;
    fs.writeFileSync(path, newFileContent, 'utf8');
    console.log('Table updated successfully.');
} else {
    console.error('Could not find table markers.');
    process.exit(1);
}
