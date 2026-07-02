export function routeLionLinkFanoutCte(options: { physicalIdFilter?: boolean } = {}): string {
  return `
    fanout AS (
      SELECT physical_id, count(*) AS route_fanout
        FROM local_route_lion_link
       ${options.physicalIdFilter === true ? "WHERE physical_id = ?" : ""}
       GROUP BY physical_id
    )`;
}
