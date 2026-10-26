export type Stage = "development" | "preview" | "production";

// NODE_ENV says how the code was built; APP_STAGE says what the deployment is
// for. A preview or staging server runs a production build but must keep the
// sandbox gateway and unverified adapters, which a real production site must not.
export function appStage(): Stage {
  const stage = process.env.APP_STAGE;
  if (stage === "development" || stage === "preview" || stage === "production") return stage;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export const isProductionStage = () => appStage() === "production";
