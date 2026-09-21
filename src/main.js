import './style.css';
import { supabase, supabaseConfigured } from './supabase.js';

const app = document.querySelector('#app');
let currentUser = null;
let profile = null;
let activeTab = 'result';
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
    ? [
        ['breakfast', '주말 아침'],
        ['lunch', '주말 점심'],
        ['dinner', '주말 저녁']
      ]
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

async function saveDailyRecord(date, record) {
  if (!supabase || !currentUser) return;
  const { error } = await supabase.from('daily_records').upsert({
    record_date: date,
    data: record,
    created_by: currentUser.id
  }, { onConflict: 'record_date' });
  if (error) throw error;
}

function formatDate(date) {
  const d = new Date(`${date}T12:00:00`);
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function mealSummary(meal) {
  if (!meal) return '기록 없음';
  const parts = [meal.menu, meal.type, meal.preparedBy ? `준비 ${meal.preparedBy}` : '', meal.cookedBy ? `요리 ${meal.cookedBy}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : '기록 없음';
}

async function renderDashboard() {
  currentRecord = await loadDailyRecord(selectedDate);
  renderApp();
}

function renderApp() {
  const admin = profile?.role === 'admin';
  const dateLabel = formatDate(selectedDate);
  const slots = slotsForDate(selectedDate);
  const issue = currentRecord?.issue || {};
  const mealCount = Object.values(currentRecord?.meals || {}).filter(m => m?.menu || m?.type).length;
  const scheduleCount = currentRecord?.schedule?.trim() ? 1 : 0;
  const issueCount = Number(issue.conflict || 0) + Number(issue.eatingOut || 0) + Number(issue.lateNight || 0);

  app.innerHTML = `
    <main class="app-shell">
      <header class="app-header">
        <div>
          <div class="eyebrow">FAMILY OS</div>
          <h1>가족경영 대시보드</h1>
          <p>가족의 하루를 기록하고 한눈에 확인합니다.</p>
        </div>
        <button id="logout" class="small-button">로그아웃</button>
      </header>

      <section class="user-strip">
        <span>🔐 ${esc(profile?.display_name || currentUser?.email || '')}</span>
        <span>${admin ? '관리자' : '가족 구성원'}</span>
      </section>

      <nav class="tabs" aria-label="대시보드 메뉴">
        <button class="${activeTab === 'result' ? 'active' : ''}" data-tab="result">📊 결과</button>
        <button class="${activeTab === 'input' ? 'active' : ''}" data-tab="input">✏️ 입력</button>
      </nav>

      ${activeTab === 'result' ? renderResult(dateLabel, mealCount, scheduleCount, issueCount, slots, issue) : renderInput(dateLabel, slots)}

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
      renderApp();
    };
  });

  const goInput = document.querySelector('#go-input');
  if (goInput) goInput.onclick = async () => {
    activeTab = 'input';
    currentRecord = await loadDailyRecord(selectedDate);
    renderApp();
  };

  const changeDate = document.querySelector('#change-date');
  if (changeDate) changeDate.onclick = () => {
    activeTab = 'input';
    renderApp();
    document.querySelector('#record-date')?.showPicker?.();
  };

  if (activeTab === 'input') bindInput();
}

function renderResult(dateLabel, mealCount, scheduleCount, issueCount, slots, issue) {
  return `
    <section class="result-page">
      <div class="date-heading">
        <div><span class="eyebrow">SELECTED DATE</span><h2>${dateLabel}</h2></div>
        <button id="change-date" class="date-button">날짜 변경</button>
      </div>

      <section class="summary-card">
        <div class="summary-title">하루 요약</div>
        <div class="metrics compact">
          <div><b>${mealCount}</b><span>식사</span></div>
          <div><b>${scheduleCount}</b><span>일정</span></div>
          <div><b>${issueCount}</b><span>이슈</span></div>
        </div>
      </section>

      <section class="result-grid">
        <article class="result-card">
          <div class="result-card-head"><span>🍚</span><strong>식사</strong></div>
          ${slots.map(([key,label]) => `<div class="mini-row"><span>${label}</span><b>${esc(mealSummary(currentRecord?.meals?.[key]))}</b></div>`).join('')}
        </article>
        <article class="result-card">
          <div class="result-card-head"><span>📅</span><strong>일정</strong></div>
          <p class="result-text">${esc(currentRecord?.schedule || '기록 없음')}</p>
        </article>
        <article class="result-card issue-card">
          <div class="result-card-head"><span>📝</span><strong>생활 기록</strong></div>
          <div class="issue-line"><span>부부 이슈</span><b>${Number(issue.conflict || 0)}</b></div>
          <div class="issue-line"><span>외식</span><b>${Number(issue.eatingOut || 0)}</b></div>
          <div class="issue-line"><span>야간 외출</span><b>${Number(issue.lateNight || 0)}</b></div>
          ${issue.note ? `<p class="result-note">${esc(issue.note)}</p>` : ''}
        </article>
      </section>

      <button id="go-input" class="primary-action">✏️ 이 날짜 기록 수정</button>
    </section>
  `;
}

function renderInput(dateLabel, slots) {
  const meals = currentRecord?.meals || {};
  return `
    <section class="input-page">
      <div class="date-heading">
        <div><span class="eyebrow">INPUT</span><h2>${dateLabel}</h2></div>
        <input id="record-date" class="date-picker" type="date" value="${selectedDate}" />
      </div>

      <form id="daily-form">
        <section class="input-card">
          <div class="section-title">🍚 식사</div>
          ${slots.map(([key,label]) => {
            const m = meals[key] || {};
            return `<div class="meal-form">
              <h3>${label}</h3>
              <input data-meal="${key}" data-field="menu" value="${esc(m.menu || '')}" placeholder="메뉴" />
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
              <select data-meal="${key}" data-field="type">
                <option value="">식사 형태</option>
                <option ${m.type === '집밥' ? 'selected' : ''}>집밥</option>
                <option ${m.type === '외식' ? 'selected' : ''}>외식</option>
                <option ${m.type === '배달' ? 'selected' : ''}>배달</option>
                <option ${m.type === '간편식' ? 'selected' : ''}>간편식</option>
              </select>
            </div>`;
          }).join('')}
        </section>

        <section class="input-card">
          <div class="section-title">📅 일정</div>
          <textarea id="schedule" rows="3" placeholder="그날 가족 일정 / 약속 / 메모">${esc(currentRecord?.schedule || '')}</textarea>
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

function bindInput() {
  document.querySelector('#record-date').addEventListener('change', async e => {
    selectedDate = e.target.value;
    currentRecord = await loadDailyRecord(selectedDate);
    renderApp();
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

    try {
      await saveDailyRecord(selectedDate, record);
      currentRecord = record;
      activeTab = 'result';
      renderApp();
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
