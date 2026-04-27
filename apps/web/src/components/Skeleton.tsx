export function SkeletonLine({
  width = "100%",
  height = 12,
}: {
  width?: string | number;
  height?: number;
}) {
  return <div className="bp-skeleton" style={{ width, height, borderRadius: height / 2 }} />;
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return (
    <div
      className="bp-skeleton"
      style={{ width: size, height: size, borderRadius: size * 0.25, flexShrink: 0 }}
    />
  );
}
