# LOGIFLOW Splash Assets

Android PWA 스플래시는 Manifest의 `theme_color`, `background_color`, 아이콘을 기준으로 자동 생성됩니다.

iPhone 전용 시작 이미지는 실제 아이콘 확정 후 아래 이름으로 추가합니다.

- `apple-splash-1170x2532.png`
- `apple-splash-1284x2778.png`
- `apple-splash-1290x2796.png`
- `apple-splash-1536x2048.png`
- `apple-splash-1668x2388.png`
- `apple-splash-2048x2732.png`

배경색은 `#F7F8FA`, 중앙 로고는 LOGIFLOW 브랜드 안전영역을 유지합니다. 실제 이미지가 준비되면 `firebase/public/index.html`에 기기별 `apple-touch-startup-image` 링크를 추가합니다.
