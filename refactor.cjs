const fs = require('fs');
const file = 'd:/Antigravity/LAMS-2.0/src/components/scheduler/ScheduleGrid.jsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Extract ScheduleCell function block.
const startIndex = code.indexOf('    const ScheduleCell = ({ day, time }) => {');
const endIndex = code.indexOf("    if (viewMode === 'horizontal') {");

const scheduleCellCode = code.substring(startIndex, endIndex).trim();
let newCode = code.substring(0, startIndex) + code.substring(endIndex);

// 2. Modify ScheduleCell definition
const modifiedCellCode = scheduleCellCode.replace(
    'const ScheduleCell = ({ day, time }) => {',
    'const ScheduleCell = React.memo(({ day, time, assignments, isAdmin, subjects, onEdit, onViewDetails, onSwap, onDelete, deletingIds, onAdd, getSubjectShortCode, getFacultyShortCode }) => {'
).replace(
    'const assignments = getAssignments(day, time);',
    '' // Remove this since we pass it
).replace(
    '};',
    '});' // Close React.memo
);

// 3. Inject it before ScheduleGrid
const gridIndex = newCode.indexOf('const ScheduleGrid = ({');
newCode = newCode.substring(0, gridIndex) + modifiedCellCode + '\n\n' + newCode.substring(gridIndex);

// 4. Update usages of <ScheduleCell ... />
const propsString = ' assignments={getAssignments(day, time)} isAdmin={isAdmin} subjects={subjects} onEdit={onEdit} onViewDetails={onViewDetails} onSwap={onSwap} onDelete={onDelete} deletingIds={deletingIds} onAdd={onAdd} getSubjectShortCode={getSubjectShortCode} getFacultyShortCode={getFacultyShortCode} ';
newCode = newCode.replace(/<ScheduleCell key=\{([^}]+)\} day=\{day\} time=\{time\} \/>/g, '<ScheduleCell key={$1} day={day} time={time}' + propsString + '/>');

fs.writeFileSync(file, newCode);
console.log('Done');
