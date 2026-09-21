import './style.css';
import { supabase, supabaseConfigured } from './supabase.js';

const app = document.querySelector('#app');
let currentUser = null;
let profile = null;
let activeTab = 'result';
let resultPeriod = 'week';
let resultAnchor = localDate();
let selectedDate = localDate();
let currentRecord = null;

function localDate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function loadProfile(user) {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('id,email,display_name,status,role').eq('id', user.id).maybeSingle();
  return data;
}

function renderLogin(message = '') {
  app.innerHTML = `<main class="auth-shell"><section class="auth-card"><div class="eyebrow">FAMILY OS</div><h1>가족경영 대시보드</h1><p class="muted">가족 구성원만 사용할 수 있도록 승인제로 운영합니다.</p>${message ? `<div class="notice">${message}</div>` : ''}<form id="login-form"><label>이메일<input id="email" type="email" required autocomplete="email" placeholder="이메일" /></label><label>비밀번호<input id="password" type="password" required autocomplete="current-password" placeholder="비밀번호" /></label><button type="submit">로그인</button></form><div class="divider">또는</div><form id="signup-form"><label>이름<input id="name" required placeholder="이름" /></label><label>가입 이메일<input id="signup-email" type="email" required placeholder="이메일" /></label><label>가입 비밀번호<input id="signup-password" type="password" minlength="6" required placeholder="6자 이상" /></label><button class="secondary" type="submit">사용 신청</button></form>${!supabaseConfigured ? '<p class="config-warning">Supabase 환경변수를 아직 설정하지 않았습니다.</p>' : ''}</section></main>`;
  document.querySelector('#login-form').addEventListener('submit', login);
  document.querySelector('#signup-form').addEventListener('submit', signup);
}

async function login(e) {
  e.preventDefault();
  if (!supabase) return renderLogin('Supabase 연결 설정이 필요합니다.');
  const { data, error } = await supabase.auth.signInWithPassword({ email: document.querySelector('#email').value, password: document.querySelector('#password').value });
  if (error) return renderLogin(`로그인 실패: ${esc(error.message)}`);
  currentUser = data.user;
  await routeUser();
}

async function signup(e) {
  e.preventDefault();
  if (!supabase) return renderLogin('Supabase 연결 설정이 필요합니다.');
  const name = document.querySelector('#name').value;
  const { data, error } = await supabase.auth.signUp({
    email: document.querySelector('#signup-email').value,
    password: document.querySelector('#signup-password').value,
    options: { data: { display_name: name } }
  });
  if (error) return renderLogin(`신청 실패: ${esc(error.message)}`);
  if (data.user) renderPending(name);
  else renderLogin('이메일 확인 후 로그인해 주세요.');
}

function renderPending(name = '') {
  app.innerHTML = `<main class="auth-shell"><section class="auth-card center"><div class="pending-icon">⏳</div><h1>승인 대기중</h1><p>${name ? `${esc(name)}님, ` : ''}사용 신청이 접수되었습니다.</p><p class="muted">관리자가 승인하면 가족 대시보드를 사용할 수 있습니다.</p><button id="logout">로그아웃</button></section></main>`;
  document.querySelector('#logout').onclick = async () => { await supabase?.auth.signOut(); renderLogin(); };
}

function renderRejected() {
  app.innerHTML = `<main class="auth-shell"><section class="auth-card center"><div class="pending-icon">⛔</div><h1>접근이 제한되었습니다</h1><p class="muted">관리자에게 승인 상태를 확인해 주세요.</p><button id="logout">로그아웃</button></section></main>`;
  document.querySelector('#logout').onclick = async () => { await supabase?.auth.signOut(); renderLogin(); };
}

function blankRecord() {
  return {
    meals: {},
    schedule: '',
    issue: { conflict: 0, eatingOut: 0, lateNight: 0, note: '' }
  };
}

function slotsForDate(date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6
    ? [['breakfast', '주말 아침'], ['lunch', '주말 점심'], ['dinner', '주말 저녁']]
    : [['dinner', '평일 저녁']];
}

async function loadDailyRecord(date) {
  if (!supabase) return blankRecord();
  const { data, error } = await supabase.from('daily_records').select('data').eq('record_date', date).maybeSingle();
  if (error) {
    console.error(error);
    return blankRecord();
  }
  return data?.data || blankRecord();
}

async function loadRecords(start, end) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('daily_records')
    .select('record_date,data')
    .gte('record_date', start)
    .lte('record_date', end)
    .order('record_date', { ascending: true });
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

async function saveDailyRecord(date, record) {
  if (!supabase || !currentUser) return;
  const { error } = await supabase.from('daily_records').upsert({
    record_date: date,
    data: record,
    created_by: currentUser.id
  }, { onConflict: 'record_date' });
  if (error) throw error;
}

function parseDate(date) {
  return new Date(`${date}T12:00:00`);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(date, amount) {
  const d = parseDate(date);
  d.setDate(d.getDate() + amount);
  return isoDate(d);
}

function getPeriodRange(anchor, period) {
  const d = parseDate(anchor);
  if (period === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 12);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
    return { start: isoDate(start), end: isoDate(end) };
  }
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

function formatShortDate(date) {
  const d = parseDate(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDate(date) {
  const d = parseDate(date);
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function formatPeriod(range, period) {
  if (period === 'month') {
    const d = parseDate(range.start);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }
  return `${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
}

function shiftResultPeriod(amount) {
  const d = parseDate(resultAnchor);
  if (resultPeriod === 'month') d.setMonth(d.getMonth() + amount);
  else d.setDate(d.getDate() + amount * 7);
  resultAnchor = isoDate(d);
}

function mealSummary(meal) {
  if (!meal) return '기록 없음';
  const parts = [meal.menu, meal.type, meal.type !== '외식' && meal.preparedBy ? `준비 ${meal.preparedBy}` : '', meal.type !== '외식' && meal.cookedBy ? `요리 ${meal.cookedBy}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : '기록 없음';
}

function collectStats(rows) {
  const stats = {
    days: rows.length,
    meals: 0,
    schedules: 0,
    conflicts: 0,
    eatingOut: 0,
    lateNight: 0,
    mealTypes: { 집밥: 0, 외식: 0, 배달: 0, 간편식: 0 },
    recentMeals: [],
    scheduleItems: []
  };

  rows.forEach(row => {
    const record = row.data || {};
    if (record.schedule?.trim()) {
      stats.schedules += 1;
      stats.scheduleItems.push({ date: row.record_date, text: record.schedule.trim() });
    }

    const issue = record.issue || {};
    stats.conflicts += Number(issue.conflict || 0);
    stats.eatingOut += Number(issue.eatingOut || 0);
    stats.lateNight += Number(issue.lateNight || 0);

    Object.entries(record.meals || {}).forEach(([slot, meal]) => {
      if (!meal || (!meal.menu && !meal.type)) return;
      stats.meals += 1;
      const type = meal.type || '집밥';
      if (stats.mealTypes[type] !== undefined) stats.mealTypes[type] += 1;
      stats.recentMeals.push({
        date: row.record_date,
        slot,
        summary: mealSummary(meal)
      });
    });
  });

  stats.recentMeals.sort((a,b) => b.date.localeCompare(a.date));
  stats.scheduleItems.sort((a,b) => a.date.localeCompare(b.date));
  return stats;
}

async function renderDashboard() {
  currentRecord = await loadDailyRecord(selectedDate);
  await renderApp();
}

async function renderApp() {
  const admin = profile?.role === 'admin';

  app.innerHTML = `
    <main class="app-shell">
      <header class="app-header">
        <div>
          <div class="eyebrow">FAMILY OS</div>
          <h1>가족경영 대시보드</h1>
          <p>가족의 일정·식사·생활 기록을 한 곳에서 관리합니다.</p>
        </div>
        <button id="logout" class="small-button">로그아웃</button>
      </header>

      <section class="user-strip">
        <span>🔐 ${esc(profile?.display_name || currentUser?.email || '')}</span>
        <span>${admin ? '관리자' : '가족 구성원'}</span>
      </section>

      <nav class="tabs">
        <button class="${activeTab === 'result' ? 'active' : ''}" data-tab="result">📊 결과</button>
        <button class="${activeTab === 'input' ? 'active' : ''}" data-tab="input">✏️ 입력</button>
      </nav>

      ${activeTab === 'result' ? await renderResult() : renderInput()}
      ${admin ? '<div class="admin-hint">관리자 승인 기능은 다음 단계에서 연결합니다.</div>' : ''}
    </main>
  `;

  document.querySelector('#logout').onclick = async () => {
    await supabase?.auth.signOut();
    currentUser = null;
    profile = null;
    renderLogin();
  };

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => {
      activeTab = btn.dataset.tab;
      if (activeTab === 'input') currentRecord = await loadDailyRecord(selectedDate);
      await renderApp();
    };
  });

  if (activeTab === 'result') bindResult();
  else bindInput();
}

async function renderResult() {
  const range = getPeriodRange(resultAnchor, resultPeriod);
  const rows = await loadRecords(range.start, range.end);
  const stats = collectStats(rows);
  const totalMealTypes = Object.values(stats.mealTypes).reduce((a,b) => a+b, 0);
  const mealPercent = type => totalMealTypes ? Math.round(stats.mealTypes[type] / totalMealTypes * 100) : 0;

  return `
    <section class="result-page">
      <div class="period-tabs">
        <button class="${resultPeriod === 'week' ? 'active' : ''}" data-period="week">주간</button>
        <button class="${resultPeriod === 'month' ? 'active' : ''}" data-period="month">월간</button>
      </div>

      <div class="period-heading">
        <button class="period-arrow" data-period-shift="-1">‹</button>
        <div>
          <span class="eyebrow">${resultPeriod === 'week' ? 'WEEKLY RESULT' : 'MONTHLY RESULT'}</span>
          <h2>${formatPeriod(range, resultPeriod)}</h2>
        </div>
        <button class="period-arrow" data-period-shift="1">›</button>
      </div>

      <section class="summary-card">
        <div class="summary-title">${resultPeriod === 'week' ? '주간 요약' : '월간 요약'}</div>
        <div class="metrics result-metrics">
          <div><b>${stats.meals}</b><span>식사</span><small>평균 ${(stats.meals / (resultPeriod === 'week' ? 7 : Math.max(new Date(parseDate(range.end)).getDate(),1))).toFixed(1)}회/일</small></div>
          <div><b>${stats.schedules}</b><span>일정</span><small>기록된 일정</small></div>
          <div><b>${stats.conflicts}</b><span>부부 이슈</span><small>기록 횟수</small></div>
          <div><b>${stats.lateNight}</b><span>야간 외출</span><small>기록 횟수</small></div>
        </div>
      </section>

      <section class="analytics-grid">
        <article class="result-card meal-analysis">
          <div class="result-card-head"><span>🍴</span><strong>식사 유형</strong><span class="card-unit">${stats.meals}회</span></div>
          <div class="bar-list">
            ${['집밥','외식','배달','간편식'].map(type => `
              <div class="bar-row">
                <div><span>${type}</span><b>${stats.mealTypes[type]}</b></div>
                <div class="bar-track"><i style="width:${mealPercent(type)}%"></i></div>
              </div>`).join('')}
          </div>
        </article>

        <article class="result-card">
          <div class="result-card-head"><span>❤️</span><strong>생활 기록</strong><span class="card-unit">${stats.eatingOut}회 외식</span></div>
          <div class="issue-line"><span>부부 이슈</span><b>${stats.conflicts}</b></div>
          <div class="issue-line"><span>외식</span><b>${stats.eatingOut}</b></div>
          <div class="issue-line"><span>야간 외출</span><b>${stats.lateNight}</b></div>
        </article>

        <article class="result-card">
          <div class="result-card-head"><span>🍚</span><strong>최근 식사</strong><span class="card-unit">최근 5건</span></div>
          ${stats.recentMeals.slice(0,5).map(item => `<div class="history-row"><span>${formatShortDate(item.date)}</span><b>${esc(item.summary)}</b></div>`).join('') || '<p class="empty-text">아직 기록이 없습니다.</p>'}
        </article>

        <article class="result-card">
          <div class="result-card-head"><span>📅</span><strong>기간 일정</strong><span class="card-unit">${stats.schedules}건</span></div>
          ${stats.scheduleItems.slice(0,5).map(item => `<div class="history-row"><span>${formatShortDate(item.date)}</span><b>${esc(item.text)}</b></div>`).join('') || '<p class="empty-text">아직 기록이 없습니다.</p>'}
        </article>
      </section>

      <div class="result-insight">
        <span>📈</span>
        <div><b>${resultPeriod === 'week' ? '이번 주 가족 운영 현황' : '이번 달 가족 운영 현황'}</b><p>입력된 식사·일정·생활 기록을 기준으로 자동 집계합니다.</p></div>
      </div>
    </section>
  `;
}

function renderInput() {
  const dateLabel = formatDate(selectedDate);
  const slots = slotsForDate(selectedDate);
  const meals = currentRecord?.meals || {};

  return `
    <section class="input-page">
      <div class="date-heading">
        <div><span class="eyebrow">INPUT</span><h2>${dateLabel}</h2></div>
        <input id="record-date" class="date-picker" type="date" value="${selectedDate}" />
      </div>

      <form id="daily-form">
        <section class="input-card">
          <div class="section-title">🍚 식사 기록</div>
          ${slots.map(([key,label]) => {
            const m = meals[key] || {};
            const isOut = m.type === '외식';
            return `<div class="meal-form">
              <h3>${label}</h3>
              <select data-meal="${key}" data-field="type" class="meal-type">
                <option value="">식사 형태를 선택하세요</option>
                <option ${m.type === '집밥' ? 'selected' : ''}>집밥</option>
                <option ${m.type === '외식' ? 'selected' : ''}>외식</option>
                <option ${m.type === '배달' ? 'selected' : ''}>배달</option>
                <option ${m.type === '간편식' ? 'selected' : ''}>간편식</option>
              </select>
              <input data-meal="${key}" data-field="menu" value="${esc(m.menu || '')}" placeholder="${isOut ? '외식 메뉴 / 식당명' : '메뉴'}" />
              <div class="responsibility-fields" data-responsibility="${key}" style="${isOut ? 'display:none' : ''}">
                <div class="two-col">
                  <select data-meal="${key}" data-field="preparedBy">
                    <option value="">준비 담당</option>
                    <option ${m.preparedBy === '엄마' ? 'selected' : ''}>엄마</option>
                    <option ${m.preparedBy === '아빠' ? 'selected' : ''}>아빠</option>
                  </select>
                  <select data-meal="${key}" data-field="cookedBy">
                    <option value="">요리 담당</option>
                    <option ${m.cookedBy === '엄마' ? 'selected' : ''}>엄마</option>
                    <option ${m.cookedBy === '아빠' ? 'selected' : ''}>아빠</option>
                  </select>
                </div>
              </div>
            </div>`;
          }).join('')}
        </section>

        <section class="input-card">
          <div class="section-title">📅 일정</div>
          <textarea id="schedule" rows="2" placeholder="그날 가족 일정 / 약속 / 메모">${esc(currentRecord?.schedule || '')}</textarea>
        </section>

        <section class="input-card">
          <div class="section-title">📝 생활 기록</div>
          <div class="three-col">
            <label>부부 이슈<input id="conflict" type="number" min="0" value="${Number(currentRecord?.issue?.conflict || 0)}" /></label>
            <label>외식 횟수<input id="eating-out" type="number" min="0" value="${Number(currentRecord?.issue?.eatingOut || 0)}" /></label>
            <label>야간 외출<input id="late-night" type="number" min="0" value="${Number(currentRecord?.issue?.lateNight || 0)}" /></label>
          </div>
          <textarea id="issue-note" rows="2" placeholder="생활 기록 메모">${esc(currentRecord?.issue?.note || '')}</textarea>
        </section>

        <button class="primary-action" type="submit">저장하기</button>
      </form>
    </section>
  `;
}

function bindResult() {
  document.querySelectorAll('[data-period]').forEach(btn => {
    btn.onclick = async () => {
      resultPeriod = btn.dataset.period;
      await renderApp();
    };
  });

  document.querySelectorAll('[data-period-shift]').forEach(btn => {
    btn.onclick = async () => {
      shiftResultPeriod(Number(btn.dataset.periodShift));
      await renderApp();
    };
  });
}

function bindInput() {
  const dateInput = document.querySelector('#record-date');
  dateInput.addEventListener('change', async e => {
    selectedDate = e.target.value;
    currentRecord = await loadDailyRecord(selectedDate);
    await renderApp();
  });

  document.querySelectorAll('.meal-type').forEach(select => {
    select.addEventListener('change', e => {
      const key = e.target.dataset.meal;
      const box = document.querySelector(`[data-responsibility="${key}"]`);
      if (box) box.style.display = e.target.value === '외식' ? 'none' : '';
    });
  });

  document.querySelector('#daily-form').addEventListener('submit', async e => {
    e.preventDefault();
    const record = blankRecord();
    record.schedule = document.querySelector('#schedule').value;
    record.issue = {
      conflict: Number(document.querySelector('#conflict').value || 0),
      eatingOut: Number(document.querySelector('#eating-out').value || 0),
      lateNight: Number(document.querySelector('#late-night').value || 0),
      note: document.querySelector('#issue-note').value
    };

    document.querySelectorAll('[data-meal]').forEach(el => {
      const key = el.dataset.meal;
      const field = el.dataset.field;
      record.meals[key] ||= {};
      record.meals[key][field] = el.value;
    });

    Object.values(record.meals).forEach(meal => {
      if (meal.type === '외식') {
        delete meal.preparedBy;
        delete meal.cookedBy;
      }
    });

    try {
      await saveDailyRecord(selectedDate, record);
      currentRecord = record;
      activeTab = 'result';
      resultAnchor = selectedDate;
      await renderApp();
    } catch (error) {
      alert(`저장 실패: ${error.message}`);
    }
  });
}

async function routeUser() {
  if (!currentUser) return renderLogin();
  profile = await loadProfile(currentUser);
  if (!profile || profile.status === 'pending') return renderPending(profile?.display_name);
  if (profile.status === 'rejected') return renderRejected();
  await renderDashboard();
}

async function boot() {
  if (!supabase) return renderLogin();
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;
  await routeUser();
  supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await routeUser();
    else renderLogin();
  });
}

boot();
