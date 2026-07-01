const sections = [
  {
    icon: "📊",
    title: "저장공간 현황 확인",
    color: "#6c63ff",
    steps: [
      {
        step: "설정 앱 열기",
        detail: "홈 화면에서 ⚙️ 설정 앱을 탭하세요.",
      },
      {
        step: "일반 → iPhone 저장공간",
        detail: "설정 → 일반 → iPhone 저장공간으로 이동하면 앱별 사용량을 확인할 수 있습니다.",
      },
      {
        step: "권장 항목 확인",
        detail: "화면 상단에 아이폰이 자동으로 제안하는 저장공간 절약 방법이 표시됩니다.",
      },
    ],
  },
  {
    icon: "📲",
    title: "미사용 앱 오프로드",
    color: "#22c55e",
    steps: [
      {
        step: "앱 오프로드 자동화",
        detail: "설정 → App Store → 미사용 앱 오프로드를 활성화하면 오랫동안 사용하지 않은 앱이 자동으로 오프로드됩니다. 앱 데이터는 유지됩니다.",
      },
      {
        step: "수동으로 앱 오프로드",
        detail: "설정 → 일반 → iPhone 저장공간 → 앱 선택 → 앱 오프로드. 앱 아이콘은 남고 데이터만 보존됩니다.",
      },
      {
        step: "완전 삭제 vs 오프로드",
        detail: "완전 삭제는 앱과 모든 데이터를 삭제합니다. 오프로드는 앱만 제거하고 데이터는 보존하여 재설치 시 복원됩니다.",
      },
    ],
  },
  {
    icon: "💬",
    title: "메시지 첨부파일 정리",
    color: "#f59e0b",
    steps: [
      {
        step: "메시지 자동 삭제 설정",
        detail: "설정 → 메시지 → 메시지 보관 기간을 '30일' 또는 '1년'으로 설정하면 오래된 메시지가 자동 삭제됩니다.",
      },
      {
        step: "대용량 첨부파일 확인",
        detail: "설정 → 일반 → iPhone 저장공간 → 메시지를 탭하면 '큰 첨부 파일 목록'에서 용량이 큰 파일을 확인하고 삭제할 수 있습니다.",
      },
      {
        step: "개별 대화 첨부파일 삭제",
        detail: "메시지 앱에서 대화를 길게 탭 → 더 보기 → 첨부 파일을 선택하여 삭제할 수 있습니다.",
      },
    ],
  },
  {
    icon: "🌐",
    title: "Safari 캐시 삭제",
    color: "#3b82f6",
    steps: [
      {
        step: "기록 및 데이터 삭제",
        detail: "설정 → Safari → 방문 기록 및 웹 사이트 데이터 지우기를 탭하세요. 캐시, 쿠키, 방문 기록이 모두 삭제됩니다.",
      },
      {
        step: "웹사이트 데이터만 삭제",
        detail: "설정 → Safari → 고급 → 웹 사이트 데이터에서 특정 사이트의 데이터만 선택적으로 삭제할 수 있습니다.",
      },
    ],
  },
  {
    icon: "☁️",
    title: "iCloud 사진 최적화",
    color: "#06b6d4",
    steps: [
      {
        step: "iPhone 저장공간 최적화 활성화",
        detail: "설정 → [내 이름] → iCloud → 사진 → iPhone 저장공간 최적화. 원본은 iCloud에 보관되고 기기에는 저해상도 미리보기만 저장됩니다.",
      },
      {
        step: "iCloud 저장공간 확인",
        detail: "설정 → [내 이름] → iCloud → iCloud 저장공간 관리에서 사용량을 확인하세요. 필요 시 용량을 업그레이드하거나 불필요한 백업을 삭제할 수 있습니다.",
      },
    ],
  },
  {
    icon: "🔧",
    title: "시스템 데이터 줄이기",
    color: "#ec4899",
    steps: [
      {
        step: "아이폰 재시작",
        detail: "주기적인 재시작으로 임시 파일과 캐시가 정리됩니다. 전원 버튼을 길게 눌러 재시작하세요.",
      },
      {
        step: "스트리밍 앱 캐시 삭제",
        detail: "넷플릭스, 유튜브, 스포티파이 등 스트리밍 앱은 앱 내 설정에서 캐시를 삭제할 수 있습니다. 앱 → 설정/프로필 → 캐시 삭제를 찾아보세요.",
      },
      {
        step: "음악 다운로드 관리",
        detail: "설정 → 음악 → 다운로드한 음악에서 오프라인 저장한 곡들을 관리하세요. 스트리밍으로만 이용해도 충분하면 삭제하세요.",
      },
      {
        step: "팟캐스트 에피소드 정리",
        detail: "팟캐스트 앱 → 보관함 → 다운로드에서 오래된 에피소드를 삭제하세요. 설정에서 자동 삭제도 활성화할 수 있습니다.",
      },
      {
        step: "오프라인 지도 삭제",
        detail: "카카오맵, 네이버지도, 구글맵 등의 오프라인 지도는 상당한 용량을 차지합니다. 자주 가지 않는 지역의 지도는 삭제하세요.",
      },
    ],
  },
  {
    icon: "📸",
    title: "사진 & 동영상 정리",
    color: "#8b5cf6",
    steps: [
      {
        step: "최근 삭제된 항목 비우기",
        detail: "사진 앱 → 앨범 → 최근 삭제된 항목 → 모두 삭제. 삭제한 사진은 30일간 보관되므로 즉시 비워야 공간이 확보됩니다.",
      },
      {
        step: "라이브 포토를 일반 사진으로 변환",
        detail: "라이브 포토는 일반 사진의 약 2배 용량입니다. 사진 앱에서 라이브 포토를 탭하고 라이브 버튼을 탭하여 '끄기'로 변환하세요.",
      },
      {
        step: "4K 동영상 설정 조정",
        detail: "설정 → 카메라 → 비디오 녹화에서 해상도를 낮추면 이후 촬영하는 동영상 용량이 줄어듭니다.",
      },
      {
        step: "버스트 사진 정리",
        detail: "연사 촬영(버스트)으로 찍은 사진은 여러 장이 한 번에 저장됩니다. 사진 앱에서 버스트 사진을 탭 → '선택'으로 최선의 한 장만 남기고 나머지를 삭제하세요.",
      },
    ],
  },
];

export default function GuidePage() {
  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: "48px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.5px",
            marginBottom: "10px",
            color: "var(--text-primary)",
          }}
        >
          🗂️ 시스템 데이터 정리 가이드
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "600px" }}>
          아이폰의 시스템 데이터와 캐시를 줄이는 방법을 단계별로 안내합니다.
          정기적으로 실행하면 저장공간을 효율적으로 관리할 수 있습니다.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {sections.map((section, si) => (
          <div
            key={si}
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              overflow: "hidden",
            }}
          >
            {/* Section header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                backgroundColor: `${section.color}08`,
                borderLeft: `4px solid ${section.color}`,
              }}
            >
              <span style={{ fontSize: "24px" }}>{section.icon}</span>
              <h2
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                {section.title}
              </h2>
            </div>

            {/* Steps */}
            <div style={{ padding: "8px 0" }}>
              {section.steps.map((item, ii) => (
                <div
                  key={ii}
                  style={{
                    padding: "16px 24px",
                    borderBottom:
                      ii < section.steps.length - 1 ? "1px solid var(--border)" : "none",
                    display: "flex",
                    gap: "16px",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      backgroundColor: `${section.color}20`,
                      color: section.color,
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  >
                    {ii + 1}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: "4px",
                      }}
                    >
                      {item.step}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        lineHeight: 1.65,
                      }}
                    >
                      {item.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer tip */}
      <div
        style={{
          marginTop: "40px",
          padding: "22px 24px",
          backgroundColor: "rgba(108, 99, 255, 0.06)",
          border: "1px solid rgba(108, 99, 255, 0.2)",
          borderRadius: "14px",
        }}
      >
        <p
          style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}
        >
          <span style={{ color: "#a89fff", fontWeight: 700 }}>💡 전문가 팁:</span> 시스템 데이터는 iOS가 자체적으로 관리하는 캐시와 임시 파일입니다.
          일반적으로 10GB 이상이라면 위 방법들을 순서대로 시도해 보세요. 그래도 줄어들지 않는다면 아이폰을 컴퓨터에 연결하여
          iTunes/Finder로 백업 후 복원(restore)하는 방법이 가장 효과적입니다.
        </p>
      </div>
    </div>
  );
}
