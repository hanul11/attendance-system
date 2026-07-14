# Native Icon and Splash Source Layout

실제 브랜드 이미지는 이번 Sprint에서 생성하지 않습니다. 원본이 확정되면 아래 파일을 이 폴더에 배치한 뒤 Capacitor의 Android/iOS 자산 생성 단계에서 사용합니다.

| 파일 | 권장 크기 | 용도 |
| --- | --- | --- |
| `icon.png` | 1024 x 1024 | 공통 앱 아이콘 원본 |
| `icon-foreground.png` | 1024 x 1024 | Android Adaptive Icon 전경 |
| `icon-background.png` | 1024 x 1024 | Android Adaptive Icon 배경 |
| `splash.png` | 2732 x 2732 | 공통 Splash 원본 |
| `splash-dark.png` | 2732 x 2732 | 향후 다크모드 Splash 원본 |

Android Adaptive Icon의 핵심 심볼은 중앙 66% 영역, 잘려서는 안 되는 요소는 중앙 80% 영역 안에 배치합니다. iOS 아이콘에는 투명 배경을 사용하지 않습니다.
