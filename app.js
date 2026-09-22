/*
 * Asset Note
 * Copyright © 2026 cotmoool-dev. All rights reserved.
 *
 * This project is proprietary software.
 * Unauthorized copying, modification, redistribution, or commercial use is prohibited.
 */
/* 내 자산 — 개인 자산 포트폴리오 PWA
 * 모든 데이터는 이 기기 브라우저(localStorage)에만 저장됩니다. 서버 전송 없음.
 * 외부 호출(새로고침 버튼을 누를 때만): 국내·해외주식 시세(GitHub에 공개된 prices.json),
 *   코인 시세(CoinGecko), 금·그 밖의 해외 거래소 종목(Twelve Data), 환율(Frankfurter).
 */
'use strict';

/* ───────── 상수 ─────────
 * 테스트버전: Perplexity 리뷰 반영판. 실제 데이터와 분리하기 위해 저장 키를 다르게 씀.
 */
const STORE_KEY = 'myAssets.v4.test';
const APP_BUILD = 'v1.24.0'; // sw.js의 CACHE 버전과 항상 맞춰서 올릴 것 — 설정 화면에 그대로 노출해서, 실제 폰에 반영된 버전을 화면 캡처 하나로 바로 확인할 수 있게 함
const APP_VERSION_LABEL = '자산 일기 테스트판 · Perplexity 리뷰 반영';
/* 리밸런싱 세금·수수료 근사치(설정에서 조정 가능). 실제 세율은 보유기간·공제·상품에 따라 달라요. */
const DEFAULT_TAX_RATES = {
  '국내주식': 0.18 + 0.015, // 증권거래세 0.18% + 위탁수수료 근사 0.015%
  '해외주식': 22,           // 양도소득세 22%(지방세 포함, 연 250만원 기본공제는 미반영한 보수적 근사)
  '암호화폐': 0,            // 과세 시행 여부가 유동적 — 0으로 두고 안내 문구로 대체
  '채권·안전자산': 0.015,
  '연금·IRP': 0,
  '부동산': 0,
  '원자재': 0,              // 매도(현금화) 기준 근사. 실물(골드바 등) 인출 시 부가세 10%는 별도 — UI에 경고 문구로 안내
  '기타': 0
};
/* 목표 달성 시나리오 가정 연수익률(%). 실제 수익을 보장하지 않는 참고용 가정값. */
const SCENARIOS = [
  { key: 'cons', label: '보수', emo: '🐢', rate: 3 },
  { key: 'base', label: '기준', emo: '🚶', rate: 6 },
  { key: 'agg', label: '공격', emo: '🐇', rate: 9 }
];
const TX_REASONS = ['적립식 매수', '리밸런싱', '목표 달성', '손절', '차익실현', '이벤트 대응'];
const CATS = ['현금성자산', '국내주식', '해외주식', '채권·안전자산', '연금·IRP', '부동산', '암호화폐', '원자재', '기타'];
const CAT_COLORS = ['#8fd3b0', '#ff9fb4', '#86c0f2', '#d3b58e', '#b79cf2', '#ffb07f', '#f7cf4d', '#e0c473', '#c3c9d1'];
const CAT_EMO = { '현금성자산': '🏦', '국내주식': '🇰🇷', '해외주식': '🌏', '채권·안전자산': '🛡️', '연금·IRP': '🌱', '부동산': '🏠', '암호화폐': '🪙', '원자재': '🥇', '기타': '🎁' };
const PURPOSE_EMO = { '주거자금': '🏡', '사업자금': '💼', '연금': '👵', '비상금': '☂️', '기타': '🎈' };
const TX_EMO = { buy: '🛒', sell: '💸', div: '🍯' };

/* ───────── 누적 수익률 상태 안내 (자산 신호등형) ─────────
 * 판정은 returnStatusKey() 한 곳에서만 하고, 캐릭터 에셋·상태 문구·배지 색상·상세 설명은 RETURN_STATUS 설정 객체에서만 관리해요.
 * 캐릭터 원래 색은 그대로 두고, 상태 의미는 배지의 배경·테두리·글자색(styles.css의 --rs-* 토큰, 다크 모드 값 따로 있음)으로만 구분해요. */
const RETURN_STATUS = {
  growth: {
    label: '성장 흐름', range: '+5% 이상',
    img: 'mood-growth.png', alt: '두 팔을 들고 축하하는 핑크 캐릭터',
    tone: { bg: 'var(--rs-growth-bg)', fg: 'var(--rs-growth-fg)', line: 'var(--rs-growth-line)' },
    desc: '누적 수익률이 +5% 이상입니다. 현재 포트폴리오가 긍정적인 성과 흐름을 보이고 있습니다. 다만 수익 확대에 따라 특정 자산의 비중이 목표 범위를 벗어나지 않았는지 확인해 보세요.',
    points: '목표 자산배분, 자산별 비중 쏠림, 실현·미실현 수익'
  },
  stable: {
    label: '안정 구간', range: '0% 이상 ~ +5% 미만',
    img: 'mood-stable.png', alt: '눈을 감고 편안하게 웃는 피치색 캐릭터',
    tone: { bg: 'var(--rs-stable-bg)', fg: 'var(--rs-stable-fg)', line: 'var(--rs-stable-line)' },
    desc: '누적 수익률이 0% 이상, +5% 미만입니다. 자산은 플러스 흐름을 유지하고 있으나 시장 변동에 따라 결과가 달라질 수 있는 구간입니다.',
    points: '목표 수익률과의 차이, 정기 투자 계획, 리밸런싱 필요 여부'
  },
  check: {
    label: '점검 구간', range: '-5% 초과 ~ 0% 미만',
    img: 'mood-check.png', alt: '손을 모으고 땀을 흘리며 고민하는 회청색 캐릭터',
    tone: { bg: 'var(--rs-check-bg)', fg: 'var(--rs-check-fg)', line: 'var(--rs-check-line)' },
    desc: '누적 수익률이 0% 미만, -5% 초과입니다. 단기 변동일 수 있으므로 성급한 대응보다 투자 기간, 매수 단가, 자산별 비중을 확인해 보세요.',
    points: '시장 전반 하락 여부, 자산별 손실 원인, 투자 기간과 목표'
  },
  manage: {
    label: '관리 필요', range: '-5% 이하',
    img: 'mood-manage.png', alt: '눈물을 흘리며 스스로를 감싸 안는 블루 캐릭터',
    tone: { bg: 'var(--rs-manage-bg)', fg: 'var(--rs-manage-fg)', line: 'var(--rs-manage-line)' },
    desc: '누적 수익률이 -5% 이하입니다. 손실 자체보다 원인을 구분하는 것이 우선입니다. 시장 전반 하락인지, 특정 자산의 이슈인지, 목표 비중이 달라졌는지 점검해 보세요.',
    points: '손실 기여 자산, 투자 가설의 유효성, 리밸런싱 또는 대응 기준'
  }
};
const RETURN_STATUS_PENDING = { label: '수익률 산정 중', guide: '수익률 데이터가 준비되면 현재 구간 안내를 확인할 수 있습니다.' };
/* 화면에 보이는 소수 둘째 자리 값으로 판정해서, "+5.00%"로 보이는데 "안정 구간"이 뜨는 식의 어긋남이 없게 함 */
function roundReturnPct(pct) { return (typeof pct === 'number' && isFinite(pct)) ? Math.round(pct * 100) / 100 + 0 : null; }
function returnStatusKey(pct) {
  const p = roundReturnPct(pct);
  if (p === null) return null;          // 데이터 없음 → 상태를 임의로 정하지 않음
  if (p >= 5) return 'growth';          // +5.00% 포함
  if (p >= 0) return 'stable';          // 0.00% 포함
  if (p > -5) return 'check';           // -5.00%는 제외
  return 'manage';                      // -5.00% 포함
}
const STATUS_EMO = { ok: '😊', low: '🥺', high: '😮', empty: '🌱' };
const MOODS = ['😆', '🙂', '😐', '😟', '😭'];
const PURPOSES = ['주거자금', '사업자금', '연금', '비상금', '기타'];
/* 코인 이름 → CoinGecko ID 자동 매칭용 목록 (자주 쓰는 코인 위주, 목록에 없으면 ID를 직접 입력해도 됨) */
const COINGECKO_COINS = [
  ['bitcoin', '비트코인 (BTC)'], ['ethereum', '이더리움 (ETH)'], ['ripple', '리플 (XRP)'],
  ['tether', '테더 (USDT)'], ['binancecoin', '바이낸스코인 (BNB)'], ['solana', '솔라나 (SOL)'],
  ['usd-coin', '유에스디코인 (USDC)'], ['dogecoin', '도지코인 (DOGE)'], ['cardano', '에이다 (ADA)'],
  ['tron', '트론 (TRX)'], ['avalanche-2', '아발란체 (AVAX)'], ['chainlink', '체인링크 (LINK)'],
  ['polkadot', '폴카닷 (DOT)'], ['litecoin', '라이트코인 (LTC)'], ['sui', '수이 (SUI)'],
  ['near', '니어 (NEAR)'], ['stellar', '스텔라루멘 (XLM)'], ['aptos', '앱토스 (APT)']
];
const DEFAULT_TARGETS = { '현금성자산': 8, '국내주식': 19, '해외주식': 32, '채권·안전자산': 5, '연금·IRP': 14, '부동산': 10, '암호화폐': 7, '원자재': 5, '기타': 0 };
/* 국내주식·해외주식의 섹터·국가 구성 보기용. 섹터는 GICS(글로벌 산업 분류 기준) 11개 섹터를 우리말로 옮기고, 지수형·채권형 ETF처럼 한 섹터로 못 묶는 것들을 위한 항목을 더했어요(설정 화면에 이 기준을 안내해요). */
const SECTORS = ['정보기술', '금융', '헬스케어', '산업재', '임의소비재', '필수소비재', '에너지', '소재', '유틸리티', '부동산', '통신서비스', '지수형 ETF(혼합)', '채권형 ETF', '기타'];
const COUNTRIES = ['한국', '미국', '중국', '일본', '유럽', '신흥국', '글로벌(전세계)', '기타'];
/* 원자재 세부 종류(요구사항 #7) — 원자재 카테고리는 원래 금 전용이었어서, 값이 없는 기존/신규 자산은 normAsset()에서 '금'으로 기본 처리함 */
const COMMODITY_TYPES = ['금', '은', '원유', '기타원자재'];
/* 잘 알려진 종목의 섹터·국가 기본값 — 종목명(한글) 또는 티커(영문 대문자)로 찾아요. 여기 없는 종목은 사용자가 고른 값을 기억해서 다음부터 자동으로 채워요(설정에 저장). */
const STOCK_META = {
  '삼성전자': { sector: '정보기술', country: '한국' }, 'SK하이닉스': { sector: '정보기술', country: '한국' },
  '삼성바이오로직스': { sector: '헬스케어', country: '한국' }, 'LG에너지솔루션': { sector: '산업재', country: '한국' },
  '현대차': { sector: '임의소비재', country: '한국' }, '기아': { sector: '임의소비재', country: '한국' },
  'NAVER': { sector: '통신서비스', country: '한국' }, '네이버': { sector: '통신서비스', country: '한국' },
  '카카오': { sector: '통신서비스', country: '한국' }, 'POSCO홀딩스': { sector: '소재', country: '한국' },
  'KB금융': { sector: '금융', country: '한국' }, '신한지주': { sector: '금융', country: '한국' },
  '삼성SDI': { sector: '산업재', country: '한국' }, '셀트리온': { sector: '헬스케어', country: '한국' },
  'VOO': { sector: '지수형 ETF(혼합)', country: '미국' }, 'SPY': { sector: '지수형 ETF(혼합)', country: '미국' },
  'IVV': { sector: '지수형 ETF(혼합)', country: '미국' }, 'QQQ': { sector: '지수형 ETF(혼합)', country: '미국' },
  'VTI': { sector: '지수형 ETF(혼합)', country: '미국' }, 'VT': { sector: '지수형 ETF(혼합)', country: '글로벌(전세계)' },
  'SCHD': { sector: '지수형 ETF(혼합)', country: '미국' }, 'AGG': { sector: '채권형 ETF', country: '미국' },
  'BND': { sector: '채권형 ETF', country: '미국' }, 'TLT': { sector: '채권형 ETF', country: '미국' },
  'AAPL': { sector: '정보기술', country: '미국' }, '애플': { sector: '정보기술', country: '미국' },
  'MSFT': { sector: '정보기술', country: '미국' }, '마이크로소프트': { sector: '정보기술', country: '미국' },
  'GOOGL': { sector: '통신서비스', country: '미국' }, 'GOOG': { sector: '통신서비스', country: '미국' },
  'AMZN': { sector: '임의소비재', country: '미국' }, '아마존': { sector: '임의소비재', country: '미국' },
  'NVDA': { sector: '정보기술', country: '미국' }, '엔비디아': { sector: '정보기술', country: '미국' },
  'TSLA': { sector: '임의소비재', country: '미국' }, '테슬라': { sector: '임의소비재', country: '미국' },
  'META': { sector: '통신서비스', country: '미국' }, 'JPM': { sector: '금융', country: '미국' },
  'JNJ': { sector: '헬스케어', country: '미국' }, 'XOM': { sector: '에너지', country: '미국' }
};
/* 종목명·티커로 섹터·국가 기본값을 찾음: 내장 매핑 → 이전에 사용자가 직접 골라둔 값(설정에 저장) 순으로 확인 */
function lookupStockMeta(name, symbol) {
  const keys = [String(symbol || '').trim().toUpperCase(), String(name || '').trim()].filter(Boolean);
  for (const k of keys) { if (STOCK_META[k]) return STOCK_META[k]; }
  const learned = S.settings.stockMeta || {};
  for (const k of keys) { if (learned[k]) return learned[k]; }
  return null;
}
/* 사용자가 직접 고른 섹터·국가를 종목명·티커로 기억해뒀다가, 같은 종목을 다시 등록할 때 자동으로 채워줌 */
function rememberStockMeta(name, symbol, sector, country) {
  if (!sector && !country) return;
  const key = String(name || '').trim() || String(symbol || '').trim().toUpperCase();
  if (!key) return;
  S.settings.stockMeta = S.settings.stockMeta || {};
  S.settings.stockMeta[key] = { sector: sector || '', country: country || '' };
}
/* ───────── 연금·IRP 구성 분석용 상수 ─────────
 * ETF·TDF·펀드 등은 기초자산의 국가·섹터를 신뢰성 있게 나누기 어려워 '상품유형별' 탭을 별도로 둠(요구사항 #7).
 * 국가 비중은 상장국이 아니라 기초자산·주요 투자대상 국가 기준(요구사항 #8) — 화면에도 그 기준을 짧게 안내함. */
const PENSION_CLASS = ['주식형', '채권·안전자산', '현금성 자산', '대체자산'];
const PENSION_COUNTRIES = ['미국', '한국', '선진국', '신흥국', '기타'];
const PENSION_SECTORS = ['정보기술', '금융', '헬스케어', '산업재', '기타'];
const PENSION_PRODUCT_TYPES = ['미국주식 ETF', '국내주식 ETF', '글로벌 채권 ETF', 'TDF', '대기자금'];
/* 이름에 자주 나오는 키워드로 상품유형을 추정 — 근거가 없으면 절대 임의로 정하지 않고 null(→ '미분류') */
function guessPensionProduct(name) {
  const n = String(name || '').toUpperCase();
  if (!n) return null;
  if (n.includes('TDF')) return 'TDF';
  if (n.includes('MMF') || n.includes('대기') || n.includes('파킹')) return '대기자금';
  const isEtf = n.includes('ETF');
  if (n.includes('채권') || n.includes('BOND') || n.includes('AGG') || n.includes('BND')) {
    if (n.includes('글로벌') || n.includes('GLOBAL') || n.includes('AGG') || n.includes('BND')) return '글로벌 채권 ETF';
  }
  if (isEtf) {
    if (n.includes('S&P') || n.includes('SP500') || n.includes('나스닥') || n.includes('NASDAQ') || n.includes('미국')) return '미국주식 ETF';
    if (n.includes('KOSPI') || n.includes('코스피') || n.includes('국내')) return '국내주식 ETF';
  }
  return null;
}
/* ───────── 계좌 관리 상수 (테스트버전 신규) ─────────
 * 자산군(CATS)과 계좌는 서로 다른 개념 — 계좌 대분류/유형은 여기서 독립적으로 관리하고, 자산의 cat과 절대 서로 자동 연동하지 않음. */
const ACCOUNT_CLASSES = ['일반 투자', '절세 투자', '연금·퇴직연금', '현금·예금', '예금·적금', '원자재·실물', '가상자산'];
const ACCOUNT_TYPES_BY_CLASS = {
  '일반 투자': ['일반 위탁계좌', '해외주식계좌', 'CMA 투자계좌'],
  '절세 투자': ['ISA 중개형', 'ISA 신탁형', 'ISA 일임형'],
  '연금·퇴직연금': ['연금저축펀드', '연금저축보험', '개인형 IRP', 'DC형 퇴직연금', 'DB형 퇴직연금', '퇴직금 IRP'],
  '현금·예금': ['입출금통장', '파킹통장', 'CMA', '외화예금'],
  '예금·적금': ['정기예금', '정기적금', '청년도약계좌', '청약통장'],
  '원자재·실물': ['KRX 금 계좌', '골드뱅킹', '금 통장'],
  '가상자산': ['거래소 계정', '개인지갑', '콜드월렛']
};
const ACCOUNT_STATUS = ['사용 중', '해지', '이전 완료', '만기'];
const ACCOUNT_FILTERS = ['전체', '일반 투자', 'ISA', '연금', '현금·예금'];
/* DB형 퇴직연금 계좌는 종목을 보유하지 않고 기준일 평가액/예상 퇴직금만 기록함 — 자산 연결 대상에서 제외(요구사항 #13) */
function isDbPensionAccount(acc) { return !!acc && acc.cls === '연금·퇴직연금' && acc.type === 'DB형 퇴직연금'; }
function accountFilterMatch(acc, filter) {
  if (!filter || filter === '전체') return true;
  if (filter === '일반 투자') return acc.cls === '일반 투자';
  if (filter === 'ISA') return (acc.type || '').includes('ISA');
  if (filter === '연금') return acc.cls === '연금·퇴직연금';
  if (filter === '현금·예금') return acc.cls === '현금·예금' || acc.cls === '예금·적금';
  return true;
}
/* 분류(라벨)마다 항상 같은 색을 쓰기 위한 고정 매핑 — 여기 없는 라벨(기타 국가·섹터 등)은 SUBCHART_COLORS를 순서대로 돌려씀(요구사항 #10) */
const COMP_LABEL_COLOR = {
  '미국': '#2f6fed',           // 블루
  '한국': '#e2572b',           // 레드·오렌지
  '채권·안전자산': '#5b6b82',  // 네이비·그레이
  '현금성 자산': '#3fae6a',    // 그린
  '미분류': '#9aa3af',         // 그레이
  '기타': '#c9ced6',           // 연한 그레이
};
/* 계좌 통화 라벨 — 개별 계좌 선택 시 헤더 카드의 "기본 통화"(요구사항 #9)에 씀 */
function curLabel(cur) { return cur === 'USD' ? '달러' : '원화'; }
/* 계좌 라벨 — 기관명이 있으면 "기관명 별칭", 없으면 별칭만. 계좌 미연결이면 null(→ 미분류 버킷, 별도 라벨 없이 기존 메커니즘 재사용) */
function accountLabelOf(a) {
  const acc = S.accounts.find(x => x.id === a.accountId);
  return acc ? (acc.institution ? acc.institution + ' ' + acc.alias : acc.alias) : null;
}
/* "자산군" 화면(요구사항 #5) 전용 고정 색상 — COMP_LABEL_COLOR(국가·섹터용)와는 다른 분류 체계라 섞지 않음. 채권·안전자산은 텍스트가 같아 기존 색을 그대로 재사용 */
const ASSET_CLASS_COLOR = {
  '주식·주식형 ETF': '#ff8fa3',
  '연금·퇴직연금': '#7fb88a',
  '채권·안전자산': COMP_LABEL_COLOR['채권·안전자산'],
  '원자재·금': '#e0b34d',
  '암호화폐': '#c79ef2',
  '현금성 투자대기자금': COMP_LABEL_COLOR['현금성 자산'],
  '기타 투자자산': '#c9ced6',
};
/* 자산군별 비중(요구사항 D) — buildCompositionRows의 groupKeyFn 방식이 아니라 직접 계산함(버킷마다 서로 겹치는 카테고리 조각을 끌어와야 해서).
 * 연금·IRP 중 주식형(penClass==='주식형')은 "주식·주식형 ETF"에만 넣고 "연금·퇴직연금"에서는 빼서 이중집계를 막음.
 * list/dbAccounts는 이미 "분석 대상" 스코프로 좁혀진 값을 받는다(scopedPortfolioAssets/portfolioScopeDbAccounts 호출부 참고). */
function portfolioAssetClassRows(list, dbAccounts) {
  const stockEquity = a => a.cat === '국내주식' || a.cat === '해외주식' || (a.cat === '연금·IRP' && a.penClass === '주식형');
  const sum = f => list.filter(f).reduce((s, a) => s + valueOf(a), 0);
  const pensionRemainder = sum(a => a.cat === '연금·IRP' && a.penClass !== '주식형')
    + dbAccounts.filter(a => a.dbIncludeAnalysis).reduce((s, a) => s + a.dbValuation, 0);
  return [
    { label: '주식·주식형 ETF', value: sum(stockEquity) },
    { label: '연금·퇴직연금', value: pensionRemainder },
    { label: '채권·안전자산', value: sum(a => a.cat === '채권·안전자산') },
    { label: '원자재·금', value: sum(a => a.cat === '원자재') },
    { label: '암호화폐', value: sum(a => a.cat === '암호화폐') },
    { label: '현금성 투자대기자금', value: sum(a => a.cat === '현금성자산') },
    { label: '기타 투자자산', value: sum(a => a.cat === '기타') },
  ].filter(r => r.value > 0);
}
/* 투자 포트폴리오 "분석 대상" 범위 선택(요구사항 #4~#6). key는 <select>의 value로 그대로 씀 */
const PORTFOLIO_SCOPE_GROUPS = [
  { key: 'all', label: '전체 투자자산', match: () => true },
  { key: 'general', label: '일반 위탁계좌 전체', match: acc => acc.cls === '일반 투자' },
  { key: 'isa', label: 'ISA 전체', match: acc => acc.cls === '절세 투자' },
  { key: 'pension-savings', label: '연금저축 전체', match: acc => ['연금저축펀드', '연금저축보험'].includes(acc.type) },
  { key: 'irp', label: 'IRP 전체', match: acc => ['개인형 IRP', '퇴직금 IRP'].includes(acc.type) },
  { key: 'pension-all', label: '연금·퇴직연금 전체', match: acc => acc.cls === '연금·퇴직연금' },
  { key: 'commodity-acct', label: '원자재·금 계좌 전체', match: acc => acc.cls === '원자재·실물' },
  { key: 'crypto-acct', label: '가상자산 거래소·지갑 전체', match: acc => acc.cls === '가상자산' },
];
function portfolioScopeGroup(key) { return PORTFOLIO_SCOPE_GROUPS.find(g => g.key === key) || PORTFOLIO_SCOPE_GROUPS[0]; }
/* 스코프에 해당하는 "실제"(DB 아닌) 계좌들 — 빈 상태 판정(요구사항 #11)과 자산 필터링에 씀 */
function portfolioScopeAccounts(scope) {
  if (scope.kind === 'account') { const acc = S.accounts.find(x => x.id === scope.id); return (acc && !isDbPensionAccount(acc)) ? [acc] : []; }
  const group = portfolioScopeGroup(scope.key);
  return S.accounts.filter(acc => !isDbPensionAccount(acc) && group.match(acc));
}
/* 스코프에 해당하는 DB형 퇴직연금 계좌 — 종목 분석엔 안 넣고 별도 요약 카드로만 보여줌(요구사항 #10) */
function portfolioScopeDbAccounts(scope) {
  if (scope.kind === 'account') { const acc = S.accounts.find(x => x.id === scope.id); return (acc && isDbPensionAccount(acc)) ? [acc] : []; }
  const group = portfolioScopeGroup(scope.key);
  return dbPensionAccounts().filter(group.match);
}
/* 스코프로 좁힌 실제 보유자산 목록(요구사항 #7·#12) — 'all'이면 전체, 아니면 해당 계좌들에 연결된 것만 */
function scopedPortfolioAssets(scope) {
  const pa = portfolioAssets();
  if (scope.kind === 'group' && scope.key === 'all') return pa;
  const ids = new Set(portfolioScopeAccounts(scope).map(a => a.id));
  return pa.filter(a => ids.has(a.accountId));
}
/* 투자 포트폴리오 4개 분석 탭(요구사항 #8) — 배열 순서가 탭 표시 순서, 첫 항목이 기본 탭 */
const PORTFOLIO_TABS = [
  { key: 'class', label: '자산군', emo: '🧭' },
  { key: 'country', label: '국가·지역', emo: '🌍' },
  { key: 'sector', label: '섹터', emo: '🏷️' },
  { key: 'item', label: '종목', emo: '💼' },
];
/* "종목" 탭 그룹핑(요구사항 F) — 원자재는 commodityType(금/은/원유 등)으로, 그 밖엔 종목명으로 묶음 */
function itemGroupKey(a) { return (a.cat === '원자재' ? a.commodityType : a.name) || null; }
const TX_TYPES = { buy: '매수', sell: '매도', div: '배당' };
const TITLES = { home: '자산 일기', assets: '내 보물함', book: '가계부', tx: '거래 일기', rebal: '균형 맞추기', settings: '설정' };
const BOOK = {
  income: { label: '수입', emo: '💵', color: '#8fd3b0', cats: [['급여', '💼'], ['부수입', '🎁'], ['이자수입(예금·적금)', '🏦'], ['기타수입', '➕']] },
  fixed: { label: '고정비', emo: '🧾', color: '#86c0f2', cats: [['주거·관리비', '🏠'], ['통신', '📱'], ['보험', '🛡️'], ['구독', '📺'], ['대출상환', '🏦'], ['교통정기', '🚌'], ['가족·용돈', '👨‍👩‍👧'], ['기타고정', '📌']] },
  variable: { label: '변동비', emo: '🛍️', color: '#ff9fb4', cats: [['식비', '🍚'], ['카페·간식', '☕'], ['쇼핑', '🛍️'], ['교통', '🚕'], ['문화·여가', '🎬'], ['의료', '💊'], ['경조사', '💐'], ['생활용품', '🧴'], ['기타변동', '📌']] },
  saving: { label: '저축·투자', emo: '🐷', color: '#f7cf4d', cats: [['적금', '🐷'], ['투자', '📈'], ['연금', '🌱'], ['비상금', '☂️']] }
};
const GROUPS = ['income', 'fixed', 'variable', 'saving'];
/* 예금·적금·파킹통장 이자는 가계부에서, 주식·ETF 등 투자자산 배당은 거래일기에서만 기록해요(이중집계 방지) */
const BOOK_INTEREST_CAT = '이자수입(예금·적금)';
function bookEmo(g, c) { const f = (BOOK[g] || BOOK.variable).cats.find(x => x[0] === c); return f ? f[1] : BOOK[g].emo; }
const TAX = { normal: ['일반과세 15.4%', 0.154], pref: ['세금우대 9.5%', 0.095], free: ['비과세 0%', 0] };
const DEFAULT_MODEL = 'claude-sonnet-5';

/* 주의: 아래 목표 아이콘 상수는 load()→migrate()→normGoal()에서 쓰이므로 반드시 `let S = load()`보다 위에 있어야 함(const 선언 전 접근 시 오류 → 저장된 데이터가 빈 화면으로 보이던 문제) */
/* 목표 유형(목적 태그)별 기본 아이콘 — 새 목표를 만들 때 이 기본값이 먼저 선택되고, 목표 화면에서 다른 아이콘으로 바꿀 수 있어요 */
const GOAL_DEFAULT_ICON = { '주거자금': '🏠', '사업자금': '💼', '연금': '🌱', '비상금': '☂️', '기타': '🎯' };
const GOAL_ICONS = ['🏠', '🌱', '☂️', '🎯', '💼', '🎓', '✈️', '🚗', '💍', '👶', '🐾', '🎁'];
function goalIcon(g) { return (g && g.icon) || GOAL_DEFAULT_ICON[g && g.purpose] || '🎯'; }
/* ───────── 상태 ───────── */
function defaultState() {
  return {
    v: 4,
    assets: [],
    accounts: [],
    txs: [],
    snapshots: [],
    book: { entries: [], recurring: [], budget: 0 },
    settings: {
      targets: { ...DEFAULT_TARGETS },
      band: 3,
      goals: [],
      taxRates: { ...DEFAULT_TAX_RATES },
      targetReturnRate: 0,
      twelveKey: '',
      claudeKey: '',
      claudeModel: DEFAULT_MODEL,
      theme: 'system',
      fxManual: 0,
      lastBackup: '',
      priceRefreshedAt: 0,
      lock: { enabled: false, pinHash: '', salt: '' },
      stockMeta: {},
      institutions: [],
      recentInstitutions: [],
      recentAccountIds: []
    },
    fx: { USD: 0, at: '' }
  };
}

let S = load();
let ui = { tab: 'home', txFilter: 'all', open: {}, tradeHist: {}, rebalMode: 'add', extra: 0, bookMonth: '', perfPeriod: 'month', gapRelative: false, returnGuideOpen: false, assetsTab: 'holdings', accountFilter: '전체', holdingGroupOpen: {}, acctOpen: {}, portfolioScope: { kind: 'group', key: 'all' }, portfolioTabKey: 'class' };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    /* 안전장치: 저장 데이터를 읽다가 오류가 나면, 빈 상태로 덮어쓰기 전에 원본을 별도 키에 보관해 둠 */
    try { const r0 = localStorage.getItem(STORE_KEY); if (r0) localStorage.setItem(STORE_KEY + '.recovery', r0); } catch (e2) {}
    return defaultState();
  }
}
function migrate(d) {
  const base = defaultState();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) }, fx: { ...base.fx, ...(d.fx || {}) } };
  // 분류명 변경: '현금·예금' → '현금성자산' (기존 데이터가 새 분류표에서 사라지지 않도록 값을 옮겨줌)
  if (out.settings.targets && out.settings.targets['현금·예금'] != null) {
    if (out.settings.targets['현금성자산'] == null) out.settings.targets['현금성자산'] = out.settings.targets['현금·예금'];
    delete out.settings.targets['현금·예금'];
  }
  if (out.settings.taxRates && out.settings.taxRates['현금·예금'] != null) delete out.settings.taxRates['현금·예금'];
  if (Array.isArray(out.settings.goals)) out.settings.goals.forEach(g => { if (g && Array.isArray(g.cats)) g.cats = g.cats.map(c => c === '현금·예금' ? '현금성자산' : c); });
  if (Array.isArray(out.assets)) out.assets.forEach(a => { if (a && a.cat === '현금·예금') a.cat = '현금성자산'; });
  out.settings.targets = { ...DEFAULT_TARGETS, ...(out.settings.targets || {}) };
  out.settings.taxRates = { ...DEFAULT_TAX_RATES, ...(out.settings.taxRates || {}) };
  out.settings.lock = { ...base.settings.lock, ...(out.settings.lock || {}) };
  delete out.settings.lock.webauthnId; // 생체인증 기능 제거: 예전에 등록됐던 credential 값이 남아있어도 더 이상 저장·참조하지 않음
  // 옛 단일 목표(goal) → 복수 목표(goals) 배열로 이전
  out.settings.goals = Array.isArray(out.settings.goals) ? out.settings.goals.map(normGoal) : [];
  if (!out.settings.goals.length && d.settings && d.settings.goal && num(d.settings.goal.amount) > 0) {
    out.settings.goals = [normGoal({ ...d.settings.goal, priority: 1 })];
  }
  delete out.settings.goal;
  out.assets = (out.assets || []).map(normAsset);
  out.accounts = (out.accounts || []).map(normAccount);
  out.settings.institutions = Array.isArray(out.settings.institutions) ? out.settings.institutions : [];
  out.settings.recentInstitutions = Array.isArray(out.settings.recentInstitutions) ? out.settings.recentInstitutions : [];
  out.settings.recentAccountIds = Array.isArray(out.settings.recentAccountIds) ? out.settings.recentAccountIds : [];
  out.txs = Array.isArray(out.txs) ? out.txs.map(normTx) : [];
  out.snapshots = Array.isArray(out.snapshots) ? out.snapshots : [];
  out.book = { ...base.book, ...(d.book || {}) };
  out.book.entries = Array.isArray(out.book.entries) ? out.book.entries : [];
  out.book.recurring = Array.isArray(out.book.recurring) ? out.book.recurring : [];
  // 가계부 "금융소득" 분류명 변경: 배당(거래일기 전용)과 헷갈리지 않도록 '이자수입(예금·적금)'으로 이름을 바꿈 (기존 기록은 그대로 유지)
  out.book.entries.forEach(e => { if (e && e.group === 'income' && e.cat === '금융소득') e.cat = BOOK_INTEREST_CAT; });
  out.book.recurring.forEach(rc => { if (rc && rc.group === 'income' && rc.cat === '금융소득') rc.cat = BOOK_INTEREST_CAT; });
  if (!out.settings.claudeModel) out.settings.claudeModel = DEFAULT_MODEL;
  out.v = 4;
  return out;
}
function normGoal(g) {
  g = g || {};
  return {
    id: g.id || uid(),
    name: g.name || '목표',
    purpose: PURPOSES.includes(g.purpose) ? g.purpose : '기타',
    icon: GOAL_ICONS.includes(g.icon) ? g.icon : '',
    cats: Array.isArray(g.cats) ? g.cats.filter(c => CATS.includes(c)) : [],
    date: g.date || '',
    amount: num(g.amount),
    monthly: num(g.monthly),
    priority: num(g.priority) || 1
  };
}
function normTx(t) {
  return {
    ...t,
    reason: TX_REASONS.includes(t.reason) ? t.reason : '',
    thesis: t.thesis || '',
    sellRule: t.sellRule || '',
    conviction: t.conviction ? Math.max(1, Math.min(5, num(t.conviction))) : 0,
    horizon: t.horizon || '',
    reinvestDiv: !!t.reinvestDiv,
    retro: Array.isArray(t.retro) ? t.retro : []
  };
}
function normAsset(a) {
  return {
    id: a.id || uid(), name: a.name || '이름 없음',
    cat: CATS.includes(a.cat) ? a.cat : '기타',
    purpose: PURPOSES.includes(a.purpose) ? a.purpose : '기타',
    mode: a.mode === 'qty' ? 'qty' : 'amount',
    qty: num(a.qty), price: num(a.price), avgCost: num(a.avgCost), cur: a.cur === 'USD' ? 'USD' : 'KRW',
    amount: num(a.amount), cost: a.cost === '' || a.cost == null ? null : num(a.cost),
    src: ['manual', 'coingecko', 'twelvedata'].includes(a.src) ? a.src : 'manual',
    symbol: a.symbol || '', priceAt: a.priceAt || '', updatedAt: a.updatedAt || '',
    payCount: a.payCount === '' || a.payCount == null ? null : num(a.payCount),
    isResidence: !!a.isResidence,
    fxExposure: ['exposed', 'hedged'].includes(a.fxExposure) ? a.fxExposure : '',
    sector: SECTORS.includes(a.sector) ? a.sector : '',
    country: COUNTRIES.includes(a.country) ? a.country : '',
    penClass: PENSION_CLASS.includes(a.penClass) ? a.penClass : '',
    penCountry: PENSION_COUNTRIES.includes(a.penCountry) ? a.penCountry : '',
    penSector: PENSION_SECTORS.includes(a.penSector) ? a.penSector : '',
    penProduct: PENSION_PRODUCT_TYPES.includes(a.penProduct) ? a.penProduct : '',
    penProductEstimated: !!a.penProductEstimated && PENSION_PRODUCT_TYPES.includes(a.penProduct),
    components: Array.isArray(a.components) ? a.components.map(c => ({ name: c.name || '', pct: num(c.pct) })) : [],
    memo: a.memo || '',
    dep: normDep(a.dep),
    accountId: a.accountId || '',
    // 원자재 세부 종류(요구사항 #7) — 값이 없으면 원자재 카테고리는 '금'으로 기본 처리(원래 금 전용이었던 자산이 미분류로 빠지지 않게)
    commodityType: COMMODITY_TYPES.includes(a.commodityType) ? a.commodityType : (a.cat === '원자재' ? '금' : ''),
    // 투자 포트폴리오 분석 포함 여부 — '기타' 카테고리에서만 폼에 노출·설정되고, 기본값은 제외(요구사항 #9)
    portfolioInclude: !!a.portfolioInclude
  };
}
/* 계좌(요구사항 #2~#8, #13) — 대분류·유형은 ACCOUNT_CLASSES/ACCOUNT_TYPES_BY_CLASS만 신뢰, 목록에 없으면 대분류의 첫 유형으로 되돌림 */
function normAccount(acc) {
  acc = acc || {};
  const cls = ACCOUNT_CLASSES.includes(acc.cls) ? acc.cls : ACCOUNT_CLASSES[0];
  const types = ACCOUNT_TYPES_BY_CLASS[cls] || [];
  const type = types.includes(acc.type) ? acc.type : (types[0] || '');
  return {
    id: acc.id || uid(),
    alias: acc.alias || '이름 없는 계좌',
    cls, type,
    institution: acc.institution || '',
    currency: acc.currency === 'USD' ? 'USD' : 'KRW',
    status: ACCOUNT_STATUS.includes(acc.status) ? acc.status : '사용 중',
    last4: String(acc.last4 || '').replace(/\D/g, '').slice(0, 4),
    note: acc.note || '',
    createdAt: acc.createdAt || nowStamp(),
    updatedAt: acc.updatedAt || '',
    // DB형 퇴직연금 전용 — 종목 없이 기준일 평가액/예상 퇴직금만 기록(요구사항 #13)
    dbAsOf: acc.dbAsOf || '',
    dbValuation: num(acc.dbValuation),
    dbExpected: num(acc.dbExpected),
    dbIncludeNetWorth: acc.dbIncludeNetWorth == null ? true : !!acc.dbIncludeNetWorth,
    dbIncludeAnalysis: !!acc.dbIncludeAnalysis
  };
}
function normDep(d) {
  d = d || {};
  return {
    kind: ['deposit', 'saving'].includes(d.kind) ? d.kind : 'none',
    rate: num(d.rate), start: d.start || '', end: d.end || '',
    principal: num(d.principal), monthly: num(d.monthly),
    manualPaid: d.manualPaid === '' || d.manualPaid == null ? null : num(d.manualPaid),
    interest: d.interest === 'compound' ? 'compound' : 'simple',
    tax: ['normal', 'pref', 'free'].includes(d.tax) ? d.tax : 'normal'
  };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { toast('저장 실패: 저장 공간을 확인하세요'); }
}

/* ───────── 금융기관 중복 방지(요구사항 #7) ─────────
 * 공백을 정리한 뒤 대소문자 구분 없이 완전히 같은 문자열이면 기존 등록값을 그대로 재사용해서
 * "국민은행 "과 "국민은행"이 따로 중복 생성되지 않게 함. "한국투자"/"한국투자증권"처럼 서로 다른
 * 문자열이지만 한쪽이 다른 쪽을 포함하는 경우는 institutionSuggestion()에서 별도로 안내함(강제 아님). */
function normInstitutionInput(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
function canonicalInstitution(input) {
  const norm = normInstitutionInput(input);
  if (!norm) return '';
  const hit = (S.settings.institutions || []).find(x => x.toLowerCase() === norm.toLowerCase());
  return hit || norm;
}
/* 이미 있는 기관명과 부분적으로 겹치면(포함 관계 + 길이 차이가 작으면) "혹시 이 기관을 말씀하시나요?" 제안 후보를 찾음 */
function institutionSuggestion(input) {
  const norm = normInstitutionInput(input);
  if (!norm) return '';
  const list = S.settings.institutions || [];
  const lower = norm.toLowerCase();
  if (list.some(x => x.toLowerCase() === lower)) return '';
  let best = '';
  for (const x of list) {
    const xl = x.toLowerCase();
    if (xl === lower) continue;
    if ((xl.includes(lower) || lower.includes(xl)) && Math.abs(xl.length - lower.length) <= 4) {
      if (!best || Math.abs(x.length - norm.length) < Math.abs(best.length - norm.length)) best = x;
    }
  }
  return best;
}
/* 계좌 저장 시 호출 — 정규화된 기관명을 institutions에 등록(중복 없이)하고 최근 사용 목록 맨 앞으로 올림 */
function rememberInstitution(input) {
  const canon = canonicalInstitution(input);
  if (!canon) return canon;
  S.settings.institutions = S.settings.institutions || [];
  if (!S.settings.institutions.some(x => x.toLowerCase() === canon.toLowerCase())) S.settings.institutions.push(canon);
  S.settings.recentInstitutions = [canon, ...(S.settings.recentInstitutions || []).filter(x => x !== canon)].slice(0, 10);
  return canon;
}
/* 자산 저장 시 호출 — 방금 연결한 계좌를 "최근 사용 계좌" 맨 앞으로(요구사항 #9) */
function rememberAccountUsed(id) {
  if (!id) return;
  S.settings.recentAccountIds = [id, ...(S.settings.recentAccountIds || []).filter(x => x !== id)].slice(0, 10);
}
/* 계좌에 연결된 자산·평가액 — valueOf()/costOf()를 그대로 재사용(totals()와 계산 로직 중복 없음) */
function accountAssets(acc) { return S.assets.filter(a => a.accountId === acc.id); }
function accountSummary(acc) {
  if (isDbPensionAccount(acc)) return { value: acc.dbValuation, cost: acc.dbValuation, pl: 0, plp: 0, count: 0, isDb: true, list: [] };
  const list = accountAssets(acc).sort((a, b) => valueOf(b) - valueOf(a));
  const value = list.reduce((s, a) => s + valueOf(a), 0);
  const cost = list.reduce((s, a) => s + costOf(a), 0);
  const pl = value - cost, plp = cost > 0 ? pl / cost * 100 : 0;
  return { value, cost, pl, plp, count: list.length, isDb: false, list };
}
function dbPensionAccounts() { return S.accounts.filter(isDbPensionAccount); }
/* 자산 등록폼의 "보유 계좌" 드롭다운용 후보 — DB형 퇴직연금·해지 계좌는 새로 연결할 목록에서 제외하되(요구사항 D),
 * 이미 그 계좌로 연결돼 있던 자산은 계속 보여주기 위해 currentId가 후보 밖이면 별도로 끼워 넣음 */
function accountOptionsFor(currentId) {
  const recent = S.settings.recentAccountIds || [];
  const eligible = S.accounts.filter(a => !isDbPensionAccount(a) && a.status !== '해지');
  const eligibleIds = new Set(eligible.map(a => a.id));
  const ordered = [
    ...recent.map(id => eligible.find(a => a.id === id)).filter(Boolean),
    ...eligible.filter(a => !recent.includes(a.id))
  ];
  const extra = (currentId && !eligibleIds.has(currentId)) ? (S.accounts.find(a => a.id === currentId) || null) : null;
  return { ordered, extra };
}

/* ───────── 유틸 ───────── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function num(v) { if (v == null || v === '') return 0; const n = Number(String(v).replace(/[,\s원₩$]/g, '')); return isFinite(n) ? n : 0; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const nf0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const nf6 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 6 });
function won(n) { return nf0.format(Math.round(n)) + '원'; }
function wonShort(n) {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e8) return s + nf2.format(a / 1e8) + '억';
  if (a >= 1e4) return s + nf0.format(a / 1e4) + '만';
  return s + nf0.format(a) + '원';
}
function signed(n, f = won) { return (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n)); }
function pct(n, d = 1) { return (isFinite(n) ? n : 0).toFixed(d) + '%'; }
function cls(n) { return n > 0 ? 'up' : n < 0 ? 'down' : ''; }
/* 색상 의미 고정: 빨강(up)=증가/매수 필요, 파랑(down)=감소/매도 필요. 화살표도 항상 병기해서 색맹·저시력에서도 구분되게 함 */
function arrow(n) { return n > 0 ? '▲' : n < 0 ? '▼' : '·'; }
function arrowed(n, f = won) { return `${arrow(n)} ${signed(n, f)}`; }
function nowStamp() { return new Date().toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
/* 화면 상단에 붙이는 "기준시각" 한 줄 — 통화·환율·평가 기준을 한곳에서 통일해서 보여줌 */
function asOfLine(extra = '') {
  const fx = S.fx.USD ? `환율 1USD=₩${nf2.format(fxRate('USD'))}${S.settings.fxManual ? '(직접입력)' : ''}` : '';
  const pr = S.settings.priceRefreshedAt
    ? `마지막 시세 새로고침 ${new Date(S.settings.priceRefreshedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    : '마지막 시세 새로고침: 아직 실행 안 함 · 지금은 직접 입력한 값 기준';
  const parts = [`⏱️ 화면 계산 ${nowStamp()}`, pr, fx, extra].filter(Boolean);
  return `<p class="small faint asof" style="margin:0 4px 10px">${parts.join(' · ')}</p>`;
}
/* 외화 금액을 "현지통화 + 원화환산" 형식으로 표기 */
function dualCur(amountLocal, cur) {
  if (cur !== 'USD') return won(amountLocal);
  const krw = amountLocal * fxRate('USD');
  return `$${nf2.format(amountLocal)} (${won(krw)})`;
}
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function monthKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function prevMonthKey() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return monthKey(d); }
function fmtInput(n) { return n ? nf6.format(n) : ''; }
function catColor(c) { return CAT_COLORS[CATS.indexOf(c)] || '#999'; }
function qtyUnit(c) { return c === '암호화폐' ? '개' : c === '원자재' ? 'g' : '주'; }
function soft(c) { return `color-mix(in srgb, ${c} 38%, var(--card))`; }
function E(x) { return `<i class="emo">${x}</i>`; }
function dateLabel() {
  const d = new Date(); const w = '일월화수목금토'[d.getDay()];
  const icon = ['🌙', '🌷', '☀️', '🌈', '🍀', '⭐', '🌸'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${w}요일 ${icon}`;
}

/* ───────── 계산 ───────── */
function fxRate(cur) {
  if (cur !== 'USD') return 1;
  return S.settings.fxManual > 0 ? S.settings.fxManual : (S.fx.USD || 0);
}
/* 예적금: 원금·이자·세금·만기수령액 (월 단위, 은행 표준식) */
function monthsBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  let n = (y2 - y1) * 12 + (m2 - m1); if (d2 < d1) n--; return Math.max(0, n);
}
function depInfo(a) {
  const d = a && a.dep;
  if (!d || d.kind === 'none' || !d.start || !d.end || d.end <= d.start) return null;
  const r = d.rate / 100, n = monthsBetween(d.start, d.end), t = today();
  const elapsed = t >= d.start ? monthsBetween(d.start, t) : -1;
  const saving = d.kind === 'saving';
  const monthsPaidByPlan = Math.max(0, Math.min(n, elapsed + 1));
  const autoPaid = saving ? d.monthly * monthsPaidByPlan : (t >= d.start ? d.principal : 0);
  const hasManual = saving && d.manualPaid != null && d.manualPaid > 0;
  const paid = hasManual ? d.manualPaid : autoPaid;
  const paidDiff = hasManual ? d.manualPaid - autoPaid : 0;
  const remainingMonths = Math.max(0, n - monthsPaidByPlan);
  const principalTotal = saving ? (hasManual ? d.manualPaid + remainingMonths * d.monthly : d.monthly * n) : d.principal;
  let interest = 0;
  if (n > 0 && r > 0) {
    const i = r / 12;
    if (saving) interest = d.interest === 'compound' ? d.monthly * ((1 + i) ** (n + 1) - (1 + i)) / i - d.monthly * n : d.monthly * i * n * (n + 1) / 2;
    else interest = d.interest === 'compound' ? d.principal * ((1 + i) ** n - 1) : d.principal * r * n / 12;
  }
  const tax = Math.floor(interest * TAX[d.tax][1] / 10) * 10;
  const afterTax = interest - tax;
  const day = 864e5, now = new Date(t), s0 = new Date(d.start), e0 = new Date(d.end);
  const dday = Math.round((e0 - now) / day);
  const progress = Math.max(0, Math.min(100, (now - s0) / (e0 - s0) * 100));
  return { n, paid, principalTotal, interest, tax, afterTax, maturity: principalTotal + afterTax, dday, progress, saving, hasManual, paidDiff, autoPaid };
}
function ddayLabel(n) { return n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : `만기 +${-n}일`; }
function valueOf(a) { if (a.mode === 'qty') return a.qty * a.price * fxRate(a.cur); const di = depInfo(a); return di ? di.paid : a.amount; }
function costOf(a) {
  if (a.mode === 'qty') return a.qty * a.avgCost * fxRate(a.cur);
  const di = depInfo(a); if (di) return di.paid;
  return a.cost == null ? a.amount : a.cost;
}
function totals() {
  let value = 0, cost = 0;
  const byCat = Object.fromEntries(CATS.map(c => [c, 0]));
  const byPurpose = Object.fromEntries(PURPOSES.map(p => [p, 0]));
  for (const a of S.assets) { const v = valueOf(a); value += v; cost += costOf(a); byCat[a.cat] += v; byPurpose[a.purpose] += v; }
  /* DB형 퇴직연금: 순자산 포함으로 설정된 계좌의 기준일 평가액만 값으로 더함(요구사항 #13) — S.assets 항목이 아니라 총액·연금·IRP 분류 합계에만 반영 */
  for (const acc of dbPensionAccounts()) { if (acc.dbIncludeNetWorth) { value += acc.dbValuation; byCat['연금·IRP'] += acc.dbValuation; } }
  const y = String(new Date().getFullYear());
  let divAll = 0, divYear = 0, realized = 0;
  for (const t of S.txs) {
    if (t.type === 'div') { divAll += t.amountKRW || 0; if ((t.date || '').startsWith(y)) divYear += t.amountKRW || 0; }
    if (t.type === 'sell') realized += t.realizedKRW || 0;
  }
  /* 배당(거래일기)과 이자(가계부)는 서로 다른 곳에서 각각 한 번씩만 가져와 합쳐요 — 이중집계 없이 "총수익"·"연간 배당·이자"에 함께 잡히도록 */
  const intAll = bookInterestSum(() => true), intYear = bookInterestSum(d => d.startsWith(y));
  const incomeAll = divAll + intAll, incomeYear = divYear + intYear;
  const unreal = value - cost;
  return { value, cost, unreal, unrealPct: cost > 0 ? unreal / cost * 100 : 0, byCat, byPurpose, divAll, divYear, intAll, intYear, incomeAll, incomeYear, realized, totalReturn: unreal + realized + incomeAll };
}
/* 투자 포트폴리오 탭 전용 자산 필터(요구사항 B) — 부동산은 전부 제외, '기타'는 사용자가 토글로 opt-in한 것만.
 * totals()/홈 도넛은 이 함수를 쓰지 않고 그대로 S.assets를 씀 — 이번 라운드에서 손대지 않기로 한 부분이라 절대 섞지 않음. */
function portfolioEligible(a) {
  if (a.cat === '부동산') return false;
  if (a.cat === '기타') return !!a.portfolioInclude;
  return true;
}
function portfolioAssets() { return S.assets.filter(portfolioEligible); }
/* 해외주식을 무료 시세 서버에서 받으면 달러로 내려오므로, 환율을 먼저 확보해야 합니다. */
function needsFx() { return S.assets.some(a => (a.mode === 'qty' && a.cur === 'USD') || (a.cat === '원자재' && a.src === 'twelvedata') || (a.mode === 'qty' && a.cat === '해외주식' && a.src === 'twelvedata')); }
function prevSnapshot() { return S.snapshots.filter(s => s.month < monthKey()).sort((a, b) => b.month.localeCompare(a.month))[0]; }

/* ───────── 렌더링 ───────── */
const $app = document.getElementById('app');
function render() {
  document.getElementById('screenTitle').textContent = TITLES[ui.tab];
  document.getElementById('todayLabel').textContent = dateLabel();
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const fab = document.getElementById('fab');
  fab.hidden = !(ui.tab === 'assets' || ui.tab === 'tx' || ui.tab === 'book');
  applyTheme();
  $app.innerHTML = ({ home: viewHome, assets: viewAssets, book: viewBook, tx: viewTx, rebal: viewRebal, settings: viewSettings })[ui.tab]();
}

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

/* 홈 */
/* P0: 홈 최상단 "오늘의 행동" 카드 — 여러 신호 중 우선순위가 가장 높은 것 하나만 보여줌 */
function todayAction(T) {
  const m = monthKey(), r = monthSums(m);
  // 1) 변동비 예산 초과
  if (S.book.budget > 0 && r.variable > S.book.budget) {
    return { emo: '🚨', text: `변동비 예산을 <b class="num">${won(r.variable - S.book.budget)}</b> 넘었어요`, sub: '가계부에서 어디에 썼는지 확인해 보세요', tab: 'book' };
  }
  // 2) 보유 자산군이 너무 적어서 목표비교 자체가 왜곡될 때는 구체적 금액 대신 안내부터
  const emptyCount = S.assets.length ? CATS.filter(c => !T.byCat[c] && (Number(S.settings.targets[c]) || 0) > 0).length : 0;
  if (S.assets.length && emptyCount >= 3) {
    return { emo: '📋', text: '아직 일부 자산군이 비어 있어 목표비교가 정확하지 않아요', sub: '균형 탭에서 지금 보유한 분류 위주로 목표 비중을 다시 잡아보세요', tab: 'rebal' };
  }
  // 3) 목표 비중과 격차가 가장 큰 분류 (허용오차 밖, 미보유 분류는 제외 — 아래에서 방법을 고르면 그때 구체적 금액을 보여줌)
  const rows = S.assets.length ? gapRows(T).filter(x => x.status === 'low' || x.status === 'high').sort((a, b) => Math.abs(b.gapWon) - Math.abs(a.gapWon)) : [];
  if (rows.length) {
    const top = rows[0];
    return { emo: '⚖️', text: `${CAT_EMO[top.c]} ${top.c} 비중을 목표에 맞춰볼까요?`, sub: `현재 ${pct(top.curP)} → 목표 ${nf2.format(top.tgt)}% · 균형 탭에서 방법을 고르면 얼마씩 필요한지 알려드려요`, tab: 'rebal' };
  }
  // 4) 이번 달 투자 가능 금액(신규자금)
  if (r.left > 0 && S.book.entries.length) {
    return { emo: '💌', text: `이번 달 투자 가능 금액 <b class="num">${won(r.left)}</b>`, sub: '균형 탭에서 부족한 자산군에 나눠 넣어보세요', tab: 'rebal' };
  }
  // 5) 임박한 예적금 만기(7일 이내)
  const soon = S.assets.map(a => depInfo(a)).filter(di => di && di.dday >= 0 && di.dday <= 7).sort((a, b) => a.dday - b.dday)[0];
  if (soon) {
    return { emo: '🏦', text: `예적금 만기가 ${ddayLabel(soon.dday)} 남았어요 · 받을 돈 <b class="num">${won(soon.maturity)}</b>`, sub: '자산 탭에서 재예치·이체 계획을 세워보세요', tab: 'assets' };
  }
  // 6) 기본: 잘 하고 있음
  return { emo: '😊', text: '오늘은 특별히 할 일이 없어요', sub: '목표 비중과 예산 모두 잘 맞고 있어요', tab: '' };
}
function todayActionCard(T) {
  const a = todayAction(T);
  return `<section class="card tape action-card no-print" ${a.tab ? `data-action="go" data-tab="${a.tab}" role="button" tabindex="0"` : ''}>
    <div class="label">✅ 오늘 할 일 한 가지</div>
    <div class="hand" style="font-size:19px;line-height:1.35">${E(a.emo)} ${a.text}</div>
    <div class="small muted" style="margin-top:4px">${esc(a.sub)}${a.tab ? ' ›' : ''}</div>
  </section>`;
}
/* 기록 피로도 줄이기: 이번 달 일기를 아직 안 썼으면 지금 값으로 "자동 기록"해 둠(auto:true).
 * 사용자가 홈에서 직접 "일기 쓰기"를 눌러 저장하면 auto가 사라지고 확정 기록으로 바뀜.
 * 매번 앱을 열 때마다 자동 기록을 최신값으로 갱신해서, 한 번도 안 써도 월별 기록이 비지 않게 함. */
function autoSnapshotTick() {
  if (!S.assets.length) return;
  const m = monthKey();
  const existing = S.snapshots.find(x => x.month === m);
  if (existing && !existing.auto) return;
  const T = totals();
  S.snapshots = S.snapshots.filter(x => x.month !== m);
  S.snapshots.push({
    month: m, total: Math.round(T.value), cost: Math.round(T.cost), byCat: T.byCat, byPurpose: T.byPurpose,
    savedAt: new Date().toISOString(), mood: (existing && existing.mood) || '🙂', note: (existing && existing.note) || '', auto: true
  });
  save();
}
/* 총자산 카드 안의 "누적 수익률 + 캐릭터 상태 배지 + 현재 수익 구간 안내(접기/펼치기)".
 * 수익률 값은 기존 totals()의 unrealPct를 그대로 쓰고(계산 로직 변경 없음), 투자원금이 없어 산정이 불가하면 "수익률 산정 중"으로 표시 */
function returnStatusBlock(T) {
  const raw = T && T.cost > 0 ? T.unrealPct : null;
  const key = returnStatusKey(raw);
  if (!key) {
    return `<div class="rs-row">
      <div class="rs-metric"><span class="rs-k">누적 수익률</span><span class="rs-v num faint">—</span></div>
      <span class="rs-badge rs-pending">${RETURN_STATUS_PENDING.label}</span>
    </div>
    <p class="rs-empty no-print">${RETURN_STATUS_PENDING.guide}</p>`;
  }
  const p = roundReturnPct(raw), st = RETURN_STATUS[key], open = !!ui.returnGuideOpen;
  const tone = `--rs-bg:${st.tone.bg};--rs-fg:${st.tone.fg};--rs-line:${st.tone.line}`;
  return `<div class="rs-row">
      <div class="rs-metric"><span class="rs-k">누적 수익률</span><span class="rs-v num ${cls(p)}">${signed(p, x => x.toFixed(2) + '%')}</span></div>
      <span class="rs-badge" style="${tone}" data-status="${key}"><img class="rs-ic" src="${st.img}" alt="" width="22" height="22">${st.label}</span>
    </div>
    <div class="rs-guide no-print">
      <button type="button" class="rs-guide-btn" data-action="return-guide" aria-expanded="${open}" aria-controls="rsGuidePanel">
        <span>현재 수익 구간 안내</span>
        <svg class="rs-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="rs-panel${open ? ' open' : ''}" id="rsGuidePanel" role="region" aria-label="현재 수익 구간 안내"${open ? '' : ' inert'}>
        <div class="rs-panel-in">
          <div class="rs-detail">
            <img class="rs-ic-lg" src="${st.img}" alt="${st.alt}" width="52" height="52">
            <div class="rs-detail-body">
              <span class="rs-badge sm" style="${tone}">${st.label} · ${st.range}</span>
              <p class="rs-desc">${st.desc}</p>
              <p class="rs-points"><b>점검 포인트:</b> ${st.points}</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}
function viewHome() {
  const T = totals();
  if (!S.assets.length) {
    return `<div class="card tape empty"><span class="big-emo emo">📔</span><b>새 자산 일기장이에요</b>첫 페이지를 채워볼까요?<br>보물함에 예금, 주식, 코인을 하나씩 넣어 주세요.<div style="margin-top:16px"><button class="btn primary" data-action="go" data-tab="assets">👛 보물함 채우러 가기</button></div></div>`;
  }
  const prev = prevSnapshot();
  let deltaHtml = '', momPct = null;
  if (prev) {
    const d = T.value - prev.total; momPct = prev.total ? d / prev.total * 100 : 0;
    deltaHtml = `<span class="${cls(d)}">${arrow(d)} ${prev.month} 대비 ${signed(d)} (${signed(momPct, x => pct(x))})</span>`;
  }
  const warn = [];
  if (needsFx() && !fxRate('USD')) warn.push(['💱', '달러 자산이 있는데 환율이 없어요. 오른쪽 위 🔄를 누르거나 설정에서 직접 넣어 주세요.']);
  else if ((S.assets.some(a => a.mode === 'qty' && a.src !== 'manual') || needsFx()) && (Date.now() - (S.settings.priceRefreshedAt || 0)) > 24 * 3600e3) {
    warn.push(['🕰️', '시세를 하루 넘게 갱신 안 했어요. 오른쪽 위 🔄를 눌러 최신으로 맞춰요.']);
  }

  return `
  ${todayActionCard(T)}
  ${warn.map(([e, w]) => `<div class="banner warn no-print">${E(e)}<span>${esc(w)}</span></div>`).join('')}
  <section class="card hero tape">
    <div class="label">✍️ 오늘의 총자산</div>
    <div class="big num">${won(T.value)}</div>
    <div class="row num">${deltaHtml}</div>
    ${returnStatusBlock(T)}
  </section>
  ${asOfLine()}
  <div class="stats num">
    <div class="stat"><div class="k">${E('🌟')} 평가손익</div><div class="v ${cls(T.unreal)}">${arrow(T.unreal)} ${signed(T.unreal, wonShort)}</div><div class="s ${cls(T.unreal)}">${signed(T.unrealPct, x => pct(x, 2))}</div></div>
    <div class="stat"><div class="k">${E('🐷')} 투자원금</div><div class="v">${wonShort(T.cost)}</div><div class="s faint">보유분 기준</div></div>
    <div class="stat"><div class="k">${E('🍯')} 올해 배당·이자</div><div class="v">${wonShort(T.incomeYear)}</div><div class="s faint">배당 ${wonShort(T.divYear)} + 이자 ${wonShort(T.intYear)} · 누적 ${wonShort(T.incomeAll)}</div></div>
    <div class="stat"><div class="k">${E('🎉')} 총수익</div><div class="v ${cls(T.totalReturn)}">${arrow(T.totalReturn)} ${signed(T.totalReturn, wonShort)}</div><div class="s faint">평가+실현+배당·이자 · 총수익률 ${signed(T.cost > 0 ? T.totalReturn / T.cost * 100 : 0, x => pct(x, 1))}</div></div>
  </div>
  ${returnsCard(T)}
  ${goalsCard(T)}
  ${savingsCard(true)}
  ${bookMini()}
  ${upcomingMini()}
  <section class="card tape t2">
    <h3>🍩 자산 구성 <small>분류별</small></h3>
    ${donut(T)}
  </section>
  <details class="more no-print">
    <summary>🎯 목적별 주머니 자세히 보기</summary>
    <section class="card tape t3">
      ${PURPOSES.map(p => { const v = T.byPurpose[p]; const w = T.value ? v / T.value * 100 : 0;
        return `<div class="hbar"><span>${E(PURPOSE_EMO[p])} ${p}</span><div class="track"><div class="fill" style="width:${w}%"></div></div><span class="num">${wonShort(v)} · ${pct(w, 0)}</span></div>`; }).join('')}
    </section>
  </details>
  ${gapMini(T)}
  <details class="more no-print">
    <summary>📅 최근 12개월 자세히 보기</summary>
    ${monthsCard(T)}
  </details>
  <div class="btn-row no-print" style="margin-top:6px">
    <button class="btn primary" style="flex:1" data-action="snapshot">📸 ${(() => { const cs = S.snapshots.find(x => x.month === monthKey()); return cs && cs.auto ? '자동 기록해 놨어요 · 기분 남기기' : cs ? '이번 달 일기 고치기' : '이번 달 일기 쓰기'; })()}</button>
    <button class="btn" data-action="print">🖨️</button>
  </div>
  ${S.fx.at || S.assets.some(a => a.priceAt) ? `<p class="small faint" style="margin:14px 4px">${S.fx.USD ? `💱 환율 1달러 = ${nf2.format(fxRate('USD'))}원${S.settings.fxManual ? ' (직접 입력)' : ` · ${esc(S.fx.at)}`}` : ''}</p>` : ''}
  ${(() => {
    const lb = S.settings.lastBackup;
    return (!lb || (Date.now() - new Date(lb).getTime()) > 30 * 864e5)
      ? `<p class="small faint no-print" style="margin:2px 4px 10px" data-action="go" data-tab="settings" role="button" tabindex="0">💾 백업한 지 오래됐어요 · 설정에서 백업하기 ›</p>` : '';
  })()}`;
}

/* 목표(복수): purpose 태그 합계, cats를 지정하면 그 분류들과의 교집합만 집계 */
function goalCurrent(g, T) {
  if (g.cats && g.cats.length) {
    return S.assets.filter(a => a.purpose === g.purpose && g.cats.includes(a.cat)).reduce((s, a) => s + valueOf(a), 0);
  }
  return T.byPurpose[g.purpose] || 0;
}
function monthsUntil(dateYm) {
  if (!dateYm) return 0;
  const [y, m] = dateYm.split('-').map(Number); const n = new Date();
  return (y - n.getFullYear()) * 12 + (m - (n.getMonth() + 1));
}
/* 미래가치: 현재 적립액 P를 n개월 굴리고, 매달 M을 추가 납입했을 때 연 r%(단순 가정) 복리 결과 */
function scenarioFV(P, M, months, annualPct) {
  const i = annualPct / 100 / 12;
  if (months <= 0) return P;
  if (i === 0) return P + M * months;
  return P * Math.pow(1 + i, months) + M * ((Math.pow(1 + i, months) - 1) / i);
}
function goalConflicts(g, T) {
  // 목표에 태그된 자산 중 암호화폐처럼 위험도 높은 분류가 그 분류의 목표 비중을 초과해 담겨 있으면 경고
  const warns = [];
  const pool = S.assets.filter(a => a.purpose === g.purpose && (!g.cats.length || g.cats.includes(a.cat)));
  const poolValue = pool.reduce((s, a) => s + valueOf(a), 0);
  if (!poolValue) return warns;
  const risky = ['암호화폐'];
  for (const c of risky) {
    const v = pool.filter(a => a.cat === c).reduce((s, a) => s + valueOf(a), 0);
    if (!v) continue;
    const sharePct = v / poolValue * 100;
    const tgt = S.settings.targets[c] || 0;
    if (sharePct > tgt + S.settings.band) warns.push(`'${g.name}' 목표 자산 중 ${CAT_EMO[c]} ${c} 비중이 ${pct(sharePct, 0)}로, 설정한 목표 비중(${nf2.format(tgt)}%)보다 높아요. 위험 수준을 확인해 보세요.`);
  }
  return warns;
}
function goalRow(g, T) {
  const cur = goalCurrent(g, T);
  const rate = g.amount ? Math.min(100, cur / g.amount * 100) : 0;
  const remain = Math.max(0, g.amount - cur);
  const months = monthsUntil(g.date);
  let monthlyNeed = '';
  if (g.date) monthlyNeed = months > 0 ? `🗓️ 한 달에 <b class="num">${won(remain / months)}</b>씩 모으면 돼요 (${months}개월 남음)` : (remain > 0 ? '⏰ 목표 날짜가 지났어요' : '');
  const stage = rate >= 100 ? '🏆' : rate >= 75 ? '🏃' : rate >= 40 ? '🚶' : '🐣';
  const monthly = g.monthly || (months > 0 ? remain / months : 0);
  const scen = months > 0 ? SCENARIOS.map(s => {
    const fv = scenarioFV(cur, monthly, months, s.rate);
    const ok = fv >= g.amount;
    return `<span class="pill ${ok ? 'ok' : 'low'}" title="연 ${s.rate}% 가정">${s.emo} ${s.label} ${ok ? '달성' : signed(fv - g.amount, wonShort)}</span>`;
  }).join(' ') : '';
  const warns = goalConflicts(g, T);
  return `<section class="card tape t3">
    <h3>${stage} ${goalIcon(g)} ${esc(g.name)} 목표 <span class="btn-row" style="display:inline-flex;gap:6px"><button class="link-btn no-print" style="font-size:14px" data-action="goal-edit" data-id="${g.id}">편집</button></span></h3>
    <div class="num" style="display:flex;justify-content:space-between;font-size:14px"><span class="hand"><b>${pct(rate)}</b> 왔어요!</span><span class="muted">${wonShort(cur)} / ${wonShort(g.amount)}</span></div>
    <div class="progress"><div style="width:${rate}%"></div></div>
    <div class="small muted">${rate >= 100 ? '🎊 목표 달성! 대단해요' : '남은 금액'} <b class="num">${won(remain)}</b>${g.date ? ` · 목표 ${esc(g.date)}` : ''}</div>
    ${monthlyNeed ? `<div class="small muted" style="margin-top:2px">${monthlyNeed}</div>` : ''}
    ${scen ? `<div class="chips" style="margin-top:8px">${scen}</div><p class="small faint" style="margin:4px 2px 0">월 ${wonShort(monthly)}씩 계속 넣는다고 가정한 시나리오예요. 확률이 아니라 참고용 가정치예요.</p>` : ''}
    ${warns.map(w => `<div class="banner warn" style="margin-top:8px"><span>${E('⚠️')}${esc(w)}</span></div>`).join('')}
  </section>`;
}
function goalsCard(T) {
  const goals = S.settings.goals;
  if (!goals.length) return `<section class="card tape t3 no-print"><h3>🏡 목표 <small>아직 비어 있어요</small></h3><p class="small muted" style="margin:0 0 12px">목표 금액과 날짜를 적으면 얼마나 왔는지, 한 달에 얼마씩 모으면 되는지 알려줄게요. 여러 개를 만들 수 있어요(주택자금·비상금·은퇴자금 등).</p><button class="btn sm primary" data-action="goal-edit" data-id="">🎯 목표 만들기</button></section>`;
  return goals.slice().sort((a, b) => a.priority - b.priority).map(g => goalRow(g, T)).join('')
    + `<button class="btn sm block no-print" data-action="goal-edit" data-id="">➕ 목표 추가</button>`;
}

function donut(T) {
  const R = 60, C = 2 * Math.PI * R; let off = 0;
  const segs = CATS.map((c, i) => {
    const v = T.byCat[c]; if (!v || T.value <= 0) return '';
    const len = v / T.value * C;
    const s = `<circle r="${R}" cx="75" cy="75" fill="none" stroke="${CAT_COLORS[i]}" stroke-width="24" stroke-dasharray="${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)"/>`;
    off += len; return s;
  }).join('');
  const legend = CATS.filter(c => T.byCat[c] > 0).map(c =>
    `<div><i style="background:${catColor(c)}"></i><span>${CAT_EMO[c]} ${c}</span><b class="num">${pct(T.byCat[c] / T.value * 100)}</b></div>`).join('');
  return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 150 150" role="img" aria-label="분류별 비중"><circle r="${R}" cx="75" cy="75" fill="none" stroke="var(--card2)" stroke-width="24"/>${segs}<text x="75" y="86" text-anchor="middle" font-size="30">💰</text></svg><div class="legend">${legend}</div></div>`;
}
/* 국내주식·해외주식 종목의 섹터별·국가별 구성을 보여주는 작은 도넛 — 대분류 도넛(donut)과 같은 원리, 색상 팔레트만 따로 씀 */
const SUBCHART_COLORS = ['#8fd3b0', '#ff9fb4', '#86c0f2', '#d3b58e', '#b79cf2', '#ffb07f', '#f7cf4d', '#e0c473', '#c3c9d1', '#9ad0d6', '#f2a6c8', '#c8e08f', '#e3b6a0', '#a8b8e0'];
function groupDonut(rows, centerEmo) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const segs = rows.map((r, i) => {
    if (!r.value || total <= 0) return '';
    const len = r.value / total * C;
    const s = `<circle r="${R}" cx="66" cy="66" fill="none" stroke="${r.color || SUBCHART_COLORS[i % SUBCHART_COLORS.length]}" stroke-width="19" stroke-dasharray="${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}" stroke-dashoffset="${-off}" transform="rotate(-90 66 66)"/>`;
    off += len; return s;
  }).join('');
  const legend = rows.filter(r => r.value > 0).map((r, i) =>
    `<div><i style="background:${r.color || SUBCHART_COLORS[i % SUBCHART_COLORS.length]}"></i><span>${esc(r.label)}</span><b class="num">${pct(total > 0 ? r.value / total * 100 : 0)}</b></div>`).join('');
  return `<div class="donut-wrap"><svg class="donut" style="width:132px;height:132px" viewBox="0 0 132 132" role="img"><circle r="${R}" cx="66" cy="66" fill="none" stroke="var(--card2)" stroke-width="19"/>${segs}<text x="66" y="74" text-anchor="middle" font-size="24">${centerEmo}</text></svg><div class="legend">${legend}</div></div>`;
}
/* 같은 라벨엔 항상 같은 색을 쓰기 위한 색상 결정 — 고정 매핑 우선, 없으면 SUBCHART_COLORS를 순서대로(요구사항 #10) */
function compColor(label, idx) { return COMP_LABEL_COLOR[label] || SUBCHART_COLORS[idx % SUBCHART_COLORS.length]; }
/* 구성 분석용 그룹핑 + 임계치 로직(요구사항 #3·#4).
 * groupKeyFn(asset)이 falsy를 반환하면 '미분류'로 따로 모으고(도넛에 합쳐 넣지 않고 별도 행+안내문으로), 나머지는 값 기준으로 묶는다.
 * 보유 종목 수(list.length) 기준: 1개면 도넛 없이 요약 문장(mode:'single'), 2~4개면 전체 그룹을 도넛으로, 5개 이상이면 상위 5개 그룹 + '기타'로 묶는다. */
function buildCompositionRows(list, groupKeyFn) {
  const groups = {};
  const unclassifiedAssets = [];
  list.forEach(a => {
    const k = groupKeyFn(a);
    if (!k) unclassifiedAssets.push(a);
    else groups[k] = (groups[k] || 0) + valueOf(a);
  });
  if (list.length === 1) {
    const only = list[0];
    const k = groupKeyFn(only);
    return { mode: 'single', label: k || '미분류', asset: only, unclassifiedAssets };
  }
  let rows = Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  if (list.length >= 5 && rows.length > 5) {
    const top = rows.slice(0, 5);
    const restSum = rows.slice(5).reduce((s, r) => s + r.value, 0);
    rows = restSum > 0 ? [...top, { label: '기타', value: restSum }] : top;
  }
  if (unclassifiedAssets.length) rows.push({ label: '미분류', value: unclassifiedAssets.reduce((s, a) => s + valueOf(a), 0) });
  return { mode: 'donut', rows, unclassifiedAssets };
}
/* 연금·IRP 상품유형 탭에서, 이름으로 '추정'한 값이 섞여있으면 어떤 상품유형에 추정치가 포함됐는지 짧게 안내(요구사항 #7) */
function pensionEstimatedNote(list) {
  const est = new Set();
  list.forEach(a => { if (a.penProductEstimated && a.penProduct) est.add(a.penProduct); });
  if (!est.size) return '';
  return `<p class="small faint" style="margin:6px 2px 0">🔍 ${[...est].map(esc).join(', ')}은(는) 종목명으로 추정한 값이 포함돼 있어요(추정)</p>`;
}
/* DB형 퇴직연금 계좌를 연금·IRP 구성 분석에 "가짜 자산"처럼 한 행 끼워 넣기 위한 변환(요구사항 #13, dbIncludeAnalysis=true인 계좌만).
 * S.assets에 실제로 들어가지는 않고, 구성 분석 렌더링 시에만 만들어 쓰는 임시 객체 — valueOf()가 그대로 통하도록 mode:'amount'/dep:없음 형태로 맞춤. */
function dbPensionSyntheticRow(acc) {
  return {
    id: 'db:' + acc.id, name: acc.alias || 'DB형 퇴직연금', cat: '연금·IRP',
    mode: 'amount', amount: acc.dbValuation, cost: acc.dbValuation, dep: { kind: 'none' },
    type: 'DB형 퇴직연금', // 계좌유형별 탭에서 실제 계좌 조회 없이 바로 'DB형 퇴직연금' 그룹으로 잡히게(ACCOUNT_TYPES_BY_CLASS의 문자열과 동일)
    penClass: '대체자산', penCountry: '한국', penSector: '기타', penProduct: 'DB형 퇴직연금', penProductEstimated: false,
    dbAccountId: acc.id, isDbSynthetic: true
  };
}
/* 투자 포트폴리오 탭의 상시 노출 구성 분석 블록(요구사항 J) — 예전 "구성 분석 보기" 아코디언(접기/펼치기)을 대체함.
 * 전용 화면으로 옮겨온 이상 접어둘 이유가 없어서 항상 펼친 상태로 렌더링하고, 탭(있으면) + 도넛 또는 요약 문장 + 미분류 안내
 * + (국가 탭이면) 산정 기준 문구 + (상품유형 탭이면) 추정치 안내를 보여줌 — 옛 아코디언의 "펼친 몸통" 로직을 그대로 재사용.
 * sectionKey는 내부 탭 전환 버튼(data-section 값)을 구분하기 위한 것으로, tabs가 1개뿐이면 tabSwitcher 자체가 렌더링되지 않아 안 써도 됨. */
function compositionBlock(list, tabs, tabKey, sectionKey) {
  if (!tabs || !tabs.length) return '';
  if (!list.length) return `<p class="small muted" style="margin:10px 4px">아직 이 항목에 해당하는 자산이 없어요.</p>`;
  const tab = tabs.find(t => t.key === tabKey) || tabs[0];
  const result = buildCompositionRows(list, tab.group);
  const tabSwitcher = tabs.length > 1 ? `<div class="seg" style="margin:0 0 10px">${tabs.map(t => `<button type="button" data-action="portfolio-tab" data-section="${sectionKey}" data-k="${t.key}" class="${t.key === tab.key ? 'on' : ''}">${esc(t.label)}</button>`).join('')}</div>` : '';
  let body;
  if (result.mode === 'single') {
    const est = (tab.key === 'product' && result.asset.penProductEstimated) ? ' (추정)' : '';
    body = `<p class="small muted" style="margin:4px 2px 2px">${tab.dim}: ${esc(result.label)}${est} ${pct(100)}</p>
      <p class="small faint" style="margin:2px 2px 10px">종목이 2개 이상이면 구성 차트가 표시됩니다.</p>`;
  } else {
    const rows = result.rows.map((r, i) => ({ label: r.label, value: r.value, color: compColor(r.label, i) }));
    body = groupDonut(rows, tab.emo);
  }
  const unclassNote = result.unclassifiedAssets.length
    ? `<p class="small faint" style="margin:8px 2px 0">🌱 미분류 ${result.unclassifiedAssets.length}건 · ${won(result.unclassifiedAssets.reduce((s, a) => s + valueOf(a), 0))} — 눌러서 채워주세요: ${result.unclassifiedAssets.map(a => `<button type="button" class="link-btn" style="font-size:12.5px" data-action="edit-asset" data-id="${a.id}">${esc(a.name)}</button>`).join(', ')}</p>`
    : '';
  const countryFootnote = tab.key === 'country' ? `<p class="small faint" style="margin:6px 2px 0">🌍 국가 비중은 기초자산의 주요 투자국 기준입니다.</p>` : '';
  const estimatedNote = tab.key === 'product' ? pensionEstimatedNote(list) : '';
  return `<div class="subchart" style="margin:10px 0 14px">${tabSwitcher}${body}${unclassNote}${countryFootnote}${estimatedNote}</div>`;
}

/* 보유 자산이 아예 없는 분류는 "부족"으로 겁주지 않고 'empty'(미보유)로 따로 분리해서 표시함.
 * 자산군이 몇 개 안 될 때 나머지가 전부 "부족"으로 보여서 목표비교가 왜곡되는 문제를 줄이기 위함.
 * relative=true면 "보유 자산 기준" 모드: 미보유 분류를 빼고 보유 분류의 목표 비중끼리만 다시 100%로 맞춰서 비교함 */
function gapRows(T, relative = false) {
  const band = S.settings.band;
  let tg = S.settings.targets;
  if (relative) {
    const held = CATS.filter(c => T.byCat[c] > 0);
    const heldSum = held.reduce((s, c) => s + (Number(S.settings.targets[c]) || 0), 0);
    if (heldSum > 0) {
      const resc = {};
      CATS.forEach(c => { resc[c] = held.includes(c) ? (Number(S.settings.targets[c]) || 0) / heldSum * 100 : 0; });
      tg = resc;
    }
  }
  return CATS.map(c => {
    const curP = T.value ? T.byCat[c] / T.value * 100 : 0;
    const tgt = tg[c] || 0;
    const gap = curP - tgt;
    const gapWon = T.byCat[c] - tgt / 100 * T.value;
    const status = !T.byCat[c] ? (tgt > 0 || (S.settings.targets[c] || 0) > 0 ? 'empty' : 'skip') : Math.abs(gap) <= band ? 'ok' : gap < 0 ? 'low' : 'high';
    return { c, curP, tgt, gap, gapWon, status };
  }).filter(r => r.status !== 'skip');
}
function heldCount(T) { return CATS.filter(c => T.byCat[c] > 0).length; }
function emptyCatNote(T) {
  const empties = CATS.filter(c => !T.byCat[c] && (Number(S.settings.targets[c]) || 0) > 0);
  if (!empties.length) return '';
  return `<p class="small faint" style="margin:0 0 8px">🌱 아직 ${empties.map(c => CAT_EMO[c] + c).join('·')} 자산이 없어요. 이 분류는 '미보유'로 표시하고, 그만큼 다른 분류의 비중은 실제보다 크거나 작게 보일 수 있어요.</p>`;
}
function gapModeToggle() {
  return `<button class="link-btn gap-toggle no-print" data-action="gap-relative">${ui.gapRelative ? '↩️ 전체 목표 기준으로 보기' : '🔁 보유 자산만 기준으로 다시 보기'}</button>`;
}
const STATUS_LABEL = { ok: '적정', low: '부족', high: '초과', empty: '미보유' };
function gapMini(T) {
  const all = gapRows(T, ui.gapRelative);
  const active = all.filter(r => r.status === 'low' || r.status === 'high');
  const empty = all.filter(r => r.status === 'empty');
  const row = r => `<div class="hbar" style="grid-template-columns:auto 1fr auto"><span>${CAT_EMO[r.c]} ${r.c}</span><span class="small muted num">${pct(r.curP)} → ${nf2.format(r.tgt)}%</span><span class="pill ${r.status}">${STATUS_EMO[r.status]} ${STATUS_LABEL[r.status]}${r.status === 'empty' ? '' : ' ' + signed(r.gap, x => x.toFixed(1) + '%p')}</span></div>`;
  return `<section class="card tape">
    <h3>⚖️ 목표랑 비교 <button class="link-btn no-print" style="font-size:14px" data-action="go" data-tab="rebal">균형 맞추기 ›</button></h3>
    ${empty.length ? emptyCatNote(T) : ''}
    ${empty.length ? `<p style="margin:0 0 8px">${gapModeToggle()}</p>` : ''}
    ${ui.gapRelative ? `<p class="small faint" style="margin:0 0 8px">지금은 보유 중인 ${heldCount(T)}개 분류의 목표 비중만 100%로 다시 맞춰서 비교하고 있어요.</p>` : ''}
    ${active.length ? active.map(row).join('') : `<p class="small muted" style="margin:0 0 8px">😊 보유 중인 분류는 모두 목표 ±${S.settings.band}%p 안에 있어요.</p>`}
    ${empty.length ? `<details class="more no-print" style="margin:4px 0 0"><summary style="font-size:13px">🌱 아직 없는 분류 ${empty.length}개 보기</summary><div style="opacity:.55">${empty.map(row).join('')}</div></details>` : ''}
  </section>`;
}

function monthsCard(T) {
  const now = new Date(); const keys = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(monthKey(d)); }
  const map = Object.fromEntries(S.snapshots.map(s => [s.month, s.total]));
  const curKey = monthKey();
  const vals = keys.map(k => k === curKey ? T.value : (map[k] || 0));
  const max = Math.max(...vals, 1);
  const has = S.snapshots.length > 0;
  return `<section class="card tape t2">
    <h3>📅 최근 12개월 <small>이번 달은 지금 값</small></h3>
    <div class="months">${keys.map((k, i) => `<div class="m ${k === curKey ? 'cur' : ''}" title="${k} ${won(vals[i])}"><div class="col" style="height:${vals[i] / max * 100}%;${vals[i] ? '' : 'opacity:.15'}"></div><div class="lab">${Number(k.slice(5))}</div></div>`).join('')}</div>
    ${has ? `<div class="diary" style="margin-top:14px">${
      [...S.snapshots].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12).map((s, i, arr) => {
        const p = arr[i + 1]; const d = p ? s.total - p.total : 0;
        return `<button class="entry" style="border:0;text-align:left;width:100%" data-action="edit-snap" data-m="${s.month}">${E(s.mood || '📝')}<div style="min-width:0"><div class="when">${Number(s.month.slice(0, 4))}년 ${Number(s.month.slice(5))}월의 일기</div><div class="note">${s.note ? esc(s.note) : '<span class="faint">한 줄 메모 없음</span>'}</div></div><div class="amt num">${wonShort(s.total)}<div class="small ${cls(d)}">${p ? signed(d, wonShort) : '첫 기록 ✨'}</div></div></button>`; }).join('')
    }</div>` : `<p class="hand faint" style="margin:10px 0 0">매달 한 번 📸 일기를 쓰면 여기에 차곡차곡 쌓여요</p>`}
  </section>`;
}

/* 자산 */
/* 자산 탭 상단 "보유자산 / 투자 포트폴리오 / 계좌 관리" 전환 — 별도 하단 메뉴를 추가하지 않고 이 안에서만 오간다(요구사항 #1) */
function viewAssets() {
  const t = ui.assetsTab;
  const seg = `<div class="seg" id="assetsTabSeg" style="margin:2px 0 14px">
    <button type="button" data-action="assets-tab" data-t="holdings" class="${t === 'holdings' ? 'on' : ''}">👛 보유자산</button>
    <button type="button" data-action="assets-tab" data-t="portfolio" class="${t === 'portfolio' ? 'on' : ''}">📊 투자 포트폴리오</button>
    <button type="button" data-action="assets-tab" data-t="accounts" class="${t === 'accounts' ? 'on' : ''}">🏦 계좌 관리</button>
  </div>`;
  if (t === 'accounts') return seg + viewAccountsTab();
  if (t === 'portfolio') return seg + viewPortfolioTab();
  return seg + viewHoldingsTab();
}
/* ui.portfolioScope에 저장된 값 방어 — 선택했던 개별 계좌가 사라졌다면(이론상 불가하지만 방어적으로) 전체로 되돌림 */
function resolvePortfolioScope() {
  const raw = ui.portfolioScope || { kind: 'group', key: 'all' };
  if (raw.kind === 'account' && !S.accounts.find(a => a.id === raw.id)) return { kind: 'group', key: 'all' };
  return raw;
}
/* "분석 대상" 드롭다운(요구사항 #4~#6) — 계좌 유형별 선택 optgroup + 개별 계좌 선택 optgroup */
function portfolioScopeSelectHtml(scope) {
  const groupOpts = PORTFOLIO_SCOPE_GROUPS.map(g => `<option value="group:${g.key}" ${scope.kind === 'group' && scope.key === g.key ? 'selected' : ''}>${esc(g.label)}</option>`).join('');
  const acctList = S.accounts.slice().sort((a, b) => (a.institution + a.alias).localeCompare(b.institution + b.alias));
  const acctOpts = acctList.map(a => `<option value="account:${a.id}" ${scope.kind === 'account' && scope.id === a.id ? 'selected' : ''}>${esc(a.institution)} · ${esc(a.alias)}</option>`).join('');
  return `<label class="field" style="margin:0 0 14px"><span>분석 대상</span>
    <select class="input" id="portfolioScopeSel">
      <optgroup label="계좌 유형별 선택">${groupOpts}</optgroup>
      ${acctList.length ? `<optgroup label="개별 계좌 선택">${acctOpts}</optgroup>` : ''}
    </select>
  </label>`;
}
/* 개별 계좌 선택 시 상단 헤더 카드(요구사항 #9) — "계좌 목적"은 계좌 모델에 별도 필드가 없어 대분류(cls)로 해석함(보고서에 명시) */
function portfolioAccountHeaderCard(acc) {
  const isDb = isDbPensionAccount(acc);
  const value = isDb ? acc.dbValuation : accountSummary(acc).value;
  const rows = [
    ['평가액', won(value)],
    ['계좌 유형', esc(acc.type) || '-'],
    ['금융기관', esc(acc.institution) || '-'],
    ['계좌 목적', esc(acc.cls)],
    ['계좌 상태', esc(acc.status)],
    ['기본 통화', curLabel(acc.currency)],
  ];
  return `<div class="card tape" style="margin-bottom:14px">
    <h3 style="margin:0 0 4px">🏦 ${esc(acc.institution)} · ${esc(acc.alias)}</h3>
    ${rows.map(([k, v]) => `<div class="sumline"><span class="small muted">${k}</span><span class="num">${v}</span></div>`).join('')}
  </div>`;
}
/* 스코프에 포함된 DB형 퇴직연금 요약 카드(요구사항 #10, G) — dbIncludeAnalysis와 무관하게 스코프에 있으면 항상 노출 */
function portfolioDbSummaryCard(dbAccounts) {
  if (!dbAccounts.length) return '';
  const lines = dbAccounts.map(acc => {
    const expected = acc.dbExpected ? ` · 예상 퇴직금 ${won(acc.dbExpected)}` : '';
    return `<p class="small muted" style="margin:0 0 4px">🏛️ ${esc(acc.alias)} · 기준일 ${esc(acc.dbAsOf || '-')} · 평가액 ${won(acc.dbValuation)}${expected}</p>`;
  }).join('');
  return `<div class="card tape" style="margin-bottom:14px">
    ${lines}
    <p class="small faint" style="margin:6px 0 0">DB형 퇴직연금은 종목·국가·섹터 분석에 포함되지 않고, 평가액만 여기 표시돼요.</p>
  </div>`;
}
/* 투자 포트폴리오 탭(요구사항 #3~#12) — 자산군/국가·지역/섹터/종목 4개 분석 축 + 상단 "분석 대상" 드롭다운으로 범위를 좁히는 방식.
 * 예전의 6개 칩(주식·ETF/연금·퇴직연금/원자재/암호화폐/계좌)은 전부 없어지고, 그 다양성은 드롭다운 스코프로 대체됨.
 * 부동산은 전혀 포함하지 않고, '기타'는 자산 등록폼의 토글로 opt-in한 것만 포함(portfolioAssets() 참고). */
function viewPortfolioTab() {
  const head = `<div class="card tape" style="margin-bottom:14px">
    <h3 style="margin:0 0 4px">📊 투자 포트폴리오</h3>
    <p class="small muted" style="margin:0">주식·채권·연금·원자재·암호화폐 등 투자 목적 자산의 통합 구성입니다.</p>
  </div>`;
  const scope = resolvePortfolioScope();
  const selectHtml = portfolioScopeSelectHtml(scope);
  // 계좌 유형을 선택했는데 그 유형에 등록된 계좌가 하나도 없으면(요구사항 #11) 빈 상태 + 계좌 추가 버튼만 보여줌
  if (scope.kind === 'group' && scope.key !== 'all' && !portfolioScopeAccounts(scope).length && !portfolioScopeDbAccounts(scope).length) {
    return head + selectHtml
      + `<div class="card tape empty"><span class="big-emo emo">🏦</span><b>등록된 계좌가 없습니다</b>이 유형의 계좌를 먼저 등록해 주세요.</div>`
      + `<button class="btn block primary" data-action="account-add">➕ 계좌 추가</button>`;
  }
  const selectedAccount = scope.kind === 'account' ? S.accounts.find(a => a.id === scope.id) : null;
  const headerCard = selectedAccount ? portfolioAccountHeaderCard(selectedAccount) : '';
  const dbAccounts = portfolioScopeDbAccounts(scope);
  const dbCard = portfolioDbSummaryCard(dbAccounts);
  // 개별 DB형 퇴직연금 계좌를 선택했으면 분석할 종목이 없으므로 헤더+요약 카드만(요구사항 G)
  if (selectedAccount && isDbPensionAccount(selectedAccount)) {
    return head + selectHtml + headerCard + dbCard;
  }
  const list = scopedPortfolioAssets(scope);
  const tabKey = ui.portfolioTabKey || 'class';
  const seg = `<div class="seg" style="margin:0 0 14px">${PORTFOLIO_TABS.map(t => `<button type="button" data-action="portfolio-tab" data-k="${t.key}" class="${t.key === tabKey ? 'on' : ''}">${E(t.emo)} ${esc(t.label)}</button>`).join('')}</div>`;
  let body;
  if (tabKey === 'class') {
    const rows = portfolioAssetClassRows(list, dbAccounts);
    const total = rows.reduce((s, r) => s + r.value, 0);
    body = total > 0
      ? groupDonut(rows.map(r => ({ ...r, color: ASSET_CLASS_COLOR[r.label] })), '🧭')
      : `<p class="small muted" style="margin:10px 4px">아직 투자 포트폴리오에 포함된 자산이 없어요.</p>`;
  } else if (tabKey === 'country' || tabKey === 'sector') {
    // 국가·지역/섹터는 주식형 자산에서만 의미가 있어 이 두 탭만 주식·주식형 연금으로 범위를 좁힘(요구사항 E)
    const equityList = list.filter(a => a.cat === '국내주식' || a.cat === '해외주식' || (a.cat === '연금·IRP' && a.penClass === '주식형'));
    const tabDef = tabKey === 'country'
      ? { key: 'country', label: '국가·지역', dim: '국가', emo: '🌍', group: a => (a.cat === '연금·IRP' ? a.penCountry : a.country) || null }
      : { key: 'sector', label: '섹터', dim: '섹터', emo: '🏷️', group: a => (a.cat === '연금·IRP' ? a.penSector : a.sector) || null };
    body = compositionBlock(equityList, [tabDef], tabDef.key);
  } else if (tabKey === 'item') {
    // 종목 탭은 스코프 전체(주식·연금·채권·현금·원자재·암호화폐·기타)를 대상으로 함(요구사항 F)
    body = compositionBlock(list, [{ key: 'item', label: '종목', dim: '종목', emo: '💼', group: itemGroupKey }], 'item');
  }
  return head + selectHtml + headerCard + dbCard + seg + body;
}
function viewHoldingsTab() {
  if (!S.assets.length) return `<div class="card tape empty"><span class="big-emo emo">👛</span><b>보물함이 텅 비었어요</b>오른쪽 아래 ✏️ 버튼으로 예금, 주식, 연금, 부동산, 코인을 넣어 주세요.</div>`;
  const T = totals();
  const capBtn = `<button class="btn block capture-btn" data-action="capture">📷 증권앱 캡처로 시세 반영하기</button>`;
  const cats = CATS.filter(c => S.assets.some(a => a.cat === c));
  // 자산군별 구성 분석(국내주식·해외주식·연금·IRP·암호화폐)은 이제 "투자 포트폴리오" 탭으로 통합됨 — 여기는 순수 보유 목록만(요구사항 #3)
  return asOfLine() + capBtn + savingsCard(false) + cats.map(c => {
    const list = S.assets.filter(a => a.cat === c).sort((a, b) => valueOf(b) - valueOf(a));
    return `<div class="group-head"><span>${E(CAT_EMO[c])} ${c}</span><span class="num">${won(T.byCat[c])}</span></div>
    <div class="list">${renderHoldingsList(list)}</div>`;
  }).join('') + `<p class="hand faint" style="margin:12px 6px">콕 누르면 고칠 수 있어요 · 오르면 빨강(▲), 내리면 파랑(▼)</p>`;
}
/* 동일 종목을 여러 계좌에서 보유할 때(요구사항 #12) — 종목명(또는 티커)+자산군이 같으면 한 그룹으로 묶어 합산 요약을 보여주고,
 * 1건뿐이면(계좌 미연결 1건 포함) 기존과 완전히 같은 모습으로 그냥 assetItem을 그대로 씀(시각적 회귀 없음) */
function holdingFingerprint(a) { return (a.symbol || a.name || '').trim().toLowerCase(); }
function groupHoldings(list) {
  const map = new Map();
  list.forEach(a => { const k = holdingFingerprint(a); if (!map.has(k)) map.set(k, []); map.get(k).push(a); });
  return [...map.values()];
}
function renderHoldingsList(list) {
  return groupHoldings(list).map(group => group.length === 1 ? assetItem(group[0]) : holdingGroupBlock(group)).join('');
}
function holdingGroupBlock(group) {
  const key = group[0].cat + '::' + holdingFingerprint(group[0]);
  const open = !!ui.holdingGroupOpen[key];
  const total = group.reduce((s, a) => s + valueOf(a), 0);
  const head = `<button type="button" class="item" data-action="holding-group-toggle" data-key="${esc(key)}" aria-expanded="${open}">
      <span class="bubble emo" style="background:${soft(catColor(group[0].cat))}">${CAT_EMO[group[0].cat]}</span>
      <span class="main"><div class="t">${esc(group[0].name)}</div><div class="sub">${group.length}개 계좌 합산 보유</div></span>
      <span class="right num"><div class="t">${won(total)}</div><span class="pill ok">${group.length}개 계좌 ${open ? '▴' : '▾'}</span></span>
    </button>`;
  const body = open ? `<div class="holding-group-body">${group.map(assetItem).join('')}</div>` : '';
  return head + body;
}
/* 계좌 탭(요구사항 #2, #10, #11, F) */
function viewAccountsTab() {
  const addBtn = `<button class="btn block primary" data-action="account-add">➕ 계좌 추가</button>`;
  if (!S.accounts.length) {
    return addBtn + `<div class="card tape empty"><span class="big-emo emo">🏦</span><b>등록된 계좌가 없어요</b>계좌를 먼저 등록하면 자산을 연결해서 계좌별로 볼 수 있어요.</div>`;
  }
  const filter = ui.accountFilter || '전체';
  const chips = `<div class="chips" style="margin:0 0 14px">${ACCOUNT_FILTERS.map(f => `<button type="button" class="chip ${f === filter ? 'on' : ''}" data-action="account-filter" data-f="${esc(f)}">${esc(f)}</button>`).join('')}</div>`;
  const list = S.accounts.filter(a => accountFilterMatch(a, filter));
  const body = list.length ? `<div class="list">${list.map(accountCard).join('')}</div>` : `<p class="small muted" style="margin:12px 4px">해당하는 계좌가 없어요.</p>`;
  return addBtn + chips + body;
}
function accountCard(acc) {
  const open = !!ui.acctOpen[acc.id];
  const isDb = isDbPensionAccount(acc);
  const sum = accountSummary(acc);
  const statusCls = acc.status === '사용 중' ? 'ok' : acc.status === '해지' ? 'empty' : 'low';
  const valueLine = isDb ? won(acc.dbValuation) : won(sum.value);
  const subRight = isDb ? (acc.dbExpected ? `예상 퇴직금 ${won(acc.dbExpected)}` : `기준일 ${esc(acc.dbAsOf || '-')}`) : `연결 자산 ${sum.count}개`;
  const head = `<button type="button" class="item" data-action="account-toggle" data-id="${acc.id}" aria-expanded="${open}">
      <span class="bubble emo" style="background:${soft(catColor('기타'))}">🏦</span>
      <span class="main"><div class="t">${esc(acc.institution)} · ${esc(acc.alias)}</div><div class="sub">${esc(acc.type)} · ${subRight}</div></span>
      <span class="right num"><div class="t">${valueLine}</div><span class="pill ${statusCls}">${esc(acc.status)}</span></span>
    </button>`;
  if (!open) return head;
  let bodyHtml;
  if (isDb) {
    bodyHtml = `<div class="account-detail">
      <p class="small muted" style="margin:0 0 4px">기준일 ${esc(acc.dbAsOf || '-')} · 평가액 ${won(acc.dbValuation)}</p>
      ${acc.dbExpected ? `<p class="small muted" style="margin:0 0 4px">예상 퇴직금 ${won(acc.dbExpected)}</p>` : ''}
      <p class="small faint" style="margin:0">${acc.dbIncludeNetWorth ? '전체 순자산에 포함됨' : '전체 순자산에서 제외됨'} · ${acc.dbIncludeAnalysis ? '투자자산 분석에 포함됨' : '투자자산 분석에서 제외됨'}</p>
    </div>`;
  } else {
    bodyHtml = `<div class="account-detail">
      ${sum.list.length ? `<div class="list">${sum.list.map(assetItem).join('')}</div>` : `<p class="small muted" style="margin:0 0 8px">연결된 자산이 아직 없어요.</p>`}
      <p class="small muted num" style="margin:6px 0 0">평가액 ${won(sum.value)} · 손익 ${sum.cost > 0 ? `${signed(sum.pl, wonShort)} (${signed(sum.plp, x => pct(x))})` : '—'}</p>
    </div>`;
  }
  const memoLine = acc.last4 ? `끝자리 ${esc(acc.last4)}` : acc.note ? esc(acc.note) : '';
  const actions = `<div class="btn-row" style="padding:2px 16px 14px">
      <button type="button" class="btn sm" data-action="account-edit" data-id="${acc.id}">✏️ 수정</button>
      <button type="button" class="btn sm ${acc.status === '해지' ? 'primary' : 'danger'}" data-action="account-toggle-active" data-id="${acc.id}">${acc.status === '해지' ? '▶️ 다시 사용' : '⏸ 비활성화'}</button>
    </div>`;
  return head + bodyHtml + (memoLine ? `<p class="small faint" style="padding:0 16px 4px">${memoLine}</p>` : '') + actions;
}
/* 기록 피로도 줄이기: 자동 시세·예적금이 아닌 "직접 입력" 자산만 전체 수정폼 없이 값 하나만 빠르게 고칠 수 있게 함 */
function quickUpdateEligible(a) {
  if (a.mode === 'amount') return a.dep.kind === 'none';
  if (a.mode === 'qty') return a.src === 'manual';
  return false;
}
function quickUpdateForm(id) {
  const a = S.assets.find(x => x.id === id); if (!a) return;
  const isAmt = a.mode === 'amount';
  const cur = isAmt ? a.amount : a.price;
  const html = `
    <p class="hand muted" style="margin:0 4px 12px">${esc(a.name)}의 ${isAmt ? '잔액' : '현재가'}만 콕 집어 빠르게 고쳐요 ⚡</p>
    <label class="field"><span>${isAmt ? '현재 평가금액 (원)' : `현재가 (${a.cur === 'USD' ? '달러' : '원'})`}</span><input class="input num" inputmode="${isAmt ? 'numeric' : 'decimal'}" id="qu_val" value="${fmtInput(cur)}"></label>
    ${isAmt ? `<label class="check"><input type="checkbox" id="qu_paycount"> <span>📮 이번 납입, 회차 +1 ${a.payCount ? `<small class="faint">(현재 ${a.payCount}회차)</small>` : ''}</span></label>` : ''}
    <p class="hint">이름·분류 등 다른 항목까지 고치려면 이 항목을 눌러서 전체 수정을 열어 주세요.</p>`;
  openSheet(`⚡ ${isAmt ? '잔액' : '시세'} 빠르게 고치기`, html, () => {
    const v = num(val('qu_val'));
    if (isAmt) a.amount = v; else a.price = v;
    if (isAmt && $sheetBody.querySelector('#qu_paycount')?.checked) a.payCount = (a.payCount || 0) + 1;
    a.updatedAt = nowStamp();
    save(); render(); toast('고쳤어요 ✨');
  });
}
function assetItem(a) {
  const v = valueOf(a), c = costOf(a), pl = v - c, plp = c > 0 ? pl / c * 100 : 0;
  let sub = `${PURPOSE_EMO[a.purpose]} ${a.purpose}`;
  if (a.mode === 'qty') sub += ` · ${nf6.format(a.qty)}${qtyUnit(a.cat)} × ${a.cur === 'USD' ? '$' + nf2.format(a.price) : wonShort(a.price) + (a.cat === '원자재' ? '/g' : '')}`;
  if (a.src !== 'manual') sub += ` · ${a.src === 'coingecko' ? '코인시세(자동)' : '주식시세(자동)'}`;
  else if (a.mode === 'qty') sub += ' · 직접입력';
  const di = depInfo(a);
  if (di) sub += ` · ${a.dep.rate}% · ${ddayLabel(di.dday)}`;
  if (a.priceAt && a.priceAt.includes('캡처')) sub += ' · 📷캡처';
  /* 연결된 계좌가 있으면 항상 표시(그룹으로 묶였는지와 무관하게) — 요구사항 E */
  const linkedAccount = a.accountId ? S.accounts.find(x => x.id === a.accountId) : null;
  if (linkedAccount) sub += ` · ${[linkedAccount.institution, linkedAccount.alias].filter(Boolean).join(' ')}`;
  /* sub 한 줄은 CSS가 말줄임표로 잘라서, 개별 기준시각·회차는 안 잘리게 따로 한 줄 더 보여줌 */
  const updatedBits = [];
  if (a.updatedAt) updatedBits.push(`🕰️ ${a.mode === 'amount' ? '직접 입력' : a.src === 'manual' ? '수동 입력' : ''}, ${esc(a.updatedAt)} 고침`);
  if (a.payCount) updatedBits.push(`📮 ${a.payCount}회차`);
  if (a.isResidence) updatedBits.push('🏠 거주용');
  if (a.fxExposure === 'exposed') updatedBits.push('💱 환노출형');
  else if (a.fxExposure === 'hedged') updatedBits.push('💱 환헤지형');
  const updatedLine = updatedBits.length ? `<div class="small faint" style="padding:0 0 4px">${updatedBits.join(' · ')}</div>` : '';
  const hasComp = a.components.length > 0; const open = ui.open[a.id];
  const histOpen = ui.tradeHist[a.id];
  const myTxs = tradeHistory(a.id);
  const valueLine = a.cur === 'USD' ? `$${nf2.format(a.mode === 'qty' ? a.qty * a.price : 0)} (${fxRate('USD') ? won(v) : '환율 받는 중…'})` : won(v);
  const plLine = c > 0 && Math.abs(pl) >= 1
    ? (a.cur === 'USD' && a.mode === 'qty' && a.avgCost > 0
      ? `<div class="sub ${cls(pl)}">${arrow(pl)} ${signed(plp, x => pct(x))} <span class="faint">(현지통화 기준)</span></div><div class="sub faint">원화 환산 ${signed(pl, wonShort)}</div>`
      : `<div class="sub ${cls(pl)}">${arrow(pl)} ${signed(pl, wonShort)} (${signed(plp, x => pct(x))})</div>`)
    : '<div class="sub faint">—</div>';
  return `<button class="item" data-action="edit-asset" data-id="${a.id}">
      <span class="bubble emo" style="background:${soft(catColor(a.cat))}">${CAT_EMO[a.cat]}</span>
      <span class="main"><div class="t">${esc(a.name)}</div><div class="sub">${esc(sub)}</div></span>
      <span class="right num"><div class="t">${valueLine}</div>${plLine}</span>
    </button>
    ${updatedLine}
    ${quickUpdateEligible(a) ? `<button type="button" class="link-btn" style="font-size:12.5px;padding:2px 0 6px" data-action="quick-update" data-id="${a.id}">⚡ ${a.mode === 'amount' ? '잔액' : '시세'} 빠르게 고치기</button>` : ''}
    ${hasComp ?`<div class="comp"><button class="link-btn" style="font-size:12.5px;padding:0 0 4px" data-action="toggle-comp" data-id="${a.id}">${open ? '🧺 구성 접기 ▴' : `🧺 구성 ${a.components.length}개 보기 ▾`}</button>${open ? a.components.map(k => `<div><span>${esc(k.name)}</span><span class="num">${pct(k.pct, 0)} · ${wonShort(v * k.pct / 100)}</span></div>`).join('') : ''}</div>` : ''}
    ${myTxs.length ? `<div class="comp"><button class="link-btn" style="font-size:12.5px;padding:0 0 4px" data-action="toggle-hist" data-id="${a.id}">${histOpen ? '📈 매매 이력 접기 ▴' : `📈 매매 이력 ${myTxs.length}건 보기 ▾`}</button>${histOpen ? `<div class="tbl-wrap"><table class="num" style="font-size:12.5px"><thead><tr><th>날짜</th><th>구분</th><th>수량</th><th>단가</th><th>이후 평단가</th></tr></thead><tbody>${myTxs.map(t => `<tr><td>${esc(t.date)}</td><td>${TX_TYPES[t.type]}</td><td>${nf6.format(t.qty || 0)}</td><td>${t.cur === 'USD' ? '$' + nf2.format(t.price || 0) : won(t.price || 0)}</td><td>${t.cur === 'USD' ? '$' + nf2.format(t.avgAfter) : won(t.avgAfter)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>` : ''}`;
}
/* 자산별 매매 이력 재현: 실제 커밋 순서(created)대로 다시 계산해서 시점별 평단가를 보여줌 */
function tradeHistory(assetId) {
  const txs = S.txs.filter(t => t.assetId === assetId && t.type !== 'div').sort((x, y) => (x.created || 0) - (y.created || 0));
  let qty = 0, avgCost = 0;
  return txs.map(t => {
    if (t.type === 'buy') { const nq = qty + (t.qty || 0); avgCost = nq > 0 ? (qty * avgCost + (t.qty || 0) * (t.price || 0) + (t.fee || 0)) / nq : 0; qty = nq; }
    else if (t.type === 'sell') { qty = Math.max(0, qty - (t.qty || 0)); }
    return { ...t, avgAfter: avgCost, qtyAfter: qty };
  }).reverse();
}

/* P1: 기간별 성과 + 자산군별 기여도 (월간 일기 스냅샷의 byCat을 활용) */
function findSnapshotAtOrBefore(monthStr) {
  const cands = S.snapshots.filter(s => s.month <= monthStr).sort((a, b) => b.month.localeCompare(a.month));
  return cands[0] || null;
}
function returnsCard(T) {
  const cumPct = T.cost > 0 ? T.totalReturn / T.cost * 100 : 0;
  const mPrev = prevSnapshot();
  const monthPct = mPrev && mPrev.total ? (T.value - mPrev.total) / mPrev.total * 100 : null;
  const yBase = periodBaseline('y');
  const yearPct = yBase && yBase.total ? (T.value - yBase.total) / yBase.total * 100 : null;
  const target = Number(S.settings.targetReturnRate) || 0;
  const hasTarget = target > 0;
  const vsTarget = hasTarget && yearPct != null ? yearPct - target : null;
  const row = (label, val, note) => `<div class="hbar" style="grid-template-columns:auto 1fr auto"><span>${label}</span><span></span><span class="num ${val == null ? 'faint' : cls(val)}">${val == null ? '—' : signed(val, x => x.toFixed(1) + '%')}</span></div>${note ? `<p class="small faint" style="margin:-2px 2px 8px">${note}</p>` : ''}`;
  return `<section class="card tape">
    <h3>📈 수익률 한눈에</h3>
    ${row('누적 수익률 (전체 기간)', T.cost > 0 ? cumPct : null, T.cost > 0 ? '평가손익+실현손익+배당·이자 ÷ 투자원금 기준' : '아직 원금이 없어요')}
    ${row('이번 달 수익률', monthPct, monthPct == null ? '전월 말 기록이 아직 없어요(첫 달)' : '전월 말 기록 대비')}
    ${row('최근 12개월 수익률', yearPct, yearPct == null ? `📔 12개월 전 월간 기록이 아직 없어요(지금 ${S.snapshots.length}개월치 · 매달 자동으로 쌓여요)` : '12개월 전 기록 대비 · 그 사이 입출금도 섞여 있어 순수 운용수익률과는 달라요')}
    <div class="hbar" style="grid-template-columns:auto 1fr auto"><span>목표 연수익률</span><span></span><span class="num">${hasTarget ? nf2.format(target) + '%' : '설정 안 함'}</span></div>
    ${hasTarget
      ? (yearPct == null
        ? `<p class="small faint" style="margin:-2px 2px 0">최근 12개월 수익률이 나오면 목표와 비교해 보여드려요.</p>`
        : `<p class="small ${vsTarget >= 0 ? 'up' : 'down'}" style="margin:-2px 2px 0">${vsTarget >= 0 ? '🎉 목표보다' : '🥲 목표보다'} ${Math.abs(vsTarget).toFixed(1)}%p ${vsTarget >= 0 ? '앞서요' : '못 미쳐요'} (최근 12개월 기준)</p>`)
      : `<p class="small faint" style="margin:-2px 2px 0">설정 탭에서 목표 연수익률을 적으면 실제 성과와 비교해드려요.</p>`}
  </section>`;
}
function periodBaseline(key) {
  const cur = monthKey();
  if (key === 'month') return findSnapshotAtOrBefore(shiftMonth(cur, -1));
  if (key === 'q') return findSnapshotAtOrBefore(shiftMonth(cur, -3));
  if (key === 'ytd') return findSnapshotAtOrBefore((new Date().getFullYear() - 1) + '-12');
  if (key === 'y') return findSnapshotAtOrBefore(shiftMonth(cur, -12));
  return S.snapshots.slice().sort((a, b) => a.month.localeCompare(b.month))[0] || null;
}
function perfCard(T) {
  const periods = [['month', '1개월'], ['q', '3개월'], ['ytd', '연초 이후'], ['y', '1년'], ['all', '전체']];
  const seg = `<div class="seg" style="flex-wrap:wrap">${periods.map(([k, l]) => `<button data-action="perf-period" data-k="${k}" class="${ui.perfPeriod === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const base = periodBaseline(ui.perfPeriod);
  if (!base) return `<section class="card tape t2"><h3>📈 기간별 성과</h3>${seg}<p class="small muted" style="margin:8px 0 0">📔 홈 화면의 월간 자산 기록이 서로 다른 두 달 이상 쌓이면(지금 ${S.snapshots.length}개) 이 구간의 증감을 계산해 보여드려요. 이제는 앱을 열기만 해도 자동으로 기록되니 곧 채워질 거예요.</p></section>`;
  const fromDate = base.savedAt ? base.savedAt.slice(0, 10) : (base.month + '-28');
  const diff = T.value - base.total, diffPct = base.total ? diff / base.total * 100 : 0;
  const divInPeriod = S.txs.filter(t => t.type === 'div' && (t.date || '') > fromDate).reduce((s, t) => s + (t.amountKRW || 0), 0);
  const intInPeriod = bookInterestSum(d => d > fromDate);
  const incomeInPeriod = divInPeriod + intInPeriod;
  const realizedInPeriod = S.txs.filter(t => t.type === 'sell' && (t.date || '') > fromDate).reduce((s, t) => s + (t.realizedKRW || 0), 0);
  const other = diff - incomeInPeriod - realizedInPeriod;
  const rows = CATS.map(c => ({ c, d: (T.byCat[c] || 0) - ((base.byCat && base.byCat[c]) || 0) })).filter(r => Math.abs(r.d) >= 1).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  return `<section class="card tape t2">
    <h3>📈 기간별 성과 <small>${esc(base.month)} 대비</small></h3>
    ${seg}
    <div class="stats num" style="margin:10px 0 8px"><div class="stat" style="box-shadow:none;background:var(--card2)"><div class="k">총자산 변동</div><div class="v ${cls(diff)}">${arrow(diff)} ${signed(diff, wonShort)}</div><div class="s ${cls(diff)}">${signed(diffPct, x => pct(x))}</div></div></div>
    <div class="list" style="box-shadow:none;background:var(--card2);margin:0 0 8px">
      <div class="flow-row"><span>${E('🍯')} 배당·이자 수령 <small class="faint">(배당 ${wonShort(divInPeriod)}+이자 ${wonShort(intInPeriod)})</small></span><b class="num up">${signed(incomeInPeriod, wonShort)}</b></div>
      <div class="flow-row"><span>${E('💸')} 실현손익</span><b class="num ${cls(realizedInPeriod)}">${signed(realizedInPeriod, wonShort)}</b></div>
      <div class="flow-row"><span>${E('📊')} 평가액 변동 <small class="faint">(입출금·가격·환율 포함)</small></span><b class="num ${cls(other)}">${signed(other, wonShort)}</b></div>
    </div>
    <div class="section-label" style="margin:6px 0">자산군별 기여도</div>
    <div class="list" style="box-shadow:none;background:var(--card2);margin:0">${rows.length ? rows.map(r => `<div class="hbar" style="grid-template-columns:auto 1fr auto"><span>${CAT_EMO[r.c]} ${r.c}</span><span></span><span class="num ${cls(r.d)}">${arrow(r.d)} ${signed(r.d, wonShort)}</span></div>`).join('') : '<p class="small muted" style="margin:6px 0">변동이 없어요</p>'}</div>
    <p class="small faint" style="margin:8px 2px 0">일기(월간 스냅샷) 기록 시점 기준 근사치예요. 평가액 변동에는 그 기간의 입출금도 섞여 있어, 가격 변동과 환율 변동을 완전히 분리하지는 않았어요.</p>
  </section>`;
}
/* 거래 */
function viewTx() {
  const f = ui.txFilter;
  const seg = `<div class="seg">${[['all', '📚 전체'], ['buy', '🛒 매수'], ['sell', '💸 매도'], ['div', '🍯 배당']].map(([k, l]) => `<button data-action="tx-filter" data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const T = totals();
  const y = new Date().getFullYear();
  const divMonths = Array.from({ length: 12 }, (_, i) => S.txs.filter(t => t.type === 'div' && (t.date || '').startsWith(`${y}-${String(i + 1).padStart(2, '0')}`)).reduce((s, t) => s + (t.amountKRW || 0), 0));
  const intMonths = Array.from({ length: 12 }, (_, i) => bookInterestSum(d => d.startsWith(`${y}-${String(i + 1).padStart(2, '0')}`)));
  const incomeMonths = divMonths.map((v, i) => v + intMonths[i]);
  const dmax = Math.max(...incomeMonths, 1);
  const hasIncome = T.realized !== 0 || T.incomeAll > 0;
  const summary = hasIncome ? `<section class="card tape t3">
    <h3>🍀 수익 요약</h3>
    <div class="stats num" style="margin:0">
      <div class="stat" style="box-shadow:none;background:var(--card2)"><div class="k">💸 실현손익 (누적)</div><div class="v ${cls(T.realized)}">${signed(T.realized, wonShort)}</div></div>
      <div class="stat" style="box-shadow:none;background:var(--card2)"><div class="k">🍯 ${y}년 배당·이자</div><div class="v">${wonShort(T.incomeYear)}</div><div class="s faint">배당 ${wonShort(T.divYear)} + 이자 ${wonShort(T.intYear)}</div></div>
    </div>
    <div class="months" style="height:90px;margin-top:8px">${incomeMonths.map((v, i) => `<div class="m" title="${i + 1}월 ${won(v)} (배당 ${won(divMonths[i])} + 이자 ${won(intMonths[i])})"><div class="col" style="height:${v / dmax * 100}%;${v ? '' : 'opacity:.15'}"></div><div class="lab">${i + 1}</div></div>`).join('')}</div>
    <p class="small faint" style="margin:6px 2px 0">배당은 거래일기, 이자는 가계부 "이자수입(예금·적금)" 기록을 합친 값이에요.</p>
    <p class="hand faint" style="margin:6px 0 0">월별 꿀단지 🍯 (${y}년)</p>
  </section>` : `<section class="card tape t3 no-print" style="opacity:.6">
    <h3>🍀 수익 요약</h3>
    <p class="small muted" style="margin:0">첫 매도나 배당을 기록하면 이곳에 실현손익·배당 현황이 나타나요.</p>
  </section>`;
  const list = S.txs.filter(t => f === 'all' || t.type === f).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0));
  if (!S.txs.length) return asOfLine() + summary + `<div class="card tape empty"><span class="big-emo emo">📒</span><b>아직 거래 일기가 없어요</b>✏️ 버튼으로 🛒 매수 · 💸 매도 · 🍯 배당을 적으면<br>수량이랑 평균단가가 알아서 바뀌어요.</div>`;
  return asOfLine() + perfCard(T) + summary + seg + (list.length ? `<div class="list">${list.map(txItem).join('')}</div>` : `<p class="hand faint" style="text-align:center">여기엔 아직 아무것도 없어요 🍃</p>`);
}
function daysSince(dateStr) { return Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 864e5); }
function retroMilestones(t) {
  if (!t.thesis && !t.reason) return [];
  const done = new Set((t.retro || []).map(r => r.days));
  return [30, 90].filter(d => daysSince(t.date) >= d && !done.has(d));
}
function txItem(t) {
  const a = S.assets.find(x => x.id === t.assetId);
  const name = a ? a.name : (t.assetName || '(삭제된 자산)');
  const pill = { buy: 'buy', sell: 'sell', div: 'div' }[t.type];
  let sub = t.date || '';
  let right = '';
  if (t.type === 'div') { right = `<div class="t">${won(t.amountKRW)}</div>${t.cur === 'USD' ? `<div class="sub">$${nf2.format(t.amount)}</div>` : ''}${t.reinvestDiv ? '<div class="sub faint">🔁 재투자</div>' : ''}`; }
  else if (t.mode === 'amount') { right = `<div class="t">${won(t.amount)}</div>`; }
  else {
    const p = t.cur === 'USD' ? '$' + nf2.format(t.price) : won(t.price);
    const unit = a ? qtyUnit(a.cat) : '주';
    sub += ` · ${nf6.format(t.qty)}${unit} × ${p}${a && a.cat === '원자재' ? '/g' : ''}`;
    const localTotal = t.qty * t.price;
    right = `<div class="t">${dualCur(localTotal, t.cur)}</div>`;
  }
  if (t.type === 'sell' && t.realizedKRW) right += `<div class="sub ${cls(t.realizedKRW)}">${arrow(t.realizedKRW)} 실현 ${signed(t.realizedKRW, wonShort)}</div>`;
  if (t.memo) sub += ` · ${t.memo}`;
  if (t.reason) sub += ` · 🏷️${esc(t.reason)}`;
  const due = retroMilestones(t);
  const retroHtml = (t.thesis || t.sellRule || (t.retro && t.retro.length) || due.length) ? `<div class="comp" style="padding:6px 0 0 4px">
    ${t.thesis ? `<div><span class="faint">🤔 투자 가설</span></div><div style="grid-column:1/-1">${esc(t.thesis)}</div>` : ''}
    ${t.sellRule ? `<div><span class="faint">🚪 매도 기준</span></div><div style="grid-column:1/-1">${esc(t.sellRule)}</div>` : ''}
    ${t.conviction ? `<div><span class="faint">💪 확신도</span><span>${'⭐'.repeat(t.conviction)}</span></div>` : ''}
    ${(t.retro || []).map(r => `<div><span class="faint">📝 ${r.days}일 회고</span></div><div style="grid-column:1/-1">${esc(r.note)}</div>`).join('')}
    ${due.length ? `<button type="button" class="btn sm" data-action="retro-open" data-id="${t.id}" data-d="${due[0]}" style="margin-top:6px">🔁 ${due[0]}일 회고 남기기</button>` : ''}
  </div>` : '';
  return `<button class="item" data-action="edit-tx" data-id="${t.id}">
    <span class="bubble emo" style="background:var(--${t.type === 'buy' ? 'bad-soft' : t.type === 'sell' ? 'sky' : 'butter'})">${TX_EMO[t.type]}</span>
    <span class="main"><div class="t">${esc(name)} <span class="pill ${pill}" style="font-size:11px;padding:2px 7px">${TX_TYPES[t.type]}</span></div><div class="sub">${esc(sub)}</div></span>
    <span class="right num">${right}</span></button>${retroHtml}`;
}

/* 리밸런싱 */
function viewRebal() {
  const T = totals();
  const tg = S.settings.targets;
  const sum = CATS.reduce((s, c) => s + (Number(tg[c]) || 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.01;
  const rows = gapRows(T, ui.gapRelative);
  const emptyCount = rows.filter(r => r.status === 'empty').length;
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.gap)), 5);

  const targetsCard = `<section class="card tape t2">
    <h3>🎯 목표 비중 <small>${CATS.every(c => (Number(tg[c]) || 0) === (DEFAULT_TARGETS[c] || 0)) ? '공격형·장기 기본값' : '내가 정한 비중'}</small></h3>
    ${CATS.map(c => `<div class="target-row"><span>${E(CAT_EMO[c])} ${c}</span>
      <input class="input num" inputmode="decimal" data-target="${c}" value="${tg[c] ?? 0}" aria-label="${c} 목표 %"></div>
      ${c === '암호화폐' && Number(tg[c]) > 10 ? `<p class="small up" style="margin:-2px 2px 8px">⚠️ 암호화폐는 변동성이 커서 목표비중을 10% 이하로 두는 걸 권장해요.</p>` : ''}`).join('')}
    <div class="sumline"><span>합계 <b class="num ${sumOk ? '' : 'up'}">${nf2.format(sum)}%</b> ${sumOk ? '<span class="pill ok">👌 딱 좋아요</span>' : '<span class="pill high">🙈 100%가 아니에요</span>'}</span>
      <span class="btn-row">${sumOk ? '' : '<button class="btn sm primary" data-action="normalize">🪄 100%로</button>'}<button class="btn sm" data-action="reset-targets">↩️ 기본값</button></span></div>
    <div class="sumline"><span class="small muted">허용 오차 (±%p)</span><input class="input num" style="width:92px;padding:8px 10px;text-align:right" inputmode="decimal" data-band value="${S.settings.band}"></div>
  </section>`;

  if (!S.assets.length) return targetsCard + `<div class="card tape empty"><span class="big-emo emo">⚖️</span><b>보물함부터 채워 주세요</b>그러면 목표랑 얼마나 차이 나는지 계산해 줄게요.</div>`;

  const sortedRows = rows.slice().sort((a, b) => (a.status === 'empty') - (b.status === 'empty'));
  const gapTable = `<section class="card tape">
    <h3>📏 목표랑 차이 <small>총자산 ${wonShort(T.value)} 기준</small></h3>
    ${emptyCatNote(T)}
    ${emptyCount ? `<div class="btn-row" style="margin:0 0 10px;align-items:center">${gapModeToggle()}<button class="btn sm no-print" data-action="apply-held-targets">🎯 이 비율을 내 목표로 저장</button></div>` : ''}
    <p class="small faint" style="margin:0 0 8px">금액(예: "채우려면 187만")은 지금 총자산 ${wonShort(T.value)}${ui.gapRelative ? `과 보유 중인 ${heldCount(T)}개 분류끼리 다시 맞춘 목표 비중` : '과 아래 목표 비중(합계 100% 기준)'}을 곱해서 계산한 값이에요.</p>
    <div class="tbl-wrap"><table class="num"><thead><tr><th>분류</th><th>현재</th><th>목표</th><th style="text-align:left">격차</th></tr></thead><tbody>
    ${sortedRows.map(r => {
      const w = Math.abs(r.gap) / maxAbs * 50;
      const bar = r.gap >= 0 ? `left:50%;width:${w}%;background:var(--up)` : `right:50%;width:${w}%;background:var(--down)`;
      return `<tr ${r.status === 'empty' ? 'style="opacity:.55"' : ''}><td>${CAT_EMO[r.c]} ${r.c}</td><td>${pct(r.curP)}</td><td>${nf2.format(r.tgt)}%</td>
      <td class="gapcell">${STATUS_EMO[r.status]} ${r.status === 'empty' ? '<span class="faint">미보유</span>' : `<b class="${r.status === 'ok' ? '' : r.status === 'low' ? 'down' : 'up'}">${STATUS_LABEL[r.status]}</b> ` + signed(r.gap, x => x.toFixed(1) + '%p')}<div class="gapbar"><i style="${bar}"></i></div><div class="faint" style="font-size:11px;margin-top:2px">${r.status === 'empty' ? `채우려면 ${wonShort(Math.abs(r.gapWon))}` : signed(r.gapWon, wonShort)}</div></td></tr>`; }).join('')}
    </tbody></table></div>
  </section>`;

  const mode = ui.rebalMode;
  const plan = sumOk ? rebalPlan(T, mode, ui.extra) : null;
  const m = monthKey(); const investable = monthSums(m).left;
  const modeInfo = {
    add: { label: '이번 달 투자 가능 금액을 부족한 자산군에 우선 배분해요. 장기 적립식 투자에 적합해요.' },
    cashonly: { label: '매도 없이, 보유 현금성 자산만 활용해 부족한 자산군을 채워요. 세금·거래비용을 최소화하는 방식이에요.' },
    full: { label: '매수·매도를 포함해 모든 분류를 목표 비중에 정확히 맞춰요. 전략 변경·위험 관리가 필요할 때 적합해요.' }
  };
  const planCard = `<section class="card tape t3">
    <h3>🛍️ 이렇게 해보면 어때요?</h3>
    <div class="seg" style="flex-wrap:wrap"><button data-action="rebal-mode" data-m="add" class="${mode === 'add' ? 'on' : ''}">🐷 신규자금 배분</button><button data-action="rebal-mode" data-m="cashonly" class="${mode === 'cashonly' ? 'on' : ''}">🧺 매도 없이 조정</button><button data-action="rebal-mode" data-m="full" class="${mode === 'full' ? 'on' : ''}">⚡ 즉시 복원</button></div>
    ${mode === 'add' ? `<label class="field"><span>💌 이번에 넣을 금액 (원)</span><input class="input num" inputmode="numeric" data-extra value="${fmtInput(ui.extra)}" placeholder="예: 1,000,000"></label>` : ''}
    <p class="hint">${modeInfo[mode].label}</p>
    ${mode === 'add' ? `<p class="small faint" style="margin:-6px 2px 8px">참고: 이번 달 가계부 기준 투자 가능 금액은 <b class="num">${won(Math.max(0, investable))}</b>이에요.${!S.book.entries.length ? ' (가계부에 아직 기록이 없어서 0원으로 나와요 — 실제 투자 여력이 없다는 뜻이 아니에요. 가계부 탭에서 수입·지출을 적으면 계산돼요.)' : investable <= 0 ? ' (이번 달 가계부 기록 기준으로는 남는 돈이 없어요.)' : ''}</p>` : ''}
    ${mode === 'cashonly' ? `<p class="small faint" style="margin:-6px 2px 8px">현재 현금성자산 보유액 <b class="num">${wonShort(T.byCat['현금성자산'] || 0)}</b> 안에서만 조정해요.</p>` : ''}
    ${!sumOk ? `<p class="small up">🙈 목표 비중 합계를 100%로 맞춰야 계산할 수 있어요.</p>` : planHtml(plan, T)}
    <p class="small faint" style="margin:8px 2px 0">⚠️ 이 계산은 목표 비중에 따른 참고용 결과이며 투자 권유가 아니에요. 최종 판단과 책임은 본인에게 있어요.</p>
  </section>`;

  return asOfLine() + gapTable + planCard + targetsCard;
}

/* 매도 제안에 대한 근사 세금·수수료 (설정에서 조정 가능) */
function estTaxFee(cat, amt) {
  if (amt >= 0) return null;
  const rate = num(S.settings.taxRates[cat]);
  const cost = Math.abs(amt) * rate / 100;
  const notes = { '해외주식': '양도소득세 근사치 (연 250만원 기본공제 미반영 — 실제는 더 적을 수 있어요)', '국내주식': '증권거래세+수수료 근사치', '암호화폐': '과세 시행 여부가 유동적이라 0원으로 두었어요. 세법 변경을 확인하세요' };
  return { rate, cost, note: notes[cat] || '' };
}
function rebalPlan(T, mode, extra) {
  const tg = S.settings.targets;
  if (mode === 'full') {
    return CATS.map(c => ({ c, amt: tg[c] / 100 * T.value - T.byCat[c] })).filter(r => Math.abs(r.amt) >= 1);
  }
  if (mode === 'cashonly') {
    const avail = Math.max(0, T.byCat['현금성자산'] || 0);
    if (!avail) return [];
    const def = CATS.filter(c => c !== '현금성자산').map(c => ({ c, d: Math.max(0, tg[c] / 100 * T.value - T.byCat[c]) }));
    const dsum = def.reduce((s, r) => s + r.d, 0);
    if (!dsum) return [];
    const out = dsum <= avail ? def.map(r => ({ c: r.c, amt: r.d })) : def.map(r => ({ c: r.c, amt: r.d / dsum * avail }));
    const used = out.reduce((s, r) => s + r.amt, 0);
    if (used >= 1) out.push({ c: '현금성자산', amt: -used });
    return out.filter(r => Math.abs(r.amt) >= 1);
  }
  // add: 신규자금만 배분
  const X = Math.max(0, extra || 0);
  if (!X) return [];
  const newTotal = T.value + X;
  const def = CATS.map(c => ({ c, d: Math.max(0, tg[c] / 100 * newTotal - T.byCat[c]) }));
  const dsum = def.reduce((s, r) => s + r.d, 0);
  let out;
  if (dsum >= X) out = def.map(r => ({ c: r.c, amt: dsum ? r.d / dsum * X : 0 }));
  else {
    const rest = X - dsum;
    out = def.map(r => ({ c: r.c, amt: r.d + rest * (tg[r.c] / 100) }));
  }
  return out.filter(r => r.amt >= 1);
}
function planHtml(plan, T) {
  if (!plan || !plan.length) return `<p class="small muted" style="margin:0">${ui.rebalMode === 'add' ? '💌 금액을 넣으면 어디에 얼마씩 넣을지 알려줄게요' : ui.rebalMode === 'cashonly' ? '🧺 활용할 현금성자산이 없거나 이미 균형이 맞아요' : '😊 이미 목표 비중과 똑같아요!'}</p>`;
  const totalCost = plan.reduce((s, r) => { const t = estTaxFee(r.c, r.amt); return s + (t ? t.cost : 0); }, 0);
  const rowsHtml = plan.sort((a, b) => b.amt - a.amt).map(r => {
    const assets = S.assets.filter(a => a.cat === r.c);
    const tot = assets.reduce((s, a) => s + valueOf(a), 0);
    const hints = assets.map(a => {
      const share = tot > 0 ? valueOf(a) / tot : 1 / assets.length;
      const amt = r.amt * share;
      let q = '';
      if (a.mode === 'qty' && a.price > 0 && fxRate(a.cur) > 0) q = ` ≈ ${nf2.format(Math.abs(amt) / (a.price * fxRate(a.cur)))}주`;
      return `<div><span>${esc(a.name)}</span><span class="num">${signed(amt, wonShort)}${q}</span></div>`;
    }).join('');
    const tax = estTaxFee(r.c, r.amt);
    const after = (T.byCat[r.c] || 0) + r.amt;
    const afterPct = T.value ? after / T.value * 100 : 0;
    return `<div class="item" style="display:block">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span><span class="pill ${r.amt > 0 ? 'buy' : 'sell'}">${r.amt > 0 ? '🛒 사기' : r.c === '현금성자산' ? '🧺 사용' : '💸 팔기'}</span> <b>${CAT_EMO[r.c]} ${r.c}</b></span><b class="num ${cls(r.amt)}">${won(Math.abs(r.amt))}</b></div>
      ${hints ? `<div class="comp" style="padding:6px 0 0 4px">${hints}</div>` : `<div class="small faint" style="margin-top:4px">🫙 아직 이 분류에 담긴 자산이 없어요</div>`}
      <div class="small faint" style="margin-top:4px">거래 후 비중 ≈ ${pct(afterPct)}${tax && tax.cost > 0 ? ` · 예상 세금·수수료 ${won(tax.cost)}(${nf2.format(tax.rate)}%)` : ''}</div>
      ${tax && tax.note ? `<div class="small faint">${esc(tax.note)}</div>` : ''}
    </div>`; }).join('');
  return `<div class="list" style="box-shadow:none;background:var(--card2);margin:0">${rowsHtml}</div>
    ${totalCost > 0 ? `<p class="small up" style="margin:8px 2px 0">예상 세금·수수료 합계 <b class="num">${won(totalCost)}</b> (근사치, 설정에서 세율 조정 가능)</p>` : ''}
    <p class="small faint" style="margin:8px 2px 0">분류 안에서는 현재 보유 비율대로 나눴어요. 주수는 현재 시세 기준 대략값이에요.</p>`;
}

/* 예적금 카드 */
function savingsCard(compact) {
  const list = S.assets.map(a => ({ a, di: depInfo(a) })).filter(x => x.di).sort((x, y) => x.a.dep.end.localeCompare(y.a.dep.end));
  if (!list.length) return compact ? '' : `<section class="card tape t2"><h3>🏦 예적금 현황</h3><p class="small muted" style="margin:0">예금·적금을 보물로 넣을 때 “💵 금액으로” → 🏦 예적금 정보에 금리·만기를 적으면 만기 때 받을 돈을 계산해 줄게요.</p></section>`;
  const sumPaid = list.reduce((s, x) => s + x.di.paid, 0), sumMat = list.reduce((s, x) => s + x.di.maturity, 0), sumInt = list.reduce((s, x) => s + x.di.afterTax, 0);
  const rows = (compact ? list.filter(x => x.di.dday >= 0).slice(0, 3) : list).map(({ a, di }) => `
    <button class="dep-row" data-action="edit-asset" data-id="${a.id}">
      <div class="dep-top"><span class="t">${di.saving ? '🐷' : '🏦'} ${esc(a.name)}</span><span class="pill ${di.dday <= 30 && di.dday >= 0 ? 'high' : 'ok'}">${ddayLabel(di.dday)}</span></div>
      <div class="dep-mid small muted"><span>${di.saving ? `월 ${wonShort(a.dep.monthly)} 적금` : '예금'} · 연 ${a.dep.rate}% ${a.dep.interest === 'compound' ? '월복리' : '단리'}</span><span>${esc(a.dep.end)} 만기</span></div>
      <div class="progress thin"><div style="width:${di.progress}%"></div></div>
      <div class="dep-bot"><span class="small muted">지금까지 ${wonShort(di.paid)}${di.hasManual ? ' ✏️' : ''}</span><span>만기 받을 돈 <b class="num">${won(di.maturity)}</b></span></div>
      ${compact ? '' : `<div class="small faint" style="text-align:right">원금 ${won(di.principalTotal)} + 이자 ${won(di.interest)} − 세금 ${won(di.tax)} (${TAX[a.dep.tax][0]})</div>`}
      ${(!compact && di.hasManual && di.paidDiff !== 0) ? `<div class="small ${di.paidDiff > 0 ? 'up' : 'down'}" style="text-align:right">⚠️ 자동계산과 ${won(Math.abs(di.paidDiff))} 차이가 있어 직접 입력값을 사용 중이에요</div>` : ''}
    </button>`).join('');
  if (compact && !rows) return '';
  return `<section class="card tape t2">
    <h3>🏦 예적금 ${compact ? '만기 달력' : '현황'} ${compact ? `<button class="link-btn" style="font-size:14px" data-action="go" data-tab="assets">전체 ›</button>` : `<small>${list.length}개</small>`}</h3>
    ${compact ? '' : `<div class="mini-stats num"><div><span>넣은 돈</span><b>${wonShort(sumPaid)}</b></div><div><span>세후 이자</span><b class="up">+${wonShort(sumInt)}</b></div><div><span>만기 합계</span><b>${wonShort(sumMat)}</b></div></div>`}
    <div class="dep-list">${rows}</div>
    <p class="small faint" style="margin:8px 2px 0">예상액은 월 단위 표준식으로 계산한 참고값이에요. 실제 금액은 은행의 일할 계산·중도해지 조건에 따라 조금 달라요. 🏦 실제로 이자를 받으면 가계부의 "이자수입(예금·적금)"에 기록해 주세요 — 여기 표시된 예상 이자와는 다를 수 있어요.</p>
  </section>`;
}

/* ───────── 가계부 ───────── */
function curBookMonth() { return ui.bookMonth || monthKey(); }
function shiftMonth(m, k) { const [y, mo] = m.split('-').map(Number); return monthKey(new Date(y, mo - 1 + k, 1)); }
/* 가계부에 "이자수입(예금·적금)"으로 기록된 금액만 골라 합산 — pred(dateStr)로 기간을 지정 (배당은 거래일기 쪽 divKRW* 계열과 항상 분리해서 계산해요) */
function bookInterestSum(pred) {
  return S.book.entries.reduce((s, e) => (e.group === 'income' && e.cat === BOOK_INTEREST_CAT && pred(e.date || '') ? s + e.amount : s), 0);
}
function monthSums(m) {
  const r = { income: 0, fixed: 0, variable: 0, saving: 0, byCat: {} };
  for (const e of S.book.entries) {
    if (!(e.date || '').startsWith(m)) continue;
    r[e.group] += e.amount;
    if (e.group !== 'income') { const k = e.group + '|' + e.cat; r.byCat[k] = (r.byCat[k] || 0) + e.amount; }
  }
  r.spend = r.fixed + r.variable; r.free = r.income - r.spend; r.left = r.free - r.saving;
  r.saveRate = r.income > 0 ? r.saving / r.income * 100 : 0;
  return r;
}
function pendingRecurring(m) {
  return S.book.recurring.filter(rc => !S.book.entries.some(e => e.recurId === rc.id && (e.date || '').startsWith(m)));
}
function bookMini() {
  if (!S.book.entries.length && !S.book.recurring.length) return '';
  const m = monthKey(), r = monthSums(m);
  return `<section class="card tape">
    <h3>💰 이번 달 가계부 <button class="link-btn" style="font-size:14px" data-action="go" data-tab="book">자세히 ›</button></h3>
    ${flowBar(r)}
    <div class="flow-legend small num">${GROUPS.slice(1).map(g => `<span><i style="background:${BOOK[g].color}"></i>${BOOK[g].label} ${wonShort(r[g])}</span>`).join('')}<span><i style="background:var(--card2);border:1px solid var(--line)"></i>남은 돈 ${wonShort(Math.max(0, r.left))}</span></div>
  </section>`;
}
function flowBar(r) {
  const base = Math.max(r.income, r.spend + r.saving, 1);
  const seg = g => `<i style="width:${r[g] / base * 100}%;background:${BOOK[g].color}"></i>`;
  return `<div class="flowbar">${seg('fixed')}${seg('variable')}${seg('saving')}</div>`;
}

/* ───────── P1: 다가오는 일정 + 현금흐름 예측 ───────── */
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nextRecurDate(rc) {
  const now = new Date(); const todayD = now.getDate();
  let y = now.getFullYear(), mo = now.getMonth();
  if (rc.day < todayD) { mo += 1; if (mo > 11) { mo = 0; y++; } }
  const last = new Date(y, mo + 1, 0).getDate();
  return new Date(y, mo, Math.min(rc.day, last));
}
function upcomingEvents(daysAhead = 60) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const events = [];
  for (const rc of S.book.recurring) {
    const d = nextRecurDate(rc);
    const days = Math.round((d - now) / 864e5);
    if (days > daysAhead) continue;
    events.push({ date: ymd(d), days, emo: bookEmo(rc.group, rc.cat), label: rc.memo || rc.cat, amount: rc.amount, sign: rc.group === 'income' ? 1 : -1 });
  }
  for (const a of S.assets) {
    const di = depInfo(a);
    if (di && di.dday >= 0 && di.dday <= daysAhead) events.push({ date: a.dep.end, days: di.dday, emo: di.saving ? '🐷' : '🏦', label: `${a.name} 만기`, amount: di.maturity, sign: 1, isMaturity: true });
  }
  events.sort((a, b) => a.days - b.days);
  return events;
}
function upcomingMini() {
  const ev = upcomingEvents(30).slice(0, 3);
  if (!ev.length) return '';
  return `<section class="card tape">
    <h3>📅 다가오는 일정 <button class="link-btn" style="font-size:14px" data-action="go" data-tab="book">자세히 ›</button></h3>
    <div class="list" style="box-shadow:none;background:var(--card2);margin:0">${ev.map(e => `<div class="item" style="display:flex;align-items:center;gap:10px"><span class="bubble emo" style="background:var(--card)">${e.emo}</span><span class="main"><div class="t">${esc(e.label)}</div><div class="sub">${ddayLabel(e.days)} · ${esc(e.date)}</div></span><span class="right num ${e.sign > 0 ? 'up' : ''}">${e.sign > 0 ? '+' : '−'}${wonShort(e.amount)}</span></div>`).join('')}</div>
  </section>`;
}
/* 향후 n개월 뒤 현금흐름 추정: 최근 3개월 평균(변동비) + 매달 반복 항목(수입·고정비·저축) + 예정된 예적금 만기 유입 */
function projectMonth(offset) {
  const base = forecastBase();
  const recentSums = base.keys.map(k => monthSums(k));
  const avg = key => recentSums.reduce((s, r) => s + r[key], 0) / recentSums.length;
  const recurSum = g => S.book.recurring.filter(x => x.group === g).reduce((s, x) => s + x.amount, 0);
  const income = recurSum('income') || avg('income');
  const fixed = recurSum('fixed') || avg('fixed');
  const variable = avg('variable');
  const saving = recurSum('saving') || avg('saving');
  const targetMonth = shiftMonth(monthKey(), offset);
  const maturityInflow = S.assets.reduce((s, a) => { const di = depInfo(a); return (di && a.dep.end && a.dep.end.slice(0, 7) === targetMonth) ? s + di.maturity : s; }, 0);
  const left = income - fixed - variable - saving + maturityInflow;
  return { month: targetMonth, income, fixed, variable, saving, maturityInflow, left };
}
/* 예측 기준 달: 지난 3개월 중 기록이 있는 달만 평균. 지난달 기록이 전혀 없으면(앱을 막 쓰기 시작) 이번 달 기록을 씀 */
function forecastBase() {
  const past = [-3, -2, -1].map(k => shiftMonth(monthKey(), k)).filter(k => S.book.entries.some(e => e.date.startsWith(k)));
  if (past.length) return { keys: past, label: `최근 ${past.length}개월 평균 기반` };
  return { keys: [monthKey()], label: '이번 달 기록 기반(아직 지난달 기록 없음)' };
}
function forecastCard() {
  const hasData = S.book.entries.length >= 3 || S.book.recurring.length;
  if (!hasData) return `<section class="card tape t2"><h3>🔮 현금흐름 예측</h3><p class="small muted" style="margin:0">가계부 기록이나 매달 반복 항목이 좀 쌓이면 앞으로 3·6개월 현금흐름을 추정해 줄게요.</p></section>`;
  const rows = [1, 2, 3, 4, 5, 6].map(projectMonth);
  const sum3 = rows.slice(0, 3).reduce((s, r) => s + r.left, 0);
  const sum6 = rows.reduce((s, r) => s + r.left, 0);
  const mx = Math.max(...rows.map(r => Math.max(r.income, r.fixed + r.variable + r.saving)), 1);
  return `<section class="card tape t2">
    <h3>🔮 현금흐름 예측</h3>
    <p class="small faint" style="margin:-4px 2px 8px">${forecastBase().label}</p>
    <div class="stats num" style="margin:0 0 10px">
      <div class="stat" style="box-shadow:none;background:var(--card2)"><div class="k">3개월 뒤 예상 순현금</div><div class="v ${cls(sum3)}" style="font-size:18px">${signed(sum3, wonShort)}</div></div>
      <div class="stat" style="box-shadow:none;background:var(--card2)"><div class="k">6개월 뒤 예상 순현금</div><div class="v ${cls(sum6)}" style="font-size:18px">${signed(sum6, wonShort)}</div></div>
    </div>
    <div class="pairs">${rows.map(r => `<div class="pair"><div class="bars"><i class="inc" style="height:${r.income / mx * 100}%"></i><i class="exp" style="height:${(r.fixed + r.variable + r.saving) / mx * 100}%"></i></div><div class="lab">${Number(r.month.slice(5))}월</div><div class="net num ${cls(r.left)}">${signed(r.left, wonShort)}</div></div>`).join('')}</div>
    <div class="flow-legend small"><span><i style="background:${BOOK.income.color}"></i>예상 수입</span><span><i style="background:${BOOK.variable.color}"></i>예상 고정+변동+저축</span></div>
    <p class="small faint" style="margin:8px 2px 0">기록이 있는 최근 달의 평균(변동비)과 매달 반복 항목(수입·고정비·저축), 예정된 예적금 만기 유입을 더해 만든 추정치예요. 실제와 다를 수 있어요.</p>
  </section>`;
}
function viewBook() {
  const m = curBookMonth(), r = monthSums(m);
  const [yy, mm] = m.split('-').map(Number);
  const pend = pendingRecurring(m);
  const nav = `<div class="month-nav"><button class="icon-btn" data-action="book-month" data-k="-1" aria-label="이전 달">◀</button><b>${yy}년 ${mm}월</b><button class="icon-btn" data-action="book-month" data-k="1" aria-label="다음 달">▶</button></div>`;
  const line = (emo, label, v, sign, strong) => `<div class="flow-row ${strong ? 'strong' : ''}"><span>${E(emo)} ${label}</span><b class="num ${sign < 0 ? 'down' : sign > 0 ? 'up' : ''}">${sign < 0 ? '−' : sign > 0 ? '+' : ''}${won(Math.abs(v))}</b></div>`;
  const flow = `<section class="card tape">
    <h3>🌊 월 현금흐름표 <small>저축률 ${pct(r.saveRate, 0)}</small></h3>
    ${line('💵', '수입', r.income, 1)}
    ${line('🧾', '고정비', r.fixed, -1)}
    ${line('🛍️', '변동비', r.variable, -1)}
    <div class="flow-row sum"><span>${E(r.free >= 0 ? '😊' : '😰')} 쓰고 남은 돈<br><small class="faint">수입 − 고정비 − 변동비</small></span><b class="num ${cls(r.free)}">${signed(r.free)}</b></div>
    ${line('🐷', '저축·투자', r.saving, -1)}
    <div class="flow-row sum strong"><span>${E(r.left >= 0 ? '👛' : '🚨')} 이번 달 남은 현금</span><b class="num ${cls(r.left)}">${signed(r.left)}</b></div>
    ${r.income > 0 ? flowBar(r) + `<div class="flow-legend small num">${GROUPS.slice(1).map(g => `<span><i style="background:${BOOK[g].color}"></i>${BOOK[g].label} ${pct(r[g] / r.income * 100, 0)}</span>`).join('')}</div>` : ''}
  </section>`;
  const budget = S.book.budget;
  const bRate = budget > 0 ? r.variable / budget * 100 : 0;
  const budgetCard = `<section class="card tape t3">
    <h3>🛍️ 변동비 예산 <button class="link-btn" style="font-size:14px" data-action="book-budget">${budget ? '고치기' : '정하기'}</button></h3>
    ${budget ? `<div class="num" style="display:flex;justify-content:space-between;font-size:14px"><span class="hand">${bRate > 100 ? '🙀 예산 초과!' : bRate > 80 ? '🥺 조금만 아껴요' : '😊 잘하고 있어요'}</span><span class="muted">${wonShort(r.variable)} / ${wonShort(budget)}</span></div>
      <div class="progress ${bRate > 100 ? 'over' : ''}"><div style="width:${Math.min(100, bRate)}%"></div></div>
      <div class="small muted">${bRate <= 100 ? `남은 예산 <b class="num">${won(budget - r.variable)}</b>` : `<span class="up">${won(r.variable - budget)} 넘었어요</span>`}</div>`
      : `<p class="small muted" style="margin:0">한 달 변동비(식비·쇼핑 등) 예산을 정하면 얼마나 썼는지 보여줄게요.</p>`}
  </section>`;
  const cats = Object.entries(r.byCat).sort((a, b) => b[1] - a[1]);
  const cmax = Math.max(...cats.map(c => c[1]), 1);
  const catCard = cats.length ? `<section class="card tape t2">
    <h3>📊 어디에 썼을까? <small>지출 ${wonShort(r.spend + r.saving)}</small></h3>
    ${cats.map(([k, v]) => { const [g, c] = k.split('|'); return `<div class="hbar" style="grid-template-columns:118px 1fr auto"><span>${E(bookEmo(g, c))} ${esc(c)}</span><div class="track"><div class="fill" style="width:${v / cmax * 100}%;background:${BOOK[g].color}"></div></div><span class="num">${wonShort(v)}</span></div>`; }).join('')}
  </section>` : '';
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(m, i - 5));
  const ms = months.map(k => monthSums(k));
  const mmax = Math.max(...ms.map(x => Math.max(x.income, x.spend)), 1);
  const trend = `<section class="card tape">
    <h3>📆 최근 6개월 <small>수입 vs 소비</small></h3>
    <div class="pairs">${months.map((k, i) => `<div class="pair ${k === m ? 'cur' : ''}"><div class="bars"><i class="inc" style="height:${ms[i].income / mmax * 100}%"></i><i class="exp" style="height:${ms[i].spend / mmax * 100}%"></i></div><div class="lab">${Number(k.slice(5))}월</div><div class="net num ${cls(ms[i].free)}">${ms[i].income || ms[i].spend ? signed(ms[i].free, wonShort) : '·'}</div></div>`).join('')}</div>
    <div class="flow-legend small"><span><i style="background:${BOOK.income.color}"></i>수입</span><span><i style="background:${BOOK.variable.color}"></i>고정+변동비</span><span class="faint">숫자 = 쓰고 남은 돈</span></div>
  </section>`;
  const pendBanner = pend.length ? `<div class="banner warn">${E('🔁')}<span style="flex:1">매달 반복 항목 <b>${pend.length}개</b>가 ${mm}월에 아직 안 적혔어요 (${pend.slice(0, 3).map(x => esc(x.cat)).join(', ')}${pend.length > 3 ? ' …' : ''})</span><button class="btn sm primary" data-action="book-apply-recur">한번에 적기</button></div>` : '';
  const entries = S.book.entries.filter(e => (e.date || '').startsWith(m)).sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  const byDay = {};
  entries.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
  const list = entries.length ? Object.entries(byDay).map(([d, es]) => {
    const dt = new Date(d); const dayIn = es.filter(e => e.group === 'income').reduce((s, e) => s + e.amount, 0), dayOut = es.filter(e => e.group !== 'income').reduce((s, e) => s + e.amount, 0);
    return `<div class="group-head"><span class="hand">${dt.getDate()}일 ${'일월화수목금토'[dt.getDay()]}요일</span><span class="num small">${dayIn ? `<span class="up">+${wonShort(dayIn)}</span> ` : ''}${dayOut ? `−${wonShort(dayOut)}` : ''}</span></div>
    <div class="list">${es.map(e => `<button class="item" data-action="book-edit" data-id="${e.id}"><span class="bubble emo" style="background:${soft(BOOK[e.group].color)}">${bookEmo(e.group, e.cat)}</span><span class="main"><div class="t">${esc(e.memo || e.cat)}</div><div class="sub">${BOOK[e.group].label} · ${esc(e.cat)}${e.recurId ? ' · 🔁' : ''}</div></span><span class="right num"><div class="t ${e.group === 'income' ? 'up' : ''}">${e.group === 'income' ? '+' : '−'}${won(e.amount)}</div></span></button>`).join('')}</div>`;
  }).join('') : `<div class="card tape empty"><span class="big-emo emo">💰</span><b>${mm}월 가계부가 비어 있어요</b>✏️ 버튼으로 수입·지출을 적어 보세요.<br>월세·통신비 같은 건 “매달 반복”으로 한 번만 등록하면 편해요.</div>`;
  const recur = S.book.recurring.length ? `<section class="card">
    <h3>🔁 매달 반복 <small>나가는 돈 ${wonShort(S.book.recurring.filter(x => x.group !== 'income').reduce((s, x) => s + x.amount, 0))} 나가요</small></h3>
    ${S.book.recurring.slice().sort((a, b) => a.day - b.day).map(x => `<div class="recur-row"><span>${E(bookEmo(x.group, x.cat))} <b>${esc(x.memo || x.cat)}</b> <span class="small faint">매달 ${x.day}일</span></span><span class="num ${x.group === 'income' ? 'up' : ''}">${x.group === 'income' ? '+' : '−'}${wonShort(x.amount)} <button class="x-btn" data-action="book-del-recur" data-id="${x.id}" aria-label="반복 해제">✕</button></span></div>`).join('')}
  </section>` : '';
  const evAll = upcomingEvents(90);
  const upcomingFull = evAll.length ? `<section class="card tape">
    <h3>📅 다가오는 일정 <small>90일 이내</small></h3>
    <div class="list" style="box-shadow:none;background:var(--card2);margin:0">${evAll.map(e => `<div class="item" style="display:flex;align-items:center;gap:10px"><span class="bubble emo" style="background:var(--card)">${e.emo}</span><span class="main"><div class="t">${esc(e.label)}</div><div class="sub">${ddayLabel(e.days)} · ${esc(e.date)}</div></span><span class="right num ${e.sign > 0 ? 'up' : ''}">${e.sign > 0 ? '+' : '−'}${wonShort(e.amount)}</span></div>`).join('')}</div>
  </section>` : '';
  return nav + pendBanner + flow + budgetCard + forecastCard() + upcomingFull + catCard + trend + `<div class="section-label">📒 ${mm}월 기록</div>` + list + recur;
}

function bookForm(e) {
  const isNew = !e;
  e = e || { group: 'variable', cat: '식비', date: curBookMonth() === monthKey() ? today() : curBookMonth() + '-01', amount: 0, memo: '' };
  const rc = e.recurId ? S.book.recurring.find(x => x.id === e.recurId) : null;
  const html = `
    <div class="seg" id="b_group">${GROUPS.map(g => `<button type="button" data-g="${g}" class="${e.group === g ? 'on' : ''}">${BOOK[g].emo} ${BOOK[g].label}</button>`).join('')}</div>
    <label class="field"><span id="b_amountLabel">금액 (원)</span><input class="input num big-input" inputmode="numeric" id="b_amount" value="${fmtInput(e.amount)}" placeholder="0"></label>
    <div class="field"><span>분류</span><div class="chips" id="b_cats"></div></div>
    <p class="hint" id="finIncomeNote" hidden>🏦 "이자수입(예금·적금)"에는 파킹통장·예금·적금에서 받은 이자만 적어주세요. 📈 주식·ETF·펀드 배당은 여기 말고 거래일기 탭에서 "🍯 배당"으로 기록해야 연간 배당·총수익 계산에 잡혀요(이중 입력 방지). 💸 투자 매도로 생긴 실현손익도 가계부엔 넣지 않아요 — 거래일기의 투자성과로 따로 관리돼요. 팁: 매달 비슷한 이자를 받는다면 아래 "매달 반복 항목으로도 등록"에 체크해두면 다음 달부턴 확인만 누르면 돼요.</p>
    <div class="row2">
      <label class="field"><span>날짜</span><input class="input" type="date" id="b_date" value="${esc(e.date)}"></label>
      <label class="field"><span>메모</span><input class="input" id="b_memo" value="${esc(e.memo)}" placeholder="예: 점심, 월세"></label>
    </div>
    <p class="small faint" id="b_dateNote" style="margin:-6px 2px 8px"></p>
    ${isNew ? `<label class="check"><input type="checkbox" id="b_recur"> <span>🔁 매달 반복 항목으로도 등록 <small class="faint">(월세·통신비·월급·적금 등)</small></span></label>` : rc ? `<p class="hint">🔁 매달 ${rc.day}일 반복 항목에서 만든 기록이에요.</p>` : ''}
    ${isNew ? '' : `<button class="btn danger block" data-action="book-del" data-id="${e.id}">🗑️ 기록 지우기</button>`}`;
  openSheet(isNew ? '💰 가계부 적기' : '✏️ 가계부 고치기', html, () => {
    const group = $sheetBody.querySelector('#b_group .on').dataset.g;
    const catEl = $sheetBody.querySelector('#b_cats .on');
    const amount = num(val('b_amount')), date = val('b_date') || today();
    if (amount <= 0) { toast('금액을 입력하세요'); return false; }
    const next = { ...e, group, cat: catEl ? catEl.dataset.c : BOOK[group].cats[0][0], amount, date, memo: val('b_memo').trim() };
    if (isNew) {
      next.id = uid(); next.created = Date.now();
      if ($sheetBody.querySelector('#b_recur').checked) {
        const r0 = { id: uid(), group: next.group, cat: next.cat, amount, memo: next.memo, day: Number(date.slice(8, 10)) || 1 };
        S.book.recurring.push(r0); next.recurId = r0.id;
      }
      S.book.entries.push(next);
    } else S.book.entries[S.book.entries.findIndex(x => x.id === e.id)] = next;
    ui.bookMonth = date.slice(0, 7);
    save(); render(); toast(isNew ? `${bookEmo(group, next.cat)} 가계부에 적었어요` : '고쳤어요 ✨');
  });
  const drawCats = (g, sel) => {
    const isIncome = g === 'income';
    $sheetBody.querySelector('#b_cats').innerHTML = BOOK[g].cats.map(([c, emo], i) => `<button type="button" class="chip ${(sel ? c === sel : i === 0) ? 'on' : ''}" data-c="${c}">${emo} ${c}</button>`).join('');
    $sheetBody.querySelector('#finIncomeNote').hidden = !isIncome;
  };
  drawCats(e.group, e.cat);
  $sheetBody.querySelector('#b_group').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    $sheetBody.querySelectorAll('#b_group button').forEach(x => x.classList.toggle('on', x === b)); drawCats(b.dataset.g);
  });
  $sheetBody.querySelector('#b_cats').addEventListener('click', ev => {
    const b = ev.target.closest('.chip'); if (!b) return;
    $sheetBody.querySelectorAll('#b_cats .chip').forEach(x => x.classList.toggle('on', x === b));
  });
  /* 지금 보고 있는 달(◀▶로 이동한 달)과 다른 날짜로 저장하면, 홈 화면 "이번 달 가계부" 카드엔 안 잡혀서 헷갈릴 수 있어 미리 알려줌 */
  const drawDateNote = () => {
    const dv = val('b_date'); const ym = dv.slice(0, 7);
    const note = $sheetBody.querySelector('#b_dateNote');
    note.textContent = ym && ym !== monthKey() ? `📅 ${ym.replace('-', '년 ')}월 기록으로 들어가요 · 홈 화면 "이번 달 가계부" 카드는 이번 달(${monthKey().replace('-', '년 ')}월) 기록만 보여줘요` : '';
  };
  $sheetBody.querySelector('#b_date').addEventListener('change', drawDateNote);
  drawDateNote();
}
function applyRecurring(m) {
  const pend = pendingRecurring(m); let n = 0;
  const [y, mo] = m.split('-').map(Number); const last = new Date(y, mo, 0).getDate();
  for (const rc of pend) {
    const d = `${m}-${String(Math.min(rc.day, last)).padStart(2, '0')}`;
    S.book.entries.push({ id: uid(), created: Date.now(), group: rc.group, cat: rc.cat, amount: rc.amount, memo: rc.memo, date: d, recurId: rc.id }); n++;
  }
  save(); render(); toast(`🔁 ${n}개 한번에 적었어요`);
}

/* ───────── 캡처로 시세 반영 ───────── */
let cap = { img: null, rows: [], extra: [] };
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('스크립트를 불러오지 못했어요')); document.head.appendChild(el);
  });
}
function imageToCanvas(img, maxSide, minWidth = 0) {
  let w = img.naturalWidth, h = img.naturalHeight;
  let k = Math.min(1, maxSide / Math.max(w, h));
  if (minWidth && w * k < minWidth) k = Math.min(minWidth / w, 3);
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); return c;
}
function normName(x) { return String(x || '').toLowerCase().replace(/[\s()\[\]·.,\-_/]/g, ''); }
function matchAsset(name, ticker) {
  const qa = S.assets.filter(a => a.mode === 'qty');
  const t = String(ticker || '').toUpperCase().split(':')[0];
  if (t) { const f = qa.find(a => a.symbol && a.symbol.toUpperCase().split(':')[0] === t); if (f) return f; }
  const n = normName(name); if (n.length < 2) return null;
  return qa.find(a => normName(a.name) === n) || qa.find(a => { const an = normName(a.name); return an.length >= 2 && (n.includes(an) || an.includes(n)); }) || null;
}
function captureForm() {
  cap = { img: null, rows: [], extra: [] };
  if (!S.assets.some(a => a.mode === 'qty')) { toast('먼저 “수량 × 가격” 종목을 보물함에 넣어 주세요'); return; }
  const hasKey = !!S.settings.claudeKey;
  const html = `
    <p class="hand muted" style="margin:0 4px 12px">증권앱 보유종목 화면을 캡처해서 올려 주세요 📸</p>
    <label class="upload" id="capDrop"><input type="file" accept="image/*" id="capFile" hidden><span id="capPh">🖼️ 사진 앨범에서 캡처 고르기</span><img id="capPreview" alt="캡처 미리보기" hidden></label>
    <label class="field"><span>종가 기준일</span><input class="input" type="date" id="capDate" value="${today()}"></label>
    <div class="btn-row">
      <button type="button" class="btn" style="flex:1" id="capOcr" disabled>🔍 폰에서 읽기 <small class="faint">무료</small></button>
      <button type="button" class="btn primary" style="flex:1" id="capAi" disabled>🤖 AI로 읽기</button>
    </div>
    <p class="hint" style="margin-top:8px">${hasKey ? '🤖 AI는 더 정확하지만 캡처가 Anthropic으로 전송되고 소액 API 요금이 들어요.' : '🤖 AI로 읽기는 설정에 Claude API 키를 넣으면 쓸 수 있어요.'} 🔍 폰에서 읽기는 처음 한 번 인식 데이터(약 10MB)를 받아요.</p>
    <div id="capStatus" class="small muted"></div>
    <div id="capResult"></div>`;
  openSheet('📷 캡처로 시세 반영', html, () => applyCapture(), '반영하기');
  document.getElementById('sheetSave').hidden = true;
  const fileEl = $sheetBody.querySelector('#capFile');
  fileEl.addEventListener('change', () => {
    const f = fileEl.files[0]; if (!f) return;
    const url = URL.createObjectURL(f); const img = $sheetBody.querySelector('#capPreview');
    img.onload = () => { cap.img = img; $sheetBody.querySelector('#capOcr').disabled = false; $sheetBody.querySelector('#capAi').disabled = !S.settings.claudeKey; };
    img.src = url; img.hidden = false; $sheetBody.querySelector('#capPh').hidden = true;
    $sheetBody.querySelector('#capResult').innerHTML = ''; document.getElementById('sheetSave').hidden = true;
  });
  $sheetBody.querySelector('#capOcr').addEventListener('click', () => runCapture('ocr'));
  $sheetBody.querySelector('#capAi').addEventListener('click', () => runCapture('ai'));
}
async function runCapture(kind) {
  const st = $sheetBody.querySelector('#capStatus');
  const btns = [$sheetBody.querySelector('#capOcr'), $sheetBody.querySelector('#capAi')];
  btns.forEach(b => b.disabled = true);
  try {
    if (!navigator.onLine) throw new Error('인터넷 연결이 필요해요');
    if (kind === 'ocr') {
      st.textContent = '🔍 글자 인식 준비 중… (처음엔 조금 걸려요)';
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      const worker = await Tesseract.createWorker('kor+eng', 1, { logger: m => { if (m.status === 'recognizing text') st.textContent = `🔍 읽는 중… ${Math.round(m.progress * 100)}%`; } });
      const { data } = await worker.recognize(imageToCanvas(cap.img, 3000, 1400));
      await worker.terminate();
      cap.rows = parseOcrText(data.text); cap.extra = [];
      st.textContent = cap.rows.length ? `✅ ${cap.rows.length}개 종목을 찾았어요. 가격을 확인해 주세요.` : '🥺 보유 종목 이름을 찾지 못했어요. 자산 이름을 증권앱 표기와 똑같이 맞추거나 🤖 AI로 읽기를 써 보세요.';
    } else {
      st.textContent = '🤖 AI가 캡처를 읽는 중…';
      const items = await askClaude(cap.img);
      const built = buildFromAi(items); cap.rows = built.rows; cap.extra = built.extra;
      st.textContent = `✅ ${items.length}개 항목을 읽었어요 (보물함과 연결 ${cap.rows.length}개).`;
    }
    drawCaptureRows();
  } catch (e) { st.innerHTML = `<span class="up">🙈 ${esc(e.message || e)}</span>`; }
  finally { btns[0].disabled = false; btns[1].disabled = !S.settings.claudeKey; }
}
// OCR 텍스트 → 보유 종목별 가격 후보
function parseOcrText(text) {
  const lines = String(text).split(/\n+/).map(x => x.trim()).filter(Boolean);
  const rows = [];
  for (const a of S.assets.filter(x => x.mode === 'qty')) {
    const an = normName(a.name), sym = (a.symbol || '').toUpperCase().split(':')[0];
    const idx = lines.findIndex(l => { const ln = normName(l); return (an.length >= 2 && ln.includes(an)) || (sym && sym.length >= 2 && l.toUpperCase().split(/[^A-Z0-9]+/).includes(sym)); });
    if (idx < 0) continue;
    const win = lines.slice(idx, idx + 4).join(' ');
    const rest = win.slice(win.toLowerCase().indexOf(a.name.toLowerCase()) >= 0 ? win.toLowerCase().indexOf(a.name.toLowerCase()) + a.name.length : 0);
    const nums = []; let qtyFound = 0;
    const re = /([+\-−▲▼]?)\s*\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(%|주|개|원|달러)?/g; let mt;
    while ((mt = re.exec(rest))) {
      const v = Number(mt[2].replace(/,/g, '')); if (!isFinite(v) || v <= 0) continue;
      if (mt[3] === '%') continue;
      if (mt[3] === '주' || mt[3] === '개') { qtyFound = qtyFound || v; continue; }
      if (mt[1]) continue; // 등락폭은 제외
      nums.push(v);
    }
    const qty = qtyFound || a.qty;
    const cands = [];
    for (const v of nums) {
      cands.push({ price: v, label: '현재가로 읽음' });
      if (qty > 0 && v / qty >= 0.01) cands.push({ price: v / qty, label: `평가금액 ÷ ${nf6.format(qty)}주` });
    }
    const seen = new Set(); const uniq = cands.filter(c => { const k = c.price.toFixed(4); if (seen.has(k)) return false; seen.add(k); return true; });
    if (!uniq.length) continue;
    const ref = a.price > 0 ? a.price : 0;
    uniq.sort((x, y) => ref ? Math.abs(Math.log(x.price / ref)) - Math.abs(Math.log(y.price / ref)) : 0);
    rows.push({ assetId: a.id, cands: uniq.slice(0, 6), price: uniq[0].price, qty: qtyFound && qtyFound !== a.qty ? qtyFound : 0, src: lines.slice(idx, idx + 2).join(' / ') });
  }
  return rows;
}
async function askClaude(img) {
  const c = imageToCanvas(img, 1568);
  const b64 = c.toDataURL('image/jpeg', 0.88).split(',')[1];
  const prompt = `이 이미지는 증권사 앱의 보유 종목 화면 캡처입니다. 화면에 보이는 모든 종목을 JSON 배열로만 답하세요. 다른 말은 쓰지 마세요.
형식: [{"name":"종목명","ticker":"티커 또는 null","price":현재가 또는 종가 숫자 또는 null,"value":평가금액 숫자 또는 null,"quantity":보유수량 숫자 또는 null,"currency":"KRW" 또는 "USD"}]
숫자는 쉼표 없이 숫자로. 등락률·손익은 넣지 마세요. 보이지 않는 값은 null.`;
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 90000);
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': S.settings.claudeKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: S.settings.claudeModel || DEFAULT_MODEL, max_tokens: 4000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: prompt }] }] })
    });
  } finally { clearTimeout(tm); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI 오류 (${res.status}) ${j.error && j.error.message ? j.error.message.slice(0, 120) : ''}`);
  const text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('AI 답에서 종목 목록을 찾지 못했어요');
  const arr = JSON.parse(m[0]);
  if (!Array.isArray(arr)) throw new Error('AI 답 형식이 달라요');
  return arr;
}
function aiPriceFor(it, a) {
  let p = num(it.price), q = num(it.quantity) || a.qty;
  if (!p && num(it.value) && q > 0) p = num(it.value) / q;
  if (!p) return 0;
  const cur = it.currency === 'USD' ? 'USD' : 'KRW';
  if (cur !== a.cur) { const fx = fxRate('USD'); if (!fx) return 0; p = cur === 'USD' ? p * fx : p / fx; }
  return p;
}
function buildFromAi(items) {
  const rows = [], extra = [], used = new Set();
  for (const it of items) {
    const a = matchAsset(it.name, it.ticker);
    if (a && !used.has(a.id)) {
      used.add(a.id);
      const p = aiPriceFor(it, a);
      const cands = [];
      if (num(it.price)) cands.push({ price: aiPriceFor({ ...it, value: null }, a), label: '현재가' });
      if (num(it.value) && (num(it.quantity) || a.qty)) cands.push({ price: aiPriceFor({ ...it, price: null }, a), label: '평가금액 ÷ 수량' });
      const seenP = new Set();
      rows.push({ assetId: a.id, cands: cands.filter(c => c.price > 0 && !seenP.has(c.price.toFixed(4)) && seenP.add(c.price.toFixed(4))), price: p, qty: num(it.quantity) && num(it.quantity) !== a.qty ? num(it.quantity) : 0, src: `${it.name}${it.ticker ? ' (' + it.ticker + ')' : ''}` });
    } else extra.push(it);
  }
  return { rows, extra };
}
function drawCaptureRows() {
  const box = $sheetBody.querySelector('#capResult');
  if (!cap.rows.length && !cap.extra.length) { box.innerHTML = ''; return; }
  const qAssets = S.assets.filter(a => a.mode === 'qty');
  box.innerHTML = `<div class="section-label" style="margin-top:14px">✅ 확인하고 반영해요</div>
    <div class="list">${cap.rows.map((r, i) => { const a = S.assets.find(x => x.id === r.assetId); const unit = a.cur === 'USD' ? '$' : '원';
      return `<div class="cap-row" data-i="${i}">
        <label class="check" style="margin:0"><input type="checkbox" data-cap-on checked> <b>${CAT_EMO[a.cat]} ${esc(a.name)}</b></label>
        <div class="small faint" style="margin:2px 0 6px">📄 ${esc(r.src).slice(0, 70)}</div>
        <div class="row2" style="align-items:end">
          <label class="field" style="margin:0"><span>지금 ${a.cur === 'USD' ? '$' + nf2.format(a.price) : won(a.price)} →</span><input class="input num" inputmode="decimal" data-cap-price value="${nf2.format(Math.round(r.price * 100) / 100)}"></label>
          ${r.cands.length > 1 ? `<label class="field" style="margin:0"><span>다른 후보</span><select class="input" data-cap-cand>${r.cands.map(c => `<option value="${c.price}">${unit === '$' ? '$' + nf2.format(c.price) : nf0.format(c.price) + '원'} · ${esc(c.label)}</option>`).join('')}</select></label>` : `<span class="small faint" style="padding-bottom:12px">단위: ${unit}</span>`}
        </div>
        ${a.price > 0 && r.price > 0 && Math.abs(Math.log(r.price / a.price)) > Math.log(1.5) ? `<div class="small up" style="margin-top:6px">🤔 기존 가격과 차이가 커요. 숫자를 한 번 더 확인해 주세요.</div>` : ''}
        ${r.qty ? `<label class="check" style="margin:8px 0 0"><input type="checkbox" data-cap-qty> <span class="small">수량도 캡처대로 ${nf6.format(r.qty)}${qtyUnit(a.cat)}로 맞추기 (지금 ${nf6.format(a.qty)})</span></label>` : ''}
      </div>`; }).join('')}</div>
    ${cap.extra.length ? `<div class="section-label">🔗 보물함과 연결 안 된 종목</div><div class="list">${cap.extra.map((it, i) => `<div class="cap-row" data-x="${i}"><b>${esc(it.name || '?')}</b> <span class="small faint">${it.price ? nf2.format(num(it.price)) : ''} ${it.currency || ''}</span>
      <label class="field" style="margin:6px 0 0"><span>연결할 보물</span><select class="input" data-cap-link><option value="">연결 안 함</option>${qAssets.filter(a => !cap.rows.some(r => r.assetId === a.id)).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label></div>`).join('')}</div>` : ''}`;
  document.getElementById('sheetSave').hidden = false;
  box.querySelectorAll('[data-cap-cand]').forEach(sel => sel.addEventListener('change', () => {
    sel.closest('.cap-row').querySelector('[data-cap-price]').value = nf2.format(Math.round(Number(sel.value) * 100) / 100);
  }));
  box.querySelectorAll('[data-cap-link]').forEach(sel => sel.addEventListener('change', () => {
    if (!sel.value) return;
    const it = cap.extra[Number(sel.closest('.cap-row').dataset.x)]; const a = S.assets.find(x => x.id === sel.value);
    cap.rows.push({ assetId: a.id, cands: [], price: aiPriceFor(it, a), qty: num(it.quantity) && num(it.quantity) !== a.qty ? num(it.quantity) : 0, src: it.name || '' });
    cap.extra.splice(Number(sel.closest('.cap-row').dataset.x), 1);
    drawCaptureRows();
  }));
}
function applyCapture() {
  const date = val('capDate') || today(); let n = 0;
  $sheetBody.querySelectorAll('.cap-row[data-i]').forEach(row => {
    if (!row.querySelector('[data-cap-on]').checked) return;
    const r = cap.rows[Number(row.dataset.i)]; const a = S.assets.find(x => x.id === r.assetId);
    const p = num(row.querySelector('[data-cap-price]').value); if (!(p > 0) || !a) return;
    a.price = p; a.priceAt = `${date} 종가(캡처)`;
    const q = row.querySelector('[data-cap-qty]'); if (q && q.checked && r.qty > 0) a.qty = r.qty;
    n++;
  });
  if (!n) { toast('반영할 항목을 골라 주세요'); return false; }
  save(); render(); toast(`📷 ${n}개 종목 시세를 반영했어요`);
}

/* 설정 */
function viewSettings() {
  const s = S.settings;
  return `
  <div class="section-label">🎨 꾸미기</div>
  <section class="card" style="margin-top:8px">
    <div class="seg" style="margin:0">${[['system', '📱 자동'], ['light', '🌞 낮'], ['dark', '🌙 밤']].map(([k, l]) => `<button data-action="theme" data-v="${k}" class="${s.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  </section>

  <div class="section-label">🏷️ 섹터·국가 분류 기준</div>
  <section class="card" style="margin-top:8px">
    <p class="small muted" style="margin:0">자산 화면의 국내주식·해외주식 "섹터별 보기"는 GICS(글로벌 산업 분류 기준)의 11개 섹터를 우리말로 옮긴 것이고, 지수형·채권형 ETF처럼 한 섹터로 묶기 어려운 상품은 "지수형 ETF(혼합)"·"채권형 ETF"로 따로 두었어요(엄격한 GICS 기준은 아니고 이 앱에서 보기 편하게 정리한 임의 분류예요). "국가별 보기"는 종목이 속한 시장/거래소 기준의 대략적인 구분이에요. 나중에 분류 기준이 바뀌면 여기에 다시 안내할게요.</p>
  </section>

  <div class="section-label">🎯 목표</div>
  <section class="card" style="margin-top:8px">
    ${s.goals.length ? s.goals.map(g => `<button class="btn block" style="margin:0 0 8px" data-action="goal-edit" data-id="${g.id}">${goalIcon(g)} ${esc(g.name)} 목표 고치기</button>`).join('') : '<p class="small muted" style="margin:0 0 10px">아직 만든 목표가 없어요.</p>'}
    <button class="btn sm ${s.goals.length ? '' : 'primary'} block" style="margin:0" data-action="goal-edit" data-id="">➕ 목표 추가</button>
  </section>

  <div class="section-label">📈 목표 연수익률</div>
  <section class="card" style="margin-top:8px">
    <div class="sumline"><span class="small muted">연 목표 수익률 (%)</span><input class="input num" style="width:92px;padding:8px 10px;text-align:right" inputmode="decimal" data-targetreturn value="${s.targetReturnRate || ''}" placeholder="예: 6"></div>
    <p class="hint" style="margin-top:8px">홈 화면의 "수익률 한눈에" 카드에서 최근 12개월 수익률과 비교해 보여드려요. 참고로 보수적 3%·중간 6%·공격적 9% 정도가 흔히 쓰이는 가정치예요.</p>
  </section>

  <div class="section-label">📡 시세·환율</div>
  <section class="card" style="margin-top:8px">
    <label class="field"><span>Twelve Data API 키 (주식·ETF 시세용)</span>
      <input class="input" id="twelveKey" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.twelveKey)}" placeholder="twelvedata.com에서 무료 발급"></label>
    <p class="hint">국내주식(코스피·코스닥 전종목)과 해외주식(S&P500·나스닥100)은 무료 시세 서버에서 받아오기 때문에 이 키가 없어도 돼요. 키는 금(XAU/USD)이나 그 밖의 해외 거래소 종목에만 쓰여요. 키는 이 기기에만 저장되고, 무료 키는 분당 8회 제한이 있어요. 코인(CoinGecko)과 환율도 키가 필요 없어요.</p>
    <label class="field"><span>달러 환율 직접 입력 (비워두면 자동)</span>
      <input class="input num" id="fxManual" inputmode="decimal" value="${s.fxManual || ''}" placeholder="${S.fx.USD ? '자동: ' + nf2.format(S.fx.USD) : '예: 1,380'}"></label>
    <label class="field"><span>🤖 Claude API 키 (캡처 AI 인식용, 선택)</span>
      <input class="input" id="claudeKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.claudeKey)}" placeholder="sk-ant-… (platform.claude.com에서 발급)"></label>
    <label class="field"><span>AI 모델</span><input class="input" id="claudeModel" autocapitalize="off" spellcheck="false" value="${esc(s.claudeModel || DEFAULT_MODEL)}"></label>
    <p class="hint">키는 이 기기에만 저장되고 백업 파일에는 빠져요. 캡처 1장당 몇십 원 정도 요금이 나와요. 사용 한도를 콘솔에서 꼭 정해 두세요.</p>
    <button class="btn primary block" data-action="save-api">저장</button>
  </section>

  <div class="section-label">🔒 잠금·보안</div>
  <section class="card" style="margin-top:8px">
    <div class="num" style="display:flex;justify-content:space-between;align-items:center">
      <span>${s.lock.enabled ? '🔐 앱 잠금 켜짐' : '🔓 앱 잠금 꺼짐'}</span>
      <button class="btn sm ${s.lock.enabled ? 'danger' : 'primary'}" data-action="${s.lock.enabled ? 'lock-off' : 'lock-setup'}">${s.lock.enabled ? '끄기' : 'PIN 설정하기'}</button>
    </div>
    ${s.lock.enabled ? `<p class="hint" style="margin-top:8px">앱을 다시 열 때 PIN을 물어봐요.</p>
      <button class="btn block" style="margin-top:8px" data-action="lock-setup">🔁 PIN 바꾸기</button>` : '<p class="hint" style="margin-top:8px">PIN을 설정하면 앱을 다시 열 때 잠금화면이 나타나요. 이 기기의 브라우저 저장소를 완전히 대체하지는 않지만, 화면을 슬쩍 보는 것 정도는 막아줘요.</p>'}
    <p class="hint" style="margin-top:8px">🔑 PIN을 잊어버렸다면? 이 화면에서 앱을 지울 수는 없으니, 백업 파일이 있다면 앱을 삭제 후 다시 설치해 백업을 가져오면서 PIN을 새로 설정하세요. 백업이 없다면 iOS 설정 앱에서 이 홈 화면 앱을 삭제한 뒤 다시 추가하면 데이터가 초기화되며 PIN도 새로 설정할 수 있어요(단, 백업 없이 지우면 기존 데이터는 복구할 수 없어요).</p>
  </section>

  <div class="section-label">💾 백업</div>
  <section class="card" style="margin-top:8px">
    <p class="small muted" style="margin:0 0 10px">데이터는 이 아이폰의 앱 저장소에만 있어요. 기기 변경·앱 삭제에 대비해 주기적으로 파일로 보관하세요.<br>마지막 백업: <b>${s.lastBackup ? esc(s.lastBackup.slice(0, 10)) : '없음'}</b></p>
    <div class="btn-row"><button class="btn primary" style="flex:1" data-action="export">📤 내보내기</button><button class="btn" style="flex:1" data-action="import">📥 가져오기</button></div>
    <p class="hint" style="margin-top:8px">내보낼 때 비밀번호를 입력하면 파일이 암호화돼요(AES-256). API 키는 백업에 포함되지 않아요.</p>
  </section>

  <div class="section-label">⚖️ 리밸런싱 세율 (근사치)</div>
  <section class="card" style="margin-top:8px">
    ${CATS.filter(c => c !== '기타').map(c => `<div class="target-row"><span>${CAT_EMO[c]} ${c}</span><input class="input num" inputmode="decimal" data-taxrate="${c}" value="${s.taxRates[c] ?? 0}" aria-label="${c} 세율 %"></div>`).join('')}
    <p class="hint" style="margin-top:6px">매도 제안 시 예상 세금·수수료를 계산하는 데 쓰는 근사 세율(%)이에요. 실제 세율은 보유기간·공제·개정 세법에 따라 달라질 수 있어요.</p>
    <p class="small up" style="margin:6px 2px 0">⚠️ 원자재(금)를 실물(골드바 등)로 인출하면 이 세율과 별도로 부가가치세 10%가 붙을 수 있어요. 현금으로만 매도할 때는 해당되지 않아요.</p>
  </section>

  <div class="section-label">🗂️ 데이터</div>
  <section class="card" style="margin-top:8px">
    <p class="small muted" style="margin:0 0 10px">자산 ${S.assets.length}개 · 거래 ${S.txs.length}건 · 가계부 ${S.book.entries.length}건 · 일기 ${S.snapshots.length}개 · 목표 ${s.goals.length}개</p>
    <button class="btn danger block" style="margin:0" data-action="reset-all">🧹 모든 데이터 지우기</button>
  </section>
  <p class="small faint" style="margin:18px 4px;text-align:center">🧪 ${APP_VERSION_LABEL} (${APP_BUILD}) · 실제 데이터와 분리 저장 · 내 폰에만 저장돼요</p>
  <p class="small faint" style="margin:4px 4px 18px;text-align:center">Asset Note © 2026 cotmoool-dev.<br>개인 자산 기록 및 분석용 도구입니다.<br>투자 판단과 책임은 사용자 본인에게 있습니다.</p>`;
}

/* ───────── 시트(폼) ───────── */
const $sheet = document.getElementById('sheet');
const $sheetBody = document.getElementById('sheetBody');
let sheetSave = null;
function openSheet(title, html, onSave, saveLabel = '저장') {
  document.getElementById('sheetTitle').textContent = title;
  $sheetBody.innerHTML = html;
  const sv = document.getElementById('sheetSave');
  sv.textContent = saveLabel; sv.hidden = !onSave;
  sheetSave = onSave;
  $sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  const tEl = document.getElementById('toast'); tEl.hidden = true; clearTimeout(toastTimer);
}
function closeSheet() { $sheet.hidden = true; sheetSave = null; document.body.style.overflow = ''; }
document.getElementById('sheetSave').addEventListener('click', () => { if (sheetSave && sheetSave() !== false) closeSheet(); });
const val = id => { const el = $sheetBody.querySelector('#' + id); return el ? el.value : ''; };
const opts = (arr, sel, emo = {}) => arr.map(x => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${emo[x] ? emo[x] + ' ' : ''}${esc(x)}</option>`).join('');

/* "+ 새 계좌 추가"로 자산폼 → 계좌폼으로 넘어갈 때, 지금까지 입력한 값을 잃지 않기 위한 스냅샷(요구사항 #9) —
 * id가 있는 입력·선택 요소를 통째로 읽어서 나중에 assetForm(a, draft)로 그대로 되돌려 놓음 */
function collectAssetFormDraft() {
  const draft = {};
  $sheetBody.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
    draft[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  draft.__mode = $sheetBody.querySelector('#f_modeSeg .on')?.dataset.m;
  draft.__depKind = $sheetBody.querySelector('#d_kind .on')?.dataset.k;
  draft.__components = [...$sheetBody.querySelectorAll('.comp-edit')].map(r => ({ name: r.querySelector('[data-cn]').value, pct: r.querySelector('[data-cp]').value }));
  return draft;
}
/* draft(collectAssetFormDraft의 결과)를 방금 새로 그린 자산폼 DOM에 되돌려 채움 — 값은 직접 넣고,
 * 의존 UI(보이기/숨기기 등)는 기존 change/click 리스너를 그대로 재사용하도록 이벤트를 다시 발생시킴 */
function applyDraftToForm(draft) {
  Object.keys(draft).forEach(k => {
    if (k.startsWith('__')) return;
    const el = $sheetBody.querySelector('#' + k);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!draft[k]; else el.value = draft[k];
  });
  if (draft.__components) {
    const cl = $sheetBody.querySelector('#compList');
    if (cl) cl.innerHTML = draft.__components.map(c => compRow({ name: c.name, pct: num(c.pct) })).join('');
  }
  if (draft.__mode) { const b = $sheetBody.querySelector(`#f_modeSeg [data-m="${draft.__mode}"]`); if (b) b.click(); }
  if (draft.__depKind) { const b = $sheetBody.querySelector(`#d_kind [data-k="${draft.__depKind}"]`); if (b) b.click(); }
  ['f_cat', 'f_src'].forEach(id => { const el = $sheetBody.querySelector('#' + id); if (el) el.dispatchEvent(new Event('change', { bubbles: true })); });
}
/* 자산 등록폼의 "보유 계좌" 드롭다운 — 최근 사용 계좌 우선, DB형 퇴직연금·해지 계좌 제외, 맨 끝에 "+ 새 계좌 추가"(요구사항 #9, D) */
function buildAccountOptions(currentId) {
  const { ordered, extra } = accountOptionsFor(currentId);
  const hasAny = ordered.length > 0 || !!extra;
  const rows = [];
  rows.push(`<option value="" ${currentId ? '' : 'selected'}>${hasAny ? '계좌를 선택하세요' : '계좌 없음 (나중에 연결 가능)'}</option>`);
  if (extra) rows.push(`<option value="${extra.id}" ${currentId === extra.id ? 'selected' : ''}>${esc(extra.institution)} ${esc(extra.alias)} · ${esc(extra.type)} (${esc(extra.status)})</option>`);
  ordered.forEach(acc => rows.push(`<option value="${acc.id}" ${acc.id === currentId ? 'selected' : ''}>${esc(acc.institution)} ${esc(acc.alias)} · ${esc(acc.type)}</option>`));
  rows.push(`<option value="__new__">➕ 새 계좌 추가</option>`);
  return { html: rows.join(''), hasAny };
}
function assetForm(a, draftOverride) {
  const isNew = !a;
  a = a || normAsset({ cat: '해외주식', purpose: '기타', mode: 'qty' });
  const accOpts = buildAccountOptions(a.accountId);
  const html = `
    <label class="field"><span>이름</span><input class="input" id="f_name" value="${isNew ? '' : esc(a.name)}" placeholder="예: S&P500 ETF, 청약통장"></label>
    <div class="row2">
      <label class="field"><span>분류</span><select class="input" id="f_cat">${opts(CATS, a.cat, CAT_EMO)}</select></label>
      <label class="field"><span>목적</span><select class="input" id="f_purpose">${opts(PURPOSES, a.purpose, PURPOSE_EMO)}</select></label>
    </div>
    <label class="field" id="accountWrap"><span>보유 계좌${accOpts.hasAny ? '' : ' (선택)'}</span><select class="input" id="f_account">${accOpts.html}</select></label>
    ${accOpts.hasAny ? '' : `<p class="hint">아직 등록한 계좌가 없어요 — 나중에 계좌를 만들고 이 자산을 눌러 다시 연결해 주세요.</p>`}
    <div class="seg" id="f_modeSeg"><button type="button" data-m="qty" class="${a.mode === 'qty' ? 'on' : ''}">🔢 수량 × 가격</button><button type="button" data-m="amount" class="${a.mode === 'amount' ? 'on' : ''}">💵 금액으로</button></div>
    <label class="check" id="residenceWrap" ${a.cat === '부동산' ? '' : 'hidden'}><input type="checkbox" id="f_residence" ${a.isResidence ? 'checked' : ''}> <span>🏠 자가 거주 목적 (투자 목적 아님) — 총자산엔 포함되고 표시만 구분돼요</span></label>
    <div id="m_qty" ${a.mode === 'qty' ? '' : 'hidden'}>
      <div class="row2">
        <label class="field"><span>시세 방식</span><select class="input" id="f_src">
          <option value="manual" ${a.src === 'manual' ? 'selected' : ''}>직접 입력</option>
          <option value="twelvedata" ${a.src === 'twelvedata' ? 'selected' : ''}>주식·ETF 자동</option>
          <option value="coingecko" ${a.src === 'coingecko' ? 'selected' : ''}>코인 자동</option></select></label>
        <label class="field"><span>통화</span><select class="input" id="f_cur"><option value="KRW" ${a.cur === 'KRW' ? 'selected' : ''}>원화</option><option value="USD" ${a.cur === 'USD' ? 'selected' : ''}>달러</option></select></label>
      </div>
      <label class="field" id="symWrap" ${a.src === 'manual' ? 'hidden' : ''}><span id="symLabel">${a.src === 'coingecko' ? '코인 선택 (ID 자동 입력)' : '티커'}</span><input class="input" id="f_symbol" list="${a.src === 'coingecko' ? 'coinDatalist' : ''}" autocapitalize="off" spellcheck="false" value="${esc(a.symbol)}" placeholder="${a.src === 'coingecko' ? '목록에서 고르거나 ID 직접 입력 (예: bitcoin)' : '005930, VOO, QQQ'}"></label>
      <datalist id="coinDatalist">${COINGECKO_COINS.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</datalist>
      <p class="hint" id="symHint" ${a.src === 'manual' ? 'hidden' : ''}>${symHint(a.src, a.cat)}</p>
      <div class="row2">
        <label class="field"><span id="qtyLabel">보유 수량</span><input class="input num" inputmode="decimal" id="f_qty" value="${fmtInput(a.qty)}"></label>
        <label class="field"><span id="priceLabel">현재가</span><input class="input num" inputmode="decimal" id="f_price" value="${fmtInput(a.price)}" ${a.src === 'coingecko' ? 'readonly' : ''}></label>
      </div>
      <div id="coinPriceRow" ${a.src === 'coingecko' ? '' : 'hidden'} style="display:flex;gap:10px;align-items:center;margin:-6px 0 4px;flex-wrap:wrap">
        <button type="button" class="btn sm" id="f_priceFetch">🔄 지금 시세 가져오기</button>
        <label class="check" style="margin:0"><input type="checkbox" id="f_priceManual"> <span class="small">✏️ 직접 입력으로 전환 (자동 실패 시)</span></label>
      </div>
      <p class="small muted" id="coinPriceAt" style="margin:-6px 0 10px">${a.src === 'coingecko' && a.priceAt ? `마지막 시세 조회: ${esc(a.priceAt)} 기준` : ''}</p>
      <input type="hidden" id="f_priceAt" value="${esc(a.priceAt)}">
      <label class="field" id="fxExposureWrap" ${a.cat === '해외주식' ? '' : 'hidden'}><span>환노출 여부 (선택, 권장)</span><select class="input" id="f_fxexp"><option value="">선택 안 함</option><option value="exposed" ${a.fxExposure === 'exposed' ? 'selected' : ''}>노출형 (환헤지 안 함)</option><option value="hedged" ${a.fxExposure === 'hedged' ? 'selected' : ''}>환헤지형</option></select></label>
      <div class="row2" id="sectorCountryWrap" ${(a.cat === '국내주식' || a.cat === '해외주식') ? '' : 'hidden'}>
        <label class="field"><span>섹터 (선택)</span><select class="input" id="f_sector"><option value="">미분류</option>${opts(SECTORS, a.sector)}</select></label>
        <label class="field"><span>국가 (선택)</span><select class="input" id="f_country"><option value="">미분류</option>${opts(COUNTRIES, a.country)}</select></label>
      </div>
      <p class="hint" id="sectorCountryHint" ${(a.cat === '국내주식' || a.cat === '해외주식') ? '' : 'hidden'}>잘 알려진 종목은 이름·티커를 적으면 섹터·국가가 자동으로 채워져요. 처음 보는 종목은 직접 골라두시면 다음에 같은 이름으로 또 등록할 때 기억해서 채워드려요. 자산 화면에서 국내주식·해외주식을 보면 이 정보로 섹터별·국가별 구성을 볼 수 있어요.</p>
      <label class="field"><span id="avgLabel">평균 매수단가</span><input class="input num" inputmode="decimal" id="f_avg" value="${fmtInput(a.avgCost)}"></label>
      <p class="hint">거래 탭에서 매수·매도를 기록하면 수량과 평균단가가 자동으로 바뀌어요.</p>
    </div>
    <div id="m_amount" ${a.mode === 'amount' ? '' : 'hidden'}>
      <div class="row2">
        <label class="field"><span>현재 평가금액 (원)</span><input class="input num" inputmode="numeric" id="f_amount" value="${fmtInput(a.amount)}"></label>
        <label class="field"><span>원금 (선택)</span><input class="input num" inputmode="numeric" id="f_cost" value="${a.cost == null ? '' : fmtInput(a.cost)}" placeholder="비우면 손익 없음"></label>
      </div>
      <label class="field"><span>납입 회차 (선택)</span><input class="input num" inputmode="numeric" id="f_paycount" value="${a.payCount == null ? '' : a.payCount}" placeholder="예: 34"></label>
      <p class="hint">청약통장처럼 매달 납입할 때마다 회차가 있는 자산이면 적어두세요. 자동으로 올라가진 않고, 적은 숫자만 그대로 보여드려요 · ⚡ 빠르게 고치기에서 +1 체크로도 늘릴 수 있어요.</p>
      <div class="field"><span>🏦 예적금 정보</span>
        <div class="seg" id="d_kind" style="margin-bottom:10px">${[['none', '해당 없음'], ['deposit', '🏦 예금'], ['saving', '🐷 적금']].map(([k, l]) => `<button type="button" data-k="${k}" class="${a.dep.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      <div id="d_box" ${a.dep.kind === 'none' ? 'hidden' : ''}>
        <div class="row2">
          <label class="field" id="d_pWrap"><span>예치 원금 (원)</span><input class="input num" inputmode="numeric" id="d_principal" value="${fmtInput(a.dep.principal)}"></label>
          <label class="field" id="d_mWrap"><span>월 납입액 (원)</span><input class="input num" inputmode="numeric" id="d_monthly" value="${fmtInput(a.dep.monthly)}"></label>
          <label class="field"><span>연 금리 (%)</span><input class="input num" inputmode="decimal" id="d_rate" value="${a.dep.rate || ''}" placeholder="예: 3.5"></label>
        </div>
        <label class="field" id="d_manualWrap"><span>실제 납입 원금 직접 입력 (선택)</span><input class="input num" inputmode="numeric" id="d_manualpaid" value="${fmtInput(a.dep.manualPaid)}" placeholder="중간에 못 낸 달이 있으면 실제 낸 금액을 적어주세요"></label>
        <p class="hint" id="d_manualHint" style="margin-top:-6px">비워두면 “월납입액 × 경과 개월수”로 자동 계산해요. 중간에 미납·연체가 있었다면 여기에 실제로 낸 원금 합계를 적으면 그 값을 우선 사용하고, 만기 예상액도 “직접 입력 원금 + 남은 개월수 × 월납입액”으로 다시 계산해요.</p>
        <div class="row2">
          <label class="field"><span>가입일</span><input class="input" type="date" id="d_start" value="${esc(a.dep.start)}"></label>
          <label class="field"><span>만기일</span><input class="input" type="date" id="d_end" value="${esc(a.dep.end)}"></label>
        </div>
        <div class="seg" id="d_term" style="margin-top:-4px">${[6, 12, 24, 36].map(m => `<button type="button" data-m="${m}">${m}개월</button>`).join('')}</div>
        <div class="row2">
          <label class="field"><span>이자 방식</span><select class="input" id="d_interest"><option value="simple" ${a.dep.interest === 'simple' ? 'selected' : ''}>단리</option><option value="compound" ${a.dep.interest === 'compound' ? 'selected' : ''}>월복리</option></select></label>
          <label class="field"><span>과세</span><select class="input" id="d_tax">${Object.entries(TAX).map(([k, [l]]) => `<option value="${k}" ${a.dep.tax === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="banner" id="d_preview"></div>
        <p class="hint">예적금은 평가금액·원금이 “지금까지 넣은 돈”으로 자동 계산돼요.</p>
      </div>
    </div>
    <div class="field" id="pensionWrap" ${a.cat === '연금·IRP' ? '' : 'hidden'}>
      <span>연금·IRP 구성 분류 (선택)</span>
      <div class="row2">
        <label class="field"><span>자산군</span><select class="input" id="f_penclass"><option value="">미분류</option>${opts(PENSION_CLASS, a.penClass)}</select></label>
        <label class="field"><span>국가</span><select class="input" id="f_pencountry"><option value="">미분류</option>${opts(PENSION_COUNTRIES, a.penCountry)}</select></label>
      </div>
      <div class="row2">
        <label class="field"><span>섹터</span><select class="input" id="f_pensector"><option value="">미분류</option>${opts(PENSION_SECTORS, a.penSector)}</select></label>
        <label class="field"><span>상품유형${a.penProductEstimated ? ' <small class="faint">(추정)</small>' : ''}</span><select class="input" id="f_penproduct" data-auto="${a.penProductEstimated ? esc(a.penProduct) : ''}"><option value="">미분류</option>${opts(PENSION_PRODUCT_TYPES, a.penProduct)}</select></label>
      </div>
      <p class="hint">ETF·TDF·펀드처럼 기초자산의 국가·섹터를 정확히 나누기 어려운 상품은 '상품유형'만 골라도 괜찮아요. 이름에 TDF·ETF 등이 있으면 상품유형을 추정해서 자동으로 채워드려요(추정 표시가 붙어요) — 정확한 값을 알면 직접 골라 주세요. 국가는 상장국이 아니라 기초자산의 주요 투자대상 국가 기준이에요.</p>
    </div>
    <label class="field" id="commodityWrap" ${a.cat === '원자재' ? '' : 'hidden'}><span>원자재 종류</span><select class="input" id="f_commodity">${opts(COMMODITY_TYPES, a.commodityType)}</select></label>
    <label class="check" id="otherPortfolioWrap" ${a.cat === '기타' ? '' : 'hidden'}><input type="checkbox" id="f_portfolio" ${a.portfolioInclude ? 'checked' : ''}> <span>📊 투자 포트폴리오 분석에 포함 — 기본은 제외, 투자 목적 자산이면 켜주세요</span></label>
    <div class="field"><span>구성 (선택) — 예: 연금계좌 안의 S&P500 60%, 나스닥 40%</span>
      <div id="compList">${a.components.map(compRow).join('')}</div>
      <button type="button" class="btn sm" id="addComp">🧺 구성 추가</button>
    </div>
    <label class="field"><span>메모</span><input class="input" id="f_memo" value="${esc(a.memo)}"></label>
    ${isNew ? '' : `<button class="btn danger block" data-action="del-asset" data-id="${a.id}">🗑️ 보물함에서 빼기</button>`}`;
  openSheet(isNew ? '👛 보물 넣기' : '✏️ 보물 고치기', html, () => {
    const name = val('f_name').trim();
    if (!name) { toast('이름을 입력하세요'); return false; }
    const accVal = val('f_account');
    if (accVal === '__new__') { toast('보유 계좌를 선택하세요'); return false; }
    const accStillHasAny = buildAccountOptions(a.accountId).hasAny;
    if (!accVal && accStillHasAny) { toast('보유 계좌를 선택하세요'); return false; }
    const mode = $sheetBody.querySelector('#f_modeSeg .on').dataset.m;
    const comps = [...$sheetBody.querySelectorAll('.comp-edit')].map(r => ({ name: r.querySelector('[data-cn]').value.trim(), pct: num(r.querySelector('[data-cp]').value) })).filter(c => c.name);
    const csum = comps.reduce((s, c) => s + c.pct, 0);
    if (comps.length && Math.abs(csum - 100) > 0.5) { toast(`구성 비중 합계가 ${nf2.format(csum)}%예요 (100% 필요)`); return false; }
    const src = val('f_src');
    const catVal = val('f_cat');
    const isGold = catVal === '원자재';
    const next = normAsset({
      ...a, name, cat: catVal, purpose: val('f_purpose'), mode,
      src: mode === 'qty' ? src : 'manual',
      cur: isGold ? 'KRW' : val('f_cur'),
      symbol: (isGold && src === 'twelvedata') ? 'XAU/USD' : val('f_symbol').trim(),
      priceAt: val('f_priceAt') || a.priceAt,
      qty: num(val('f_qty')), price: num(val('f_price')), avgCost: num(val('f_avg')),
      amount: num(val('f_amount')), cost: val('f_cost').trim() === '' ? null : num(val('f_cost')),
      components: comps, memo: val('f_memo').trim(), dep: readDep(),
      payCount: val('f_paycount').trim() === '' ? null : num(val('f_paycount')),
      isResidence: catVal === '부동산' && !!$sheetBody.querySelector('#f_residence')?.checked,
      fxExposure: catVal === '해외주식' ? (val('f_fxexp') || '') : '',
      sector: (catVal === '국내주식' || catVal === '해외주식') ? (val('f_sector') || '') : '',
      country: (catVal === '국내주식' || catVal === '해외주식') ? (val('f_country') || '') : '',
      penClass: catVal === '연금·IRP' ? (val('f_penclass') || '') : '',
      penCountry: catVal === '연금·IRP' ? (val('f_pencountry') || '') : '',
      penSector: catVal === '연금·IRP' ? (val('f_pensector') || '') : '',
      penProduct: catVal === '연금·IRP' ? (val('f_penproduct') || '') : '',
      penProductEstimated: false,
      commodityType: isGold ? (val('f_commodity') || '') : '',
      portfolioInclude: catVal === '기타' ? !!$sheetBody.querySelector('#f_portfolio')?.checked : false,
      accountId: accVal || ''
    });
    if (catVal === '연금·IRP') {
      const penProductEl = $sheetBody.querySelector('#f_penproduct');
      next.penProductEstimated = !!(penProductEl && next.penProduct && penProductEl.dataset.auto === next.penProduct && penProductEl.dataset.manual !== '1');
    }
    if ((catVal === '국내주식' || catVal === '해외주식') && (next.sector || next.country)) rememberStockMeta(next.name, next.symbol, next.sector, next.country);
    if (mode === 'amount' && next.dep.kind !== 'none') {
      if (!next.dep.start || !next.dep.end || next.dep.end <= next.dep.start) { toast('가입일과 만기일을 확인해 주세요'); return false; }
      if (next.dep.kind === 'deposit' ? !next.dep.principal : !next.dep.monthly) { toast(next.dep.kind === 'deposit' ? '예치 원금을 입력하세요' : '월 납입액을 입력하세요'); return false; }
      const di = depInfo(next); next.amount = di.paid; next.cost = di.paid;
    }
    if (mode === 'qty') next.dep = normDep({});
    if (next.src === 'coingecko') next.cur = 'KRW';
    if (next.src !== 'manual' && !next.symbol) { toast('자동 시세에는 티커/ID가 필요해요'); return false; }
    if (next.accountId) rememberAccountUsed(next.accountId);
    if (isNew) S.assets.push(next); else S.assets[S.assets.findIndex(x => x.id === a.id)] = next;
    save(); render(); toast(isNew ? `${next.name}, 보물함에 넣었어요 👛` : '고쳤어요 ✨');
    if (needsFx() && !fxRate('USD')) refreshPrices(true).catch(() => {});
  });
  $sheetBody.querySelector('#f_account').addEventListener('change', e => {
    if (e.target.value !== '__new__') return;
    const draft = collectAssetFormDraft();
    accountForm(null, { fromAssetDraft: { draft, editingId: isNew ? null : a.id } });
  });
  // 폼 상호작용
  $sheetBody.querySelector('#f_modeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $sheetBody.querySelectorAll('#f_modeSeg button').forEach(x => x.classList.toggle('on', x === b));
    $sheetBody.querySelector('#m_qty').hidden = b.dataset.m !== 'qty';
    $sheetBody.querySelector('#m_amount').hidden = b.dataset.m !== 'amount';
  });
  const coinStamp = () => new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const applyCoinPriceMode = () => {
    const isCoin = val('f_src') === 'coingecko';
    $sheetBody.querySelector('#coinPriceRow').hidden = !isCoin;
    const manualOn = !!$sheetBody.querySelector('#f_priceManual')?.checked;
    $sheetBody.querySelector('#f_price').readOnly = isCoin && !manualOn;
    if (isCoin) $sheetBody.querySelector('#f_symbol').setAttribute('list', 'coinDatalist');
    else $sheetBody.querySelector('#f_symbol').removeAttribute('list');
    if (!isCoin) $sheetBody.querySelector('#coinPriceAt').textContent = '';
  };
  const fetchCoinNow = async auto => {
    if (val('f_src') !== 'coingecko') return;
    const id = val('f_symbol').trim();
    if (!id) { if (!auto) toast('코인을 선택하거나 ID를 입력하세요'); return; }
    const btn = $sheetBody.querySelector('#f_priceFetch');
    btn.disabled = true;
    try {
      const p = await fetchCoinPrice(id);
      $sheetBody.querySelector('#f_price').value = fmtInput(p);
      const stamp = coinStamp();
      $sheetBody.querySelector('#coinPriceAt').textContent = `마지막 시세 조회: ${stamp} 기준`;
      $sheetBody.querySelector('#f_priceAt').value = stamp;
      const manualCk = $sheetBody.querySelector('#f_priceManual'); manualCk.checked = false;
      $sheetBody.querySelector('#f_price').readOnly = true;
      if (!auto) toast('시세를 가져왔어요 🔄');
    } catch (e) {
      $sheetBody.querySelector('#coinPriceAt').textContent = '자동 조회 실패 — 직접 입력을 이용해 주세요';
      $sheetBody.querySelector('#f_priceManual').checked = true;
      $sheetBody.querySelector('#f_price').readOnly = false;
      if (!auto) toast('시세를 가져오지 못했어요: ' + e.message);
    } finally { btn.disabled = false; }
  };
  $sheetBody.querySelector('#f_src').addEventListener('change', e => {
    const v = e.target.value;
    $sheetBody.querySelector('#symWrap').hidden = v === 'manual';
    $sheetBody.querySelector('#symHint').hidden = v === 'manual';
    $sheetBody.querySelector('#symLabel').textContent = v === 'coingecko' ? '코인 선택 (ID 자동 입력)' : '티커';
    $sheetBody.querySelector('#f_symbol').placeholder = v === 'coingecko' ? '목록에서 고르거나 ID 직접 입력 (예: bitcoin)' : '005930, VOO, QQQ';
    $sheetBody.querySelector('#symHint').textContent = symHint(v, val('f_cat'));
    if (v === 'coingecko') $sheetBody.querySelector('#f_cur').value = 'KRW';
    applyCoinPriceMode();
    if (v === 'coingecko' && val('f_symbol').trim()) fetchCoinNow(true);
    syncGoldUI();
  });
  $sheetBody.querySelector('#f_symbol').addEventListener('change', () => { if (val('f_src') === 'coingecko') fetchCoinNow(true); autoFillSectorCountry(); });
  $sheetBody.querySelector('#f_name').addEventListener('change', () => { autoFillSectorCountry(); autoFillPensionProduct(); });
  $sheetBody.querySelector('#f_penproduct')?.addEventListener('change', e => { e.target.dataset.manual = '1'; });
  $sheetBody.querySelector('#f_priceFetch').addEventListener('click', () => fetchCoinNow(false));
  $sheetBody.querySelector('#f_priceManual').addEventListener('change', e => {
    $sheetBody.querySelector('#f_price').readOnly = val('f_src') === 'coingecko' && !e.target.checked;
    if (!e.target.checked) fetchCoinNow(true);
  });
  applyCoinPriceMode();
  const readDep = () => normDep({ kind: $sheetBody.querySelector('#d_kind .on').dataset.k, rate: val('d_rate'), start: val('d_start'), end: val('d_end'), principal: val('d_principal'), monthly: val('d_monthly'), manualPaid: val('d_manualpaid'), interest: val('d_interest'), tax: val('d_tax') });
  const drawDep = () => {
    const d = readDep();
    $sheetBody.querySelector('#d_box').hidden = d.kind === 'none';
    $sheetBody.querySelector('#d_pWrap').hidden = d.kind !== 'deposit';
    $sheetBody.querySelector('#d_mWrap').hidden = d.kind !== 'saving';
    $sheetBody.querySelector('#d_manualWrap').hidden = d.kind !== 'saving';
    $sheetBody.querySelector('#d_manualHint').hidden = d.kind !== 'saving';
    $sheetBody.querySelectorAll('#m_amount > .row2:first-child .field').forEach(f => f.style.opacity = d.kind === 'none' ? '' : '.45');
    const di = depInfo({ dep: d });
    const diffLine = di && di.hasManual && di.paidDiff !== 0 ? `<div class="small ${di.paidDiff > 0 ? 'up' : 'down'}" style="margin-top:4px">⚠️ 자동계산과 ${won(Math.abs(di.paidDiff))} 차이가 있어 직접 입력값을 사용 중이에요</div>` : '';
    $sheetBody.querySelector('#d_preview').innerHTML = di ? `${E('🎁')}<span>${di.n}개월 뒤 <b class="num">${won(di.maturity)}</b> 받아요<br><span class="small muted">원금 ${won(di.principalTotal)} + 이자 ${won(di.interest)} − 세금 ${won(di.tax)} · ${ddayLabel(di.dday)}</span>${diffLine}</span>` : `${E('✏️')}<span class="small muted">금리·가입일·만기일을 적으면 만기 금액이 나와요</span>`;
  };
  $sheetBody.querySelector('#d_kind').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    $sheetBody.querySelectorAll('#d_kind button').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.k !== 'none' && !val('d_start')) $sheetBody.querySelector('#d_start').value = today();
    drawDep();
  });
  $sheetBody.querySelector('#d_term').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const st = val('d_start') || today(); $sheetBody.querySelector('#d_start').value = st;
    const [y, m, dd] = st.split('-').map(Number); const e0 = new Date(y, m - 1 + Number(b.dataset.m), dd);
    $sheetBody.querySelector('#d_end').value = `${e0.getFullYear()}-${String(e0.getMonth() + 1).padStart(2, '0')}-${String(e0.getDate()).padStart(2, '0')}`;
    drawDep();
  });
  $sheetBody.querySelector('#d_box').addEventListener('input', drawDep);
  $sheetBody.querySelector('#d_box').addEventListener('change', drawDep);
  $sheetBody.querySelector('#f_cat').addEventListener('change', ev => {
    if (ev.target.value === '현금성자산' && $sheetBody.querySelector('#f_modeSeg .on').dataset.m === 'qty') $sheetBody.querySelector('#f_modeSeg [data-m=amount]').click();
    syncGoldUI();
  });
  drawDep();
  syncGoldUI();
  $sheetBody.querySelector('#addComp').addEventListener('click', () => {
    $sheetBody.querySelector('#compList').insertAdjacentHTML('beforeend', compRow({ name: '', pct: 0 }));
  });
  $sheetBody.querySelector('#compList').addEventListener('click', e => { if (e.target.closest('.x-btn')) e.target.closest('.comp-edit').remove(); });
  if (draftOverride) {
    applyDraftToForm(draftOverride);
    applyCoinPriceMode();
    drawDep();
    syncGoldUI();
  }
}
function syncGoldUI() {
  const cat = val('f_cat'), src = val('f_src');
  const isGold = cat === '원자재';
  const qtyLabel = $sheetBody.querySelector('#qtyLabel'), priceLabel = $sheetBody.querySelector('#priceLabel');
  if (qtyLabel) qtyLabel.textContent = isGold ? '보유 수량 (그램)' : '보유 수량';
  if (priceLabel) priceLabel.textContent = isGold ? '현재가 (원/그램)' : '현재가';
  const curSel = $sheetBody.querySelector('#f_cur');
  if (curSel) { if (isGold) { curSel.value = 'KRW'; curSel.disabled = true; } else curSel.disabled = false; }
  const symEl = $sheetBody.querySelector('#f_symbol');
  if (symEl) { if (isGold && src === 'twelvedata') { symEl.value = 'XAU/USD'; symEl.disabled = true; } else symEl.disabled = false; }
  const resWrap = $sheetBody.querySelector('#residenceWrap');
  if (resWrap) resWrap.hidden = cat !== '부동산';
  const fxWrap = $sheetBody.querySelector('#fxExposureWrap');
  if (fxWrap) fxWrap.hidden = cat !== '해외주식';
  const isStock = cat === '국내주식' || cat === '해외주식';
  const scWrap = $sheetBody.querySelector('#sectorCountryWrap'), scHint = $sheetBody.querySelector('#sectorCountryHint');
  if (scWrap) scWrap.hidden = !isStock;
  if (scHint) scHint.hidden = !isStock;
  if (isStock) autoFillSectorCountry();
  const isPension = cat === '연금·IRP';
  const penWrap = $sheetBody.querySelector('#pensionWrap');
  if (penWrap) penWrap.hidden = !isPension;
  if (isPension) autoFillPensionProduct();
  const commodityWrap = $sheetBody.querySelector('#commodityWrap');
  if (commodityWrap) commodityWrap.hidden = !isGold;
  const otherPortfolioWrap = $sheetBody.querySelector('#otherPortfolioWrap');
  if (otherPortfolioWrap) otherPortfolioWrap.hidden = cat !== '기타';
}
/* 이름·티커가 바뀔 때마다 섹터·국가 자동 매칭을 시도함 — 사용자가 이미 직접 고른 값은 덮어쓰지 않음 */
function autoFillSectorCountry() {
  const sectorEl = $sheetBody.querySelector('#f_sector'), countryEl = $sheetBody.querySelector('#f_country');
  if (!sectorEl || !countryEl) return;
  if (sectorEl.value || countryEl.value) return;
  const meta = lookupStockMeta(val('f_name'), val('f_symbol'));
  if (!meta) return;
  if (meta.sector) sectorEl.value = meta.sector;
  if (meta.country) countryEl.value = meta.country;
}
/* 연금·IRP 상품명으로 상품유형을 추정해 '비어있을 때만' 채움 — 사용자가 이미 고른 값은 절대 덮어쓰지 않고, 채운 값은 data-auto에 남겨서 저장 시 '추정' 여부를 판단함 */
function autoFillPensionProduct() {
  const el = $sheetBody.querySelector('#f_penproduct');
  if (!el || el.value) return;
  const guess = guessPensionProduct(val('f_name'));
  if (!guess) return;
  el.value = guess;
  el.dataset.auto = guess;
}
function symHint(src, cat) {
  if (cat === '원자재' && src === 'twelvedata') return '국제 금 시세(XAU/USD, 트로이온스당 달러)를 가져와 환율로 원/그램으로 환산해요. 무료 요금제에서는 상품(commodity) 시세가 안 나올 수 있어요 — 그럴 땐 "직접 입력"을 이용하세요.';
  return src === 'coingecko' ? '목록에 있는 코인은 이름만 고르면 ID·시세가 자동으로 들어가요. 목록에 없으면 coingecko.com 코인 페이지 주소의 영문 이름을 직접 입력하세요 (예: bitcoin). 현재가 칸은 자동으로 채워지고 직접 수정하려면 아래 "직접 입력으로 전환"을 켜세요.'
    : '국내 종목은 6자리 코드(005930), 미국 주식·ETF는 티커(VOO)만 넣으면 무료 시세 서버에서 자동으로 받아와요 — 키가 없어도 돼요. 그 밖의 해외 거래소는 티커:거래소 형식이고, 이때만 Twelve Data 키가 필요해요.';
}
function compRow(c) {
  return `<div class="comp-edit"><input class="input" data-cn value="${esc(c.name)}" placeholder="구성 이름"><input class="input num" data-cp inputmode="decimal" value="${c.pct || ''}" placeholder="%"><button type="button" class="x-btn" aria-label="삭제">✕</button></div>`;
}

/* 계좌 등록·수정 폼(요구사항 #2~#8, #13, G) — ctx.fromAssetDraft가 있으면 저장 직후 자산폼으로 되돌아가 새 계좌를 바로 선택된 상태로 채워줌 */
function accountForm(acc, ctx) {
  ctx = ctx || {};
  const isNew = !acc;
  acc = acc || normAccount({});
  const isDb = isDbPensionAccount(acc);
  const instList = (S.settings.recentInstitutions || []).concat((S.settings.institutions || []).filter(x => !(S.settings.recentInstitutions || []).includes(x)));
  const html = `
    <label class="field"><span>계좌 별칭 *</span><input class="input" id="ac_alias" value="${isNew ? '' : esc(acc.alias)}" placeholder="예: 메인계좌, 연금저축1"></label>
    <div class="row2">
      <label class="field"><span>대분류 *</span><select class="input" id="ac_cls">${opts(ACCOUNT_CLASSES, acc.cls)}</select></label>
      <label class="field"><span>계좌 유형 *</span><select class="input" id="ac_type">${opts(ACCOUNT_TYPES_BY_CLASS[acc.cls] || [], acc.type)}</select></label>
    </div>
    <label class="field"><span>금융기관 *</span><input class="input" id="ac_inst" list="instDatalist" autocomplete="off" autocapitalize="off" value="${esc(acc.institution)}" placeholder="예: 한국투자증권"></label>
    <datalist id="instDatalist">${instList.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <div id="instSuggestWrap" class="inst-suggest" hidden></div>
    <div class="row2">
      <label class="field"><span>기본 통화</span><select class="input" id="ac_cur"><option value="KRW" ${acc.currency !== 'USD' ? 'selected' : ''}>원화</option><option value="USD" ${acc.currency === 'USD' ? 'selected' : ''}>달러</option></select></label>
      <label class="field"><span>계좌 상태</span><select class="input" id="ac_status">${opts(ACCOUNT_STATUS, acc.status)}</select></label>
    </div>
    <div class="row2">
      <label class="field"><span>끝 4자리 (선택)</span><input class="input num" inputmode="numeric" maxlength="4" id="ac_last4" value="${esc(acc.last4)}" placeholder="1234"></label>
      <label class="field"><span>식별 메모 (선택)</span><input class="input" id="ac_note" value="${esc(acc.note)}" placeholder="예: 부모님 명의"></label>
    </div>
    <p class="hint">계좌번호 전체는 저장하지 않아요 — 끝 4자리나 알아볼 수 있는 메모만 선택적으로 남겨요.</p>
    <div id="dbWrap" ${isDb ? '' : 'hidden'}>
      <div class="row2">
        <label class="field"><span>기준일</span><input class="input" type="date" id="ac_dbasof" value="${esc(acc.dbAsOf || today())}"></label>
        <label class="field"><span>기준일 평가액 (원)</span><input class="input num" inputmode="numeric" id="ac_dbval" value="${fmtInput(acc.dbValuation)}"></label>
      </div>
      <label class="field"><span>예상 퇴직금 (원, 선택)</span><input class="input num" inputmode="numeric" id="ac_dbexp" value="${acc.dbExpected ? fmtInput(acc.dbExpected) : ''}"></label>
      <label class="check"><input type="checkbox" id="ac_dbnetworth" ${acc.dbIncludeNetWorth !== false ? 'checked' : ''}> <span>전체 순자산에 포함</span></label>
      <label class="check"><input type="checkbox" id="ac_dbanalysis" ${acc.dbIncludeAnalysis ? 'checked' : ''}> <span>투자자산 분석(구성 분석)에 포함</span></label>
      <p class="hint">DB형 퇴직연금은 종목을 등록하지 않고 기준일 평가액(또는 예상 퇴직금)만 기록해요. 일반 투자계좌와 구분해서 관리돼요.</p>
    </div>`;
  openSheet(isNew ? '🏦 계좌 추가' : '✏️ 계좌 고치기', html, () => {
    const alias = val('ac_alias').trim();
    if (!alias) { toast('계좌 별칭을 입력하세요'); return false; }
    const cls = val('ac_cls');
    const type = val('ac_type');
    if (!type) { toast('계좌 유형을 선택하세요'); return false; }
    const instRaw = val('ac_inst').trim();
    if (!instRaw) { toast('금융기관을 입력하세요'); return false; }
    const isDbNow = cls === '연금·퇴직연금' && type === 'DB형 퇴직연금';
    if (isDbNow && !num(val('ac_dbval'))) { toast('기준일 평가액을 입력하세요'); return false; }
    const institution = rememberInstitution(instRaw);
    const next = normAccount({
      ...acc, alias, cls, type, institution,
      currency: val('ac_cur'), status: val('ac_status'),
      last4: val('ac_last4').replace(/\D/g, '').slice(0, 4),
      note: val('ac_note').trim(),
      dbAsOf: isDbNow ? val('ac_dbasof') : '',
      dbValuation: isDbNow ? num(val('ac_dbval')) : 0,
      dbExpected: isDbNow ? num(val('ac_dbexp')) : 0,
      dbIncludeNetWorth: isDbNow ? !!$sheetBody.querySelector('#ac_dbnetworth')?.checked : true,
      dbIncludeAnalysis: isDbNow ? !!$sheetBody.querySelector('#ac_dbanalysis')?.checked : false,
      updatedAt: nowStamp()
    });
    if (isNew) S.accounts.push(next); else S.accounts[S.accounts.findIndex(x => x.id === acc.id)] = next;
    save();
    toast(isNew ? `${next.alias}, 계좌를 만들었어요 🏦` : '고쳤어요 ✨');
    if (ctx.fromAssetDraft) {
      const stash = ctx.fromAssetDraft;
      const editingAsset = stash.editingId ? S.assets.find(x => x.id === stash.editingId) : null;
      assetForm(editingAsset, { ...stash.draft, f_account: next.id });
      return false; // 방금 assetForm이 새로 연 시트를 닫지 않도록
    }
    render();
  });
  $sheetBody.querySelector('#ac_cls').addEventListener('change', e => {
    const types = ACCOUNT_TYPES_BY_CLASS[e.target.value] || [];
    $sheetBody.querySelector('#ac_type').innerHTML = opts(types, types[0]);
    syncDbWrap();
  });
  $sheetBody.querySelector('#ac_type').addEventListener('change', syncDbWrap);
  function syncDbWrap() {
    $sheetBody.querySelector('#dbWrap').hidden = !(val('ac_cls') === '연금·퇴직연금' && val('ac_type') === 'DB형 퇴직연금');
  }
  const instEl = $sheetBody.querySelector('#ac_inst');
  instEl.addEventListener('blur', () => {
    const wrap = $sheetBody.querySelector('#instSuggestWrap');
    const sug = institutionSuggestion(instEl.value);
    if (sug) { wrap.hidden = false; wrap.innerHTML = `<button type="button" class="chip" data-action="inst-suggest-pick" data-v="${esc(sug)}">혹시 '${esc(sug)}'을(를) 말씀하시나요?</button>`; }
    else { wrap.hidden = true; wrap.innerHTML = ''; }
  });
}

function txForm(t) {
  const isNew = !t;
  if (!S.assets.length) { toast('먼저 자산을 등록하세요'); ui.tab = 'assets'; render(); return; }
  const defAsset = S.assets.find(x => x.id === ui.lastTxAsset) || S.assets.find(x => x.mode === 'qty') || S.assets[0];
  t = t || { type: 'buy', date: today(), assetId: defAsset.id, qty: 0, price: 0, fee: 0, amount: 0, cur: 'KRW', memo: '' };
  const assetOpts = S.assets.map(a => `<option value="${a.id}" ${a.id === t.assetId ? 'selected' : ''}>${esc(a.name)} (${a.cat})</option>`).join('');
  const html = `
    ${isNew ? `<div class="seg" id="t_typeSeg">${Object.entries(TX_TYPES).map(([k, l]) => `<button type="button" data-t="${k}" class="${t.type === k ? 'on' : ''}">${TX_EMO[k]} ${l}</button>`).join('')}</div>` : `<p class="small muted" style="margin:0 2px 12px">${TX_TYPES[t.type]} 기록 · 기존 거래는 날짜·메모만 수정할 수 있어요. 금액을 바꾸려면 삭제 후 다시 입력하세요.</p>`}
    <div class="row2">
      <label class="field"><span>날짜</span><input class="input" type="date" id="t_date" value="${esc(t.date)}"></label>
      <label class="field"><span>자산</span><select class="input" id="t_asset" ${isNew ? '' : 'disabled'}>${assetOpts}</select></label>
    </div>
    ${isNew ? `<div id="t_fields"></div>` : ''}
    <label class="field"><span>메모</span><input class="input" id="t_memo" value="${esc(t.memo)}"></label>
    ${!isNew && t.type === 'div' ? `<label class="check"><input type="checkbox" id="t_reinvest" ${t.reinvestDiv ? 'checked' : ''}> <span>🔁 배당 재투자함</span></label>` : ''}
    ${t.type !== 'div' ? `<details class="more" ${(t.reason || t.thesis || t.sellRule || t.conviction || t.horizon) ? 'open' : ''}>
      <summary>🤔 투자 기록 남기기 (선택)</summary>
      <label class="field"><span>거래 사유</span><select class="input" id="t_reason"><option value="">선택 안 함</option>${TX_REASONS.map(r => `<option value="${r}" ${t.reason === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="field"><span>투자 가설 <small class="faint">(왜 샀나요?)</small></span><textarea class="input" id="t_thesis" rows="2" placeholder="예: 장기 우상향 지수 추종, 배당 재투자">${esc(t.thesis || '')}</textarea></label>
      <label class="field"><span>매도 기준 <small class="faint">(어떤 조건이면 팔까요?)</small></span><textarea class="input" id="t_sellrule" rows="2" placeholder="예: 목표비중 초과 시, -20% 손절">${esc(t.sellRule || '')}</textarea></label>
      <div class="row2">
        <label class="field"><span>확신도</span><select class="input" id="t_conviction">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${t.conviction === n ? 'selected' : ''}>${n ? '⭐'.repeat(n) : '선택 안 함'}</option>`).join('')}</select></label>
        <label class="field"><span>목표 보유기간</span><input class="input" id="t_horizon" value="${esc(t.horizon || '')}" placeholder="예: 3년, 은퇴까지"></label>
      </div>
    </details>` : ''}
    ${isNew ? '' : `<button class="btn danger block" data-action="del-tx" data-id="${t.id}">🗑️ 거래 지우기</button>`}`;
  const readRetro = () => ({ reason: val('t_reason'), thesis: val('t_thesis').trim(), sellRule: val('t_sellrule').trim(), conviction: num(val('t_conviction')), horizon: val('t_horizon').trim() });
  openSheet(isNew ? '📒 거래 적기' : '✏️ 거래 고치기', html, () => {
    if (!isNew) {
      const x = S.txs.find(z => z.id === t.id); x.date = val('t_date'); x.memo = val('t_memo').trim();
      if (x.type !== 'div') Object.assign(x, readRetro());
      if (x.type === 'div') { const cb = $sheetBody.querySelector('#t_reinvest'); if (cb) x.reinvestDiv = cb.checked; }
      save(); render(); toast('저장했어요 ✨'); return;
    }
    return commitTx(readRetro);
  });
  if (!isNew) return;
  const drawFields = () => {
    const type = $sheetBody.querySelector('#t_typeSeg .on').dataset.t;
    const a = S.assets.find(x => x.id === val('t_asset'));
    const f = $sheetBody.querySelector('#t_fields');
    if (type === 'div') {
      f.innerHTML = `<div class="row2"><label class="field"><span>받은 금액 (세후)</span><input class="input num" inputmode="decimal" id="t_amount"></label>
        <label class="field"><span>통화</span><select class="input" id="t_cur"><option value="KRW">원화</option><option value="USD" ${a.cur === 'USD' ? 'selected' : ''}>달러</option></select></label></div>
        <label class="check"><input type="checkbox" id="t_reinvest_new"> <span>🔁 배당 재투자함</span></label>
        <p class="hint">달러는 현재 환율로 원화 환산해 저장해요. 📈 주식·ETF·펀드 등 투자자산에서 받은 배당만 여기 적어주세요. 🏦 예금·적금·파킹통장 이자는 가계부 탭의 "이자수입(예금·적금)"에서 관리해요.</p>`;
    } else if (a.mode === 'amount') {
      f.innerHTML = `<label class="field"><span>${type === 'buy' ? '넣은' : '뺀'} 금액 (원)</span><input class="input num" inputmode="numeric" id="t_amount"></label>
        <p class="hint">금액형 자산은 평가금액과 원금에 ${type === 'buy' ? '더해져요' : '비례해 빠져요'}.</p>`;
    } else {
      const u = a.cur === 'USD' ? '달러' : '원';
      f.innerHTML = `<div class="seg" id="t_qtyMode" style="margin-bottom:8px"><button type="button" data-qm="qty" class="on">🔢 수량으로</button><button type="button" data-qm="amt">💰 금액으로</button></div>
        <div class="row2">
          <label class="field" id="t_qtyWrap"><span>수량</span><input class="input num" inputmode="decimal" id="t_qty"></label>
          <label class="field" id="t_amtWrap" hidden><span>${type === 'buy' ? '매수' : '매도'} 금액 (${u})</span><input class="input num" inputmode="decimal" id="t_amt2" placeholder="예: 500000"></label>
          <label class="field"><span>단가 (${u}${a.cat === '원자재' ? '/g' : ''})</span><input class="input num" inputmode="decimal" id="t_price" value="${fmtInput(a.price)}"></label>
        </div>
        <label class="field"><span>수수료·세금 (${u}, 선택)</span><input class="input num" inputmode="decimal" id="t_fee"></label>
        <p class="hint">현재 보유 ${nf6.format(a.qty)}주 · 평균단가 ${a.cur === 'USD' ? '$' + nf2.format(a.avgCost) : won(a.avgCost)} · 금액으로 입력하면 단가 기준 수량이 자동 계산돼요</p>`;
      f.querySelector('#t_qtyMode').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        f.querySelectorAll('#t_qtyMode button').forEach(x => x.classList.toggle('on', x === b));
        const isAmt = b.dataset.qm === 'amt';
        f.querySelector('#t_qtyWrap').hidden = isAmt;
        f.querySelector('#t_amtWrap').hidden = !isAmt;
      });
    }
  };
  $sheetBody.querySelector('#t_typeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $sheetBody.querySelectorAll('#t_typeSeg button').forEach(x => x.classList.toggle('on', x === b)); drawFields();
  });
  $sheetBody.querySelector('#t_asset').addEventListener('change', drawFields);
  drawFields();
}

function commitTx(readRetro) {
  const type = $sheetBody.querySelector('#t_typeSeg .on').dataset.t;
  const a = S.assets.find(x => x.id === val('t_asset'));
  const t = { id: uid(), created: Date.now(), type, date: val('t_date') || today(), assetId: a.id, assetName: a.name, memo: val('t_memo').trim(), mode: a.mode, cur: a.cur, retro: [] };
  if (type !== 'div' && readRetro) Object.assign(t, readRetro());
  t.prev = { qty: a.qty, avgCost: a.avgCost, amount: a.amount, cost: a.cost };
  if (type === 'div') {
    t.amount = num(val('t_amount')); t.cur = val('t_cur');
    if (t.amount <= 0) { toast('금액을 입력하세요'); return false; }
    const r = fxRate(t.cur); if (!r) { toast('환율이 없어요. 새로고침 또는 설정에서 입력하세요'); return false; }
    t.amountKRW = t.amount * r; delete t.prev;
    const rcb = $sheetBody.querySelector('#t_reinvest_new'); t.reinvestDiv = !!(rcb && rcb.checked);
  } else if (a.mode === 'amount') {
    t.amount = num(val('t_amount'));
    if (t.amount <= 0) { toast('금액을 입력하세요'); return false; }
    const cost0 = a.cost == null ? a.amount : a.cost;
    if (type === 'buy') { a.amount += t.amount; a.cost = cost0 + t.amount; }
    else {
      if (t.amount > a.amount + 0.5) { toast('보유 금액보다 많아요'); return false; }
      const ratio = a.amount > 0 ? t.amount / a.amount : 0;
      const costOut = cost0 * ratio;
      t.realizedKRW = t.amount - costOut;
      a.amount -= t.amount; a.cost = cost0 - costOut;
    }
  } else {
    const qmBtn = $sheetBody.querySelector('#t_qtyMode .on');
    const byAmt = qmBtn && qmBtn.dataset.qm === 'amt';
    t.price = num(val('t_price')); t.fee = num(val('t_fee'));
    if (byAmt) {
      const amt2 = num(val('t_amt2'));
      if (amt2 <= 0 || t.price <= 0) { toast('금액과 단가를 입력하세요'); return false; }
      t.qty = amt2 / t.price;
    } else {
      t.qty = num(val('t_qty'));
      if (t.qty <= 0 || t.price <= 0) { toast('수량과 단가를 입력하세요'); return false; }
    }
    const r = fxRate(a.cur);
    if (a.cur === 'USD' && !r) { toast('환율이 없어요. 새로고침 또는 설정에서 입력하세요'); return false; }
    if (type === 'buy') {
      const nq = a.qty + t.qty;
      a.avgCost = (a.qty * a.avgCost + t.qty * t.price + t.fee) / nq;
      a.qty = nq;
      if (!a.price || a.src === 'manual') a.price = t.price;
    } else {
      if (t.qty > a.qty + 1e-9) { toast(`보유 수량(${nf6.format(a.qty)})보다 많아요`); return false; }
      t.realizedKRW = (t.qty * (t.price - a.avgCost) - t.fee) * r;
      a.qty = Math.max(0, a.qty - t.qty);
      if (a.qty < 1e-9) { a.qty = 0; }
    }
  }
  ui.lastTxAsset = a.id;
  S.txs.push(t); save(); render(); toast(`${a.name} ${TX_TYPES[type]} 내역을 거래일기에 저장했어요 📒`);
}

function pinSetupForm() {
  openSheet('🔒 PIN 설정', `
    <label class="field"><span>새 PIN (4~6자리 숫자)</span><input class="input" id="pin1" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
    <label class="field"><span>PIN 확인</span><input class="input" id="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
    <p class="hint">PIN은 이 기기에만 해시로 저장돼요(원문 저장 안 함). 잊어버리면 백업 파일을 새로 가져와 초기화해야 해요.</p>`, async () => {
    const p1 = val('pin1'), p2 = val('pin2');
    if (!/^\d{4,6}$/.test(p1)) { toast('4~6자리 숫자로 입력하세요'); return false; }
    if (p1 !== p2) { toast('PIN이 서로 달라요'); return false; }
    await setPin(p1); render(); toast('PIN을 설정했어요 🔐');
  });
}
function retroForm(id, days) {
  const t = S.txs.find(x => x.id === id); if (!t) return;
  openSheet(`🔁 ${days}일 회고`, `
    <p class="hand muted" style="margin:0 4px 12px">${esc(t.thesis || '그때의 가설')}이 지금도 맞나요?</p>
    <label class="field"><span>회고 메모</span><textarea class="input" id="rt_note" rows="4" placeholder="예: 가설대로 흘러가고 있다 / 예상과 달라 매도 기준을 다시 봐야겠다"></textarea></label>`, () => {
    const note = val('rt_note').trim();
    if (!note) { toast('메모를 적어 주세요'); return false; }
    t.retro = t.retro || []; t.retro.push({ days, note, date: today() });
    save(); render(); toast('회고를 남겼어요 📝');
  });
}
function deleteTx(id) {
  const t = S.txs.find(x => x.id === id); if (!t) return;
  const a = S.assets.find(x => x.id === t.assetId);
  const later = S.txs.some(x => x.assetId === t.assetId && x.type !== 'div' && (x.created || 0) > (t.created || 0));
  let msg = '이 거래를 삭제할까요?';
  const canRevert = t.prev && a && !later;
  if (t.type !== 'div') msg += canRevert ? '\n보유 수량·평균단가도 거래 전으로 되돌려요.' : '\n이후 거래가 있어 보유 수량은 되돌리지 않아요. 필요하면 자산에서 직접 고치세요.';
  if (!confirm(msg)) return;
  if (canRevert) { Object.assign(a, t.prev); }
  S.txs = S.txs.filter(x => x.id !== id);
  save(); closeSheet(); render(); toast('지웠어요 🧹');
}

function snapForm(m) {
  const isCur = m === monthKey();
  const ex = S.snapshots.find(x => x.month === m) || {};
  let mood = ex.mood || '🙂';
  const T = totals();
  const html = `
    <p class="hand muted" style="margin:0 4px 12px">${Number(m.slice(5))}월의 나에게 한 줄 남기기 ✍️</p>
    <div class="field"><span>이번 달 기분은?</span><div class="moods" id="moodPick">${MOODS.map(x => `<button type="button" class="emo ${x === mood ? 'on' : ''}" data-mood="${x}">${x}</button>`).join('')}</div></div>
    <label class="field"><span>한 줄 일기</span><textarea class="input" id="s_note" rows="3" maxlength="140" placeholder="예) 보너스 받아서 S&P500 더 샀다! 🎉">${esc(ex.note || '')}</textarea></label>
    <div class="banner">${E('📸')}<span>${isCur ? `지금 총자산 <b class="num">${won(T.value)}</b>이 이번 달 기록으로 저장돼요.${ex.month ? ' (이미 쓴 기록은 새 값으로 바뀌어요)' : ''}` : `이 달의 기록 <b class="num">${won(ex.total || 0)}</b> · 기분과 메모만 고칠 수 있어요.`}</span></div>
    ${ex.month ? `<button class="btn danger block" data-action="del-snap" data-m="${m}">🗑️ 이 일기 지우기</button>` : ''}`;
  openSheet(`📅 ${Number(m.slice(0, 4))}년 ${Number(m.slice(5))}월 일기`, html, () => {
    const note = val('s_note').trim();
    if (isCur) {
      S.snapshots = S.snapshots.filter(x => x.month !== m);
      S.snapshots.push({ month: m, total: Math.round(T.value), cost: Math.round(T.cost), byCat: T.byCat, byPurpose: T.byPurpose, savedAt: new Date().toISOString(), mood, note });
    } else { Object.assign(S.snapshots.find(x => x.month === m), { mood, note, auto: false }); }
    save(); render(); toast(`${mood} ${Number(m.slice(5))}월 일기를 저장했어요`);
  });
  $sheetBody.querySelector('#moodPick').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; mood = b.dataset.mood;
    $sheetBody.querySelectorAll('#moodPick button').forEach(x => x.classList.toggle('on', x === b));
  });
}

function goalForm(id) {
  const isNew = !id;
  const g = isNew ? normGoal({ priority: (S.settings.goals.length || 0) + 1 }) : S.settings.goals.find(x => x.id === id);
  const html = `
    <label class="field"><span>목표 이름</span><input class="input" id="g_name" value="${esc(g.name)}" placeholder="예: 주택자금, 비상금, 은퇴자금"></label>
    <label class="field"><span>집계할 목적 태그</span><select class="input" id="g_purpose">${opts(PURPOSES, g.purpose, PURPOSE_EMO)}</select></label>
    <div class="field"><span>아이콘</span>
      <div class="chips" id="g_icons">${GOAL_ICONS.map(ic => `<button type="button" class="chip ${ic === goalIcon(g) ? 'on' : ''}" data-ic="${ic}" style="font-size:18px;padding:6px 11px">${ic}</button>`).join('')}</div>
    </div>
    <p class="hint">목적 태그를 고르면 어울리는 아이콘이 먼저 골라져요. 마음에 드는 걸로 직접 바꿔도 돼요.</p>
    <div class="field"><span>포함할 자산 분류 (선택, 비우면 목적 태그 전체)</span>
      <div class="chips" id="g_cats">${CATS.map(c => `<button type="button" class="chip ${g.cats.includes(c) ? 'on' : ''}" data-c="${c}">${CAT_EMO[c]} ${c}</button>`).join('')}</div>
    </div>
    <p class="hint">예: 주택자금 목표는 현금성자산·채권만, 은퇴자금은 IRP·주식·ETF만 포함하도록 좁힐 수 있어요.</p>
    <div class="row2">
      <label class="field"><span>목표 시점</span><input class="input" type="month" id="g_date" value="${esc(g.date)}"></label>
      <label class="field"><span>목표 총액 (원)</span><input class="input num" inputmode="numeric" id="g_amount" value="${fmtInput(g.amount)}"></label>
    </div>
    <div class="row2">
      <label class="field"><span>월 예상 납입액 (원, 선택)</span><input class="input num" inputmode="numeric" id="g_monthly" value="${fmtInput(g.monthly)}" placeholder="비우면 남은 금액÷남은 개월로 계산"></label>
      <label class="field"><span>우선순위 (작을수록 위)</span><input class="input num" inputmode="numeric" id="g_priority" value="${g.priority}"></label>
    </div>
    ${isNew ? '' : `<button class="btn danger block" data-action="goal-del" data-id="${g.id}">🗑️ 이 목표 지우기</button>`}`;
  openSheet(isNew ? '🎯 목표 만들기' : '✏️ 목표 고치기', html, () => {
    const cats = [...$sheetBody.querySelectorAll('#g_cats .chip.on')].map(x => x.dataset.c);
    const iconEl = $sheetBody.querySelector('#g_icons .chip.on');
    const next = normGoal({ ...g, name: val('g_name').trim() || '목표', purpose: val('g_purpose'), icon: iconEl ? iconEl.dataset.ic : '', cats, date: val('g_date'), amount: num(val('g_amount')), monthly: num(val('g_monthly')), priority: num(val('g_priority')) || 1 });
    if (isNew) S.settings.goals.push(next); else S.settings.goals[S.settings.goals.findIndex(x => x.id === g.id)] = next;
    save(); render(); toast('저장했어요 ✨');
  });
  $sheetBody.querySelector('#g_cats').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return; b.classList.toggle('on');
  });
  let iconTouched = false;
  $sheetBody.querySelector('#g_icons').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    iconTouched = true;
    $sheetBody.querySelectorAll('#g_icons .chip').forEach(x => x.classList.toggle('on', x === b));
  });
  $sheetBody.querySelector('#g_purpose').addEventListener('change', () => {
    if (iconTouched) return;
    const def = GOAL_DEFAULT_ICON[val('g_purpose')] || '🎯';
    $sheetBody.querySelectorAll('#g_icons .chip').forEach(x => x.classList.toggle('on', x.dataset.ic === def));
  });
}

/* ───────── 시세 ───────── */
async function fetchJSON(url, ms = 12000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
/* ───────── 무료 시세 서버(prices.json) ─────────
 * GitHub Actions가 매일 국내주식 전종목(코스피+코스닥)과 해외주식(S&P500+나스닥100)
 * 종가를 모아 공개 저장소에 올려두는 JSON 파일 하나입니다.
 *  - API 키가 필요 없고, 한 번 요청으로 전 종목을 받으므로 종목 수 제한도 없습니다.
 *  - 값은 "직전 거래일 종가"라서 장중 실시간 가격과는 차이가 있습니다.
 *  - 금(XAU/USD)은 이 목록에 없어서 기존처럼 Twelve Data로 조회합니다. */
const PRICES_JSON_URL = 'https://raw.githubusercontent.com/cotmoool-dev/my-portfolio-prices/main/prices.json';
/* 티커 하나를 prices.json에서 찾습니다. 못 찾으면 null을 돌려주고 Twelve Data로 넘어갑니다.
 *   국내주식: "005930" 또는 "005930:KRX" → kr["005930"] (원)
 *   해외주식: "VOO", "BRK.B"/"BRK-B"      → us["VOO"]    (달러) */
function lookupFeedPrice(feed, symbol) {
  if (!feed) return null;
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return null;
  const kr = raw.match(/^(\d{6})(?::KRX)?$/);
  if (kr) {
    const p = Number(feed.kr && feed.kr[kr[1]]);
    return isFinite(p) && p > 0 ? { price: p, cur: 'KRW' } : null;
  }
  if (raw.includes(':')) return null;   // 그 밖의 해외 거래소 지정은 Twelve Data 담당
  const p = Number(feed.us && feed.us[raw.replace(/\./g, '-')]);   // BRK.B ↔ BRK-B 표기 차이 흡수
  return isFinite(p) && p > 0 ? { price: p, cur: 'USD' } : null;
}
/* 코인 자산 등록·수정 화면에서 "지금 바로" 1개 코인 시세만 가져올 때 씀 (전체 새로고침과 별개, 호출 1회) */
async function fetchCoinPrice(id) {
  const clean = String(id || '').trim().toLowerCase();
  if (!clean) throw new Error('코인을 선택하거나 ID를 입력하세요');
  const d = await fetchJSON('https://api.coingecko.com/api/v3/simple/price?vs_currencies=krw&ids=' + encodeURIComponent(clean));
  const p = d[clean] && d[clean].krw;
  if (!p) throw new Error(`ID "${clean}"의 시세를 찾지 못했어요`);
  return p;
}
let refreshing = false;
async function refreshPrices(auto = false) {
  if (refreshing) return;
  if (!navigator.onLine) { if (!auto) toast('오프라인이에요'); return; }
  refreshing = true;
  const btn = document.querySelector('[data-action="refresh-prices"]'); btn.classList.add('spin');
  const errs = []; let ok = 0;
  const stamp = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  try {
    // 환율
    if (needsFx() || S.txs.some(t => t.cur === 'USD')) {
      try {
        let d;
        try { d = await fetchJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW'); }
        catch (e) { d = await fetchJSON('https://api.frankfurter.app/latest?from=USD&to=KRW'); }
        const rate = d && d.rates && d.rates.KRW;
        if (rate) { S.fx = { USD: rate, at: (d.date || '') + ' 기준' }; ok++; } else throw new Error('형식 오류');
      } catch (e) { errs.push('환율: ' + e.message); }
    }
    // 코인
    const coins = S.assets.filter(a => a.mode === 'qty' && a.src === 'coingecko' && a.symbol);
    if (coins.length) {
      try {
        const ids = [...new Set(coins.map(a => a.symbol.toLowerCase()))].join(',');
        const d = await fetchJSON('https://api.coingecko.com/api/v3/simple/price?vs_currencies=krw&ids=' + encodeURIComponent(ids));
        for (const a of coins) {
          const p = d[a.symbol.toLowerCase()] && d[a.symbol.toLowerCase()].krw;
          if (p) { a.price = p; a.cur = 'KRW'; a.priceAt = stamp; ok++; } else errs.push(`${a.name}: ID “${a.symbol}”를 찾지 못함`);
        }
      } catch (e) { errs.push('코인: ' + e.message); }
    }
    // 주식·ETF — ① 무료 시세 서버(prices.json)에서 먼저 찾고, ② 거기 없는 종목만 Twelve Data로
    const stocks = S.assets.filter(a => a.mode === 'qty' && a.src === 'twelvedata' && a.symbol);
    if (stocks.length) {
      // ① 공개 JSON 한 번만 받아옵니다(키 불필요·종목 수 제한 없음). 금은 목록에 없어 건너뜁니다.
      let feed = null;
      if (stocks.some(a => a.cat !== '원자재')) {
        try { feed = await fetchJSON(PRICES_JSON_URL); }
        catch (e) { errs.push('무료 시세 서버: ' + e.message); }
      }
      const feedStamp = (feed && feed.date) ? feed.date + ' 종가' : stamp;
      const leftovers = [];
      for (const a of stocks) {
        const hit = (a.cat === '원자재') ? null : lookupFeedPrice(feed, a.symbol);
        if (!hit) { leftovers.push(a); continue; }
        /* 통화는 시세 출처에 맞춰 덮어씁니다 — 국내주식은 원, 해외주식은 달러로 내려오는데
           자산에 설정된 통화가 이와 다르면 평가액이 크게 어긋나기 때문입니다. */
        a.price = hit.price; a.cur = hit.cur; a.priceAt = feedStamp; ok++;
      }
      // ② 목록에 없는 종목(금·그 밖의 해외 거래소·지수 밖 종목)만 기존 Twelve Data 경로로
      if (leftovers.length) {
        if (!S.settings.twelveKey) errs.push(`시세 목록에 없는 ${leftovers.length}종목은 Twelve Data 키가 있어야 갱신돼요 — 설정에서 키를 넣거나 “직접 입력”으로 바꿔 주세요`);
        else {
          const uniq = [...new Set(leftovers.map(a => a.symbol.toUpperCase()))];
          const syms = uniq.slice(0, 8);
          if (uniq.length > 8) errs.push('주식: 무료 한도 때문에 8종목까지만 갱신했어요');
          const prices = {};
          for (const sym of syms) {
            const [s, ex] = sym.split(':');
            let url = 'https://api.twelvedata.com/price?symbol=' + encodeURIComponent(s) + '&apikey=' + encodeURIComponent(S.settings.twelveKey);
            if (ex) url += '&exchange=' + encodeURIComponent(ex);
            try {
              const d = await fetchJSON(url);
              if (d && d.price != null && isFinite(Number(d.price))) prices[sym] = Number(d.price);
              else errs.push(`${sym}: ${d && d.message ? d.message.slice(0, 80) : '가격 없음'}`);
            } catch (e) { errs.push(`${sym}: ${e.message}`); }
          }
          const GRAMS_PER_OZ = 31.1034768;
          for (const a of leftovers) {
            const p = prices[a.symbol.toUpperCase()]; if (!p) continue;
            if (a.cat === '원자재') {
              const fx = fxRate('USD');
              if (!fx) { errs.push('금: 환율이 없어 원/그램으로 환산하지 못했어요. 잠시 후 다시 눌러 주세요'); continue; }
              a.price = p / GRAMS_PER_OZ * fx;
            } else a.price = p;
            a.priceAt = stamp; ok++;
          }
        }
      }
    }
    if (ok) S.settings.priceRefreshedAt = Date.now();
    save(); render();
    if (auto) { if (ok) toast(`시세를 자동으로 갱신했어요 🔄`); return; }
    if (!ok && !errs.length) toast('자동 시세로 설정된 자산이 없어요');
    else if (errs.length) { openSheet('🔄 새로고침 결과', `<p>✅ ${ok}건 갱신</p><div class="banner warn small">${errs.map(esc).join('<br>')}</div>`, null); }
    else toast(`${ok}건 새로 받아왔어요 🔄`);
  } finally { refreshing = false; btn.classList.remove('spin'); }
}
/* 기록 피로도 줄이기: 앱을 열 때 시세가 6시간 넘게 오래됐으면 조용히 자동 새로고침(에러는 조용히 무시) */
function autoRefreshIfStale() {
  const hasAuto = S.assets.some(a => a.mode === 'qty' && a.src !== 'manual');
  if (!hasAuto && !needsFx()) return;
  if (Date.now() - (S.settings.priceRefreshedAt || 0) < 6 * 3600e3) return;
  refreshPrices(true).catch(() => {});
}

/* ───────── P0: 암호화·잠금 (Web Crypto) ─────────
 * iOS 웹앱은 시스템 Keychain에 직접 접근할 수 없어서, 대신 (1) 백업 파일을
 * 비밀번호로 암호화하고 (2) 앱 자체에 PIN 잠금화면을 둬서 같은 목적을 달성해요.
 */
function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function pbkdf2Key(password, saltBytes, usages) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, usages);
}
async function encryptJSON(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await pbkdf2Key(password, salt, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { enc: 'aes-gcm-pbkdf2', v: 1, salt: b64(salt), iv: b64(iv), data: b64(cipher) };
}
async function decryptJSON(payload, password) {
  const key = await pbkdf2Key(password, unb64(payload.salt), ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function setPin(pin) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(8)));
  S.settings.lock.salt = salt; S.settings.lock.pinHash = await sha256Hex(pin + ':' + salt); S.settings.lock.enabled = true; save();
}
async function verifyPin(pin) { return pin && (await sha256Hex(pin + ':' + S.settings.lock.salt)) === S.settings.lock.pinHash; }
let appUnlocked = false;
function renderLockScreen() {
  const ls = document.getElementById('lockScreen');
  ls.innerHTML = `<div class="lock-card">
    <div class="big-emo emo" style="font-size:48px;text-align:center;display:block">🔒</div>
    <h2 style="text-align:center;margin:8px 0 4px">잠겨 있어요</h2>
    <p class="small muted" style="text-align:center;margin:0 0 16px">PIN을 입력해서 열어 주세요</p>
    <input class="input" id="lockPin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" style="text-align:center;font-size:22px;letter-spacing:8px">
    <div id="lockErr" class="small up" style="text-align:center;min-height:18px;margin-top:6px"></div>
    <button class="btn primary block" id="lockSubmit" style="margin-top:10px">잠금 해제</button>
  </div>`;
  const tryPin = async () => { const pin = document.getElementById('lockPin').value; if (await verifyPin(pin)) unlockApp(); else document.getElementById('lockErr').textContent = 'PIN이 달라요'; };
  document.getElementById('lockSubmit').addEventListener('click', tryPin);
  document.getElementById('lockPin').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });
}
function unlockApp() { appUnlocked = true; document.getElementById('lockScreen').hidden = true; runAutoTasks(); render(); }
function checkLock() {
  if (S.settings.lock.enabled && !appUnlocked) { document.getElementById('lockScreen').hidden = false; renderLockScreen(); return true; }
  document.getElementById('lockScreen').hidden = true; return false;
}
/* 기록 피로도 줄이기: 잠금 해제 직후(또는 잠금이 없으면 시작 직후) 한 번만 조용히 실행 */
function runAutoTasks() {
  try { autoSnapshotTick(); } catch (e) {}
  try { autoRefreshIfStale(); } catch (e) {}
}

/* ───────── 백업 ───────── */
async function exportBackup() {
  S.settings.lastBackup = new Date().toISOString(); save();
  const data = { ...S, settings: { ...S.settings, twelveKey: '', claudeKey: '' }, exportedAt: new Date().toISOString(), app: 'my-assets-pwa' };
  const pw = prompt('백업 파일을 비밀번호로 암호화할까요?\n비밀번호를 입력하면 암호화돼요. 취소하거나 비워두면 암호화 없이 저장해요.');
  let blob, name;
  if (pw) {
    const enc = await encryptJSON(data, pw);
    blob = new Blob([JSON.stringify(enc)], { type: 'application/json' });
    name = `내자산_백업_암호화_${today()}.json`;
  } else {
    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    name = `내자산_백업_${today()}.json`;
  }
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); render(); toast(pw ? '암호화된 백업을 보냈어요 🔐' : '백업 파일을 보냈어요 💾'); return; }
  } catch (e) { if (e.name === 'AbortError') { render(); return; } }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  render(); toast(pw ? '암호화된 백업 파일을 저장했어요 🔐' : '백업 파일을 저장했어요 💾');
}
document.getElementById('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    let d = JSON.parse(await f.text());
    if (d && d.enc === 'aes-gcm-pbkdf2') {
      const pw = prompt('암호화된 백업이에요. 비밀번호를 입력하세요');
      if (!pw) { toast('비밀번호가 필요해요'); return; }
      try { d = await decryptJSON(d, pw); } catch (e2) { toast('비밀번호가 틀렸거나 손상된 파일이에요'); return; }
    }
    const next = fromAnyBackup(d);
    if (!confirm(`백업을 가져올까요?\n자산 ${next.assets.length}개 · 거래 ${next.txs.length}건 · 가계부 ${next.book.entries.length}건 · 일기 ${next.snapshots.length}개\n현재 데이터는 덮어써져요.`)) return;
    next.settings.twelveKey = next.settings.twelveKey || S.settings.twelveKey;
    next.settings.claudeKey = next.settings.claudeKey || S.settings.claudeKey;
    next.settings.lock = S.settings.lock;
    S = next; save(); render(); toast('일기장을 불러왔어요 📥');
  } catch (err) { toast('가져오기 실패: 올바른 백업 파일이 아니에요'); }
});
// v4 백업 + 이전 장부(v2) 파일을 최대한 호환해서 읽음
function fromAnyBackup(d) {
  if (!d || typeof d !== 'object') throw new Error('bad');
  if (d.v === 4 || d.app === 'my-assets-pwa') return migrate(d);
  const src = d.state || d.data || d;
  const list = src.assets || src.holdings || src.items;
  if (!Array.isArray(list)) throw new Error('bad');
  const st = defaultState();
  st.assets = list.map(x => {
    const qty = num(x.qty ?? x.quantity ?? x.shares);
    const price = num(x.price ?? x.currentPrice);
    const amount = num(x.amount ?? x.value ?? x.valueKRW ?? x.evaluation ?? x.krw);
    const useQty = qty > 0 && price > 0;
    return normAsset({
      name: x.name ?? x.title, cat: x.cat ?? x.category ?? x.class, purpose: x.purpose ?? x.tag ?? x.goal,
      mode: useQty ? 'qty' : 'amount', qty, price, avgCost: num(x.avgCost ?? x.avgPrice ?? x.cost),
      cur: (x.cur ?? x.currency) === 'USD' ? 'USD' : 'KRW', amount: useQty ? 0 : amount,
      cost: x.principal ?? x.invested ?? null,
      src: x.coinId || x.coingeckoId ? 'coingecko' : (x.ticker || x.symbol) && (x.auto || x.priceSource) ? 'twelvedata' : 'manual',
      symbol: x.coinId ?? x.coingeckoId ?? x.ticker ?? x.symbol ?? '',
      components: x.components ?? x.children ?? x.parts ?? [], memo: x.memo ?? x.note ?? ''
    });
  });
  const tg = src.targets || (src.settings && src.settings.targets);
  if (tg && typeof tg === 'object') for (const c of CATS) if (tg[c] != null) st.settings.targets[c] = num(tg[c]);
  const goal = src.goal || src.housingGoal || (src.settings && src.settings.goal);
  if (goal) st.settings.goals = [normGoal({ name: goal.name || '주거자금', purpose: '주거자금', date: (goal.date || goal.targetDate || '').slice(0, 7), amount: num(goal.amount ?? goal.target ?? goal.targetAmount), priority: 1 })];
  const snaps = src.snapshots || src.history;
  if (Array.isArray(snaps)) st.snapshots = snaps.map(s => ({ month: String(s.month || s.date || '').slice(0, 7), total: num(s.total ?? s.value), mood: s.mood || '', note: s.note || s.memo || '' })).filter(s => /^\d{4}-\d{2}$/.test(s.month));
  return st;
}

/* ───────── 이벤트 ───────── */
document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0);
});
document.getElementById('fab').addEventListener('click', () => { if (ui.tab === 'assets') { if (ui.assetsTab === 'accounts') accountForm(null); else assetForm(); } else if (ui.tab === 'book') bookForm(); else txForm(); });

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const act = el.dataset.action, id = el.dataset.id;
  switch (act) {
    case 'go': ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'refresh-prices': refreshPrices(); break;
    case 'return-guide': { // 다시 그리지 않고 제자리에서 열고 닫아야 짧은 애니메이션이 보임. 상태는 ui에 기억해서 다른 탭 다녀와도 유지
      const open = el.getAttribute('aria-expanded') !== 'true';
      ui.returnGuideOpen = open; el.setAttribute('aria-expanded', String(open));
      const panel = document.getElementById(el.getAttribute('aria-controls'));
      if (panel) { panel.classList.toggle('open', open); panel.inert = !open; }
      break;
    }
    case 'close-sheet': closeSheet(); break;
    case 'edit-asset': assetForm(S.assets.find(a => a.id === id)); break;
    case 'assets-tab': ui.assetsTab = el.dataset.t; render(); window.scrollTo(0, 0); break;
    case 'holding-group-toggle': e.stopPropagation(); ui.holdingGroupOpen[el.dataset.key] = !ui.holdingGroupOpen[el.dataset.key]; render(); break;
    case 'account-add': accountForm(null); break;
    case 'account-edit': accountForm(S.accounts.find(x => x.id === id)); break;
    case 'account-toggle': e.stopPropagation(); ui.acctOpen[id] = !ui.acctOpen[id]; render(); break;
    case 'account-filter': ui.accountFilter = el.dataset.f; render(); break;
    case 'account-toggle-active': {
      e.stopPropagation();
      const acc = S.accounts.find(x => x.id === id); if (!acc) break;
      acc.status = acc.status === '해지' ? '사용 중' : '해지';
      acc.updatedAt = nowStamp();
      save(); render(); toast(acc.status === '해지' ? '계좌를 비활성화했어요 ⏸' : '다시 사용해요 🏦');
      break;
    }
    case 'inst-suggest-pick': {
      const instEl = $sheetBody.querySelector('#ac_inst');
      if (instEl) instEl.value = el.dataset.v;
      const w = $sheetBody.querySelector('#instSuggestWrap');
      if (w) { w.hidden = true; w.innerHTML = ''; }
      break;
    }
    case 'toggle-comp': e.stopPropagation(); ui.open[id] = !ui.open[id]; render(); break;
    case 'toggle-hist': e.stopPropagation(); ui.tradeHist[id] = !ui.tradeHist[id]; render(); break;
    case 'quick-update': e.stopPropagation(); quickUpdateForm(id); break;
    case 'del-asset': {
      const n = S.txs.filter(t => t.assetId === id).length;
      if (!confirm(`이 자산을 삭제할까요?${n ? `\n관련 거래 ${n}건은 기록으로 남아요.` : ''}`)) return;
      S.assets = S.assets.filter(a => a.id !== id); save(); closeSheet(); render(); toast('지웠어요 🧹'); break;
    }
    case 'edit-tx': txForm(S.txs.find(t => t.id === id)); break;
    case 'del-tx': deleteTx(id); break;
    case 'tx-filter': ui.txFilter = el.dataset.f; render(); break;
    case 'retro-open': retroForm(id, Number(el.dataset.d)); break;
    case 'perf-period': ui.perfPeriod = el.dataset.k; render(); break;
    case 'goal-edit': goalForm(id || ''); break;
    case 'goal-del': if (confirm('이 목표를 지울까요?')) { S.settings.goals = S.settings.goals.filter(x => x.id !== id); save(); closeSheet(); render(); toast('지웠어요 🧹'); } break;
    case 'snapshot': snapForm(monthKey()); break;
    case 'edit-snap': snapForm(el.dataset.m); break;
    case 'print': window.print(); break;
    case 'capture': captureForm(); break;
    case 'book-month': ui.bookMonth = shiftMonth(curBookMonth(), Number(el.dataset.k)); render(); break;
    case 'book-edit': bookForm(S.book.entries.find(x => x.id === id)); break;
    case 'book-del': if (confirm('이 기록을 지울까요?')) { S.book.entries = S.book.entries.filter(x => x.id !== id); save(); closeSheet(); render(); toast('지웠어요 🧹'); } break;
    case 'book-apply-recur': applyRecurring(curBookMonth()); break;
    case 'book-del-recur': if (confirm('매달 반복을 멈출까요?\n이미 적힌 기록은 남아요.')) { S.book.recurring = S.book.recurring.filter(x => x.id !== id); save(); render(); toast('반복을 멈췄어요 🔁'); } break;
    case 'book-budget': {
      const v = prompt('한 달 변동비 예산 (원)', S.book.budget ? String(S.book.budget) : '');
      if (v !== null) { S.book.budget = Math.max(0, num(v)); save(); render(); toast('예산을 정했어요 🛍️'); }
      break;
    }
    case 'del-snap': if (confirm('이 달의 일기를 지울까요?')) { S.snapshots = S.snapshots.filter(x => x.month !== el.dataset.m); save(); closeSheet(); render(); toast('지웠어요 🧹'); } break;
    case 'normalize': {
      const tg = S.settings.targets; const sum = CATS.reduce((s, c) => s + num(tg[c]), 0);
      if (sum <= 0) { S.settings.targets = { ...DEFAULT_TARGETS }; }
      else {
        const raw = CATS.map(c => num(tg[c]) / sum * 100);
        const fl = raw.map(x => Math.floor(x * 10) / 10);
        let rem = Math.round((100 - fl.reduce((s, x) => s + x, 0)) * 10);
        raw.map((x, i) => [x - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0) { fl[i] = Math.round((fl[i] + 0.1) * 10) / 10; rem--; } });
        CATS.forEach((c, i) => tg[c] = fl[i]);
      }
      save(); render(); toast('100%로 맞췄어요 🪄'); break;
    }
    case 'reset-targets': if (confirm('목표 비중을 기본값으로 되돌릴까요?')) { S.settings.targets = { ...DEFAULT_TARGETS }; save(); render(); } break;
    case 'rebal-mode': ui.rebalMode = el.dataset.m; render(); break;
    case 'apply-held-targets': {
      const T0 = totals(); const held = CATS.filter(c => T0.byCat[c] > 0);
      const hs = held.reduce((s, c) => s + (Number(S.settings.targets[c]) || 0), 0);
      if (!hs) { toast('보유 분류의 목표 비중이 모두 0%라 다시 나눌 수 없어요'); break; }
      const next = {}; CATS.forEach(c => { next[c] = held.includes(c) ? Math.round((Number(S.settings.targets[c]) || 0) / hs * 1000) / 10 : 0; });
      const diff = Math.round((100 - CATS.reduce((s, c) => s + next[c], 0)) * 10) / 10;
      const big = held.slice().sort((a, b) => next[b] - next[a])[0]; next[big] = Math.round((next[big] + diff) * 10) / 10;
      if (!confirm(`목표 비중을 지금 보유한 분류 기준으로 바꿀까요?\n\n${held.map(c => `${c} ${next[c]}%`).join(' · ')}\n(없는 분류는 0%, '기본값' 버튼으로 언제든 되돌릴 수 있어요)`)) break;
      S.settings.targets = next; ui.gapRelative = false; save(); render(); toast('목표 비중을 보유 자산 기준으로 바꿨어요 🎯'); break;
    }
    case 'gap-relative': ui.gapRelative = !ui.gapRelative; render(); break;
    case 'portfolio-tab': ui.portfolioTabKey = el.dataset.k; render(); break;
    case 'theme': S.settings.theme = el.dataset.v; save(); render(); break;
    case 'save-api': S.settings.twelveKey = document.getElementById('twelveKey').value.trim(); S.settings.fxManual = num(document.getElementById('fxManual').value); S.settings.claudeKey = document.getElementById('claudeKey').value.trim(); S.settings.claudeModel = document.getElementById('claudeModel').value.trim() || DEFAULT_MODEL; save(); render(); toast('저장했어요 ✨'); break;
    case 'export': exportBackup(); break;
    case 'import': document.getElementById('importFile').click(); break;
    case 'lock-setup': pinSetupForm(); break;
    case 'lock-off': if (confirm('앱 잠금을 끌까요?')) { S.settings.lock = { enabled: false, pinHash: '', salt: '' }; save(); render(); toast('잠금을 껐어요 🔓'); } break;
    case 'reset-all':
      if (confirm('모든 자산·거래·가계부·일기·설정을 지울까요? 되돌릴 수 없어요.') && confirm('정말 지울까요? 먼저 백업을 권장해요.')) { S = defaultState(); save(); render(); toast('새 일기장이 되었어요 📔'); }
      break;
  }
});

// 입력 즉시 반영(리밸런싱 탭)
$app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.target) { S.settings.targets[t.dataset.target] = num(t.value); save(); render(); }
  else if (t.dataset.taxrate) { S.settings.taxRates[t.dataset.taxrate] = num(t.value); save(); render(); }
  else if (t.hasAttribute('data-band')) { S.settings.band = Math.max(0, num(t.value)); save(); render(); }
  else if (t.hasAttribute('data-targetreturn')) { S.settings.targetReturnRate = Math.max(0, num(t.value)); save(); render(); }
  else if (t.hasAttribute('data-extra')) { ui.extra = num(t.value); render(); }
  else if (t.id === 'portfolioScopeSel') { const [kind, val] = t.value.split(':'); ui.portfolioScope = kind === 'account' ? { kind: 'account', id: val } : { kind: 'group', key: val }; render(); }
});
$app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
// 숫자 입력 칸: 포커스 해제 시 천단위 구분기호
document.addEventListener('focusout', e => {
  const t = e.target;
  if (t.matches && t.matches('input.num') && !t.dataset.target && !t.hasAttribute('data-band') && t.value.trim() !== '') {
    const n = num(t.value); if (isFinite(n)) t.value = nf6.format(n);
  }
});

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ───────── 시작 ───────── */
if (!checkLock()) { runAutoTasks(); render(); }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
/* ───────── 새 버전 자동 반영 ─────────
 * 배경: 아이폰 홈 화면 앱은 "종료 후 재실행"해도 실제로는 화면만 다시 보여주는 것일 뿐, 새로고침(재탐색)이
 * 일어나지 않는 경우가 있어서 서비스워커가 새 버전을 감지할 기회조차 없을 수 있었음. 그래서 화면이 다시
 * 보이거나 포커스를 받을 때마다 새 버전이 있는지 직접 확인하고, 발견하면(설치는 sw.js가 자동으로 즉시
 * 적용함) 입력 중인 폼이 없으면 바로 새로고침, 폼을 쓰는 중이면 배너로 알려서 탭하면 새로고침하게 함. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const checkForUpdate = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
    window.addEventListener('focus', checkForUpdate);
    checkForUpdate();
  }).catch(() => {});
  let reloadedOnce = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedOnce) return;
    const sheetOpen = $sheet && !$sheet.hidden;
    if (sheetOpen) { showUpdateBanner(); return; }
    reloadedOnce = true;
    location.reload();
  });
}
function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const b = document.createElement('button');
  b.id = 'updateBanner';
  b.type = 'button';
  b.className = 'update-banner';
  b.textContent = '🔄 새 버전이 있어요 — 탭해서 업데이트';
  b.addEventListener('click', () => location.reload());
  document.body.appendChild(b);
}
