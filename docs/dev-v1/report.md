# Focus Astro V1 개발 보고서

## 결정

- `PROMPT_V1.md`의 30분 집중·10분 휴식과 휴식 중 정지 규칙을 적용했습니다. 배경과 이동 거리는 휴식 중 고정합니다. `CONTEXT.md`에 따라 휴식 동안 탭을 바꿀 수 있으며, 화면을 벗어난 채 집중이 시작되거나 앱을 닫으면 항해가 실패합니다.
- 항로는 밸런스 v2의 46개 목적지와 이동 구간을 사용합니다. 집중 시간만큼 구간을 이동하고, 도착하면 현재 위치부터 다음 항로를 고릅니다. 중단하면 지구로 돌아오며 도착·귀환 기록은 브라우저에 남습니다. [밸런스 v2](../design/freeze/balance/v2/README.md)
- `GET /api/voyages?pilotId=<uuid>&distanceLy=<광년>`은 앞선 조종사 수, 위치별 추월 지점과 본인 기록을 반환합니다. `POST /api/voyages`는 `pilotId`, `id`, `fromId`, `toId`, `elapsedMs`, `status`를 받습니다. 실제 항해 기록에서 조종사별 거리를 집계합니다.
- 로컬 서버는 `.focus-astro/` 아래에 기록을 저장합니다. Vercel에서는 서버 전용 토큰으로 프로젝트 전용 비공개 Blob에 연결합니다. [Vercel Blob 비공개 저장소](https://vercel.com/docs/vercel-blob/private-storage)

## 검증

- Codex CLI의 GPT-6.2 Sol로 원본 JPEG를 분석했습니다. 이전 PoC에서 Codex CLI로 만든 우주선과 아트를 재사용했습니다. 독립 에이전트가 Chrome 실행 화면을 원본 스케치와 UI v4 시안에 대조했습니다.
- `pocs/idle` 대기 모션, `setup-ui` 슬라이드, `voyage` 배경과 휴식 토글, `ui-v4`, `clone`, `mockup` 경로를 실제 실행했습니다. `voyage-time`의 단독 서버에서 밸런스 API 조회, 저장, 중복 및 오류 응답을 확인했습니다. 해당 PoC의 정적 미리보기에서는 밸런스 저장이 비활성화됩니다.
- 독립 Chrome 검증에서 목표 선택, 출항, 30/10분 경계, 휴식 중 거리 정지, 다음 집중 및 포커스 이탈, 추월과 카운트 감소, 도착 위치·기록 보존을 확인했습니다. 브라우저 시계로 긴 구간을 앞당겼습니다.
- .env의 현재 변수 이름을 확인한 뒤 Google·OpenAI·Vercel·Render API에 읽기 요청을 보내 모두 HTTP 200을 확인했습니다. 서비스는 별도 AI 분석 호출 없이 구동됩니다.

## 도구 적용

- Fluent Korean의 한국어 문장 지침과 No AI Slop의 문구 기준으로 화면과 개발 문서를 검토했습니다. [Fluent Korean](https://github.com/snflkd/fluent-korean) · [No AI Slop](https://github.com/petergyang/no-ai-slop)
- Ponytail 기준으로 포모도로와 경쟁 집계에 필요한 범위만 구현했고, 장면과 행성 원본은 기존 PoC에서 가져왔습니다. Hallmark 검토에서 버튼의 비활성 상태와 키보드 포커스를 확인했습니다. [Ponytail](https://github.com/DietrichGebert/ponytail) · [Hallmark](https://github.com/Nutlope/hallmark)
- Gauntlet Loop의 독립 비평 원칙으로 구현자와 브라우저 검증자를 분리했습니다. [Gauntlet Loop](https://github.com/robonuggets/gauntlet-loop)

## 남은 제약

- Claude CLI의 로그인은 만료됐습니다. `.env`의 API 키를 사용한 실제 호출은 2026년 12월 1일 00:00 UTC까지 공급사 사용량 한도에 걸렸습니다. Claude 모델의 독립 외형 검증은 이 때문에 미완료입니다.
- 저장소에 `POC.md`가 없어 `docs/prompts/POC_*.md`와 각 PoC의 README를 검증 기준으로 사용했습니다. `JEV_KEY`는 호출 대상과 계약을 문서에서 확인할 수 없었습니다.
