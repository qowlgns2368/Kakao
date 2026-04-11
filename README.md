# 3-1반 열정 ON! UI

GitHub Pages에서 열리는 정적 채팅방이고, 메시지는 Supabase에 저장됩니다.

## 파일

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `supabase.sql`

## 1. Supabase 준비

1. Supabase 프로젝트를 만듭니다.
2. `SQL Editor`에서 `supabase.sql` 내용을 실행합니다.
3. `Settings > API`에서 아래 두 값을 복사합니다.
   - Project URL
   - publishable key

## 2. config.js 수정

`config.js`에서 아래 값을 실제 프로젝트 값으로 바꿉니다.

```js
window.CHAT_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabasePublishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",
  roomSlug: "class-3-1-passion-on",
  roomLabel: "3-1반 열정 ON!",
  pollIntervalMs: 4000
};
```

## 3. GitHub Pages 배포

이 폴더 전체를 저장소에 올리고 `Settings > Pages`에서 배포를 켜면 됩니다.
GitHub Pages는 정적 호스팅만 하고, 실제 메시지 저장은 Supabase가 담당합니다.

## 동작 방식

- 메시지 목록: Supabase REST API에서 주기적으로 조회
- 메시지 전송: Supabase REST API로 insert
- 내 이름/내 기기 식별자: 브라우저 localStorage 저장
- 실제 채팅 내용: Supabase DB 저장

## 주의

- 현재 SQL은 `익명 사용자(anon)`가 읽기/쓰기 가능하게 열어둔 간단한 구성입니다.
- 그래서 클래스 단체방처럼 가볍게 쓰기엔 편하지만, 스팸 방지나 사용자 인증은 없습니다.
- 더 안전하게 하려면 Supabase Auth까지 붙여야 합니다.


