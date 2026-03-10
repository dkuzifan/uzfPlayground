"use client";

import { useState } from "react";
import type {
  PersonalityProfile,
  MBTIType,
  EnneagramType,
  DnDAlignment,
  CharacterJob,
} from "@/lib/types/character";

interface Props {
  onComplete: (personality: PersonalityProfile, characterName: string, job: CharacterJob) => void;
  availableJobs?: { value: CharacterJob; label: string; desc?: string; icon?: string }[];
  characterNameHint?: string;
}

interface ChoiceScore {
  ei: number;               // + = E, - = I
  sn: number;               // + = S, - = N
  tf: number;               // + = T, - = F
  jp: number;               // + = J, - = P
  enn: [number, number][];  // [type (1-9), points][]
  lc: number;               // + = L, - = C
  ge: number;               // + = G, - = E
}

interface Scene {
  title: string;
  background: string;
  choices: { label: string; score: ChoiceScore }[];
}

// ── 씬 데이터 (12개) ──────────────────────────────────────────────────────────

const SCENES: Scene[] = [
  {
    title: "길 위의 낯선 이",
    background:
      "황혼 무렵, 좁은 산길에서 지친 노인이 무거운 짐을 지고 비틀거리고 있다. 당신은 목적지까지 한 시간이 남았고, 해가 지면 길이 위험해진다. 노인은 아무 말 없이 당신의 눈치를 보고 있다.",
    choices: [
      {
        label: "짐을 나눠 들고 함께 걷는다. 속도가 느려지더라도 혼자 두는 건 마음에 걸린다.",
        score: { ei: 1, sn: 0, tf: -2, jp: 0, enn: [[2, 3], [9, 2]], lc: 0, ge: 2 },
      },
      {
        label: '"짐을 여기 두고 내일 다시 오세요"라고 조언하고 혼자 서두른다. 지금은 내가 안전해야 한다.',
        score: { ei: -1, sn: 1, tf: 2, jp: 1, enn: [[8, 2], [3, 1]], lc: 0, ge: -2 },
      },
      {
        label: "가방에서 지도를 꺼내 둘 다 살 수 있는 가장 빠른 경로를 함께 계산한다.",
        score: { ei: 0, sn: 2, tf: 2, jp: 2, enn: [[5, 3], [1, 1]], lc: 0, ge: 1 },
      },
      {
        label: "근처 마을에서 짐꾼을 구해주겠다고 약속하고 먼저 달려간다. 직접 돕는 것보다 실질적인 해결책이다.",
        score: { ei: 1, sn: 0, tf: 1, jp: 1, enn: [[3, 3], [6, 1]], lc: 0, ge: 1 },
      },
    ],
  },
  {
    title: "마을의 금지 구역",
    background:
      '당신이 들른 마을에는 "동쪽 숲 진입 금지"라는 마을 규칙이 있다. 주민들은 이유를 잘 모르지만 대대로 지켜왔다. 당신이 찾는 정보가 그 숲에 있다는 단서를 입수했다.',
    choices: [
      {
        label: "마을 장로에게 사정을 설명하고 특별 허가를 받으려 한다. 규칙에는 이유가 있을 것이다.",
        score: { ei: 1, sn: 0, tf: 0, jp: 2, enn: [[6, 3], [1, 2]], lc: 2, ge: 1 },
      },
      {
        label: "밤에 몰래 숲에 들어간다. 나의 목적이 더 중요하고, 무지한 금기일 뿐이다.",
        score: { ei: -1, sn: -1, tf: 1, jp: -2, enn: [[8, 3], [7, 1]], lc: -2, ge: -1 },
      },
      {
        label: "왜 금지인지부터 조사한다. 이유를 알아야 위험을 판단할 수 있다.",
        score: { ei: 0, sn: -2, tf: 2, jp: -1, enn: [[5, 3], [4, 1]], lc: 0, ge: 0 },
      },
      {
        label: "숲 대신 다른 정보 루트를 탐색한다. 위험 변수는 줄이는 게 낫다.",
        score: { ei: 0, sn: -1, tf: 1, jp: 1, enn: [[6, 2], [1, 1]], lc: 1, ge: 0 },
      },
    ],
  },
  {
    title: "경매의 유혹",
    background:
      '도시의 골동품 상점에서 희귀한 마법 지도가 경매에 올라왔다. 당신도 원하지만 가격이 올라가고 있다. 옆에 있는 노점상이 속삭인다. "저 상인은 출처를 속이고 있어요. 신고하면 물건이 몰수됩니다."',
    choices: [
      {
        label: "당장 시 관리에게 신고한다. 속임수는 용납할 수 없고, 규칙이 있는 이유가 있다.",
        score: { ei: 1, sn: 1, tf: 1, jp: 2, enn: [[1, 3], [6, 2]], lc: 2, ge: 1 },
      },
      {
        label: "경매가 끝나길 기다린다. 나와 상관없는 일에 끼어들 이유가 없다.",
        score: { ei: -2, sn: 0, tf: 0, jp: 0, enn: [[9, 2], [5, 1]], lc: 0, ge: 0 },
      },
      {
        label: "그 정보를 협상 카드로 써서 상인에게 더 낮은 가격에 거래를 제안한다.",
        score: { ei: 0, sn: -1, tf: 2, jp: -1, enn: [[3, 3], [8, 2]], lc: -1, ge: -1 },
      },
      {
        label: "몰수되면 혼란을 틈타 내가 먼저 손에 넣는 방법을 찾는다.",
        score: { ei: 0, sn: -1, tf: 1, jp: -2, enn: [[8, 3], [4, 2]], lc: -2, ge: -2 },
      },
    ],
  },
  {
    title: "파벌 다툼",
    background:
      "당신이 묵는 여관에서 두 모험가 집단이 설전을 벌이고 있다. 한쪽은 길드 소속, 다른 쪽은 무소속 용병들이다. 싸움이 격화되어 물리적 충돌이 임박했다. 여관 주인이 당신을 보며 눈빛을 보낸다.",
    choices: [
      {
        label: "두 집단 사이에 끼어들어 중재를 시도한다. 대화로 해결하지 못할 갈등은 없다.",
        score: { ei: 2, sn: 0, tf: -2, jp: 0, enn: [[2, 2], [9, 3]], lc: 0, ge: 2 },
      },
      {
        label: "길드 쪽에 서서 그들을 지지한다. 조직과 규율이 있는 쪽이 옳다.",
        score: { ei: 1, sn: 1, tf: 1, jp: 1, enn: [[6, 3], [1, 2]], lc: 2, ge: 0 },
      },
      {
        label: "방으로 올라간다. 나와 무관한 분쟁에 에너지를 쓰고 싶지 않다.",
        score: { ei: -2, sn: 0, tf: 0, jp: -1, enn: [[5, 2], [9, 2]], lc: 0, ge: 0 },
      },
      {
        label: "상황을 관찰하며 어느 쪽이 유리한지, 내가 어떤 이익을 얻을 수 있는지 계산한다.",
        score: { ei: -1, sn: -1, tf: 2, jp: -1, enn: [[3, 3], [8, 2]], lc: 0, ge: -2 },
      },
    ],
  },
  {
    title: "부상자의 선택",
    background:
      "전투 직후, 당신 곁에는 심하게 다친 동료와 경미하게 다친 두 명의 낯선 이가 있다. 치료 포션은 하나다. 동료는 당신에게 선택권을 넘겼고, 낯선 이들은 서로 자신이 더 심각하다고 주장하고 있다.",
    choices: [
      {
        label: "동료에게 준다. 신뢰 관계가 있는 사람이 우선이다.",
        score: { ei: 0, sn: 1, tf: 1, jp: 1, enn: [[8, 2], [6, 2]], lc: 0, ge: -1 },
      },
      {
        label: "부상 정도를 직접 살펴보고 객관적으로 가장 위험한 사람에게 준다.",
        score: { ei: 0, sn: 2, tf: 3, jp: 2, enn: [[5, 3], [1, 2]], lc: 0, ge: 1 },
      },
      {
        label: "포션을 쪼개서 셋에게 나눈다. 효과가 줄더라도 모두를 돕는다.",
        score: { ei: 1, sn: 0, tf: -3, jp: 0, enn: [[2, 3], [9, 2]], lc: 0, ge: 2 },
      },
      {
        label: "누구에게 줄지 세 사람이 직접 결정하게 한다. 내가 판단할 일이 아니다.",
        score: { ei: 0, sn: 0, tf: 0, jp: -2, enn: [[9, 2], [4, 1]], lc: 0, ge: 0 },
      },
    ],
  },
  {
    title: "비밀의 무게",
    background:
      "우연히 이 도시 시장이 조세를 착복하고 있다는 증거 문서를 발견했다. 시장은 뒤로는 부패했지만 표면상으로는 선정을 베풀고 있으며 시민들의 지지를 받고 있다. 이 문서를 어떻게 할 것인가.",
    choices: [
      {
        label: "즉시 상위 기관에 제출한다. 부패는 공개되어야 하며, 법 앞에 예외는 없다.",
        score: { ei: 1, sn: 1, tf: 2, jp: 2, enn: [[1, 3], [6, 2]], lc: 2, ge: 1 },
      },
      {
        label: "시장과 직접 만나 개인적으로 압박해 협력을 끌어낸다. 정보는 힘이다.",
        score: { ei: 0, sn: -1, tf: 2, jp: -1, enn: [[8, 3], [3, 2]], lc: -1, ge: -2 },
      },
      {
        label: "증거를 안전하게 보관하고 지금 당장은 아무것도 하지 않는다. 타이밍이 중요하다.",
        score: { ei: -1, sn: 0, tf: 1, jp: -2, enn: [[5, 2], [6, 1]], lc: 0, ge: 0 },
      },
      {
        label: "시민들이 알아야 한다. 익명으로 증거를 유포한다.",
        score: { ei: 0, sn: -1, tf: 0, jp: -1, enn: [[1, 2], [4, 2]], lc: -1, ge: 2 },
      },
    ],
  },
  {
    title: "폐허 속 발견",
    background:
      '오래된 던전을 탐색하던 중 아직 아무도 손대지 않은 방을 발견했다. 방에는 여러 갈래의 길이 있다. 함께 온 일행이 "어디로 갈지 네가 정해"라고 한다.',
    choices: [
      {
        label: "지도를 꺼내 현재 위치를 파악하고 가장 논리적인 루트를 분석한 뒤 결정한다.",
        score: { ei: -1, sn: 1, tf: 2, jp: 2, enn: [[5, 3], [1, 1]], lc: 1, ge: 0 },
      },
      {
        label: "다수결로 정하자고 제안한다. 모두가 원하는 방향으로 가는 게 맞다.",
        score: { ei: 2, sn: 0, tf: -1, jp: 0, enn: [[9, 3], [2, 2]], lc: 0, ge: 1 },
      },
      {
        label: "아무도 가지 않을 것 같은 가장 이상하게 생긴 문을 선택한다. 평범한 루트에는 평범한 것만 있다.",
        score: { ei: -1, sn: -2, tf: 0, jp: -2, enn: [[4, 3], [7, 2]], lc: -2, ge: 0 },
      },
      {
        label: '"뭘 찾고 싶냐"고 각자에게 물어본 뒤 목적에 맞는 방향을 권한다.',
        score: { ei: 1, sn: 0, tf: -2, jp: 1, enn: [[2, 3], [6, 1]], lc: 0, ge: 1 },
      },
    ],
  },
  {
    title: "왕국의 명령",
    background:
      '왕국 기사단의 소환장이 도착했다. 명령은 어느 마을을 "반란 가능성"을 이유로 예방적으로 봉쇄하라는 것이다. 당신은 그 마을을 방문한 적이 있으며 주민들이 평범한 농민이라는 것을 안다.',
    choices: [
      {
        label: "명령을 따른다. 기사단 규율을 어기면 더 큰 혼란이 온다. 위에서 더 많은 것을 알고 있을 것이다.",
        score: { ei: 0, sn: 1, tf: 1, jp: 2, enn: [[6, 3], [1, 1]], lc: 3, ge: -1 },
      },
      {
        label: "상관에게 직접 이의를 제기하고 재고를 요청한다. 틀린 명령에는 공식 절차로 반발한다.",
        score: { ei: 1, sn: 0, tf: 0, jp: 1, enn: [[1, 3], [6, 2]], lc: 1, ge: 1 },
      },
      {
        label: "마을에 몰래 경고를 보내고 명령은 형식적으로만 이행한다. 사람이 다치지 않으면 된다.",
        score: { ei: -1, sn: -1, tf: -1, jp: -2, enn: [[9, 2], [2, 2]], lc: -1, ge: 2 },
      },
      {
        label: "명령을 공개적으로 거부한다. 부당한 명령에는 복종할 수 없다.",
        score: { ei: 1, sn: 0, tf: 0, jp: -1, enn: [[8, 3], [4, 2]], lc: -2, ge: 1 },
      },
    ],
  },
  {
    title: "명성의 기회",
    background:
      "대형 마법사 길드가 당신에게 조건을 제시했다. 독자적으로 발견한 마법 공식을 길드 이름으로 발표하면 평생 연구비와 시설을 지원한다. 대신 발견자로서의 이름은 기록에서 지워진다.",
    choices: [
      {
        label: "거절한다. 내가 만든 것에는 내 이름이 있어야 한다. 그것이 나의 정체성이다.",
        score: { ei: -2, sn: 0, tf: -1, jp: 0, enn: [[4, 3], [8, 2]], lc: 0, ge: 0 },
      },
      {
        label: "수락한다. 실질적 지원이 더 중요하며, 명성은 언젠가 다른 방식으로 얻을 수 있다.",
        score: { ei: 0, sn: 0, tf: 2, jp: 1, enn: [[3, 3], [7, 1]], lc: 1, ge: 0 },
      },
      {
        label: "협상한다. 발견자 기록을 내부 문서로는 남기되 공표를 조정하는 타협안을 제시한다.",
        score: { ei: 0, sn: -1, tf: 2, jp: 1, enn: [[5, 3], [3, 1]], lc: 1, ge: 0 },
      },
      {
        label: "수락하지만 다른 루트로 원본 문서를 유출해 진실을 남긴다. 이름은 어떻게든 역사에 남는다.",
        score: { ei: 0, sn: -1, tf: 0, jp: -2, enn: [[4, 3], [8, 1]], lc: -2, ge: -1 },
      },
    ],
  },
  {
    title: "마지막 야영지",
    background:
      "외딴 산속 야영지에서 혼자 시간이 생겼다. 내일은 중요한 탐사가 시작된다. 이 저녁 시간을 어떻게 쓸 것인가.",
    choices: [
      {
        label: "내일 루트와 변수들을 꼼꼼히 정리하고 장비를 점검한다.",
        score: { ei: -1, sn: 2, tf: 1, jp: 3, enn: [[1, 2], [6, 2], [5, 1]], lc: 1, ge: 0 },
      },
      {
        label: "근처 숲을 혼자 산책하며 생각을 정리한다.",
        score: { ei: -2, sn: -1, tf: 0, jp: -1, enn: [[4, 3], [5, 2]], lc: 0, ge: 0 },
      },
      {
        label: "일행이 있다면 함께 이야기를 나누거나, 없다면 모닥불 앞에서 여정 일지를 쓴다.",
        score: { ei: 1, sn: 0, tf: -2, jp: 0, enn: [[2, 2], [9, 2]], lc: 0, ge: 0 },
      },
      {
        label: "내일은 내일 생각하기로 하고, 지금 이 순간의 별빛과 고요함을 즐긴다.",
        score: { ei: -1, sn: -1, tf: 0, jp: -2, enn: [[7, 3], [9, 2]], lc: -1, ge: 0 },
      },
    ],
  },
  {
    title: "진실의 대가",
    background:
      '한 소년이 당신에게 달려와 말한다. "제 아버지가 살인을 저질렀어요. 아버지를 신고해야 할까요?" 소년의 아버지는 당신도 아는 선량한 사람으로, 과거의 사건이었다. 피해자 가족은 아직 진실을 모른다.',
    choices: [
      {
        label: "신고를 권한다. 진실은 반드시 드러나야 하며, 과거도 법 앞에선 예외가 없다.",
        score: { ei: 0, sn: 1, tf: 2, jp: 2, enn: [[1, 3], [6, 1]], lc: 2, ge: 1 },
      },
      {
        label: "말리고 싶지만 소년의 선택에 맡긴다. 이건 소년과 가족이 결정할 일이다.",
        score: { ei: 0, sn: 0, tf: 0, jp: -2, enn: [[9, 3], [5, 1]], lc: 0, ge: 0 },
      },
      {
        label: "피해자 가족을 먼저 만나 당사자들이 어떻게 원하는지 파악하고 결정하라고 조언한다.",
        score: { ei: 1, sn: -1, tf: -2, jp: -1, enn: [[2, 3], [9, 1]], lc: 0, ge: 1 },
      },
      {
        label: "말린다. 신고가 소년과 가족에게 가져올 상처가 더 크다. 조용히 덮는 게 낫다.",
        score: { ei: -1, sn: 0, tf: -2, jp: 0, enn: [[2, 2], [9, 2]], lc: -1, ge: -1 },
      },
    ],
  },
  {
    title: "분기점",
    background:
      "여정의 끝에서 두 가지 길을 발견했다. 한 길은 빠르고 보상이 확실하지만 수많은 사람이 이미 알고 있는 루트다. 다른 길은 위험하고 불확실하지만 아무도 가지 않은 미지의 영역으로 이어진다.",
    choices: [
      {
        label: "알려진 루트를 선택한다. 검증된 길이 확실하며, 위험을 감수할 이유가 없다.",
        score: { ei: 0, sn: 2, tf: 1, jp: 2, enn: [[6, 3], [1, 1]], lc: 1, ge: 0 },
      },
      {
        label: "미지의 길을 선택한다. 새로운 발견이 기다릴 것 같고, 미지의 공간이 나를 끌어당긴다.",
        score: { ei: 0, sn: -2, tf: 0, jp: -2, enn: [[7, 3], [5, 2]], lc: -1, ge: 0 },
      },
      {
        label: "미지의 길을 선택한다. 아무도 가지 않은 곳을 내가 먼저 간다는 것 자체가 의미 있다.",
        score: { ei: 0, sn: -1, tf: 0, jp: -2, enn: [[4, 3], [8, 1]], lc: -2, ge: -1 },
      },
      {
        label: "알려진 루트를 선택하되, 도중에 미개척 지류를 탐색하는 병행 계획을 세운다.",
        score: { ei: 0, sn: 1, tf: 2, jp: 1, enn: [[5, 3], [3, 2]], lc: 1, ge: 0 },
      },
    ],
  },
];

// ── 정적 참조 데이터 ──────────────────────────────────────────────────────────

const ENNEAGRAM_TYPES: { type: EnneagramType; name: string; keyword: string }[] = [
  { type: 1, name: "개혁가",     keyword: "원칙과 완벽" },
  { type: 2, name: "조력자",     keyword: "사랑과 봉사" },
  { type: 3, name: "성취자",     keyword: "성공과 효율" },
  { type: 4, name: "개인주의자", keyword: "정체성과 감성" },
  { type: 5, name: "탐구자",     keyword: "지식과 독립" },
  { type: 6, name: "충성가",     keyword: "안전과 신뢰" },
  { type: 7, name: "열정가",     keyword: "모험과 즐거움" },
  { type: 8, name: "도전자",     keyword: "힘과 주도권" },
  { type: 9, name: "평화주의자", keyword: "평화와 조화" },
];

const DND_LABELS: Record<DnDAlignment, { label: string; desc: string }> = {
  "lawful-good":    { label: "질서 선",   desc: "규칙을 따르며 타인을 돕는다" },
  "neutral-good":   { label: "중립 선",   desc: "선을 위해 필요한 방법을 택한다" },
  "chaotic-good":   { label: "혼돈 선",   desc: "자유롭게, 그러나 선한 의도로" },
  "lawful-neutral": { label: "질서 중립", desc: "규칙과 질서 자체를 따른다" },
  "true-neutral":   { label: "순수 중립", desc: "균형을 유지하며 극단을 피한다" },
  "chaotic-neutral":{ label: "혼돈 중립", desc: "자유를 최우선으로 여긴다" },
  "lawful-evil":    { label: "질서 악",   desc: "체계적으로 자신의 이익을 추구한다" },
  "neutral-evil":   { label: "중립 악",   desc: "목적을 위해 수단을 가리지 않는다" },
  "chaotic-evil":   { label: "혼돈 악",   desc: "충동적이고 파괴적인 의지를 따른다" },
};

const MBTI_AXIS_LABELS: Record<string, string> = {
  E: "외향", I: "내향", S: "감각", N: "직관",
  T: "사고", F: "감정", J: "판단", P: "인식",
};

const JOBS: { value: CharacterJob; label: string; desc: string; icon: string }[] = [
  { value: "warrior", label: "전사",    desc: "강인한 체력과 전투 기술",      icon: "⚔️" },
  { value: "mage",    label: "마법사",  desc: "강력한 마법과 지식",           icon: "🔮" },
  { value: "rogue",   label: "도적",    desc: "은신과 기습에 특화",           icon: "🗡️" },
  { value: "cleric",  label: "성직자",  desc: "신성한 힘으로 치유와 보호",    icon: "✨" },
  { value: "ranger",  label: "레인저",  desc: "원거리 전투와 자연 탐색",      icon: "🏹" },
  { value: "paladin", label: "팔라딘",  desc: "정의와 신념의 성전사",         icon: "🛡️" },
  { value: "bard",    label: "음유시인",desc: "말과 음악으로 세상을 움직인다", icon: "🎶" },
];

// ── 점수 계산 ─────────────────────────────────────────────────────────────────

interface TotalScores {
  EI: number; SN: number; TF: number; JP: number;
  enn: number[]; // index 0-8 = types 1-9
  LC: number; GE: number;
}

function calcScores(choiceIndices: number[]): TotalScores {
  const t: TotalScores = { EI: 0, SN: 0, TF: 0, JP: 0, enn: Array(9).fill(0), LC: 0, GE: 0 };
  for (let i = 0; i < choiceIndices.length; i++) {
    const s = SCENES[i].choices[choiceIndices[i]].score;
    t.EI += s.ei; t.SN += s.sn; t.TF += s.tf; t.JP += s.jp;
    t.LC += s.lc; t.GE += s.ge;
    for (const [type, pts] of s.enn) t.enn[type - 1] += pts;
  }
  return t;
}

function calcMBTI(sc: TotalScores, ch: number[]): MBTIType {
  // Tiebreakers: scene4(idx3) A/B→E C/D→I | scene7(idx6) A→S else→N | scene5(idx4) B→T else→F | scene10(idx9) A→J else→P
  const e = sc.EI > 0 ? "E" : sc.EI < 0 ? "I" : (ch[3] <= 1 ? "E" : "I");
  const s = sc.SN > 0 ? "S" : sc.SN < 0 ? "N" : (ch[6] === 0 ? "S" : "N");
  const t = sc.TF > 0 ? "T" : sc.TF < 0 ? "F" : (ch[4] === 1 ? "T" : "F");
  const j = sc.JP > 0 ? "J" : sc.JP < 0 ? "P" : (ch[9] === 0 ? "J" : "P");
  return (e + s + t + j) as MBTIType;
}

function calcEnneagram(sc: TotalScores, ch: number[]): EnneagramType {
  const sorted = sc.enn
    .map((v, i) => ({ type: i + 1, score: v }))
    .sort((a, b) => b.score - a.score);
  if (sorted[0].score - sorted[1].score >= 2) return sorted[0].type as EnneagramType;

  const pair = new Set([sorted[0].type, sorted[1].type]);
  // Tiebreaker pairs — scene indices: 8(sc7) 3(sc4) 11(sc12) 8(sc9) 5(sc6)
  if (pair.has(1) && pair.has(6))  return ch[7] === 1 ? 1 : 6;   // sc8: B→1, A→6
  if (pair.has(2) && pair.has(9))  return ch[3] === 0 ? 2 : 9;   // sc4: A→2, C→9
  if (pair.has(3) && pair.has(7))  return ch[11] === 3 ? 3 : 7;  // sc12: D→3, B→7
  if (pair.has(4) && pair.has(5))  return ch[8] === 0 ? 4 : 5;   // sc9: A→4, C→5
  if (pair.has(8) && pair.has(1))  return ch[5] === 1 ? 8 : 1;   // sc6: B→8, A→1
  return sorted[0].type as EnneagramType;
}

function calcDnD(sc: TotalScores, ch: number[]): DnDAlignment {
  let law: "lawful" | "neutral" | "chaotic";
  if (sc.LC >= 4)       law = "lawful";
  else if (sc.LC <= -4) law = "chaotic";
  else if (sc.LC === 0) law = (ch[1] === 0 || ch[1] === 3) ? "lawful" : "chaotic"; // sc2: A/D→L, B→C
  else                  law = "neutral";

  let good: "good" | "neutral" | "evil";
  if (sc.GE >= 4)       good = "good";
  else if (sc.GE <= -4) good = "evil";
  else if (sc.GE === 0) good = (ch[0] === 0 || ch[0] === 2) ? "good" : "evil"; // sc1: A/C→G, B→E
  else                  good = "neutral";

  if (law === "neutral" && good === "neutral") return "true-neutral";
  return `${law}-${good}` as DnDAlignment;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

type Phase = "intro" | "scenes" | "result" | "character";

export default function PersonalityTest({ onComplete, availableJobs, characterNameHint }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [sceneIdx, setSceneIdx] = useState(0);
  const [choices, setChoices] = useState<number[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [result, setResult] = useState<{ mbti: MBTIType; enneagram: EnneagramType; dnd: DnDAlignment } | null>(null);
  const [characterName, setCharacterName] = useState("");
  const [job, setJob] = useState<CharacterJob | null>(null);

  function handleChoice(ci: number) {
    if (selectedIdx !== null) return;
    setSelectedIdx(ci);
    setTimeout(() => {
      const next = [...choices, ci];
      setChoices(next);
      setSelectedIdx(null);
      if (sceneIdx < SCENES.length - 1) {
        setSceneIdx((s) => s + 1);
      } else {
        const sc = calcScores(next);
        setResult({ mbti: calcMBTI(sc, next), enneagram: calcEnneagram(sc, next), dnd: calcDnD(sc, next) });
        setPhase("result");
      }
    }, 280);
  }

  function handleConfirm() {
    if (!result || !job || !characterName.trim()) return;
    const enn = ENNEAGRAM_TYPES.find((e) => e.type === result.enneagram)!;
    const dnd = DND_LABELS[result.dnd];
    const summary = `${result.mbti} · ${result.enneagram}번 ${enn.name} · ${dnd.label}`;
    onComplete(
      { mbti: result.mbti, enneagram: result.enneagram, dnd_alignment: result.dnd, summary },
      characterName.trim(),
      job
    );
  }

  // ── 인트로 ────────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="flex flex-col items-center gap-8 py-6 text-center">
        <div>
          <p className="text-5xl">🗺️</p>
          <h2 className="mt-4 text-2xl font-bold text-neutral-900 dark:text-white">
            아스트라 대륙의 여행자
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            당신은 아스트라 대륙 어딘가에 있는 여행자입니다.<br />
            모험 길 위에서 마주치는 12가지 상황 속 선택이<br />
            당신이 누구인지를 결정합니다.
          </p>
        </div>
        <ul className="space-y-1 text-left text-sm text-neutral-400 dark:text-neutral-500">
          <li>• 씬 12개 · 예상 소요 시간 3~5분</li>
          <li>• 각 상황에서 가장 자연스러운 선택을 고르세요</li>
          <li>• 선택 후 되돌아갈 수 없습니다</li>
        </ul>
        <button
          onClick={() => setPhase("scenes")}
          className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          여정 시작 →
        </button>
      </div>
    );
  }

  // ── 씬 진행 ───────────────────────────────────────────────────────────────
  if (phase === "scenes") {
    const scene = SCENES[sceneIdx];
    return (
      <div className="space-y-5">
        {/* 진행 바 */}
        <div>
          <div className="mb-2 flex justify-between text-xs text-neutral-400">
            <span className="font-medium text-neutral-600 dark:text-neutral-300">{scene.title}</span>
            <span>씬 {sceneIdx + 1} / {SCENES.length}</span>
          </div>
          <div className="h-1 w-full rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-1 rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${(sceneIdx / SCENES.length) * 100}%` }}
            />
          </div>
        </div>

        {/* 배경 묘사 */}
        <div className="rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm leading-relaxed text-neutral-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300">
          {scene.background}
        </div>

        {/* 선택지 */}
        <div className="space-y-2">
          {scene.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => handleChoice(i)}
              disabled={selectedIdx !== null}
              className={`w-full rounded-xl border p-4 text-left text-sm transition ${
                selectedIdx === i
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-200"
                  : selectedIdx !== null
                  ? "border-black/10 bg-white/50 text-neutral-300 dark:border-white/10 dark:bg-transparent dark:text-neutral-600"
                  : "border-black/10 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/5"
              }`}
            >
              <span className="mr-2 font-bold text-neutral-400">{String.fromCharCode(65 + i)}.</span>
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 결과 ──────────────────────────────────────────────────────────────────
  if (phase === "result" && result) {
    const ennData = ENNEAGRAM_TYPES.find((e) => e.type === result.enneagram)!;
    const dndData = DND_LABELS[result.dnd];
    const mbtiAxes = result.mbti.split("").map((c) => MBTI_AXIS_LABELS[c]).join(" · ");

    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-4xl">✨</p>
          <h2 className="mt-3 text-xl font-bold text-neutral-900 dark:text-white">당신의 성향</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            12가지 선택이 당신의 내면을 드러냈습니다.
          </p>
        </div>

        <div className="space-y-2.5 rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          {[
            {
              label: "MBTI",
              title: result.mbti,
              sub: mbtiAxes,
            },
            {
              label: "에니어그램",
              title: `${result.enneagram}번 · ${ennData.name}`,
              sub: ennData.keyword,
            },
            {
              label: "D&D 성향",
              title: dndData.label,
              sub: dndData.desc,
            },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {row.label}
              </span>
              <div className="text-right">
                <p className="text-base font-black text-indigo-600 dark:text-indigo-400">{row.title}</p>
                <p className="text-[11px] text-neutral-400">{row.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPhase("character")}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          다음: 캐릭터 설정 →
        </button>
      </div>
    );
  }

  // ── 캐릭터 설정 ───────────────────────────────────────────────────────────
  if (phase === "character") {
    const nameError = characterName.trim().length > 16;
    const canSubmit = characterName.trim().length >= 1 && !nameError && job !== null;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">캐릭터 설정</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            이 세계에서 당신이 맡을 캐릭터를 완성하세요.
          </p>
        </div>

        {/* 이름 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            캐릭터 이름
          </label>
          <input
            type="text"
            maxLength={16}
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder={characterNameHint ?? "예: 아리엘, 카인, Lysander"}
            className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-neutral-500"
          />
          {nameError && <p className="text-xs text-red-500">최대 16자까지 입력할 수 있습니다.</p>}
        </div>

        {/* 직업 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">직업</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(availableJobs ?? JOBS).map((j) => (
              <button
                key={j.value}
                onClick={() => setJob(j.value)}
                className={`flex flex-col items-center rounded-xl border p-3 transition ${
                  job === j.value
                    ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                    : "border-black/10 bg-white hover:border-black/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                }`}
              >
                <span className="text-2xl">{j.icon}</span>
                <span className={`mt-1 text-xs font-bold ${
                  job === j.value ? "text-indigo-600 dark:text-indigo-400" : "text-neutral-700 dark:text-neutral-300"
                }`}>
                  {j.label}
                </span>
                <span className="mt-0.5 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
                  {j.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!canSubmit}
          onClick={handleConfirm}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          캐릭터 생성 완료
        </button>
      </div>
    );
  }

  return null;
}
