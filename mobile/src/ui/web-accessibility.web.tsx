import "./global.css";
export function SkipLink() {
  return (
    <a
      className="pool-skip-link"
      href="#main-content"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("main-content")?.focus();
      }}
    >
      Skip to main content
    </a>
  );
}
