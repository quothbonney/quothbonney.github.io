const API_URL = 'https://billowing-tree-412a.jackiecarson77.workers.dev';

function getApiBase() {
    const params = new URLSearchParams(window.location.search);
    return params.get('api') || API_URL;
}

let schedule = {};
let rosterData = [];
let countsData = {};
let sortColumn = 'timestamp';
let sortDirection = 'desc';

async function init() {
    try {
        const scheduleRes = await fetch('assets/schedule.json');
        schedule = await scheduleRes.json();
        
        await loadData();
        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

async function loadData() {
    showLoading();
    
    try {
        const countsEndpoint = `${getApiBase()}?action=counts`;
        const rosterEndpoint = `${getApiBase()}?action=roster`;
        const [countsRes, rosterRes] = await Promise.all([
            fetch(countsEndpoint),
            fetch(rosterEndpoint)
        ]);
        
        countsData = await countsRes.json();
        rosterData = await rosterRes.json();
        
        renderCapacities();
        renderRoster();
    } catch (error) {
        console.error('Failed to load data:', error);
    } finally {
        hideLoading();
    }
}

function renderCapacities() {
    renderCapacityGroup('class-capacities', schedule.class, countsData.class || {});
    renderCapacityGroup('rec-capacities', schedule.recitations, countsData.recitations || {});
    renderCapacityGroup('ta-capacities', schedule.ta, countsData.ta || {});
}

function renderCapacityGroup(containerId, sections, counts) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    const rawCategory = containerId.split('-')[0];
    const categoryName = rawCategory === 'rec' ? 'recitations' : rawCategory;
    
    for (const [key, section] of Object.entries(sections)) {
        const count = counts[key] || 0;
        const capacity = (((schedule.capacities || {})[categoryName] || {})[key]) || 0;
        const percentage = (count / capacity) * 100;
        
        const bar = document.createElement('div');
        bar.className = 'capacity-bar';
        
        const label = document.createElement('div');
        label.className = 'capacity-label';
        label.textContent = `${section.label}: ${count} / ${capacity}`;
        
        const track = document.createElement('div');
        track.className = 'capacity-track';
        
        const fill = document.createElement('div');
        fill.className = 'capacity-fill';
        fill.style.width = `${Math.min(percentage, 100)}%`;
        
        if (percentage >= 100) {
            fill.classList.add('capacity-full');
        } else if (percentage >= 80) {
            fill.classList.add('capacity-warning');
        }
        
        track.appendChild(fill);
        bar.appendChild(label);
        bar.appendChild(track);
        container.appendChild(bar);
    }
}

function renderRoster() {
    const tbody = document.getElementById('roster-body');
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const filterValue = document.getElementById('filter-section').value;
    
    let filteredData = [...rosterData];
    
    if (searchTerm) {
        filteredData = filteredData.filter(row => 
            row.id.toLowerCase().includes(searchTerm) ||
            row.name.toLowerCase().includes(searchTerm) ||
            row.email.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filterValue) {
        const [filterType, filterKey] = filterValue.split(':');
        filteredData = filteredData.filter(row => {
            if (filterType === 'class') return row.class === filterKey;
            if (filterType === 'rec') return row.rec_a === filterKey || row.rec_b === filterKey;
            if (filterType === 'ta') return row.ta === filterKey;
            return true;
        });
    }
    
    filteredData.sort((a, b) => {
        let aVal = a[sortColumn] || '';
        let bVal = b[sortColumn] || '';
        
        if (sortColumn === 'timestamp') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    tbody.innerHTML = filteredData.map(row => `
        <tr data-student-id="${row.id}">
            <td>${formatDate(row.timestamp)}</td>
            <td>${row.id}</td>
            <td>${row.name}</td>
            <td>${row.email}</td>
            <td>${row.class || '-'}</td>
            <td>${row.rec_a || '-'}</td>
            <td>${row.rec_b || '-'}</td>
            <td>${row.ta || '-'}</td>
            <td>${row.locked ? '🔒' : ''}</td>
            <td>${row.notes || ''}</td>
            <td style="text-align: center;"><button class="delete-btn" data-id="${row.id}" style="background: none; color: #ef4444; border: none; padding: 2px 6px; cursor: pointer; font-size: 16px;">×</button></td>
        </tr>
    `).join('');
    
    // Add event listeners to delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', handleDelete);
    });
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function setupEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', loadData);
    document.getElementById('export-btn').addEventListener('click', exportCSV);
    document.getElementById('search-input').addEventListener('input', renderRoster);
    document.getElementById('filter-section').addEventListener('change', renderRoster);
    
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            
            document.querySelectorAll('th[data-sort]').forEach(el => {
                el.classList.remove('sort-asc', 'sort-desc');
            });
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
            
            renderRoster();
        });
    });
}

function exportCSV() {
    const headers = ['Timestamp', 'ID', 'Name', 'Email', 'Class', 'Rec A', 'Rec B', 'TA', 'Locked', 'Notes'];
    const rows = rosterData.map(row => [
        row.timestamp,
        row.id,
        row.name,
        row.email,
        row.class || '',
        row.rec_a || '',
        row.rec_b || '',
        row.ta || '',
        row.locked ? 'Yes' : 'No',
        row.notes || ''
    ]);
    
    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function showLoading() {
    // disabled
}

function hideLoading() {
    // disabled
}

async function handleDelete(event) {
    const studentId = event.target.dataset.id;
    
    if (!confirm(`Are you sure you want to delete student ${studentId}?`)) {
        return;
    }
    
    try {
        const deleteEndpoint = `${getApiBase()}?action=delete`;
        const response = await fetch(deleteEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: studentId })
        });
        
        const result = await response.json();
        
        if (result.ok) {
            // Remove from local data
            rosterData = rosterData.filter(row => row.id !== studentId);
            // Re-render the table
            renderRoster();
            // Reload counts
            const countsEndpoint = `${getApiBase()}?action=counts`;
            const countsRes = await fetch(countsEndpoint);
            countsData = await countsRes.json();
            renderCapacities();
        } else {
            alert(`Failed to delete student: ${result.message}`);
        }
    } catch (error) {
        console.error('Failed to delete student:', error);
        alert('Failed to delete student. Please try again.');
    }
}

document.addEventListener('DOMContentLoaded', init);