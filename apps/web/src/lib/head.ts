const SITE_NAME = "Bus Priority Impact Studio";
const DEFAULT_DESCRIPTION =
  "Track NYC bus priority, route reliability, slow segments, interventions, and public-data methods.";

export function routeHead(title: string, description = DEFAULT_DESCRIPTION) {
  const fullTitle = title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;

  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
