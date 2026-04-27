export function SearchBar() {
  return (
    <div className="bp-search-bar">
      <span className="bp-search-bar__icon" aria-hidden="true">
        {"\u{1F50D}"}
      </span>
      <input
        className="bp-search-bar__input"
        type="search"
        placeholder="Search routes, stops, corridors\u2026"
        aria-label="Search routes"
      />
    </div>
  );
}
