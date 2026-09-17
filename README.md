# 자산일기 테스트버전

파스텔 다이어리 디자인의 개인 자산 일기 PWA입니다. 자산·가계부·거래·리밸런싱을 기록하고, 모든 데이터는 **내 기기(브라우저) 안에만** 저장됩니다.

## GitHub Pages로 올리기

1. GitHub에서 새 저장소를 만듭니다(예: `asset-diary-test`). Public으로 두어야 무료 Pages를 쓸 수 있습니다.
2. 이 폴더의 파일을 **폴더 구조 그대로** 저장소 최상단에 업로드합니다.
3. 저장소의 **Settings → Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `/ (root)`로 선택하고 저장합니다.
4. 1~2분 뒤 `https://<아이디>.github.io/<저장소이름>/` 주소가 열립니다.
5. 아이폰 Safari로 그 주소를 열고 **공유 → 홈 화면에 추가**를 누릅니다.

## 파일 구성

```
index.html              앱 화면
styles.css              디자인
app.js                  기능
sw.js                   오프라인 캐시(서비스워커)
manifest.webmanifest    홈 화면 앱 정보
icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png   앱 아이콘
mood-*.png              수익 구간 캐릭터 4종
.nojekyll               GitHub Pages가 파일을 그대로 제공하도록 하는 빈 파일
```

## 데이터

- 저장 키는 `myAssets.v4.test`입니다. 금융대시보드판·몽글이버전은 같은 주소에서 처음 열 때 이 데이터를 복사해 갑니다.
- 다른 주소로 옮겼다면 설정 → 백업 → 내보내기/가져오기로 옮기세요.

## 업데이트할 때

파일을 새로 올린 뒤 홈 화면 앱을 완전히 종료했다가 다시 열면 새 버전이 반영됩니다(`sw.js`의 `CACHE` 이름이 바뀌어야 캐시가 교체됩니다).
