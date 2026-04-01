// ============================================================
// 수비 엔진 물리 설정
// 리그별 환경 차이를 이 파일 한 곳에서 관리
// ============================================================

export const PHYSICS_CONFIG = {
  /**
   * Magnus carry_factor 최대값
   * - KBO 기준: 0.22  (EV 170 km/h 타구 기준 ~+22% 비거리)
   * - MLB 기준: 0.26  (저마찰 공 + 높은 EV, 2019 이후 Statcast 기반)
   * contact_quality=1.0일 때 carry_factor = 1 + carry_factor_max
   */
  carry_factor_max: 0.22,

  /**
   * 외야수 스프린트 속도 범위 (m/s)
   * defence 스탯 0~100 → min~max 선형 보간
   * - KBO 평균 외야수: 6.0 m/s 수준
   * - MLB 평균 외야수: 6.7 m/s, 상위권: 7.5 m/s
   */
  outfielder_speed_min: 5.0,
  outfielder_speed_max: 7.5,
}
