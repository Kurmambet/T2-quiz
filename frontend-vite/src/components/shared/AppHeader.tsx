export function AppHeader() {
  return (
    <header
      className="t2-bento"
      style={{
        padding: "16px 0 20px 0",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        marginBottom: "32px",
        alignItems: "center",
      }}
    >
      <div className="t2-span-12" style={{ textAlign: "center" }}>
        <span
          className="t2-title t2-tile--magenta-spec"
          style={{
            fontSize: "clamp(32px, 4vw, 48px)",

            maxWidth: "none",
          }}
        >
          Квиз-Хаб
        </span>
      </div>
    </header>
  );
}
