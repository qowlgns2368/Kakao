# Signal Board for GitHub Pages

이 프로젝트는 GitHub Pages에 바로 올릴 수 있는 정적 게시판입니다.
GitHub Pages가 HTTPS를 자동으로 제공하므로, 별도 인증서 파일이나 서버 스크립트는 필요하지 않습니다.

## 업로드할 파일

- `index.html`
- `styles.css`
- `app.js`

## GitHub Pages 배포

1. 새 GitHub 저장소를 만듭니다.
2. 위 3개 파일을 저장소 루트 또는 `docs/` 폴더에 올립니다.
3. GitHub 저장소의 `Settings > Pages`에서 배포 경로를 선택합니다.
4. 몇 분 뒤 `https://사용자이름.github.io/저장소이름/`으로 접속합니다.

## 참고

- 현재 코드의 경로는 상대 경로(`./styles.css`, `./app.js`)라서 GitHub Pages에서 그대로 동작합니다.
- 게시글 데이터는 브라우저 `localStorage`에 저장되므로, 서버 DB 없이도 동작합니다.
- 다른 사람과 글을 공유하는 진짜 게시판이 필요하면 백엔드가 추가로 필요합니다.
