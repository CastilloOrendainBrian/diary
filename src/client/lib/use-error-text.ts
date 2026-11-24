import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../services/http";

/**
 * Returns a function that turns any error into a translated message. Known API error codes
 * map to `errors.<CODE>`; anything else falls back to a generic message.
 */
export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation();

  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        return t(`errors.${error.code}`, { defaultValue: t("errors.UNKNOWN") });
      }
      return t("errors.UNKNOWN");
    },
    [t],
  );
}
