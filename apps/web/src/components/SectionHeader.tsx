type Props = {
  kicker: string;
  title: string;
  description: string;
  titleId?: string;
};

export function SectionHeader({ kicker, title, description, titleId }: Props) {
  return (
    <div className="bp-section-header">
      <span className="bp-kicker">{kicker}</span>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
