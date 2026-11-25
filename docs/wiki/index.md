# Focus Astro 개발 위키

## 실행

Node.js 24에서 `npm ci`를 한 뒤 `npm run dev`로 실행합니다. 루트 주소에서 앱을 열고, `/pocs/ui`에서 같은 UI를 확인할 수 있습니다. 데스크톱은 아이폰 프레임, 모바일은 안전 영역을 적용한 전체 화면을 사용합니다.

기존 PoC는 개발 서버의 `/pocs/idle`, `/pocs/ui-v4`, `/pocs/setup-ui`, `/pocs/voyage`, `/pocs/voyage-time`, `/pocs/mockup`, `/pocs/clone`에서 확인합니다. 밸런스 저장은 [항해 시간 PoC](../../pocs/voyage-time/README.md)의 단독 서버에서 실행합니다.

## 문서

- [V1 실행 프롬프트](../prompts/PROMPT_V1.md)
- [초기 기획](../CONCEPT.md) · [화면 정의](../SCREENS.md) · [항로 밸런스](../design/freeze/balance/v2/README.md)
- [진행 및 게이트 상태](../dev-v1/run.md) · [개발 보고서](../dev-v1/report.md) · [변경 기록](log.md)

## 이미지 출처

- 우주선과 지구 야경 등은 Focus Astro용으로 제작한 PoC 아트를 재사용했습니다. WebP로 변환하고 화면에 맞춰 크기를 조정했습니다. [아트 제작 기록](../../pocs/clone/README.md)
- 행성 이미지는 원본 사진이나 상상도를 잘라 JPEG 썸네일 또는 WebP로 가공했습니다. 파일별 저작자, 원본 링크, 라이선스는 출처 목록에 있습니다. 티가든별 b 썸네일은 Bubblesorg의 원본을 잘라 변환했으며 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)을 적용합니다. [행성 파일별 크레딧](../design/refs/planet/README.md#출처라이선스)
- 항해 배경은 원본 우주 사진을 WebP로 변환했습니다. 저작자는 항해 화면과 원본 목록에서 확인할 수 있습니다. [우주 사진 출처](../design/refs/space/README.md) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
