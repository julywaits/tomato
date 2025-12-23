'use strict';

// 不使用 Supabase JS 库，直接用 fetch 调用 REST API
const SUPABASE_URL = 'https://rjpebjpgfuabljxskemm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcGVianBnZnVhYmxqeHNrZW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDA1NTksImV4cCI6MjA4MTUxNjU1OX0.UuF6Dxo2JgMvVOvSj1NwS_ZKTho_-EDH9B5T_Px9cXo';

// 简易 Supabase 客户端
const supabaseClient = {
    from: (table) => ({
        select: (columns = '*') => {
            const obj = {
                order: (column, options = {}) => {
                    return fetch(
                        `${SUPABASE_URL}/rest/v1/${table}?select=${columns}&order=${column}.${options.ascending ? 'asc' : 'desc'}`,
                        {
                            headers: {
                                'apikey': SUPABASE_ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                            }
                        }
                    ).then(async (response) => {
                        const data = await response.json();
                        return { data, error: response.ok ? null : data };
                    }).catch(error => ({ data: null, error }));
                }
            };
            return obj;
        },
        insert: (values) => {
            const obj = {
                select: () => {
                    return fetch(
                        `${SUPABASE_URL}/rest/v1/${table}`,
                        {
                            method: 'POST',
                            headers: {
                                'apikey': SUPABASE_ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=representation'
                            },
                            body: JSON.stringify(values)
                        }
                    ).then(async (response) => {
                        const data = await response.json();
                        return { data: response.ok ? data : null, error: response.ok ? null : data };
                    }).catch(error => ({ data: null, error }));
                }
            };
            return obj;
        },
        update: (values) => ({
            eq: (column, value) => {
                return fetch(
                    `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`,
                    {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(values)
                    }
                ).then(async (response) => {
                    const data = await response.json();
                    return { data, error: response.ok ? null : data };
                }).catch(error => ({ data: null, error }));
            }
        })
    })
};

console.log('✅ 自制 Supabase 客户端已就绪');
window.supabaseClient = supabaseClient;

const MODES = {
    deep: { id: 'deep', label: '深度工作', mins: 25, color: 'var(--color-deep)', class: 'bg-deep' },
    break: { id: 'break', label: '娱乐休息', mins: 5, color: 'var(--color-break)', class: 'bg-break' },
    chore: { id: 'chore', label: '琐事时间', mins: 2, color: 'var(--color-chore)', class: 'bg-chore' },
    fitness: { id: 'fitness', label: '健身时间', mins: 40, color: 'var(--color-fitness)', class: 'bg-fitness' }
};
const TARGET_MINUTES = 840;

const state = {
    currentMode: null,
    timeLeft: 0,
    totalTime: 0,
    isRunning: false,
    timerInterval: null,
    startTime: null,
    sessions: [],
    circumference: 0
};

const els = {
    mainView: document.getElementById('main-view'),
    timerView: document.getElementById('timer-view'),
    timerDisplay: document.getElementById('time-left'),
    timerLabel: document.getElementById('timer-mode-label'),
    btnToggle: document.getElementById('btn-toggle'),
    btnReset: document.getElementById('btn-reset'),
    circle: document.querySelector('.progress-ring__circle'),
    suggestionArea: document.getElementById('suggestion-area'),
    btnNext: document.getElementById('btn-next-mode'),
    btnHome: document.getElementById('btn-back-home'),
    summaryGrid: document.getElementById('stats-summary-grid'),
    progressList: document.getElementById('daily-progress-list'),
    totalTrackedText: document.getElementById('total-tracked-text'),
    sessionTimeline: document.getElementById('session-timeline'),
    emptyState: document.getElementById('empty-state')
};

async function init() {
    const radius = els.circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    els.circle.style.strokeDasharray = `${circumference} ${circumference}`;
    els.circle.style.strokeDashoffset = circumference;
    state.circumference = circumference;

    if ('Notification' in window) Notification.requestPermission();

    loadLocalData();
    await syncFromSupabase();
    renderStats();
    
    // 初始化趋势统计
    updateTrendStats();
    initTrendTabs();

    // 绑定所有事件监听器
    if (els.btnToggle) {
        els.btnToggle.addEventListener('click', toggleTimer);
        console.log('✅ 开始按钮已绑定');
    }
    
    if (els.btnReset) {
        els.btnReset.addEventListener('click', resetTimer);
        console.log('✅ 重置按钮已绑定');
    }
    
    if (els.btnHome) {
        els.btnHome.addEventListener('click', exitTimer);
        console.log('✅ 返回按钮已绑定');
    }
    
    if (els.btnNext) {
        els.btnNext.addEventListener('click', () => {
            const next = els.btnNext.dataset.nextMode;
            if (next) app.selectMode(next);
        });
        console.log('✅ 下一个模式按钮已绑定');
    }

    // 主题切换功能
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            themeToggle.textContent = isLight ? '☼' : '☾';
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            console.log('主题已切换:', isLight ? '亮色' : '暗色');
        });
        
        // 加载保存的主题
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            themeToggle.textContent = '☼';
        } else {
            themeToggle.textContent = '☾';
        }
        console.log('✅ 主题切换已绑定');
    }

    // 主动卸载旧的 Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => {
                registration.unregister();
                console.log('✅ 已卸载旧的 Service Worker');
            });
        });
    }

    // 暂时禁用 Service Worker 避免缓存问题
    // 等一切稳定后再启用
    // if ('serviceWorker' in navigator) {
    //     navigator.serviceWorker.register('sw.js');
    // }
}

function loadLocalData() {
    const stored = localStorage.getItem('pomo_sessions');
    if (stored) state.sessions = JSON.parse(stored);
}

async function syncFromSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .select('*')
            .order('start_time', { ascending: false });
        if (error) throw error;
        if (data?.length > 0) {
            state.sessions = data.map(r => ({
                id: r.id,
                mode: r.mode,
                duration: r.duration,
                start: r.start_time,
                end: r.end_time,
                note: r.note || ''
            }));
            localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
            renderStats();
        }
    } catch (e) {
        console.warn('云端加载失败，使用本地数据', e);
    }
}

async function saveSession(session) {
    console.log('准备上传到云端:', session);
    
    state.sessions.unshift(session);
    localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));

    try {
        console.log('开始 insert 到 Supabase');
        const { data, error } = await supabaseClient
            .from('sessions')
            .insert({
                mode: session.mode,
                duration: session.duration,
                start_time: session.start,
                end_time: session.end,
                note: session.note || ''
            })
            .select();

        if (error) {
            console.error('Supabase 错误:', error);
            throw error;
        }

        console.log('上传成功:', data);

        if (data && data[0] && data[0].id) {
            const localSession = state.sessions.find(s => 
                s.mode === session.mode &&
                s.start === session.start &&
                s.end === session.end
            );
            if (localSession) {
                localSession.id = data[0].id;
                localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
            }
        }
    } catch (e) {
        console.error('云端保存失败，数据保留本地:', e);
    }

    renderStats();
    updateTrendStats(); // 更新趋势统计
}

async function updateSessionNote(id, text) {
    const s = state.sessions.find(x => x.id === id);
    if (s) {
        s.note = text;
        localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
    }

    try {
        await supabaseClient.from('sessions').update({ note: text }).eq('id', id);
    } catch (e) {
        console.warn('笔记同步失败', e);
    }
}

const app = {
    selectMode: (key) => {
        const m = MODES[key];
        state.currentMode = key;
        state.totalTime = m.mins * 60;
        state.timeLeft = state.totalTime;
        state.isRunning = false;

        document.documentElement.style.setProperty('--theme-color', m.color);
        els.timerLabel.textContent = m.label;
        updateTimerDisplay();
        els.circle.style.strokeDashoffset = 0;
        els.btnToggle.textContent = '开始';
        els.btnToggle.classList.remove('hidden');
        els.suggestionArea.classList.add('hidden');
        els.mainView.classList.add('hidden');
        els.timerView.classList.remove('hidden');
    }
};

function toggleTimer() {
    state.isRunning ? pauseTimer() : startTimer();
}

function startTimer() {
    state.isRunning = true;
    state.startTime = new Date();
    els.btnToggle.textContent = '暂停';

    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();

        const offset = state.circumference - (state.timeLeft / state.totalTime) * state.circumference;
        els.circle.style.strokeDashoffset = offset;

        if (state.timeLeft <= 0) completeTimer();
    }, 1000);
}

function pauseTimer() {
    state.isRunning = false;
    clearInterval(state.timerInterval);
    els.btnToggle.textContent = '继续';
}

function resetTimer() {
    pauseTimer();
    if (confirm('确定放弃当前计时？')) exitTimer();
}

function exitTimer() {
    pauseTimer();
    els.timerView.classList.add('hidden');
    els.mainView.classList.remove('hidden');
    
    // 恢复按钮显示状态
    els.btnToggle.classList.remove('hidden');
    els.btnReset.classList.remove('hidden');
    els.suggestionArea.classList.add('hidden');
}

function completeTimer() {
    pauseTimer();
    state.timeLeft = 0;
    updateTimerDisplay();
    playBeep();

    if (Notification.permission === 'granted') {
        new Notification('计时完成！', { body: `${MODES[state.currentMode].label} 已结束` });
    }

    const endTime = new Date();
    const startTime = new Date(endTime - MODES[state.currentMode].mins * 60000);

    saveSession({
        id: Date.now(),
        mode: state.currentMode,
        duration: MODES[state.currentMode].mins,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        note: ''
    });

    // 隐藏开始和重置按钮
    els.btnToggle.classList.add('hidden');
    els.btnReset.classList.add('hidden');
    
    // 显示建议区域
    els.suggestionArea.classList.remove('hidden');
    suggestNextMode();
    renderStats();
}

function updateTimerDisplay() {
    const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
    const s = (state.timeLeft % 60).toString().padStart(2, '0');
    els.timerDisplay.textContent = `${m}:${s}`;
}

function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.start();
    setTimeout(() => o.stop(), 500);
}

function suggestNextMode() {
    let next = 'break';
    if (state.currentMode === 'deep') next = 'break';
    else if (state.currentMode === 'break') next = 'deep';
    else if (state.currentMode === 'fitness') next = 'break';

    els.btnNext.textContent = `开始 ${MODES[next].label}`;
    els.btnNext.dataset.nextMode = next;
}

function renderStats() {
    const today = new Date().toLocaleDateString();
    let todayMins = 0;
    const breakdown = { deep: 0, break: 0, chore: 0, fitness: 0 };

    state.sessions.forEach(s => {
        if (new Date(s.start).toLocaleDateString() === today) {
            todayMins += s.duration;
            breakdown[s.mode] += s.duration;
        }
    });

    // 渲染今日统计（4列汇总）
    if (els.summaryGrid) {
        els.summaryGrid.innerHTML = '';
        Object.keys(breakdown).forEach(mode => {
            const item = document.createElement('div');
            item.className = 'summary-item';
            const modeConfig = MODES[mode];
            item.innerHTML = `
                <div class="summary-icon">${modeConfig.label.charAt(0)}</div>
                <div class="summary-count text-${mode}">${breakdown[mode]}</div>
                <div class="summary-label">${modeConfig.label}</div>
            `;
            els.summaryGrid.appendChild(item);
        });
    }

    // 渲染进度条列表
    if (els.progressList) {
        els.progressList.innerHTML = '';
        Object.keys(breakdown).forEach(mode => {
            if (breakdown[mode] > 0) {
                const row = document.createElement('div');
                row.className = 'progress-row';
                const percentage = Math.min(100, (breakdown[mode] / TARGET_MINUTES) * 100).toFixed(1);
                row.innerHTML = `
                    <div class="row-header">
                        <span class="row-label">${MODES[mode].label}</span>
                        <span class="row-stats">${breakdown[mode]}m · ${percentage}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill bg-${mode}" style="width: ${percentage}%"></div>
                    </div>
                `;
                els.progressList.appendChild(row);
            }
        });
    }

    // 更新总时间文字
    if (els.totalTrackedText) {
        els.totalTrackedText.textContent = `${todayMins} / 840 分钟`;
    }

    // 渲染时间线
    if (els.sessionTimeline && els.emptyState) {
        const todaySessions = state.sessions.filter(s => 
            new Date(s.start).toLocaleDateString() === today
        );

        if (todaySessions.length > 0) {
            els.emptyState.classList.add('hidden');
            els.sessionTimeline.classList.remove('hidden');
            els.sessionTimeline.innerHTML = '';
            
            todaySessions.forEach(s => {
                const card = document.createElement('div');
                card.className = `session-card border-${s.mode}`;

                const startT = new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const endT = new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                let html = `
                    <div class="session-top">
                        <strong>${MODES[s.mode].label}</strong>
                        <span class="session-time">${startT} - ${endT}</span>
                    </div>
                `;
                if (s.duration >= 20) {
                    html += `<textarea class="session-note" placeholder="这个时段做了什么..." onblur="updateSessionNote(${s.id}, this.value)">${s.note || ''}</textarea>`;
                }
                card.innerHTML = html;
                els.sessionTimeline.appendChild(card);
            });
        } else {
            els.emptyState.classList.remove('hidden');
            els.sessionTimeline.classList.add('hidden');
        }
    }
}

window.app = app;
window.updateSessionNote = updateSessionNote;

// ===== 新增：趋势统计功能 =====

let currentTrendRange = 'week'; // 默认显示本周

// 计算指定时间范围内的统计数据
function getTrendData(range) {
    const now = new Date();
    const breakdown = { deep: 0, break: 0, chore: 0, fitness: 0 };
    
    let startDate;
    if (range === 'week') {
        // 本周一
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(now.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
        // 本月第一天
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === 'year') {
        // 今年第一天
        startDate = new Date(now.getFullYear(), 0, 1);
    }
    
    state.sessions.forEach(s => {
        const sessionDate = new Date(s.start);
        if (sessionDate >= startDate) {
            breakdown[s.mode] += s.duration;
        }
    });
    
    const total = breakdown.deep + breakdown.break + breakdown.chore + breakdown.fitness;
    return { breakdown, total };
}

// 渲染饼图
function renderPieChart(breakdown, total) {
    const pieSegments = document.getElementById('pie-segments');
    if (!pieSegments) return;
    
    pieSegments.innerHTML = '';
    
    if (total === 0) {
        document.getElementById('trend-total').textContent = '0';
        return;
    }
    
    document.getElementById('trend-total').textContent = total;
    
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    let currentAngle = 0;
    
    const modes = ['deep', 'break', 'chore', 'fitness'];
    const colors = {
        deep: 'var(--color-deep)',
        break: 'var(--color-break)',
        chore: 'var(--color-chore)',
        fitness: 'var(--color-fitness)'
    };
    
    modes.forEach(mode => {
        if (breakdown[mode] > 0) {
            const percent = breakdown[mode] / total;
            const dashLength = circumference * percent;
            const dashOffset = -currentAngle;
            
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '100');
            circle.setAttribute('cy', '100');
            circle.setAttribute('r', radius);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', colors[mode].replace('var(--color-', '').replace(')', ''));
            circle.setAttribute('stroke-width', '40');
            circle.setAttribute('stroke-dasharray', `${dashLength} ${circumference}`);
            circle.setAttribute('stroke-dashoffset', dashOffset);
            circle.setAttribute('transform', 'rotate(-90 100 100)');
            circle.style.stroke = colors[mode];
            
            pieSegments.appendChild(circle);
            
            currentAngle += dashLength;
        }
    });
}

// 渲染右侧统计数据
function renderTrendBreakdown(breakdown, total) {
    const container = document.getElementById('trend-breakdown');
    if (!container) return;
    
    container.innerHTML = '';
    
    const modes = ['deep', 'break', 'chore', 'fitness'];
    const colors = {
        deep: 'var(--color-deep)',
        break: 'var(--color-break)',
        chore: 'var(--color-chore)',
        fitness: 'var(--color-fitness)'
    };
    
    modes.forEach(mode => {
        const minutes = breakdown[mode];
        const percent = total > 0 ? ((minutes / total) * 100).toFixed(1) : '0.0';
        
        const item = document.createElement('div');
        item.className = 'trend-item';
        item.innerHTML = `
            <div class="trend-item-left">
                <div class="trend-dot" style="background-color: ${colors[mode]}"></div>
                <span class="trend-label">${MODES[mode].label}</span>
            </div>
            <div>
                <span class="trend-value text-${mode}">${minutes}m</span>
                <span class="trend-percent">${percent}%</span>
            </div>
        `;
        container.appendChild(item);
    });
}

// 更新趋势统计
function updateTrendStats() {
    const { breakdown, total } = getTrendData(currentTrendRange);
    renderPieChart(breakdown, total);
    renderTrendBreakdown(breakdown, total);
}

// 初始化趋势标签切换
function initTrendTabs() {
    const tabs = document.querySelectorAll('.trend-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有 active 类
            tabs.forEach(t => t.classList.remove('active'));
            // 添加当前 active 类
            tab.classList.add('active');
            // 更新范围
            currentTrendRange = tab.dataset.range;
            // 更新统计
            updateTrendStats();
        });
    });
}

init();
