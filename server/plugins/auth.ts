import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

// guard:allow-env-credential — operator deploy flag (auth bypass switch), not a user credential
const authDisabledFlag = process.env.AUTH_DISABLED;
const authDisabled = ["true", "1"].includes(
  (authDisabledFlag ?? "").trim().toLowerCase(),
);
if (process.env.NODE_ENV === "production" && authDisabled) {
  throw new Error("AUTH_DISABLED must not be set in production.");
}

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
});
