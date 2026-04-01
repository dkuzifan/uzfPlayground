export interface Stadium {
  id:               string
  name:             string
  location:         string
  fence_distance?:  number  // m, 미설정 시 120m 기본값
}

export const STADIUMS: Stadium[] = [
  { id: 'jamsil',  name: '잠실 야구장',             location: '서울' },
  { id: 'sajik',   name: '사직 야구장',             location: '부산' },
  { id: 'munhak',  name: '문학 야구장',             location: '인천' },
  { id: 'daegu',   name: '삼성 라이온즈 파크',       location: '대구' },
]
