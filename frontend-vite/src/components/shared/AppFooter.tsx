export function AppFooter() {
  return (
    <footer
      className="t2-bento"
      style={{
        padding: "24px 0 20px 0",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        marginTop: "48px",
        alignItems: "center",
      }}
    >
      <div className="t2-span-12" style={{ textAlign: "center" }}>
        <span
          className="t2-copy"
          style={{
            fontSize: "14px",
            color: "rgba(255, 255, 255, 0.3)",
            margin: 0,
            maxWidth: "none",
          }}
        >
          T2 Quiz Hub
        </span>
      </div>
    </footer>
  );
}
