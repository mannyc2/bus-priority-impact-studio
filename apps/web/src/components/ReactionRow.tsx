type Size = "sm" | "md";

const emojis = ["\u{1F525}", "\u{1F624}", "\u{1F44D}"] as const; // 🔥 😤 👍

export function ReactionRow({
  counts,
  size = "sm",
}: {
  counts: [number, number, number];
  size?: Size;
}) {
  return (
    <div className={`bp-reaction-row bp-reaction-row--${size}`}>
      {emojis.map((emoji, i) => (
        <button key={i} className="bp-reaction-row__chip" type="button">
          <span className="bp-reaction-row__emoji">{emoji}</span>
          {counts[i]}
        </button>
      ))}
    </div>
  );
}
