/**
 * Error with an HTTP status and a stable, machine-readable code.
 * The client maps `code` to a localized message.
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errors = {
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Authentication required"),
  forbidden: () => new ApiError(403, "FORBIDDEN", "You do not have permission for this action"),
  invalidOrigin: () => new ApiError(403, "INVALID_ORIGIN", "Request origin is not allowed"),
  invalidCode: () => new ApiError(401, "INVALID_CODE", "The code is invalid or has expired"),
  accountDisabled: () => new ApiError(403, "ACCOUNT_DISABLED", "This account is not available"),
  registrationClosed: () =>
    new ApiError(403, "REGISTRATION_CLOSED", "Registration is not available"),
  notFound: (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`),
  validation: (message: string) => new ApiError(400, "VALIDATION_ERROR", message),
  cannotModifySelf: () =>
    new ApiError(409, "CANNOT_MODIFY_SELF", "You cannot make this change to your own account"),
  tagExists: () => new ApiError(409, "TAG_EXISTS", "You already have a tag with that name"),
  lastAdmin: () => new ApiError(409, "LAST_ADMIN", "At least one active administrator must remain"),
};
