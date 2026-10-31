# P0.21 — 로컬 공식 양식 목차 후보 및 수동 대응

## 목적

P0.20은 사용자가 양식의 목차를 직접 복사해 입력했습니다.
P0.21은 **직접 다운로드한** PDF/HWPX/HWP 5.x에서 제목 후보만 찾아 개인 로컬 JSON으로 만듭니다.
파일 전체를 서버에 전송하거나 원본 첨부파일을 공개하지 않습니다.
운영시 모델·AI CLI·유료 API 호출이 없습니다.

- 첨부 문서 원본을 사용자가 직접 검토해야 합니다.
- 출력의 모든 항목은 candidate_unverified(미검증 후보).
- 출처는 self_supplied_unverified(사용자 기재·공식 진위 미검증).
- PDF 페이지의 텍스트 줄, HWPX 구역/문단, HWP 본문 레코드 위치를 기록합니다.
- 표·셀 병합·그림·OCR·서명·첨부 요건·공식 글자수·예외 조항까지 해석하지 못합니다.
- 개인정보·본문·문서 바이너리 전체는 후보 파일에 포함하지 않습니다.
- 등록·제출 가능이나 지원금 확보를 확정하지 않습니다.

## 실행 — Windows MSI

공식 공고의 **양식 파일을 직접 다운로드**한 후 다음 명령에서 실제 경로·공고 링크로 바꿔 실행하십시오.

    cd /d C:\Projects\AI_Startup_Funding_Public_2027
    .venv\Scripts\python.exe scripts\form_outline_cli.py ^
      --input "C:\Users\USER\Downloads\official_form.hwpx" ^
      --output "C:\Users\USER\Documents\form_candidates_2027.json" ^
      --source-url "https://www.bizinfo.go.kr/..." ^
      --label "다운로드한 공식 제출양식"

- 입력파일은 최대 8MB, PDF/HWPX/HWP 5.x만 지원하며 암호·DRM은 우회하지 않습니다.
- output은 **기존에 없는 .json 경로**, **공개 Git 프로젝트 바깥**이어야 합니다.
- source-url은 allowlist에 있는 공식 HTTPS 주소만 허용하되, 진위는 확인하지 않습니다.
- 원문·목차가 텍스트로 인식되지 않으면 후보 0개일 수 있으며 수동 입력해야 합니다.
- 접수기관에서 새 양식을 게시하면 다시 받아 지문·목차·양식 버전을 확인하십시오.

## 브라우저

1. 공식 양식 항목 대응 작업대에서 2A — 로컬 후보 JSON 선택.
2. 원문 파일·문서 SHA-256·제목 위치를 직접 대조.
3. 필요한 후보만 선택하고 **기존 항목 대응 초기화** 확인 상자를 체크.
4. 선택한 제목을 입력창에 복사. 이 동작도 공식 양식 승인·완료가 아닙니다.
5. 기존 사업계획서 v1/v2/v3 JSON을 불러오고 목차 분석, 수동 대응, TXT 저장.
6. 실제 접수기관의 표·순서·분량·서명을 공식 원본에 따라 최종 확인.

## 구현·보안

- 입력 8MB, 파서 프로세스 30초, 출력 최대 100KB. 기존 ZIP/XML/HWP/PDF bounded parser 재사용.
- 파일 네트워크 다운로드 없이 로컬 파일만 읽음. 임시 파일도 공개 저장소에 남기지 않음.
- 공개 웹은 CSP connect-src none/form-action none, 저장·쿠키·AI 호출 없음.
- P0.21 공개 배포에는 HTML/CSS/JS만 추가. 개인 후보 JSON 및 원본 첨부는 배포하지 않음.
- CLI 출력 JSON 스키마는 local-form-outline-candidates/v1, 전 항목 미검증.
- 회귀시험: Python test_form_outline.py, Node test_form_outline_import.cjs 및 기존 test_form_mapping.cjs.

## 실행 확인

    .venv\Scripts\python.exe -m unittest discover -s scripts -p test_form_outline.py -v
    node --test scripts\test_form_mapping.cjs scripts\test_form_outline_import.cjs
    .venv\Scripts\python.exe scripts\build_public.py
