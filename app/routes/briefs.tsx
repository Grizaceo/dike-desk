import { Outlet } from "react-router";

export function meta() {
  return [{ title: "Briefs · Diké Desk" }];
}

export default function BriefsLayout() {
  return <Outlet />;
}
