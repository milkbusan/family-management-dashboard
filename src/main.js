import './style.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div>
        <div class="eyebrow">FAMILY OS</div>
        <h1>가족경영 대시보드</h1>
        <p>가족의 일정·식사·생활 기록을 한 곳에서 관리합니다.</p>
      </div>
      <span class="status">MVP</span>
    </header>

    <section class="notice">
      <strong>🔐 승인제 운영</strong>
      <span>현재는 화면 구조만 먼저 올렸습니다. 다음 단계에서 로그인 → 관리자 승인 → 가족 데이터 접근 제한을 연결합니다.</span>
    </section>

    <section class="grid">
      <article class="card hero">
        <div class="label">TODAY</div>
        <h2>오늘의 가족 운영 현황</h2>
        <div class="metrics">
          <div><b>0</b><span>일정</span></div>
          <div><b>0</b><span>식사 기록</span></div>
          <div><b>0</b><span>이슈</span></div>
        </div>
      </article>

      <article class="card">
        <div class="card-title"><span>🍚</span><h3>식사</h3></div>
        <p>평일 저녁 · 주말 아침/점심/저녁</p>
        <p class="muted">메뉴 / 준비 담당 / 요리 담당 / 집밥·외식·배달·간편식</p>
      </article>

      <article class="card">
        <div class="card-title"><span>📅</span><h3>일정</h3></div>
        <p>주말 일정과 가족 스케줄</p>
        <p class="muted">Google Calendar 연동 예정</p>
      </article>

      <article class="card">
        <div class="card-title"><span>📝</span><h3>생활 기록</h3></div>
        <p>부부 이슈 · 외식 · 야간외출 등</p>
        <p class="muted">누적 데이터를 KPI로 확인</p>
      </article>
    </section>

    <footer>GitHub 저장소 연결 완료 · 다음 단계: Supabase 인증/DB + 관리자 승인</footer>
  </main>
`;
