import { Navigate } from "react-router";

import { APP_TITLE } from "@/lib/app-config";

const SEO_TITLE = `${APP_TITLE} — citation review for Chilean legal briefs`;
const SEO_DESCRIPTION =
  "Diké Desk marks every statutory citation in a Chilean legal brief against a dated, hash-identified corpus: verified, ambiguous or refused — and the lawyer decides every fix.";

export function meta() {
  return [
    { title: SEO_TITLE },
    {
      name: "description",
      content: SEO_DESCRIPTION,
    },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

// The workspace starts on the briefs list; /home stays valid for existing
// links (the nav views, skeleton layout and handoff keys still know it).
export default function HomeRoute() {
  return <Navigate to="/briefs" replace />;
}
