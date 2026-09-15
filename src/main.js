import './style.css';
import { supabase, supabaseConfigured } from './supabase.js';

const app = document.querySelector('#app');
let currentUser = null;
let profile = null;

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

async function login(e) { e.preventDefault(); if (!supabase) return renderLogin('Supabase 연결 설정이 필요합니다.'); const { data, error } = await supabase.auth.signInWithPassword({ email: document.querySelector('#email').value, password: document.querySelector('#password').value }); if (error) return renderLogin(`로그인 실패: ${error.message}`); currentUser = data.user; await routeUser(); }
async function signup(e) { e.preventDefault(); if (!supabase) return renderLogin('Supabase 연결 설정이 필요합니다.'); const name = document.querySelector('#name').value; const { data, error } = await supabase.auth.signUp({ email: document.querySelector('#signup-email').value, password: document.querySelector('#signup-password').value, options: { data: { display_name: name } } }); if (error) return renderLogin(`신청 실패: ${error.message}`); if (data.user) renderPending(name); else renderLogin('이메일 확인 후 로그인해 주세요.'); }

function renderPending(name = '') { app.innerHTML = `<main class="auth-shell"><section class="auth-card center"><div class="pending-icon">⏳</div><h1>승인 대기중</h1><p>${name ? `${name}님, ` : ''}사용 신청이 접수되었습니다.</p><p class="muted">관리자가 승인하면 가족 대시보드를 사용할 수 있습니다.</p><button id="logout">로그아웃</button></section></main>`; document.querySelector('#logout').onclick = async () => { await supabase?.auth.signOut(); renderLogin(); }; }
function renderRejected() { app.innerHTML = `<main class="auth-shell"><section class="auth-card center"><div class="pending-icon">⛔</div><h1>접근이 제한되었습니다</h1><p class="muted">관리자에게 승인 상태를 확인해 주세요.</p><button id="logout">로그아웃</button></section></main>`; document.querySelector('#logout').onclick = async () => { await supabase?.auth.signOut(); renderLogin(); }; }
function renderDashboard() { const admin = profile?.role === 'admin'; app.innerHTML = `<main class="shell"><header class="topbar"><div><div class="eyebrow">FAMILY OS</div><h1>가족경영 대시보드</h1><p>가족의 일정·식사·생활 기록을 한 곳에서 관리합니다.</p></div><button id="logout" class="small-button">로그아웃</button></header><section class="notice"><strong>🔐 승인된 사용자</strong><span>${profile?.display_name || currentUser?.email || ''} · ${admin ? '관리자' : '가족 구성원'}</span></section>${admin ? '<section class="card admin-card"><h3>관리자</h3><p class="muted">승인 대기 사용자 목록과 승인/거부 기능을 연결할 예정입니다.</p></section>' : ''}<section class="grid"><article class="card hero"><div class="label">TODAY</div><h2>오늘의 가족 운영 현황</h2><div class="metrics"><div><b>0</b><span>일정</span></div><div><b>0</b><span>식사 기록</span></div><div><b>0</b><span>이슈</span></div></div></article><article class="card"><div class="card-title"><span>🍚</span><h3>식사</h3></div><p>평일 저녁 · 주말 아침/점심/저녁</p><p class="muted">메뉴 / 준비 담당 / 요리 담당 / 집밥·외식·배달·간편식</p></article><article class="card"><div class="card-title"><span>📅</span><h3>일정</h3></div><p>주말 일정과 가족 스케줄</p><p class="muted">Google Calendar 연동 예정</p></article><article class="card"><div class="card-title"><span>📝</span><h3>생활 기록</h3></div><p>부부 이슈 · 외식 · 야간외출 등</p><p class="muted">누적 데이터를 KPI로 확인</p></article></section><footer>Family OS · 승인제 MVP</footer></main>`; document.querySelector('#logout').onclick = async () => { await supabase?.auth.signOut(); currentUser = null; profile = null; renderLogin(); }; }

async function routeUser() { if (!currentUser) return renderLogin(); profile = await loadProfile(currentUser); if (!profile || profile.status === 'pending') return renderPending(profile?.display_name); if (profile.status === 'rejected') return renderRejected(); renderDashboard(); }
async function boot() { if (!supabase) return renderLogin(); const { data } = await supabase.auth.getSession(); currentUser = data.session?.user || null; await routeUser(); supabase.auth.onAuthStateChange(async (_event, session) => { currentUser = session?.user || null; if (currentUser) await routeUser(); else renderLogin(); }); }
boot();
