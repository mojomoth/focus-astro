# Focus Astro V1 진행 기록

V1을 Vercel에 배포하고 공개 주소에서 검증했습니다. [Focus Astro](https://focus-astro.vercel.app/)

| 게이트 | 통과 조건 | 상태 |
| --- | --- | --- |
| 0 준비 | 저장소·시안·PoC 확인, 개발 서버, 항해 API 계약, CLI·서비스 접근 확인 | BLOCKED · Claude CLI 인증 만료 및 API 사용량 한도 |
| 1 PoC | 각 PoC 및 API 실행, `/pocs` 경로 확인, 새 화면 목업 검증 | PASS · Chrome에서 PoC와 `/pocs/ui` 실행 |
| 2 통합 | 지구 → 이륙 → 출항 → 도착/귀환 → 항로·기록, PoC 재사용 | PASS · 독립 브라우저에서 전체 흐름과 추월 재현 |
| 3 완성·배포 | 원본 비교, 모바일·데스크톱, 빌드 및 비밀 검사, 공개 URL에서 핵심 흐름 검증 | PASS · 공개 주소에서 출항·귀환·동시 저장 확인 |

## 작업 목록

- [x] 30분 집중·10분 휴식, 거리 계산과 목적지 카드 연결
- [x] 우주선 대기·이륙·출항 전환, 휴식 정지, 추월 연출
- [x] 포커스 이탈·탭 종료 처리, 도착 위치와 기록 보존
- [x] 개인 기록과 경쟁 집계 경로 구현, 시안과 브라우저 캡처 비교
- [x] Vercel 배포와 비공개 저장소, 공개 URL 재검증

## 역할과 소유권

| 담당 | 작업 |
| --- | --- |
| 메인 Codex | `pocs/ui/`, `app/layout.tsx`, `app/page.tsx`, 빌드·배포, 문서 |
| 항해 구현 에이전트 | `lib/voyage*.ts`, `app/api/voyages/` |
| 장면 구현 에이전트 | `components/flight-scene*`, `public/scene/` |
| 독립 검증 에이전트 | Chrome 재현과 원본 비교, `app/pocs/[demo]/` 경로 확인 |

각 게이트는 계획, 구현, 독립 검증, 수정, 재검증 순서로 진행했습니다. 기술 검증과 미해결 항목은 [개발 보고서](report.md)에 있습니다.
