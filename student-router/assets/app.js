const API_URL = 'https://billowing-tree-412a.jackiecarson77.workers.dev';
const ASSET_VERSION = 'v2';

function getApiBase() {
    const params = new URLSearchParams(window.location.search);
    return params.get('api') || API_URL;
}

let schedule = {};
let copy = {};

async function init() {
    try {
        const [scheduleRes, copyRes] = await Promise.all([
            fetch(`assets/schedule.json?${ASSET_VERSION}`),
            fetch(`assets/copy.json?${ASSET_VERSION}`)
        ]);
        
        schedule = await scheduleRes.json();
        copy = await copyRes.json();
        
        renderForm();
        setupEventListeners();
    } catch (error) {
        console.error('Failed to load configuration:', error);
        showError('Failed to load configuration. Please refresh the page.');
    }
}

function renderForm() {
    document.getElementById('page-title').textContent = copy.title;
    document.getElementById('page-subtitle').textContent = copy.subtitle;
    
    const classOptions = document.getElementById('class-options');
    for (const [key, section] of Object.entries(schedule.class)) {
        classOptions.appendChild(createCheckbox('class', key, `${section.label} - ${section.time}`));
    }
    
    const recAOptions = document.getElementById('rec-a-options');
    const recBOptions = document.getElementById('rec-b-options');
    
    for (const [key, rec] of Object.entries(schedule.recitations)) {
        const checkbox = createCheckbox('recitation', key, `${rec.label} - ${rec.time}`);
        if (rec.day === 'A') {
            recAOptions.appendChild(checkbox);
        } else {
            recBOptions.appendChild(checkbox);
        }
    }
    
    const taOptions = document.getElementById('ta-options');
    for (const [key, ta] of Object.entries(schedule.ta)) {
        taOptions.appendChild(createCheckbox('ta', key, `${ta.label} - ${ta.time}`));
    }
}

function createCheckbox(type, value, label) {
    const div = document.createElement('div');
    div.className = 'checkbox-item';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `${type}-${value}`;
    input.name = type;
    input.value = value;
    
    const labelEl = document.createElement('label');
    labelEl.htmlFor = input.id;
    labelEl.textContent = label;
    
    div.appendChild(input);
    div.appendChild(labelEl);
    
    return div;
}

function setupEventListeners() {
    const form = document.getElementById('registration-form');
    form.addEventListener('submit', handleSubmit);
}

function validateForm() {
    const errors = [];
    
    const classChecked = document.querySelectorAll('input[name="class"]:checked');
    if (classChecked.length === 0) {
        errors.push(copy.messages.validationClass);
    }
    
    const recAChecked = Array.from(document.querySelectorAll('input[name="recitation"]:checked'))
        .filter(input => schedule.recitations[input.value].day === 'A');
    if (recAChecked.length === 0) {
        errors.push(copy.messages.validationRecA);
    }
    
    const recBChecked = Array.from(document.querySelectorAll('input[name="recitation"]:checked'))
        .filter(input => schedule.recitations[input.value].day === 'B');
    if (recBChecked.length === 0) {
        errors.push(copy.messages.validationRecB);
    }
    
    const taChecked = document.querySelectorAll('input[name="ta"]:checked');
    if (taChecked.length === 0) {
        errors.push(copy.messages.validationTA);
    }
    
    return errors;
}

async function handleSubmit(event) {
    event.preventDefault();
    
    hideError();
    hideResult();
    
    const errors = validateForm();
    if (errors.length > 0) {
        showError(errors.join('<br>'));
        return;
    }
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = copy.form.submitting;
    
    const kerb = document.getElementById('student-kerb').value.trim().toLowerCase();
    
    const payload = {
        id: kerb,
        name: document.getElementById('student-name').value.trim(),
        email: kerb + '@mit.edu',
        availability: {
            class: Array.from(document.querySelectorAll('input[name="class"]:checked'))
                .map(input => input.value),
            recitations: Array.from(document.querySelectorAll('input[name="recitation"]:checked'))
                .map(input => input.value),
            ta: Array.from(document.querySelectorAll('input[name="ta"]:checked'))
                .map(input => input.value)
        }
    };
    
    // Check if running on localhost - use mock data for development unless ?live=1 is set
    const isLocalhost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const forceLive = new URLSearchParams(window.location.search).has('live');
    if (isLocalhost && !forceLive) {
        // Simulate the backend response for local development
        setTimeout(() => {
            // Mock assignment based on availability
            const mockAssignment = {
                class: payload.availability.class[0] || 'sparta',
                rec_a: payload.availability.recitations.find(r => schedule.recitations[r]?.day === 'A') || 'argos',
                rec_b: payload.availability.recitations.find(r => schedule.recitations[r]?.day === 'B') || 'thebes',
                ta: payload.availability.ta[0] || 'woods'
            };
            
            console.log('Mock assignment (localhost only):', mockAssignment);
            showResult(mockAssignment);
            
            // Add development notice
            const resultPanel = document.getElementById('result');
            const devNotice = document.createElement('div');
            devNotice.style.cssText = 'margin-top: 1rem; padding: 0.5rem; background: #fffbeb; border: 1px solid #fbbf24; border-radius: 4px; color: #92400e;';
            devNotice.innerHTML = '⚠️ Development Mode: This is a mock response. Deploy to GitHub Pages for real assignments.';
            resultPanel.appendChild(devNotice);
            
            submitBtn.disabled = false;
            submitBtn.textContent = copy.form.submit;
        }, 500); // Simulate network delay
        return;
    }
    
    try {
        const useJsonp = new URLSearchParams(window.location.search).has('jsonp');
        let result;
        
        if (useJsonp) {
            // JSONP: construct a GET URL with query params + callback
            const cbName = `jsonp_cb_${Date.now()}`;
            result = await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                const params = new URLSearchParams({
                    action: 'assign',
                    id: payload.id,
                    name: payload.name,
                    email: payload.email,
                    class: payload.availability.class.join(','),
                    recitations: payload.availability.recitations.join(','),
                    ta: payload.availability.ta.join(','),
                    callback: cbName
                });
                window[cbName] = (data) => {
                    delete window[cbName];
                    document.body.removeChild(script);
                    resolve(data);
                };
                script.onerror = () => {
                    delete window[cbName];
                    document.body.removeChild(script);
                    reject(new Error('JSONP request failed'));
                };
                script.src = `${getApiBase()}?${params.toString()}`;
                document.body.appendChild(script);
            });
        } else {
            const endpoint = `${getApiBase()}?action=assign`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify({
                    ...payload
                })
            });
            
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const raw = await response.text();
                console.error('Non-JSON response from backend:', raw);
                throw new Error('Invalid response from backend');
            } else {
                result = await response.json();
            }
        }
        
        if (result.ok) {
            showResult(result.assignment);
        } else {
            if (result.reason === 'no_feasible') {
                showError(copy.messages.noFeasible);
            } else {
                showError(result.message || copy.messages.error);
            }
        }
    } catch (error) {
        console.error('Registration failed:', error);
        showError(copy.messages.error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = copy.form.submit;
    }
}

function showResult(assignment) {
    const resultPanel = document.getElementById('result');
    const resultTitle = document.getElementById('result-title');
    const resultContent = document.getElementById('result-content');
    
    resultTitle.textContent = copy.messages.success;
    
    const items = [
        `Class: ${schedule.class[assignment.class].label} - ${schedule.class[assignment.class].time}`,
        `Day A Recitation: ${schedule.recitations[assignment.rec_a].label} - ${schedule.recitations[assignment.rec_a].time}`,
        `Day B Recitation: ${schedule.recitations[assignment.rec_b].label} - ${schedule.recitations[assignment.rec_b].time}`,
        `TA Section: ${schedule.ta[assignment.ta].label} - ${schedule.ta[assignment.ta].time}`
    ];
    
    resultContent.innerHTML = items.map(item => `<div class="result-item">${item}</div>`).join('');
    resultPanel.classList.remove('hidden');
}

function hideResult() {
    document.getElementById('result').classList.add('hidden');
}

function showError(message) {
    const errorPanel = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    errorMessage.innerHTML = message;
    errorPanel.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', init);